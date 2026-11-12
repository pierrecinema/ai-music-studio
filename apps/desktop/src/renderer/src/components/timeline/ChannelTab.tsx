// The channel of the selected track right next to the arrangement (Cubase 15 "Channel" tab in the
// Project window): fader, pan, mute/solo, sends, group, automation and a level meter.
import React from 'react'
import { useProjectStore } from '../../stores/project.store'
import { AUTO_LABEL, hasAutomation } from '../../audio/automation'
import type { AutoParam } from '../../types'
import { MiniMeter } from './StudioLanes'

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }
const db = (v: number): string => (v <= 0.0005 ? '-inf' : (20 * Math.log10(v)).toFixed(1))

export function ChannelTab({ onClose }: { onClose: () => void }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const { updateTrack, setSend, ungroup } = useProjectStore.getState()
  const t = project.tracks.find((x) => x.id === selectedTrackId)
  const returns = project.returns ?? []
  const groups = project.tracks.filter((x) => x.type === 'group' && x.id !== t?.id)
  const nameOf = (id: string): string => returns.find((r) => r.id === id)?.name ?? ''

  return (
    <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>Channel</b>
        <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={onClose} title="Hide the channel tab">×</button>
      </div>
      {!t ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select a track to see its channel.</span> : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="color" value={t.color} onChange={(e) => updateTrack(t.id, { color: e.target.value })} title="Track colour" style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none' }} />
            <input key={t.id + t.name} defaultValue={t.name} onBlur={(e) => updateTrack(t.id, { name: e.target.value.trim() || t.name })}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.type === 'group' ? 'Group track: the tracks inside play through it' : `${t.type} track`}</span>
          <MiniMeter id={t.id} />
          <label style={row}>Volume
            <input type="range" min={0} max={1} step={0.01} value={t.volume} disabled={hasAutomation(t, 'volume')} style={{ flex: 1 }}
              onChange={(e) => updateTrack(t.id, { volume: Number(e.target.value) })} onDoubleClick={() => updateTrack(t.id, { volume: 0.8 })} />
            <span style={{ width: 40, textAlign: 'right' }}>{db(t.volume)}</span>
          </label>
          <label style={row} title="Pan: where the track sits between the left and the right speaker. Double-click: center">Pan
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>L</span>
            <input type="range" min={-1} max={1} step={0.01} value={t.pan} disabled={hasAutomation(t, 'pan')} style={{ flex: 1 }}
              onChange={(e) => updateTrack(t.id, { pan: Number(e.target.value) })} onDoubleClick={() => updateTrack(t.id, { pan: 0 })} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>R</span>
            <span style={{ width: 52, textAlign: 'right' }}>{Math.abs(t.pan) < 0.005 ? 'Center' : t.pan > 0 ? `${Math.round(t.pan * 100)} % R` : `${Math.round(-t.pan * 100)} % L`}</span>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: t.muted ? '#f59e0b' : undefined }} onClick={() => updateTrack(t.id, { muted: !t.muted })}>Mute</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: t.soloed ? 'var(--accent-light)' : undefined }} onClick={() => updateTrack(t.id, { soloed: !t.soloed })}>Solo</button>
          </div>

          <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>Sends</b>
          {returns.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>No return tracks yet: add one with “+ Return” in the Studio bar.</span>}
          {returns.map((r) => (
            <label key={r.id} style={row}><span style={{ width: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <input type="range" min={0} max={1} step={0.01} value={t.sends?.[r.id] ?? 0} disabled={hasAutomation(t, `send:${r.id}`)} style={{ flex: 1 }}
                onChange={(e) => setSend(t.id, r.id, Number(e.target.value))} onDoubleClick={() => setSend(t.id, r.id, 0)} />
            </label>
          ))}

          {t.type !== 'group' && (
            <label style={row}>Group
              <select value={t.parentId ?? ''} style={{ flex: 1, fontSize: 11 }} onChange={(e) => { updateTrack(t.id, { parentId: e.target.value || undefined }); e.target.blur() }}>
                <option value="">— none —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
          {t.type === 'group' && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => ungroup(t.id)}>Ungroup (keep the tracks)</button>}

          <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>Automation</b>
          {(['volume', 'pan', ...returns.map((r) => `send:${r.id}`)] as AutoParam[]).map((p) => (
            <div key={p} style={row}>
              <span style={{ flex: 1 }}>{AUTO_LABEL(p, nameOf)}{hasAutomation(t, p) ? ` (${t.automation![p]!.length} points)` : ''}</span>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => updateTrack(t.id, { showAutomation: t.showAutomation === p ? null : p })}>
                {t.showAutomation === p ? 'Hide' : 'Show'}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
