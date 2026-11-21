// Puts the result of Audio → MIDI into the Studio (the Audio → MIDI page and the MCP tool use this): one MIDI track
// per chosen part with its instrument, optionally the original song (muted, lined up with the bars), a chord track
// and chord markers.
import { nanoid } from 'nanoid'
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'
import { chordTones, type Quality } from './band'
import { tr } from '../i18n/tr'
import type { SongToMidiResult } from './api'
import type { Track } from '../types'

export const STEM_COLORS: Record<string, string> = { vocals: '#a855f7', bass: '#3b82f6', drums: '#f43f5e', piano: '#f59e0b', guitar: '#22c55e', other: '#22d3ee' }
const QUAL: Record<string, Quality> = { '': 'maj', m: 'min', '7': '7', maj7: 'maj7', m7: 'min7', dim: 'dim', sus4: 'sus4' }

export interface ImportOptions {
  startBar?: number
  parts?: Record<string, boolean>          // stem -> put in (default: all)
  programs?: Record<string, number>        // stem -> instrument (default: the suggested one)
  setTempo?: boolean
  original?: string | null                 // the song file: added muted, lined up with the bars
  chordTrack?: boolean
  chordMarkers?: boolean
}

/** the length of the result in bars */
export const resultBars = (res: SongToMidiResult): number =>
  Math.max(1, Math.ceil(Math.max(4, ...res.parts.flatMap((p) => p.notes.map((n) => n.startTime + n.duration))) / 4))

export function importTranscription(res: SongToMidiResult, o: ImportOptions = {}): string[] {
  const st = useProjectStore.getState()
  const start = (Math.max(1, o.startBar ?? 1) - 1) * 4
  const bars = resultBars(res)
  if (o.setTempo !== false) { st.setBpm(res.bpm); useAudioStore.setState({ bpm: res.bpm }) }
  const made: string[] = []
  const add = (name: string, patch: Partial<Track>, notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number }>): void => {
    useProjectStore.getState().addTrack('midi')
    const ts = useProjectStore.getState().project.tracks
    const id = ts[ts.length - 1].id
    useProjectStore.getState().updateTrack(id, { name, ...patch })
    useProjectStore.getState().addClip(id, { startTime: start, duration: bars * 4, name, notes: notes.map((n) => ({ id: nanoid(), pitch: n.pitch, startTime: n.startTime, duration: n.duration, velocity: n.velocity })) })
    made.push(name)
  }
  if (o.original) {
    useProjectStore.getState().addTrack('audio')
    const ts = useProjectStore.getState().project.tracks
    const id = ts[ts.length - 1].id
    const name = (o.original.split(/[\\/]/).pop() ?? 'Original').replace(/\.[^.]+$/, '')
    useProjectStore.getState().updateTrack(id, { name: `${name} (${tr('original')})`, muted: true })
    useProjectStore.getState().addClip(id, { startTime: start, duration: bars * 4 + 4, audioFile: o.original, offset: res.firstBeat, name })
  }
  for (const p of res.parts) {
    if (o.parts && !o.parts[p.stem]) continue
    const program = o.programs?.[p.stem] ?? p.program
    add(`${tr(p.name)} (MIDI)`, { color: STEM_COLORS[p.stem] ?? '#94a3b8', program, sound: program >= 128 ? 'drums' : undefined }, p.notes)
  }
  if (o.chordTrack && res.chords.length) {
    const notes = res.chords.flatMap((c) => [36 + c.root, ...chordTones({ root: c.root, quality: QUAL[c.quality] ?? 'maj' }).map((t) => 60 + t)]
      .map((pitch) => ({ pitch, startTime: c.beat, duration: c.beats, velocity: 80 })))
    add(tr('Chords (detected)'), { color: '#e2e8f0', program: 89 }, notes)
  }
  if (o.chordMarkers) for (const c of res.chords) {
    const mid = useProjectStore.getState().addMarker(start + c.beat)
    useProjectStore.getState().updateMarker(mid, { name: c.name })
  }
  return made
}
