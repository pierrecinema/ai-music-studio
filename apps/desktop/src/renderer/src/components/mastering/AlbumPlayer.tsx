// The album player: a transport row and one timeline of the whole album, drawn like an album editor (WaveLab,
// Ozone): a time ruler, every song as a block with its waveform and title, the pauses as dark gaps. Click a song to
// play from there; click a pause (or hover it: "transition") to hear the end of one song into the next.
import React, { useEffect, useRef, useState } from 'react'
import { tr, trf } from '../../i18n/tr'

const clock = (t: number): string => {
  const s = Math.max(0, t)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export interface AlbumPlayerProps {
  names: string[]
  lens: number[]                       // seconds of each song
  starts: number[]                     // where each song starts on the album (s)
  total: number
  gap: number
  pos: number
  playing: boolean
  now: number                          // the song playing (-1: none)
  peaks: Array<Float32Array | null>    // each song's waveform (0..1), any resolution
  loading: boolean
  onSeek: (t: number) => void
  onTransition: (i: number) => void    // from song i into song i+1
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onLoad: () => void                   // read the songs' lengths and waveforms
}

const H = 86            // height of the lanes
const RULER = 18

export function AlbumPlayer(p: AlbumPlayerProps): React.ReactElement {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<{ x: number; t: number; gap: number } | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const xOf = (t: number): number => (p.total ? (t / p.total) * w : 0)

  // the waveforms (only when the songs, their sizes or the playing song change; the playhead is its own element)
  useEffect(() => {
    const c = canvas.current
    if (!c || !p.total) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.floor(w * dpr)); c.height = Math.floor(H * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--accent').trim() || '#8b5cf6'
    p.lens.forEach((len, i) => {
      const x0 = xOf(p.starts[i]), x1 = xOf(p.starts[i] + len)
      const bw = Math.max(1, x1 - x0)
      // the song's block
      g.fillStyle = i === p.now ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.045)'
      g.fillRect(x0, 0, bw, H)
      g.fillStyle = i === p.now ? accent : 'rgba(255,255,255,0.10)'
      g.fillRect(x0, 0, bw, 2)
      // its waveform: mirrored around the middle of the lower part
      const pk = p.peaks[i]
      const top = 22, mid = top + (H - top - 4) / 2, amp = (H - top - 6) / 2
      g.fillStyle = i === p.now ? accent : 'rgba(203,213,225,0.55)'
      if (pk && pk.length) {
        for (let x = 0; x < bw; x++) {
          const a = Math.floor((x / bw) * pk.length), b = Math.max(a + 1, Math.floor(((x + 1) / bw) * pk.length))
          let m = 0
          for (let k = a; k < b && k < pk.length; k++) if (pk[k] > m) m = pk[k]
          const h = Math.max(0.5, m * amp)
          g.fillRect(x0 + x, mid - h, 1, h * 2)
        }
      } else {
        g.fillRect(x0 + 2, mid, bw - 4, 1)
      }
      // the song's number and title at the top of its block
      if (bw > 30) {
        g.save()
        g.beginPath(); g.rect(x0 + 4, 3, bw - 8, 18); g.clip()
        g.font = '600 11px system-ui, sans-serif'
        g.fillStyle = i === p.now ? '#fff' : 'rgba(226,232,240,0.85)'
        g.fillText(`${String(i + 1).padStart(2, '0')}  ${p.names[i]}`, x0 + 6, 15)
        g.restore()
      }
    })
    // the pauses: dark, finely hatched
    p.lens.forEach((len, i) => {
      if (i >= p.lens.length - 1) return
      const x0 = xOf(p.starts[i] + len), x1 = xOf(p.starts[i + 1])
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(x0, 0, Math.max(1, x1 - x0), H)
      g.strokeStyle = 'rgba(255,255,255,0.18)'
      g.beginPath(); g.moveTo(x0 + 0.5, 0); g.lineTo(x0 + 0.5, H); g.moveTo(x1 - 0.5, 0); g.lineTo(x1 - 0.5, H); g.stroke()
    })
  }, [p.lens, p.starts, p.total, p.peaks, p.now, p.names, w])  // eslint-disable-line react-hooks/exhaustive-deps

  // the ruler: a tick every 30 s / 1 / 2 / 5 / 10 minutes, so that labels are at least ~70 px apart
  const step = [30, 60, 120, 300, 600, 1200].find((s) => xOf(s) >= 70) ?? 1200
  const ticks: number[] = []
  if (p.total) for (let t = 0; t <= p.total; t += step) ticks.push(t)

  const at = (e: React.MouseEvent): { t: number; gap: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const t = ((e.clientX - r.left) / r.width) * p.total
    const gap = p.lens.findIndex((len, i) => i < p.lens.length - 1 && t >= p.starts[i] + len - 0.01 && t <= p.starts[i + 1] + 0.01)
    return { t, gap }
  }
  const btn: React.CSSProperties = { width: 34, height: 34, borderRadius: 17, border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <div style={{ background: 'linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={btn} title={tr('Previous song')} onClick={p.onPrev}>⏮</button>
        <button style={{ ...btn, width: 42, height: 42, borderRadius: 21, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 16 }} title={p.playing ? tr('Stop') : tr('Hear the album')} onClick={p.onToggle}>{p.playing ? '■' : '▶'}</button>
        <button style={btn} title={tr('Next song')} onClick={p.onNext}>⏭</button>
        <div style={{ marginLeft: 8, padding: '4px 12px', background: '#05080c', border: '1px solid #1f2a37', borderRadius: 6, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontVariantNumeric: 'tabular-nums', color: '#7dd3fc', fontSize: 18, letterSpacing: '0.04em' }}>
          {clock(p.pos)}<span style={{ color: '#3b5068', fontSize: 13 }}> / {clock(p.total)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{p.now >= 0 ? trf('Track {n} of {total}', { n: p.now + 1, total: p.names.length }) : trf('{n} songs', { n: p.names.length })}</span>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 420 }}>{p.now >= 0 ? p.names[p.now] : '—'}</span>
        </div>
      </div>

      {/* ruler and lanes */}
      <div ref={wrap} style={{ position: 'relative', userSelect: 'none' }}>
        <div style={{ position: 'relative', height: RULER, borderBottom: '1px solid var(--border)' }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: xOf(t), bottom: 0, height: 6, borderLeft: '1px solid var(--border-mid)' }}>
              <span style={{ position: 'absolute', left: 3, bottom: 4, fontSize: 9.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{clock(t)}</span>
            </div>
          ))}
        </div>
        <div
          onMouseMove={(e) => { if (!p.total) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const a = at(e); setHover({ x: e.clientX - r.left, ...a }) }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { if (!p.total) { p.onLoad(); return } const a = at(e); if (a.gap >= 0) p.onTransition(a.gap); else p.onSeek(a.t) }}
          style={{ position: 'relative', height: H, background: '#0b0f14', borderRadius: '0 0 6px 6px', overflow: 'hidden', cursor: p.total ? 'pointer' : 'default' }}>
          <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: H }} />
          {p.total > 0 && <div style={{ position: 'absolute', left: xOf(p.pos) - 1, top: 0, bottom: 0, width: 2, background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.7)', pointerEvents: 'none' }} />}
          {hover && (
            <div style={{ position: 'absolute', left: hover.x, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', left: hover.x > w - 120 ? undefined : 5, right: hover.x > w - 120 ? 5 : undefined, bottom: 4, whiteSpace: 'nowrap', fontSize: 10.5, padding: '1px 6px', borderRadius: 3, background: 'rgba(0,0,0,0.75)', color: hover.gap >= 0 ? '#fde68a' : '#e2e8f0' }}>
                {hover.gap >= 0 ? trf('Click: hear the transition {a} → {b}', { a: hover.gap + 1, b: hover.gap + 2 }) : clock(hover.t)}
              </span>
            </div>
          )}
          {!p.total && (
            <button className="btn btn-ghost" style={{ position: 'absolute', inset: 0, margin: 'auto', width: 260, height: 32, fontSize: 12 }} onClick={(e) => { e.stopPropagation(); p.onLoad() }}>
              {p.loading ? tr('Reading the songs…') : tr('Show the album as a timeline')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
