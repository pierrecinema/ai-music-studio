import React, { useRef, useCallback } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import type { Note } from '../../types'

const NOTE_HEIGHT = 14
const PIANO_WIDTH = 56
const BEAT_WIDTH = 80
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_NOTES = [1, 3, 6, 8, 10]

function isBlack(pitch: number) { return BLACK_NOTES.includes(pitch % 12) }
function noteName(pitch: number) { return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}` }

export function PianoRoll(): React.ReactElement {
  const { project, selectedTrackId, selectedClipId, addNote, updateNote, removeNote } = useProjectStore()
  // tool and zoom live in the UI store so keyboard shortcuts can change them
  const tool = useUIStore((s) => s.pianoTool)
  const setTool = useUIStore((s) => s.setPianoTool)
  const zoom = useUIStore((s) => s.pianoZoom)
  const setZoom = useUIStore((s) => s.setPianoZoom)
  const gridRef = useRef<HTMLDivElement>(null)
  const totalPitches = 128

  const track = project.tracks.find(t => t.id === selectedTrackId)
  const clip = track?.clips.find(c => c.id === selectedClipId) ?? track?.clips[0]
  const notes = clip?.notes ?? []

  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!track || !clip) return
    const rect = gridRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const beat = x / (BEAT_WIDTH * zoom)
    const snapped = Math.floor(beat * 4) / 4
    const pitch = totalPitches - 1 - Math.floor(y / NOTE_HEIGHT)

    if (tool === 'draw') {
      addNote(track.id, clip.id, { pitch, startTime: snapped, duration: 0.25, velocity: 100 })
    }
  }, [track, clip, tool, zoom, addNote])

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
        Select a track to edit in Piano Roll
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {(['draw', 'select', 'erase'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: tool === t ? 'var(--accent)' : 'var(--bg-primary)', color: tool === t ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Zoom</span>
        <input type="range" min={0.25} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 80, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28 }}>{zoom}x</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Piano Keys */}
        <div style={{ width: PIANO_WIDTH, flexShrink: 0, overflow: 'hidden', position: 'relative', borderRight: '1px solid var(--border)' }}>
          {Array.from({ length: totalPitches }, (_, i) => {
            const pitch = totalPitches - 1 - i
            const black = isBlack(pitch)
            return (
              <div
                key={pitch}
                style={{
                  height: NOTE_HEIGHT,
                  background: black ? '#222' : '#fff',
                  borderBottom: '1px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: 4
                }}
              >
                {pitch % 12 === 0 && (
                  <span style={{ fontSize: 9, color: black ? '#888' : '#555' }}>C{Math.floor(pitch / 12) - 1}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Note Grid */}
        <div ref={gridRef} onClick={handleGridClick} style={{ flex: 1, position: 'relative', overflow: 'auto', cursor: tool === 'draw' ? 'crosshair' : 'default' }}>
          {/* Background rows */}
          {Array.from({ length: totalPitches }, (_, i) => {
            const pitch = totalPitches - 1 - i
            return (
              <div key={i} style={{
                position: 'absolute',
                top: i * NOTE_HEIGHT,
                left: 0,
                right: 0,
                height: NOTE_HEIGHT,
                background: isBlack(pitch)
                  ? 'rgba(0,0,0,0.3)'
                  : pitch % 12 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }} />
            )
          })}

          {/* Notes */}
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={(e) => {
                e.stopPropagation()
                if (tool === 'erase' && track && clip) removeNote(track.id, clip.id, note.id)
              }}
              style={{
                position: 'absolute',
                left: note.startTime * BEAT_WIDTH * zoom,
                top: (totalPitches - 1 - note.pitch) * NOTE_HEIGHT + 1,
                width: Math.max(note.duration * BEAT_WIDTH * zoom - 2, 4),
                height: NOTE_HEIGHT - 2,
                background: `${track.color}cc`,
                border: `1px solid ${track.color}`,
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 3,
                overflow: 'hidden'
              }}
            >
              {note.lyric && (
                <span style={{ fontSize: 9, color: 'white', whiteSpace: 'nowrap' }}>{note.lyric}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
