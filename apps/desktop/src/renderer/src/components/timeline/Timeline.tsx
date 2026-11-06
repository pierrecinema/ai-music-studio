import React, { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useAudioStore } from '../../stores/audio.store'
import type { Track } from '../../types'

const TRACK_HEIGHT = 72
const HEADER_WIDTH = 200
const BEAT_WIDTH = 80

export function Timeline(): React.ReactElement {
  const { t } = useTranslation()
  const { project, addTrack, updateTrack, selectTrack, selectedTrackId } = useProjectStore()
  const { zoom, scrollX } = useUIStore()
  const { currentBeat } = useAudioStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const beatWidth = BEAT_WIDTH * zoom
  const totalBeats = 128

  const renderTrackHeader = (track: Track) => (
    <div
      key={track.id}
      onClick={() => selectTrack(track.id)}
      style={{
        height: TRACK_HEIGHT,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 6,
        background: selectedTrackId === track.id ? 'var(--bg-hover)' : 'var(--bg-secondary)',
        cursor: 'pointer',
        borderLeft: `3px solid ${track.color}`
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {track.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{track.type}</div>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        <button
          onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
          style={{ ...tinyBtn, color: track.muted ? '#f59e0b' : 'var(--text-muted)' }}
          title={t('track.mute')}
        >M</button>
        <button
          onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }}
          style={{ ...tinyBtn, color: track.soloed ? 'var(--accent-light)' : 'var(--text-muted)' }}
          title={t('track.solo')}
        >S</button>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={track.volume}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
        style={{ width: 40, accentColor: track.color }}
      />
    </div>
  )

  const renderClips = (track: Track) => (
    <div
      key={track.id}
      style={{
        height: TRACK_HEIGHT,
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        background: selectedTrackId === track.id ? 'rgba(124,58,237,0.04)' : 'transparent'
      }}
    >
      {track.clips.map((clip) => (
        <div
          key={clip.id}
          style={{
            position: 'absolute',
            left: clip.startTime * beatWidth - scrollX,
            top: 8,
            width: clip.duration * beatWidth,
            height: TRACK_HEIGHT - 16,
            background: `${track.color}33`,
            border: `1px solid ${track.color}88`,
            borderRadius: 4,
            overflow: 'hidden',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px'
          }}
        >
          <span style={{ fontSize: 11, color: track.color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clip.notes?.length ? `${clip.notes.length} notes` : 'Clip'}
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 240,
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border)'
    }}>
      {/* Ruler */}
      <div style={{ display: 'flex', height: 24, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ width: HEADER_WIDTH, flexShrink: 0, borderRight: '1px solid var(--border)' }} />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: i * 4 * beatWidth - scrollX,
              top: 0,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 4
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i * 4 + 1}</span>
            </div>
          ))}
          {/* Playhead */}
          <div style={{
            position: 'absolute',
            left: currentBeat * beatWidth - scrollX,
            top: 0,
            width: 2,
            height: '100%',
            background: 'var(--accent)',
            pointerEvents: 'none'
          }} />
        </div>
      </div>

      {/* Tracks */}
      <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
        {/* Headers */}
        <div style={{ width: HEADER_WIDTH, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
          {project.tracks.map(renderTrackHeader)}
          {/* Add track buttons */}
          <div style={{ display: 'flex', gap: 4, padding: 8 }}>
            {(['vocal', 'instrument', 'audio', 'midi'] as const).map((type) => (
              <button
                key={type}
                onClick={() => addTrack(type)}
                title={t(`track.add${type.charAt(0).toUpperCase() + type.slice(1)}`)}
                style={{ ...tinyBtn, fontSize: 10, padding: '2px 6px', borderRadius: 4 }}
              >
                +{type[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div style={{ width: totalBeats * beatWidth, minHeight: '100%' }}>
            {project.tracks.map(renderClips)}
          </div>
          {/* Grid lines */}
          {Array.from({ length: totalBeats + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: i * beatWidth - scrollX,
              top: 0,
              width: 1,
              height: '100%',
              background: i % 4 === 0 ? 'var(--border)' : 'rgba(255,255,255,0.03)',
              pointerEvents: 'none'
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

const tinyBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 9,
  fontWeight: 700
}
