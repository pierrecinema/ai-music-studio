// Extra lanes of the Studio: automation (Ableton automation lanes / Cubase automation tracks), the tempo
// track, take lanes for comping, and the return tracks with their effects.
import { usePluginsStore } from '../../stores/plugins.store'
import { isInstrumentLike, onVstChange, type PluginInfo, showVstEditor, vstFailure, vstParams, vstApplyState, vstStateNow, type VstParam } from '../../audio/vst/host'
import { liveSampleRate, warmInstrument } from '../../audio/engine'
import { TIMBRES } from '../../audio/synth'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../stores/project.store'
import { snapBeat } from '../../edit/grid'
import { rangeOf, sortedPoints, valueAt, AUTO_LABEL } from '../../audio/automation'
import { tempoPoints } from '../../audio/timemap'
import { trackLevel } from '../../audio/engine'
import type { AutoParam, InsertFx, InsertType, ReturnTrack, TakeLane, Track } from '../../types'
import { AUTO_HEIGHT, AUTO_MIN_HEIGHT, FX_HEIGHT, HEADER_WIDTH, openLanes, RETURN_HEIGHT, TAKE_HEIGHT, TEMPO_HEIGHT, trackPointer } from './studioLayout'
import { AUTOMATABLE, fromUnit, INSERT_LABEL, INSERT_PARAMS, insertDefaults, toUnit } from '../../audio/fx'
import { useAudioStore } from '../../stores/audio.store'
import { nanoid } from 'nanoid'
import type { PopoverSpec } from './Popover'
import { tr, trf } from '../../i18n/tr'
import { askText } from '../common/AskText'
import { useSoundPack } from '../../lib/useSoundPack'
import { PACK_INSTRUMENTS, packOf } from '../../audio/soundbank'
const PACK_NAMES: Record<string, string> = { salamander: 'Salamander', vsco: 'VSCO-2', musescore: 'MuseScore', generaluser: 'GeneralUser' }

const small: React.CSSProperties = { fontSize: 10, padding: '1px 6px' }

// ── automation ───────────────────────────────────────────────────────────────

export function AutomationHeader({ track, param, min }: { track: Track; param: AutoParam; min: boolean }): React.ReactElement {
  const returns = useProjectStore((s) => s.project.returns ?? [])
  const { updateTrack, setAutomation } = useProjectStore.getState()
  const lanes = openLanes(track)
  const options: AutoParam[] = ['volume', 'pan', ...returns.map((r) => `send:${r.id}` as AutoParam)]
  const nameOf = (id: string): string => returns.find((r) => r.id === id)?.name ?? ''
  const setLanes = (next: AutoParam[]): void => updateTrack(track.id, { autoLanes: next, showAutomation: null })
  const toggleMin = (): void => {
    const cur = track.autoMin ?? []
    updateTrack(track.id, { autoMin: cur.includes(param) ? cur.filter((x) => x !== param) : [...cur, param] })
  }
  // plugin parameters: the ones already used on this track, and a picker for any parameter of each plugin
  const plugins = [...(track.fx ?? []).filter((f) => (f.type === 'vst' && f.vst) || AUTOMATABLE[f.type]), ...(track.instrument?.vst ? [track.instrument] : [])]
  for (const f of plugins) for (const i of Object.keys(f.paramNames ?? {})) options.push(`fx:${f.id}:${i}` as AutoParam)
  for (const k of Object.keys(track.automation ?? {})) if (k.startsWith('fx:') && !options.includes(k as AutoParam)) options.push(k as AutoParam)
  const [picking, setPicking] = useState<{ fx: InsertFx; list: VstParam[] | null; error?: string; q: string } | null>(null)
  const selRef = useRef<HTMLSelectElement>(null)
  const anchor = (): { left: number; top: number } => {
    const r = selRef.current?.getBoundingClientRect()
    return r ? { left: Math.max(8, Math.min(window.innerWidth - 268, r.left)), top: Math.min(r.bottom + 4, window.innerHeight - 320) } : { left: 100, top: 100 }
  }
  const startPick = (fxId: string): void => {
    const fx = plugins.find((f) => f.id === fxId)
    if (!fx) return
    if (fx.type !== 'vst') { setPicking({ fx, list: builtinParams(fx), q: '' }); return }
    setPicking({ fx, list: null, q: '' })
    vstParams(fx, liveSampleRate()).then((list) => setPicking({ fx, list, q: '' })).catch((e: Error) => setPicking({ fx, list: [], error: e.message, q: '' }))
  }
  const choose = (fx: InsertFx, p: VstParam): void => {
    const key = `fx:${fx.id}:${p.i}` as AutoParam
    const names = paramNamesFor(fx, p)
    if (track.instrument?.id === fx.id) updateTrack(track.id, { instrument: { ...track.instrument, paramNames: names } })
    else updateTrack(track.id, { fx: (track.fx ?? []).map((f) => (f.id === fx.id ? { ...f, paramNames: names } : f)) })
    // a new lane starts at the plugin's current value
    if (!track.automation?.[key]?.length) setAutomation(track.id, key, [{ beat: 0, value: p.value }])
    setLanes(lanes.map((x) => (x === param ? key : x)))
    setPicking(null)
  }
  const free = options.filter((o) => !lanes.includes(o))
  const count = track.automation?.[param]?.length ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: min ? '2px 8px 2px 18px' : '4px 8px 4px 18px', fontSize: 10, color: 'var(--text-muted)' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button className="btn btn-ghost" style={{ ...small, padding: '0 4px' }} title={min ? tr('Show this lane in full') : tr('Make this lane small')} onClick={toggleMin}>{min ? '▸' : '▾'}</button>
        <select ref={selRef} value={param} style={{ fontSize: 10, flex: 1, minWidth: 0, ...(min ? { height: 20, padding: '0 4px' } : {}) }} title={tr('Which value this lane automates')}
          onChange={(e) => { const v = e.target.value; e.target.blur(); if (v.startsWith('pick:')) { startPick(v.slice(5)); return } setLanes(lanes.map((x) => (x === param ? v as AutoParam : x))) }}>
          {[param, ...free].map((o) => <option key={o} value={o}>{AUTO_LABEL(o, nameOf, track)}{track.automation?.[o]?.length ? ' •' : ''}</option>)}
          {plugins.length > 0 && (
            <optgroup label={tr('Plugin parameter')}>
              {plugins.map((f) => <option key={f.id} value={`pick:${f.id}`}>{trf('{name}: choose a parameter…', { name: f.vst?.name ?? tr(INSERT_LABEL[f.type]) })}</option>)}
            </optgroup>
          )}
        </select>
        {!min && free.length > 0 && <button className="btn btn-ghost" style={small} title={tr('Add a lane for another value (pan, a send…)')} onClick={() => setLanes([...lanes, free[0]])}>+</button>}
        <button className="btn btn-ghost" style={small} title={tr('Close this lane (its points stay)')} onClick={() => setLanes(lanes.filter((x) => x !== param))}>×</button>
      </div>
      {picking && createPortal(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', boxShadow: '0 6px 18px rgba(0,0,0,0.5)', padding: 6, position: 'fixed', ...anchor(), width: 260, zIndex: 1000, fontSize: 10, color: 'var(--text-secondary)' }}>
          {!picking.list && <span>{tr('Loading the plugin…')}</span>}
          {picking.error && <span style={{ color: 'var(--red)' }}>{picking.error}</span>}
          {picking.list && (
            <>
              <input autoFocus placeholder={tr('Search a parameter…')} value={picking.q} style={{ fontSize: 10 }}
                onChange={(e) => setPicking({ ...picking, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setPicking(null); e.stopPropagation() }} />
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {picking.list.filter((p) => p.name.toLowerCase().includes(picking.q.toLowerCase())).slice(0, 300).map((p) => (
                  <div key={p.i} onClick={() => choose(picking.fx, p)} style={{ padding: '2px 4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                    {p.name} <span style={{ color: 'var(--text-muted)' }}>{p.text}{p.label ? ` ${p.label}` : ''}</span>
                  </div>
                ))}
                {!picking.list.length && !picking.error && <span>{tr('This plugin has no automatable parameters.')}</span>}
              </div>
              <button className="btn btn-ghost" style={small} onClick={() => setPicking(null)}>{tr('Cancel')}</button>
            </>
          )}
        </div>, document.body
      )}
      {!min && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{count ? `${count} point${count > 1 ? 's' : ''}` : tr('no points yet')}</span>
          <button className="btn btn-ghost" style={small} title={tr('Remove all points of this lane')} onClick={() => setAutomation(track.id, param, [])}>{tr('Clear')}</button>
        </div>
      )}
    </div>
  )
}

export function AutomationLane({ track, param, beatWidth, min = false }: { track: Track; param: AutoParam; beatWidth: number; min?: boolean }): React.ReactElement {
  const setAutomation = useProjectStore((s) => s.setAutomation)
  const ref = useRef<HTMLDivElement>(null)
  const [lo, hi] = rangeOf(param)
  const fallback = param === 'volume' ? track.volume : param === 'pan' ? track.pan : param.startsWith('fx:') ? 0.5 : track.sends?.[param.slice(5)] ?? 0
  const pts = sortedPoints(track.automation?.[param])
  const h = (min ? AUTO_MIN_HEIGHT : AUTO_HEIGHT) - 8
  const yOf = (v: number): number => 4 + (1 - (v - lo) / (hi - lo)) * h
  const valueOfY = (y: number): number => Math.max(lo, Math.min(hi, lo + (1 - (y - 4) / h) * (hi - lo)))
  const pos = (e: { clientX: number; clientY: number }): { beat: number; value: number } => {
    const r = ref.current!.getBoundingClientRect()
    return { beat: Math.max(0, (e.clientX - r.left) / beatWidth), value: valueOfY(e.clientY - r.top) }
  }
  const width = ref.current?.clientWidth ?? 4000
  const endBeat = Math.max(...pts.map((p) => p.beat), 0) + 64
  const line = pts.length
    ? [`0,${yOf(pts[0].value)}`, ...pts.map((p) => `${p.beat * beatWidth},${yOf(p.value)}`), `${Math.max(width, endBeat * beatWidth)},${yOf(pts[pts.length - 1].value)}`].join(' ')
    : ''

  const down = (e: React.PointerEvent): void => {
    if (e.button !== 0 || e.target !== e.currentTarget || min) return
    const p = pos(e)
    const point = { beat: snapBeat(p.beat, e.altKey), value: pts.length ? p.value : p.value }
    const next = [...pts, point]
    setAutomation(track.id, param, next)
    dragPoint(e, next.length - 1, next)
  }
  const dragPoint = (e: React.PointerEvent, index: number, list = pts): void => {
    e.stopPropagation()
    const start = list[index]
    trackPointer((ev) => {
      const p = pos(ev)
      const moved = list.map((x, i) => (i === index ? { beat: snapBeat(p.beat, ev.altKey), value: ev.shiftKey ? start.value : p.value } : x))
      setAutomation(track.id, param, moved)
    })
  }
  const remove = (index: number): void => setAutomation(track.id, param, pts.filter((_, i) => i !== index))

  return (
    <div ref={ref} onPointerDown={down}
      title={min ? tr('Minimized: open it (▸) to edit the points') : tr('Click: add a point. Drag a point to move it (Shift: only in time, Alt: off the grid). Double-click a point to delete it.')}
      style={{ position: 'absolute', inset: 0, cursor: min ? 'default' : 'crosshair', background: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
      {!pts.length && !min && <span style={{ position: 'absolute', left: 8, top: AUTO_HEIGHT / 2 - 8, fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}>
        {tr('No automation yet: click to add the first point. Now:')} {param === 'pan' ? fallback.toFixed(2) : `${Math.round(fallback * 100)} %`}
      </span>}
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        {line && <polyline points={line} fill="none" stroke={track.color} strokeWidth={2} />}
      </svg>
      {!min && pts.map((p, i) => (
        <div key={i} onPointerDown={(e) => dragPoint(e, i)} onDoubleClick={(e) => { e.stopPropagation(); remove(i) }}
          title={`${param === 'pan' ? p.value.toFixed(2) : `${Math.round(p.value * 100)} %`} at beat ${p.beat.toFixed(2)}`}
          style={{ position: 'absolute', left: p.beat * beatWidth - 5, top: yOf(p.value) - 5, width: 10, height: 10, borderRadius: 5, background: '#fff', border: `2px solid ${track.color}`, cursor: 'grab' }} />
      ))}
    </div>
  )
}

export { valueAt }

// ── effects in a track (inserts) ─────────────────────────────────────────────

const FX_TYPES: InsertType[] = ['eq', 'compressor', 'delay', 'reverb', 'filter', 'dyneq', 'saturation', 'stereo', 'limiter']

// "+ Effect…": a built-in effect or one of the ticked VST plugins (effects lane and channel tab)
export function FxAddSelect({ track, style, onSet }: { track: Track; style?: React.CSSProperties; onSet?: (fx: InsertFx[]) => void }): React.ReactElement {
  const updateTrack = onSet ? (_: string, patch: { fx: InsertFx[] }): void => onSet(patch.fx) : useProjectStore.getState().updateTrack
  const all = usePluginsStore((s) => s.plugins)
  const off = usePluginsStore((s) => s.off)
  const plugins = all.filter((p) => !isInstrumentLike(p) && !off.includes(p.id))
  // on a MIDI track the VST instruments are offered here too: picking one makes it the track's instrument
  const instruments = track.type === 'midi' && !onSet ? all.filter((p) => isInstrumentLike(p) && !off.includes(p.id)) : []
  const loadedList = usePluginsStore((s) => s.loaded)
  useEffect(() => { if (!loadedList) void usePluginsStore.getState().load() }, [loadedList])
  const add = (type: InsertType): void =>
    updateTrack(track.id, { fx: [...(track.fx ?? []), { id: nanoid(), type, on: true, p: insertDefaults(type) }] })
  const addPlugin = (id: string): void => {
    const p = plugins.find((x) => x.id === id)
    if (!p) return
    const fx: InsertFx = { id: nanoid(), type: 'vst', on: true, p: {}, vst: { pluginId: p.id, name: p.name, vendor: p.vendor, format: p.format, xml: p.xml, arch: p.arch } }
    updateTrack(track.id, { fx: [...(track.fx ?? []), fx] })
    void openPlugin(fx, track.name)                    // the plugin window opens right away
  }
  return (
    <select value="" style={{ fontSize: 10, ...style }} title={tr('Add an effect to this track: a built-in effect or one of your VST plugins')}
      onChange={(e) => {
        const v = e.target.value
        if (v.startsWith('inst:')) { const p = instruments.find((x) => x.id === v.slice(5)); if (p) setInstrument(track, p) }
        else if (v.startsWith('vst:')) addPlugin(v.slice(4)); else if (v) add(v as InsertType)
        e.target.value = ''; e.target.blur()
      }}>
      <option value="">{tr('+ Effect…')}</option>
      {instruments.length > 0 && <optgroup label={tr('VST instruments (play the notes of this track)')}>
        {instruments.map((p) => <option key={p.id} value={`inst:${p.id}`}>{p.name}{p.vendor ? ` (${p.vendor})` : ''} · {p.format}{p.arch === 'x86' ? ' · 32-bit' : ''}</option>)}
      </optgroup>}
      <optgroup label={tr('Built in')}>
        {FX_TYPES.map((t) => <option key={t} value={t}>{tr(INSERT_LABEL[t])}</option>)}
      </optgroup>
      <optgroup label={tr('VST plugins')}>
        {plugins.map((p) => <option key={p.id} value={`vst:${p.id}`}>{p.name}{p.vendor ? ` (${p.vendor})` : ''} · {p.format}{p.arch === 'x86' ? ' · 32-bit' : ''}</option>)}
        {!plugins.length && <option value="" disabled>{tr('None yet: Settings → Plugins')}</option>}
      </optgroup>
    </select>
  )
}

export function FxHeader({ track }: { track: Track }): React.ReactElement {
  const { updateTrack } = useProjectStore.getState()
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 8px 4px 18px', fontSize: 10, color: 'var(--text-muted)' }}>
      <span style={{ flex: 1 }}>{tr('Effects (')}{track.fx?.length ?? 0})</span>
      <FxAddSelect track={track} />
      <button className="btn btn-ghost" style={small} title={tr('Close the effects lane (the effects keep playing)')} onClick={() => updateTrack(track.id, { showFx: false })}>×</button>
    </div>
  )
}

/** the settings of a built-in effect as they sound now: an automated setting follows its lane at the playhead */
export function useAutomatedP(track: Track, fx: InsertFx): Record<string, number> {
  const keys = fx.type === 'vst' ? [] : (AUTOMATABLE[fx.type] ?? []).filter((k) => (track.automation?.[`fx:${fx.id}:${k}` as AutoParam]?.length ?? 0) > 0)
  const beat = useAudioStore((s) => (keys.length ? s.currentBeat : 0))
  if (!keys.length) return fx.p
  const p = { ...fx.p }
  for (const k of keys) {
    const d = INSERT_PARAMS[fx.type].find((x) => x.key === k)
    if (!d) continue
    const v = fromUnit(fx.type, k, valueAt(track.automation?.[`fx:${fx.id}:${k}` as AutoParam], beat, toUnit(fx.type, k, fx.p[k] ?? d.def)))
    p[k] = d.step ? Math.round(v / d.step) * d.step : v
  }
  return p
}

function FxParams({ track, fx, set }: { track: Track; fx: InsertFx; set: (patch: Partial<InsertFx>) => void }): React.ReactElement {
  const shown = useAutomatedP(track, fx)
  return (
    <>
      {INSERT_PARAMS[fx.type].map((d) => {
        const v = shown[d.key] ?? d.def
        const label = d.step && d.step < 1 ? Number(v.toFixed(Math.min(3, String(d.step).split('.')[1]?.length ?? 0))) : v
        return d.key === 'mode' ? (
          <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <select value={v >= 0.5 ? '1' : '0'} style={{ fontSize: 10 }} onChange={(e) => set({ p: { ...fx.p, mode: Number(e.target.value) } })}>
              <option value="0">{tr('Low-pass')}</option><option value="1">{tr('High-pass')}</option>
            </select>
          </label>
        ) : (
          <label key={d.key} title={`${d.label}: ${label}${d.unit ? ' ' + d.unit : ''} (double-click: default)`} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {tr(d.label)}
            <input type="range" min={d.min} max={d.max} step={d.step} value={v} style={{ width: 56 }}
              onChange={(e) => set({ p: { ...fx.p, [d.key]: Number(e.target.value) } })}
              onDoubleClick={() => set({ p: { ...fx.p, [d.key]: d.def } })} />
            <span style={{ minWidth: 30 }}>{d.key === 'mix' || d.key === 'feedback' ? `${Math.round(v * 100)}%` : `${label}${d.unit && d.unit !== 'beats' ? d.unit : ''}`}</span>
          </label>
        )
      })}
    </>
  )
}

// the effects of the track, left to right in the order the sound goes through them
export function FxLane({ track, onSet, sticky = true }: { track: Track; onSet?: (fx: InsertFx[]) => void; sticky?: boolean }): React.ReactElement {
  const updateTrack = onSet ? (_: string, patch: { fx: InsertFx[] }): void => onSet(patch.fx) : useProjectStore.getState().updateTrack
  const list = track.fx ?? []
  const set = (id: string, patch: Partial<NonNullable<Track['fx']>[number]>): void =>
    updateTrack(track.id, { fx: list.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const move = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]
    updateTrack(track.id, { fx: next })
  }
  return (
    <div style={{ position: sticky ? 'sticky' : 'relative', left: sticky ? HEADER_WIDTH : undefined, display: 'flex', gap: 6, alignItems: 'center', height: FX_HEIGHT, padding: '0 8px', overflowX: 'auto', width: 'max-content', maxWidth: '100%' }}
      onPointerDown={(e) => e.stopPropagation()}>
      {!list.length && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{onSet ? tr('No effects on the master yet: add one with “+ Effect…” (built in or one of your VST plugins).') : tr('No effects yet: add one with “+ Effect…” on the left (EQ, compressor, delay, reverb, filter).')}</span>}
      {list.map((f, i) => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, border: `1px solid ${f.on ? track.color : 'var(--border-mid)'}`, background: 'var(--bg-secondary)', opacity: f.on ? 1 : 0.55, fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ ...small, padding: '0 4px', color: f.on ? 'var(--green)' : 'var(--text-muted)' }} title={f.on ? tr('On: click to bypass') : tr('Bypassed: click to switch on')} onClick={() => set(f.id, { on: !f.on })}>⏻</button>
          <b style={{ color: 'var(--text-primary)' }}>{f.type === 'vst' ? f.vst?.name ?? tr('VST plugin') : tr(INSERT_LABEL[f.type])}</b>
          {f.type === 'vst' && <VstControls fx={f} track={track} />}
          <FxParams track={track} fx={f} set={(patch) => set(f.id, patch)} />
          {f.type !== 'vst' && <AutomateButton track={track} fx={f} />}
          <button className="btn btn-ghost" style={{ ...small, padding: '0 3px' }} title={tr('Earlier in the chain')} disabled={i === 0} onClick={() => move(i, -1)}>◀</button>
          <button className="btn btn-ghost" style={{ ...small, padding: '0 3px' }} title={tr('Later in the chain')} disabled={i === list.length - 1} onClick={() => move(i, 1)}>▶</button>
          <button className="btn btn-ghost" style={{ ...small, padding: '0 3px', color: 'var(--red)' }} title={tr('Remove this effect')} onClick={() => updateTrack(track.id, { fx: list.filter((x) => x.id !== f.id) })}>×</button>
        </div>
      ))}
    </div>
  )
}

// the settings of a built-in effect that can be automated, as entries of the parameter picker (value 0..1)
export function builtinParams(fx: InsertFx): VstParam[] {
  return (AUTOMATABLE[fx.type] ?? []).map((key) => {
    const d = INSERT_PARAMS[fx.type].find((x) => x.key === key)!
    const v = fx.p[key] ?? d.def
    return { i: key as unknown as number, name: tr(d.label), value: Math.max(0, Math.min(1, toUnit(fx.type, key, v))), text: `${v}`, label: d.unit ?? '', steps: 0 }
  })
}
const paramNamesFor = (fx: InsertFx, p: VstParam): Record<string, string> =>
  ({ ...(fx.paramNames ?? {}), [String(p.i)]: p.name, ...(fx.type !== 'vst' ? { $: tr(INSERT_LABEL[fx.type]) } : {}) })

// "Automate…" next to a plugin: pick one of its parameters, and a lane for it opens under the track in the Studio
export function AutomateButton({ track, fx }: { track: Track; fx: InsertFx }): React.ReactElement | null {
  const [pick, setPick] = useState<{ list: VstParam[] | null; error?: string; q: string } | null>(null)
  const [at, setAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  if ((!fx.vst && !AUTOMATABLE[fx.type]) || track.id === '__master__') return null
  const start = (e: React.MouseEvent): void => {
    if (pick) { setPick(null); return }
    // the list floats over everything (the effects lane and the rack are too small to hold it)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAt({ x: Math.max(8, Math.min(window.innerWidth - 268, r.right - 260)), y: Math.min(r.bottom + 4, window.innerHeight - 320) })
    if (fx.type !== 'vst') { setPick({ list: builtinParams(fx), q: '' }); return }
    setPick({ list: null, q: '' })
    vstParams(fx, liveSampleRate()).then((list) => setPick({ list, q: '' })).catch((e: Error) => setPick({ list: [], error: e.message, q: '' }))
  }
  const choose = (p: VstParam): void => {
    const st = useProjectStore.getState()
    const t = st.project.tracks.find((x) => x.id === track.id)
    if (!t) return
    const key = `fx:${fx.id}:${p.i}` as AutoParam
    const names = paramNamesFor(fx, p)
    if (t.instrument?.id === fx.id) st.updateTrack(t.id, { instrument: { ...t.instrument, paramNames: names } })
    else st.updateTrack(t.id, { fx: (t.fx ?? []).map((f) => (f.id === fx.id ? { ...f, paramNames: names } : f)) })
    if (!t.automation?.[key]?.length) st.setAutomation(t.id, key, [{ beat: 0, value: p.value }])
    const lanes = openLanes(useProjectStore.getState().project.tracks.find((x) => x.id === t.id)!)
    st.updateTrack(t.id, { autoLanes: lanes.includes(key) ? lanes : [...lanes, key], showAutomation: null })
    setPick(null)
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn btn-ghost" style={{ ...small, padding: '0 6px' }} onClick={(e) => start(e)}
        title={tr('Automate a knob of this plugin: choose it, then draw its curve in the lane that opens under the track')}>{tr('Automate…')}</button>
      {pick && createPortal(
        <div style={{ position: 'fixed', left: at.x, top: at.y, zIndex: 1000, width: 260, display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', boxShadow: '0 6px 18px rgba(0,0,0,0.5)', padding: 6, fontSize: 10, color: 'var(--text-secondary)' }}
          onPointerDown={(e) => e.stopPropagation()}>
          {!pick.list && <span>{tr('Loading the plugin…')}</span>}
          {pick.error && <span style={{ color: 'var(--red)' }}>{pick.error}</span>}
          {pick.list && (
            <>
              <input autoFocus placeholder={tr('Search a parameter…')} value={pick.q} style={{ fontSize: 10 }}
                onChange={(e) => setPick({ ...pick, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setPick(null); e.stopPropagation() }} />
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {pick.list.filter((p) => p.name.toLowerCase().includes(pick.q.toLowerCase())).slice(0, 300).map((p) => (
                  <div key={p.i} onClick={() => choose(p)} style={{ padding: '2px 4px', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                    {p.name} <span style={{ color: 'var(--text-muted)' }}>{p.text}{p.label ? ` ${p.label}` : ''}</span>
                  </div>
                ))}
                {!pick.list.length && !pick.error && <span>{tr('This plugin has no automatable parameters.')}</span>}
              </div>
              <button className="btn btn-ghost" style={small} onClick={() => setPick(null)}>{tr('Cancel')}</button>
            </>
          )}
        </div>, document.body
      )}
    </span>
  )
}

// Presets of a plugin: its settings saved under a name (for every project), loaded with one click
export function PresetSelect({ fx, style }: { fx: InsertFx; style?: React.CSSProperties }): React.ReactElement | null {
  const api = window.api?.plugins
  const [list, setList] = useState<Array<{ name: string }>>([])
  const [msg, setMsg] = useState<string | null>(null)
  const pid = fx.vst?.pluginId ?? ''
  const refresh = (): void => { void api?.presetList?.(pid).then((l) => setList(l ?? [])) }
  useEffect(refresh, [pid])
  if (!api?.presetList || !fx.vst) return null
  const say = (m: string): void => { setMsg(m); setTimeout(() => setMsg(null), 2500) }
  const run = async (v: string): Promise<void> => {
    try {
      if (v === 'save') {
        const name = (await askText(tr('Save preset'), trf('Name for these settings of {name}', { name: fx.vst!.name })))?.trim()
        if (!name) return
        await api.presetSave!(pid, name, await vstStateNow(fx, liveSampleRate()))
        refresh(); say(trf('Saved: {file}', { file: name }))
      } else if (v.startsWith('del:')) {
        const name = v.slice(4)
        if (!window.confirm(trf('Delete the preset “{name}”?', { name }))) return
        await api.presetDelete!(pid, name); refresh()
      } else if (v.startsWith('load:')) {
        const state = await api.presetGet!(pid, v.slice(5))
        if (state) { await vstApplyState(fx, liveSampleRate(), state); say(trf('Loaded: {name}', { name: v.slice(5) })) }
      }
    } catch (e) { say((e as Error).message) }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <select value="" title={tr('Presets: save the settings of this plugin under a name, load them in any project')} style={{ fontSize: 10, maxWidth: 120, fontWeight: 700, color: 'var(--accent-light)', ...style }}
        onMouseDown={refresh} onChange={(e) => { const v = e.target.value; e.target.value = ''; e.target.blur(); void run(v) }}>
        <option value="">★ {tr('Presets…')}</option>
        {list.length > 0 && <optgroup label={tr('Load')}>{list.map((p) => <option key={p.name} value={`load:${p.name}`}>{p.name}</option>)}</optgroup>}
        <option value="save">{tr('Save current settings…')}</option>
        {list.length > 0 && <optgroup label={tr('Delete')}>{list.map((p) => <option key={p.name} value={`del:${p.name}`}>× {p.name}</option>)}</optgroup>}
      </select>
      {msg && <span style={{ fontSize: 10, color: 'var(--green)', whiteSpace: 'nowrap' }}>{msg}</span>}
    </span>
  )
}

// a plugin in the effects lane: its window, and why it does not play if it could not be loaded
function VstControls({ fx, track }: { fx: InsertFx; track: Track }): React.ReactElement {
  const [, tick] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => onVstChange(() => tick((n) => n + 1)), [])
  const failure = vstFailure(fx.id)
  const open = async (): Promise<void> => { setBusy(true); try { await openPlugin(fx, track.name) } finally { setBusy(false) } }
  return (
    <>
      <span style={{ color: 'var(--text-muted)' }}>{fx.vst?.format}</span>
      <button className="btn btn-ghost" style={{ ...small, padding: '0 6px' }} disabled={busy} title={tr('Open the plugin window')} onClick={() => void open()}>
        {busy ? tr('Loading…') : tr('Open')}
      </button>
      <PresetSelect fx={fx} />
      <AutomateButton track={track} fx={fx} />
      {failure && <span style={{ color: 'var(--red)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={failure}>⚠ {tr('not loaded: plays without it')}</span>}
    </>
  )
}

// the instrument of a MIDI track: the built-in synth, or one of the VST instruments found in Settings → Plugins
export function InstrumentSelect({ track, style }: { track: Track; style?: React.CSSProperties }): React.ReactElement {
  const all = usePluginsStore((s) => s.plugins)
  const off = usePluginsStore((s) => s.off)
  const plugins = all.filter((p) => isInstrumentLike(p) && !off.includes(p.id))
  const switchedOff = all.filter((p) => isInstrumentLike(p) && off.includes(p.id))
  // any other plugin can be tried as an instrument too (in case it does not say what it is)
  const others = all.filter((p) => !isInstrumentLike(p) && !off.includes(p.id))
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const cur = track.instrument?.vst?.pluginId ?? ''
  const pack = useSoundPack()
  return (
    <select value={cur || (pack && track.program !== undefined ? `gm:${track.program}` : `builtin:${track.sound ?? ''}`)} style={style} title={tr('What plays the notes of this track')} onChange={(e) => {
      const v = e.target.value
      e.target.blur()
      if (v.startsWith('gm:')) { updateTrack(track.id, { instrument: undefined, program: Number(v.slice(3)) }); return }
      if (v.startsWith('builtin:')) { updateTrack(track.id, { instrument: undefined, program: undefined, sound: (v.slice(8) || undefined) as Track['sound'] }); return }
      const p = [...plugins, ...others].find((x) => x.id === v)
      if (!p) { updateTrack(track.id, { instrument: undefined }); return }
      setInstrument(track, p)
    }}>
      {pack && PACK_INSTRUMENTS.map((g) => (
        <optgroup key={g.group} label={`${tr('Sound pack')}: ${tr(g.group)}`}>
          {g.items.map(([n, label]) => { const pk = packOf(n); return <option key={n} value={`gm:${n}`}>{tr(label)}{pk ? ` · ${PACK_NAMES[pk] ?? pk}` : ''}</option> })}
        </optgroup>
      ))}
      <optgroup label={pack ? tr('Built-in sounds (the pack plays them with real instruments)') : tr('Built-in sounds')}>
        <option value="builtin:">{tr('Built-in synth')}</option>
        {TIMBRES.map((s) => <option key={s.id} value={`builtin:${s.id}`}>{tr(s.label)}</option>)}
      </optgroup>
      {plugins.length > 0 && <optgroup label={tr('VST instruments')}>
        {plugins.map((p) => <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` (${p.vendor})` : ''} · {p.format}{p.arch === 'x86' ? ' · 32-bit' : ''}</option>)}
      </optgroup>}
      {cur && ![...plugins, ...others].some((p) => p.id === cur) && <option value={cur}>{track.instrument?.vst?.name} ({tr('not found')})</option>}
      {!plugins.length && <option value="" disabled>{tr('No VST instruments yet: Settings → Plugins')}</option>}
      {others.length > 0 && <optgroup label={tr('Other plugins (only if they can play notes)')}>
        {others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` (${p.vendor})` : ''} · {p.format}</option>)}
      </optgroup>}
      {switchedOff.length > 0 && <optgroup label={tr('Switched off in Settings → Plugins (tick them there)')}>
        {switchedOff.map((p) => <option key={p.id} value="" disabled>{p.name}</option>)}
      </optgroup>}
    </select>
  )
}

/** make a VST plugin the instrument of a MIDI track and open its window */
export function setInstrument(track: Track, p: PluginInfo): void {
  const fx: InsertFx = { id: nanoid(), type: 'vst', on: true, p: {}, vst: { pluginId: p.id, name: p.name, vendor: p.vendor, format: p.format, xml: p.xml, arch: p.arch } }
  useProjectStore.getState().updateTrack(track.id, { instrument: fx })
  void openPlugin(fx, track.name).then(() => {
    const t = useProjectStore.getState().project.tracks.find((x) => x.id === track.id)
    if (t) warmInstrument(t)
  })
}

export async function openPlugin(fx: InsertFx, trackName: string): Promise<void> {
  try { await showVstEditor(fx, liveSampleRate(), trackName) }
  catch (e) { window.alert(trf('The plugin could not be opened: {m}', { m: (e as Error).message })) }
}

// ── tempo track ──────────────────────────────────────────────────────────────

export function TempoLane({ beatWidth, popover }: { beatWidth: number; popover: (p: PopoverSpec) => void }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const updateProject = useProjectStore((s) => s.updateProject)
  const setBpm = useProjectStore((s) => s.setBpm)
  const ref = useRef<HTMLDivElement>(null)
  const pts = tempoPoints(project)
  const lo = Math.min(60, ...pts.map((p) => p.bpm)) - 10
  const hi = Math.max(180, ...pts.map((p) => p.bpm)) + 10
  const h = TEMPO_HEIGHT - 10
  const yOf = (bpm: number): number => 5 + (1 - (bpm - lo) / (hi - lo)) * h
  const beatAt = (clientX: number): number => Math.max(0, (clientX - ref.current!.getBoundingClientRect().left) / beatWidth)
  const extra = project.tempoMap ?? []
  const setExtra = (list: typeof extra): void => updateProject({ tempoMap: list.filter((t) => t.beat > 0).sort((a, b) => a.beat - b.beat) })

  const edit = (e: React.MouseEvent, beat: number, bpm: number, isFirst: boolean): void => {
    e.preventDefault(); e.stopPropagation()
    popover({
      x: e.clientX, y: e.clientY, title: isFirst ? tr('Tempo at the start') : trf('Tempo from beat {n}', { n: beat.toFixed(2) }),
      fields: [{ key: 'bpm', label: 'BPM', value: String(bpm), type: 'number' }],
      onOk: (v) => {
        const n = Math.max(20, Math.min(400, Number(v.bpm) || bpm))
        if (isFirst) setBpm(n)
        else setExtra(extra.map((t) => (t.beat === beat ? { ...t, bpm: n } : t)))
      },
      danger: isFirst ? undefined : { label: 'Delete', run: () => setExtra(extra.filter((t) => t.beat !== beat)) }
    })
  }

  const drag = (e: React.PointerEvent, beat: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    trackPointer((ev) => {
      const nb = Math.max(0.25, snapBeat(beatAt(ev.clientX), ev.altKey))
      setExtra(extra.map((t) => (t.beat === beat ? { ...t, beat: nb } : t)))
      beat = nb
    })
  }

  return (
    <div ref={ref}
      onDoubleClick={(e) => { if (e.target !== e.currentTarget) return; const b = snapBeat(beatAt(e.clientX)); if (b > 0) setExtra([...extra.filter((t) => t.beat !== b), { beat: b, bpm: pts.filter((p) => p.beat <= b).pop()?.bpm ?? project.bpm }]) }}
      title={tr('Tempo track: double-click to add a tempo change, drag it to move it, right-click to set the BPM or delete it')}
      style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.05)' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        <polyline fill="none" stroke="#10b981" strokeWidth={2}
          points={pts.flatMap((p, i) => {
            const next = pts[i + 1]?.beat ?? p.beat + 4000
            return [`${p.beat * beatWidth},${yOf(p.bpm)}`, `${next * beatWidth},${yOf(p.bpm)}`]
          }).join(' ')} />
      </svg>
      {pts.map((p, i) => (
        <div key={`${p.beat}-${i}`} onPointerDown={(e) => i > 0 && drag(e, p.beat)} onContextMenu={(e) => edit(e, p.beat, p.bpm, i === 0)} onDoubleClick={(e) => edit(e, p.beat, p.bpm, i === 0)}
          style={{ position: 'absolute', left: p.beat * beatWidth - 4, top: yOf(p.bpm) - 4, cursor: i > 0 ? 'grab' : 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontSize: 10, color: '#6ee7b7', whiteSpace: 'nowrap' }}>{Math.round(p.bpm * 100) / 100}</span>
        </div>
      ))}
    </div>
  )
}

// ── take lanes ───────────────────────────────────────────────────────────────

export function TakeHeader({ track, lane }: { track: Track; lane: TakeLane }): React.ReactElement {
  const updateTrack = useProjectStore((s) => s.updateTrack)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 18px', height: TAKE_HEIGHT, fontSize: 10, color: 'var(--text-muted)' }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.name}</span>
      <button className="btn btn-ghost" style={small} title={tr('Delete this take lane')}
        onClick={() => updateTrack(track.id, { takes: (track.takes ?? []).filter((l) => l.id !== lane.id) })}>×</button>
    </div>
  )
}

// ── return tracks ────────────────────────────────────────────────────────────

export function ReturnRow({ r }: { r: ReturnTrack }): React.ReactElement {
  const { updateReturn, removeReturn } = useProjectStore.getState()
  return (
    <div style={{ display: 'flex', height: RETURN_HEIGHT }}>
      <div style={{ width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, boxSizing: 'border-box', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderLeft: '3px solid #0ea5e9', background: 'var(--bg-secondary)', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input defaultValue={r.name} key={r.name} onBlur={(e) => updateReturn(r.id, { name: e.target.value.trim() || r.name })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, background: 'transparent', border: 'none', color: 'var(--text-primary)' }} title={tr('Return track (rename here)')} />
          <button className="btn btn-ghost" style={{ ...small, color: r.muted ? '#f59e0b' : undefined }} title={tr('Mute')} onClick={() => updateReturn(r.id, { muted: !r.muted })}>M</button>
          <button className="btn btn-ghost" style={small} title={tr('Delete return track')} onClick={() => removeReturn(r.id)}>×</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          {r.effect === 'reverb' ? (
            <label title={tr('Reverb length')}>{tr('Decay')}
              <input type="range" min={0.3} max={8} step={0.1} value={r.decay ?? 2.2} style={{ width: 50 }} onChange={(e) => updateReturn(r.id, { decay: Number(e.target.value) })} />
              {(r.decay ?? 2.2).toFixed(1)}s</label>
          ) : (
            <>
              <select value={String(r.delayBeats ?? 0.75)} style={{ fontSize: 10 }} title={tr('Delay time in the song tempo')} onChange={(e) => { updateReturn(r.id, { delayBeats: Number(e.target.value) }); e.target.blur() }}>
                {[['0.25', '1/16'], ['0.5', '1/8'], ['0.75', '1/8 dotted'], ['1', '1/4'], ['1.5', '1/4 dotted'], ['2', '1/2']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label title={tr('Feedback: how many repeats')}>{tr('FB')}
                <input type="range" min={0} max={0.9} step={0.01} value={r.feedback ?? 0.4} style={{ width: 40 }} onChange={(e) => updateReturn(r.id, { feedback: Number(e.target.value) })} /></label>
            </>
          )}
          <input type="range" min={0} max={1} step={0.01} value={r.volume} title={tr('Return volume')} style={{ width: 44, marginLeft: 'auto' }} onChange={(e) => updateReturn(r.id, { volume: Number(e.target.value) })} />
        </div>
      </div>
      <div style={{ flex: 1, borderBottom: '1px solid var(--border)', background: 'rgba(14,165,233,0.04)', display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ position: 'sticky', left: HEADER_WIDTH + 10 }}>{r.effect === 'reverb' ? tr('Reverb') : tr('Delay')}{tr(': send tracks here with the')} {r.name.split(' ')[0]} {tr('knob of each track')}</span>
      </div>
    </div>
  )
}

// a tiny level meter for headers
export function MiniMeter({ id }: { id: string }): React.ReactElement {
  const fill = useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    let raf = 0
    let lvl = 0
    const loop = (): void => {
      lvl = Math.max(trackLevel(id), lvl * 0.85)
      if (fill.current) fill.current.style.width = `${Math.min(100, lvl * 100)}%`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id])
  return <div style={{ height: 3, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}><div ref={fill} style={{ height: '100%', width: 0, background: '#22c55e' }} /></div>
}

// The effects on the master of the Studio (Studio "Master FX" and the Mixer): after all tracks and returns,
// before the master fader. Built-in effects and VST plugins, saved with the project and in the export.
export const MASTER_TRACK_ID = '__master__'
export function MasterFxBar(): React.ReactElement {
  const list = useProjectStore((s) => s.project.masterFx ?? [])
  const set = (fx: InsertFx[]): void => useProjectStore.getState().updateProject({ masterFx: fx })
  const pseudo: Track = { id: MASTER_TRACK_ID, name: 'Master', type: 'audio', color: '#f5a623', volume: 1, pan: 0, muted: false, soloed: false, clips: [], fx: list }
  return (
    <div className="master-fx" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', minHeight: FX_HEIGHT, flexShrink: 0 }}>
      <b style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{tr('Master FX')}</b>
      <FxAddSelect track={pseudo} onSet={set} />
      <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}><FxLane track={pseudo} onSet={set} sticky={false} /></div>
    </div>
  )
}
