// The audio engine: plays the project (audio clips and MIDI notes through the built-in synth), mixes
// tracks (volume, pan, mute, solo), measures levels, records, and renders the mix for export.
//
// The same scheduling code serves live playback (AudioContext) and export (OfflineAudioContext).

import { useAudioStore } from '../stores/audio.store'
import { useProjectStore } from '../stores/project.store'
import type { Project, Track } from '../types'
import { playClick, playSynthNote, type Timbre } from './synth'
import { encodeWav, peakOf } from './wav'
import { MAX_STRETCH_SECONDS, stretchBuffer } from './stretch'

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

// ── synced samples: stretched copies of a file for the current project tempo ──

const warped = new Map<string, AudioBuffer>()
const warping = new Map<string, Promise<AudioBuffer | null>>()
const warpKey = (path: string, source: number, project: number): string => `${path}|${source}|${project}`

// seconds of the FILE per beat of the clip: a synced sample is measured in its own tempo
export const sourceSecPerBeat = (clipWarpBpm: number | undefined, projectBpm: number): number => 60 / (clipWarpBpm || projectBpm || 120)

export async function loadWarped(path: string, sourceBpm: number, projectBpm: number): Promise<AudioBuffer | null> {
  const key = warpKey(path, sourceBpm, projectBpm)
  const have = warped.get(key)
  if (have) return have
  let p = warping.get(key)
  if (!p) {
    p = (async () => {
      const raw = await loadBuffer(path)
      if (!raw) return null
      if (raw.duration > MAX_STRETCH_SECONDS) return raw          // too long to stretch: plays unchanged
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

const hasSound = (t: Track): boolean => t.clips.length > 0

// mute and solo: a track is heard if it is not muted and (nothing is soloed, or it is soloed)
export function audibleGain(t: Track, anySolo: boolean): number {
  if (t.muted) return 0
  if (anySolo && !t.soloed) return 0
  return t.volume
}

interface Strip {
  bus: GainNode            // everything of the track goes in here (stopped by ramping this to 0)
  gain: GainNode           // fader
  pan: StereoPannerNode
  analyser: AnalyserNode
}

function makeStrip(ctx: BaseAudioContext, dest: AudioNode, t: Track, anySolo: boolean): Strip {
  const bus = ctx.createGain()
  const gain = ctx.createGain()
  const pan = ctx.createStereoPanner()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  gain.gain.value = audibleGain(t, anySolo)
  pan.pan.value = Math.max(-1, Math.min(1, t.pan))
  bus.connect(gain).connect(pan).connect(analyser).connect(dest)
  return { bus, gain, pan, analyser }
}

export interface Scheduled {
  strips: Map<string, Strip>
  stop: (fade?: boolean) => void
}

// Schedules everything from `fromBeat` on. `when` is the context time that corresponds to `fromBeat`.
export function scheduleProject(
  ctx: BaseAudioContext,
  dest: AudioNode,
  project: Project,
  fromBeat: number,
  when: number
): Scheduled {
  const spb = 60 / (project.bpm || 120)
  const anySolo = project.tracks.some((t) => t.soloed)
  const strips = new Map<string, Strip>()
  const nodes: Array<AudioScheduledSourceNode> = []

  for (const track of project.tracks) {
    if (!hasSound(track)) continue
    const strip = makeStrip(ctx, dest, track, anySolo)
    strips.set(track.id, strip)
    const timbre = timbreOf(track)

    for (const clip of track.clips) {
      const clipStart = (clip.startTime - fromBeat) * spb          // seconds from `when`
      const clipLen = clip.duration * spb
      if (clipStart + clipLen <= 0) continue
      const skip = Math.max(0, -clipStart)                         // playing from the middle of the clip

      if (clip.audioFile) {
        const synced = clip.warpBpm ? warped.get(warpKey(clip.audioFile, clip.warpBpm, project.bpm)) : undefined
        const buf = synced ?? buffers.get(clip.audioFile)
        if (!buf) continue
        const len = clipLen - skip
        // `offset` counts seconds of the original file: a stretched copy is longer or shorter in the same proportion
        const stretch = synced && clip.warpBpm ? clip.warpBpm / project.bpm : 1
        const offset = (clip.offset ?? 0) * stretch + skip
        if (len <= 0 || offset >= buf.duration) continue
        const src = ctx.createBufferSource()
        src.buffer = buf
        const g = ctx.createGain()
        const at = when + Math.max(0, clipStart)
        const peakGain = Math.max(0, Math.min(2, clip.gain ?? 1))
        const click = Math.min(0.006, len / 4)                     // tiny fades remove clicks at the cut
        // the fades the user set (in beats); each is at most half of the clip
        const fadeIn = Math.max(click, Math.min(len / 2, (clip.fadeIn ?? 0) * spb - skip))
        const fadeOut = Math.max(click, Math.min(len / 2, (clip.fadeOut ?? 0) * spb))
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(peakGain, at + fadeIn)
        g.gain.setValueAtTime(peakGain, at + len - fadeOut)
        g.gain.linearRampToValueAtTime(0, at + len)
        src.connect(g).connect(strip.bus)
        src.start(at, offset, Math.min(len, buf.duration - offset))
        nodes.push(src)
      }

      if (clip.notes?.length && !clip.audioFile) {
        for (const n of clip.notes) {
          const nStart = clipStart + n.startTime * spb
          let nLen = n.duration * spb
          if (nStart + nLen <= 0 || nStart >= clipStart + clipLen) continue
          nLen = Math.min(nLen, clipStart + clipLen - nStart)
          const at = when + Math.max(0, nStart)
          const dur = nStart < 0 ? nLen + nStart : nLen
          if (dur <= 0.005) continue
          nodes.push(...playSynthNote(ctx, strip.bus, n.pitch, n.velocity, at, dur, timbre))
        }
      }
    }
  }

  return {
    strips,
    stop: (fade = true) => {
      const t = (ctx as AudioContext).currentTime ?? 0
      for (const s of strips.values()) {
        try {
          if (fade && 'setTargetAtTime' in s.bus.gain) s.bus.gain.setTargetAtTime(0, t, 0.008)
        } catch { /* context closed */ }
      }
      const kill = (): void => {
        for (const n of nodes) { try { n.stop() } catch { /* not started */ } }
        for (const s of strips.values()) { try { s.bus.disconnect() } catch { /* gone */ } }
      }
      if (fade) window.setTimeout(kill, 40)
      else kill()
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

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.gain.value = useAudioStore.getState().masterVolume
    masterAnalyser = ctx.createAnalyser()
    masterAnalyser.fftSize = 1024
    master.connect(masterAnalyser).connect(ctx.destination)
  }
  return ctx
}

export function isPlaying(): boolean {
  return playing
}

export function currentBeat(): number {
  if (!playing || !ctx) return useAudioStore.getState().currentBeat
  const bpm = useProjectStore.getState().project.bpm || 120
  // the first moments after play lie slightly before the scheduled start: never report a negative step
  return startBeat + Math.max(0, ((ctx.currentTime - startCtxTime) * bpm) / 60)
}

async function loadAllFiles(p: Project): Promise<void> {
  const files = new Set<string>()
  const synced = new Map<string, [string, number]>()
  for (const t of p.tracks) {
    for (const c of t.clips) {
      if (!c.audioFile) continue
      files.add(c.audioFile)
      if (c.warpBpm) synced.set(warpKey(c.audioFile, c.warpBpm, p.bpm), [c.audioFile, c.warpBpm])
    }
  }
  await Promise.all([...files].map((f) => loadBuffer(f)))
  await Promise.all([...synced.values()].map(([f, b]) => loadWarped(f, b, p.bpm)))
}

function structureSignature(p: Project): string {
  return p.bpm + '|' + p.tracks.map((t) =>
    `${t.id}:${t.type}:${t.name}:` + t.clips.map((c) =>
      `${c.id},${c.startTime},${c.duration},${c.offset ?? 0},${c.audioFile ?? ''},${c.gain ?? 1},${c.warpBpm ?? 0},${c.fadeIn ?? 0},${c.fadeOut ?? 0},` +
      (c.notes ?? []).map((n) => `${n.pitch}/${n.startTime}/${n.duration}/${n.velocity}`).join(';')
    ).join('~')
  ).join('#')
}

async function startAt(beat: number): Promise<void> {
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
  const when = c.currentTime + 0.06
  current = scheduleProject(c, master!, latest, beat, when)
  startCtxTime = when
  startBeat = beat
  playing = true
  useAudioStore.setState({ isPlaying: true })
  metroBeat = Math.ceil(beat - 1e-6)
  tick()
  window.clearInterval(metroTimer)
  metroTimer = window.setInterval(metronomeTick, 40)
}

function tick(): void {
  cancelAnimationFrame(raf)
  const frame = (): void => {
    if (!playing) return
    const beat = currentBeat()
    useAudioStore.setState({ currentBeat: beat })
    const end = projectEndBeat(useProjectStore.getState().project)
    if (end > 0 && beat > end + 1 && !useAudioStore.getState().isRecording) {
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
  const { project } = useProjectStore.getState()
  const spb = 60 / (project.bpm || 120)
  const perBar = project.timeSignature?.[0] || 4
  while (startCtxTime + (metroBeat - startBeat) * spb < ctx.currentTime + 0.25) {
    const at = startCtxTime + (metroBeat - startBeat) * spb
    if (at >= ctx.currentTime) playClick(ctx, master, at, metroBeat % perBar === 0)
    metroBeat++
  }
}

export async function play(): Promise<void> {
  if (playing) return
  await startAt(useAudioStore.getState().currentBeat)
}

export function pause(): void {
  epoch++
  if (playing) {
    const beat = currentBeat()
    current?.stop()
    current = null
    playing = false
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
    current?.stop()
    current = null
    playing = false
    void startAt(b)
  } else {
    useAudioStore.setState({ currentBeat: b })
  }
}

// restart the sound at the same position after the music changed while playing
function restartSoon(): void {
  window.clearTimeout(restartTimer)
  restartTimer = window.setTimeout(() => {
    if (!playing) return
    const beat = currentBeat()
    current?.stop()
    current = null
    playing = false
    void startAt(beat)
  }, 90)
}

function applyMix(): void {
  if (!playing || !current || !ctx) return
  const project = useProjectStore.getState().project
  const anySolo = project.tracks.some((t) => t.soloed)
  for (const t of project.tracks) {
    const s = current.strips.get(t.id)
    if (!s) continue
    s.gain.gain.setTargetAtTime(audibleGain(t, anySolo), ctx.currentTime, 0.012)
    s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, t.pan)), ctx.currentTime, 0.012)
  }
}

useProjectStore.subscribe((s, prev) => {
  if (s.project === prev.project || !playing) return
  if (structureSignature(s.project) !== lastSignature) restartSoon()
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
  const s = current?.strips.get(trackId)
  return playing && s ? peakOfAnalyser(s.analyser) : 0
}

export function masterLevel(): number {
  return playing && masterAnalyser ? peakOfAnalyser(masterAnalyser) : 0
}

// ── sample preview (library): optionally at the project tempo ──────────────────

let previewing: AudioBufferSourceNode | null = null

export function stopPreview(): void {
  try { previewing?.stop() } catch { /* already over */ }
  previewing = null
}

// plays a file through the master; with `sourceBpm` it is stretched to the project tempo first
export async function previewSample(path: string, sourceBpm?: number): Promise<{ seconds: number; ended: Promise<void> } | null> {
  stopPreview()
  const c = ensureContext()
  if (c.state === 'suspended') await c.resume()
  const bpm = useProjectStore.getState().project.bpm
  const buf = sourceBpm ? await loadWarped(path, sourceBpm, bpm) : await loadBuffer(path)
  if (!buf) return null
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(master!)
  const ended = new Promise<void>((res) => { src.onended = () => { if (previewing === src) previewing = null; res() } })
  src.start()
  previewing = src
  return { seconds: buf.duration, ended }
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
  recChunks = []
  recTrackId = trackId
  recStartBeat = currentBeat()
  recorder = new MediaRecorder(recStream)
  recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data) }
  recorder.start(250)
  useAudioStore.setState({ isRecording: true })
  if (!playing) void play()
  return null
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
    buffers.set(path, buf)
    const bpm = useProjectStore.getState().project.bpm
    useProjectStore.getState().addClip(recTrackId, {
      startTime: recStartBeat, duration: secToBeats(buf.duration, bpm), audioFile: path, name: 'Recording'
    })
  } catch (e) {
    console.warn('[audio] recording failed', e)
  }
}

// ── export ───────────────────────────────────────────────────────────────────

export interface MixResult { wav: Uint8Array; seconds: number; peak: number }

export async function renderMix(opts: { bits: 16 | 24; normalize: boolean; tailSeconds?: number }): Promise<MixResult> {
  const project = useProjectStore.getState().project
  await loadAllFiles(project)
  const sr = 44100
  const endBeat = projectEndBeat(project)
  if (endBeat <= 0) throw new Error('The project is empty: nothing to export.')
  const seconds = beatsToSec(endBeat, project.bpm) + (opts.tailSeconds ?? 2)
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
