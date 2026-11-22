import type { LibraryTrack } from './api'

// Search: words match title, style, model, stem name and tags; a number ("124") or a range ("120-130", "bpm 90")
// matches the tempo (±1 BPM for a single number).
// scope: 'all' (default), 'name' (title and song only) or 'tags' (tags only). Chosen tags (from the tag list) must
// all be on the track.
export type SearchScope = 'all' | 'name' | 'tags'
export function matchesQuery(t: LibraryTrack, query: string, scope: SearchScope = 'all', tags: string[] = []): boolean {
  if (tags.length) {
    const own = (t.tags ?? []).map((g) => g.toLowerCase())
    if (!tags.every((g) => own.includes(g.toLowerCase()))) return false
  }
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (scope === 'name') return q.split(/\s+/).every((w) => `${t.title} ${t.song ?? ''}`.toLowerCase().includes(w))
  if (scope === 'tags') return q.split(/\s+/).every((w) => (t.tags ?? []).some((g) => g.toLowerCase().includes(w)))
  const range = /^(?:bpm\s*)?(\d{2,3})(?:\s*-\s*(\d{2,3}))?(?:\s*bpm)?$/.exec(q)
  if (range) {
    if (!t.bpm) return false
    const lo = Number(range[1]); const hi = range[2] ? Number(range[2]) : null
    return hi === null ? Math.abs(t.bpm - lo) <= 1 : t.bpm >= Math.min(lo, hi) && t.bpm <= Math.max(lo, hi)
  }
  const hay = `${t.title} ${t.prompt} ${t.engine} ${t.stem ?? ''} ${t.song ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}

/** every tag of the tracks with how often it is used, most used first */
export function tagCounts(tracks: LibraryTrack[]): Array<[string, number]> {
  const m = new Map<string, [string, number]>()
  for (const t of tracks) for (const g of t.tags ?? []) {
    const k = g.toLowerCase(); const e = m.get(k)
    m.set(k, e ? [e[0], e[1] + 1] : [g, 1])
  }
  return [...m.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
