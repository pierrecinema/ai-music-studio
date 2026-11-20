// AI Instruments, built like a rack of studio devices with rotary knobs:
//   Song generator  – a whole song as MIDI (chords, melody, keys, bass, drums, guitar) from a genre, key and tempo
//   Virtual band    – drummer, bass player and guitarist that play along with the song's chords (MIDI, every PC)
//   AI orchestra    – a MIDI track played by MIDI-DDSP (13 orchestral instruments, on the processor)
//   Text instrument – any instrument described in words, played by ACE-Step from a MIDI track (NVIDIA)
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
import { Dial } from '../common/Dial'
import type { Track } from '../../types'
import { tr, trf } from '../../i18n/tr'

// ── the look: dark devices, an LCD for choices, pads, knobs ─────────────────

const C = { body: 'linear-gradient(180deg, #23262d 0%, #1a1c21 100%)', edge: '#0d0e11', line: '#2e323b', text: '#e4e4e7', dim: '#8b909c', lcd: '#0b1210', lcdText: '#7cf5c4' }
const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function Device({ title, sub, color = 'var(--accent)', children, actions, style }: { title: string; sub?: string; color?: string; children: React.ReactNode; actions?: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <section style={{ background: C.body, border: `1px solid ${C.edge}`, borderRadius: 12, boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 18px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.edge}`, background: 'rgba(0,0,0,0.25)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <b style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.text }}>{title}</b>
        {sub && <span style={{ fontSize: 11, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{sub}</span>}
        {!sub && <span style={{ flex: 1 }} />}
        {actions}
      </header>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>{children}</div>
    </section>
  )
}

/** an LCD that shows the chosen option; ◀ ▶ step through, a click opens the list */
function Lcd<T extends string | number>({ label, value, options, onChange, width = 190 }: { label?: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; width?: number | string }): React.ReactElement {
  const i = Math.max(0, options.findIndex((o) => o.id === value))
  const step = (d: number): void => onChange(options[(i + d + options.length) % options.length].id)
  const arrow: React.CSSProperties = { background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: '0 6px' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      {label && <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>{label}</span>}
      <div style={{ display: 'flex', alignItems: 'center', background: C.lcd, border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8)', height: 32 }}>
        <button style={arrow} onClick={() => step(-1)} title={tr('Previous')}>◀</button>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.lcdText, fontFamily: 'Consolas, "JetBrains Mono", monospace', fontSize: 12.5, letterSpacing: '0.04em', textShadow: `0 0 6px ${C.lcdText}66`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px', pointerEvents: 'none' }}>
            {options[i]?.label}
          </div>
          <select value={String(value)} onChange={(e) => { const o = options.find((x) => String(x.id) === e.target.value); if (o) onChange(o.id) }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
            {options.map((o) => <option key={String(o.id)} value={String(o.id)}>{o.label}</option>)}
          </select>
        </div>
        <button style={arrow} onClick={() => step(1)} title={tr('Next')}>▶</button>
      </div>
    </div>
  )
}

/** a row of lit buttons: one of them is on */
function Segments<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: Array<{ id: T; label: string; disabled?: boolean; hint?: string }>; onChange: (v: T) => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>{label}</span>}
      <div style={{ display: 'inline-flex', background: '#111317', border: `1px solid ${C.edge}`, borderRadius: 8, padding: 2, gap: 2 }}>
        {options.map((o) => {
          const on = o.id === value
          return (
            <button key={String(o.id)} disabled={o.disabled} title={o.hint} onClick={() => onChange(o.id)}
              style={{ border: 'none', borderRadius: 6, padding: '6px 11px', fontSize: 11.5, fontWeight: 600, cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.4 : 1,
                background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : C.dim, boxShadow: on ? '0 0 10px color-mix(in srgb, var(--accent) 50%, transparent)' : undefined }}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Toggle({ label, on, set, hint }: { label: string; on: boolean; set: (v: boolean) => void; hint?: string }): React.ReactElement {
  return (
    <button title={hint} onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: on ? C.text : C.dim, fontSize: 11.5, padding: 0 }}>
      <span style={{ width: 30, height: 16, borderRadius: 9, background: on ? 'var(--accent)' : '#3a3e47', position: 'relative', transition: 'background .15s', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 12, height: 12, borderRadius: '50%', background: '#f4f4f5', transition: 'left .15s' }} />
      </span>
      {label}
    </button>
  )
}

function BigButton({ children, onClick, disabled, title, ghost }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; ghost?: boolean }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ border: ghost ? `1px solid ${C.line}` : 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        background: ghost ? 'transparent' : 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 85%, white), var(--accent))', color: ghost ? C.text : '#fff',
        boxShadow: ghost ? undefined : '0 2px 10px color-mix(in srgb, var(--accent) 40%, transparent)' }}>
      {children}
    </button>
  )
}

const Knobs = ({ children }: { children: React.ReactNode }): React.ReactElement => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
const Note = ({ children, warn }: { children: React.ReactNode; warn?: boolean }): React.ReactElement => <div style={{ fontSize: 11.5, color: warn ? '#fbbf24' : C.dim, lineHeight: 1.4 }}>{children}</div>
const pct = (v: number): string => `${Math.round(v * 100)}%`

// ── helpers ─────────────────────────────────────────────────────────────────

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

// ── song generator ──────────────────────────────────────────────────────────

const PART_COLORS: Record<string, string> = { melody: '#a855f7', chords: '#22d3ee', bass: '#3b82f6', drums: '#ef4444', guitar: '#f59e0b' }

function SongGenerator(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
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
  const preview = useMemo(() => generateSong({ genre, key, mode, bpm, seed: take, parts }), [genre, key, mode, bpm, take, parts])
  const length = Math.round((preview.bars * 4 * 60) / bpm)

  const make = (): void => {
    const st = useProjectStore.getState()
    if (setTempo) st.setBpm(bpm)
    // after what is already in the project (bar 1 if it is empty)
    const end = Math.max(0, ...st.project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)))
    const start = Math.ceil(end / 4) * 4
    const keyName = `${KEY_NAMES[key]}${mode === 'minor' ? 'm' : ''}`
    for (const p of preview.parts) addPartTrack(`${tr(p.name)} (${tr(g.label)}, ${keyName})`, p.sound, PART_COLORS[p.id], p.notes, start, preview.bars * 4)
    if (markers) for (const s of preview.sections) {
      const id = useProjectStore.getState().addMarker(start + s.bar * 4)
      useProjectStore.getState().updateMarker(id, { name: tr(SECTION_LABEL[s.kind]) })
    }
    setNotice(trf('The song is in the Studio from bar {bar}: {n} MIDI tracks, {bars} bars. Every part can be edited in the Piano Roll and played by any instrument.', { bar: start / 4 + 1, n: preview.parts.length, bars: preview.bars }))
  }

  return (
    <Device title={tr('Song generator')} sub={tr('A whole song as MIDI: chords, melody, keys, bass, drums and guitar, with intro, verse, chorus and bridge.')} color="#a855f7"
      >
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Lcd label={tr('Genre')} value={genre} options={GENRES.map((x) => ({ id: x.id, label: tr(x.label) }))} onChange={pick} />
        <Lcd label={tr('Key')} value={key} options={KEY_NAMES.map((n, i) => ({ id: i, label: n }))} onChange={setKey} width={110} />
        <Segments label={tr('Scale')} value={mode} options={[{ id: 'major', label: tr('Major') }, { id: 'minor', label: tr('Minor') }]} onChange={setMode} />
        <Dial label={tr('Tempo')} value={bpm} min={60} max={180} step={1} def={g.bpm} onChange={setBpm} format={(v) => `${Math.round(v)}`} color="#a855f7" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Toggle label={tr('Set the project tempo')} on={setTempo} set={setSetTempo} />
          <Toggle label={tr('Markers for the parts')} on={markers} set={setMarkers} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>{tr('Parts')}</span>
        {(['melody', 'chords', 'bass', 'drums', 'guitar'] as const).map((p) => (
          <Toggle key={p} label={tr({ melody: 'Melody', chords: 'Keys', bass: 'Bass', drums: 'Drums', guitar: 'Guitar' }[p])} on={parts[p]} set={(v) => setParts({ ...parts, [p]: v })} />
        ))}
      </div>
      {/* the form of the song as a strip of coloured blocks */}
      <div style={{ display: 'flex', gap: 2, height: 30, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.edge}` }}>
        {preview.sections.map((s, i) => (
          <div key={i} title={`${tr(SECTION_LABEL[s.kind])}: ${s.bars} ${tr('bars')}`} style={{ flex: s.bars, background: { intro: '#334155', verse: '#1e40af', pre: '#7c3aed', chorus: '#be185d', bridge: '#0f766e', drop: '#c2410c', outro: '#334155' }[s.kind],
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {tr(SECTION_LABEL[s.kind])}
          </div>
        ))}
      </div>
      <Note>{trf('{bars} bars, about {min}:{sec} min. Chords: {chords}', { bars: preview.bars, min: Math.floor(length / 60), sec: String(length % 60).padStart(2, '0'), chords: preview.chords.slice(0, 8).map((c) => chordName(c)).join(' · ') + ' …' })}</Note>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <BigButton onClick={make}>＋ {tr('Make the song in the Studio')}</BigButton>
        <BigButton ghost onClick={() => setTake(take + 1)} title={tr('Another version: other chords, melody and grooves')}>🎲 {trf('Take {n}', { n: take })}</BigButton>
      </div>
      {notice && <Note>{notice}</Note>}
    </Device>
  )
}

// ── virtual band ────────────────────────────────────────────────────────────

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
  const addDrums = (): void => addPartTrack(`${tr('Drummer')} (${tr(DRUM_STYLES.find((d) => d.id === drum.style)!.label)})`, 'drums', '#ef4444',
    drummer({ ...opts, style: drum.style, intensity: drum.intensity, fills: drum.fills, humanize: drum.humanize, swing: drum.swing }), startBeat, beats)
  const addBass = (): void => addPartTrack(`${tr('Bass player')} (${tr(BASS_STYLES.find((d) => d.id === bass.style)!.label)})`, bass.style === '808' ? '808' : 'bass', '#3b82f6',
    bassist({ ...opts, style: bass.style, intensity: bass.intensity, chords, humanize: bass.humanize, swing: drum.swing }), startBeat, beats)
  const addGuitar = (): void => addPartTrack(`${tr('Guitarist')} (${tr(GUITAR_STYLES.find((d) => d.id === gtr.style)!.label)})`, gtr.distorted ? 'eguitar' : 'guitar', '#f59e0b',
    guitarist({ ...opts, style: gtr.style, intensity: gtr.intensity, chords, humanize: gtr.humanize, swing: drum.swing }), startBeat, beats)
  const needChords = (): boolean => {
    if (chords.length) return true
    setNotice(src === 'song' ? tr('No chords found in this part of the song: type the chords instead.') : tr('Type the chords of the song first, for example: Am F C G'))
    return false
  }
  const done = (what: string): void => setNotice(trf('{what} is in the Studio: a new MIDI track at bar {bar}. Change its sound with KA → Instrument in its track (any VST instrument too).', { what, bar: startBar }))

  return (
    <Device title={tr('Virtual band')} sub={tr('Drummer, bass player and guitarist play along with the chords of your song. MIDI, every PC.')} color="#ef4444"
      actions={<BigButton onClick={() => { if (!needChords()) { addDrums(); done(tr('Drummer')); return } addDrums(); addBass(); addGuitar(); done(tr('The band')) }}>＋ {tr('Add the whole band')}</BigButton>}>
      {/* the chord strip */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Segments label={tr('Chords')} value={src} onChange={setSource} options={[
          { id: 'song', label: tr('From the song'), disabled: !midiTracks.length, hint: midiTracks.length ? tr('The chords of your MIDI tracks, bar by bar') : tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.') },
          { id: 'typed', label: tr('Type them') }]} />
        {src === 'typed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>{tr('Chords (type here)')}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Am F C G | Dm G C -"
              style={{ height: 32, background: C.lcd, color: C.lcdText, border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8)', fontFamily: 'Consolas, monospace', fontSize: 13, padding: '0 10px' }} />
          </div>
        )}
        {src === 'typed' && <Lcd label={tr('Each chord')} value={perChord} onChange={setPerChord} width={150} options={[{ id: bpb, label: tr('1 bar') }, { id: bpb * 2, label: tr('2 bars') }, { id: bpb / 2, label: tr('½ bar') }]} />}
        <Dial label={tr('From bar')} value={startBar} min={1} max={128} step={1} def={1} onChange={setStartBar} format={(v) => String(Math.round(v))} size={46} />
        <Dial label={tr('Bars')} value={bars} min={1} max={64} step={1} def={8} onChange={setBars} format={(v) => String(Math.round(v))} size={46} />
        <BigButton ghost onClick={() => setSeed(seed + 1)} title={tr('Another take: the players play the part a little differently')}>🎲 {trf('Take {n}', { n: seed })}</BigButton>
      </div>
      {src === 'song' && !midiTracks.length && <Note warn>{tr('There is no MIDI track with notes in the project yet: write notes, use the song generator, or type the chords.')}</Note>}
      {src === 'typed' && <Note>{tr('Chords like Am, F, C#m7, Bb, G7, Dsus4. "|" separates bars, "-" holds the chord.')}{bad.length ? ` ⚠ ${trf('Not understood: {list}', { list: bad.join(', ') })}` : ''}</Note>}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {chords.length ? chords.slice(0, 24).map((c, i) => (
          <span key={i} style={{ padding: '4px 9px', borderRadius: 5, background: '#111317', border: `1px solid ${C.line}`, color: C.lcdText, fontFamily: 'Consolas, monospace', fontSize: 12 }}>{chordName(c)}</span>
        )) : <Note>{tr('No chords yet')}</Note>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Device title={`🥁 ${tr('Drummer')}`} color="#ef4444" style={{ background: '#16181d' }}>
          <Lcd label={tr('Style')} value={drum.style} onChange={(v) => setDrum({ ...drum, style: v })} options={DRUM_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" />
          <Knobs>
            <Dial label={tr('Intensity')} value={drum.intensity} min={0} max={1} def={0.5} onChange={(v) => setDrum({ ...drum, intensity: v })} format={pct} color="#ef4444" title={tr('Quiet and sparse … full and busy')} />
            <Dial label={tr('Feel')} value={drum.humanize} min={0} max={1} def={0.3} onChange={(v) => setDrum({ ...drum, humanize: v })} format={pct} color="#ef4444" title={tr('Exact … loose, like a person')} />
            <Dial label={tr('Swing')} value={drum.swing} min={0} max={1} def={0} onChange={(v) => setDrum({ ...drum, swing: v })} format={pct} color="#ef4444" title={tr('Straight … shuffle (also for bass and guitar)')} />
          </Knobs>
          <Segments label={tr('Fills')} value={drum.fills} onChange={(v) => setDrum({ ...drum, fills: v })} options={[{ id: 4, label: tr('every 4 bars') }, { id: 8, label: tr('every 8 bars') }, { id: 0, label: tr('none') }]} />
          <BigButton onClick={() => { addDrums(); done(tr('Drummer')) }}>＋ {tr('Add to the Studio')}</BigButton>
        </Device>
        <Device title={`🎸 ${tr('Bass player')}`} color="#3b82f6" style={{ background: '#16181d' }}>
          <Lcd label={tr('Style')} value={bass.style} onChange={(v) => setBass({ ...bass, style: v })} options={BASS_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" />
          <Knobs>
            <Dial label={tr('Intensity')} value={bass.intensity} min={0} max={1} def={0.5} onChange={(v) => setBass({ ...bass, intensity: v })} format={pct} color="#3b82f6" />
            <Dial label={tr('Feel')} value={bass.humanize} min={0} max={1} def={0.2} onChange={(v) => setBass({ ...bass, humanize: v })} format={pct} color="#3b82f6" />
          </Knobs>
          <div style={{ flex: 1 }} />
          <BigButton onClick={() => { if (needChords()) { addBass(); done(tr('Bass player')) } }}>＋ {tr('Add to the Studio')}</BigButton>
        </Device>
        <Device title={`🎸 ${tr('Guitarist')}`} color="#f59e0b" style={{ background: '#16181d' }}>
          <Lcd label={tr('Style')} value={gtr.style} onChange={(v) => { const st = GUITAR_STYLES.find((x) => x.id === v)!; setGtr({ ...gtr, style: v, distorted: !!st.distorted }) }} options={GUITAR_STYLES.map((d) => ({ id: d.id, label: tr(d.label) }))} width="100%" />
          <Knobs>
            <Dial label={tr('Intensity')} value={gtr.intensity} min={0} max={1} def={0.5} onChange={(v) => setGtr({ ...gtr, intensity: v })} format={pct} color="#f59e0b" />
            <Dial label={tr('Feel')} value={gtr.humanize} min={0} max={1} def={0.25} onChange={(v) => setGtr({ ...gtr, humanize: v })} format={pct} color="#f59e0b" />
          </Knobs>
          <Toggle label={tr('Distorted guitar')} on={gtr.distorted} set={(v) => setGtr({ ...gtr, distorted: v })} />
          <BigButton onClick={() => { if (needChords()) { addGuitar(); done(tr('Guitarist')) } }}>＋ {tr('Add to the Studio')}</BigButton>
        </Device>
      </div>
      {notice && <Note>{notice}</Note>}
      <Note>{tr('Singer: the Vocal Editor (0.90) will sing your melody and lyrics.')}</Note>
    </Device>
  )
}

// ── AI orchestra (MIDI-DDSP) ────────────────────────────────────────────────

function useStatus(): { ddsp: boolean; ace: boolean; cuda: boolean } | null {
  const [s, setS] = useState<{ ddsp: boolean; ace: boolean; cuda: boolean } | null>(null)
  useEffect(() => { let on = true; api.instruments.status().then((x) => on && setS(x)).catch(() => on && setS(null)); return () => { on = false } }, [])
  return s
}

function TrackLcd({ value, set }: { value: string; set: (id: string) => void }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const tracks = project.tracks.filter((t) => t.type === 'midi' && notesOf(t).length)
  if (!tracks.length) return <Note warn>{tr('No MIDI track with notes yet: write notes or make a song with the song generator first.')}</Note>
  return <Lcd label={tr('MIDI track')} value={value || tracks[0].id} onChange={set} width={280} options={tracks.map((t) => ({ id: t.id, label: `${t.name} · ${trf('{n} notes', { n: notesOf(t).length })}` }))} />
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

const FAMILY_ICON: Record<string, string> = { Strings: '🎻', Woodwinds: '🪈', Brass: '🎺' }

function Meter({ job }: { job: { progress?: number; text?: string } | null }): React.ReactElement | null {
  if (!job) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
      <div style={{ height: 6, background: '#0b0c0f', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 2px #000' }}>
        <div style={{ width: `${Math.round((job.progress ?? 0) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #84cc16, #eab308)', transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: C.dim }}>{job.text}</span>
    </div>
  )
}

function Orchestra({ preset }: { preset: string }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const status = useStatus()
  const [list, setList] = useState<AiInstrument[]>([])
  const [trackId, setTrackId] = useState(preset)
  const [inst, setInst] = useState('violin')
  const [ex, setEx] = useState({ vibrato: 1, dynamics: 1, brightness: 1, attack: 1, velocity: 0.5 })
  const [voices, setVoices] = useState(4)
  const [transpose, setTranspose] = useState(0)
  const [mute, setMute] = useState(true)
  const [job, setJob] = useState<InstrumentJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => { api.instruments.list().then(setList).catch(() => setList([])) }, [])
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
    <Device title={tr('AI orchestra')} sub={tr('A MIDI track played by AI like a real musician (MIDI-DDSP): bow, breath, vibrato. On the processor.')} color="#22c55e">
      {status && !status.ddsp && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Note warn>⚠ {tr('Not installed yet: Settings → AI Engines → "AI Instruments (MIDI-DDSP)" → Install selected (about 1.5 GB, once).')}</Note>
          <BigButton ghost onClick={() => useUIStore.getState().setActiveView('settings')}>{tr('Open Settings')}</BigButton>
        </div>
      )}
      {!status && <Note warn>{tr('The AI backend is not running: start it in Settings → AI Engines.')}</Note>}
      <TrackLcd value={track?.id ?? ''} set={setTrackId} />
      {/* the instruments as pads */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 6 }}>
        {cats.flatMap((c) => list.filter((i) => i.category === c)).map((i) => {
          const on = inst === i.id
          return (
            <button key={i.id} onClick={() => setInst(i.id)} title={`${tr(i.category)}: ${tr(i.name)}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${on ? '#22c55e' : C.edge}`, background: on ? 'linear-gradient(180deg, #16351f, #11251a)' : 'linear-gradient(180deg, #24272e, #1b1d22)',
                boxShadow: on ? '0 0 12px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.05)', color: on ? '#dcfce7' : C.text }}>
              <span style={{ fontSize: 20 }}>{FAMILY_ICON[i.category] ?? '🎵'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>{tr(i.name)}</span>
              <span style={{ fontSize: 9, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tr(i.category)}</span>
            </button>
          )
        })}
      </div>
      {outside > 0 && <Note warn>{trf('{n} notes are outside the range of this instrument: they are moved by octaves (or use Transpose).', { n: outside })}</Note>}
      <Knobs>
        <Dial label={tr('Vibrato')} value={ex.vibrato} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, vibrato: v })} format={pct} color="#22c55e" />
        <Dial label={tr('Dynamics')} value={ex.dynamics} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, dynamics: v })} format={pct} color="#22c55e" title={tr('How loud and how much the volume moves within a note')} />
        <Dial label={tr('Brightness')} value={ex.brightness} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, brightness: v })} format={pct} color="#22c55e" />
        <Dial label={tr('Attack')} value={ex.attack} min={0} max={2} def={1} onChange={(v) => setEx({ ...ex, attack: v })} format={pct} color="#22c55e" title={tr('How sharply the notes start')} />
        <Dial label={tr('Velocity')} value={ex.velocity} min={0} max={1} def={0.5} onChange={(v) => setEx({ ...ex, velocity: v })} format={pct} color="#22c55e" title={tr('How much the velocities of your notes count')} />
        <Dial label={tr('Players')} value={voices} min={1} max={8} step={1} def={4} onChange={setVoices} format={(v) => String(Math.round(v))} color="#22c55e" title={tr('Players for chords')} />
        <Dial label={tr('Transpose')} value={transpose} min={-24} max={24} step={1} def={0} onChange={setTranspose} format={(v) => (v > 0 ? `+${v}` : String(v))} color="#22c55e" bipolar />
      </Knobs>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <BigButton onClick={() => void run()} disabled={!track || busy || !status?.ddsp}>▶ {tr('Play with the AI instrument')}</BigButton>
        {busy && <BigButton ghost onClick={() => { clearTimeout(timer.current); void api.instruments.cancel(job!.id); setJob({ ...job!, status: 'cancelled', text: tr('Cancelled') }) }}>{tr('Cancel')}</BigButton>}
        <Toggle label={tr('Mute the MIDI track afterwards')} on={mute} set={setMute} />
        <Meter job={job ? { progress: job.status === 'done' ? 1 : job.progress, text: `${tr(job.text)}${busy ? ` · ${Math.round(job.elapsed)} s` : ''}${job.status === 'done' ? ` · ${tr('The audio track is in the Studio and in the Library (AI Instruments).')}` : ''}` } : null} />
      </div>
      {error && <Note warn>{error}</Note>}
    </Device>
  )
}

// ── any instrument by text (ACE-Step cover) ─────────────────────────────────

const COVER_IDEAS = ['electric guitar, overdrive', 'acoustic guitar, fingerpicked', 'grand piano', 'jazz piano trio', 'rhodes electric piano', 'string orchestra',
  'solo cello', 'saxophone, smooth jazz', 'sitar', 'kalimba', 'synth lead, 80s', 'church organ', 'brass section, funk', 'harp', 'marimba', 'pan flute']

function Cover({ preset }: { preset: string }): React.ReactElement {
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
    <Device title={tr('Text instrument')} sub={tr('Describe any instrument or style: ACE-Step plays your MIDI track with it. Fast with an NVIDIA card.')} color="#38bdf8">
      {status && !status.ace && <Note warn>⚠ {tr('ACE-Step is not installed: Settings → AI Engines → "Music generator (ACE-Step)".')}</Note>}
      {status && status.ace && !status.cuda && <Note warn>⚠ {tr('No NVIDIA graphics card found: this runs on the processor and can take an hour or more for one minute of music.')}</Note>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TrackLcd value={track?.id ?? ''} set={setTrackId} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 260 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>{tr('Instrument / style (type here)')}</span>
          <input value={style} onChange={(e) => setStyle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={tr('e.g. electric guitar, overdrive')}
            style={{ height: 34, background: C.lcd, color: C.lcdText, border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8)', fontFamily: 'Consolas, monospace', fontSize: 13.5, padding: '0 10px' }} />
        </div>
        <Dial label={tr('Follow the notes')} value={strength} min={0} max={1} def={0.55} onChange={setStrength} format={pct} color="#38bdf8" title={tr('Low: the AI plays freely in the style. High: it stays close to your notes and timing.')} />
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {COVER_IDEAS.map((c) => (
          <button key={c} onClick={() => setStyle(c)} style={{ padding: '4px 9px', borderRadius: 12, fontSize: 11, cursor: 'pointer', border: `1px solid ${style === c ? '#38bdf8' : C.line}`, background: style === c ? 'rgba(56,189,248,0.15)' : '#16181d', color: style === c ? '#bae6fd' : C.dim }}>{c}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <BigButton onClick={() => void run()} disabled={!track || busy || !status?.ace}>▶ {tr('Play with AI')}</BigButton>
        {running && <BigButton ghost onClick={() => { void api.music.cancel(job!.id) }}>{tr('Cancel')}</BigButton>}
        <Toggle label={tr('Mute the MIDI track afterwards')} on={mute} set={setMute} />
        <Meter job={stage ? { progress: 0.02, text: stage } : job ? { progress: job.status === 'done' ? 1 : job.step_total ? (job.step ?? 0) / job.step_total : 0.05, text: job.status === 'done' ? tr('The audio track is in the Studio and in the Library.') : tr(job.stage_text ?? job.status) } : null} />
      </div>
      {error && <Note warn>{error}</Note>}
    </Device>
  )
}

export function AiInstruments(): React.ReactElement {
  const preset = useUIStore((s) => s.aiTrackId) ?? ''
  const bpm = useProjectStore((s) => s.project.bpm)
  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, background: 'radial-gradient(ellipse at top, #1c1f26 0%, #121318 70%)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text }}>🎻 {tr('AI Instruments')}</h2>
        <span style={{ fontSize: 12, color: C.dim }}>{trf('Tempo {bpm} BPM: the parts are made for the tempo of the project.', { bpm: Math.round(bpm) })}</span>
      </div>
      <SongGenerator />
      <Band />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: 14, flexShrink: 0 }}>
        <Orchestra preset={preset} />
        <Cover preset={preset} />
      </div>
    </div>
  )
}
