// AI Instruments, built as a rack of studio devices (see gear.tsx):
//   Song Generator – a whole song as MIDI (chords, melody, keys, bass, drums, guitar) from a genre, key and tempo
//   Band           – drummer, bass player and guitarist that play along with the song's chords (MIDI, every PC)
//   Orchestra      – a MIDI track played by MIDI-DDSP (13 orchestral instruments, on the processor)
//   Text Instrument– any instrument described in words, played by ACE-Step from a MIDI track (NVIDIA)
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { api, type AiInstrument, type InstrumentJob, type MusicJob } from '../../lib/api'
import { beatToSec } from '../../audio/timemap'
import { encodeWav } from '../../audio/wav'
import { putBuffer, renderMidiGuide } from '../../audio/engine'
import { SoundPackCard } from '../common/SoundPackCard'
import { importAudioFiles } from '../timeline/Timeline'
import {
  BASS_STYLES, DRUM_STYLES, GUITAR_STYLES, bassist, chordName, detectChords, drummer, fillChords, guitarist, parseProgression,
  type BandNote, type BassStyle, type Chord, type DrumStyle, type GuitarStyle,
} from '../../lib/band'
import { GENRES, SECTION_LABEL, generateSong, type Mode } from '../../lib/songgen'
import { Fader, G, LedDot, Meter, RollView, SkinKnob, VuMeter } from './gear'
import type { Track } from '../../types'
import { tr, trf } from '../../i18n/tr'

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const COL = { song: '#a855f7', drums: '#f43f5e', bass: '#3b82f6', guitar: '#f59e0b', band: '#fb7185', orch: '#22c55e', text: '#38bdf8' }
const pct = (v: number): string => `${Math.round(v * 100)}`
const Note = ({ children, warn }: { children: React.ReactNode; warn?: boolean }): React.ReactElement =>
  <div style={{ fontSize: 11.5, color: warn ? '#fbbf24' : G.dim, lineHeight: 1.45, fontFamily: G.font }}>{children}</div>

/** drum tracks have no chords (their notes are drum sounds) */
const isDrums = (t: Track): boolean => t.sound === 'drums' || /drum|beat|perc/i.test(t.name)

/** the notes of a track in absolute beats */
function notesOf(t: Track): Array<{ pitch: number; start: number; duration: number; velocity: number }> {
  return t.clips.flatMap((c) => (c.audioFile ? [] : (c.notes ?? []).filter((n) => n.startTime < c.duration).map((n) => ({
    pitch: n.pitch, start: c.startTime + n.startTime, duration: Math.min(n.duration, c.duration - n.startTime), velocity: n.velocity,
  }))))
}

/** a new MIDI track with one clip holding the part */
function addPartTrack(name: string, sound: Track['sound'], color: string, notes: BandNote[], startBeat: number, beats: number,
  mix?: Pick<Track, 'program' | 'volume' | 'reverb'>): void {
  useProjectStore.getState().addTrack('midi')
  const tracks = useProjectStore.getState().project.tracks
  const id = tracks[tracks.length - 1].id
  useProjectStore.getState().updateTrack(id, { name, sound, color, ...(mix ?? {}) })
  useProjectStore.getState().addClip(id, { startTime: startBeat, duration: beats, name, notes: notes.map((n) => ({ ...n, id: nanoid() })) })
  useProjectStore.getState().selectTrack(id)
}

function useStatus(): { ddsp: boolean; ace: boolean; cuda: boolean } | null {
  const [s, setS] = useState<{ ddsp: boolean; ace: boolean; cuda: boolean } | null>(null)
  useEffect(() => { let on = true; api.instruments.status().then((x) => on && setS(x)).catch(() => on && setS(null)); return () => { on = false } }, [])
  return s
}

/** the part of a track to play: from the bar of its first note to its last note */
function partOf(project: ReturnType<typeof useProjectStore.getState>['project'], t: Track): { from: number; to: number; notes: ReturnType<typeof notesOf> } {
  const notes = notesOf(t)
  const bpb = project.timeSignature?.[0] || 4
  const first = Math.min(...notes.map((n) => n.start))
  return { from: Math.floor(first / bpb) * bpb, to: Math.max(...notes.map((n) => n.start + n.duration)), notes }
}

async function placeAudio(path: string, name: string, startBeat: number, muteTrack?: string): Promise<string | null> {
  const problems = await importAudioFiles([path], { startBeat, noBeatMatch: true })
  if (problems.length) return problems.join(' ')
  const tracks = useProjectStore.getState().project.tracks
  useProjectStore.getState().updateTrack(tracks[tracks.length - 1].id, { name })
  if (muteTrack) useProjectStore.getState().updateTrack(muteTrack, { muted: true })
  return null
}

// the same list as the backend's (api/routes/instruments.py), shown also while the backend is not running
const ORCHESTRA: AiInstrument[] = [
  ['violin', 'Violin', 'Strings', 55, 103], ['viola', 'Viola', 'Strings', 48, 91], ['cello', 'Cello', 'Strings', 36, 76], ['double-bass', 'Double bass', 'Strings', 28, 67],
  ['flute', 'Flute', 'Woodwinds', 60, 98], ['oboe', 'Oboe', 'Woodwinds', 58, 91], ['clarinet', 'Clarinet', 'Woodwinds', 50, 94], ['saxophone', 'Saxophone', 'Woodwinds', 49, 81], ['bassoon', 'Bassoon', 'Woodwinds', 34, 75],
  ['trumpet', 'Trumpet', 'Brass', 54, 86], ['horn', 'French horn', 'Brass', 34, 77], ['trombone', 'Trombone', 'Brass', 34, 72], ['tuba', 'Tuba', 'Brass', 26, 65],
].map(([id, name, category, low, high]) => ({ id, name, category, low, high }) as AiInstrument)

const COVER_IDEAS = ['electric guitar, overdrive', 'acoustic guitar, fingerpicked', 'grand piano', 'jazz piano trio', 'rhodes electric piano', 'string orchestra',
  'solo cello', 'saxophone, smooth jazz', 'sitar', 'kalimba', 'synth lead, 80s', 'church organ', 'brass section, funk', 'harp', 'marimba', 'pan flute']

// ── shared bits of the skins ────────────────────────────────────────────────

const lightText = '#2d3138'
const lightDim = '#6b7280'

/** the name of a device as plugins write it: "Word|Word", the first part bold */
function Wordmark({ a, b, color = lightText, size = 22 }: { a: string; b: string; color?: string; size?: number }): React.ReactElement {
  return <span style={{ fontFamily: G.font, fontSize: size, color, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}><b style={{ fontWeight: 700 }}>{a}</b><span style={{ opacity: 0.35, margin: '0 3px', fontWeight: 200 }}>|</span><span style={{ fontWeight: 300 }}>{b}</span></span>
}

/** a dark pill with a choice (the "Female ▾" selector of vocal plugins) */
function Pill<T extends string | number>({ value, options, onChange, width = 150 }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; width?: number }): React.ReactElement {
  return (
    <div style={{ position: 'relative', width, height: 26, borderRadius: 6, background: 'linear-gradient(180deg, #2b3a4b, #18222d)', boxShadow: '0 2px 4px rgba(0,0,0,0.25)', color: '#e5eef6', fontFamily: G.font, fontSize: 12.5 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', pointerEvents: 'none' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{options.find((o) => o.id === value)?.label}</span><span style={{ fontSize: 9 }}>▼</span>
      </div>
      <select value={String(value)} onChange={(e) => { const o = options.find((x) => String(x.id) === e.target.value); if (o) onChange(o.id) }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
        {options.map((o) => <option key={String(o.id)} value={String(o.id)}>{o.label}</option>)}
      </select>
    </div>
  )
}

const LedRow = ({ label, on, set, color, light, title }: { label: string; on: boolean; set: (v: boolean) => void; color?: string; light?: boolean; title?: string }): React.ReactElement => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={title}>
    <span style={{ fontFamily: G.font, fontSize: 11.5, color: light ? lightText : '#cbd5e1' }}>{label}</span>
    <LedDot on={on} set={set} color={color} light={light} />
  </div>
)

/** a flat button as the skins draw it */
function Btn({ children, onClick, disabled, title, look, color = '#22c3ee' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; look: 'silk' | 'epic' | 'antares' | 'lab'; color?: string }): React.ReactElement {
  const styles: Record<string, React.CSSProperties> = {
    silk: { background: 'linear-gradient(180deg, #ffffff, #d9dde2)', color: lightText, border: '1px solid #9aa1aa', borderRadius: 6, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' },
    epic: { background: '#2a2c30', color: '#f3f4f6', border: `1px solid ${color}`, borderRadius: 4, boxShadow: `0 0 8px color-mix(in srgb, ${color} 40%, transparent)` },
    antares: { background: 'linear-gradient(180deg, #2f4a6b, #1b2c42)', color: '#d6ecff', border: '1px solid #0a1220', borderRadius: 3 },
    lab: { background: '#3a3d45', color: '#e5e7eb', border: '1px solid #1d1f24', borderRadius: 4 },
  }
  return <button onClick={onClick} disabled={disabled} title={title} style={{ fontFamily: G.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, ...styles[look] }}>{children}</button>
}

// ── Song Generator: light silver vocal-plugin front ─────────────────────────

const PART_COLORS: Record<string, string> = { melody: '#a855f7', chords: '#22d3ee', bass: '#3b82f6', drums: '#f43f5e', guitar: '#f59e0b' }
const SECTION_COLORS: Record<string, string> = { intro: '#94a3b8', verse: '#38bdf8', pre: '#818cf8', chorus: '#22c3ee', bridge: '#2dd4bf', drop: '#0ea5e9', outro: '#94a3b8' }
const CYAN = '#22c3ee'

/** the melody of the chorus as the light spectrum-like curve of vocal plugins */
function LightCurve({ notes, beats }: { notes: BandNote[]; beats: number }): React.ReactElement {
  const W = 400, H = 80
  const shown = notes.filter((n) => n.startTime < beats)
  const ps = shown.map((n) => n.pitch)
  const lo = (ps.length ? Math.min(...ps) : 60) - 3, hi = (ps.length ? Math.max(...ps) : 72) + 3
  const pts = shown.map((n) => [(n.startTime / beats) * W, H - ((n.pitch - lo) / (hi - lo)) * (H - 10) - 5, ((n.startTime + n.duration) / beats) * W] as const)
  const path = pts.length ? `M 0 ${H} ` + pts.map(([x, y, x2]) => `L ${x} ${y} L ${x2} ${y}`).join(' ') + ` L ${W} ${H} Z` : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, background: '#e6e9ed', borderRadius: 4, border: '1px solid #c9ced5' }}>
      {[0.25, 0.5, 0.75].map((k) => <line key={k} x1={0} x2={W} y1={H * k} y2={H * k} stroke="#d3d8de" />)}
      <path d={path} fill="#5ec8e6" opacity={0.75} />
    </svg>
  )
}

function SongGenerator(): React.ReactElement {
  const [genre, setGenre] = useState('pop')
  const g = GENRES.find((x) => x.id === genre)!
  const [key, setKey] = useState(9)
  const [mode, setMode] = useState<Mode>(g.mode)
  const [bpm, setBpm] = useState(g.bpm)
  const [take, setTake] = useState(1)
  const [parts, setParts] = useState({ melody: true, chords: true, bass: true, drums: true, guitar: true })
  const [setTempo, setSetTempo] = useState(true)
  const [markers, setMarkers] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const pick = (id: string): void => { const n = GENRES.find((x) => x.id === id)!; setGenre(id); setMode(n.mode); setBpm(n.bpm) }
  const song = useMemo(() => generateSong({ genre, key, mode, bpm, seed: take, parts }), [genre, key, mode, bpm, take, parts])
  const length = Math.round((song.bars * 4 * 60) / bpm)
  const melody = song.parts.find((p) => p.id === 'melody') ?? song.parts[0]
  const chorus = song.sections.find((s) => s.kind === 'chorus' || s.kind === 'drop') ?? song.sections[0]

  const make = (): void => {
    if (setTempo) useProjectStore.getState().setBpm(bpm)
    // from bar 1, under what is there (owner: a new song after the end of the project was out of sight and the new
    // tracks looked empty); older tracks can be muted or hidden
    const start = 0
    const keyName = `${KEY_NAMES[key]}${mode === 'minor' ? 'm' : ''}`
    for (const p of song.parts) addPartTrack(`${tr(p.name)} (${tr(g.label)}, ${keyName})`, p.sound, PART_COLORS[p.id], p.notes, start, song.bars * 4, { program: p.program, volume: p.volume, reverb: p.reverb })
    if (markers) for (const s of song.sections) {
      if ((useProjectStore.getState().project.markers ?? []).some((m) => m.end === undefined && Math.abs(m.beat - (start + s.bar * 4)) < 0.01)) continue
      const id = useProjectStore.getState().addMarker(start + s.bar * 4)
      useProjectStore.getState().updateMarker(id, { name: tr(SECTION_LABEL[s.kind]) })
    }
    setNotice(trf('The song is in the Studio from bar {bar}: {n} MIDI tracks, {bars} bars. Every part can be edited in the Piano Roll and played by any instrument.', { bar: start / 4 + 1, n: song.parts.length, bars: song.bars }))
  }

  return (
    <section style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #8c939c', boxShadow: '0 10px 24px rgba(0,0,0,0.45)', fontFamily: G.font }}
      title={tr('A whole song as MIDI: chords, melody, keys, bass, drums and guitar, with intro, verse, chorus and bridge.')}>
      <div style={{ background: 'linear-gradient(180deg, #f4f5f7 0%, #e3e6ea 100%)', padding: '14px 20px 16px', display: 'grid', gridTemplateColumns: '230px 1fr 230px', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Wordmark a="Song" b={tr('Generator')} />
          <Pill value={genre} onChange={pick} options={GENRES.map((x) => ({ id: x.id, label: tr(x.label) }))} width={170} />
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
            <SkinKnob skin="silk" label={tr('Key')} value={key} min={0} max={11} step={1} def={9} onChange={setKey} format={(v) => KEY_NAMES[Math.round(v)]} size={70} color={CYAN} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 6 }}>
              <LedRow label={tr('Major')} on={mode === 'major'} set={() => setMode('major')} color={CYAN} light />
              <LedRow label={tr('Minor')} on={mode === 'minor'} set={() => setMode('minor')} color={CYAN} light />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <SkinKnob skin="silk" label={tr('Tempo')} value={bpm} min={60} max={180} step={1} def={g.bpm} onChange={setBpm} format={(v) => `${Math.round(v)}`} size={150} color={CYAN} low="60" high="180" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn look="silk" onClick={() => setTake(take + 1)} title={tr('Another version: other chords, melody and grooves')}>{trf('Take {n}', { n: take })}</Btn>
            <Btn look="silk" onClick={make} disabled={!song.parts.length}>{tr('Create')}</Btn>
          </div>
          <span style={{ fontSize: 11, color: lightDim }}>{trf('{bars} bars · {min}:{sec} min', { bars: song.bars, min: Math.floor(length / 60), sec: String(length % 60).padStart(2, '0') })}</span>
          <span style={{ fontFamily: G.mono, fontSize: 12, color: '#155e75' }}>{song.chords.slice(0, 4).map((c) => chordName(c)).join(' · ')}</span>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 2, height: 22 }}>
            {song.sections.map((s, i) => (
              <div key={i} title={`${tr(SECTION_LABEL[s.kind])}: ${s.bars} ${tr('bars')}`} style={{ flex: s.bars, borderRadius: 3, background: SECTION_COLORS[s.kind], opacity: 0.85, color: '#0b2530',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{tr(SECTION_LABEL[s.kind])}</div>
            ))}
          </div>
          <LightCurve notes={(melody?.notes ?? []).filter((n) => n.startTime >= chorus.bar * 4).map((n) => ({ ...n, startTime: n.startTime - chorus.bar * 4 }))} beats={32} />
        </div>
      </div>
      <div style={{ background: 'linear-gradient(180deg, #e9ebee, #d5d9de)', borderTop: '1px solid #b4bac2', padding: '12px 20px', display: 'flex', gap: 26, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {(['melody', 'chords', 'bass', 'drums', 'guitar'] as const).map((p) => (
          <LedRow key={p} label={tr({ melody: 'Melody', chords: 'Keys', bass: 'Bass', drums: 'Drums', guitar: 'Guitar' }[p])} on={parts[p]} set={(v) => setParts({ ...parts, [p]: v })} color={CYAN} light />
        ))}
        <span style={{ width: 1, alignSelf: 'stretch', background: '#b4bac2' }} />
        <LedRow label={tr('Tempo')} on={setTempo} set={setSetTempo} color={CYAN} light title={tr('Set the project tempo')} />
        <LedRow label={tr('Markers')} on={markers} set={setMarkers} color={CYAN} light title={tr('Markers for the parts')} />
        {notice && <span style={{ fontSize: 11.5, color: '#155e75', flex: 1, minWidth: 260 }}>{notice}</span>}
      </div>
    </section>
  )
}

// ── Band: chord strip + drummer (dark synth with operator panels) + bass / guitar (light rack effects) ──

function LabPanel({ title, children, color = '#a78bfa' }: { title: string; children: React.ReactNode; color?: string }): React.ReactElement {
  return (
    <div style={{ background: '#2a2c31', border: '1px solid #17181b', borderRadius: 5, flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#33363c', borderBottom: '1px solid #17181b', fontSize: 11, color: '#e5e7eb', fontFamily: G.font }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{title}
      </div>
      <div style={{ padding: 10, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

/** the drum pattern in green on black, like the sample editor of a synth */
function GreenGrid({ notes }: { notes: BandNote[] }): React.ReactElement {
  const rows: Array<[string, number[]]> = [['CR', [49, 51, 57, 53]], ['HH', [42, 44, 46, 70, 54]], ['PC', [37, 39, 56, 60, 61, 62, 63, 64, 75]], ['TM', [41, 43, 45, 47, 48, 50]], ['SN', [38, 40]], ['KK', [35, 36]]]
  const steps = 32
  return (
    <div style={{ background: '#0b120d', border: '1px solid #000', borderRadius: 4, padding: '6px 8px', boxShadow: 'inset 0 2px 8px #000' }}>
      {rows.map(([name, ps]) => {
        const hits = new Map<number, number>()
        for (const n of notes) if (ps.includes(n.pitch)) { const s = Math.round(n.startTime * 4); if (s >= 0 && s < steps) hits.set(s, Math.max(hits.get(s) ?? 0, n.velocity)) }
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 2, height: 12, marginBottom: 2 }}>
            <span style={{ width: 20, fontFamily: G.mono, fontSize: 8.5, color: '#4b7a56' }}>{name}</span>
            {Array.from({ length: steps }, (_, s) => {
              const v = hits.get(s)
              return <span key={s} style={{ flex: 1, height: v ? `${40 + 60 * (v / 127)}%` : 2, alignSelf: 'flex-end', marginLeft: s % 4 === 0 && s ? 2 : 0, borderRadius: 1, background: v ? '#7ee787' : '#1a2a1e', boxShadow: v ? '0 0 4px #7ee787' : undefined }} />
            })}
          </div>
        )
      })}
    </div>
  )
}

/** a light rack effect with a coloured edge and a dark block on the right (logo, screen, output) */
function RackUnit({ edge, logo, sub, children, side, onAdd, addLabel }: { edge: string; logo: string; sub: string; children: React.ReactNode; side: React.ReactNode; onAdd: () => void; addLabel: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #8c939c', boxShadow: '0 8px 18px rgba(0,0,0,0.45)', minWidth: 0 }}>
      <div style={{ width: 8, background: edge }} />
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #e7e8ea, #cfd1d5)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>{children}</div>
      <div style={{ width: 168, background: 'linear-gradient(180deg, #45484e, #313338)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', borderLeft: '1px solid #222' }}>
        <div style={{ alignSelf: 'stretch', textAlign: 'right' }}>
          <div style={{ fontFamily: G.font, fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: '#f3f4f6', lineHeight: 1 }}>{logo}</div>
          <div style={{ fontFamily: G.font, fontSize: 9, letterSpacing: '0.2em', color: edge, textTransform: 'uppercase' }}>{sub}</div>
        </div>
        {side}
        <Btn look="epic" color={edge} onClick={onAdd}>{addLabel}</Btn>
      </div>
    </div>
  )
}

const lightLabel: React.CSSProperties = { fontFamily: G.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2d3138' }

function Band(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const bpb = project.timeSignature?.[0] || 4
  const midiTracks = project.tracks.filter((t) => t.type === 'midi' && !isDrums(t) && notesOf(t).length)
  const [source, setSource] = useState<'song' | 'typed'>(midiTracks.length ? 'song' : 'typed')
  const [typed, setTyped] = useState('Am F C G')
  const [startBar, setStartBar] = useState(1)
  const [bars, setBars] = useState(8)
  const [perChord, setPerChord] = useState(4)
  const [drum, setDrum] = useState<{ style: DrumStyle; intensity: number; fills: 0 | 4 | 8; humanize: number; swing: number }>({ style: 'rock', intensity: 0.5, fills: 4, humanize: 0.3, swing: 0 })
  const [bass, setBass] = useState<{ style: BassStyle; intensity: number; humanize: number }>({ style: 'eighths', intensity: 0.5, humanize: 0.2 })
  const [gtr, setGtr] = useState<{ style: GuitarStyle; intensity: number; humanize: number; distorted: boolean }>({ style: 'strum', intensity: 0.5, humanize: 0.25, distorted: false })
  const [seed, setSeed] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const src = source === 'song' && !midiTracks.length ? 'typed' : source
  const startBeat = (startBar - 1) * bpb
  const beats = bars * bpb
  const chords: Chord[] = useMemo(() => {
    if (src === 'typed') return fillChords(parseProgression(typed, bpb, perChord).chords, beats)
    return detectChords(midiTracks.flatMap(notesOf), startBeat, startBeat + beats, bpb).map((c) => ({ ...c, beat: c.beat - startBeat }))
  }, [src, typed, perChord, bpb, beats, startBeat, project])                      // eslint-disable-line react-hooks/exhaustive-deps
  const bad = src === 'typed' ? parseProgression(typed, bpb, perChord).bad : []
  const opts = { bars, beatsPerBar: bpb, seed }
  const drumNotes = useMemo(() => drummer({ ...opts, style: drum.style, intensity: drum.intensity, fills: drum.fills, humanize: drum.humanize, swing: drum.swing }), [bars, bpb, seed, drum])  // eslint-disable-line react-hooks/exhaustive-deps
  const bassNotes = useMemo(() => (chords.length ? bassist({ ...opts, style: bass.style, intensity: bass.intensity, chords, humanize: bass.humanize, swing: drum.swing }) : []), [bars, bpb, seed, bass, chords, drum.swing])  // eslint-disable-line react-hooks/exhaustive-deps
  const gtrNotes = useMemo(() => (chords.length ? guitarist({ ...opts, style: gtr.style, intensity: gtr.intensity, chords, humanize: gtr.humanize, swing: drum.swing }) : []), [bars, bpb, seed, gtr, chords, drum.swing])  // eslint-disable-line react-hooks/exhaustive-deps
  const addDrums = (): void => addPartTrack(`${tr('Drummer')} (${tr(DRUM_STYLES.find((d) => d.id === drum.style)!.label)})`, 'drums', '#f43f5e', drumNotes, startBeat, beats)
  const addBass = (): void => addPartTrack(`${tr('Bass player')} (${tr(BASS_STYLES.find((d) => d.id === bass.style)!.label)})`, bass.style === '808' ? '808' : 'bass', '#3b82f6', bassNotes, startBeat, beats)
  const addGuitar = (): void => addPartTrack(`${tr('Guitarist')} (${tr(GUITAR_STYLES.find((d) => d.id === gtr.style)!.label)})`, gtr.distorted ? 'eguitar' : 'guitar', '#f59e0b', gtrNotes, startBeat, beats)
  const needChords = (): boolean => {
    if (chords.length) return true
    setNotice(src === 'song' ? tr('No chords found in this part of the song: type the chords instead.') : tr('Type the chords of the song first, for example: Am F C G'))
    return false
  }
  const done = (what: string): void => setNotice(trf('{what} is in the Studio: a new MIDI track at bar {bar}. Change its sound with KA → Instrument in its track (any VST instrument too).', { what, bar: startBar }))
  const ORANGE = '#f28b20', BLUE = '#2f9be8', PURPLE = '#a78bfa'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
      {/* the drummer: a dark synth with a green pattern display and operator panels; the chords and the band live here */}
      <section style={{ background: '#232529', border: '1px solid #111', borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 24px rgba(0,0,0,0.45)', fontFamily: G.font }}
        title={tr('Drummer, bass player and guitarist play along with the chords of your song. MIDI, every PC.')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#1b1c20', borderBottom: '1px solid #111' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: '#e5e7eb' }}>BAND<span style={{ color: '#7ee787' }}>LAB</span></span>
          <span style={{ width: 1, height: 16, background: '#3a3d45' }} />
          <Btn look="lab" onClick={() => setSource('song')} disabled={!midiTracks.length} title={midiTracks.length ? tr('The chords of your MIDI tracks, bar by bar') : tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.')}>{src === 'song' ? '● ' : ''}{tr('From the song')}</Btn>
          <Btn look="lab" onClick={() => setSource('typed')}>{src === 'typed' ? '● ' : ''}{tr('Type them')}</Btn>
          {src === 'typed' && <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Am F C G | Dm G C -" title={tr('Chords like Am, F, C#m7, Bb, G7, Dsus4. "|" separates bars, "-" holds the chord.')}
            style={{ flex: 1, minWidth: 180, height: 26, background: '#0b120d', color: '#7ee787', border: '1px solid #000', borderRadius: 3, fontFamily: G.mono, fontSize: 12.5, padding: '0 8px' }} />}
          {src === 'typed' && <select value={perChord} onChange={(e) => setPerChord(Number(e.target.value))} style={{ background: '#2a2c31', color: '#e5e7eb', border: '1px solid #000', borderRadius: 3, fontSize: 11, height: 26 }}>
            <option value={bpb}>{tr('1 bar per chord')}</option><option value={bpb * 2}>{tr('2 bars per chord')}</option><option value={bpb / 2}>{tr('half a bar per chord')}</option></select>}
          <span style={{ flex: src === 'typed' ? 0 : 1 }} />
          <Btn look="lab" onClick={() => setSeed(seed + 1)} title={tr('Another take: the players play the part a little differently')}>{trf('Take {n}', { n: seed })}</Btn>
          <Btn look="lab" onClick={() => { if (!needChords()) { addDrums(); done(tr('Drummer')); return } addDrums(); addBass(); addGuitar(); done(tr('The band')) }}>{tr('Add the whole band')}</Btn>
        </div>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', fontFamily: G.mono, fontSize: 11.5 }}>
            {chords.length ? chords.slice(0, 32).map((c, i) => <span key={i} style={{ padding: '2px 7px', background: '#0b120d', color: '#7ee787', border: '1px solid #000', borderRadius: 2 }}>{chordName(c)}</span>)
              : <span style={{ color: '#fbbf24', fontFamily: G.font }}>{src === 'song' ? tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.') : tr('No chords yet')}</span>}
            {bad.length > 0 && <span style={{ color: '#fbbf24', fontFamily: G.font }}>{trf('Not understood: {list}', { list: bad.join(', ') })}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e5e7eb', letterSpacing: '0.1em' }}>{tr('Drummer').toUpperCase()}</span>
            <select value={drum.style} onChange={(e) => setDrum({ ...drum, style: e.target.value as DrumStyle })} style={{ background: '#0b120d', color: '#7ee787', border: '1px solid #000', borderRadius: 3, fontFamily: G.mono, fontSize: 12, height: 28, padding: '0 6px', lineHeight: '26px' }}>
              {DRUM_STYLES.map((d) => <option key={d.id} value={d.id}>{tr(d.label)}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            <Btn look="lab" onClick={() => { addDrums(); done(tr('Drummer')) }}>{tr('Add')}</Btn>
          </div>
          <GreenGrid notes={drumNotes} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <LabPanel title={tr('Groove')} color={PURPLE}>
              <SkinKnob skin="lab" label={tr('Intensity')} value={drum.intensity} min={0} max={1} def={0.5} onChange={(v) => setDrum({ ...drum, intensity: v })} format={pct} size={44} color="#f59e0b" title={tr('Quiet and sparse … full and busy')} />
              <SkinKnob skin="lab" label={tr('Swing')} value={drum.swing} min={0} max={1} def={0} onChange={(v) => setDrum({ ...drum, swing: v })} format={pct} size={44} color="#f59e0b" title={tr('Straight … shuffle (also for bass and guitar)')} />
            </LabPanel>
            <LabPanel title={tr('Feel')} color="#7ee787">
              <SkinKnob skin="lab" label={tr('Feel')} value={drum.humanize} min={0} max={1} def={0.3} onChange={(v) => setDrum({ ...drum, humanize: v })} format={pct} size={44} color={PURPLE} title={tr('Exact … loose, like a person')} />
            </LabPanel>
            <LabPanel title={tr('Fills')} color="#f43f5e">
              {([4, 8, 0] as const).map((f) => <Btn key={f} look="lab" onClick={() => setDrum({ ...drum, fills: f })}>{drum.fills === f ? '● ' : ''}{f ? `${f}` : tr('none')}</Btn>)}
            </LabPanel>
            <LabPanel title={tr('Part')} color="#38bdf8">
              <SkinKnob skin="lab" label={tr('From bar')} value={startBar} min={1} max={128} step={1} def={1} onChange={setStartBar} format={(v) => String(Math.round(v))} size={44} color="#38bdf8" />
              <SkinKnob skin="lab" label={tr('Length')} value={bars} min={1} max={64} step={1} def={8} onChange={setBars} format={(v) => String(Math.round(v))} size={44} color="#38bdf8" />
            </LabPanel>
          </div>
        </div>
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 12 }}>
        {/* bass player: light rack effect with an orange edge */}
        <RackUnit edge={ORANGE} logo="BASS" sub={tr('Bass player')} addLabel={tr('Add')} onAdd={() => { if (needChords()) { addBass(); done(tr('Bass player')) } }}
          side={<>
            <div style={{ alignSelf: 'stretch', background: '#1a1206', border: '1px solid #000', borderRadius: 3, padding: 2 }}><RollView notes={bassNotes} color={ORANGE} height={54} /></div>
            <SkinKnob skin="silver" label="" value={bass.intensity} min={0} max={1} def={0.5} onChange={(v) => setBass({ ...bass, intensity: v })} format={pct} size={58} title={tr('Intensity')} />
            <span style={{ fontSize: 10, color: '#d1d5db', letterSpacing: '0.12em' }}>{tr('Intensity').toUpperCase()}</span>
          </>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={lightLabel}>{tr('Style')}</span>
            <select value={bass.style} onChange={(e) => setBass({ ...bass, style: e.target.value as BassStyle })} style={{ flex: 1, background: '#2a1d0b', color: '#ffb35c', border: '1px solid #000', borderRadius: 3, fontFamily: G.mono, fontSize: 12, height: 28, padding: '0 6px', lineHeight: '26px' }}>
              {BASS_STYLES.map((d) => <option key={d.id} value={d.id}>{tr(d.label)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><span style={lightLabel}>{tr('Feel')}</span>
              <SkinKnob skin="epic" value={bass.humanize} min={0} max={1} def={0.2} onChange={(v) => setBass({ ...bass, humanize: v })} format={pct} size={52} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><span style={lightLabel}>{tr('Swing')}</span>
              <SkinKnob skin="epic" value={drum.swing} min={0} max={1} def={0} onChange={(v) => setDrum({ ...drum, swing: v })} format={pct} size={52} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><span style={lightLabel}>808</span>
              <LedDot on={bass.style === '808'} set={(v) => setBass({ ...bass, style: v ? '808' : 'eighths' })} color={ORANGE} light title={tr('808 bass')} /></div>
          </div>
        </RackUnit>
        {/* guitarist: light rack effect with a blue edge and a VU meter */}
        <RackUnit edge={BLUE} logo="GUITAR" sub={tr('Guitarist')} addLabel={tr('Add')} onAdd={() => { if (needChords()) { addGuitar(); done(tr('Guitarist')) } }}
          side={<>
            <VuMeter value={gtr.intensity} label={gtr.distorted ? 'DRIVE' : 'CLEAN'} />
            <SkinKnob skin="silver" label="" value={gtr.intensity} min={0} max={1} def={0.5} onChange={(v) => setGtr({ ...gtr, intensity: v })} format={pct} size={58} title={tr('Intensity')} />
            <span style={{ fontSize: 10, color: '#d1d5db', letterSpacing: '0.12em' }}>{tr('Intensity').toUpperCase()}</span>
          </>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={lightLabel}>{tr('Style')}</span>
            <select value={gtr.style} onChange={(e) => { const st = GUITAR_STYLES.find((x) => x.id === e.target.value)!; setGtr({ ...gtr, style: st.id, distorted: !!st.distorted }) }} style={{ flex: 1, background: '#0b1a2a', color: '#7cc4ff', border: '1px solid #000', borderRadius: 3, fontFamily: G.mono, fontSize: 12, height: 28, padding: '0 6px', lineHeight: '26px' }}>
              {GUITAR_STYLES.map((d) => <option key={d.id} value={d.id}>{tr(d.label)}</option>)}
            </select>
          </div>
          <div style={{ background: '#0b1a2a', border: '1px solid #000', borderRadius: 3, padding: 2 }}><RollView notes={gtrNotes} color={BLUE} height={50} /></div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><span style={lightLabel}>{tr('Feel')}</span>
              <SkinKnob skin="epic" value={gtr.humanize} min={0} max={1} def={0.25} onChange={(v) => setGtr({ ...gtr, humanize: v })} format={pct} size={52} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><span style={lightLabel}>{tr('Drive')}</span>
              <LedDot on={gtr.distorted} set={(v) => setGtr({ ...gtr, distorted: v })} color={BLUE} light title={tr('Distorted guitar')} /></div>
          </div>
        </RackUnit>
      </div>
      {notice && <div style={{ fontSize: 11.5, color: G.dim }}>{notice}</div>}
    </div>
  )
}

// ── Orchestra: navy multi-voice harmonizer front ────────────────────────────

function NavySection({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <div style={{ border: '1px solid #3a5577', borderRadius: 3, background: 'rgba(10,18,32,0.35)', ...style }}>
      <div style={{ textAlign: 'center', fontFamily: G.font, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: '#cfe8ff', background: 'linear-gradient(180deg, #2e4766, #1e3149)', borderBottom: '1px solid #3a5577', padding: '3px 0' }}>{title}</div>
      <div style={{ padding: 10, display: 'flex', gap: 14, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Orchestra({ preset }: { preset: string }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const status = useStatus()
  const [list, setList] = useState<AiInstrument[]>(ORCHESTRA)
  const [trackId, setTrackId] = useState(preset)
  const [inst, setInst] = useState('violin')
  const [ex, setEx] = useState({ vibrato: 1, dynamics: 1, brightness: 1, attack: 1, velocity: 0.5 })
  const [voices, setVoices] = useState(4)
  const [transpose, setTranspose] = useState(0)
  const [mute, setMute] = useState(true)
  const [job, setJob] = useState<InstrumentJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => { api.instruments.list().then(setList).catch(() => setList(ORCHESTRA)) }, [])
  // a click on an instrument chooses it and plays its demo at once (a finished recording); a second click stops it
  const [playing, setPlaying] = useState<string | null>(null)
  const pickInst = (i: AiInstrument): void => {
    setInst(i.id)
    void import('../../audio/engine').then(async (m) => {
      if (playing === i.id || !i.demo) { m.stopPreview(); setPlaying(null); return }
      setPlaying(i.id)
      const r = await m.previewSample(i.demo)
      if (!r) { setPlaying(null); return }
      void r.ended.then(() => setPlaying((cur) => (cur === i.id ? null : cur)))
    })
  }
  useEffect(() => () => { void import('../../audio/engine').then((m) => m.stopPreview()) }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const tracks = project.tracks.filter((t) => t.type === 'midi' && notesOf(t).length)
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0]
  const current = list.find((i) => i.id === inst)
  const outside = track && current ? notesOf(track).filter((n) => n.pitch + transpose < current.low || n.pitch + transpose > current.high).length : 0
  const run = async (): Promise<void> => {
    if (!track) return
    setError(null)
    const { from, notes } = partOf(project, track)
    const t0 = beatToSec(project, from)
    try {
      const { jobId } = await api.instruments.play({
        instrument: inst, voices, transpose, expression: ex, title: `${current?.name ?? inst} (AI) – ${track.name}`,
        notes: notes.map((n) => ({ pitch: n.pitch, start: beatToSec(project, n.start) - t0, end: beatToSec(project, n.start + n.duration) - t0, velocity: n.velocity })),
      })
      const poll = async (): Promise<void> => {
        const j = await api.instruments.job(jobId)
        setJob(j)
        if (j.status === 'done' && j.audio_file) { const p = await placeAudio(j.audio_file, `${current?.name ?? inst} (AI)`, from, mute ? track.id : undefined); if (p) setError(p); return }
        if (j.status === 'error') { setError(j.error ?? tr('The AI instrument failed.')); return }
        if (j.status === 'cancelled') return
        timer.current = window.setTimeout(() => void poll(), 1000)
      }
      void poll()
    } catch (e) { setError((e as Error).message) }
  }
  const busy = !!job && (job.status === 'queued' || job.status === 'running')
  const cats = [...new Set(list.map((i) => i.category))]
  const CY = '#38bdf8'
  return (
    <section style={{ flexShrink: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #0a1220', boxShadow: '0 10px 24px rgba(0,0,0,0.5)', fontFamily: G.font,
      background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px), linear-gradient(180deg, #2a3c55 0%, #1b2a3f 100%)' }}
      title={tr('A MIDI track played by AI like a real musician (MIDI-DDSP): bow, breath, vibrato. On the processor.')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: '1px solid #0a1220', background: 'rgba(5,10,20,0.35)' }}>
        <span style={{ fontFamily: G.font, fontSize: 15, fontStyle: 'italic', fontWeight: 700, color: '#e0f2fe' }}>AMS</span>
        <span style={{ fontFamily: G.font, fontSize: 12, letterSpacing: '0.3em', color: '#cfe8ff' }}>{tr('Orchestra').toUpperCase()} ENGINE</span>
        <span style={{ fontSize: 10, color: '#7aa5cc', letterSpacing: '0.12em' }}>MIDI-DDSP</span>
        <span style={{ flex: 1 }} />
        {busy && <Btn look="antares" onClick={() => { clearTimeout(timer.current); void api.instruments.cancel(job!.id); setJob({ ...job!, status: 'cancelled', text: tr('Cancelled') }) }}>{tr('Cancel')}</Btn>}
        <Btn look="antares" onClick={() => void run()} disabled={!track || busy || !status?.ddsp}>{tr('Render')}</Btn>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status && !status.ddsp && <div style={{ fontSize: 11.5, color: '#fbbf24' }}>{tr('Not installed yet: Settings → AI Engines → "AI Instruments (MIDI-DDSP)" → Install selected (about 1.5 GB, once).')}</div>}
        {!status && <div style={{ fontSize: 11.5, color: '#fbbf24' }}>{tr('The AI backend is not running: start it in Settings → AI Engines.')}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <NavySection title={tr('Instrument').toUpperCase()} style={{ gridRow: 'span 2' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {tracks.length ? (
                <select value={track?.id} onChange={(e) => setTrackId(e.target.value)} style={{ background: '#0a1220', color: '#7dd3fc', border: '1px solid #3a5577', borderRadius: 3, height: 24, fontSize: 11.5 }}>
                  {tracks.map((t) => <option key={t.id} value={t.id}>{t.name} · {trf('{n} notes', { n: notesOf(t).length })}</option>)}
                </select>
              ) : <span style={{ fontSize: 11, color: '#fbbf24' }}>{tr('No MIDI track with notes yet: write notes or make a song with the song generator first.')}</span>}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, cats.length)}, 1fr)`, gap: 6 }}>
                {cats.map((c) => (
                  <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.12em', color: '#7aa5cc', textAlign: 'center' }}>{tr(c).toUpperCase()}</span>
                    {list.filter((i) => i.category === c).map((i) => {
                      const on = inst === i.id
                      return <button key={i.id} onClick={() => pickInst(i)} title={i.demo ? tr('Click: choose and listen (click again: stop)') : undefined} style={{ border: '1px solid #0a1220', borderRadius: 2, padding: '4px 4px', fontSize: 11, cursor: 'pointer', fontFamily: G.font,
                        background: on ? 'linear-gradient(180deg, #1d6fa5, #155682)' : 'linear-gradient(180deg, #24364e, #1a283b)', color: on ? '#fff' : '#a7c2dd', boxShadow: on ? '0 0 8px rgba(56,189,248,0.5)' : undefined }}>{i.demo ? (playing === i.id ? '■ ' : '▶ ') : ''}{tr(i.name)}</button>
                    })}
                  </div>
                ))}
              </div>
              {outside > 0 && <span style={{ fontSize: 10.5, color: '#fbbf24' }}>{trf('{n} notes are outside the range of this instrument: they are moved by octaves (or use Transpose).', { n: outside })}</span>}
            </div>
          </NavySection>
          <NavySection title={tr('Expression').toUpperCase()}>
            <Fader label={tr('Vibrato')} value={ex.vibrato} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, vibrato: v })} format={pct} color={CY} />
            <Fader label={tr('Dynamics')} value={ex.dynamics} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, dynamics: v })} format={pct} color={CY} />
            <Fader label={tr('Brightness')} value={ex.brightness} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, brightness: v })} format={pct} color={CY} />
            <Fader label={tr('Attack')} value={ex.attack} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, attack: v })} format={pct} color={CY} />
          </NavySection>
          <NavySection title={tr('Players').toUpperCase()}>
            <SkinKnob skin="antares" label={tr('Velocity')} value={ex.velocity} min={0} max={1} def={0.5} onChange={(v) => setEx({ ...ex, velocity: v })} format={pct} size={38} color={CY} title={tr('How much the velocities of your notes count')} />
            <SkinKnob skin="antares" label={tr('Players')} value={voices} min={1} max={8} step={1} def={4} onChange={setVoices} format={(v) => String(Math.round(v))} size={38} color={CY} title={tr('Players for chords')} />
            <SkinKnob skin="antares" label={tr('Transpose')} value={transpose} min={-24} max={24} step={1} def={0} onChange={setTranspose} format={(v) => (v > 0 ? `+${v}` : String(v))} size={38} color={CY} bipolar />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LedDot on={mute} set={setMute} color={CY} title={tr('Mute the MIDI track afterwards')} /><span style={{ fontSize: 10, color: '#9fb4cc' }}>{tr('Mute MIDI')}</span></div>
          </NavySection>
        </div>
        {job && <Meter value={job.status === 'done' ? 1 : job.progress} color={CY} text={`${tr(job.text)}${busy ? ` · ${Math.round(job.elapsed)} s` : ''}${job.status === 'done' ? ` · ${tr('The audio track is in the Studio and in the Library (AI Instruments).')}` : ''}`} />}
        {error && <div style={{ fontSize: 11.5, color: '#fbbf24' }}>{error}</div>}
      </div>
    </section>
  )
}

// ── Text Instrument: the vocal-plugin front in its dark version ─────────────

function TextInstrument({ preset }: { preset: string }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const status = useStatus()
  const [trackId, setTrackId] = useState(preset)
  const [style, setStyle] = useState('electric guitar, overdrive')
  const [strength, setStrength] = useState(0.55)
  const [mute, setMute] = useState(true)
  const [job, setJob] = useState<MusicJob | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const tracks = project.tracks.filter((t) => t.type === 'midi' && notesOf(t).length)
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0]
  const run = async (): Promise<void> => {
    if (!track) return
    setError(null); setJob(null)
    try {
      setStage(tr('Playing the MIDI track as a guide …'))
      const { from, to } = partOf(project, track)
      const end = Math.ceil(to / 4) * 4
      const buf = await renderMidiGuide(project, track, from, end)
      const path = await window.api.files.saveRecording(encodeWav(buf, 16))
      putBuffer(path, buf)
      setStage(null)
      const seconds = Math.max(10, Math.min(600, Math.round(beatToSec(project, end) - beatToSec(project, from))))
      const { jobId } = await api.music.generate({
        engine: 'ace-step', prompt: `${style}, solo instrument, instrumental`, instrumental: true, duration: seconds, bpm: Math.round(project.bpm),
        source_track: path, source_task: 'cover', source_strength: strength, title: `${style} (AI cover) – ${track.name}`, tags: ['ai instrument', 'cover'], songs: 1, variations: 1, queue: 1,
      })
      const poll = async (): Promise<void> => {
        const j = await api.music.job(jobId)
        setJob(j)
        if (j.status === 'done' && j.audio_file) { const p = await placeAudio(j.audio_file, `${style} (AI)`, from, mute ? track.id : undefined); if (p) setError(p); return }
        if (j.status === 'error') { setError(j.error ?? tr('The AI cover failed.')); return }
        if (j.status === 'cancelled') return
        timer.current = window.setTimeout(() => void poll(), 1500)
      }
      void poll()
    } catch (e) { setStage(null); setError((e as Error).message) }
  }
  const running = !!job && (job.status === 'queued' || job.status === 'running')
  const busy = !!stage || running
  return (
    <section style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #000', boxShadow: '0 10px 24px rgba(0,0,0,0.5)', fontFamily: G.font, background: 'linear-gradient(180deg, #2b3138 0%, #1c2127 100%)' }}
      title={tr('Describe any instrument or style: ACE-Step plays your MIDI track with it. Fast with an NVIDIA card.')}>
      <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Wordmark a="Text" b="Instrument" color="#e5e7eb" />
            <span style={{ flex: 1 }} />
            {running && <Btn look="silk" onClick={() => { void api.music.cancel(job!.id) }}>{tr('Cancel')}</Btn>}
            <Btn look="silk" onClick={() => void run()} disabled={!track || busy || !status?.ace}>{tr('Render')}</Btn>
          </div>
          {status && !status.ace && <span style={{ fontSize: 11.5, color: '#fbbf24' }}>{tr('ACE-Step is not installed: Settings → AI Engines → "Music generator (ACE-Step)".')}</span>}
          {status && status.ace && !status.cuda && <span style={{ fontSize: 11.5, color: '#fbbf24' }}>{tr('No NVIDIA graphics card found: this runs on the processor and can take an hour or more for one minute of music.')}</span>}
          {tracks.length ? <Pill value={track?.id ?? ''} onChange={setTrackId} width={320} options={tracks.map((t) => ({ id: t.id, label: `${t.name} · ${trf('{n} notes', { n: notesOf(t).length })}` }))} />
            : <span style={{ fontSize: 11.5, color: '#fbbf24' }}>{tr('No MIDI track with notes yet: write notes or make a song with the song generator first.')}</span>}
          <input value={style} onChange={(e) => setStyle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={tr('e.g. electric guitar, overdrive')} title={tr('Instrument / style (type here)')}
            style={{ height: 34, background: '#0d1722', color: '#bae6fd', border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 8px #000', fontFamily: G.mono, fontSize: 13.5, padding: '0 12px' }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {COVER_IDEAS.map((c) => <button key={c} onClick={() => setStyle(c)} style={{ padding: '3px 9px', borderRadius: 12, fontSize: 10.5, cursor: 'pointer', fontFamily: G.font, border: '1px solid #000',
              background: style === c ? '#22c3ee' : '#262c33', color: style === c ? '#06222b' : '#9ca3af' }}>{c}</button>)}
          </div>
        </div>
        <SkinKnob skin="silk" label={tr('Follow the notes')} value={strength} min={0} max={1} def={0.55} onChange={setStrength} format={pct} size={128} color={CYAN} low={tr('free')} high={tr('close')} dark
          title={tr('Low: the AI plays freely in the style. High: it stays close to your notes and timing.')} />
      </div>
      <div style={{ background: 'linear-gradient(180deg, #232930, #1a1f25)', borderTop: '1px solid #000', padding: '10px 18px', display: 'flex', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LedDot on={mute} set={setMute} color={CYAN} title={tr('Mute the MIDI track afterwards')} /><span style={{ fontSize: 11, color: '#cbd5e1' }}>{tr('Mute MIDI')}</span></div>
        {(stage || job) && <Meter color={CYAN} value={stage ? 0.03 : job!.status === 'done' ? 1 : job!.step_total ? (job!.step ?? 0) / job!.step_total : 0.05}
          text={stage ?? (job!.status === 'done' ? tr('The audio track is in the Studio and in the Library.') : tr(job!.stage_text ?? job!.status))} />}
        {error && <span style={{ fontSize: 11.5, color: '#fbbf24' }}>{error}</span>}
      </div>
    </section>
  )
}

export function AiInstruments(): React.ReactElement {
  const preset = useUIStore((s) => s.aiTrackId) ?? ''
  const bpm = useProjectStore((s) => s.project.bpm)
  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14,
      background: 'radial-gradient(ellipse at 30% 0%, #23262d 0%, #141519 60%)', fontFamily: G.font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 15, color: G.text, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 300 }}><b style={{ fontWeight: 800 }}>AI</b> {tr('Instruments')}</span>
        <span style={{ fontSize: 11, color: G.faint }}>{trf('Tempo {bpm} BPM: the parts are made for the tempo of the project.', { bpm: Math.round(bpm) })}</span>
      </div>
      <SoundPackCard compact />
      <SongGenerator />
      <Band />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: 14, flexShrink: 0 }}>
        <Orchestra preset={preset} />
        <TextInstrument preset={preset} />
      </div>
    </div>
  )
}
