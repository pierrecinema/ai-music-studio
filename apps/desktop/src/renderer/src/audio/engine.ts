// The audio engine: plays the project (audio clips and MIDI notes through the built-in synth), mixes
// tracks (volume, pan, mute, solo, automation, sends to return tracks, group tracks), loops the loop range,
// measures levels, records (count-in, punch, loop recording into take lanes) and renders the mix for export.
//
// The same scheduling code serves live playback (AudioContext) and export (OfflineAudioContext).

import { nanoid } from 'nanoid'
import { api } from '../lib/api'
import { useAudioStore } from '../stores/audio.store'
import { useProjectStore } from '../stores/project.store'
import type { Clip, InsertFx, Project, Track } from '../types'
import { playClick, playSynthNote, type Timbre } from './synth'
import { encodeWav, peakOf } from './wav'
import { MAX_STRETCH_SECONDS, stretchBuffer } from './stretch'
import { beatToSec, bpmAt, barAt, isDownbeat, secToBeat } from './timemap'
import { hasAutomation, scheduleLane } from './automation'
import { makeEffect, makeInsert } from './fx'
import { exportSampleRate } from '../lib/sampleRate'
import { beatOfSrc, renderWarped } from './warp'

// ── files → buffers ──────────────────────────────────────────────────────────

const buffers = new Map<string, AudioBuffer>()
const loading = new Map<string, Promise<AudioBuffer | null>>()
const peaksCache = new Map<string, Float32Array>()
export const PEAKS_PER_SECOND = 100
let decoder: AudioContext | null = null
export const failedFiles = new Set<string>()

export function loadBuffer(path: string): Promise<AudioBuffer | null> {
  const have = buffers.get(path)
  if (have) return Promise.resolve(have)
  let p = loading.get(path)
  if (!p) {
    p = (async () => {
      try {
        const bytes = await window.api.fs.readFile(path)
        decoder ??= new AudioContext()
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        const buf = await decoder.decodeAudioData(ab)
        buffers.set(path, buf)
        failedFiles.delete(path)
        listeners.forEach((l) => l())
        return buf
      } catch (e) {
        console.warn('[audio] cannot load', path, e)
        failedFiles.add(path)
        listeners.forEach((l) => l())
        return null
      } finally {
        loading.delete(path)
      }
    })()
    loading.set(path, p)
  }
  return p
}

export function bufferOf(path: string): AudioBuffer | undefined {
  return buffers.get(path)
}

// for tests and for files made inside the app (recordings, consolidated clips)
export function putBuffer(path: string, buf: AudioBuffer): void {
  buffers.set(path, buf)
  peaksCache.delete(path)
  listeners.forEach((l) => l())
}

// ── synced samples: stretched copies of a file for the current project tempo ──

const warped = new Map<string, AudioBuffer>()
const warping = new Map<string, Promise<AudioBuffer | null>>()
const warpKey = (path: string, source: number, project: number): string => `${path}|${source}|${project}`

// seconds of the FILE per beat of the clip: a synced sample is measured in its own tempo
export const sourceSecPerBeat = (clipWarpBpm: number | undefined, projectBpm: number): number => 60 / (clipWarpBpm || projectBpm || 120)

export async function loadWarped(path: string, sourceBpm: number, projectBpm: number, gridFirst?: number): Promise<AudioBuffer | null> {
  const key = warpKey(path, sourceBpm, projectBpm)
  const have = warped.get(key)
  if (have) return have
  let p = warping.get(key)
  if (!p) {
    p = (async () => {
      const raw = await loadBuffer(path)
      if (!raw) return null
      if (gridFirst !== undefined && Math.abs(sourceBpm / projectBpm - 1) >= 0.002) {
        // the beat grid is known: the backend stretches beat by beat, so every kick lands exactly on its beat
        // (within 1 ms; stretching the whole file at once let single beats wander by up to 15 ms)
        try {
          const r = await api.samples.stretch(path, sourceBpm / projectBpm, { firstBeat: gridFirst, bpm: sourceBpm })
          const out = await loadBuffer(r.path)
          if (out) { warped.set(key, out); warping.delete(key); return out }
        } catch (e) { console.warn('[audio] beat-by-beat stretch not available, using the built-in one', path, e) }
      }
      if (raw.duration > MAX_STRETCH_SECONDS) {
        // a whole song: too long for the stretcher here; the backend makes a synced copy (before, it played at its
        // own tempo next to the grid and drifted away from the metronome)
        try {
          const r = await api.samples.stretch(path, sourceBpm / projectBpm)
          const out = await loadBuffer(r.path)
          if (out) { warped.set(key, out); return out }
        } catch (e) { console.warn('[audio] cannot sync a long file', path, e) }
        return raw
      }
      try {
        const out = await stretchBuffer(raw, sourceBpm / projectBpm)
        warped.set(key, out)
        return out
      } catch (e) {
        console.warn('[audio] cannot sync', path, e)
        return raw
      } finally {
        warping.delete(key)
      }
    })()
    warping.set(key, p)
  }
  return p
}

// ── warp markers: the file rendered with its markers at the tempo where the clip starts ──

const markerBufs = new Map<string, AudioBuffer>()
const markerJobs = new Map<string, Promise<AudioBuffer | null>>()

function markerKey(c: Clip, spbSrc: number, spbProject: number): string {
  return `${c.audioFile}|${spbSrc.toFixed(6)}|${spbProject.toFixed(6)}|${JSON.stringify(c.warpMarkers)}`
}

export async function loadMarkerWarp(c: Clip, spbSrc: number, spbProject: number): Promise<AudioBuffer | null> {
  const key = markerKey(c, spbSrc, spbProject)
  const have = markerBufs.get(key)
  if (have) return have
  let p = markerJobs.get(key)
  if (!p) {
    p = (async () => {
      const raw = await loadBuffer(c.audioFile!)
      if (!raw || raw.duration > MAX_STRETCH_SECONDS * 3) return null
      try {
        const out = await renderWarped(raw, c.warpMarkers ?? [], spbSrc, spbProject)
        if (markerBufs.size > 24) markerBufs.delete(markerBufs.keys().next().value as string)
        markerBufs.set(key, out)
        return out
      } catch (e) {
        console.warn('[audio] cannot warp', c.audioFile, e)
        return null
      } finally {
        markerJobs.delete(key)
      }
    })()
    markerJobs.set(key, p)
  }
  return p
}

export function forgetBuffer(path: string): void {
  buffers.delete(path)
  peaksCache.delete(path)
  failedFiles.delete(path)
}

// one peak value per 10 ms (max of both channels), for drawing waveforms
export function peaksOf(path: string): Float32Array | null {
  const cached = peaksCache.get(path)
  if (cached) return cached
  const buf = buffers.get(path)
  if (!buf) return null
  const step = Math.max(1, Math.floor(buf.sampleRate / PEAKS_PER_SECOND))
  const n = Math.ceil(buf.length / step)
  const out = new Float32Array(n)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) {
      let m = 0
      const end = Math.min(buf.length, (i + 1) * step)
      for (let j = i * step; j < end; j++) {
        const a = d[j] < 0 ? -d[j] : d[j]
        if (a > m) m = a
      }
      if (m > out[i]) out[i] = m
    }
  }
  peaksCache.set(path, out)
  return out
}

const listeners = new Set<() => void>()
export function onBuffersChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const beatsToSec = (beats: number, bpm: number): number => (beats * 60) / (bpm || 120)
export const secToBeats = (sec: number, bpm: number): number => (sec * (bpm || 120)) / 60

export function projectEndBeat(p: Project): number {
  let end = 0
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, c.startTime + c.duration)
  return end
}

function timbreOf(t: Track): Timbre {
  const hint = `${t.name} ${t.instrumentId ?? ''}`
  if (/bass/i.test(hint)) return 'bass'
  if (/lead|synth|arp/i.test(hint)) return 'lead'
  return 'soft'
}

// mute and solo. A track is heard if it is not muted and (nothing is soloed, or it, its group, or - for a
// group - one of its tracks is soloed). Return tracks are "solo safe": they always stay audible.
export function isAudible(t: Track, tracks: Track[]): boolean {
  if (t.muted) return false
  const anySolo = tracks.some((x) => x.soloed)
  if (!anySolo || t.soloed) return true
  const parent = t.parentId ? tracks.find((x) => x.id === t.parentId) : undefined
  if (parent?.soloed) return true
  if (t.type === 'group' && tracks.some((x) => x.parentId === t.id && x.soloed)) return true
  return false
}

// kept for older callers: the fader value a track plays at
export function audibleGain(t: Track, anySolo: boolean): number {
  if (t.muted) return 0
  if (anySolo && !t.soloed) return 0
  return t.volume
}

interface Strip {
  bus: GainNode            // everything of the track goes in here (stopped by ramping this to 0)
  mute: GainNode           // 0 or 1 (mute, solo)
  gain: GainNode           // fader, or the volume automation
  pan: StereoPannerNode
  analyser: AnalyserNode
  sends: Map<string, GainNode>
}

function makeStrip(ctx: BaseAudioContext, dest: AudioNode, inserts: InsertFx[] = [], secPerBeat = 0.5): Strip {
  const bus = ctx.createGain()
  const mute = ctx.createGain()
  const gain = ctx.createGain()
  const pan = ctx.createStereoPanner()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  // the track's effects (inserts) sit between its sound and the fader
  let head: AudioNode = bus
  for (const fx of inserts) {
    const ins = makeInsert(ctx, fx, secPerBeat)
    head.connect(ins.input)
    head = ins.output
  }
  head.connect(mute).connect(gain).connect(pan).connect(analyser).connect(dest)
  return { bus, mute, gain, pan, analyser, sends: new Map() }
}

// the envelope of one audio clip: fade in, fade out (linear, or equal power for crossfades), starting
// `skip` seconds into the clip
function envelope(param: AudioParam, at: number, skip: number, len: number, peak: number,
  fadeIn: number, fadeOut: number, eqIn: boolean, eqOut: boolean): void {
  const total = skip + len
  const shape = (x: number, eq: boolean): number => (eq ? Math.sin((Math.max(0, Math.min(1, x)) * Math.PI) / 2) : Math.max(0, Math.min(1, x)))
  const valueAt = (t: number): number => {
    let v = 1
    if (fadeIn > 0 && t < fadeIn) v = Math.min(v, shape(t / fadeIn, eqIn))
    if (fadeOut > 0 && t > total - fadeOut) v = Math.min(v, shape((total - t) / fadeOut, eqOut))
    return v * peak
  }
  // sample the envelope where it changes; straight lines in between are close enough at 24 points per fade
  const times = new Set<number>([skip, total])
  const add = (from: number, to: number, n: number): void => { for (let i = 0; i <= n; i++) times.add(from + ((to - from) * i) / n) }
  if (fadeIn > 0) add(0, fadeIn, eqIn ? 24 : 1)
  if (fadeOut > 0) add(total - fadeOut, total, eqOut ? 24 : 1)
  const sorted = [...times].filter((t) => t >= skip && t <= total).sort((a, b) => a - b)
  param.setValueAtTime(valueAt(skip), at)
  for (const t of sorted) if (t > skip) param.linearRampToValueAtTime(valueAt(t), at + (t - skip))
}

export interface Scheduled {
  strips: Map<string, Strip>
  returns: Map<string, Strip>
  stop: (fade?: boolean) => void
  stopAt: (time: number) => void           // end the sound at a context time (loop jump)
}

export interface ScheduleOptions { untilBeat?: number }

// Schedules everything from `fromBeat` on. `when` is the context time that corresponds to `fromBeat`.
export function scheduleProject(
  ctx: BaseAudioContext,
  dest: AudioNode,
  project: Project,
  fromBeat: number,
  when: number,
  opts: ScheduleOptions = {}
): Scheduled {
  const base = beatToSec(project, fromBeat)
  const T = (beat: number): number => when + beatToSec(project, beat) - base
  const strips = new Map<string, Strip>()
  const returns = new Map<string, Strip>()
  const returnInputs = new Map<string, AudioNode>()
  const nodes: Array<AudioScheduledSourceNode> = []
  const until = opts.untilBeat ?? Infinity

  // return tracks (effects), then group tracks, then the tracks themselves
  for (const r of project.returns ?? []) {
    const strip = makeStrip(ctx, dest)
    const fx = makeEffect(ctx, r, 60 / bpmAt(project, fromBeat))
    fx.output.connect(strip.bus)
    strip.mute.gain.value = r.muted ? 0 : 1
    strip.gain.gain.value = r.volume
    strip.pan.pan.value = Math.max(-1, Math.min(1, r.pan ?? 0))
    returns.set(r.id, strip)
    returnInputs.set(r.id, fx.input)
  }

  const ordered = [...project.tracks].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1))
  for (const track of ordered) {
    if (track.type !== 'group' && track.clips.length === 0) continue
    const parent = track.parentId ? strips.get(track.parentId) : undefined
    const strip = makeStrip(ctx, parent?.bus ?? dest, track.fx ?? [], 60 / bpmAt(project, fromBeat))
    strips.set(track.id, strip)
    const on = isAudible(track, project.tracks) ? 1 : 0
    strip.mute.gain.value = on
    if (hasAutomation(track, 'volume')) scheduleLane(strip.gain.gain, track.automation!.volume, fromBeat, T, 1, track.volume)
    else strip.gain.gain.value = track.volume
    if (hasAutomation(track, 'pan')) scheduleLane(strip.pan.pan, track.automation!.pan, fromBeat, T, 1, track.pan)
    else strip.pan.pan.value = Math.max(-1, Math.min(1, track.pan))
    for (const [rid, input] of returnInputs) {
      const lane = track.automation?.[`send:${rid}`]
      const level = track.sends?.[rid] ?? 0
      if (!level && !lane?.length) continue
      const send = ctx.createGain()
      if (lane?.length) scheduleLane(send.gain, lane, fromBeat, T, 1, level)
      else send.gain.value = level
      strip.analyser.connect(send).connect(input)           // post fader, after pan
      strip.sends.set(rid, send)
    }
    if (track.type === 'group') continue
    const timbre = timbreOf(track)

    // crossfades: where two audio clips of the track overlap, both fade over the overlap (equal power)
    const audio = track.clips.filter((c) => c.audioFile).sort((a, b) => a.startTime - b.startTime)
    const xIn = new Map<string, number>()
    const xOut = new Map<string, number>()
    for (let i = 1; i < audio.length; i++) {
      for (let j = 0; j < i; j++) {
        const ov = audio[j].startTime + audio[j].duration - audio[i].startTime
        if (ov > 0.001 && ov < Math.min(audio[i].duration, audio[j].duration)) {
          xIn.set(audio[i].id, Math.max(xIn.get(audio[i].id) ?? 0, ov))
          xOut.set(audio[j].id, Math.max(xOut.get(audio[j].id) ?? 0, ov))
        }
      }
    }

    for (const clip of track.clips) {
      const clipEnd = Math.min(clip.startTime + clip.duration, until)
      if (clipEnd <= fromBeat || clip.startTime >= until) continue
      const clipStart = T(clip.startTime) - when                 // seconds from `when`
      const clipLen = T(clipEnd) - T(clip.startTime)
      const skip = Math.max(0, -clipStart)                        // playing from the middle of the clip

      if (clip.audioFile) {
        const tempo = bpmAt(project, clip.startTime)
        const spbProject = 60 / tempo
        let buf: AudioBuffer | undefined
        let offset: number
        if (clip.warpMarkers?.length) {
          const spbSrc = sourceSecPerBeat(clip.warpBpm, tempo)
          buf = markerBufs.get(markerKey(clip, spbSrc, spbProject))
          // the rendered file starts at the file beat of second 0
          offset = (beatOfSrc(clip.warpMarkers, clip.offset ?? 0, spbSrc) - beatOfSrc(clip.warpMarkers, 0, spbSrc)) * spbProject + skip
        } else {
          const synced = clip.warpBpm ? warped.get(warpKey(clip.audioFile, clip.warpBpm, tempo)) : undefined
          buf = synced ?? buffers.get(clip.audioFile)
          // `offset` counts seconds of the original file: a stretched copy is longer or shorter in the same proportion
          const stretch = synced && clip.warpBpm ? clip.warpBpm / tempo : 1
          offset = (clip.offset ?? 0) * stretch + skip
        }
        if (!buf) continue
        const len = clipLen - skip
        if (len <= 0 || offset >= buf.duration) continue
        const src = ctx.createBufferSource()
        src.buffer = buf
        const g = ctx.createGain()
        const at = when + Math.max(0, clipStart)
        const peakGain = Math.max(0, Math.min(2, clip.gain ?? 1))
        const full = clipLen
        // tiny fades remove clicks at the cut; only 2 ms, so a kick right at the clip start keeps its attack (6 ms made
        // the first beat of a clip that starts on a kick sound soft and late)
        const click = Math.min(0.002, full / 4)
        const spb = clipLen / Math.max(1e-6, clipEnd - clip.startTime)
        const xi = (xIn.get(clip.id) ?? 0) * spb
        const xo = (xOut.get(clip.id) ?? 0) * spb
        const fadeIn = Math.min(full / 2, Math.max(click, (clip.fadeIn ?? 0) * spb, xi))
        const fadeOut = Math.min(full / 2, Math.max(click, (clip.fadeOut ?? 0) * spb, xo))
        envelope(g.gain, at, skip, len, peakGain, fadeIn, fadeOut, xi > 0 && xi >= (clip.fadeIn ?? 0) * spb, xo > 0 && xo >= (clip.fadeOut ?? 0) * spb)
        src.connect(g).connect(strip.bus)
        src.start(at, offset, Math.min(len, buf.duration - offset))
        nodes.push(src)
      }

      if (clip.notes?.length && !clip.audioFile) {
        for (const n of clip.notes) {
          const nb = clip.startTime + n.startTime
          const ne = Math.min(nb + n.duration, clipEnd)
          if (ne <= fromBeat || nb >= clipEnd) continue
          const nStart = T(nb) - when
          const nLen = T(ne) - T(nb)
          const at = when + Math.max(0, nStart)
          const dur = nStart < 0 ? nLen + nStart : nLen
          if (dur <= 0.005) continue
          nodes.push(...playSynthNote(ctx, strip.bus, n.pitch, n.velocity, at, dur, timbre))
        }
      }
    }
  }

  const all = (): Strip[] => [...strips.values(), ...returns.values()]
  return {
    strips,
    returns,
    stop: (fade = true) => {
      const t = (ctx as AudioContext).currentTime ?? 0
      for (const s of all()) {
        try {
          if (fade && 'setTargetAtTime' in s.bus.gain) s.bus.gain.setTargetAtTime(0, t, 0.008)
        } catch { /* context closed */ }
      }
      const kill = (): void => {
        for (const n of nodes) { try { n.stop() } catch { /* not started */ } }
        for (const s of all()) { try { s.bus.disconnect() } catch { /* gone */ } }
      }
      if (fade) window.setTimeout(kill, 40)
      else kill()
    },
    stopAt: (time: number) => {
      for (const n of nodes) { try { n.stop(time) } catch { /* already stopped */ } }
      // return tracks keep their tail (reverb, echoes) for a moment, then everything is freed
      const free = Math.max(0, time - ((ctx as AudioContext).currentTime ?? 0)) * 1000 + 6000
      window.setTimeout(() => { for (const s of all()) { try { s.bus.disconnect() } catch { /* gone */ } } }, free)
    }
  }
}

// ── live engine ──────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null
let master: GainNode | null = null
let masterAnalyser: AnalyserNode | null = null
let current: Scheduled | null = null
let playing = false
let startCtxTime = 0
let startBeat = 0
let raf = 0
let metroTimer = 0
let metroBeat = 0
let epoch = 0                         // invalidates a restart that is still loading files
let restartTimer = 0
let lastSignature = ''
// the next pass of the loop, already scheduled to start at `when`
let pendingLoop: { when: number; beat: number; sched: Scheduled; project: Project } | null = null
// the project as it was scheduled: the playing position is counted in ITS tempo. After a tempo change the sound keeps
// playing in the old tempo until the new one is ready; counting with the new tempo made the song jump.
let playProject: Project | null = null
const loopWraps: number[] = []        // context times at which the loop jumped back (loop recording)

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.gain.value = useAudioStore.getState().masterVolume
    masterAnalyser = ctx.createAnalyser()
    masterAnalyser.fftSize = 1024
    // a safety limiter at the very end: many notes or loud clips together distorted hard before
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -1.5
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    master.connect(masterAnalyser).connect(limiter).connect(ctx.destination)
  }
  return ctx
}

export function isPlaying(): boolean {
  return playing
}

function commitLoop(): void {
  if (!pendingLoop || !ctx || ctx.currentTime < pendingLoop.when) return
  current = pendingLoop.sched
  startCtxTime = pendingLoop.when
  startBeat = pendingLoop.beat
  playProject = pendingLoop.project
  metroBeat = Math.ceil(startBeat - 1e-6)
  pendingLoop = null
}

export function currentBeat(): number {
  if (!playing || !ctx) return useAudioStore.getState().currentBeat
  commitLoop()
  const p = playProject ?? useProjectStore.getState().project
  // the first moments after play (and the count-in) lie before the scheduled start: never report an earlier beat
  return secToBeat(p, beatToSec(p, startBeat) + Math.max(0, ctx.currentTime - startCtxTime))
}

export function activeLoop(p: Project): { start: number; end: number } | null {
  const l = p.loop
  return l && l.enabled && l.end - l.start > 0.05 ? { start: l.start, end: l.end } : null
}

async function loadAllFiles(p: Project): Promise<void> {
  const files = new Set<string>()
  const synced = new Map<string, [string, number, number, number | undefined]>()
  const marked: Array<[Clip, number, number]> = []
  for (const t of p.tracks) {
    for (const c of t.clips) {
      if (!c.audioFile) continue
      files.add(c.audioFile)
      const tempo = bpmAt(p, c.startTime)
      if (c.warpMarkers?.length) marked.push([c, sourceSecPerBeat(c.warpBpm, tempo), 60 / tempo])
      else if (c.warpBpm) synced.set(warpKey(c.audioFile, c.warpBpm, tempo), [c.audioFile, c.warpBpm, tempo, c.gridFirst])
    }
  }
  await Promise.all([...files].map((f) => loadBuffer(f)))
  await Promise.all([...synced.values()].map(([f, b, tempo, g]) => loadWarped(f, b, tempo, g)))
  await Promise.all(marked.map(([c, a, b]) => loadMarkerWarp(c, a, b)))
}

// everything that needs a new schedule when it changes (fader moves and mute/solo do not)
function structureSignature(p: Project): string {
  return JSON.stringify([
    p.bpm, p.tempoMap ?? [], p.returns?.map((r) => [r.id, r.effect, r.decay, r.delayBeats, r.feedback]) ?? [],
    p.tracks.map((t) => [
      t.id, t.type, t.name, t.parentId ?? '', t.automation ?? {}, Object.keys(t.sends ?? {}).filter((k) => (t.sends?.[k] ?? 0) > 0), t.fx ?? [],
      t.clips.map((c) => [c.id, c.startTime, c.duration, c.offset ?? 0, c.audioFile ?? '', c.gain ?? 1, c.warpBpm ?? 0, c.fadeIn ?? 0, c.fadeOut ?? 0,
        c.warpMarkers ?? [], (c.notes ?? []).map((n) => `${n.pitch}/${n.startTime}/${n.duration}/${n.velocity}`).join(';')])
    ])
  ])
}

// clicks for the count-in: `bars` bars ending at context time `end`, in the tempo of `beat`
function scheduleCountIn(c: AudioContext, end: number, beat: number, barsCount: number): number {
  const p = useProjectStore.getState().project
  const bar = barAt(p, beat)
  const spb = 60 / bpmAt(p, beat)
  const beatsPerBar = Math.max(1, Math.round(bar.length))
  const n = barsCount * beatsPerBar
  const pre = n * spb
  for (let k = 0; k < n; k++) playClick(c, master!, end - pre + k * spb, k % beatsPerBar === 0)
  return pre
}

async function startAt(beat: number, countInBars = 0): Promise<void> {
  const my = ++epoch
  const c = ensureContext()
  if (c.state === 'suspended') await c.resume()
  const project = useProjectStore.getState().project
  useAudioStore.setState({ loading: true })
  await loadAllFiles(project)
  useAudioStore.setState({ loading: false })
  if (my !== epoch) return                                        // stopped or restarted meanwhile
  const latest = useProjectStore.getState().project
  lastSignature = structureSignature(latest)
  let when = c.currentTime + 0.06
  if (countInBars > 0) when += scheduleCountIn(c, when + 60 / bpmAt(latest, beat) * Math.round(barAt(latest, beat).length) * countInBars, beat, countInBars)
  const loop = activeLoop(latest)
  current = scheduleProject(c, master!, latest, beat, when, loop && beat < loop.end ? { untilBeat: loop.end } : {})
  pendingLoop = null
  startCtxTime = when
  startBeat = beat
  playProject = latest
  playing = true
  recPlayStart = when
  useAudioStore.setState({ isPlaying: true })
  metroBeat = Math.ceil(beat - 1e-6)
  tick()
  window.clearInterval(metroTimer)
  metronomeTick()                      // at once: waiting for the first interval could skip the click on the first beat
  metroTimer = window.setInterval(metronomeTick, 40)
}

// a little before the loop end, the next pass is scheduled to start exactly at the end: no gap
function prepareLoop(): void {
  if (!ctx || !master || pendingLoop || !current) return
  const p = useProjectStore.getState().project
  const loop = activeLoop(p)
  if (!loop || startBeat >= loop.end) return
  const pp = playProject ?? p
  const endTime = startCtxTime + beatToSec(pp, loop.end) - beatToSec(pp, startBeat)
  if (endTime - ctx.currentTime > 0.35) return
  current.stopAt(endTime)
  const sched = scheduleProject(ctx, master, p, loop.start, endTime, { untilBeat: loop.end })
  pendingLoop = { when: endTime, beat: loop.start, sched, project: p }
  if (recorder) loopWraps.push(endTime)
}

function tick(): void {
  cancelAnimationFrame(raf)
  const frame = (): void => {
    if (!playing) return
    prepareLoop()
    const beat = currentBeat()
    useAudioStore.setState({ currentBeat: beat })
    const p = useProjectStore.getState().project
    const end = projectEndBeat(p)
    if (!activeLoop(p) && end > 0 && beat > end + 1 && !useAudioStore.getState().isRecording) {
      stop()                                                       // reached the end
      return
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
}

function metronomeTick(): void {
  if (!playing || !ctx || !master || !useAudioStore.getState().metronomeEnabled) {
    // keep the beat counter moving so that switching it on does not play a burst of old clicks
    if (playing && ctx) metroBeat = Math.max(metroBeat, Math.ceil(currentBeat()))
    return
  }
  commitLoop()
  const project = playProject ?? useProjectStore.getState().project
  const loop = activeLoop(project)
  const base = beatToSec(project, startBeat)
  for (;;) {
    if (loop && startBeat < loop.end && metroBeat >= loop.end - 1e-6) break     // the next pass clicks itself
    const at = startCtxTime + beatToSec(project, metroBeat) - base
    if (at >= ctx.currentTime + 0.25) break
    if (at >= ctx.currentTime) playClick(ctx, master, at, isDownbeat(project, metroBeat))
    metroBeat++
  }
}

export async function play(): Promise<void> {
  if (playing) return
  await startAt(useAudioStore.getState().currentBeat)
}

function halt(): void {
  current?.stop()
  pendingLoop?.sched.stop()
  current = null
  pendingLoop = null
  playing = false
}

// called when the transport stops (MIDI recording ends there)
const stopHooks: Array<() => void> = []
export function onTransportStop(fn: () => void): void { stopHooks.push(fn) }

export function pause(): void {
  epoch++
  for (const fn of stopHooks) { try { fn() } catch { /* a hook must not stop the transport from stopping */ } }
  if (playing) {
    const beat = currentBeat()
    halt()
    window.clearInterval(metroTimer)
    cancelAnimationFrame(raf)
    useAudioStore.setState({ isPlaying: false, currentBeat: beat })
  } else {
    useAudioStore.setState({ isPlaying: false, loading: false })
  }
  if (useAudioStore.getState().isRecording) void stopRecording()
}

export function stop(): void {
  pause()
  useAudioStore.setState({ currentBeat: 0 })
}

export function seek(beat: number): void {
  const b = Math.max(0, beat)
  if (playing) {
    halt()
    void startAt(b)
  } else {
    useAudioStore.setState({ currentBeat: b })
  }
}

// restart the sound at the same position after the music changed while playing
let restartToken = 0

// the music changed while playing (tempo, a clip moved, ...): get the new sound ready first (a new tempo means
// stretching every synced song again, which takes a moment) while the old one keeps playing, then switch over at the
// same place. Before, it went silent while stretching, which looked as if pressing Enter in the tempo field stopped it.
function restartSoon(): void {
  window.clearTimeout(restartTimer)
  restartTimer = window.setTimeout(() => {
    if (!playing) return
    const token = ++restartToken
    void (async () => {
      try { await loadAllFiles(useProjectStore.getState().project) } catch { /* startAt reports problems */ }
      if (!playing || token !== restartToken) return
      const beat = currentBeat()
      halt()
      void startAt(beat)
    })()
  }, 90)
}

function applyMix(): void {
  if (!playing || !current || !ctx) return
  const project = useProjectStore.getState().project
  const now = ctx.currentTime
  for (const sched of [current, pendingLoop?.sched]) {
    if (!sched) continue
    for (const t of project.tracks) {
      const s = sched.strips.get(t.id)
      if (!s) continue
      s.mute.gain.setTargetAtTime(isAudible(t, project.tracks) ? 1 : 0, now, 0.012)
      if (!hasAutomation(t, 'volume')) s.gain.gain.setTargetAtTime(t.volume, now, 0.012)
      if (!hasAutomation(t, 'pan')) s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, t.pan)), now, 0.012)
      for (const [rid, send] of s.sends) if (!hasAutomation(t, `send:${rid}`)) send.gain.setTargetAtTime(t.sends?.[rid] ?? 0, now, 0.012)
    }
    for (const r of project.returns ?? []) {
      const s = sched.returns.get(r.id)
      if (!s) continue
      s.mute.gain.setTargetAtTime(r.muted ? 0 : 1, now, 0.012)
      s.gain.gain.setTargetAtTime(r.volume, now, 0.012)
      s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, r.pan ?? 0)), now, 0.012)
    }
  }
}

useProjectStore.subscribe((s, prev) => {
  if (s.project === prev.project || !playing) return
  const sig = structureSignature(s.project)
  // a new send (level from 0 to more) needs its connection: that changes the signature too
  if (sig !== lastSignature) restartSoon()
  else applyMix()
})

useAudioStore.subscribe((s, prev) => {
  if (s.masterVolume !== prev.masterVolume && master && ctx) {
    master.gain.setTargetAtTime(s.masterVolume, ctx.currentTime, 0.012)
  }
})

// ── levels ───────────────────────────────────────────────────────────────────

const scratch = new Float32Array(1024)

function peakOfAnalyser(a: AnalyserNode): number {
  a.getFloatTimeDomainData(scratch)
  let m = 0
  for (let i = 0; i < scratch.length; i++) {
    const v = scratch[i] < 0 ? -scratch[i] : scratch[i]
    if (v > m) m = v
  }
  return Math.min(1, m)
}

export function trackLevel(trackId: string): number {
  if (!playing) return 0
  commitLoop()
  const s = current?.strips.get(trackId) ?? current?.returns.get(trackId)
  return s ? peakOfAnalyser(s.analyser) : 0
}

export function masterLevel(): number {
  return playing && masterAnalyser ? peakOfAnalyser(masterAnalyser) : 0
}

// ── sample preview (library): optionally at the project tempo ──────────────────

let previewing: AudioBufferSourceNode | null = null

let previewBuf: AudioBuffer | null = null
let previewStarted = 0          // context time that matches second 0 of the buffer
let previewDone: (() => void) | null = null

export function stopPreview(): void {
  const src = previewing
  previewing = null
  try { src?.stop() } catch { /* already over */ }
  previewDone?.(); previewDone = null
}

function startPreviewAt(c: AudioContext, offset: number): void {
  const old = previewing
  const src = c.createBufferSource()
  src.buffer = previewBuf
  src.connect(master!)
  src.onended = () => { if (previewing === src) { previewing = null; previewDone?.(); previewDone = null } }
  const at = Math.max(0, Math.min(offset, (previewBuf?.duration ?? 0) - 0.01))
  previewing = src                                     // set first: the old source's onended then does nothing
  try { old?.stop() } catch { /* already over */ }
  src.start(0, at)
  previewStarted = c.currentTime - at
}

// plays a file through the master; with `sourceBpm` it is stretched to the project tempo first
export async function previewSample(path: string, sourceBpm?: number): Promise<{ seconds: number; ended: Promise<void>; buffer: AudioBuffer } | null> {
  stopPreview()
  const c = ensureContext()
  if (c.state === 'suspended') await c.resume()
  const bpm = useProjectStore.getState().project.bpm
  const buf = sourceBpm ? await loadWarped(path, sourceBpm, bpm) : await loadBuffer(path)
  if (!buf) return null
  previewBuf = buf
  const ended = new Promise<void>((res) => { previewDone = res })
  startPreviewAt(c, 0)
  return { seconds: buf.duration, ended, buffer: buf }
}

// where the preview is (for a waveform), and jumping in it
export function previewPosition(): { time: number; duration: number } | null {
  if (!previewing || !previewBuf || !ctx) return null
  return { time: Math.min(previewBuf.duration, ctx.currentTime - previewStarted), duration: previewBuf.duration }
}

export function seekPreview(seconds: number): void {
  if (!previewing || !previewBuf) return
  startPreviewAt(ensureContext(), seconds)
}

// ── note preview (piano roll) ────────────────────────────────────────────────

export async function previewNote(pitch: number, velocity = 100, track?: Track): Promise<void> {
  const c = ensureContext()
  if (c.state === 'suspended') await c.resume()
  playSynthNote(c, master!, pitch, velocity, c.currentTime + 0.01, 0.35, track ? timbreOf(track) : 'soft')
}

// ── recording (microphone / audio interface) ─────────────────────────────────

let recorder: MediaRecorder | null = null
let recStream: MediaStream | null = null
let recChunks: Blob[] = []
let recTrackId: string | null = null
let recStartBeat = 0
let recCtxStart = 0                  // context time when the recorder started
let recPlayStart = 0                 // context time when the music (after the count-in) started

export async function startRecording(): Promise<string | null> {
  if (recorder) return null
  const store = useProjectStore.getState()
  let trackId = store.selectedTrackId
  const sel = store.project.tracks.find((t) => t.id === trackId)
  if (!sel || (sel.type !== 'audio' && sel.type !== 'vocal')) {
    store.addTrack('audio')
    const tracks = useProjectStore.getState().project.tracks
    trackId = tracks[tracks.length - 1].id
    useProjectStore.getState().selectTrack(trackId)
  }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
  } catch (e) {
    useAudioStore.setState({ isRecording: false })
    return `No microphone access: ${(e as Error).message}`
  }
  const c = ensureContext()
  if (c.state === 'suspended') await c.resume()
  recChunks = []
  recTrackId = trackId
  loopWraps.length = 0
  const project = useProjectStore.getState().project
  const countIn = Math.max(0, Math.min(4, project.countIn ?? 0))
  recorder = new MediaRecorder(recStream)
  recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data) }
  recorder.start(250)
  recCtxStart = c.currentTime
  useAudioStore.setState({ isRecording: true })
  if (playing) {
    recStartBeat = currentBeat()
    recPlayStart = recCtxStart                                    // already playing: the music is "now"
  } else {
    recStartBeat = useAudioStore.getState().currentBeat
    await startAt(recStartBeat, countIn)
  }
  return null
}

// what one recorded stretch becomes: a clip on the timeline (beats) that reads the file from `offset`
interface Piece { startBeat: number; endBeat: number; offset: number }

export function recordingPieces(p: Project, startBeatRec: number, recSeconds: number, lead: number, wraps: number[],
  loop: { start: number; end: number } | null): Piece[] {
  const pieces: Piece[] = []
  const at = (beat: number): number => beatToSec(p, beat)
  if (!loop || !wraps.length) {
    const endBeat = secToBeat(p, at(startBeatRec) + Math.max(0, recSeconds - lead))
    if (endBeat > startBeatRec) pieces.push({ startBeat: startBeatRec, endBeat, offset: lead })
    return pieces
  }
  // first pass: from where the recording started to the loop end; then one pass per loop
  let fileAt = lead
  let from = startBeatRec
  for (let k = 0; k <= wraps.length; k++) {
    const passSec = k < wraps.length ? (k === 0 ? wraps[0] - lead : wraps[k] - wraps[k - 1]) : recSeconds - fileAt
    const endBeat = Math.min(loop.end, secToBeat(p, at(from) + Math.max(0, passSec)))
    if (endBeat - from > 0.05) pieces.push({ startBeat: from, endBeat, offset: fileAt })
    fileAt += Math.max(0, passSec)
    from = loop.start
  }
  return pieces
}

export async function stopRecording(): Promise<void> {
  const r = recorder
  if (!r) { useAudioStore.setState({ isRecording: false }); return }
  recorder = null
  const done = new Promise<void>((res) => { r.onstop = () => res() })
  r.stop()
  await done
  recStream?.getTracks().forEach((t) => t.stop())
  recStream = null
  useAudioStore.setState({ isRecording: false })
  if (!recChunks.length || !recTrackId) return
  try {
    const raw = await new Blob(recChunks).arrayBuffer()
    decoder ??= new AudioContext()
    const buf = await decoder.decodeAudioData(raw)
    const wav = encodeWav(buf, 16)
    const path = await window.api.files.saveRecording(wav)
    putBuffer(path, buf)
    const project = useProjectStore.getState().project
    const loop = activeLoop(project)
    const wraps = loopWraps.map((t) => t - recCtxStart)
    const lead = Math.max(0, recPlayStart - recCtxStart)
    let pieces = recordingPieces(project, recStartBeat, buf.duration, lead, wraps, loop)
    // punch in / out: only what lies inside the loop range is kept
    const range = project.loop
    if (range && (project.punchIn || project.punchOut) && !wraps.length) {
      pieces = pieces.map((pc) => {
        const s = project.punchIn ? Math.max(pc.startBeat, range.start) : pc.startBeat
        const e = project.punchOut ? Math.min(pc.endBeat, range.end) : pc.endBeat
        return { startBeat: s, endBeat: e, offset: pc.offset + beatToSec(project, s) - beatToSec(project, pc.startBeat) }
      }).filter((pc) => pc.endBeat - pc.startBeat > 0.05)
    }
    if (!pieces.length) return
    const toClip = (pc: Piece, name: string): Omit<Clip, 'id'> => ({
      startTime: pc.startBeat, duration: pc.endBeat - pc.startBeat, audioFile: path, offset: pc.offset, name
    })
    const st = useProjectStore.getState()
    if (pieces.length === 1) {
      st.addClip(recTrackId, toClip(pieces[0], 'Recording'))
      return
    }
    // loop recording: every pass in its own take lane; the last pass plays on the track (comp it from the lanes)
    const track = st.project.tracks.find((t) => t.id === recTrackId)
    const first = (track?.takes?.length ?? 0) + 1
    const lanes = pieces.map((pc, i) => ({ id: nanoid(), name: `Take ${first + i}`, clips: [{ ...toClip(pc, `Take ${first + i}`), id: nanoid() }] }))
    st.updateTrack(recTrackId, { takes: [...(track?.takes ?? []), ...lanes], showTakes: true })
    st.addClip(recTrackId, toClip(pieces[pieces.length - 1], `Take ${first + pieces.length - 1}`))
  } catch (e) {
    console.warn('[audio] recording failed', e)
  }
}

// ── offline rendering: export and consolidate ────────────────────────────────

export interface MixResult { wav: Uint8Array; seconds: number; peak: number }

export async function renderMix(opts: { bits: 16 | 24; normalize: boolean; tailSeconds?: number }): Promise<MixResult> {
  const project = useProjectStore.getState().project
  await loadAllFiles(project)
  const sr = exportSampleRate()                                  // Settings → Audio (44.1 kHz unless changed)
  const endBeat = projectEndBeat(project)
  if (endBeat <= 0) throw new Error('The project is empty: nothing to export.')
  const seconds = beatToSec(project, endBeat) + (opts.tailSeconds ?? 2)
  const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const out = off.createGain()
  out.gain.value = useAudioStore.getState().masterVolume
  out.connect(off.destination)
  scheduleProject(off, out, project, 0, 0)
  const rendered = await off.startRendering()
  const peak = peakOf(rendered)
  const gain = opts.normalize && peak > 0 ? 0.891 / peak : 1                 // -1 dBFS
  return { wav: encodeWav(rendered, opts.bits, gain), seconds, peak: peak * gain }
}

// The selected audio clips of one track rendered into one new file (Ableton "Consolidate", Cubase
// "Bounce selection"): clip gain, fades, crossfades, sync and warp markers are included, the track's fader,
// pan, sends and automation are not.
export async function renderClips(project: Project, clips: Clip[], fromBeat: number, toBeat: number): Promise<AudioBuffer> {
  const solo: Track = { id: 'render', name: 'render', type: 'audio', color: '#000', volume: 1, pan: 0, muted: false, soloed: false, clips }
  const p: Project = { ...project, tracks: [solo], returns: [] }
  await loadAllFiles(p)
  const sr = 44100
  const seconds = beatToSec(p, toBeat) - beatToSec(p, fromBeat)
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * sr)), sr)
  scheduleProject(off, off.destination, p, fromBeat, 0, { untilBeat: toBeat })
  return off.startRendering()
}
