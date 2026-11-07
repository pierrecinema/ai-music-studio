// The grid: how far things jump when moved, trimmed or drawn, and how notes are quantized.
// Like in Ableton Live: a grid size, a switch for snapping, and Alt while dragging for a free (stepless) move.
import { useUIStore } from '../stores/ui.store'

export interface GridOption { id: string; label: string; beats: number }

// beats are quarter notes: a bar in 4/4 is 4 beats
export const GRID_OPTIONS: GridOption[] = [
  { id: 'off', label: 'Off (free)', beats: 0 },
  { id: '1/1', label: '1 bar', beats: 4 },
  { id: '1/2', label: '1/2 note', beats: 2 },
  { id: '1/4', label: '1/4 (beat)', beats: 1 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '1/8T', label: '1/8 triplet', beats: 1 / 3 },
  { id: '1/16', label: '1/16', beats: 0.25 },
  { id: '1/16T', label: '1/16 triplet', beats: 1 / 6 },
  { id: '1/32', label: '1/32', beats: 0.125 },
  { id: '1/64', label: '1/64', beats: 0.0625 },
]

export const gridOf = (id: string): GridOption => GRID_OPTIONS.find((g) => g.id === id) ?? GRID_OPTIONS[6]

/** The current step in beats, or 0 when snapping is switched off. */
export function snapStep(): number {
  const { grid, snap } = useUIStore.getState()
  return snap ? gridOf(grid).beats : 0
}

/** Snap a position (in beats) to the grid. `free` (Alt held) skips snapping: the move is stepless. */
export function snapBeat(beat: number, free = false, mode: 'round' | 'floor' = 'round'): number {
  const step = free ? 0 : snapStep()
  if (!step) return beat
  const n = beat / step
  return (mode === 'floor' ? Math.floor(n + 1e-6) : Math.round(n)) * step
}

/** The smallest sensible length for a clip or note: one grid step, or 1/64 when free. */
export function minLength(): number {
  return snapStep() || 0.0625
}

/** One step for keyboard nudging: the grid step, or a fine step (1/64 beat) when snapping is off. */
export function nudgeStep(): number {
  return snapStep() || 0.0625
}

// stepping with the keys goes through the straight sizes only; triplets have their own switch
const STRAIGHT = GRID_OPTIONS.filter((g) => g.beats > 0 && !g.id.endsWith('T'))
const straightOf = (id: string): string => (id.endsWith('T') ? id.slice(0, -1) : id)

export function narrowerGrid(id: string): string {
  const i = STRAIGHT.findIndex((g) => g.id === straightOf(id))
  return STRAIGHT[Math.min(STRAIGHT.length - 1, Math.max(0, i + 1))].id
}

export function widerGrid(id: string): string {
  const i = STRAIGHT.findIndex((g) => g.id === straightOf(id))
  return STRAIGHT[Math.max(0, i - 1)].id
}

/** Straight <-> triplet of the same size, where a triplet exists (1/8 and 1/16). */
export function tripletToggle(id: string): string {
  const other = id.endsWith('T') ? id.slice(0, -1) : `${id}T`
  return GRID_OPTIONS.some((g) => g.id === other) ? other : id
}
