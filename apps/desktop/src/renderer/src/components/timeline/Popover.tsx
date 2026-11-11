// A small box with input fields at the mouse (Electron has no window.prompt).
import React, { useEffect, useRef } from 'react'

export interface PopoverField { key: string; label: string; value: string; type?: 'text' | 'number'; options?: string[] }
export interface PopoverSpec { x: number; y: number; title: string; fields: PopoverField[]; onOk: (v: Record<string, string>) => void; danger?: { label: string; run: () => void } }

export function Popover({ spec, onClose }: { spec: PopoverSpec; onClose: () => void }): React.ReactElement {
  const values = useRef<Record<string, string>>(Object.fromEntries(spec.fields.map((f) => [f.key, f.value])))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent): void => { if (box.current && !box.current.contains(e.target as Node)) onClose() }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [onClose])
  const ok = (): void => { spec.onOk(values.current); onClose() }
  return (
    <div ref={box} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', left: Math.min(spec.x, window.innerWidth - 240), top: Math.min(spec.y, window.innerHeight - 200), zIndex: 9950, width: 220,
        background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: 10, boxShadow: '0 8px 24px #000a', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <b style={{ fontSize: 12, color: 'var(--text-primary)' }}>{spec.title}</b>
      {spec.fields.map((f, i) => (
        <label key={f.key} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>{f.label}
          {f.options ? (
            <select defaultValue={f.value} onChange={(e) => { values.current[f.key] = e.target.value }}>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input autoFocus={i === 0} type={f.type ?? 'text'} defaultValue={f.value} onChange={(e) => { values.current[f.key] = e.target.value }} />
          )}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {spec.danger && <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', marginRight: 'auto' }} onClick={() => { spec.danger!.run(); onClose() }}>{spec.danger.label}</button>}
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={ok}>OK</button>
      </div>
    </div>
  )
}
