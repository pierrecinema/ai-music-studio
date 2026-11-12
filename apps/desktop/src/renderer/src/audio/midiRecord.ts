// MIDI recording: notes played on the Piano Roll's keyboard (mouse) or on a MIDI keyboard (Web MIDI) become note boxes
// on the selected MIDI track while the song plays, at the beat they were played and as long as the key was held.
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'
import { useUIStore } from '../stores/ui.store'
import { currentBeat, isPlaying, onTransportStop, play, previewNote, startRecording } from './engine'
import type { Track } from '../types'

const NOTE_TRACKS: Track['type'][] = ['midi', 'instrument', 'vocal']

let rec: { trackId: string; clipId: string; held: Map<number, { beat: number; velocity: number }> } | null = null

export const isMidiRecording = (): boolean => rec !== null

function noteTrack(): Track | undefined {
  const st = useProjectStore.getState()
  return st.project.tracks.find((t) => t.id === st.selectedTrackId && NOTE_TRACKS.includes(t.type))
}

/** Record: MIDI when a MIDI track is selected or the Piano Roll is open, audio (microphone) otherwise. */
export async function startAnyRecording(): Promise<string | null> {
  if (noteTrack() || useUIStore.getState().activeView === 'piano-roll') return startMidiRecording()
  return startRecording()
}

export async function startMidiRecording(): Promise<string | null> {
  if (rec) return null
  const st = useProjectStore.getState()
  let track = noteTrack()
  if (!track) {
    st.addTrack('midi')
    track = useProjectStore.getState().project.tracks.at(-1)!
    useProjectStore.getState().selectTrack(track.id)
  }
  const perBar = st.project.timeSignature?.[0] ?? 4
  const at = isPlaying() ? currentBeat() : useAudioStore.getState().currentBeat
  // the selected clip if the playhead is inside it, else a new clip from the bar the playhead is in
  const sel = track.clips.find((c) => c.id === st.selectedClipId && !c.audioFile && at >= c.startTime && at < c.startTime + c.duration)
  let clipId = sel?.id
  if (!clipId) {
    const start = Math.floor(at / perBar) * perBar
    useProjectStore.getState().addClip(track.id, { startTime: start, duration: perBar, notes: [], name: 'Recorded MIDI' })
    clipId = useProjectStore.getState().project.tracks.find((t) => t.id === track!.id)!.clips.at(-1)!.id
  }
  useProjectStore.getState().selectClip(clipId)
  rec = { trackId: track.id, clipId, held: new Map() }
  useAudioStore.setState({ isRecording: true })
  void connectMidiKeyboards()
  if (!isPlaying()) await play()
  return null
}

export function stopMidiRecording(): void {
  if (!rec) return
  for (const pitch of [...rec.held.keys()]) noteOff(pitch)
  rec = null
  useAudioStore.setState({ isRecording: false })
}

onTransportStop(stopMidiRecording)

/** A key goes down (Piano Roll keyboard, MIDI keyboard): it sounds, and while recording it starts a note. */
export function noteOn(pitch: number, velocity = 100): void {
  const st = useProjectStore.getState()
  const track = rec ? st.project.tracks.find((t) => t.id === rec!.trackId) : noteTrack()
  void previewNote(pitch, velocity, track)
  if (rec && isPlaying()) rec.held.set(pitch, { beat: currentBeat(), velocity })
}

/** The key comes up: while recording, the note is written into the clip (which grows bar by bar if needed). */
export function noteOff(pitch: number): void {
  if (!rec) return
  const h = rec.held.get(pitch)
  if (!h) return
  rec.held.delete(pitch)
  const st = useProjectStore.getState()
  const clip = st.project.tracks.find((t) => t.id === rec!.trackId)?.clips.find((c) => c.id === rec!.clipId)
  if (!clip) return
  const end = isPlaying() ? currentBeat() : h.beat + 0.25
  const startTime = Math.max(0, h.beat - clip.startTime)
  const duration = Math.max(0.0625, end - h.beat)
  st.addNote(rec.trackId, rec.clipId, { pitch, startTime, duration, velocity: h.velocity })
  const perBar = st.project.timeSignature?.[0] ?? 4
  const need = Math.ceil((startTime + duration) / perBar) * perBar
  if (need > clip.duration) st.updateClip(rec.trackId, rec.clipId, { duration: need })
}

// ── MIDI keyboards (Web MIDI) ────────────────────────────────────────────────

let midiConnected = false

export async function connectMidiKeyboards(): Promise<number> {
  const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
  if (!nav.requestMIDIAccess) return 0
  try {
    const access = await nav.requestMIDIAccess()
    const hook = (input: MIDIInput): void => {
      input.onmidimessage = (e: MIDIMessageEvent) => {
        const [status, data1, data2] = Array.from(e.data ?? [])
        const kind = status & 0xf0
        if (kind === 0x90 && data2 > 0) noteOn(data1, data2)
        else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) noteOff(data1)
      }
    }
    access.inputs.forEach(hook)
    if (!midiConnected) {
      access.onstatechange = (e) => { const port = (e as MIDIConnectionEvent).port; if (port?.type === 'input' && port.state === 'connected') hook(port as MIDIInput) }
      midiConnected = true
    }
    return access.inputs.size
  } catch {
    return 0
  }
}
