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
  setMode: (m: MatchMode) => void
  propose: (trackId: string, clipId: string, path: string, name: string, firstAudio?: boolean, force?: boolean) => Promise<void>
  next: () => void
}

let counter = 0

export const useBeatMatch = create<State>((set, get) => ({
  mode: loadMode(),
  queue: [],
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
      const r = await api.samples.analyze(path)
      if (!r.bpm) { update({ status: 'none', message: r.note ?? 'No steady beat found.' }); return }
      update({ status: 'ready', bpm: r.bpm, firstBeat: r.first_beat ?? 0 })
      // automatic mode: the first audio sets the project tempo, later audio is stretched to it
      if (mode === 'auto' && !force) {
        const cur = get().queue.find((q) => q.id === id)
        if (cur) {
          if (firstAudio) matchProject(cur, r.bpm, (r.first_beat ?? 0) > 0.02)
          else matchClip(cur, r.bpm, (r.first_beat ?? 0) > 0.02)
          set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
        }
      }
    } catch (e) {
      update({ status: 'error', message: (e as Error).message })
    }
  }
}))

function clipOf(p: Proposal): { trackId: string; clip: NonNullable<ReturnType<typeof findClip>> } | null {
  const clip = findClip(p.trackId, p.clipId)
  return clip ? { trackId: p.trackId, clip } : null
}

function findClip(trackId: string, clipId: string) {
  return useProjectStore.getState().project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
}

// leading silence or intro before the first beat is cut off (non-destructive: the left edge can be pulled back)
function trimToFirstBeat(clip: NonNullable<ReturnType<typeof findClip>>, firstBeat: number, secPerBeat: number): { offset: number; seconds: number } {
  const offset = clip.offset ?? 0
  const seconds = clip.duration * secPerBeat
  const lead = Math.max(0, firstBeat - offset)
  if (lead > 0.005 && lead < seconds - 0.5) return { offset: offset + lead, seconds: seconds - lead }
  return { offset, seconds }
}

/** Stretch the clip to the project tempo (it keeps its own tempo as `warpBpm`). */
export function matchClip(p: Proposal, bpm: number, alignFirstBeat: boolean): boolean {
  const found = clipOf(p)
  if (!found || !(bpm > 20)) return false
  const { clip } = found
  const st = useProjectStore.getState()
  const projectBpm = st.project.bpm
  let { offset, seconds } = { offset: clip.offset ?? 0, seconds: clip.duration * sourceSecPerBeat(clip.warpBpm, projectBpm) }
  let startTime = clip.startTime
  if (alignFirstBeat && p.firstBeat !== undefined) {
    ;({ offset, seconds } = trimToFirstBeat(clip, p.firstBeat, sourceSecPerBeat(clip.warpBpm, projectBpm)))
    startTime = Math.round(startTime)                  // the first beat lands on a beat of the grid
  }
  st.updateClip(found.trackId, clip.id, { warpBpm: bpm, offset, startTime, duration: (seconds * bpm) / 60 })
  return true
}

/** Set the project tempo to the audio's tempo; the audio itself stays as it is. */
export function matchProject(p: Proposal, bpm: number, alignFirstBeat: boolean): boolean {
  const found = clipOf(p)
  if (!found || !(bpm >= 20 && bpm <= 300)) return false
  const st = useProjectStore.getState()
  const rounded = Math.round(bpm * 10) / 10
  useAudioStore.setState({ bpm: rounded })
  st.setBpm(rounded)                                   // other unsynced audio keeps its place in time
  const clip = findClip(found.trackId, found.clip.id)
  if (clip && alignFirstBeat && p.firstBeat !== undefined) {
    const spb = sourceSecPerBeat(clip.warpBpm, rounded)
    const { offset, seconds } = trimToFirstBeat(clip, p.firstBeat, spb)
    useProjectStore.getState().updateClip(found.trackId, clip.id, {
      offset, startTime: Math.round(clip.startTime), duration: seconds / spb
    })
  }
  return true
}
