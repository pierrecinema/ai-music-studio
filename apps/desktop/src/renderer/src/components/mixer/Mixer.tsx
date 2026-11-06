import React from 'react'
import { useProjectStore } from '../../stores/project.store'

export function Mixer(): React.ReactElement {
  const { project, updateTrack } = useProjectStore()

  if (!project.tracks.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        No tracks — add tracks in the Timeline
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)', overflowX: 'auto', padding: 16, gap: 8 }}>
      {project.tracks.map((track) => (
        <div
          key={track.id}
          style={{
            width: 72,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${track.color}`,
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 6px',
            gap: 8
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
            {track.name}
          </span>

          {/* VU Meter placeholder */}
          <div style={{ width: 20, height: 100, background: 'var(--bg-primary)', borderRadius: 3, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              width: '100%',
              height: `${track.muted ? 0 : track.volume * 100}%`,
              background: `linear-gradient(to top, var(--success), #86efac, #fbbf24)`,
              transition: 'height 0.1s'
            }} />
          </div>

          {/* Fader */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, accentColor: track.color }}
          />

          {/* Pan */}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={track.pan}
            onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
            style={{ width: 60, accentColor: track.color }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`}
          </span>

          {/* M/S buttons */}
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: track.muted ? '#f59e0b' : 'var(--bg-primary)', color: track.muted ? '#fff' : 'var(--text-muted)' }}
            >M</button>
            <button
              onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
              style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: track.soloed ? 'var(--accent)' : 'var(--bg-primary)', color: track.soloed ? '#fff' : 'var(--text-muted)' }}
            >S</button>
          </div>

          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{Math.round(track.volume * 100)}%</span>
        </div>
      ))}

      {/* Master channel */}
      <div style={{ width: 72, background: 'var(--bg-secondary)', border: '2px solid var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px', gap: 8, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 700 }}>MASTER</span>
        <div style={{ width: 20, height: 100, background: 'var(--bg-primary)', borderRadius: 3, border: '1px solid var(--border)' }} />
        <input type="range" min={0} max={1} step={0.01} defaultValue={0.8}
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, accentColor: 'var(--accent)' }} />
      </div>
    </div>
  )
}
