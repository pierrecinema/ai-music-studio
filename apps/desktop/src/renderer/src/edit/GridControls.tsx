import React, { useEffect, useState } from 'react'
import { useUIStore } from '../stores/ui.store'
import { GRID_OPTIONS, gridOf } from './grid'
import { QUANTIZE_DIALOG_EVENT, defaultGridId, loadOptions, openQuantizeDialog, quantizeSelection, saveOptions, type QuantizeOptions } from './quantize'
import { tr } from '../i18n/tr'

// Grid size, snap switch and quantize: shown in the timeline and in the piano roll.
export function GridControls({ compact = false, noSnap = false }: { compact?: boolean; noSnap?: boolean }): React.ReactElement {
  const grid = useUIStore((s) => s.grid)
  const snap = useUIStore((s) => s.snap)
  const setGrid = useUIStore((s) => s.setGrid)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!msg) return undefined
    const t = window.setTimeout(() => setMsg(null), 4500)
    return () => window.clearTimeout(t)
  }, [msg])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tr('Grid')}</span>
      <select value={grid} onChange={(e) => { setGrid(e.target.value); e.target.blur() }} style={{ fontSize: 11 }} title={tr('Grid size (Ctrl+1 narrower, Ctrl+2 wider)')}>
        {GRID_OPTIONS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
      {!noSnap && <SnapButton />}
      {!compact && (
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}
          onClick={() => setMsg(quantizeSelection().what)} title={tr('Quantize the selected clip or notes with the saved settings (Ctrl+U)')}>
          {tr('Quantize')}
        </button>
      )}
      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={openQuantizeDialog} title={tr('Quantize settings (Ctrl+Shift+U)')}>⚙</button>
      {msg && <span style={{ fontSize: 11, color: 'var(--green)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg}>{msg}</span>}
    </span>
  )
}

// The settings window of the quantize command (mounted once in the app).
export function QuantizeDialog(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [o, setO] = useState<QuantizeOptions>(loadOptions())
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const show = (): void => { setO({ ...loadOptions(), grid: defaultGridId() }); setMsg(null); setOpen(true) }
    window.addEventListener(QUANTIZE_DIALOG_EVENT, show)
    return () => window.removeEventListener(QUANTIZE_DIALOG_EVENT, show)
  }, [])

  if (!open) return null
  const apply = (): void => { saveOptions(o); setMsg(quantizeSelection(o).what) }
  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9650, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(400px, 100%)', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Quantize')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {tr('MIDI: the notes of the selected clip (or the selected note) move toward the grid. Audio: the clip start is snapped to the grid\n          (the rhythm inside the recording is not changed).')}
        </div>
        <label style={row}>{tr('Grid')}
          <select value={o.grid} onChange={(e) => setO({ ...o, grid: e.target.value })}>
            {GRID_OPTIONS.filter((g) => g.beats > 0 && g.beats < 4).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <label style={row}>{tr('Strength')} {Math.round(o.strength * 100)} %
          <input type="range" min={0} max={1} step={0.05} value={o.strength} onChange={(e) => setO({ ...o, strength: Number(e.target.value) })} />
        </label>
        <label style={row}>{tr('Swing')} {Math.round(o.swing * 100)} %
          <input type="range" min={0} max={1} step={0.05} value={o.swing} onChange={(e) => setO({ ...o, swing: Number(e.target.value) })} />
        </label>
        <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }}>
          <input type="checkbox" checked={o.ends} onChange={(e) => setO({ ...o, ends: e.target.checked })} />
          {tr('Quantize note ends as well (notes change length)')}
        </label>
        {msg && <div style={{ fontSize: 12, color: 'var(--green)' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>{tr('Close')}</button>
          <button className="btn btn-primary" onClick={apply}>{tr('Apply')}</button>
        </div>
      </div>
    </div>
  )
}

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-primary)' }

/** the grid switch (magnet): on, clips and notes snap to the grid; off (yellow), everything moves freely */
export function SnapButton(): React.ReactElement {
  const grid = useUIStore((s) => s.grid)
  const snap = useUIStore((s) => s.snap)
  const toggleSnap = useUIStore((s) => s.toggleSnap)
  return (
    <button
        className={`btn ${snap && gridOf(grid).beats > 0 ? 'btn-primary' : 'btn-ghost'}`}
        style={{ fontSize: 11, padding: '3px 10px', ...(snap && gridOf(grid).beats > 0 ? {} : { color: '#111', background: '#fbbf24', borderColor: '#f59e0b', fontWeight: 700 }) }}
        onClick={toggleSnap} title={tr('Grid on: clips and notes snap to the grid; zoomed in far, only near a grid line (fine moves in between). Grid off: everything moves freely. (Ctrl+4; Alt while dragging: free once)')}
      >
        🧲 {snap && gridOf(grid).beats > 0 ? tr('Grid on') : tr('Grid off')}
    </button>
  )
}
