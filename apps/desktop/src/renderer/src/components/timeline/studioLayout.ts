// Sizes of the Studio and a small helper for mouse drags.
import type { AutoParam, Project, TakeLane, Track } from '../../types'

export const TRACK_HEIGHT = 72
export const AUTO_HEIGHT = 64
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
  | { kind: 'auto'; track: Track; param: AutoParam }
  | { kind: 'take'; track: Track; lane: TakeLane }

export function rowHeight(r: Row): number {
  return r.kind === 'track' ? TRACK_HEIGHT : r.kind === 'auto' ? AUTO_HEIGHT : TAKE_HEIGHT
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
    if (t.showAutomation) rows.push({ kind: 'auto', track: t, param: t.showAutomation })
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
