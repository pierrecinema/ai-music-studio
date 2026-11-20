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
import { importAudioFiles } from '../timeline/Timeline'
import {
  BASS_STYLES, DRUM_STYLES, GUITAR_STYLES, bassist, chordName, detectChords, drummer, fillChords, guitarist, parseProgression,
  type BandNote, type BassStyle, type Chord, type DrumStyle, type GuitarStyle,
} from '../../lib/band'
import { GENRES, SECTION_LABEL, generateSong, type Mode } from '../../lib/songgen'
import { Device, G, Key, Knob, Label, Led, Meter, RollView, Screen, ScreenInput, Selector, StepView, Strip } from './gear'
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
function addPartTrack(name: string, sound: Track['sound'], color: string, notes: BandNote[], startBeat: number, beats: number): void {
  useProjectStore.getState().addTrack('midi')
  const tracks = useProjectStore.getState().project.tracks
  const id = tracks[tracks.length - 1].id
  useProjectStore.getState().updateTrack(id, { name, sound, color })
  useProjectStore.getState().addClip(id, { startTime: startBeat, duration: beats, name, notes: notes.map((n) => ({ ...n, id: nanoid() })) })
  useProjectStore.getState().selectTrack(id)
}

// ── Song Generator ──────────────────────────────────────────────────────────

const PART_COLORS: Record<string, string> = { melody: '#a855f7', chords: '#22d3ee', bass: '#3b82f6', drums: '#f43f5e', guitar: '#f59e0b' }
const SECTION_COLORS: Record<string, string> = { intro: '#475569', verse: '#2563eb', pre: '#7c3aed', chorus: '#db2777', bridge: '#0d9488', drop: '#ea580c', outro: '#475569' }

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
  const firstChorus = song.sections.find((s) => s.kind === 'chorus' || s.kind === 'drop') ?? song.sections[0]

  const make = (): void => {
    const st = useProjectStore.getState()
    if (setTempo) st.setBpm(bpm)
    const end = Math.max(0, ...st.project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)))
    const start = Math.ceil(end / 4) * 4
    const keyName = `${KEY_NAMES[key]}${mode === 'minor' ? 'm' : ''}`
    for (const p of song.parts) addPartTrack(`${tr(p.name)} (${tr(g.label)}, ${keyName})`, p.sound, PART_COLORS[p.id], p.notes, start, song.bars * 4)
    if (markers) for (const s of song.sections) {
      const id = useProjectStore.getState().addMarker(start + s.bar * 4)
      useProjectStore.getState().updateMarker(id, { name: tr(SECTION_LABEL[s.kind]) })
    }
    setNotice(trf('The song is in the Studio from bar {bar}: {n} MIDI tracks, {bars} bars. Every part can be edited in the Piano Roll and played by any instrument.', { bar: start / 4 + 1, n: song.parts.length, bars: song.bars }))
  }

  return (
    <Device brand="AMS" name={tr('Song Generator')} color={COL.song} hint={tr('A whole song as MIDI: chords, melody, keys, bass, drums and guitar, with intro, verse, chorus and bridge.')}
      right={<><Key onClick={() => setTake(take + 1)} title={tr('Another version: other chords, melody and grooves')}>{trf('Take {n}', { n: take })}</Key><Key accent color={COL.song} onClick={make}>{tr('Create')}</Key></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) auto minmax(280px, 1fr)', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Screen label={tr('Genre')} value={genre} options={GENRES.map((x) => ({ id: x.id, label: tr(x.label) }))} onChange={pick} width="100%" color="#d8b4fe" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <Screen label={tr('Key')} value={key} options={KEY_NAMES.map((n, i) => ({ id: i, label: n }))} onChange={setKey} width={110} color="#d8b4fe" />
            <Selector label={tr('Scale')} value={mode} onChange={setMode} color="#d8b4fe" options={[{ id: 'major', label: tr('Major') }, { id: 'minor', label: tr('Minor') }]} />
          </div>
        </div>
        <Knob label={tr('Tempo')} value={bpm} min={60} max={180} step={1} def={g.bpm} onChange={setBpm} format={(v) => `${Math.round(v)}`} size={104} valueInside color={COL.song} low="60" high="180" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <Label>{trf('{bars} bars · {min}:{sec} min', { bars: song.bars, min: Math.floor(length / 60), sec: String(length % 60).padStart(2, '0') })}</Label>
          <div style={{ display: 'flex', gap: 2, height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid #000', background: G.screen, padding: 2 }}>
            {song.sections.map((s, i) => (
              <div key={i} title={`${tr(SECTION_LABEL[s.kind])}: ${s.bars} ${tr('bars')}`} style={{ flex: s.bars, borderRadius: 3, background: `linear-gradient(180deg, ${SECTION_COLORS[s.kind]}, color-mix(in srgb, ${SECTION_COLORS[s.kind]} 60%, black))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{tr(SECTION_LABEL[s.kind])}</div>
            ))}
          </div>
          <RollView notes={melody.notes.filter((n) => n.startTime >= firstChorus.bar * 4).map((n) => ({ ...n, startTime: n.startTime - firstChorus.bar * 4 }))} beats={16} color={COL.song} height={58} />
          <div style={{ fontFamily: G.mono, fontSize: 11, color: '#d8b4fe' }}>{song.chords.slice(0, 8).map((c) => chordName(c)).join('  ')} …</div>
        </div>
      </div>
      <Strip>
        {(['melody', 'chords', 'bass', 'drums', 'guitar'] as const).map((p) => (
          <Led key={p} label={tr({ melody: 'Melody', chords: 'Keys', bass: 'Bass', drums: 'Drums', guitar: 'Guitar' }[p])} on={parts[p]} set={(v) => setParts({ ...parts, [p]: v })} color={PART_COLORS[p]} />
        ))}
        <span style={{ width: 1, alignSelf: 'stretch', background: '#000', margin: '0 6px' }} />
        <Led label={tr('Tempo')} on={setTempo} set={setSetTempo} color={COL.song} title={tr('Set the project tempo')} />
        <Led label={tr('Markers')} on={markers} set={setMarkers} color={COL.song} title={tr('Markers for the parts')} />
      </Strip>
      {notice && <Note>{notice}</Note>}
    </Device>
  )
}

// ── Band ────────────────────────────────────────────────────────────────────

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

  const addDrums = (): void => addPartTrack(`${tr('Drummer')} (${tr(DRUM_STYLES.find((d) => d.id === drum.style)!.label)})`, 'drums', COL.drums, drumNotes, startBeat, beats)
  const addBass = (): void => addPartTrack(`${tr('Bass player')} (${tr(BASS_STYLES.find((d) => d.id === bass.style)!.label)})`, bass.style === '808' ? '808' : 'bass', COL.bass, bassNotes, startBeat, beats)
  const addGuitar = (): void => addPartTrack(`${tr('Guitarist')} (${tr(GUITAR_STYLES.find((d) => d.id === gtr.style)!.label)})`, gtr.distorted ? 'eguitar' : 'guitar', COL.guitar, gtrNotes, startBeat, beats)
  const needChords = (): boolean => {
    if (chords.length) return true
    setNotice(src === 'song' ? tr('No chords found in this part of the song: type the chords instead.') : tr('Type the chords of the song first, for example: Am F C G'))
    return false
  }
  const done = (what: string): void => setNotice(trf('{what} is in the Studio: a new MIDI track at bar {bar}. Change its sound with KA → Instrument in its track (any VST instrument too).', { what, bar: startBar }))

  const player = (title: string, color: string, style: React.ReactNode, view: React.ReactNode, knobs: React.ReactNode, extra: React.ReactNode, add: () => void): React.ReactElement => (
    <Device brand={title} name="" color={color} style={{ background: 'linear-gradient(180deg, #2c2f35, #212328)' }} right={<Key accent color={color} onClick={add}>{tr('Add')}</Key>}>
      {style}
      {view}
      <Strip style={{ justifyContent: 'space-around' }}>{knobs}</Strip>
      {extra}
    </Device>
  )

  return (
    <Device brand="AMS" name={tr('Band')} color={COL.band} hint={tr('Drummer, bass player and guitarist play along with the chords of your song. MIDI, every PC.')}
      right={<><Key onClick={() => setSeed(seed + 1)} title={tr('Another take: the players play the part a little differently')}>{trf('Take {n}', { n: seed })}</Key>
        <Key accent color={COL.band} onClick={() => { if (!needChords()) { addDrums(); done(tr('Drummer')); return } addDrums(); addBass(); addGuitar(); done(tr('The band')) }}>{tr('Add the whole band')}</Key></>}>
      <Strip style={{ alignItems: 'flex-end' }}>
        <Selector label={tr('Chords')} value={src} onChange={setSource} color={COL.band} options={[
          { id: 'song', label: tr('From the song'), disabled: !midiTracks.length, hint: midiTracks.length ? tr('The chords of your MIDI tracks, bar by bar') : tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.') },
          { id: 'typed', label: tr('Type them') }]} />
        {src === 'typed' && <ScreenInput label={tr('Chords (type here)')} value={typed} set={setTyped} placeholder="Am F C G | Dm G C -" color="#fda4af" />}
        {src === 'typed' && <Screen label={tr('Each chord')} value={perChord} onChange={setPerChord} width={130} color="#fda4af" options={[{ id: bpb, label: tr('1 bar') }, { id: bpb * 2, label: tr('2 bars') }, { id: bpb / 2, label: tr('½ bar') }]} />}
        <Knob label={tr('From bar')} value={startBar} min={1} max={128} step={1} def={1} onChange={setStartBar} format={(v) => String(Math.round(v))} size={46} color={COL.band} valueInside />
        <Knob label={tr('Length')} value={bars} min={1} max={64} step={1} def={8} onChange={setBars} format={(v) => String(Math.round(v))} size={46} color={COL.band} valueInside />
      </Strip>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {chords.length ? chords.slice(0, 24).map((c, i) => (
          <span key={i} style={{ padding: '3px 8px', borderRadius: 4, background: G.screen, border: '1px solid #000', color: '#fda4af', fontFamily: G.mono, fontSize: 11.5, boxShadow: 'inset 0 1px 4px #000' }}>{chordName(c)}</span>
        )) : <Note warn>{src === 'song' ? tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.') : tr('No chords yet')}</Note>}
        {bad.length > 0 && <Note warn>{trf('Not understood: {list}', { list: bad.join(', ') })}</Note>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {player(tr('Drummer'), COL.drums,
          <Screen value={drum.style} onChange={(v) => setDrum({ ...drum, style: v })} options={DRUM_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" color="#fda4af" />,
          <StepView notes={drumNotes} color={COL.drums} />,
          <>
            <Knob label={tr('Intensity')} value={drum.intensity} min={0} max={1} def={0.5} onChange={(v) => setDrum({ ...drum, intensity: v })} format={pct} size={66} valueInside color={COL.drums} title={tr('Quiet and sparse … full and busy')} />
            <Knob label={tr('Feel')} value={drum.humanize} min={0} max={1} def={0.3} onChange={(v) => setDrum({ ...drum, humanize: v })} format={pct} size={50} valueInside color={COL.drums} title={tr('Exact … loose, like a person')} />
            <Knob label={tr('Swing')} value={drum.swing} min={0} max={1} def={0} onChange={(v) => setDrum({ ...drum, swing: v })} format={pct} size={50} valueInside color={COL.drums} title={tr('Straight … shuffle (also for bass and guitar)')} />
          </>,
          <Selector label={tr('Fills')} value={drum.fills} onChange={(v) => setDrum({ ...drum, fills: v })} color="#fda4af" options={[{ id: 4, label: tr('every 4 bars') }, { id: 8, label: tr('every 8 bars') }, { id: 0, label: tr('none') }]} />,
          () => { addDrums(); done(tr('Drummer')) })}
        {player(tr('Bass player'), COL.bass,
          <Screen value={bass.style} onChange={(v) => setBass({ ...bass, style: v })} options={BASS_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" color="#93c5fd" />,
          <RollView notes={bassNotes} color={COL.bass} height={74} />,
          <>
            <Knob label={tr('Intensity')} value={bass.intensity} min={0} max={1} def={0.5} onChange={(v) => setBass({ ...bass, intensity: v })} format={pct} size={66} valueInside color={COL.bass} />
            <Knob label={tr('Feel')} value={bass.humanize} min={0} max={1} def={0.2} onChange={(v) => setBass({ ...bass, humanize: v })} format={pct} size={50} valueInside color={COL.bass} />
          </>,
          null,
          () => { if (needChords()) { addBass(); done(tr('Bass player')) } })}
        {player(tr('Guitarist'), COL.guitar,
          <Screen value={gtr.style} onChange={(v) => { const st = GUITAR_STYLES.find((x) => x.id === v)!; setGtr({ ...gtr, style: v, distorted: !!st.distorted }) }} options={GUITAR_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" color="#fcd34d" />,
          <RollView notes={gtrNotes} color={COL.guitar} height={74} />,
          <>
            <Knob label={tr('Intensity')} value={gtr.intensity} min={0} max={1} def={0.5} onChange={(v) => setGtr({ ...gtr, intensity: v })} format={pct} size={66} valueInside color={COL.guitar} />
            <Knob label={tr('Feel')} value={gtr.humanize} min={0} max={1} def={0.25} onChange={(v) => setGtr({ ...gtr, humanize: v })} format={pct} size={50} valueInside color={COL.guitar} />
            <Led label={tr('Drive')} on={gtr.distorted} set={(v) => setGtr({ ...gtr, distorted: v })} color={COL.guitar} title={tr('Distorted guitar')} />
          </>,
          null,
          () => { if (needChords()) { addGuitar(); done(tr('Guitarist')) } })}
      </div>
      {notice && <Note>{notice}</Note>}
    </Device>
  )
}

// ── Orchestra (MIDI-DDSP) ───────────────────────────────────────────────────

function useStatus(): { ddsp: boolean; ace: boolean; cuda: boolean } | null {
  const [s, setS] = useState<{ ddsp: boolean; ace: boolean; cuda: boolean } | null>(null)
  useEffect(() => { let on = true; api.instruments.status().then((x) => on && setS(x)).catch(() => on && setS(null)); return () => { on = false } }, [])
  return s
}

function TrackScreen({ value, set, color }: { value: string; set: (id: string) => void; color: string }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const tracks = project.tracks.filter((t) => t.type === 'midi' && notesOf(t).length)
  if (!tracks.length) return <Note warn>{tr('No MIDI track with notes yet: write notes or make a song with the song generator first.')}</Note>
  return <Screen label={tr('MIDI track')} value={value || tracks[0].id} onChange={set} width="100%" color={color} options={tracks.map((t) => ({ id: t.id, label: `${t.name} · ${trf('{n} notes', { n: notesOf(t).length })}` }))} />
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
        if (j.status === 'done' && j.audio_file) {
          const p = await placeAudio(j.audio_file, `${current?.name ?? inst} (AI)`, from, mute ? track.id : undefined)
          if (p) setError(p)
          return
        }
        if (j.status === 'error') { setError(j.error ?? tr('The AI instrument failed.')); return }
        if (j.status === 'cancelled') return
        timer.current = window.setTimeout(() => void poll(), 1000)
      }
      void poll()
    } catch (e) { setError((e as Error).message) }
  }
  const busy = !!job && (job.status === 'queued' || job.status === 'running')
  const cats = [...new Set(list.map((i) => i.category))]

  return (
    <Device brand="AMS" name={tr('Orchestra')} color={COL.orch} hint={tr('A MIDI track played by AI like a real musician (MIDI-DDSP): bow, breath, vibrato. On the processor.')}
      right={<>{busy && <Key onClick={() => { clearTimeout(timer.current); void api.instruments.cancel(job!.id); setJob({ ...job!, status: 'cancelled', text: tr('Cancelled') }) }}>{tr('Cancel')}</Key>}
        <Key accent color={COL.orch} onClick={() => void run()} disabled={!track || busy || !status?.ddsp}>{tr('Render')}</Key></>}>
      {status && !status.ddsp && <Note warn>{tr('Not installed yet: Settings → AI Engines → "AI Instruments (MIDI-DDSP)" → Install selected (about 1.5 GB, once).')}</Note>}
      {!status && <Note warn>{tr('The AI backend is not running: start it in Settings → AI Engines.')}</Note>}
      <TrackScreen value={track?.id ?? ''} set={setTrackId} color="#86efac" />
      {/* the instruments as a three-column browser */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, cats.length)}, 1fr)`, gap: 8, background: G.screen, border: '1px solid #000', borderRadius: 6, padding: 8, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)' }}>
        {cats.map((c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Label style={{ color: G.faint, marginBottom: 2 }}>{tr(c)}</Label>
            {list.filter((i) => i.category === c).map((i) => {
              const on = inst === i.id
              return (
                <button key={i.id} onClick={() => setInst(i.id)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 4, padding: '4px 6px', cursor: 'pointer',
                  background: on ? 'rgba(34,197,94,0.14)' : 'transparent', color: on ? '#bbf7d0' : G.dim, fontFamily: G.font, fontSize: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? COL.orch : '#2b2f36', boxShadow: on ? `0 0 6px ${COL.orch}` : undefined }} />
                  {tr(i.name)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {outside > 0 && <Note warn>{trf('{n} notes are outside the range of this instrument: they are moved by octaves (or use Transpose).', { n: outside })}</Note>}
      <Strip style={{ justifyContent: 'space-around' }}>
        <Knob label={tr('Vibrato')} value={ex.vibrato} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, vibrato: v })} format={pct} size={62} valueInside color={COL.orch} />
        <Knob label={tr('Dynamics')} value={ex.dynamics} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, dynamics: v })} format={pct} size={62} valueInside color={COL.orch} title={tr('How loud and how much the volume moves within a note')} />
        <Knob label={tr('Brightness')} value={ex.brightness} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, brightness: v })} format={pct} size={62} valueInside color={COL.orch} />
        <Knob label={tr('Attack')} value={ex.attack} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, attack: v })} format={pct} size={62} valueInside color={COL.orch} title={tr('How sharply the notes start')} />
      </Strip>
      <Strip style={{ justifyContent: 'space-around' }}>
        <Knob label={tr('Velocity')} value={ex.velocity} min={0} max={1} def={0.5} onChange={(v) => setEx({ ...ex, velocity: v })} format={pct} size={46} valueInside color={COL.orch} title={tr('How much the velocities of your notes count')} />
        <Knob label={tr('Players')} value={voices} min={1} max={8} step={1} def={4} onChange={setVoices} format={(v) => String(Math.round(v))} size={46} valueInside color={COL.orch} title={tr('Players for chords')} />
        <Knob label={tr('Transpose')} value={transpose} min={-24} max={24} step={1} def={0} onChange={setTranspose} format={(v) => (v > 0 ? `+${v}` : String(v))} size={46} valueInside color={COL.orch} bipolar />
        <Led label={tr('Mute MIDI')} on={mute} set={setMute} color={COL.orch} title={tr('Mute the MIDI track afterwards')} />
      </Strip>
      {job && <Meter value={job.status === 'done' ? 1 : job.progress} color={COL.orch}
        text={`${tr(job.text)}${busy ? ` · ${Math.round(job.elapsed)} s` : ''}${job.status === 'done' ? ` · ${tr('The audio track is in the Studio and in the Library (AI Instruments).')}` : ''}`} />}
      {error && <Note warn>{error}</Note>}
    </Device>
  )
}

// ── Text Instrument (ACE-Step cover) ────────────────────────────────────────

const COVER_IDEAS = ['electric guitar, overdrive', 'acoustic guitar, fingerpicked', 'grand piano', 'jazz piano trio', 'rhodes electric piano', 'string orchestra',
  'solo cello', 'saxophone, smooth jazz', 'sitar', 'kalimba', 'synth lead, 80s', 'church organ', 'brass section, funk', 'harp', 'marimba', 'pan flute']

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
        source_track: path, source_task: 'cover', source_strength: strength, title: `${style} (AI cover) – ${track.name}`, tags: ['ai instrument', 'cover'],
        songs: 1, variations: 1, queue: 1,
      })
      const poll = async (): Promise<void> => {
        const j = await api.music.job(jobId)
        setJob(j)
        if (j.status === 'done' && j.audio_file) {
          const p = await placeAudio(j.audio_file, `${style} (AI)`, from, mute ? track.id : undefined)
          if (p) setError(p)
          return
        }
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
    <Device brand="AMS" name={tr('Text Instrument')} color={COL.text} hint={tr('Describe any instrument or style: ACE-Step plays your MIDI track with it. Fast with an NVIDIA card.')}
      right={<>{running && <Key onClick={() => { void api.music.cancel(job!.id) }}>{tr('Cancel')}</Key>}
        <Key accent color={COL.text} onClick={() => void run()} disabled={!track || busy || !status?.ace}>{tr('Render')}</Key></>}>
      {status && !status.ace && <Note warn>{tr('ACE-Step is not installed: Settings → AI Engines → "Music generator (ACE-Step)".')}</Note>}
      {status && status.ace && !status.cuda && <Note warn>{tr('No NVIDIA graphics card found: this runs on the processor and can take an hour or more for one minute of music.')}</Note>}
      <TrackScreen value={track?.id ?? ''} set={setTrackId} color="#7dd3fc" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ScreenInput label={tr('Instrument / style (type here)')} value={style} set={setStyle} placeholder={tr('e.g. electric guitar, overdrive')} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {COVER_IDEAS.map((c) => (
              <button key={c} onClick={() => setStyle(c)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10.5, cursor: 'pointer', fontFamily: G.font, border: '1px solid #000',
                background: style === c ? 'rgba(56,189,248,0.18)' : '#1b1e23', color: style === c ? '#bae6fd' : G.dim }}>{c}</button>
            ))}
          </div>
        </div>
        <Knob label={tr('Follow the notes')} value={strength} min={0} max={1} def={0.55} onChange={setStrength} format={pct} size={84} valueInside color={COL.text} low={tr('free')} high={tr('close')}
          title={tr('Low: the AI plays freely in the style. High: it stays close to your notes and timing.')} />
      </div>
      <Strip><Led label={tr('Mute MIDI')} on={mute} set={setMute} color={COL.text} title={tr('Mute the MIDI track afterwards')} />
        {(stage || job) && <Meter color={COL.text} value={stage ? 0.03 : job!.status === 'done' ? 1 : job!.step_total ? (job!.step ?? 0) / job!.step_total : 0.05}
          text={stage ?? (job!.status === 'done' ? tr('The audio track is in the Studio and in the Library.') : tr(job!.stage_text ?? job!.status))} />}
      </Strip>
      {error && <Note warn>{error}</Note>}
    </Device>
  )
}

export function AiInstruments(): React.ReactElement {
  const preset = useUIStore((s) => s.aiTrackId) ?? ''
  const bpm = useProjectStore((s) => s.project.bpm)
  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12,
      background: 'radial-gradient(ellipse at 30% 0%, #23262d 0%, #141519 60%)', fontFamily: G.font }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 15, color: G.text, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 300 }}><b style={{ fontWeight: 800 }}>AI</b> {tr('Instruments')}</span>
        <span style={{ fontSize: 11, color: G.faint }}>{trf('Tempo {bpm} BPM: the parts are made for the tempo of the project.', { bpm: Math.round(bpm) })}</span>
      </div>
      <SongGenerator />
      <Band />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 12, flexShrink: 0 }}>
        <Orchestra preset={preset} />
        <TextInstrument preset={preset} />
      </div>
    </div>
  )
}
