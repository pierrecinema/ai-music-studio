// A modern rotary knob: a dark body with a coloured arc that shows the value, a pointer, the value in the middle.
// Drag up / down to turn it (Shift: fine), mouse wheel, arrow keys; double-click returns it to its default.
import React, { useRef } from 'react'

const A0 = -135, A1 = 135                                     // the knob turns 270 degrees
const rad = (d: number): number => ((d - 90) * Math.PI) / 180

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = [cx + r * Math.cos(rad(from)), cy + r * Math.sin(rad(from))]
  const [x1, y1] = [cx + r * Math.cos(rad(to)), cy + r * Math.sin(rad(to))]
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export interface DialProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  def?: number                       // double-click: back to this value
  onChange: (v: number) => void
  format?: (v: number) => string
  size?: number
  color?: string
  title?: string
  bipolar?: boolean                  // the arc starts at the middle (pan, transpose)
}

export function Dial({ label, value, min, max, step = 0.01, def, onChange, format, size = 58, color = 'var(--accent)', title, bipolar }: DialProps): React.ReactElement {
  const pos = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const ang = A0 + pos * (A1 - A0)
  const drag = useRef<{ y: number; p: number } | null>(null)
  const put = (p: number): void => {
    const v = min + Math.max(0, Math.min(1, p)) * (max - min)
    onChange(Math.round(v / step) * step)
  }
  const c = size / 2, r = size / 2 - 5
  const from = bipolar ? 0 : A0
  const [px, py] = [c + (r - 9) * Math.cos(rad(ang)), c + (r - 9) * Math.sin(rad(ang))]
  const [qx, qy] = [c + (r - 16) * Math.cos(rad(ang)), c + (r - 16) * Math.sin(rad(ang))]
  const text = format ? format(value) : `${Math.round(pos * 100)}%`
  return (
    <div className="ams-dial" title={title ?? `${label}: ${text}`} tabIndex={0}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
        if (d) { e.preventDefault(); e.stopPropagation(); put(pos + d * (e.shiftKey ? 0.005 : Math.max(step / (max - min), 0.02))) }
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: size + 18, outline: 'none', userSelect: 'none' }}>
      <svg width={size} height={size} style={{ cursor: 'ns-resize', touchAction: 'none', overflow: 'visible' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, p: pos }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const np = d.p + (d.y - e.clientY) / (e.shiftKey ? 900 : 180)
          if (e.shiftKey) drag.current = { y: e.clientY, p: np }
          put(np)
        }}
        onPointerUp={() => { drag.current = null }}
        onWheel={(e) => put(pos + (e.deltaY < 0 ? 1 : -1) * Math.max(step / (max - min), 0.02))}
        onDoubleClick={() => { if (def !== undefined) onChange(def) }}>
        <defs>
          <radialGradient id="ams-dial-body" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#3a3f4a" /><stop offset="0.55" stopColor="#1f2229" /><stop offset="1" stopColor="#14161b" />
          </radialGradient>
        </defs>
        <path d={arc(c, c, r, A0, A1)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} strokeLinecap="round" />
        {Math.abs(ang - from) > 0.5 && (
          <path d={ang >= from ? arc(c, c, r, from, ang) : arc(c, c, r, ang, from)} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        )}
        <circle cx={c} cy={c + 1.5} r={r - 7} fill="#000" opacity={0.5} />
        <circle cx={c} cy={c} r={r - 7} fill="url(#ams-dial-body)" stroke="#0b0c0f" strokeWidth={1} />
        <circle cx={c} cy={c} r={r - 11} fill="none" stroke="rgba(255,255,255,0.05)" />
        <line x1={qx} y1={qy} x2={px} y2={py} stroke="#f4f4f5" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{text}</div>
      <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', textAlign: 'center', lineHeight: 1.15 }}>{label}</div>
    </div>
  )
}
