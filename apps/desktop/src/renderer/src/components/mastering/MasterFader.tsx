import React, { useEffect, useRef, useState } from 'react'
import { masterPlayer } from '../../audio/master/player'
import type { Chain } from '../../audio/master/chain'
import { tr } from '../../i18n/tr'

// The master gain as a big fader, like on a mixing desk: it drives the song into the limiter ("Louder"), so the
// master gets louder without going over the ceiling. Next to it the live level (true peak and short-term loudness).
// Drag, mouse wheel (Shift: fine), arrow keys; double-click: 0 dB.

const MIN = -12, MAX = 24
const marks = [24, 18, 12, 6, 0, -6, -12]

export function MasterFader({ chain, onChange, height = 220 }: { chain: Chain; onChange: (c: Chain) => void; height?: number }): React.ReactElement {
  const H = height
  const [, tick] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; v0: number } | null>(null)
  useEffect(() => masterPlayer.on(() => tick((n) => n + 1)), [])
  const v = chain.louderDb
  const y = (db: number): number => ((MAX - db) / (MAX - MIN)) * H
  const set = (db: number): void => onChange({ ...chain, louderDb: Math.round(Math.max(MIN, Math.min(MAX, db)) * 10) / 10 })

  const onDown = (e: React.PointerEvent): void => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    const r = track.current!.getBoundingClientRect()
    const hitKnob = Math.abs(e.clientY - (r.top + y(v))) < 14
    if (!hitKnob) set(MAX - ((e.clientY - r.top) / H) * (MAX - MIN))           // click on the track: jump there
    drag.current = { y0: e.clientY, v0: hitKnob ? v : MAX - ((e.clientY - r.top) / H) * (MAX - MIN) }
  }
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const scale = e.shiftKey ? 0.1 : 1
    set(d.v0 - ((e.clientY - d.y0) / H) * (MAX - MIN) * scale)
  }

  const r = masterPlayer.report
  const live = masterPlayer.playing && r
  const tp = live ? r!.truePeak : -Infinity
  const st = live ? r!.shortTerm : -Infinity
  const meterY = (db: number, lo: number): number => (Number.isFinite(db) ? Math.max(0, Math.min(1, (db - lo) / (0 - lo))) : 0)
  const lim = masterPlayer.reduction.limiter < 1 ? -20 * Math.log10(masterPlayer.reduction.limiter) : 0

  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10, display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tr('Master gain')}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ position: 'relative', height: H, width: 26, fontSize: 9, color: 'var(--text-muted)' }}>
            {marks.map((m) => <span key={m} style={{ position: 'absolute', right: 0, top: y(m) - 6 }}>{m > 0 ? `+${m}` : m}</span>)}
          </div>
          <div ref={track} tabIndex={0} role="slider" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={v}
            title={tr('Drag, wheel (Shift: fine) or arrow keys; double-click: 0 dB. The sound goes through the limiter, so it does not clip.')}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null }}
            onDoubleClick={() => set(0)}
            onWheel={(e) => set(v + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.1 : 0.5))}
            onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); set(v + (e.shiftKey ? 0.1 : 0.5)) } if (e.key === 'ArrowDown') { e.preventDefault(); set(v - (e.shiftKey ? 0.1 : 0.5)) } }}
            style={{ position: 'relative', height: H, width: 44, cursor: 'ns-resize', outline: 'none', touchAction: 'none' }}>
            <div style={{ position: 'absolute', left: 19, width: 6, top: 0, bottom: 0, borderRadius: 3, background: '#0d0e11', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
            {marks.map((m) => <div key={m} style={{ position: 'absolute', left: 8, width: 28, top: y(m), height: 1, background: m === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)' }} />)}
            {/* the part between 0 dB and the knob, in colour */}
            <div style={{ position: 'absolute', left: 19, width: 6, top: Math.min(y(v), y(0)), height: Math.abs(y(v) - y(0)), borderRadius: 3, background: v >= 0 ? 'var(--accent)' : '#64748b' }} />
            <div style={{ position: 'absolute', left: 2, width: 40, height: 22, top: y(v) - 11, borderRadius: 4,
              background: 'linear-gradient(#e5e7eb, #9ca3af)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 30, height: 2, background: '#111' }} />
            </div>
          </div>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--accent-light)' : 'var(--text-primary)' }}>{v > 0 ? '+' : ''}{v.toFixed(1)} dB</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => set(v - 1)}>−1</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => set(0)}>0</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => set(v + 1)}>+1</button>
        </div>
      </div>
      {/* live meters: true peak and short-term loudness, with the limiter's work */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 18 }}>
        {[{ label: 'TP', v: tp, lo: -30, color: tp > -1 ? 'var(--red)' : 'var(--green)', text: Number.isFinite(tp) ? tp.toFixed(1) : '–' },
          { label: 'LUFS S', v: st, lo: -40, color: 'var(--accent-light)', text: Number.isFinite(st) ? st.toFixed(1) : '–' },
          { label: 'GR', v: -lim, lo: -12, color: 'var(--orange)', text: lim ? `−${lim.toFixed(1)}` : '0', invert: true }].map((m) => (
          // a fixed width: the changing numbers below (−9.8, −12.3) made the meters shift sideways while music played
          <div key={m.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 40, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 14, height: H, background: '#0d0e11', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, background: m.color, transition: 'height 80ms, top 80ms',
                ...(m.invert ? { top: 0, height: `${(1 - meterY(m.v, m.lo)) * 100}%` } : { bottom: 0, height: `${meterY(m.v, m.lo) * 100}%` }) }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.label}</span>
            <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', width: '100%', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.text}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', maxWidth: 120, lineHeight: 1.5 }}>
        {tr('Makes the master louder or quieter. Through the limiter: louder without clipping (orange: how much it holds back).')}
        {!chain.limiter.on && <div style={{ color: 'var(--orange)', marginTop: 6 }}>{tr('The limiter is off: above 0 dB the master can clip.')}</div>}
      </div>
    </div>
  )
}
