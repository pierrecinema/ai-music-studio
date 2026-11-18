// The effect rack of the Hardware rack look: the effects (and the instrument) of the selected track as rack modules
// with knobs, at the right of the window. The same settings as the effects lane under the track.
import React from 'react'
import { useProjectStore } from '../../stores/project.store'
import { INSERT_LABEL, INSERT_PARAMS } from '../../audio/fx'
import { Knob } from '../mastering/MasterRack'
import { FxAddSelect, InstrumentSelect, openPlugin } from '../timeline/StudioLanes'
import type { InsertFx } from '../../types'
import { tr } from '../../i18n/tr'

const screw: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #bbb, #555)', flexShrink: 0 }

function Module({ title, on, onToggle, children, extra }: { title: string; on: boolean; onToggle: () => void; children?: React.ReactNode; extra?: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ background: 'linear-gradient(#3b3e44, #2c2f34)', border: '1px solid #17181b', boxShadow: 'inset 0 1px 0 #555a62', padding: '6px 8px 8px', opacity: on ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={screw} />
        <button onClick={onToggle} title={on ? tr('On: click to bypass') : tr('Bypassed: click to switch on')}
          style={{ width: 10, height: 10, borderRadius: '50%', border: 'none', cursor: 'pointer', background: on ? '#3cff6b' : '#444', boxShadow: on ? '0 0 6px #3cff6b' : undefined }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {extra}
        <span style={screw} />
      </div>
      {children && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>{children}</div>}
    </div>
  )
}

export function RackPanel(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const t = project.tracks.find((x) => x.id === selectedTrackId)
  const small: React.CSSProperties = { fontSize: 10, padding: '1px 6px' }
  return (
    <aside className="rack-panel" style={{ width: 236, flexShrink: 0, overflowY: 'auto', background: '#17181b', borderLeft: '2px solid #000', padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ background: '#9db48a', color: '#1e2a17', fontFamily: 'Consolas, monospace', fontSize: 12, padding: '6px 8px', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)', border: '1px solid #000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t ? `FX · ${t.name.toUpperCase()}` : tr('Select a track').toUpperCase()}
      </div>
      {t && (t.type === 'midi' || t.type === 'instrument') && (
        <Module title={t.instrument?.vst?.name ?? tr('Built-in synth')} on={t.instrument ? t.instrument.on : true}
          onToggle={() => t.instrument && updateTrack(t.id, { instrument: { ...t.instrument, on: !t.instrument.on } })}
          extra={t.instrument ? <button className="btn btn-ghost" style={small} onClick={() => void openPlugin(t.instrument!, t.name)}>{tr('Open')}</button> : undefined}>
          <InstrumentSelect track={t} style={{ fontSize: 10, width: '100%', marginTop: 2 }} />
        </Module>
      )}
      {t && (t.fx ?? []).map((f, i, list) => {
        const set = (patch: Partial<InsertFx>): void => updateTrack(t.id, { fx: list.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) })
        const remove = <button className="btn btn-ghost" style={{ ...small, color: 'var(--red)' }} title={tr('Remove this effect')} onClick={() => updateTrack(t.id, { fx: list.filter((x) => x.id !== f.id) })}>×</button>
        if (f.type === 'vst') {
          return <Module key={f.id} title={f.vst?.name ?? tr('VST plugin')} on={f.on} onToggle={() => set({ on: !f.on })}
            extra={<><button className="btn btn-ghost" style={small} onClick={() => void openPlugin(f, t.name)}>{tr('Open')}</button>{remove}</>} />
        }
        return (
          <Module key={f.id} title={tr(INSERT_LABEL[f.type])} on={f.on} onToggle={() => set({ on: !f.on })} extra={remove}>
            {INSERT_PARAMS[f.type].map((d) => (
              <Knob key={d.key} name={tr(d.label)} value={f.p[d.key] ?? d.def} refv={d.def} min={d.min} max={d.max} step={d.step} unit={d.unit}
                onChange={(v) => set({ p: { ...f.p, [d.key]: v } })} />
            ))}
          </Module>
        )
      })}
      {t && t.type !== 'group' && <FxAddSelect track={t} style={{ fontSize: 11, width: '100%' }} />}
      {t && !(t.fx ?? []).length && <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{tr('No effects yet. Add a built-in effect or one of your VST plugins:')}</div>}
    </aside>
  )
}
