import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Project, Track, Clip, Note, AutoParam, AutoPoint, LoopRange, Marker, ReturnTrack } from '../types'
import { RETURN_DEFAULTS } from '../audio/fx'
import { beatOfSrc, srcOfBeat } from '../audio/warp'
import { nanoid } from 'nanoid'

interface ProjectState {
  project: Project
  selectedTrackId: string | null
  selectedClipId: string | null
  selectedClipIds: string[]     // several clips (Ctrl/Shift+click, drag a frame); selectedClipId is one of them
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
  selectClips: (ids: string[]) => void
  toggleClipSelection: (id: string) => void
  moveClips: (ids: string[], dBeats: number) => void
  removeClips: (ids: string[]) => void
  setLoop: (patch: Partial<LoopRange>) => void
  addMarker: (beat: number, end?: number) => string
  updateMarker: (id: string, patch: Partial<Marker>) => void
  removeMarker: (id: string) => void
  addReturn: (effect: ReturnTrack['effect']) => void
  updateReturn: (id: string, patch: Partial<ReturnTrack>) => void
  removeReturn: (id: string) => void
  setSend: (trackId: string, returnId: string, level: number) => void
  setAutomation: (trackId: string, param: AutoParam, points: AutoPoint[]) => void
  groupTracks: (ids: string[]) => void
  ungroup: (groupId: string) => void
  promoteTake: (trackId: string, laneId: string, clipId: string) => void
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

// the file second that plays `beats` into an audio clip (sync and warp markers included)
function fileSecAfter(c: Clip, beats: number, bpm: number): number {
  const spb = 60 / (c.warpBpm || bpm || 120)
  return srcOfBeat(c.warpMarkers, beatOfSrc(c.warpMarkers, c.offset ?? 0, spb) + beats, spb)
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
  midi: '#d97706',
  group: '#64748b'
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    project: defaultProject(),
    selectedTrackId: null,
    selectedClipId: null,
    selectedClipIds: [],
    selectedNoteIds: [],
    filePath: null,
    dirty: false,
    cleanToken: 0,

    setProject: (p) => set({ project: p }),
    loadProject: (p, filePath) =>
      set((s) => ({ project: p, filePath, dirty: false, cleanToken: s.cleanToken + 1, selectedTrackId: null, selectedClipId: null, selectedClipIds: [], selectedNoteIds: [] })),
    setFilePath: (filePath) => set({ filePath }),
    markClean: () => set((s) => ({ dirty: false, cleanToken: s.cleanToken + 1 })),
    markSaved: (project, filePath) => set((s) => ({ project, filePath, dirty: false, cleanToken: s.cleanToken + 1 })),
    selectClip: (selectedClipId) => set({ selectedClipId, selectedClipIds: selectedClipId ? [selectedClipId] : [] }),
    selectClips: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[ids.length - 1] ?? null }),
    toggleClipSelection: (id) =>
      set((s) => {
        const ids = s.selectedClipIds.includes(id) ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id]
        return { selectedClipIds: ids, selectedClipId: ids.includes(id) ? id : ids[ids.length - 1] ?? null }
      }),
    moveClips: (ids, dBeats) =>
      set((s) => {
        const sel = new Set(ids)
        const starts = s.project.tracks.flatMap((t) => t.clips.filter((c) => sel.has(c.id)).map((c) => c.startTime))
        if (!starts.length) return s
        const d = Math.max(-Math.min(...starts), dBeats)                       // the group stops at the project start
        return { project: { ...s.project, tracks: s.project.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (sel.has(c.id) ? { ...c, startTime: c.startTime + d } : c)) })) } }
      }),
    removeClips: (ids) =>
      set((s) => {
        const sel = new Set(ids)
        return {
          selectedClipId: null, selectedClipIds: [],
          project: { ...s.project, tracks: s.project.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !sel.has(c.id)) })) }
        }
      }),
    setLoop: (patch) =>
      set((s) => {
        const cur = s.project.loop ?? { start: 0, end: 16, enabled: false }
        const next = { ...cur, ...patch }
        if (next.end < next.start) [next.start, next.end] = [next.end, next.start]
        return { project: { ...s.project, loop: next } }
      }),
    addMarker: (beat, end) => {
      const id = nanoid()
      set((s) => {
        const markers = s.project.markers ?? []
        const n = markers.filter((m) => (m.end === undefined) === (end === undefined)).length + 1
        const m: Marker = { id, beat, name: end === undefined ? `Marker ${n}` : `Cycle ${n}`, ...(end !== undefined ? { end } : {}) }
        return { project: { ...s.project, markers: [...markers, m].sort((a, b) => a.beat - b.beat) } }
      })
      return id
    },
    updateMarker: (id, patch) =>
      set((s) => ({ project: { ...s.project, markers: (s.project.markers ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)).sort((a, b) => a.beat - b.beat) } })),
    removeMarker: (id) => set((s) => ({ project: { ...s.project, markers: (s.project.markers ?? []).filter((m) => m.id !== id) } })),
    addReturn: (effect) =>
      set((s) => {
        const returns = s.project.returns ?? []
        const letter = String.fromCharCode(65 + returns.length)
        const r: ReturnTrack = { id: nanoid(), name: `${letter} ${effect === 'reverb' ? 'Reverb' : 'Delay'}`, effect, volume: 0.8, muted: false, pan: 0, ...RETURN_DEFAULTS[effect] }
        return { project: { ...s.project, returns: [...returns, r] } }
      }),
    updateReturn: (id, patch) =>
      set((s) => ({ project: { ...s.project, returns: (s.project.returns ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) } })),
    removeReturn: (id) =>
      set((s) => ({
        project: {
          ...s.project,
          returns: (s.project.returns ?? []).filter((r) => r.id !== id),
          tracks: s.project.tracks.map((t) => {
            const sends = { ...(t.sends ?? {}) }
            delete sends[id]
            const automation = { ...(t.automation ?? {}) }
            delete automation[`send:${id}`]
            return { ...t, sends, automation, showAutomation: t.showAutomation === `send:${id}` ? null : t.showAutomation,
              autoLanes: t.autoLanes?.filter((x) => x !== `send:${id}`) }
          })
        }
      })),
    setSend: (trackId, returnId, level) =>
      set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, sends: { ...(t.sends ?? {}), [returnId]: Math.max(0, Math.min(1, level)) } } : t)) } })),
    setAutomation: (trackId, param, points) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === trackId
            ? { ...t, automation: { ...(t.automation ?? {}), [param]: [...points].sort((a, b) => a.beat - b.beat) } }
            : t))
        }
      })),
    // put tracks into a new group track (Ableton: Ctrl+G); the group sits where the first of them was
    groupTracks: (ids) =>
      set((s) => {
        const chosen = s.project.tracks.filter((t) => ids.includes(t.id) && t.type !== 'group')
        if (!chosen.length) return s
        const groups = s.project.tracks.filter((t) => t.type === 'group').length
        const group: Track = { id: nanoid(), name: `Group ${groups + 1}`, type: 'group', color: '#64748b', volume: 0.8, pan: 0, muted: false, soloed: false, clips: [] }
        const firstIndex = s.project.tracks.indexOf(chosen[0])
        const rest = s.project.tracks.filter((t) => !chosen.includes(t))
        const at = rest.indexOf(s.project.tracks.slice(firstIndex).find((t) => !chosen.includes(t)) as Track)
        rest.splice(at < 0 ? rest.length : at, 0, group, ...chosen.map((t) => ({ ...t, parentId: group.id })))
        return { project: { ...s.project, tracks: rest }, selectedTrackId: group.id }
      }),
    ungroup: (groupId) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.filter((t) => t.id !== groupId).map((t) => (t.parentId === groupId ? { ...t, parentId: undefined } : t))
        },
        selectedTrackId: s.selectedTrackId === groupId ? null : s.selectedTrackId
      })),
    // comping: a take replaces what the track plays in its range
    promoteTake: (trackId, laneId, clipId) =>
      set((s) => {
        const track = s.project.tracks.find((t) => t.id === trackId)
        const take = track?.takes?.find((l) => l.id === laneId)?.clips.find((c) => c.id === clipId)
        if (!track || !take) return s
        const a = take.startTime
        const b = take.startTime + take.duration
        const bpm = s.project.bpm || 120
        const out: Clip[] = []
        for (const c of track.clips) {
          const ce = c.startTime + c.duration
          if (ce <= a + 1e-6 || c.startTime >= b - 1e-6) { out.push(c); continue }
          if (c.startTime < a) out.push({ ...c, duration: a - c.startTime })
          if (ce > b) {
            const cut = b - c.startTime
            out.push({ ...c, id: nanoid(), startTime: b, duration: ce - b, offset: c.audioFile ? fileSecAfter(c, cut, bpm) : c.offset })
          }
        }
        out.push({ ...take, id: nanoid() })
        return { project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, clips: out } : t)) } }
      }),

    // Changing the tempo keeps audio where it is in TIME (audio is not stretched); MIDI follows the tempo.
    setBpm: (bpm) =>
      set((s) => {
        const old = s.project.bpm || 120
        if (bpm === old) return s
        const k = bpm / old
        const tracks = s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.audioFile && !c.warpBpm
            ? { ...c, startTime: c.startTime * k, duration: c.duration * k, warpMarkers: c.warpMarkers?.map((m) => ({ ...m, beat: m.beat * k })) }
            : c))      // synced samples keep their beats
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
        offset: clip.audioFile ? fileSecAfter(clip, cut, bpm) : clip.offset,
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
    newProject: () => set((s) => ({ project: defaultProject(), filePath: null, dirty: false, cleanToken: s.cleanToken + 1, selectedTrackId: null, selectedClipId: null, selectedClipIds: [], selectedNoteIds: [] })),

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
        project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== id).map((t) => (t.parentId === id ? { ...t, parentId: undefined } : t)) },
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
        selectedClipIds: s.selectedClipIds.filter((x) => x !== clipId),
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
