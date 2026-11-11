import React, { useEffect, useRef } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { masterLevel, trackLevel } from '../../audio/engine'

const toDb = (v: number): string => (v <= 0.0005 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}`)

// A vertical meter fed by the audio engine (peak with a slow fall-back and a held peak line)
function Meter({ read, height = 76 }: { read: () => number; height?: number }): React.ReactElement {
  const fill = useRef<HTMLDivElement>(null)
  const hold = useRef<HTMLDivElement>(null)
  const isPlaying = useAudioStore((s) => s.isPlaying)

  useEffect(() => {
    let raf = 0
    let level = 0
    let held = 0
    let heldAt = 0
    const loop = (t: number): void => {
      const now = isPlaying ? read() : 0
      level = Math.max(now, level * 0.88)
      if (now >= held || t - heldAt > 900) { held = Math.max(now, held * 0.97); if (now >= held) heldAt = t }
      if (fill.current) fill.current.style.height = `${Math.min(100, level * 100)}%`
      if (hold.current) hold.current.style.bottom = `${Math.min(99, held * 100)}%`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, read])

  return (
    <div style={{ width: 20, height, background: 'var(--bg-primary)', borderRadius: 3, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      <div ref={fill} style={{ position: 'absolute', bottom: 0, width: '100%', height: 0, background: 'linear-gradient(to top, #22c55e 0%, #22c55e 60%, #fbbf24 80%, #ef4444 100%)' }} />
      <div ref={hold} style={{ position: 'absolute', bottom: 0, width: '100%', height: 2, background: '#fff', opacity: 0.8 }} />
    </div>
  )
}

export function Mixer(): React.ReactElement {
  const tracks = useProjectStore((s) => s.project.tracks)
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)', overflow: 'auto', padding: 12, gap: 8, alignItems: 'flex-start' }}>
      {tracks.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
          No tracks yet. Add tracks in the Studio.
        </div>
      )}
      {tracks.map((track) => (
        <div
          key={track.id}
          style={{
            width: 72, flexShrink: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderTop: `3px solid ${track.color}`,
            borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 6px', gap: 5
          }}
        >
          <span title={track.name} style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
            {track.name}
          </span>
          <Meter read={() => trackLevel(track.id)} />
          <input
            type="range" min={0} max={1} step={0.01} value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            onDoubleClick={() => updateTrack(track.id, { volume: 0.8 })}
            title="Volume (double-click: reset)"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 76, flexShrink: 0, accentColor: track.color }}
          />
          <input
            type="range" min={-1} max={1} step={0.01} value={track.pan}
            onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
            onDoubleClick={() => updateTrack(track.id, { pan: 0 })}
            title="Pan (double-click: center)"
            style={{ width: 60, accentColor: track.color }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`}
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => updateTrack(track.id, { muted: !track.muted })} title="Mute"
              style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: track.muted ? '#f59e0b' : 'var(--bg-primary)', color: track.muted ? '#fff' : 'var(--text-muted)' }}>M</button>
            <button onClick={() => updateTrack(track.id, { soloed: !track.soloed })} title="Solo"
              style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: track.soloed ? 'var(--accent)' : 'var(--bg-primary)', color: track.soloed ? '#fff' : 'var(--text-muted)' }}>S</button>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{toDb(track.volume)} dB</span>
        </div>
      ))}

      <div style={{ width: 72, flexShrink: 0, background: 'var(--bg-secondary)', border: '2px solid var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 6px', gap: 5, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 700 }}>MASTER</span>
        <Meter read={masterLevel} />
        <input
          type="range" min={0} max={1} step={0.01} value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
          onDoubleClick={() => setMasterVolume(0.8)}
          title="Master volume (double-click: reset)"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 76, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{toDb(masterVolume)} dB</span>
      </div>
    </div>
  )
}
