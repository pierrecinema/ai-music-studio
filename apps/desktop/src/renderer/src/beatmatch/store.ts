// Beat matching: when audio lands on the timeline, measure its tempo and first beat and offer to bring it
// in time with the project (stretch the audio to the project tempo, or set the project tempo to the audio).
import { create } from 'zustand'
import { api } from '../lib/api'
import { sourceSecPerBeat } from '../audio/engine'
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'

export type MatchMode = 'ask' | 'auto' | 'off'
const MODE_KEY = 'ams-beatmatch-mode'

export interface Proposal {
  id: string
  trackId: string
  clipId: string
  path: string
  name: string
  firstAudio: boolean          // the project had no audio before this one
  status: 'analyzing' | 'ready' | 'none' | 'error'
  bpm?: number                 // measured (the user may correct it on the card)
  firstBeat?: number           // seconds from the start of the file
  downbeat?: number            // seconds: beat 1 of a bar (the first one), when measured
  message?: string
}

function loadMode(): MatchMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'auto' || v === 'off' ? v : 'ask'
  } catch { return 'ask' }
}

interface State {
  mode: MatchMode
  queue: Proposal[]
  notice: string | null          // the last result of Sync all / SYNC / MASTER, shown in the timeline bar
  setNotice: (m: string | null) => void
  setMode: (m: MatchMode) => void
  propose: (trackId: string, clipId: string, path: string, name: string, firstAudio?: boolean, force?: boolean) => Promise<void>
  next: () => void
}

let counter = 0

// one measurement per file: the same loop on several tracks, or "Sync all" run twice, must not analyse again
const analysisCache = new Map<string, Awaited<ReturnType<typeof api.samples.analyze>>>()

async function measure(path: string): Promise<Awaited<ReturnType<typeof api.samples.analyze>>> {
  const hit = analysisCache.get(path)
  if (hit) return hit
  const r = await api.samples.analyze(path)
  analysisCache.set(path, r)
  return r
}

/** Remember what is already known about a file (the library measured it when the track was saved). */
export function seedAnalysis(path: string, known: { bpm?: number | null; first_beat?: number | null; loop_bars?: number | null }): void {
  // only loops: their tempo is exact and they start on beat 1. Songs saved before 0.18.5 were measured with the
  // older, less exact analysis (no downbeat): they are measured again when they are synced.
  if (known.bpm && known.loop_bars) analysisCache.set(path, { bpm: known.bpm, first_beat: known.first_beat ?? 0, downbeat: 0, duration: null })
}

export const useBeatMatch = create<State>((set, get) => ({
  mode: loadMode(),
  queue: [],
  notice: null,
  setNotice: (notice) => set({ notice }),
  setMode: (mode) => {
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* storage unavailable */ }
    set({ mode })
  },
  next: () => set((s) => ({ queue: s.queue.slice(1) })),

  propose: async (trackId, clipId, path, name, firstAudio = false, force = false) => {
    const mode = get().mode
    if (mode === 'off' && !force) return
    const id = `bm${++counter}`
    const p: Proposal = { id, trackId, clipId, path, name, firstAudio, status: 'analyzing' }
    const update = (patch: Partial<Proposal>): void =>
      set((s) => ({ queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)) }))
    set((s) => ({ queue: [...s.queue, p] }))
    try {
      const r = await measure(path)
      if (!r.bpm) { update({ status: 'none', message: r.note ?? 'No steady beat found.' }); return }
      update({ status: 'ready', bpm: r.bpm, firstBeat: r.first_beat ?? 0, downbeat: r.downbeat ?? undefined })
      // automatic mode: every new audio is stretched to the master BPM; the master tempo itself is never changed
      if (mode === 'auto' && !force) {
        const cur = get().queue.find((q) => q.id === id)
        if (cur) {
          matchClip(cur, r.bpm, true)
          set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
        }
      }
    } catch (e) {
      update({ status: 'error', message: (e as Error).message })
    }
  }
}))

type ClipT = NonNullable<ReturnType<typeof findClip>>

function clipOf(p: Proposal): { trackId: string; clip: ClipT } | null {
  const clip = findClip(p.trackId, p.clipId)
  return clip ? { trackId: p.trackId, clip } : null
}

function findClip(trackId: string, clipId: string) {
  return useProjectStore.getState().project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
}

/**
 * Phase sync (like the SYNC of a DJ program): move the clip so that ITS beats fall on the beats of the project.
 * The beat grid of a synced clip is gridFirst + k * (60 / bpm) seconds of the file, and one such beat is one project
 * beat. The first beat that is still inside the clip is moved to the nearest project beat. The clip is shifted
 * (so the intro before the first beat stays); only if that would push it before the start of the timeline,
 * the part that does not fit is cut off (non-destructive: the left edge can be pulled back).
 */
export function phaseAlign(c: { startTime: number; duration: number; offset?: number }, gridFirst: number, bpm: number, downbeat?: number, barBeats = 4): { startTime: number; duration: number; offset: number } {
  const offset = c.offset ?? 0
  const secPerBeat = 60 / bpm
  let first: number, target: number
  if (downbeat !== undefined && downbeat >= 0 && barBeats > 0) {
    // the bar: beat 1 of the audio on beat 1 of a project bar (like a DJ program's bar sync), not just any beat
    const secPerBar = secPerBeat * barBeats
    const k = Math.max(0, Math.ceil((offset - downbeat) / secPerBar - 1e-6))
    first = c.startTime + (downbeat + k * secPerBar - offset) / secPerBeat
    target = Math.round(first / barBeats) * barBeats
  } else {
    // the first beat of the grid that is not before the left edge of the clip
    const k = Math.max(0, Math.ceil((offset - gridFirst) / secPerBeat - 1e-6))
    first = c.startTime + (gridFirst + k * secPerBeat - offset) / secPerBeat          // in project beats
    target = Math.round(first)
  }
  const delta = target - first
  const newStart = Math.max(0, c.startTime + delta)
  const cut = newStart - (c.startTime + delta)                                           // beats that do not fit before zero
  return {
    startTime: newStart,
    duration: Math.max(0.25, c.duration - cut),
    offset: offset + cut * secPerBeat
  }
}

/** Stretch the clip to the project tempo (it keeps its own tempo as `warpBpm`) and, if asked, align its beats. */
export function matchClip(p: Proposal, bpm: number, align: boolean): boolean {
  const found = clipOf(p)
  if (!found || !(bpm > 20)) return false
  const { clip } = found
  const st = useProjectStore.getState()
  const projectBpm = st.project.bpm
  const seconds = clip.duration * sourceSecPerBeat(clip.warpBpm, projectBpm)             // seconds of the file inside the clip
  const gridFirst = p.firstBeat ?? clip.gridFirst
  let patch: Partial<ClipT> = { warpBpm: bpm, gridFirst, startTime: clip.startTime, offset: clip.offset ?? 0, duration: (seconds * bpm) / 60 }
  if (align && gridFirst !== undefined) {
    patch = { ...patch, ...phaseAlign({ startTime: clip.startTime, duration: (seconds * bpm) / 60, offset: clip.offset }, gridFirst, bpm, p.downbeat, st.project.timeSignature?.[0] ?? 4) }
  }
  st.updateClip(found.trackId, clip.id, patch)
  return true
}

/** Set the project tempo to the audio's tempo (MASTER); the audio keeps its sound and joins the grid. */
export function matchProject(p: Proposal, bpm: number, align: boolean): boolean {
  const found = clipOf(p)
  if (!found || !(bpm >= 20 && bpm <= 300)) return false
  const st = useProjectStore.getState()
  const rounded = Math.round(bpm * 10) / 10
  useAudioStore.setState({ bpm: rounded })
  st.setBpm(rounded)                                   // other unsynced audio keeps its place in time; synced audio follows
  const clip = findClip(found.trackId, found.clip.id)
  if (!clip) return true
  const gridFirst = p.firstBeat ?? clip.gridFirst
  const seconds = clip.duration * sourceSecPerBeat(clip.warpBpm, rounded)
  let patch: Partial<ClipT> = { warpBpm: rounded, gridFirst, duration: (seconds * rounded) / 60 }
  if (align && gridFirst !== undefined) {
    patch = { ...patch, ...phaseAlign({ startTime: clip.startTime, duration: (seconds * rounded) / 60, offset: clip.offset }, gridFirst, rounded, p.downbeat, useProjectStore.getState().project.timeSignature?.[0] ?? 4) }
  }
  useProjectStore.getState().updateClip(found.trackId, clip.id, patch)
  return true
}

/** Correct the tempo of a clip by hand (for example 128 instead of 127.6): the clip is stretched again. */
export function retune(trackId: string, clipId: string, bpm: number): boolean {
  const clip = findClip(trackId, clipId)
  if (!clip || !(bpm >= 40 && bpm <= 300)) return false
  const projectBpm = useProjectStore.getState().project.bpm
  const seconds = clip.duration * sourceSecPerBeat(clip.warpBpm, projectBpm)
  useProjectStore.getState().updateClip(trackId, clipId, { warpBpm: bpm, duration: (seconds * bpm) / 60 })
  return true
}

function proposalFor(trackId: string, clipId: string, r: { bpm: number | null; first_beat?: number | null; downbeat?: number | null }): Proposal | null {
  const clip = findClip(trackId, clipId)
  if (!clip?.audioFile || !r.bpm) return null
  return { id: `one${clipId}`, trackId, clipId, path: clip.audioFile, name: clip.name ?? 'Audio', firstAudio: false, status: 'ready', bpm: r.bpm, firstBeat: r.first_beat ?? 0, downbeat: (r as { downbeat?: number | null }).downbeat ?? undefined }
}

/** SYNC of one clip: measure (once), stretch to the master BPM, put its beats on the project beats. */
export async function syncOne(trackId: string, clipId: string): Promise<string> {
  const clip = findClip(trackId, clipId)
  if (!clip?.audioFile) return 'This is not an audio clip.'
  try {
    const r = await measure(clip.audioFile)
    const p = proposalFor(trackId, clipId, r)
    if (!p) return `${clip.name ?? 'This clip'} has no steady beat (a one-shot or a free rhythm): it cannot be synced.`
    matchClip(p, p.bpm!, true)
    return `${clip.name ?? 'Clip'}: ${p.bpm} BPM synced to ${useProjectStore.getState().project.bpm} BPM, beats on the grid.${r.steady === false ? ` Note: ${unsteadyNote}` : ''}`
  } catch (e) { return `Could not measure the tempo: ${(e as Error).message}` }
}

/** MASTER of one clip: the project takes the tempo of this clip. */
export async function makeMaster(trackId: string, clipId: string): Promise<string> {
  const clip = findClip(trackId, clipId)
  if (!clip?.audioFile) return 'This is not an audio clip.'
  try {
    const known = clip.warpBpm && clip.gridFirst !== undefined ? { bpm: clip.warpBpm, first_beat: clip.gridFirst } : await measure(clip.audioFile)
    const p = proposalFor(trackId, clipId, known)
    if (!p) return `${clip.name ?? 'This clip'} has no steady beat: it cannot be the master.`
    matchProject(p, p.bpm!, true)
    return `Master tempo is now ${useProjectStore.getState().project.bpm} BPM (from ${clip.name ?? 'the clip'}). Synced clips follow.`
  } catch (e) { return `Could not measure the tempo: ${(e as Error).message}` }
}

/**
 * Where beat 1 of a synced clip is: project beats from the clip's left edge to the first downbeat that is inside
 * the clip. A synced clip plays one beat of the file per project beat, so the file's bar is one project bar.
 */
export function leadBeats(c: { offset?: number }, bpm: number, downbeat: number, barBeats = 4): number {
  const secPerBeat = 60 / bpm
  const secPerBar = secPerBeat * barBeats
  const offset = c.offset ?? 0
  const k = Math.max(0, Math.ceil((offset - downbeat) / secPerBar - 1e-6))
  return (downbeat + k * secPerBar - offset) / secPerBeat
}

/**
 * Start several synced clips together: beat 1 of every clip on the same bar line. The bar is the one nearest to the
 * earliest clip; if a clip's intro (before its beat 1) does not fit before that bar, all move to a later bar, so no
 * intro is cut off. Returns the new start (project beats) of every clip and the bar line (beats) they share.
 */
export function alignStarts(clips: Array<{ id: string; startTime: number; lead: number }>, barBeats = 4): { bar: number; starts: Record<string, number> } {
  if (!clips.length) return { bar: 0, starts: {} }
  const earliest = Math.min(...clips.map((c) => c.startTime + c.lead))
  let bar = Math.max(0, Math.round(earliest / barBeats) * barBeats)
  const need = Math.max(...clips.map((c) => c.lead))
  if (bar < need) bar = Math.ceil(need / barBeats - 1e-6) * barBeats
  return { bar, starts: Object.fromEntries(clips.map((c) => [c.id, Math.max(0, bar - c.lead)])) }
}

export interface SyncSelectedResult { synced: number; skipped: string[]; bar: number; unsteady: string[] }

/**
 * Sync the selected clips together (songs, loops, stems): measure each one (once), stretch it to the master BPM and
 * put beat 1 of every clip on the same bar, so they all start together and stay in time.
 */
export async function syncSelected(clipIds: string[], onProgress?: (done: number, total: number, name: string) => void): Promise<SyncSelectedResult> {
  const project = useProjectStore.getState().project
  const targets = project.tracks.flatMap((t) => t.clips.filter((c) => clipIds.includes(c.id) && c.audioFile).map((c) => ({ trackId: t.id, clipId: c.id, name: c.name ?? t.name })))
  const skipped: string[] = []
  const ready: Array<{ trackId: string; clipId: string; downbeat: number; bpm: number }> = []
  const unsteady: string[] = []
  for (const [i, t] of targets.entries()) {
    onProgress?.(i, targets.length, t.name)
    const clip = findClip(t.trackId, t.clipId)
    if (!clip?.audioFile) continue
    try {
      const r = await measure(clip.audioFile)
      const p = proposalFor(t.trackId, t.clipId, r)
      if (!p) { skipped.push(`${t.name}: no steady beat (one-shot or free rhythm)`); continue }
      if (!matchClip(p, p.bpm!, false)) continue                      // stretch only; the start is set below for all
      ready.push({ trackId: t.trackId, clipId: t.clipId, bpm: p.bpm!, downbeat: p.downbeat ?? p.firstBeat ?? 0 })
      if (r.steady === false) unsteady.push(t.name)
    } catch (e) {
      skipped.push(`${t.name}: ${(e as Error).message}`)
    }
  }
  onProgress?.(targets.length, targets.length, '')
  const st = useProjectStore.getState()
  const barBeats = st.project.timeSignature?.[0] ?? 4
  const placed = ready.flatMap((r) => {
    const clip = findClip(r.trackId, r.clipId)
    return clip ? [{ ...r, id: r.clipId, startTime: clip.startTime, lead: leadBeats(clip, r.bpm, r.downbeat, barBeats) }] : []
  })
  const { bar, starts } = alignStarts(placed, barBeats)
  for (const c of placed) st.updateClip(c.trackId, c.clipId, { startTime: starts[c.id] })
  return { synced: placed.length, skipped, bar, unsteady }
}

let syncingSel = false

/** Runs syncSelected and reports progress and result through `notice`. */
export async function runSyncSelected(clipIds: string[]): Promise<void> {
  if (syncingSel) return
  syncingSel = true
  const { setNotice } = useBeatMatch.getState()
  try {
    const r = await syncSelected(clipIds, (d, n, name) => setNotice(d < n ? `Syncing ${d + 1} of ${n}: ${name}…` : null))
    const st = useProjectStore.getState().project
    const barBeats = st.timeSignature?.[0] ?? 4
    setNotice(r.synced
      ? `${r.synced} clip(s) synced to ${st.bpm} BPM, all start together on bar ${Math.round(r.bar / barBeats) + 1}${r.skipped.length ? `. Skipped: ${r.skipped.join('; ')}` : '.'}${r.unsteady.length ? ` Check by ear: ${r.unsteady.join(', ')} – ${unsteadyNote}` : ''}`
      : `Nothing was synced${r.skipped.length ? `: ${r.skipped.join('; ')}` : ' (select audio clips first).'}`)
  } finally {
    syncingSel = false
  }
}

/** The selected audio clips, when there are at least two: AUTO SYNC and Sync all then work on them together. */
export function selectedAudioIds(): string[] {
  const st = useProjectStore.getState()
  const ids = new Set(st.selectedClipIds)
  return st.project.tracks.flatMap((t) => t.clips.filter((c) => ids.has(c.id) && c.audioFile).map((c) => c.id))
}

export interface SyncAllResult { synced: number; already: number; skipped: string[]; unsteady: string[] }

const unsteadyNote = 'its tempo is not steady (live playing?), so one grid cannot follow it everywhere: check by ear, warp markers can pin beats that drift.'

/** "Sync all": measure every audio clip that is not synced yet and bring it to the master BPM, beats on the grid. */
export async function syncAll(onProgress?: (done: number, total: number, name: string) => void): Promise<SyncAllResult> {
  const project = useProjectStore.getState().project
  const targets: Array<{ trackId: string; clipId: string; name: string }> = []
  let already = 0
  for (const t of project.tracks) {
    for (const c of t.clips) {
      if (!c.audioFile) continue
      if (c.warpBpm && c.gridFirst !== undefined) { already++; continue }
      targets.push({ trackId: t.id, clipId: c.id, name: c.name ?? t.name })
    }
  }
  const skipped: string[] = []
  const unsteady: string[] = []
  let synced = 0
  for (const [i, t] of targets.entries()) {
    onProgress?.(i, targets.length, t.name)
    const clip = findClip(t.trackId, t.clipId)
    if (!clip?.audioFile) continue
    try {
      const r = await measure(clip.audioFile)
      const p = proposalFor(t.trackId, t.clipId, r)
      if (!p) { skipped.push(`${t.name}: no steady beat (one-shot or free rhythm)`); continue }
      if (matchClip(p, p.bpm!, true)) { synced++; if (r.steady === false) unsteady.push(t.name) }
    } catch (e) {
      skipped.push(`${t.name}: ${(e as Error).message}`)
    }
  }
  onProgress?.(targets.length, targets.length, '')
  return { synced, already, skipped, unsteady }
}

let syncing = false

/** Runs Sync all and reports progress and result through `notice`. */
export async function runSyncAll(): Promise<void> {
  if (syncing) return
  syncing = true
  const { setNotice } = useBeatMatch.getState()
  try {
    const r = await syncAll((d, n, name) => setNotice(d < n ? `Syncing ${d + 1} of ${n}: ${name}…` : null))
    const bpm = useProjectStore.getState().project.bpm
    setNotice(`Synced ${r.synced} clip(s) to ${bpm} BPM${r.already ? `, ${r.already} already synced` : ''}${r.skipped.length ? `. Skipped: ${r.skipped.join('; ')}` : '.'}${r.unsteady.length ? ` Check by ear: ${r.unsteady.join(', ')} – ${unsteadyNote}` : ''}`)
  } finally {
    syncing = false
  }
}
