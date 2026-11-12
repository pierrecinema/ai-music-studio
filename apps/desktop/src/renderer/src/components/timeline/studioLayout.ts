// Sizes of the Studio and a small helper for mouse drags.
import type { AutoParam, Project, TakeLane, Track } from '../../types'

export const TRACK_HEIGHT = 72       // default; every track can be made higher or lower by dragging its lower edge
export const TRACK_MIN_HEIGHT = 36
export const TRACK_MAX_HEIGHT = 320
export const trackHeight = (t: { height?: number }): number =>
  Math.max(TRACK_MIN_HEIGHT, Math.min(TRACK_MAX_HEIGHT, t.height ?? TRACK_HEIGHT))
export const AUTO_HEIGHT = 64
export const AUTO_MIN_HEIGHT = 26     // a minimized automation lane: only its name and the curve
export const FX_HEIGHT = 40
export const TAKE_HEIGHT = 44
export const RETURN_HEIGHT = 56
export const HEADER_WIDTH = 230
export const MARKER_H = 18          // marker lane (top of the ruler)
export const LOOP_H = 12            // loop brace strip
export const NUM_H = 22             // bar numbers
export const RULER_HEIGHT = MARKER_H + LOOP_H + NUM_H
export const TEMPO_HEIGHT = 46
export const BEAT_WIDTH = 80
export const HANDLE = 6

export type Row =
  | { kind: 'track'; track: Track; depth: number }
  | { kind: 'auto'; track: Track; param: AutoParam; min: boolean }
  | { kind: 'fx'; track: Track }
  | { kind: 'take'; track: Track; lane: TakeLane }

export function rowHeight(r: Row): number {
  return r.kind === 'track' ? trackHeight(r.track) : r.kind === 'auto' ? (r.min ? AUTO_MIN_HEIGHT : AUTO_HEIGHT) : r.kind === 'fx' ? FX_HEIGHT : TAKE_HEIGHT
}

// the rows of the Studio from top to bottom: tracks (children of a closed group are hidden), their
// automation lane and their take lanes
export function buildRows(p: Project): Row[] {
  const rows: Row[] = []
  const byId = new Map(p.tracks.map((t) => [t.id, t]))
  for (const t of p.tracks) {
    const parent = t.parentId ? byId.get(t.parentId) : undefined
    if (parent?.collapsed) continue
    rows.push({ kind: 'track', track: t, depth: parent ? 1 : 0 })
    if (t.showFx) rows.push({ kind: 'fx', track: t })
    for (const param of openLanes(t)) rows.push({ kind: 'auto', track: t, param, min: (t.autoMin ?? []).includes(param) })
    if (t.showTakes) for (const lane of t.takes ?? []) rows.push({ kind: 'take', track: t, lane })
  }
  return rows
}

export function rowTops(rows: Row[]): number[] {
  const tops: number[] = []
  let y = 0
  for (const r of rows) { tops.push(y); y += rowHeight(r) }
  tops.push(y)
  return tops
}

// follow the mouse until the button is released
export function trackPointer(onMove: (e: PointerEvent) => void, onUp?: (e: PointerEvent) => void): void {
  const move = (e: PointerEvent): void => onMove(e)
  const up = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    onUp?.(e)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** The automation lanes open below a track (older projects stored a single one in showAutomation). */
export function openLanes(t: Track): AutoParam[] {
  return t.autoLanes ?? (t.showAutomation ? [t.showAutomation] : [])
}

/** Show the automation of a track: volume and pan in their own lanes (or hide all of them). */
export function toggleAutomationLanes(t: Track): Partial<Track> {
  return openLanes(t).length ? { autoLanes: [], showAutomation: null } : { autoLanes: ['volume', 'pan'], showAutomation: null }
}
