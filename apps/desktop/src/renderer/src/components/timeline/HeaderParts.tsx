// Small parts of the Studio track header (0.99.4): the square ● M S buttons, the pan knob and the dB value.
import React, { useRef } from 'react'
import { tr } from '../../i18n/tr'

export const dbOf = (v: number): string => (v <= 0.0005 ? '−∞' : `${(20 * Math.log10(v)).toFixed(1).replace('-', '−')}`)

export function SquareBtn({ on, onColor, color, title, onClick, children, glow }: {
  on: boolean; onColor: string; color?: string; title: string; onClick: () => void; children: React.ReactNode; glow?: boolean
}): React.ReactElement {
  return (
    <button title={title} onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 22, height: 20, flexShrink: 0, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 4, cursor: 'pointer',
        fontSize: 10, fontWeight: 800, border: `1px solid ${on ? onColor : 'var(--border-mid)'}`,
        background: on ? onColor : 'var(--bg-tertiary)', color: on ? '#fff' : color ?? 'var(--text-muted)',
        boxShadow: glow ? `0 0 8px ${onColor}` : undefined
      }}>{children}</button>
  )
}

/** pan −1 … +1: drag up / down, double-click: middle */
export function PanKnob({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }): React.ReactElement {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const ang = value * 135
  const label = Math.abs(value) < 0.01 ? 'C' : `${Math.round(Math.abs(value) * 100)} ${value < 0 ? 'L' : 'R'}`
  return (
    <span title={`${tr('Pan')}: ${label} · ${tr('drag up / down, double-click: middle')}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onChange(0) }}
      onPointerDown={(e) => {
        e.stopPropagation(); e.preventDefault()
        drag.current = { y: e.clientY, v: value }
        const move = (ev: PointerEvent): void => { const d = drag.current; if (d) onChange(Math.max(-1, Math.min(1, Math.round((d.v + (d.y - ev.clientY) / 80) * 100) / 100))) }
        const up = (): void => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      }}
      style={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%', position: 'relative', cursor: 'ns-resize',
        background: 'radial-gradient(circle at 35% 30%, #3a4350, #161b22)', border: '1px solid #39424e' }}>
      <i style={{ position: 'absolute', left: 9, top: 2, width: 2, height: 7, borderRadius: 1, background: Math.abs(value) < 0.01 ? '#cbd5e1' : color,
        transformOrigin: '1px 8px', transform: `rotate(${ang}deg)` }} />
    </span>
  )
}
