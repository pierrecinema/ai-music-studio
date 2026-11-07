// Quantization. For MIDI: notes move toward the grid (strength 100 % = exactly on it). For audio there are no
// notes to move, so the clip itself is snapped (its start, by the same strength).
import { useProjectStore } from '../stores/project.store'
import { useUIStore } from '../stores/ui.store'
import { GRID_OPTIONS, gridOf } from './grid'
import type { Clip, Note } from '../types'

export interface QuantizeOptions {
  grid: string          // id of a GRID_OPTIONS entry (never 'off')
  strength: number      // 0..1: how far toward the grid
  ends: boolean         // also quantize where notes end (they change length), otherwise only their starts
  swing: number         // 0..1: delays every second grid step (shuffle feel), 0 = straight
}

const KEY = 'ams-quantize'

export function loadOptions(): QuantizeOptions {
  const fallback: QuantizeOptions = { grid: '1/16', strength: 1, ends: false, swing: 0 }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<QuantizeOptions> | null
    if (!v) return fallback
    const grid = GRID_OPTIONS.some((g) => g.id === v.grid && g.beats > 0) ? (v.grid as string) : fallback.grid
    return { grid, strength: clamp(v.strength ?? 1), ends: !!v.ends, swing: clamp(v.swing ?? 0) }
  } catch { return fallback }
}

export function saveOptions(o: QuantizeOptions): void {
  try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* storage unavailable */ }
}

const clamp = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

// the nearest grid line (with swing: odd lines are pushed later by up to a third of a step)
export function toGrid(beat: number, step: number, swing: number): number {
  const n = Math.round(beat / step)
  return n * step + (n % 2 !== 0 ? swing * step / 3 : 0)
}

/** Pure function: quantized copies of notes. `only` limits it to some notes (the selection). */
export function quantizeNotes(notes: Note[], o: QuantizeOptions, only?: Set<string>): Note[] {
  const step = gridOf(o.grid).beats
  if (!(step > 0)) return notes
  return notes.map((n) => {
    if (only && !only.has(n.id)) return n
    const start = n.startTime + (toGrid(n.startTime, step, o.swing) - n.startTime) * o.strength
    let duration = n.duration
    if (o.ends) {
      const end = n.startTime + n.duration
      const qEnd = end + (toGrid(end, step, o.swing) - end) * o.strength
      duration = Math.max(step / 4, qEnd - start)
    }
    return { ...n, startTime: Math.max(0, start), duration }
  })
}

export interface QuantizeResult { done: boolean; what: string }

/** Quantize the selected clip (or the selected notes of it). */
export function quantizeSelection(o: QuantizeOptions = loadOptions()): QuantizeResult {
  const st = useProjectStore.getState()
  const owner = st.project.tracks.find((t) => t.clips.some((c) => c.id === st.selectedClipId))
  const clip: Clip | undefined = owner?.clips.find((c) => c.id === st.selectedClipId)
  if (!owner || !clip) return { done: false, what: 'Select a clip first.' }
  const step = gridOf(o.grid).beats
  if (clip.audioFile) {
    const q = clip.startTime + (toGrid(clip.startTime, step, 0) - clip.startTime) * o.strength
    st.updateClip(owner.id, clip.id, { startTime: Math.max(0, q) })
    return { done: true, what: 'The audio clip start was snapped to the grid. (Audio has no notes: its inner rhythm is not changed.)' }
  }
  const only = st.selectedNoteIds.length ? new Set(st.selectedNoteIds) : undefined
  const notes = quantizeNotes(clip.notes ?? [], o, only)
  st.updateClip(owner.id, clip.id, { notes })
  return { done: true, what: `${only ? only.size : notes.length} note(s) quantized to ${gridOf(o.grid).label}.` }
}

// the dialog is opened from shortcuts too
export const QUANTIZE_DIALOG_EVENT = 'ams:quantize-dialog'
export const openQuantizeDialog = (): void => { window.dispatchEvent(new CustomEvent(QUANTIZE_DIALOG_EVENT)) }

// handy default: start from the grid currently shown, if it is a real one
export function defaultGridId(): string {
  const g = useUIStore.getState().grid
  return gridOf(g).beats > 0 ? g : loadOptions().grid
}
