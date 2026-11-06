import { nanoid } from 'nanoid'
import { useAudioStore } from '../stores/audio.store'
import { useProjectStore } from '../stores/project.store'
import { useUIStore } from '../stores/ui.store'
import type { Track } from '../types'
import { markStep, redo, undo } from './history'

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

const HANDLERS: Record<string, () => void> = {
  'transport.playStop': () => {
    const a = useAudioStore.getState()
    if (a.isPlaying) a.pause()
    else a.play()
  },
  'transport.play': () => useAudioStore.getState().play(),
  'transport.stop': () => useAudioStore.getState().pause(),
  'transport.toStart': () => useAudioStore.getState().stop(),
  'transport.record': () => {
    const a = useAudioStore.getState()
    a.setRecording(!a.isRecording)
  },
  'transport.metronome': () => useAudioStore.getState().toggleMetronome(),

  'edit.undo': () => void undo(),
  'edit.redo': () => void redo(),
  'edit.duplicate': duplicateSelectedTrack,
  'file.new': () => useProjectStore.getState().newProject(),

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
  markStep()
  handler()
  return true
}

export function hasHandler(id: string): boolean {
  return id in HANDLERS
}
