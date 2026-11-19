// Reading a project file: kept apart from io.ts (no stores, no audio) so the tests can use it.
import type { Project } from '../types'

const FORMAT = 'ams-project'
const VERSION = 1
interface ProjectFile { format: string; version: number; savedWith: string; project: Project }

export function parseProject(text: string): Project {
  const data = JSON.parse(text) as Partial<ProjectFile>
  if (data.format !== FORMAT || !data.project) throw new Error('This is not an AI Music Studio project file.')
  if ((data.version ?? 1) > VERSION) throw new Error('This project was saved by a newer version of the app. Please update first.')
  const p = data.project
  // be forgiving with missing fields so that old or hand-edited files still open
  return {
    ...p,                                // everything else (markers, loop, tempo and signature changes, returns, master effects, …)
    id: p.id ?? crypto.randomUUID(),
    name: p.name ?? 'Untitled Project',
    bpm: p.bpm || 120,
    timeSignature: p.timeSignature ?? [4, 4],
    sampleRate: p.sampleRate || 44100,
    tracks: (p.tracks ?? []).map((t) => ({ ...t, clips: t.clips ?? [], volume: t.volume ?? 0.8, pan: t.pan ?? 0, muted: !!t.muted, soloed: !!t.soloed })),
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString()
  }
}
