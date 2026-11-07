import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Project, Track, Clip, Note } from '../types'
import { nanoid } from 'nanoid'

interface ProjectState {
  project: Project
  selectedTrackId: string | null
  selectedClipId: string | null
  selectedNoteIds: string[]
  filePath: string | null      // where the project was saved (null = never saved)
  dirty: boolean               // changed since the last save
  cleanToken: number           // bumped when the project is replaced or saved, so that it is not counted as an edit

  setProject: (p: Project) => void
  loadProject: (p: Project, filePath: string | null) => void
  setFilePath: (path: string | null) => void
  markClean: () => void
  markSaved: (project: Project, filePath: string) => void
  setBpm: (bpm: number) => void
  selectClip: (id: string | null) => void
  moveClip: (fromTrackId: string, clipId: string, toTrackId: string, startTime: number) => void
  splitClip: (trackId: string, clipId: string, atBeat: number) => boolean
  duplicateClip: (trackId: string, clipId: string) => void
  updateProject: (patch: Partial<Project>) => void
  newProject: () => void

  addTrack: (type: Track['type']) => void
  updateTrack: (id: string, patch: Partial<Track>) => void
  removeTrack: (id: string) => void
  selectTrack: (id: string | null) => void
  moveTrack: (id: string, toIndex: number) => void
  selectNotes: (ids: string[]) => void

  addClip: (trackId: string, clip: Omit<Clip, 'id'>) => void
  updateClip: (trackId: string, clipId: string, patch: Partial<Clip>) => void
  removeClip: (trackId: string, clipId: string) => void

  addNote: (trackId: string, clipId: string, note: Omit<Note, 'id'>) => void
  updateNote: (trackId: string, clipId: string, noteId: string, patch: Partial<Note>) => void
  removeNote: (trackId: string, clipId: string, noteId: string) => void
}

const defaultProject = (): Project => ({
  id: nanoid(),
  name: 'Untitled Project',
  bpm: 120,
  timeSignature: [4, 4],
  sampleRate: 44100,
  tracks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
})

const TRACK_COLORS: Record<Track['type'], string> = {
  vocal: '#7c3aed',
  instrument: '#2563eb',
  audio: '#059669',
  midi: '#d97706'
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    project: defaultProject(),
    selectedTrackId: null,
    selectedClipId: null,
    selectedNoteIds: [],
    filePath: null,
    dirty: false,
    cleanToken: 0,

    setProject: (p) => set({ project: p }),
    loadProject: (p, filePath) =>
      set((s) => ({ project: p, filePath, dirty: false, cleanToken: s.cleanToken + 1, selectedTrackId: null, selectedClipId: null, selectedNoteIds: [] })),
    setFilePath: (filePath) => set({ filePath }),
    markClean: () => set((s) => ({ dirty: false, cleanToken: s.cleanToken + 1 })),
    markSaved: (project, filePath) => set((s) => ({ project, filePath, dirty: false, cleanToken: s.cleanToken + 1 })),
    selectClip: (selectedClipId) => set({ selectedClipId }),

    // Changing the tempo keeps audio where it is in TIME (audio is not stretched); MIDI follows the tempo.
    setBpm: (bpm) =>
      set((s) => {
        const old = s.project.bpm || 120
        if (bpm === old) return s
        const k = bpm / old
        const tracks = s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.audioFile && !c.warpBpm ? { ...c, startTime: c.startTime * k, duration: c.duration * k } : c))      // synced samples keep their beats
        }))
        return { project: { ...s.project, bpm, tracks, updatedAt: new Date().toISOString() } }
      }),

    moveClip: (fromTrackId, clipId, toTrackId, startTime) =>
      set((s) => {
        const from = s.project.tracks.find((t) => t.id === fromTrackId)
        const clip = from?.clips.find((c) => c.id === clipId)
        if (!from || !clip) return s
        const moved = { ...clip, startTime: Math.max(0, startTime) }
        const tracks = s.project.tracks.map((t) => {
          if (t.id === fromTrackId && t.id === toTrackId) return { ...t, clips: t.clips.map((c) => (c.id === clipId ? moved : c)) }
          if (t.id === fromTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          if (t.id === toTrackId) return { ...t, clips: [...t.clips, moved] }
          return t
        })
        return { project: { ...s.project, tracks }, selectedTrackId: toTrackId }
      }),

    // cut one clip in two at `atBeat` (audio keeps its place in the file through `offset`)
    splitClip: (trackId, clipId, atBeat) => {
      const s = get()
      const track = s.project.tracks.find((t) => t.id === trackId)
      const clip = track?.clips.find((c) => c.id === clipId)
      if (!track || !clip) return false
      const cut = atBeat - clip.startTime
      if (cut <= 0.01 || cut >= clip.duration - 0.01) return false
      const bpm = s.project.bpm || 120
      const left: Clip = { ...clip, duration: cut }
      const right: Clip = {
        ...clip, id: nanoid(), startTime: atBeat, duration: clip.duration - cut,
        offset: clip.audioFile ? (clip.offset ?? 0) + (cut * 60) / (clip.warpBpm || bpm) : clip.offset,
        notes: clip.notes
          ? clip.notes.filter((n) => n.startTime + n.duration > cut).map((n) => ({
              ...n, id: nanoid(), startTime: Math.max(0, n.startTime - cut),
              duration: n.startTime < cut ? n.startTime + n.duration - cut : n.duration
            }))
          : undefined
      }
      if (left.notes) left.notes = left.notes.filter((n) => n.startTime < cut).map((n) => ({ ...n, duration: Math.min(n.duration, cut - n.startTime) }))
      set({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId ? { ...t, clips: t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])) } : t
          )
        },
        selectedClipId: right.id
      })
      return true
    },

    duplicateClip: (trackId, clipId) =>
      set((s) => {
        const track = s.project.tracks.find((t) => t.id === trackId)
        const clip = track?.clips.find((c) => c.id === clipId)
        if (!track || !clip) return s
        const copy: Clip = {
          ...clip, id: nanoid(), startTime: clip.startTime + clip.duration,
          notes: clip.notes?.map((n) => ({ ...n, id: nanoid() }))
        }
        return {
          project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, copy] } : t)) },
          selectedClipId: copy.id
        }
      }),
    updateProject: (patch) =>
      set((s) => ({ project: { ...s.project, ...patch, updatedAt: new Date().toISOString() } })),
    newProject: () => set((s) => ({ project: defaultProject(), filePath: null, dirty: false, cleanToken: s.cleanToken + 1, selectedTrackId: null, selectedClipId: null, selectedNoteIds: [] })),

    addTrack: (type) =>
      set((s) => {
        const track: Track = {
          id: nanoid(),
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${s.project.tracks.length + 1}`,
          type,
          color: TRACK_COLORS[type],
          volume: 0.8,
          pan: 0,
          muted: false,
          soloed: false,
          clips: []
        }
        return { project: { ...s.project, tracks: [...s.project.tracks, track] } }
      }),

    updateTrack: (id, patch) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t))
        }
      })),

    removeTrack: (id) =>
      set((s) => ({
        project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== id) },
        selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId,
        selectedClipId: s.project.tracks.find((t) => t.id === id)?.clips.some((c) => c.id === s.selectedClipId) ? null : s.selectedClipId
      })),

    // choosing a track must not leave a clip of ANOTHER track selected: Delete would remove that clip
    selectTrack: (id) =>
      set((s) => {
        const owner = s.project.tracks.find((t) => t.clips.some((c) => c.id === s.selectedClipId))
        return { selectedTrackId: id, selectedClipId: owner && owner.id !== id ? null : s.selectedClipId }
      }),

    moveTrack: (id, toIndex) =>
      set((s) => {
        const from = s.project.tracks.findIndex((t) => t.id === id)
        if (from < 0) return s
        const tracks = [...s.project.tracks]
        const [t] = tracks.splice(from, 1)
        tracks.splice(Math.max(0, Math.min(tracks.length, toIndex)), 0, t)
        return { project: { ...s.project, tracks } }
      }),

    selectNotes: (ids) => set({ selectedNoteIds: ids }),

    addClip: (trackId, clip) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId ? { ...t, clips: [...t.clips, { ...clip, id: nanoid() }] } : t
          )
        }
      })),

    updateClip: (trackId, clipId, patch) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
              : t
          )
        }
      })),

    removeClip: (trackId, clipId) =>
      set((s) => ({
        selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t
          )
        }
      })),

    addNote: (trackId, clipId, note) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId
                      ? { ...c, notes: [...(c.notes ?? []), { ...note, id: nanoid() }] }
                      : c
                  )
                }
              : t
          )
        }
      })),

    updateNote: (trackId, clipId, noteId, patch) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId
                      ? {
                          ...c,
                          notes: (c.notes ?? []).map((n) =>
                            n.id === noteId ? { ...n, ...patch } : n
                          )
                        }
                      : c
                  )
                }
              : t
          )
        }
      })),

    removeNote: (trackId, clipId, noteId) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId
                      ? { ...c, notes: (c.notes ?? []).filter((n) => n.id !== noteId) }
                      : c
                  )
                }
              : t
          )
        }
      }))
  }))
)
