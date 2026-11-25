import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useAudioStore } from '../../stores/audio.store'
import { pause, previewNote } from '../../audio/engine'
import { connectMidiKeyboards, noteOff, noteOn, startMidiRecording } from '../../audio/midiRecord'
import type { Note } from '../../types'
import { minLength, snapBeat, snapStep } from '../../edit/grid'
import { GridControls } from '../../edit/GridControls'
import { pianoFocus, PIANO_SELECT_ALL } from '../timeline/studioOps'
import { tr, trf } from '../../i18n/tr'
import { exportMidiClip, pickAndImport } from '../timeline/Timeline'

const NOTE_HEIGHT = 14
const KEY_WIDTH = 16           // turned view: one column per note, the keyboard across the bottom
const KEYS_HEIGHT = 56
const PIANO_WIDTH = 56
const BEAT_WIDTH = 80
const TOTAL_PITCHES = 128
const EDGE = 6
const VEL_FULL = 96            // the velocity lane below the notes (smaller in the Studio's detail area)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_NOTES = [1, 3, 6, 8, 10]

const isBlack = (pitch: number): boolean => BLACK_NOTES.includes(pitch % 12)
export const noteName = (pitch: number): string => `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`

interface NoteDrag {
  noteId: string
  kind: 'move' | 'resize'
  startX: number
  startY: number
  orig: Note
  moved: boolean
  group?: Map<string, Note>     // several selected notes move together
}

/** compact: inside the Studio's detail area (smaller toolbar and velocity lane) */
export function PianoRoll({ compact = false }: { compact?: boolean } = {}): React.ReactElement {
  const VEL_HEIGHT = compact ? 48 : VEL_FULL
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const selectedClipId = useProjectStore((s) => s.selectedClipId)
  const { addNote, updateNote, removeNote, addClip, selectClip } = useProjectStore.getState()
  const tool = useUIStore((s) => s.pianoTool)
  const setTool = useUIStore((s) => s.setPianoTool)
  const zoom = useUIStore((s) => s.pianoZoom)
  const setZoom = useUIStore((s) => s.setPianoZoom)
  const beat = useAudioStore((s) => s.currentBeat)
  const recording = useAudioStore((s) => s.isRecording)
  const [midiInputs, setMidiInputs] = useState(0)
  useEffect(() => { void connectMidiKeyboards().then(setMidiInputs) }, [])     // a MIDI keyboard plays right away
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<NoteDrag | null>(null)
  const lastLength = useRef(0.5)
  // selected notes: one (click), several (Shift+click, a frame drawn with Select or Shift+drag, Ctrl+A).
  // Shared with the store so that Quantize acts on them.
  const [sel, setSel] = useState<Set<string>>(new Set())
  const selectMany = (ids: string[]): void => { setSel(new Set(ids)); useProjectStore.getState().selectNotes(ids) }
  const select = (id: string | null): void => selectMany(id ? [id] : [])
  const [frame, setFrame] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrollX, setScrollX] = useState(0)
  const velDrag = useRef<{ ids: string[]; orig: Map<string, number>; startY: number; abs: boolean } | null>(null)
  // the view: keys on the left and time to the right (as before), or turned: the keyboard across the bottom and the
  // notes coming down onto it, time running upwards (owner, 25.11.2026). Remembered.
  const [turned, setTurned] = useState(() => { try { return localStorage.getItem('ams-piano-turned') === '1' } catch { return false } })
  const turn = (on: boolean): void => { setTurned(on); try { localStorage.setItem('ams-piano-turned', on ? '1' : '0') } catch { /* storage unavailable */ } }

  const track = project.tracks.find((t) => t.id === selectedTrackId)
  const clip = track?.clips.find((c) => c.id === selectedClipId && !c.audioFile) ?? track?.clips.find((c) => !c.audioFile)
  const notes = clip?.notes ?? []
  const beatWidth = BEAT_WIDTH * zoom
  const clipBeats = clip?.duration ?? 4
  const gridBeats = Math.max(16, Math.ceil(clipBeats) + 4)

  // open around the middle of the keyboard (or the notes of the clip) instead of the very top
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const pitches = notes.map((n) => n.pitch)
    const centre = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 60
    if (turned) {
      el.scrollLeft = Math.max(0, centre * KEY_WIDTH - el.clientWidth / 2)
      el.scrollTop = el.scrollHeight                      // the start of the clip is at the bottom, on the keys
    } else el.scrollTop = Math.max(0, (TOTAL_PITCHES - 1 - centre) * NOTE_HEIGHT - el.clientHeight / 2)
    // only when another clip or track is shown, or the view is turned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, turned])

  const snap = (b: number, free: boolean): number => snapBeat(b, free, 'floor')    // free = Alt held, or Snap is off

  const pointer = (e: { clientX: number; clientY: number }): { beat: number; pitch: number } => {
    const rect = gridRef.current!.getBoundingClientRect()
    if (turned) return {
      beat: Math.max(0, gridBeats - (e.clientY - rect.top) / beatWidth),
      pitch: Math.max(0, Math.min(TOTAL_PITCHES - 1, Math.floor((e.clientX - rect.left) / KEY_WIDTH)))
    }
    return {
      beat: Math.max(0, (e.clientX - rect.left) / beatWidth),
      pitch: Math.max(0, Math.min(TOTAL_PITCHES - 1, TOTAL_PITCHES - 1 - Math.floor((e.clientY - rect.top) / NOTE_HEIGHT)))
    }
  }

  const ensureClip = useCallback((): { trackId: string; clipId: string } | null => {
    if (!track) return null
    if (clip) return { trackId: track.id, clipId: clip.id }
    const bar = project.timeSignature?.[0] ?? 4
    addClip(track.id, { startTime: 0, duration: bar * 2, notes: [], name: 'MIDI clip' })
    const t = useProjectStore.getState().project.tracks.find((x) => x.id === track.id)
    const created = t?.clips[t.clips.length - 1]
    if (!created) return null
    selectClip(created.id)
    return { trackId: track.id, clipId: created.id }
  }, [track, clip, project.timeSignature, addClip, selectClip])

  const onGridDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return
    // a frame: with the Select tool, or Shift+drag with any tool
    if (tool === 'select' || e.shiftKey) {
      const rect = gridRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      frameRef.current = { x0: x, y0: y, x1: x, y1: y }
      setFrame(frameRef.current)
      if (!e.shiftKey) select(null)
      return
    }
    select(null)
    if (tool !== 'draw' || !track) return
    // Draw tool: a click places a note; dragging on empty space draws a frame that selects notes (crosshair)
    const rect = gridRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    frameRef.current = { x0: x, y0: y, x1: x, y1: y }
    pendingNote.current = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey }
  }

  // a note where the draw tool was clicked (without dragging)
  const drawNoteAt = (e: { clientX: number; clientY: number; altKey: boolean }): void => {
    if (!track) return
    const target = ensureClip()
    if (!target) return
    const p = pointer(e)
    const start = snap(p.beat, e.altKey)
    if (start >= (useProjectStore.getState().project.tracks.find((t) => t.id === target.trackId)?.clips.find((c) => c.id === target.clipId)?.duration ?? 0)) {
      // drawing past the end of the clip makes the clip longer
      const clipNow = useProjectStore.getState().project.tracks.find((t) => t.id === target.trackId)?.clips.find((c) => c.id === target.clipId)
      if (clipNow) useProjectStore.getState().updateClip(target.trackId, target.clipId, { duration: Math.ceil(start + lastLength.current) })
    }
    addNote(target.trackId, target.clipId, { pitch: p.pitch, startTime: start, duration: Math.max(snapStep() || 0, lastLength.current), velocity: 100 })
    void previewNote(p.pitch, 100, track)
    const added = useProjectStore.getState().project.tracks.find((t) => t.id === target.trackId)?.clips.find((c) => c.id === target.clipId)?.notes?.slice(-1)[0]
    if (added) select(added.id)
  }

  const onNoteDown = (e: React.PointerEvent, note: Note): void => {
    e.stopPropagation()
    if (!track || !clip) return
    if (tool === 'erase') { removeNote(track.id, clip.id, note.id); return }
    if (e.shiftKey || e.ctrlKey) {                         // add to / take out of the selection
      const next = new Set(sel); if (next.has(note.id)) next.delete(note.id); else next.add(note.id)
      selectMany([...next]); return
    }
    const keepGroup = sel.has(note.id) && sel.size > 1
    if (!keepGroup) select(note.id)
    void previewNote(note.pitch, note.velocity, track)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const nearEnd = turned ? e.clientY < rect.top + EDGE : e.clientX > rect.right - EDGE   // the end of a note: its right edge (turned: its top)
    const group = keepGroup && !nearEnd ? new Map(notes.filter((n) => sel.has(n.id)).map((n) => [n.id, { ...n }])) : undefined
    drag.current = { noteId: note.id, kind: nearEnd ? 'resize' : 'move', startX: e.clientX, startY: e.clientY, orig: { ...note }, moved: false, group }
  }

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (frameRef.current) {
        const rect = gridRef.current!.getBoundingClientRect()
        const f = { ...frameRef.current, x1: e.clientX - rect.left, y1: e.clientY - rect.top }
        frameRef.current = f
        const pn = pendingNote.current
        if (!pn || Math.abs(e.clientX - pn.clientX) + Math.abs(e.clientY - pn.clientY) > 5) { pendingNote.current = null; setFrame(f) }
        return
      }
      const v = velDrag.current
      if (v && track && clip) {
        // velocity: one note follows the mouse; several selected notes all move by the same amount
        const dv = Math.round(((v.startY - e.clientY) / (VEL_HEIGHT - 8)) * 127)
        for (const id of v.ids) {
          const o = v.orig.get(id) ?? 100
          updateNote(track.id, clip.id, id, { velocity: Math.max(1, Math.min(127, o + dv)) })
        }
        return
      }
      const d = drag.current
      if (!d || !track || !clip) return
      if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 3) return
      d.moved = true
      const dBeats = turned ? (d.startY - e.clientY) / beatWidth : (e.clientX - d.startX) / beatWidth
      const dPitchOf = (): number => (turned ? Math.round((e.clientX - d.startX) / KEY_WIDTH) : -Math.round((e.clientY - d.startY) / NOTE_HEIGHT))
      if (d.kind === 'resize') {
        const dur = Math.max(minLength(), snapBeat(d.orig.duration + dBeats, e.altKey))
        lastLength.current = dur
        updateNote(track.id, clip.id, d.noteId, { duration: dur })
      } else if (d.group) {
        // several notes: same shift in time and pitch for all of them
        const minStart = Math.min(...[...d.group.values()].map((n) => n.startTime))
        const shift = Math.max(-minStart, snapBeat(d.orig.startTime + dBeats, e.altKey) - d.orig.startTime)
        const dPitch = dPitchOf()
        for (const [id, n] of d.group) {
          updateNote(track.id, clip.id, id, { startTime: n.startTime + shift, pitch: Math.max(0, Math.min(127, n.pitch + dPitch)) })
        }
      } else {
        const start = Math.max(0, snapBeat(d.orig.startTime + dBeats, e.altKey))
        const dPitch = dPitchOf()
        const pitch = Math.max(0, Math.min(127, d.orig.pitch + dPitch))
        if (pitch !== (drag.current as NoteDrag & { lastPitch?: number }).lastPitch) {
          (drag.current as NoteDrag & { lastPitch?: number }).lastPitch = pitch
          if (pitch !== d.orig.pitch) void previewNote(pitch, d.orig.velocity, track)
        }
        updateNote(track.id, clip.id, d.noteId, { startTime: start, pitch })
      }
    }
    const onUp = (e: PointerEvent): void => {
      drag.current = null
      velDrag.current = null
      const f = frameRef.current
      if (!f) return
      frameRef.current = null; setFrame(null)
      const pn = pendingNote.current
      pendingNote.current = null
      if (pn) { drawNoteAt(pn); return }                // a click with the draw tool: a note
      // notes inside the frame
      const [bx0, bx1, py0, py1] = turned
        ? [gridBeats - Math.max(f.y0, f.y1) / beatWidth, gridBeats - Math.min(f.y0, f.y1) / beatWidth, Math.floor(Math.min(f.x0, f.x1) / KEY_WIDTH), Math.floor(Math.max(f.x0, f.x1) / KEY_WIDTH)]
        : [Math.min(f.x0, f.x1) / beatWidth, Math.max(f.x0, f.x1) / beatWidth, TOTAL_PITCHES - 1 - Math.floor(Math.max(f.y0, f.y1) / NOTE_HEIGHT), TOTAL_PITCHES - 1 - Math.floor(Math.min(f.y0, f.y1) / NOTE_HEIGHT)]
      const inside = notes.filter((n) => n.startTime < bx1 && n.startTime + n.duration > bx0 && n.pitch >= py0 && n.pitch <= py1).map((n) => n.id)
      selectMany(e.shiftKey ? [...new Set([...sel, ...inside])] : inside)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, clip, beatWidth, updateNote, notes, sel, turned, gridBeats])

  // the frame while it is drawn (a ref too: the move handler must see it without waiting for a render)
  const frameRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const pendingNote = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null)

  // Ctrl+A selects all notes while the Piano Roll was clicked last
  useEffect(() => {
    const onAll = (): void => selectMany(notes.map((n) => n.id))
    const onDown = (e: PointerEvent): void => { pianoFocus.active = !!rootRef.current?.contains(e.target as Node) }
    window.addEventListener(PIANO_SELECT_ALL, onAll)
    window.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener(PIANO_SELECT_ALL, onAll); window.removeEventListener('pointerdown', onDown, true); pianoFocus.active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  // keys: Delete removes the selected notes
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!sel.size || !track || !clip) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation()
        for (const id of sel) removeNote(track.id, clip.id, id)
        select(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, track, clip, removeNote])

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
        {tr('Select a MIDI track to edit its notes here.')}
      </div>
    )
  }

  const clipStart = clip?.startTime ?? 0
  const playheadX = (beat - clipStart) * beatWidth
  const gridWidth = gridBeats * beatWidth

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', userSelect: 'none' }}>
      <div style={{ minHeight: 36, flexWrap: 'wrap', rowGap: 4, display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {(['draw', 'select', 'erase'] as const).map((t) => (
          <button key={t} onClick={() => setTool(t)}
            style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: tool === t ? 'var(--accent)' : 'var(--bg-primary)', color: tool === t ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
            {tr(t === 'draw' ? 'Draw' : t === 'select' ? 'Select' : 'Erase')}
          </button>
        ))}
        <GridControls compact={compact} />
        <button title={tr('Record MIDI (Ctrl+R): the song plays, and what you play on the keyboard on the left or on a MIDI keyboard becomes notes. Press again (or Space) to stop.')}
          onClick={() => { if (recording) pause(); else void startMidiRecording() }}
          style={{ padding: '3px 10px', borderRadius: 4, border: `1px solid ${recording ? 'var(--red)' : 'var(--border)'}`, background: recording ? 'var(--red)' : 'var(--bg-primary)', color: recording ? 'white' : 'var(--red)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          ● {recording ? tr('Recording…') : tr('Rec')}
        </button>
        {!compact && <><button title={tr('Save this clip as a MIDI file (.mid) for other programs')} disabled={!clip}
          onClick={() => { if (clip) void exportMidiClip(track.id, clip.id) }}
          style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
          {tr('Export .mid')}
        </button>
        <button title={tr('Open a MIDI file (.mid): its tracks become MIDI tracks in the Studio')}
          onClick={() => { void pickAndImport({ startBeat: 0 }) }}
          style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
          {tr('Import .mid…')}
        </button></>}
        {midiInputs > 0 && <span style={{ fontSize: 10, color: 'var(--green)' }} title={tr('MIDI keyboards found')}>🎹 {midiInputs}</span>}
        {!compact && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          {clip ? `${track.name} · ${clip.name ?? 'clip'} · ${notes.length} notes${sel.size > 1 ? ` · ${sel.size} selected` : ''}` : tr('No clip yet: click in the grid to create one')}
        </span>}
        {clip && (() => {
          const chosen = notes.filter((n) => sel.has(n.id))
          const none = !chosen.length
          const vel = none ? 100 : Math.round(chosen.reduce((a, n) => a + n.velocity, 0) / chosen.length)
          const len = !none && chosen.every((n) => n.duration === chosen[0].duration) ? String(chosen[0].duration) : ''
          const setAll = (patch: Partial<Note>): void => { for (const n of chosen) updateNote(track.id, clip.id, n.id, patch) }
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
              <label title={tr('Velocity (how hard the note is played) of the selected notes, 1 to 127')} style={{ opacity: none ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{tr('Velocity')}{' '}
                <input key={`v${[...sel].join()}${vel}`} type="number" min={1} max={127} defaultValue={none ? '' : vel} disabled={none} placeholder="–" style={{ width: 58 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 127) setAll({ velocity: v }) }} /></label>
              <label title={tr('Length of the selected notes in beats (1 = a quarter note)')} style={{ opacity: none ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{tr('Length')}{' '}
                <select disabled={none} value={['0.125', '0.25', '0.5', '1', '2', '4'].includes(len) ? len : ''} onChange={(e) => { if (e.target.value) setAll({ duration: Number(e.target.value) }) }} style={{ fontSize: 11 }}>
                  <option value="">{len ? trf('{n} beats', { n: Number(len).toFixed(2) }) : '–'}</option>
                  <option value="0.125">1/32</option><option value="0.25">1/16</option><option value="0.5">1/8</option>
                  <option value="1">1/4</option><option value="2">1/2</option><option value="4">1/1</option>
                </select></label>
            </span>
          )
        })()}
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }} title={tr('View: keys on the left (time to the right) or the keyboard across the bottom (the notes come down onto the keys)')}>
          {([false, true] as const).map((t) => (
            <button key={String(t)} onClick={() => turn(t)}
              style={{ padding: '3px 8px', border: 'none', background: turned === t ? 'var(--accent)' : 'var(--bg-primary)', color: turned === t ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
              {t ? `🎹 ${tr('Keys below')}` : `${tr('Keys left')}`}
            </button>
          ))}
        </span>
        {!compact && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('Zoom')}</span>}
        <input type="range" min={0.25} max={4} step={0.25} value={zoom} title={tr('Zoom')} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: compact ? 60 : 80, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28 }}>{zoom}x</span>
      </div>

      {turned ? (
        // turned: one column per note, the keyboard across the bottom, time running upwards (the notes come down onto the keys)
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div style={{ width: TOTAL_PITCHES * KEY_WIDTH, position: 'relative' }}>
            <div ref={gridRef} onPointerDown={onGridDown}
              style={{ height: gridBeats * beatWidth, position: 'relative', cursor: tool === 'draw' ? 'crosshair' : 'default', touchAction: 'none' }}>
              {Array.from({ length: TOTAL_PITCHES }, (_, pitch) => (
                <div key={pitch} data-bg="1" style={{
                  position: 'absolute', left: pitch * KEY_WIDTH, top: 0, bottom: 0, width: KEY_WIDTH, boxSizing: 'border-box',
                  background: isBlack(pitch) ? 'rgba(0,0,0,0.3)' : pitch % 12 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  borderRight: '1px solid rgba(255,255,255,0.05)'
                }} />
              ))}
              {Array.from({ length: Math.ceil(gridBeats) + 1 }, (_, i) => (
                <div key={i} data-bg="1" style={{ position: 'absolute', top: (gridBeats - i) * beatWidth, left: 0, right: 0, height: 1, background: i % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)' }} />
              ))}
              {clip && (
                <div style={{ position: 'absolute', top: (gridBeats - clipBeats) * beatWidth, left: 0, right: 0, height: 2, background: 'color-mix(in srgb, var(--accent) 60%, transparent)', pointerEvents: 'none' }} title={tr('End of the clip')} />
              )}
              {notes.map((note) => (
                <div key={note.id} onPointerDown={(e) => onNoteDown(e, note)} title={noteName(note.pitch)}
                  style={{
                    position: 'absolute', left: note.pitch * KEY_WIDTH + 1, top: (gridBeats - note.startTime - note.duration) * beatWidth + 1,
                    width: KEY_WIDTH - 2, height: Math.max(note.duration * beatWidth - 2, 6), boxSizing: 'border-box',
                    background: `${track.color}${sel.has(note.id) ? 'ff' : 'cc'}`,
                    border: `1px solid ${sel.has(note.id) ? '#fff' : track.color}`, borderRadius: 3,
                    cursor: tool === 'erase' ? 'not-allowed' : 'grab', overflow: 'hidden', opacity: 0.45 + (note.velocity / 127) * 0.55
                  }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: EDGE, cursor: 'ns-resize' }} />
                </div>
              ))}
              {frame && (
                <div style={{ position: 'absolute', left: Math.min(frame.x0, frame.x1), top: Math.min(frame.y0, frame.y1), width: Math.abs(frame.x1 - frame.x0), height: Math.abs(frame.y1 - frame.y0),
                  border: '1px solid var(--accent-light)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', pointerEvents: 'none', zIndex: 4 }} />
              )}
              {clip && playheadX >= 0 && playheadX <= gridWidth && (
                <div style={{ position: 'absolute', top: (gridBeats - (beat - clipStart)) * beatWidth, left: 0, right: 0, height: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 2 }} />
              )}
            </div>
            {/* the keyboard: stays at the bottom while the notes scroll */}
            <div style={{ position: 'sticky', bottom: 0, height: KEYS_HEIGHT, zIndex: 3, display: 'flex', borderTop: '2px solid var(--border-mid)', background: '#111' }}>
              {Array.from({ length: TOTAL_PITCHES }, (_, pitch) => {
                const black = isBlack(pitch)
                const lit = clip && notes.some((n) => n.pitch === pitch && beat - clipStart >= n.startTime && beat - clipStart < n.startTime + n.duration) && useAudioStore.getState().isPlaying
                return (
                  <div key={pitch}
                    onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); noteOn(pitch, 100) }}
                    onPointerUp={() => noteOff(pitch)} onPointerCancel={() => noteOff(pitch)}
                    title={`${noteName(pitch)} · ${tr('Play this note. While recording (● or Ctrl+R), what you play here becomes notes in the clip.')}`}
                    style={{ width: KEY_WIDTH, flexShrink: 0, boxSizing: 'border-box', cursor: 'pointer', position: 'relative', borderRight: '1px solid #444',
                      background: black ? 'linear-gradient(#f4f4f4 0 0) bottom / 100% 40% no-repeat, #1b1b1b' : '#f4f4f4' }}>
                    {lit && <div style={{ position: 'absolute', inset: 0, background: track.color, opacity: 0.85 }} />}
                    {pitch % 12 === 0 && <span style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#555' }}>{noteName(pitch)}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
      <>
      <div ref={scrollRef} onScroll={(e) => setScrollX((e.target as HTMLDivElement).scrollLeft)} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', width: PIANO_WIDTH + gridWidth, height: TOTAL_PITCHES * NOTE_HEIGHT, position: 'relative' }}>
          <div style={{ width: PIANO_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, borderRight: '1px solid var(--border)' }}>
            {Array.from({ length: TOTAL_PITCHES }, (_, i) => {
              const pitch = TOTAL_PITCHES - 1 - i
              const black = isBlack(pitch)
              return (
                <div key={pitch}
                  onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); noteOn(pitch, 100) }}
                  onPointerUp={() => noteOff(pitch)} onPointerCancel={() => noteOff(pitch)}
                  title={tr('Play this note. While recording (● or Ctrl+R), what you play here becomes notes in the clip.')} 
                  style={{ height: NOTE_HEIGHT, boxSizing: 'border-box', background: black ? '#222' : '#fff', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, cursor: 'pointer' }}>
                  {pitch % 12 === 0 && <span style={{ fontSize: 9, color: black ? '#888' : '#555' }}>{noteName(pitch)}</span>}
                </div>
              )
            })}
          </div>

          <div ref={gridRef} onPointerDown={onGridDown}
            style={{ width: gridWidth, position: 'relative', cursor: tool === 'draw' ? 'crosshair' : 'default', touchAction: 'none' }}>
            {Array.from({ length: TOTAL_PITCHES }, (_, i) => {
              const pitch = TOTAL_PITCHES - 1 - i
              return (
                <div key={i} data-bg="1" style={{
                  position: 'absolute', top: i * NOTE_HEIGHT, left: 0, right: 0, height: NOTE_HEIGHT, boxSizing: 'border-box',
                  background: isBlack(pitch) ? 'rgba(0,0,0,0.3)' : pitch % 12 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.05)'
                }} />
              )
            })}
            {Array.from({ length: Math.ceil(gridBeats) + 1 }, (_, i) => (
              <div key={i} data-bg="1" style={{ position: 'absolute', left: i * beatWidth, top: 0, bottom: 0, width: 1, background: i % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)' }} />
            ))}
            {clip && (
              <div style={{ position: 'absolute', left: clipBeats * beatWidth, top: 0, bottom: 0, width: 2, background: 'color-mix(in srgb, var(--accent) 60%, transparent)', pointerEvents: 'none' }} title={tr('End of the clip')} />
            )}

            {notes.map((note) => (
              <div key={note.id} onPointerDown={(e) => onNoteDown(e, note)}
                style={{
                  position: 'absolute', left: note.startTime * beatWidth, top: (TOTAL_PITCHES - 1 - note.pitch) * NOTE_HEIGHT + 1,
                  width: Math.max(note.duration * beatWidth - 2, 6), height: NOTE_HEIGHT - 2, boxSizing: 'border-box',
                  background: `${track.color}${sel.has(note.id) ? 'ff' : 'cc'}`,
                  border: `1px solid ${sel.has(note.id) ? '#fff' : track.color}`, borderRadius: 2,
                  cursor: tool === 'erase' ? 'not-allowed' : 'grab', display: 'flex', alignItems: 'center', paddingLeft: 3, overflow: 'hidden', opacity: 0.45 + (note.velocity / 127) * 0.55
                }}>
                {note.lyric && <span style={{ fontSize: 9, color: 'white', whiteSpace: 'nowrap' }}>{note.lyric}</span>}
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: EDGE, cursor: 'ew-resize' }} />
              </div>
            ))}

            {frame && (
              <div style={{ position: 'absolute', left: Math.min(frame.x0, frame.x1), top: Math.min(frame.y0, frame.y1), width: Math.abs(frame.x1 - frame.x0), height: Math.abs(frame.y1 - frame.y0),
                border: '1px solid var(--accent-light)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', pointerEvents: 'none', zIndex: 4 }} />
            )}
            {clip && playheadX >= 0 && playheadX <= gridWidth && (
              <div style={{ position: 'absolute', left: playheadX, top: 0, bottom: 0, width: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 2 }} />
            )}
          </div>
        </div>
      </div>

      </>
      )}

      {/* velocity lane: one bar per note, drag a bar up or down (selected notes move together) */}
      {clip && !turned && (
        <div style={{ height: VEL_HEIGHT, flexShrink: 0, display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: PIANO_WIDTH, flexShrink: 0, fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 3px', boxSizing: 'border-box', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', wordBreak: 'break-word', lineHeight: 1.15 }}>
            <span>{tr('Velocity')}</span>
            <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>127 · 1</span>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: -scrollX, top: 0, width: gridWidth, height: '100%' }}>
              {[32, 64, 96].map((v) => <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: 4 + (v / 127) * (VEL_HEIGHT - 8), height: 1, background: 'rgba(255,255,255,0.05)' }} />)}
              {notes.map((n) => {
                const h = (n.velocity / 127) * (VEL_HEIGHT - 8)
                const on = sel.has(n.id)
                return (
                  <div key={n.id} title={trf('Velocity {v}', { v: n.velocity })}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      const ids = on && sel.size > 1 ? [...sel] : [n.id]
                      if (!on) select(n.id)
                      velDrag.current = { ids, orig: new Map(notes.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.velocity])), startY: e.clientY, abs: false }
                    }}
                    style={{ position: 'absolute', left: n.startTime * beatWidth - 3, bottom: 4, width: 9, height: Math.max(h, 3) + 4, cursor: 'ns-resize', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 9, height: 4, borderRadius: 2, background: on ? '#fff' : track.color, flexShrink: 0 }} />
                    <div style={{ width: 2, flex: 1, background: on ? '#fff' : track.color, opacity: 0.8 }} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
