// Extra lanes of the Studio: automation (Ableton automation lanes / Cubase automation tracks), the tempo
// track, take lanes for comping, and the return tracks with their effects.
import React, { useRef } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { snapBeat } from '../../edit/grid'
import { rangeOf, sortedPoints, valueAt, AUTO_LABEL } from '../../audio/automation'
import { tempoPoints } from '../../audio/timemap'
import { trackLevel } from '../../audio/engine'
import type { AutoParam, ReturnTrack, TakeLane, Track } from '../../types'
import { AUTO_HEIGHT, HEADER_WIDTH, RETURN_HEIGHT, TAKE_HEIGHT, TEMPO_HEIGHT, trackPointer } from './studioLayout'
import type { PopoverSpec } from './Popover'

const small: React.CSSProperties = { fontSize: 10, padding: '1px 6px' }

// ── automation ───────────────────────────────────────────────────────────────

export function AutomationHeader({ track }: { track: Track }): React.ReactElement {
  const returns = useProjectStore((s) => s.project.returns ?? [])
  const { updateTrack, setAutomation } = useProjectStore.getState()
  const param = track.showAutomation ?? 'volume'
  const options: AutoParam[] = ['volume', 'pan', ...returns.map((r) => `send:${r.id}` as AutoParam)]
  const nameOf = (id: string): string => returns.find((r) => r.id === id)?.name ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 8px 4px 18px', fontSize: 10, color: 'var(--text-muted)' }}>
      <span>Automation of {track.name}</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select value={param} style={{ fontSize: 10, flex: 1 }} onChange={(e) => { updateTrack(track.id, { showAutomation: e.target.value as AutoParam }); e.target.blur() }}>
          {options.map((o) => <option key={o} value={o}>{AUTO_LABEL(o, nameOf)}{track.automation?.[o]?.length ? ' •' : ''}</option>)}
        </select>
        <button className="btn btn-ghost" style={small} title="Remove all points of this lane" onClick={() => setAutomation(track.id, param, [])}>Clear</button>
      </div>
    </div>
  )
}

export function AutomationLane({ track, param, beatWidth }: { track: Track; param: AutoParam; beatWidth: number }): React.ReactElement {
  const setAutomation = useProjectStore((s) => s.setAutomation)
  const ref = useRef<HTMLDivElement>(null)
  const [lo, hi] = rangeOf(param)
  const fallback = param === 'volume' ? track.volume : param === 'pan' ? track.pan : track.sends?.[param.slice(5)] ?? 0
  const pts = sortedPoints(track.automation?.[param])
  const h = AUTO_HEIGHT - 8
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
    if (e.button !== 0 || e.target !== e.currentTarget) return
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
      title="Click: add a point. Drag a point to move it (Shift: only in time, Alt: off the grid). Double-click a point to delete it."
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', background: 'rgba(124,58,237,0.04)' }}>
      {!pts.length && <span style={{ position: 'absolute', left: 8, top: AUTO_HEIGHT / 2 - 8, fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}>
        No automation yet: click to add the first point. Now: {param === 'pan' ? fallback.toFixed(2) : `${Math.round(fallback * 100)} %`}
      </span>}
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        {line && <polyline points={line} fill="none" stroke={track.color} strokeWidth={2} />}
      </svg>
      {pts.map((p, i) => (
        <div key={i} onPointerDown={(e) => dragPoint(e, i)} onDoubleClick={(e) => { e.stopPropagation(); remove(i) }}
          title={`${param === 'pan' ? p.value.toFixed(2) : `${Math.round(p.value * 100)} %`} at beat ${p.beat.toFixed(2)}`}
          style={{ position: 'absolute', left: p.beat * beatWidth - 5, top: yOf(p.value) - 5, width: 10, height: 10, borderRadius: 5, background: '#fff', border: `2px solid ${track.color}`, cursor: 'grab' }} />
      ))}
    </div>
  )
}

export { valueAt }

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
      x: e.clientX, y: e.clientY, title: isFirst ? 'Tempo at the start' : `Tempo from beat ${beat.toFixed(2)}`,
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
      title="Tempo track: double-click to add a tempo change, drag it to move it, right-click to set the BPM or delete it"
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
      <button className="btn btn-ghost" style={small} title="Delete this take lane"
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
            style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, background: 'transparent', border: 'none', color: 'var(--text-primary)' }} title="Return track (rename here)" />
          <button className="btn btn-ghost" style={{ ...small, color: r.muted ? '#f59e0b' : undefined }} title="Mute" onClick={() => updateReturn(r.id, { muted: !r.muted })}>M</button>
          <button className="btn btn-ghost" style={small} title="Delete return track" onClick={() => removeReturn(r.id)}>×</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          {r.effect === 'reverb' ? (
            <label title="Reverb length">Decay
              <input type="range" min={0.3} max={8} step={0.1} value={r.decay ?? 2.2} style={{ width: 50 }} onChange={(e) => updateReturn(r.id, { decay: Number(e.target.value) })} />
              {(r.decay ?? 2.2).toFixed(1)}s</label>
          ) : (
            <>
              <select value={String(r.delayBeats ?? 0.75)} style={{ fontSize: 10 }} title="Delay time in the song tempo" onChange={(e) => { updateReturn(r.id, { delayBeats: Number(e.target.value) }); e.target.blur() }}>
                {[['0.25', '1/16'], ['0.5', '1/8'], ['0.75', '1/8 dotted'], ['1', '1/4'], ['1.5', '1/4 dotted'], ['2', '1/2']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label title="Feedback: how many repeats">FB
                <input type="range" min={0} max={0.9} step={0.01} value={r.feedback ?? 0.4} style={{ width: 40 }} onChange={(e) => updateReturn(r.id, { feedback: Number(e.target.value) })} /></label>
            </>
          )}
          <input type="range" min={0} max={1} step={0.01} value={r.volume} title="Return volume" style={{ width: 44, marginLeft: 'auto' }} onChange={(e) => updateReturn(r.id, { volume: Number(e.target.value) })} />
        </div>
      </div>
      <div style={{ flex: 1, borderBottom: '1px solid var(--border)', background: 'rgba(14,165,233,0.04)', display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ position: 'sticky', left: HEADER_WIDTH + 10 }}>{r.effect === 'reverb' ? 'Reverb' : 'Delay'}: send tracks here with the {r.name.split(' ')[0]} knob of each track</span>
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
