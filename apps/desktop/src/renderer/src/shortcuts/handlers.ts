import { nanoid } from 'nanoid'
import { useAudioStore } from '../stores/audio.store'
import { useProjectStore } from '../stores/project.store'
import { useUIStore } from '../stores/ui.store'
import type { Note, Track } from '../types'
import { markStep, redo, undo } from './history'
import { isPlaying, pause, play, startRecording, stop } from '../audio/engine'
import { newProject, openProject, saveProject, saveProjectAs } from '../project/io'
import { narrowerGrid, nudgeStep, tripletToggle, widerGrid } from '../edit/grid'
import { openQuantizeDialog, quantizeSelection } from '../edit/quantize'
import { EXPORT_EVENT, reportOpen } from '../components/layout/FileMenu'
import { diagWrite } from '../lib/diagLog'
import {
  addMarkerAtPlayhead, consolidate, copySelection, crossfade, cutSelection, deleteSelection, duplicateSelection, groupSelectedTracks,
  jumpMarker, loopToSelection, pasteClipboard, selectAll,
  toggleAutomationLane, toggleLoop, togglePunch
} from '../components/timeline/studioOps'

export const WINAMP_EVENT = 'ams:toggle-winamp'

function selectedTrack(): Track | undefined {
  const s = useProjectStore.getState()
  return s.project.tracks.find((t) => t.id === s.selectedTrackId)
}

function toggleView(view: 'piano-roll' | 'mixer'): void {
  const ui = useUIStore.getState()
  ui.setActiveView(ui.activeView === view ? 'timeline' : view)
}

function duplicateSelectedTrack(): void {
  const track = selectedTrack()
  if (!track) return
  const copy: Track = {
    ...track,
    id: nanoid(),
    name: `${track.name} copy`,
    clips: track.clips.map((c) => ({
      ...c,
      id: nanoid(),
      notes: c.notes?.map((n) => ({ ...n, id: nanoid() })),
    })),
  }
  const store = useProjectStore.getState()
  const index = store.project.tracks.findIndex((t) => t.id === track.id)
  const tracks = [...store.project.tracks]
  tracks.splice(index + 1, 0, copy)
  useProjectStore.setState({ project: { ...store.project, tracks }, selectedTrackId: copy.id })
}

function addTrack(type: Track['type']): void {
  useProjectStore.getState().addTrack(type)
  const tracks = useProjectStore.getState().project.tracks
  useProjectStore.getState().selectTrack(tracks[tracks.length - 1].id)
}

function zoom(direction: 1 | -1): void {
  const ui = useUIStore.getState()
  if (ui.activeView === 'piano-roll') {
    ui.setPianoZoom(ui.pianoZoom + 0.25 * direction)
  } else {
    ui.setZoom(Math.min(4, Math.max(0.25, +(ui.zoom * (direction > 0 ? 1.25 : 0.8)).toFixed(3))))
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

// the clip whose notes the piano roll shows: the selected clip, or the first MIDI clip of the selected track
function noteClip(): { trackId: string; clipId: string; notes: Note[] } | null {
  const st = useProjectStore.getState()
  for (const t of st.project.tracks) {
    const c = t.clips.find((x) => x.id === st.selectedClipId && !x.audioFile)
    if (c) return { trackId: t.id, clipId: c.id, notes: c.notes ?? [] }
  }
  const t = st.project.tracks.find((x) => x.id === st.selectedTrackId)
  const c = t?.clips.find((x) => !x.audioFile)
  return t && c ? { trackId: t.id, clipId: c.id, notes: c.notes ?? [] } : null
}

// arrow keys: move the selected notes (in the piano roll) or the selected clip by one grid step
function nudge(direction: 1 | -1): void {
  const st = useProjectStore.getState()
  const step = nudgeStep() * direction
  if (useUIStore.getState().activeView === 'piano-roll' && st.selectedNoteIds.length) {
    const nc = noteClip()
    if (!nc) return
    for (const n of nc.notes) {
      if (st.selectedNoteIds.includes(n.id)) st.updateNote(nc.trackId, nc.clipId, n.id, { startTime: Math.max(0, n.startTime + step) })
    }
    return
  }
  const owner = st.project.tracks.find((t) => t.clips.some((c) => c.id === st.selectedClipId))
  const clip = owner?.clips.find((c) => c.id === st.selectedClipId)
  if (owner && clip) st.moveClip(owner.id, clip.id, owner.id, Math.max(0, clip.startTime + step))
}

function transpose(semitones: number): void {
  const st = useProjectStore.getState()
  const nc = noteClip()
  if (!nc || !st.selectedNoteIds.length) return
  for (const n of nc.notes) {
    if (st.selectedNoteIds.includes(n.id)) st.updateNote(nc.trackId, nc.clipId, n.id, { pitch: Math.max(0, Math.min(127, n.pitch + semitones)) })
  }
}

const HANDLERS: Record<string, () => void> = {
  'grid.toggle': () => useUIStore.getState().toggleSnap(),
  'grid.triplet': () => useUIStore.getState().setGrid(tripletToggle(useUIStore.getState().grid)),
  'grid.narrow': () => useUIStore.getState().setGrid(narrowerGrid(useUIStore.getState().grid)),
  'grid.widen': () => useUIStore.getState().setGrid(widerGrid(useUIStore.getState().grid)),
  'edit.quantize': () => { quantizeSelection() },
  'edit.quantizeSettings': () => openQuantizeDialog(),
  'clip.nudgeLeft': () => nudge(-1),
  'clip.nudgeRight': () => nudge(1),
  'note.up': () => transpose(1),
  'note.down': () => transpose(-1),

  'transport.playStop': () => { if (isPlaying()) pause(); else void play() },
  'transport.play': () => { void play() },
  'transport.stop': () => pause(),
  'transport.toStart': () => stop(),
  'transport.record': () => {
    if (useAudioStore.getState().isRecording) pause()
    else void startRecording().then((problem) => { if (problem) window.alert(problem) })
  },
  'transport.metronome': () => useAudioStore.getState().toggleMetronome(),
  'transport.loop': () => toggleLoop(),
  'loop.selection': () => { loopToSelection() },
  'transport.punchIn': () => togglePunch('punchIn'),
  'transport.punchOut': () => togglePunch('punchOut'),
  'marker.add': () => addMarkerAtPlayhead(),
  'marker.next': () => jumpMarker(1),
  'marker.prev': () => jumpMarker(-1),
  'edit.selectAll': () => selectAll(),
  'clip.consolidate': () => { void consolidate().then((m) => { if (m) window.alert(m) }) },
  'clip.crossfade': () => { const m = crossfade(); if (m) window.alert(m) },
  'track.group': () => groupSelectedTracks(),
  'track.automation': () => toggleAutomationLane(),

  'edit.undo': () => void undo(),
  'edit.redo': () => void redo(),
  'edit.copy': () => { copySelection() },
  'edit.cut': () => { cutSelection() },
  'edit.paste': () => { const m = pasteClipboard(); if (m) window.alert(m) },
  'edit.duplicate': () => {
    if (useProjectStore.getState().selectedClipIds.length > 1 && duplicateSelection()) return
    const st = useProjectStore.getState()
    const owner = st.project.tracks.find((t) => t.clips.some((c) => c.id === st.selectedClipId))
    if (owner && st.selectedClipId) st.duplicateClip(owner.id, st.selectedClipId)
    else duplicateSelectedTrack()
  },
  'file.new': () => { newProject() },
  'file.open': () => { void openProject().then(reportOpen) },
  'file.save': () => { void saveProject().catch((e) => window.alert(`Saving failed: ${(e as Error).message}`)) },
  'file.saveAs': () => { void saveProjectAs().catch((e) => window.alert(`Saving failed: ${(e as Error).message}`)) },
  'file.export': () => window.dispatchEvent(new CustomEvent(EXPORT_EVENT)),
  'clip.split': () => {
    const st = useProjectStore.getState()
    const owner = st.project.tracks.find((t) => t.clips.some((c) => c.id === st.selectedClipId))
    if (owner && st.selectedClipId) st.splitClip(owner.id, st.selectedClipId, useAudioStore.getState().currentBeat)
  },
  'clip.delete': () => {
    if (useProjectStore.getState().selectedClipIds.length > 1 && deleteSelection()) return
    const st = useProjectStore.getState()
    const owner = st.project.tracks.find((t) => t.clips.some((c) => c.id === st.selectedClipId))
    if (owner && st.selectedClipId) { st.removeClip(owner.id, st.selectedClipId); return }
    const t = selectedTrack()
    if (t) st.removeTrack(t.id)                       // no question: Ctrl+Z brings the track back
  },

  'track.addAudio': () => addTrack('audio'),
  'track.addMidi': () => addTrack('midi'),
  'track.delete': () => {
    const t = selectedTrack()
    if (t) useProjectStore.getState().removeTrack(t.id)
  },
  'track.mute': () => {
    const t = selectedTrack()
    if (t) useProjectStore.getState().updateTrack(t.id, { muted: !t.muted })
  },
  'track.solo': () => {
    const t = selectedTrack()
    if (t) useProjectStore.getState().updateTrack(t.id, { soloed: !t.soloed })
  },

  'tool.drawToggle': () => {
    const ui = useUIStore.getState()
    ui.setPianoTool(ui.pianoTool === 'draw' ? 'select' : 'draw')
  },
  'tool.draw': () => useUIStore.getState().setPianoTool('draw'),
  'tool.select': () => useUIStore.getState().setPianoTool('select'),
  'tool.erase': () => useUIStore.getState().setPianoTool('erase'),

  'zoom.in': () => zoom(1),
  'zoom.out': () => zoom(-1),

  'view.pianoRoll': () => toggleView('piano-roll'),
  'view.mixer': () => toggleView('mixer'),
  'view.settings': () => useUIStore.getState().setActiveView('settings'),
  'view.closeSettings': () => useUIStore.getState().closeSettings(),
  'view.fullscreen': toggleFullscreen,

  'app.winamp': () => window.dispatchEvent(new CustomEvent(WINAMP_EVENT)),
}

export function runAction(id: string): boolean {
  const handler = HANDLERS[id]
  if (!handler) return false
  diagWrite('action', id)
  markStep()
  handler()
  return true
}

export function hasHandler(id: string): boolean {
  return id in HANDLERS
}
