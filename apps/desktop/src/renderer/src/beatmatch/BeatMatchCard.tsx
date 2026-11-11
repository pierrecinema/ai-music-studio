import React, { useEffect, useState } from 'react'
import { useBeatMatch, matchClip, matchProject, type Proposal } from './store'
import { useProjectStore } from '../stores/project.store'

const box: React.CSSProperties = {
  position: 'fixed', right: 16, bottom: 40, width: 380, zIndex: 9400, background: 'var(--bg-panel)',
  border: '1px solid var(--accent)', borderRadius: 10, padding: 14, boxShadow: '0 10px 30px #000a',
  display: 'flex', flexDirection: 'column', gap: 8
}
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }

// Asks, for audio that was just added, whether to bring it in time with the project.
export function BeatMatchCard(): React.ReactElement | null {
  const queue = useBeatMatch((s) => s.queue)
  const mode = useBeatMatch((s) => s.mode)
  const setMode = useBeatMatch((s) => s.setMode)
  const next = useBeatMatch((s) => s.next)
  const projectBpm = useProjectStore((s) => s.project.bpm)
  const p: Proposal | undefined = queue[0]
  const [bpm, setBpm] = useState('')
  const [align, setAlign] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (p?.status === 'ready' && p.bpm) {
      setBpm(String(p.bpm))
      setAlign((p.firstBeat ?? 0) > 0.02)
    } else if (p) setBpm('')
    setNote(null)
  }, [p?.id, p?.status, p?.bpm, p?.firstBeat])

  if (!p) return null
  const value = parseFloat(bpm.replace(',', '.'))
  const valid = value >= 40 && value <= 240
  const close = (): void => next()
  const half = (): void => { if (valid) setBpm(String(Math.round((value / 2) * 100) / 100)) }
  const twice = (): void => { if (valid) setBpm(String(Math.round(value * 2 * 100) / 100)) }
  const apply = (kind: 'clip' | 'project'): void => {
    if (!valid) return
    const ok = kind === 'clip' ? matchClip(p, value, align) : matchProject(p, value, align)
    if (!ok) { setNote('The clip is gone, nothing to match.'); return }
    close()
  }
  const same = valid && Math.abs(value - projectBpm) / projectBpm < 0.005

  return (
    <div style={box} role="dialog" aria-label="Beat matching">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Beat matching</div>
        <button className="btn btn-ghost" style={{ padding: '0 8px' }} onClick={close} title="Keep it as it is">✕</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path}>{p.name}</div>

      {p.status === 'analyzing' && <div style={muted}>Measuring tempo and first beat… (the first time takes a little longer)</div>}
      {p.status === 'error' && <div style={{ ...muted, color: 'var(--red)' }}>The tempo could not be measured: {p.message}</div>}
      {p.status === 'none' && <div style={muted}>{p.message} If you know the tempo, type it below to sync anyway.</div>}

      {(p.status === 'ready' || p.status === 'none' || p.status === 'error') && (
        <>
          {p.status === 'ready' && (
            <div style={muted}>
              Measured about <b style={{ color: 'var(--text-primary)' }}>{p.bpm} BPM</b>
              {p.firstBeat !== undefined && p.firstBeat > 0.02 ? <>, first beat after {p.firstBeat.toFixed(2)} s</> : null}.
              The project runs at <b style={{ color: 'var(--text-primary)' }}>{projectBpm} BPM</b>.
              {p.firstAudio ? ' This is the first audio, so the project can take its tempo.' : ''}
              {' '}Check by ear: a tempo found at half or double speed is common (use ÷2 / ×2).
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={muted}>Tempo</span>
            <input value={bpm} onChange={(e) => setBpm(e.target.value)} style={{ width: 80 }} placeholder="BPM" />
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={half} title="Half speed">÷2</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={twice} title="Double speed">×2</button>
          </div>
          <label style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} />
            Put its beats on the project beats (moves the clip a little; at the very start the lead-in is cut)
          </label>
          {same && <div style={{ ...muted, color: 'var(--green)' }}>Already the same tempo as the project: no stretching needed.</div>}
          {note && <div style={{ ...muted, color: 'var(--red)' }}>{note}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`btn ${p.firstAudio ? 'btn-ghost' : 'btn-primary'}`} disabled={!valid} onClick={() => apply('clip')}
              title="Stretch or squeeze the audio to the project tempo without changing its pitch">
              Sync to {projectBpm} BPM
            </button>
            <button className={`btn ${p.firstAudio ? 'btn-primary' : 'btn-ghost'}`} disabled={!valid || value > 300} onClick={() => apply('project')}
              title="Change the project tempo to the tempo of this audio">
              Set project to {valid ? value : '…'} BPM
            </button>
            <button className="btn btn-ghost" onClick={close}>Keep as is</button>
          </div>
        </>
      )}

      <div style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
        New audio:
        <select value={mode} onChange={(e) => setMode(e.target.value as 'ask' | 'auto' | 'off')} style={{ fontSize: 11 }}>
          <option value="ask">ask me every time</option>
          <option value="auto">sync automatically to the master BPM</option>
          <option value="off">never offer</option>
        </select>
      </div>
      {queue.length > 1 && <div style={muted}>{queue.length - 1} more waiting</div>}
    </div>
  )
}
