// Studio-gear building blocks for the AI Instruments page, modelled on plugin front panels: a device with a coloured
// side stripe and a two-weight name, rotary knobs with a lit ring and the value in the cap, LED buttons, small
// hardware keys, LCD screens, a step grid and a mini piano roll that show what will be played.
import React, { useRef } from 'react'
import type { BandNote } from '../../lib/band'

export const G = {
  face: 'linear-gradient(180deg, #34373e 0%, #2a2d33 45%, #23252a 100%)',
  faceDark: 'linear-gradient(180deg, #202227 0%, #1a1c20 100%)',
  edge: '#0c0d10',
  hi: 'rgba(255,255,255,0.07)',
  text: '#e7e7ea',
  dim: '#9298a3',
  faint: '#5d636e',
  screen: '#0a0f14',
  font: '"Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", Consolas, monospace',
}

// ── device ──────────────────────────────────────────────────────────────────

export function Device({ brand, name, color, children, right, style, hint }: {
  brand: string; name: string; color: string; children: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties; hint?: string
}): React.ReactElement {
  return (
    <section title={hint} style={{ position: 'relative', background: G.face, border: `1px solid ${G.edge}`, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
      boxShadow: `inset 0 1px 0 ${G.hi}, 0 10px 24px rgba(0,0,0,0.45)`, display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, boxShadow: `0 0 12px ${color}` }} />
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 8px 18px' }}>
        <span style={{ fontFamily: G.font, fontSize: 17, letterSpacing: '0.02em', color: G.text, whiteSpace: 'nowrap' }}>
          <b style={{ fontWeight: 800 }}>{brand}</b>{name && <><span style={{ color: G.faint, margin: '0 6px', fontWeight: 300 }}>|</span><span style={{ fontWeight: 300 }}>{name}</span></>}
        </span>
        <span style={{ flex: 1 }} />
        {right}
      </header>
      <div style={{ padding: '6px 14px 14px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>{children}</div>
    </section>
  )
}

/** a recessed strip inside a device (like the lower panel of a plugin) */
export function Strip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <div style={{ background: G.faceDark, borderRadius: 8, border: `1px solid ${G.edge}`, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)', padding: '10px 12px',
      display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', ...style }}>{children}</div>
  )
}

export const Label = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement => (
  <span style={{ fontFamily: G.font, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: G.dim, ...style }}>{children}</span>
)

// ── knob ────────────────────────────────────────────────────────────────────

const A0 = -140, A1 = 140
const rad = (d: number): number => ((d - 90) * Math.PI) / 180
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = [cx + r * Math.cos(rad(from)), cy + r * Math.sin(rad(from))]
  const [x1, y1] = [cx + r * Math.cos(rad(to)), cy + r * Math.sin(rad(to))]
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

let knobId = 0
export function Knob({ label, value, min, max, step = 0.01, def, onChange, format, size = 58, color = '#38bdf8', title, bipolar, valueInside, low, high }: {
  label: string; value: number; min: number; max: number; step?: number; def?: number; onChange: (v: number) => void
  format?: (v: number) => string; size?: number; color?: string; title?: string; bipolar?: boolean; valueInside?: boolean
  low?: string; high?: string                                // words under the knob's ends ("Fast … Slow")
}): React.ReactElement {
  const id = useRef(`k${++knobId}`).current
  const pos = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const ang = A0 + pos * (A1 - A0)
  const drag = useRef<{ y: number; p: number } | null>(null)
  const put = (p: number): void => onChange(Math.round((min + Math.max(0, Math.min(1, p)) * (max - min)) / step) * step)
  const c = size / 2, ring = size / 2 - 3, cap = size / 2 - 9
  const from = bipolar ? 0 : A0
  const [px, py] = [c + (cap - 5) * Math.cos(rad(ang)), c + (cap - 5) * Math.sin(rad(ang))]
  const [qx, qy] = [c + (cap * 0.45) * Math.cos(rad(ang)), c + (cap * 0.45) * Math.sin(rad(ang))]
  const text = format ? format(value) : `${Math.round(pos * 100)}`
  const inc = Math.max(step / (max - min), 0.02)
  return (
    <div title={title ? `${title} (${text})` : `${label}: ${text}`} tabIndex={0}
      onKeyDown={(e) => { const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); e.stopPropagation(); put(pos + d * (e.shiftKey ? 0.005 : inc)) } }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, outline: 'none', userSelect: 'none', minWidth: size + 10 }}>
      <Label style={{ color: G.text, letterSpacing: '0.06em', textTransform: 'none', fontSize: 11.5, fontWeight: 500 }}>{label}</Label>
      <svg width={size} height={size} style={{ cursor: 'ns-resize', touchAction: 'none', overflow: 'visible' }}
        onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, p: pos } }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const np = d.p + (d.y - e.clientY) / (e.shiftKey ? 900 : 180); if (e.shiftKey) drag.current = { y: e.clientY, p: np }; put(np) }}
        onPointerUp={() => { drag.current = null }}
        onWheel={(e) => put(pos + (e.deltaY < 0 ? 1 : -1) * inc)}
        onDoubleClick={() => { if (def !== undefined) onChange(def) }}>
        <defs>
          <radialGradient id={`${id}-cap`} cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="#4b505b" /><stop offset="0.5" stopColor="#262930" /><stop offset="1" stopColor="#15171b" />
          </radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a5f6a" /><stop offset="1" stopColor="#0d0e11" />
          </linearGradient>
        </defs>
        {/* the lit ring */}
        <path d={arc(c, c, ring, A0, A1)} fill="none" stroke="#0b0c0f" strokeWidth={5} strokeLinecap="round" />
        {Math.abs(ang - from) > 0.5 && (
          <path d={ang >= from ? arc(c, c, ring, from, ang) : arc(c, c, ring, ang, from)} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        )}
        {/* the cap: shadow, rim, face, a soft highlight */}
        <circle cx={c} cy={c + 2.5} r={cap + 1} fill="#000" opacity={0.55} />
        <circle cx={c} cy={c} r={cap + 1} fill={`url(#${id}-rim)`} />
        <circle cx={c} cy={c} r={cap - 1} fill={`url(#${id}-cap)`} />
        <ellipse cx={c - cap * 0.25} cy={c - cap * 0.35} rx={cap * 0.45} ry={cap * 0.25} fill="#fff" opacity={0.05} />
        {valueInside
          ? <text x={c} y={c + 4} textAnchor="middle" style={{ fontFamily: G.font, fontSize: Math.round(size * 0.2), fontWeight: 600, fill: '#f4f4f5' }}>{text}</text>
          : <line x1={qx} y1={qy} x2={px} y2={py} stroke="#f4f4f5" strokeWidth={2.4} strokeLinecap="round" />}
        {valueInside && <circle cx={px} cy={py} r={2.2} fill={color} />}
      </svg>
      {!valueInside && <span style={{ fontFamily: G.mono, fontSize: 11, color: G.text, background: '#0b0c0f', borderRadius: 4, padding: '1px 6px', minWidth: 34, textAlign: 'center' }}>{text}</span>}
      {(low || high) && <div style={{ display: 'flex', justifyContent: 'space-between', width: size + 10, fontSize: 9.5, color: G.faint }}><span>{low}</span><span>{high}</span></div>}
    </div>
  )
}

// ── LED buttons, keys, screens ──────────────────────────────────────────────

/** a round LED button with its name: on / off */
export function Led({ label, on, set, color = '#38bdf8', title }: { label: string; on: boolean; set: (v: boolean) => void; color?: string; title?: string }): React.ReactElement {
  return (
    <button title={title} onClick={() => set(!on)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <Label style={{ textTransform: 'none', fontSize: 11.5, fontWeight: 500, color: on ? G.text : G.dim, letterSpacing: '0.04em' }}>{label}</Label>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #3b3f48, #15171b)', border: '1px solid #000', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? color : '#2b2f36', boxShadow: on ? `0 0 8px ${color}, 0 0 2px ${color}` : 'inset 0 1px 2px #000' }} />
      </span>
    </button>
  )
}

/** a small hardware key (the main action of a device gets `accent`) */
export function Key({ children, onClick, disabled, title, accent, color = '#38bdf8' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; accent?: boolean; color?: string }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ fontFamily: G.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 13px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, color: accent ? '#0b0c0f' : G.text, border: `1px solid ${G.edge}`,
        background: accent ? `linear-gradient(180deg, color-mix(in srgb, ${color} 70%, white), ${color})` : 'linear-gradient(180deg, #3a3e46, #262930)',
        boxShadow: accent ? `0 0 12px color-mix(in srgb, ${color} 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)` : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.4)' }}>
      {children}
    </button>
  )
}

/** a row of keys, one of them lit */
export function Selector<T extends string | number>({ label, value, options, onChange, color = '#38bdf8' }: { label?: string; value: T; options: Array<{ id: T; label: string; disabled?: boolean; hint?: string }>; onChange: (v: T) => void; color?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <Label>{label}</Label>}
      <div style={{ display: 'inline-flex', background: '#0b0c0f', borderRadius: 7, padding: 2, gap: 2, border: `1px solid ${G.edge}` }}>
        {options.map((o) => {
          const on = o.id === value
          return (
            <button key={String(o.id)} disabled={o.disabled} title={o.hint} onClick={() => onChange(o.id)}
              style={{ border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.35 : 1,
                background: on ? 'linear-gradient(180deg, #3d424b, #2b2f36)' : 'transparent', color: on ? color : G.dim, boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : undefined }}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** a screen showing one of several options; ◀ ▶ step through, a click opens the list */
export function Screen<T extends string | number>({ label, value, options, onChange, width = 200, color = '#7dd3fc' }: { label?: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; width?: number | string; color?: string }): React.ReactElement {
  const i = Math.max(0, options.findIndex((o) => o.id === value))
  const step = (d: number): void => onChange(options[(i + d + options.length) % options.length].id)
  const arrow: React.CSSProperties = { background: 'transparent', border: 'none', color: G.dim, cursor: 'pointer', fontSize: 10, padding: '0 7px', height: '100%' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width }}>
      {label && <Label>{label}</Label>}
      <div style={{ display: 'flex', alignItems: 'center', background: G.screen, border: '1px solid #000', borderRadius: 6, height: 30, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.05)' }}>
        <button style={arrow} onClick={() => step(-1)}>◀</button>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontFamily: G.mono, fontSize: 12, textShadow: `0 0 8px ${color}88`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{options[i]?.label}</div>
          <select value={String(value)} onChange={(e) => { const o = options.find((x) => String(x.id) === e.target.value); if (o) onChange(o.id) }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
            {options.map((o) => <option key={String(o.id)} value={String(o.id)}>{o.label}</option>)}
          </select>
        </div>
        <button style={arrow} onClick={() => step(1)}>▶</button>
      </div>
    </div>
  )
}

/** a text field that looks like a screen */
export function ScreenInput({ label, value, set, placeholder, color = '#7dd3fc' }: { label?: string; value: string; set: (v: string) => void; placeholder?: string; color?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 220 }}>
      {label && <Label>{label}</Label>}
      <input value={value} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={placeholder}
        style={{ height: 30, background: G.screen, color, border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)', fontFamily: G.mono, fontSize: 12.5, padding: '0 10px', outline: 'none' }} />
    </div>
  )
}

// ── displays of what will be played ─────────────────────────────────────────

const DRUM_ROWS: Array<{ name: string; pitches: number[] }> = [
  { name: 'CRASH', pitches: [49, 51, 57, 53] }, { name: 'HAT', pitches: [42, 44, 46, 70, 54] }, { name: 'PERC', pitches: [37, 39, 56, 60, 61, 62, 63, 64, 75] },
  { name: 'TOMS', pitches: [41, 43, 45, 47, 48, 50] }, { name: 'SNARE', pitches: [38, 40] }, { name: 'KICK', pitches: [35, 36] },
]

/** the first bar(s) of a drum part as a step grid (16 steps per bar) */
export function StepView({ notes, bars = 2, color }: { notes: BandNote[]; bars?: number; color: string }): React.ReactElement {
  const steps = bars * 16
  return (
    <div style={{ background: G.screen, border: '1px solid #000', borderRadius: 6, padding: 6, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)' }}>
      {DRUM_ROWS.map((r) => {
        const hits = new Map<number, number>()
        for (const n of notes) {
          if (!r.pitches.includes(n.pitch)) continue
          const s = Math.round(n.startTime * 4)
          if (s >= 0 && s < steps) hits.set(s, Math.max(hits.get(s) ?? 0, n.velocity))
        }
        return (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 2, height: 11, marginBottom: 2 }}>
            <span style={{ width: 38, fontFamily: G.mono, fontSize: 8, color: G.faint }}>{r.name}</span>
            {Array.from({ length: steps }, (_, s) => {
              const v = hits.get(s)
              return <span key={s} style={{ flex: 1, height: '100%', borderRadius: 2, marginLeft: s % 4 === 0 && s ? 2 : 0,
                background: v ? color : s % 4 === 0 ? '#1d2229' : '#14181e', opacity: v ? 0.45 + 0.55 * (v / 127) : 1, boxShadow: v ? `0 0 5px ${color}` : undefined }} />
            })}
          </div>
        )
      })}
    </div>
  )
}

/** the first bars of a part as a mini piano roll */
export function RollView({ notes, beats = 8, color, height = 64 }: { notes: BandNote[]; beats?: number; color: string; height?: number }): React.ReactElement {
  const shown = notes.filter((n) => n.startTime < beats)
  const ps = shown.map((n) => n.pitch)
  const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 60
  const span = Math.max(14, ps.length ? Math.max(...ps) - Math.min(...ps) + 2 : 14)
  const lo = mid - span / 2, hi = mid + span / 2
  const W = 300
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, background: G.screen, border: '1px solid #000', borderRadius: 6, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)' }}>
      {Array.from({ length: beats + 1 }, (_, b) => <line key={b} x1={(b / beats) * W} x2={(b / beats) * W} y1={0} y2={height} stroke={b % 4 === 0 ? '#243040' : '#161c24'} strokeWidth={1} />)}
      {shown.map((n, i) => {
        const y = ((hi - n.pitch) / (hi - lo)) * (height - 4) + 1
        return <rect key={i} x={(n.startTime / beats) * W} y={y} width={Math.max(2, (Math.min(n.duration, beats - n.startTime) / beats) * W - 1)} height={Math.max(2, (height - 4) / (hi - lo) - 0.5)} rx={1}
          fill={color} opacity={0.5 + 0.5 * (n.velocity / 127)} />
      })}
    </svg>
  )
}

/** a level meter used as a progress display */
export function Meter({ value, text, color = '#22c55e' }: { value: number; text?: string; color?: string }): React.ReactElement {
  const segs = 24
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
      <div style={{ display: 'flex', gap: 2, background: G.screen, padding: 3, borderRadius: 4, border: '1px solid #000' }}>
        {Array.from({ length: segs }, (_, i) => {
          const lit = i / segs < value
          const c = i > segs * 0.85 ? '#ef4444' : i > segs * 0.65 ? '#eab308' : color
          return <span key={i} style={{ flex: 1, height: 8, borderRadius: 1, background: lit ? c : '#1a1f26', boxShadow: lit ? `0 0 4px ${c}` : undefined }} />
        })}
      </div>
      {text && <span style={{ fontSize: 11, color: G.dim, fontFamily: G.font }}>{text}</span>}
    </div>
  )
}
