// Saving, opening and autosaving projects (.ams = JSON), recent projects, and the window title.
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'
import { resetHistory } from '../shortcuts/history'
import { stop } from '../audio/engine'
import type { Project } from '../types'

const FORMAT = 'ams-project'
const VERSION = 1
const RECENT_KEY = 'ams-recent-projects'

interface ProjectFile { format: string; version: number; savedWith: string; project: Project }

export interface OpenResult { ok: boolean; message?: string; missing?: string[] }

// ── recent projects ──────────────────────────────────────────────────────────

export function recentProjects(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : []
  } catch { return [] }
}

function remember(path: string): void {
  try {
    const list = [path, ...recentProjects().filter((p) => p !== path)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch { /* storage unavailable */ }
}

// ── (de)serialising ──────────────────────────────────────────────────────────

export function serialize(project: Project): string {
  const file: ProjectFile = { format: FORMAT, version: VERSION, savedWith: __APP_VERSION__, project }
  return JSON.stringify(file, null, 1)
}

export function parseProject(text: string): Project {
  const data = JSON.parse(text) as Partial<ProjectFile>
  if (data.format !== FORMAT || !data.project) throw new Error('This is not an AI Music Studio project file.')
  if ((data.version ?? 1) > VERSION) throw new Error('This project was saved by a newer version of the app. Please update first.')
  const p = data.project
  // be forgiving with missing fields so that old or hand-edited files still open
  return {
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

export async function missingFiles(project: Project): Promise<string[]> {
  const files = [...new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.audioFile).filter((f): f is string => !!f)))]
  if (!files.length) return []
  const exists = await window.api.files.exists(files)
  return files.filter((_, i) => !exists[i])
}

// ── commands ─────────────────────────────────────────────────────────────────

function fileNameOf(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.ams$/i, '')
}

async function writeTo(path: string): Promise<void> {
  const store = useProjectStore.getState()
  const project = { ...store.project, name: store.project.name === 'Untitled Project' ? fileNameOf(path) : store.project.name }
  await window.api.project.write(path, serialize(project))
  useProjectStore.getState().markSaved(project, path)
  remember(path)
  void window.api.project.autosaveClear()
}

export async function saveProject(): Promise<boolean> {
  const { filePath, project } = useProjectStore.getState()
  if (filePath) {
    await writeTo(filePath)
    return true
  }
  return saveProjectAs(project.name)
}

export async function saveProjectAs(suggested?: string): Promise<boolean> {
  const name = (suggested ?? useProjectStore.getState().project.name).replace(/[\\/:*?"<>|]+/g, '_')
  const path = await window.api.project.saveDialog(`${name}.ams`)
  if (!path) return false
  await writeTo(path)
  return true
}

function confirmDiscard(): boolean {
  return !useProjectStore.getState().dirty || window.confirm('The project has unsaved changes. Continue without saving?')
}

export function newProject(): boolean {
  if (!confirmDiscard()) return false
  stop()
  useProjectStore.getState().newProject()
  useAudioStore.setState({ currentBeat: 0, bpm: 120 })
  resetHistory()
  void window.api.project.autosaveClear()
  return true
}

export async function openProject(path?: string): Promise<OpenResult> {
  if (!confirmDiscard()) return { ok: false }
  let text: string
  let file: string
  if (path) {
    try { text = await window.api.project.read(path) } catch (e) { return { ok: false, message: `Cannot read the file: ${(e as Error).message}` } }
    file = path
  } else {
    const picked = await window.api.project.openDialog()
    if (!picked) return { ok: false }
    text = picked.text
    file = picked.path
  }
  try {
    const project = parseProject(text)
    stop()
    useProjectStore.getState().loadProject(project, file)
    useAudioStore.setState({ currentBeat: 0, bpm: project.bpm })
    resetHistory()
    remember(file)
    return { ok: true, missing: await missingFiles(project) }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ── autosave and crash recovery ──────────────────────────────────────────────

let started = false

export function startAutosave(): void {
  if (started) return
  started = true
  window.setInterval(() => {
    const { dirty, project } = useProjectStore.getState()
    if (dirty && project.tracks.length) void window.api.project.autosaveWrite(serialize(project)).catch(() => undefined)
  }, 30000)
}

export async function recoverableProject(): Promise<{ project: Project; mtime: number } | null> {
  try {
    const found = await window.api.project.autosaveRead()
    if (!found) return null
    const project = parseProject(found.text)
    return project.tracks.length ? { project, mtime: found.mtime } : null
  } catch { return null }
}

export function adoptRecovered(project: Project): void {
  useProjectStore.getState().loadProject(project, null)
  useProjectStore.setState({ dirty: true })        // recovered work is unsaved work
  useAudioStore.setState({ currentBeat: 0, bpm: project.bpm })
  resetHistory()
}

// mark the project as changed whenever it changes (but not when it was just loaded or saved)
useProjectStore.subscribe((s, prev) => {
  if (s.project === prev.project || s.cleanToken !== prev.cleanToken || s.dirty) return
  useProjectStore.setState({ dirty: true })
})

useProjectStore.subscribe(
  (s) => [s.project.name, s.dirty, s.filePath] as const,
  ([name, dirty]) => { document.title = `${dirty ? '• ' : ''}${name} – AI Music Studio` },
  { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] }
)
