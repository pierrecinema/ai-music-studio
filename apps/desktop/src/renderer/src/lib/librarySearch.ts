import type { LibraryTrack } from './api'

// Search: words match title, style, model, stem name and tags; a number ("124") or a range ("120-130", "bpm 90")
// matches the tempo (±1 BPM for a single number).
export function matchesQuery(t: LibraryTrack, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const range = /^(?:bpm\s*)?(\d{2,3})(?:\s*-\s*(\d{2,3}))?(?:\s*bpm)?$/.exec(q)
  if (range) {
    if (!t.bpm) return false
    const lo = Number(range[1]); const hi = range[2] ? Number(range[2]) : null
    return hi === null ? Math.abs(t.bpm - lo) <= 1 : t.bpm >= Math.min(lo, hi) && t.bpm <= Math.max(lo, hi)
  }
  const hay = `${t.title} ${t.prompt} ${t.engine} ${t.stem ?? ''} ${t.song ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}
