import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Project, Track, Clip, Note } from '../types'
import { nanoid } from 'nanoid'

interface ProjectState {
  project: Project
  selectedTrackId: string | null
  selectedClipId: string | null
  selectedNoteIds: string[]

  setProject: (p: Project) => void
  updateProject: (patch: Partial<Project>) => void
  newProject: () => void

  addTrack: (type: Track['type']) => void
  updateTrack: (id: string, patch: Partial<Track>) => void
  removeTrack: (id: string) => void
  selectTrack: (id: string | null) => void

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

    setProject: (p) => set({ project: p }),
    updateProject: (patch) =>
      set((s) => ({ project: { ...s.project, ...patch, updatedAt: new Date().toISOString() } })),
    newProject: () => set({ project: defaultProject(), selectedTrackId: null, selectedClipId: null, selectedNoteIds: [] }),

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
        selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId
      })),

    selectTrack: (id) => set({ selectedTrackId: id }),

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
