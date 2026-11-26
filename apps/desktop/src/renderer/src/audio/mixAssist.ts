// The mix assistant of the Mixer (0.99.13): it measures every track on its own (loudness in LUFS, how much of its
// energy lies in the low end), the whole mix, and suggests changes the owner can listen to and take: levels,
// panning, a clash in the low end, the headroom. The measuring is done offline, without effects and sends (a
// plugin or send changes the result a little), for the first minute of the song.
import { analyze } from './master/dsp'
import { beatToSec } from './timemap'
import { projectEndBeat, renderClips, renderMidiGuide } from './engine'
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'
import { insertDefaults } from './fx'
import { nanoid } from 'nanoid'
import type { Project, Track } from '../types'

export type Role = 'vocal' | 'drums' | 'bass' | 'music'

export function roleOf(t: Pick<Track, 'name' | 'type' | 'sound'>): Role {
  if (t.type === 'vocal' || /vocal|gesang|voice|sing|stimme|vox|\brap\b/i.test(t.name)) return 'vocal'
  if (t.sound === 'drums' || /drum|schlagz|beat|perc|kick|snare/i.test(t.name)) return 'drums'
  if (t.sound === 'bass' || t.sound === '808' || /bass/i.test(t.name)) return 'bass'
  return 'music'
}

export interface TrackStat { id: string; name: string; role: Role; lufs: number; low: number; volume: number; pan: number }
export interface MixInfo { lufs: number; truePeak: number }
export interface MixSuggestion {
  id: string
  kind: 'gain' | 'pan' | 'eq' | 'master' | 'info'
  tracks: string[]
  text: string                              // already in the UI language (the caller passes `say`)
  why: string
  deltas?: Record<string, number>           // gain: dB per track
  pans?: Record<string, number>             // pan: new pan per track
  eq?: { track: string; lowDb: number }     // a cut in the low end as an EQ insert
  masterDb?: number
}

export const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity)
/** what a track adds to the mix: its own loudness plus its fader */
export const contribution = (s: TrackStat): number => s.lufs + db(s.volume)

type Say = (en: string, vars?: Record<string, string | number>) => string

/** the suggestions for the measured tracks (pure: used by the page and by the tests) */
export function suggest(stats: TrackStat[], mix: MixInfo | null, target: number, say: Say): MixSuggestion[] {
  const out: MixSuggestion[] = []
  const live = stats.filter((s) => isFinite(s.lufs) && s.volume > 0.001)
  const n = (x: number): number => Math.round(x * 10) / 10
  const names = (list: TrackStat[]): string => list.map((s) => s.name).join(', ')
  const vocals = live.filter((s) => s.role === 'vocal')
  const others = live.filter((s) => s.role !== 'vocal')

  // 1. the vocals should be as loud as the loudest instrument, a little louder
  if (vocals.length && others.length) {
    const ref = Math.max(...others.map(contribution))
    const deltas: Record<string, number> = {}
    for (const v of vocals) { const c = contribution(v); if (c < ref - 1) deltas[v.id] = n(Math.min(12, ref + 0.5 - c)) }
    if (Object.keys(deltas).length) out.push({ id: 'vocal', kind: 'gain', tracks: Object.keys(deltas), deltas,
      text: say('Lift {names} by {db} dB', { names: names(vocals.filter((v) => deltas[v.id])), db: Math.max(...Object.values(deltas)) }),
      why: say('The vocals are quieter than the loudest instrument: they should sit on top.') })
  }
  // 2. bass and drums in balance
  const bass = live.filter((s) => s.role === 'bass'), drums = live.filter((s) => s.role === 'drums')
  if (bass.length && drums.length) {
    const diff = Math.max(...bass.map(contribution)) - Math.max(...drums.map(contribution))
    if (diff > 4) out.push({ id: 'bass-loud', kind: 'gain', tracks: bass.map((s) => s.id), deltas: Object.fromEntries(bass.map((s) => [s.id, -n(diff - 2)])),
      text: say('Lower {names} by {db} dB', { names: names(bass), db: n(diff - 2) }), why: say('The bass is much louder than the drums.') })
    else if (diff < -6) out.push({ id: 'bass-quiet', kind: 'gain', tracks: bass.map((s) => s.id), deltas: Object.fromEntries(bass.map((s) => [s.id, n(-diff - 4)])),
      text: say('Lift {names} by {db} dB', { names: names(bass), db: n(-diff - 4) }), why: say('The bass is much quieter than the drums.') })
  }
  // 3. a track far below the loudest one
  if (live.length > 2) {
    const loud = Math.max(...live.map(contribution))
    const quiet = live.filter((s) => s.role === 'music' && contribution(s) < loud - 14)
    if (quiet.length) out.push({ id: 'quiet', kind: 'gain', tracks: quiet.map((s) => s.id), deltas: Object.fromEntries(quiet.map((s) => [s.id, n(Math.min(8, loud - 10 - contribution(s)))])),
      text: say('Lift {names}', { names: names(quiet) }), why: say('This track is very quiet in the mix (more than 14 dB below the loudest).') })
  }
  // 4. several instruments in the middle: spread them
  const mid = live.filter((s) => s.role === 'music' && Math.abs(s.pan) < 0.1)
  if (mid.length >= 2) {
    const slots = [-0.4, 0.4, -0.7, 0.7, -0.2, 0.2]
    out.push({ id: 'pan', kind: 'pan', tracks: mid.map((s) => s.id), pans: Object.fromEntries(mid.map((s, i) => [s.id, slots[i % slots.length]])),
      text: say('Spread {names} left and right', { names: names(mid) }), why: say('Several instruments sit in the middle: spread them to make room for each.') })
  }
  // 5. bass and drums share the low end
  if (bass.length && drums.length) {
    const b = bass[0], d = drums[0]
    if (b.low > 0.45 && d.low > 0.45 && Math.abs(contribution(b) - contribution(d)) < 4) out.push({ id: 'low', kind: 'eq', tracks: [d.id],
      eq: { track: d.id, lowDb: -3 }, text: say('Take 3 dB of low end out of {name}', { name: d.name }),
      why: say('{a} and {b} both carry a lot of energy below 140 Hz: the kick and the bass then blur together.', { a: b.name, b: d.name }) })
  }
  // 6. headroom and loudness
  if (mix) {
    if (mix.truePeak > -1) out.push({ id: 'peak', kind: 'master', tracks: [], masterDb: -n(mix.truePeak + 3),
      text: say('Lower the master by {db} dB', { db: n(mix.truePeak + 3) }), why: say('The mix peaks at {peak} dBTP: there is no headroom left for mastering.', { peak: n(mix.truePeak) }) })
    else if (isFinite(mix.lufs) && mix.lufs < target - 8) out.push({ id: 'quiet-mix', kind: 'info', tracks: [],
      text: say('The mix is quiet ({lufs} LUFS)', { lufs: n(mix.lufs) }), why: say('That is fine while mixing: the loudness is set in Mastering.') })
  }
  return out
}

// ── measuring ──────────────────────────────────────────────────────────────

/** the share (0..1) of the energy below `f` Hz (a second-order low-pass) */
export function lowShare(x: Float32Array, sr: number, f = 140): number {
  const w0 = (2 * Math.PI * f) / sr, cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * 0.707)
  const a0 = 1 + alpha
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, eAll = 0, eLow = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = v; y2 = y1; y1 = y
    eAll += v * v; eLow += y * y
  }
  return eAll > 0 ? Math.min(1, eLow / eAll) : 0
}

export interface MixReport { stats: TrackStat[]; mix: MixInfo | null; seconds: number }

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** renders every track on its own and measures it, then sums them like the faders and measures the mix */
export async function measureMix(project: Project, progress: (text: string, pct: number) => void, say: Say): Promise<MixReport> {
  const end = projectEndBeat(project)
  if (end <= 0) throw new Error(say('The project is empty: there is nothing to measure yet.'))
  const to = Math.min(end, Math.max(8, project.bpm))                       // about the first minute
  const tracks = project.tracks.filter((t) => t.type !== 'group' && !t.muted && t.clips.length)
  const stats: TrackStat[] = []
  const bufs: Array<{ t: Track; data: Float32Array[]; sr: number }> = []
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    progress(say('Measuring {name}…', { name: t.name }), Math.round((i / (tracks.length + 1)) * 100))
    await tick()
    try {
      const buf = t.clips.some((c) => c.audioFile) ? await renderClips(project, t.clips.filter((c) => c.audioFile), 0, to) : await renderMidiGuide(project, t, 0, to)
      const data = [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))]
      const a = analyze(data, buf.sampleRate)
      stats.push({ id: t.id, name: t.name, role: roleOf(t), lufs: a.integrated, low: lowShare(data[0], buf.sampleRate), volume: t.volume, pan: t.pan ?? 0 })
      bufs.push({ t, data, sr: buf.sampleRate })
    } catch (e) { console.warn('[mix assistant]', t.name, e) }
  }
  progress(say('Measuring the whole mix…'), Math.round((tracks.length / (tracks.length + 1)) * 100))
  await tick()
  let mix: MixInfo | null = null
  if (bufs.length) {
    const sr = bufs[0].sr, len = Math.max(...bufs.map((b) => b.data[0].length))
    const L = new Float32Array(len), R = new Float32Array(len)
    const master = useAudioStore.getState().masterVolume
    for (const { t, data } of bufs) {
      const p = Math.max(-1, Math.min(1, t.pan ?? 0)), gl = Math.cos(((p + 1) * Math.PI) / 4) * t.volume * master, gr = Math.sin(((p + 1) * Math.PI) / 4) * t.volume * master
      const l = data[0], r = data[1]
      for (let i = 0; i < l.length; i++) { L[i] += l[i] * gl * Math.SQRT2; R[i] += r[i] * gr * Math.SQRT2 }
    }
    const a = analyze([L, R], sr)
    mix = { lufs: a.integrated, truePeak: a.truePeak }
  }
  return { stats, mix, seconds: beatToSec(project, to) }
}

// ── taking a suggestion ────────────────────────────────────────────────────────

/** changes the faders by the given dB; when one would go above 0 dB (the fader's end), everything is moved down so
 *  that the balance stays */
export function applyDeltas(deltas: Record<string, number>): void {
  const st = useProjectStore.getState()
  const vols = new Map(st.project.tracks.filter((t) => t.type !== 'group').map((t) => [t.id, t.volume]))
  for (const [id, d] of Object.entries(deltas)) if (vols.has(id)) vols.set(id, vols.get(id)! * Math.pow(10, d / 20))
  const max = Math.max(...vols.values(), 0)
  const k = max > 1 ? 1 / max : 1
  for (const [id, v] of vols) {
    const nv = Math.round(Math.min(1, v * k) * 1000) / 1000
    const old = st.project.tracks.find((t) => t.id === id)?.volume
    if (old !== undefined && Math.abs(old - nv) > 0.0005) useProjectStore.getState().updateTrack(id, { volume: nv })
  }
}

export function applySuggestion(s: MixSuggestion): void {
  const st = useProjectStore.getState()
  if (s.deltas) applyDeltas(s.deltas)
  if (s.pans) for (const [id, p] of Object.entries(s.pans)) st.updateTrack(id, { pan: p })
  if (s.eq) {
    const t = st.project.tracks.find((x) => x.id === s.eq!.track)
    if (t) st.updateTrack(t.id, { fx: [...(t.fx ?? []), { id: nanoid(), type: 'eq', on: true, p: { ...insertDefaults('eq'), low: s.eq.lowDb } }] })
  }
  if (s.masterDb !== undefined) {
    const a = useAudioStore.getState()
    a.setMasterVolume(Math.max(0.05, Math.min(1, a.masterVolume * Math.pow(10, s.masterDb / 20))))
  }
}
