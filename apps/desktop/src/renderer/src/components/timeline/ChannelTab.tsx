// The channel of the selected track right next to the arrangement (Cubase 15 "Channel" tab in the
// Project window): fader, pan, mute/solo, sends, group, automation and a level meter.
import React from 'react'
import { useProjectStore } from '../../stores/project.store'
import { AUTO_LABEL, hasAutomation } from '../../audio/automation'
import type { AutoParam, InsertFx } from '../../types'
import { AutomateButton, FxAddSelect, InstrumentSelect, MiniMeter, openPlugin, PresetSelect } from './StudioLanes'
import { INSERT_LABEL } from '../../audio/fx'
import { openLanes } from './studioLayout'
import { tr } from '../../i18n/tr'
import { useUIStore } from '../../stores/ui.store'

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
        <b style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{tr('Channel')}</b>
        <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={onClose} title={tr('Hide the channel tab')}>×</button>
      </div>
      {!t ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('Select a track to see its channel.')}</span> : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="color" value={t.color} onChange={(e) => updateTrack(t.id, { color: e.target.value })} title={tr('Track colour')} style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none' }} />
            <input key={t.id + t.name} defaultValue={t.name} onBlur={(e) => updateTrack(t.id, { name: e.target.value.trim() || t.name })}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.type === 'group' ? tr('Group track: the tracks inside play through it') : t.type === 'midi' ? tr('MIDI track') : tr('Audio track')}</span>
          <MiniMeter id={t.id} />
          <label style={row}>{tr('Volume')}
            <input type="range" min={0} max={1} step={0.01} value={t.volume} disabled={hasAutomation(t, 'volume')} style={{ flex: 1 }}
              onChange={(e) => updateTrack(t.id, { volume: Number(e.target.value) })} onDoubleClick={() => updateTrack(t.id, { volume: 0.8 })} />
            <span style={{ width: 40, textAlign: 'right' }}>{db(t.volume)}</span>
          </label>
          <label style={row} title={tr('Pan: where the track sits between the left and the right speaker. Double-click: center')}>{tr('Pan')}
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>L</span>
            <input type="range" min={-1} max={1} step={0.01} value={t.pan} disabled={hasAutomation(t, 'pan')} style={{ flex: 1 }}
              onChange={(e) => updateTrack(t.id, { pan: Number(e.target.value) })} onDoubleClick={() => updateTrack(t.id, { pan: 0 })} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>R</span>
            <span style={{ width: 52, textAlign: 'right' }}>{Math.abs(t.pan) < 0.005 ? tr('Center') : t.pan > 0 ? `${Math.round(t.pan * 100)} % R` : `${Math.round(-t.pan * 100)} % L`}</span>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: t.muted ? '#f59e0b' : undefined }} onClick={() => updateTrack(t.id, { muted: !t.muted })}>{tr('Mute')}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: t.soloed ? 'var(--accent-light)' : undefined }} onClick={() => updateTrack(t.id, { soloed: !t.soloed })}>{tr('Solo')}</button>
          </div>

          {(t.type === 'midi' || t.type === 'instrument') && (
            <>
              <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>{tr('Instrument')}</b>
              <div style={row}>
                {t.instrument && (
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 4px', color: t.instrument.on ? 'var(--green)' : 'var(--text-muted)' }}
                    title={t.instrument.on ? tr('On: click to play the notes with the built-in synth') : tr('Off: click to switch the instrument on')}
                    onClick={() => updateTrack(t.id, { instrument: { ...t.instrument!, on: !t.instrument!.on } })}>⏻</button>
                )}
                <InstrumentSelect track={t} style={{ flex: 1, fontSize: 11, minWidth: 0 }} />
                {t.instrument && <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 5px' }} title={tr('Open the plugin window')} onClick={() => void openPlugin(t.instrument!, t.name)}>{tr('Open')}</button>}
              </div>
              {t.instrument?.vst && <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><PresetSelect fx={t.instrument} style={{ maxWidth: '100%', flex: 1 }} /><AutomateButton track={t} fx={t.instrument} /></div>}
              <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Play this track with an AI instrument (violin, trumpet …) or let a virtual band play along')}
                onClick={() => { useUIStore.setState({ aiTrackId: t.id }); useUIStore.getState().setActiveView('instruments') }}>🎻 {tr('AI instrument…')}</button>
            </>
          )}

          {(
            <>
              <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>{tr('Effects (inserts)')}</b>
              {(t.fx ?? []).length === 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tr('No effects yet. Add a built-in effect or one of your VST plugins:')}</span>}
              {(t.fx ?? []).map((f, i, list) => {
                const set = (patch: Partial<InsertFx>): void => updateTrack(t.id, { fx: list.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) })
                const move = (d: number): void => { const j = i + d; if (j < 0 || j >= list.length) return; const nx = [...list]; [nx[i], nx[j]] = [nx[j], nx[i]]; updateTrack(t.id, { fx: nx }) }
                return (
                  <div key={f.id} style={{ ...row, border: '1px solid var(--border-mid)', borderRadius: 6, padding: '3px 4px', opacity: f.on ? 1 : 0.55 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 4px', color: f.on ? 'var(--green)' : 'var(--text-muted)' }} title={f.on ? tr('On: click to bypass') : tr('Bypassed: click to switch on')} onClick={() => set({ on: !f.on })}>⏻</button>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={f.vst ? `${f.vst.name} · ${f.vst.format}` : ''}>
                      {f.type === 'vst' ? f.vst?.name ?? tr('VST plugin') : tr(INSERT_LABEL[f.type])}
                    </span>
                    {f.type === 'vst'
                      ? <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 5px' }} title={tr('Open the plugin window')} onClick={() => void openPlugin(f, t.name)}>{tr('Open')}</button>
                      : <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 5px' }} title={tr('Show the settings in the effects lane under the track')} onClick={() => updateTrack(t.id, { showFx: true })}>{tr('Edit')}</button>}
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 3px' }} disabled={i === 0} title={tr('Earlier in the chain')} onClick={() => move(-1)}>▲</button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 3px' }} disabled={i === list.length - 1} title={tr('Later in the chain')} onClick={() => move(1)}>▼</button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 3px', color: 'var(--red)' }} title={tr('Remove this effect')} onClick={() => updateTrack(t.id, { fx: list.filter((x) => x.id !== f.id) })}>×</button>
                  </div>
                )
              })}
              <FxAddSelect track={t} style={{ fontSize: 11, width: '100%' }} />
            </>
          )}

          <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>{tr('Sends')}</b>
          {returns.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tr('No return tracks yet: add one with “+ Return” in the Studio bar.')}</span>}
          {returns.map((r) => (
            <label key={r.id} style={row}><span style={{ width: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <input type="range" min={0} max={1} step={0.01} value={t.sends?.[r.id] ?? 0} disabled={hasAutomation(t, `send:${r.id}`)} style={{ flex: 1 }}
                onChange={(e) => setSend(t.id, r.id, Number(e.target.value))} onDoubleClick={() => setSend(t.id, r.id, 0)} />
            </label>
          ))}

          {t.type !== 'group' && (
            <label style={row}>{tr('Group')}
              <select value={t.parentId ?? ''} style={{ flex: 1, fontSize: 11 }} onChange={(e) => { updateTrack(t.id, { parentId: e.target.value || undefined }); e.target.blur() }}>
                <option value="">{tr('— none —')}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
          {t.type === 'group' && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => ungroup(t.id)}>{tr('Ungroup (keep the tracks)')}</button>}

          <b style={{ fontSize: 11, color: 'var(--text-primary)' }}>{tr('Automation')}</b>
          {(['volume', 'pan', ...returns.map((r) => `send:${r.id}`)] as AutoParam[]).map((p) => (
            <div key={p} style={row}>
              <span style={{ flex: 1 }}>{AUTO_LABEL(p, nameOf, t)}{hasAutomation(t, p) ? ` (${t.automation![p]!.length} points)` : ''}</span>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => {
                const lanes = openLanes(t)
                updateTrack(t.id, { autoLanes: lanes.includes(p) ? lanes.filter((x) => x !== p) : [...lanes, p], showAutomation: null })
              }}>
                {openLanes(t).includes(p) ? tr('Hide') : tr('Show')}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
