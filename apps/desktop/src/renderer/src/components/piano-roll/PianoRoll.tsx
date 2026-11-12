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

const NOTE_HEIGHT = 14
const PIANO_WIDTH = 56
const BEAT_WIDTH = 80
const TOTAL_PITCHES = 128
const EDGE = 6
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

export function PianoRoll(): React.ReactElement {
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
    el.scrollTop = Math.max(0, (TOTAL_PITCHES - 1 - centre) * NOTE_HEIGHT - el.clientHeight / 2)
    // only when another clip or track is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id])

  const snap = (b: number, free: boolean): number => snapBeat(b, free, 'floor')    // free = Alt held, or Snap is off

  const pointer = (e: { clientX: number; clientY: number }): { beat: number; pitch: number } => {
    const rect = gridRef.current!.getBoundingClientRect()
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
    if (added) {
      select(added.id)
      drag.current = { noteId: added.id, kind: 'resize', startX: e.clientX, startY: e.clientY, orig: { ...added }, moved: false }
    }
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
    const nearEnd = e.clientX > rect.right - EDGE
    const group = keepGroup && !nearEnd ? new Map(notes.filter((n) => sel.has(n.id)).map((n) => [n.id, { ...n }])) : undefined
    drag.current = { noteId: note.id, kind: nearEnd ? 'resize' : 'move', startX: e.clientX, startY: e.clientY, orig: { ...note }, moved: false, group }
  }

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (frameRef.current) {
        const rect = gridRef.current!.getBoundingClientRect()
        const f = { ...frameRef.current, x1: e.clientX - rect.left, y1: e.clientY - rect.top }
        frameRef.current = f; setFrame(f)
        return
      }
      const d = drag.current
      if (!d || !track || !clip) return
      if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 3) return
      d.moved = true
      const dBeats = (e.clientX - d.startX) / beatWidth
      if (d.kind === 'resize') {
        const dur = Math.max(minLength(), snapBeat(d.orig.duration + dBeats, e.altKey))
        lastLength.current = dur
        updateNote(track.id, clip.id, d.noteId, { duration: dur })
      } else if (d.group) {
        // several notes: same shift in time and pitch for all of them
        const minStart = Math.min(...[...d.group.values()].map((n) => n.startTime))
        const shift = Math.max(-minStart, snapBeat(d.orig.startTime + dBeats, e.altKey) - d.orig.startTime)
        const dPitch = -Math.round((e.clientY - d.startY) / NOTE_HEIGHT)
        for (const [id, n] of d.group) {
          updateNote(track.id, clip.id, id, { startTime: n.startTime + shift, pitch: Math.max(0, Math.min(127, n.pitch + dPitch)) })
        }
      } else {
        const start = Math.max(0, snapBeat(d.orig.startTime + dBeats, e.altKey))
        const dPitch = -Math.round((e.clientY - d.startY) / NOTE_HEIGHT)
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
      const f = frameRef.current
      if (!f) return
      frameRef.current = null; setFrame(null)
      // notes inside the frame
      const bx0 = Math.min(f.x0, f.x1) / beatWidth, bx1 = Math.max(f.x0, f.x1) / beatWidth
      const py0 = TOTAL_PITCHES - 1 - Math.floor(Math.max(f.y0, f.y1) / NOTE_HEIGHT)
      const py1 = TOTAL_PITCHES - 1 - Math.floor(Math.min(f.y0, f.y1) / NOTE_HEIGHT)
      const inside = notes.filter((n) => n.startTime < bx1 && n.startTime + n.duration > bx0 && n.pitch >= py0 && n.pitch <= py1).map((n) => n.id)
      selectMany(e.shiftKey ? [...new Set([...sel, ...inside])] : inside)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, clip, beatWidth, updateNote, notes, sel])

  // the frame while it is drawn (a ref too: the move handler must see it without waiting for a render)
  const frameRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

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
        Select a MIDI track to edit its notes here.
      </div>
    )
  }

  const clipStart = clip?.startTime ?? 0
  const playheadX = (beat - clipStart) * beatWidth
  const gridWidth = gridBeats * beatWidth

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', userSelect: 'none' }}>
      <div style={{ height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {(['draw', 'select', 'erase'] as const).map((t) => (
          <button key={t} onClick={() => setTool(t)}
            style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: tool === t ? 'var(--accent)' : 'var(--bg-primary)', color: tool === t ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <GridControls />
        <button title="Record MIDI (Ctrl+R): the song plays, and what you play on the keyboard on the left or on a MIDI keyboard becomes notes. Press again (or Space) to stop."
          onClick={() => { if (recording) pause(); else void startMidiRecording() }}
          style={{ padding: '3px 10px', borderRadius: 4, border: `1px solid ${recording ? 'var(--red)' : 'var(--border)'}`, background: recording ? 'var(--red)' : 'var(--bg-primary)', color: recording ? 'white' : 'var(--red)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          ● {recording ? 'Recording…' : 'Rec'}
        </button>
        {midiInputs > 0 && <span style={{ fontSize: 10, color: 'var(--green)' }} title="MIDI keyboards found">🎹 {midiInputs}</span>}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          {clip ? `${track.name} · ${clip.name ?? 'clip'} · ${notes.length} notes${sel.size > 1 ? ` · ${sel.size} selected` : ''}` : 'No clip yet: click in the grid to create one'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Zoom</span>
        <input type="range" min={0.25} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 80, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28 }}>{zoom}x</span>
      </div>

      {/* one scroll area: the keys scroll together with the notes, so rows always line up */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', width: PIANO_WIDTH + gridWidth, height: TOTAL_PITCHES * NOTE_HEIGHT, position: 'relative' }}>
          <div style={{ width: PIANO_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, borderRight: '1px solid var(--border)' }}>
            {Array.from({ length: TOTAL_PITCHES }, (_, i) => {
              const pitch = TOTAL_PITCHES - 1 - i
              const black = isBlack(pitch)
              return (
                <div key={pitch}
                  onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); noteOn(pitch, 100) }}
                  onPointerUp={() => noteOff(pitch)} onPointerCancel={() => noteOff(pitch)}
                  title="Play this note. While recording (● or Ctrl+R), what you play here becomes notes in the clip." 
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
              <div style={{ position: 'absolute', left: clipBeats * beatWidth, top: 0, bottom: 0, width: 2, background: 'rgba(124,58,237,0.6)', pointerEvents: 'none' }} title="End of the clip" />
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
                border: '1px solid var(--accent-light)', background: 'rgba(124,58,237,0.15)', pointerEvents: 'none', zIndex: 4 }} />
            )}
            {clip && playheadX >= 0 && playheadX <= gridWidth && (
              <div style={{ position: 'absolute', left: playheadX, top: 0, bottom: 0, width: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 2 }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
