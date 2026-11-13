import React, { useEffect, useRef, useState } from 'react'
import { masterPlayer } from '../../audio/master/player'

// The waveform of the song before (grey) and after the chain (colour), clipping marks (red), the play position and
// the loop region. Click: jump there. Drag: mark a region to loop. Ctrl + wheel or the zoom slider: zoom.

const cache = new WeakMap<AudioBuffer, { key: string; p: Float32Array }>()   // the picture is redrawn every frame

function peaks(buf: AudioBuffer | null, from: number, to: number, cols: number): Float32Array | null {
  if (!buf) return null
  const key = `${from}|${to}|${cols}`
  const hit = cache.get(buf)
  if (hit && hit.key === key) return hit.p
  const p = computePeaks(buf, from, to, cols)
  cache.set(buf, { key, p })
  return p
}

function computePeaks(buf: AudioBuffer, from: number, to: number, cols: number): Float32Array {
  const out = new Float32Array(cols * 2)
  const chans = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c))
  const a = Math.floor(from * buf.sampleRate), b = Math.min(buf.length, Math.ceil(to * buf.sampleRate))
  const step = Math.max(1, (b - a) / cols)
  for (let x = 0; x < cols; x++) {
    let lo = 0, hi = 0
    const s = Math.floor(a + x * step), e = Math.min(b, Math.floor(a + (x + 1) * step))
    const inc = Math.max(1, Math.floor((e - s) / 400))
    for (const ch of chans) for (let i = s; i < e; i += inc) { const v = ch[i]; if (v < lo) lo = v; if (v > hi) hi = v }
    out[x * 2] = lo; out[x * 2 + 1] = hi
  }
  return out
}

export function MasterWave({ before, after, clips, show }: {
  before: AudioBuffer | null
  after: AudioBuffer | null
  clips: number[]                    // seconds where the shown version reaches 0 dBFS
  show: 'both' | 'before' | 'after'
}): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [scroll, setScroll] = useState(0)          // seconds at the left edge
  const [, tick] = useState(0)
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const dur = before?.duration ?? 0
  const span = dur / zoom

  useEffect(() => masterPlayer.on(() => tick((n) => n + 1)), [])
  useEffect(() => { setZoom(1); setScroll(0) }, [before])

  // redraw on every animation frame while playing (the play line), else when something changes
  useEffect(() => {
    let raf = 0
    const draw = (): void => {
      const cv = canvas.current, w = wrap.current
      if (!cv || !w) return
      const W = Math.max(100, Math.floor(w.clientWidth)), H = 160, dpr = window.devicePixelRatio || 1
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px` }
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#121317'; g.fillRect(0, 0, W, H)
      if (!before) return
      const from = scroll, to = Math.min(dur, scroll + span)
      const x = (t: number): number => ((t - from) / (to - from)) * W
      const loop = masterPlayer.loop
      if (loop) { g.fillStyle = masterPlayer.loopOn ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.07)'; g.fillRect(x(loop.start), 0, x(loop.end) - x(loop.start), H) }
      const mid = H / 2
      const paint = (buf: AudioBuffer | null, color: string): void => {
        const p = peaks(buf, from, to, W)
        if (!p) return
        g.fillStyle = color
        for (let i = 0; i < W; i++) g.fillRect(i, mid - p[i * 2 + 1] * mid, 1, Math.max(1, (p[i * 2 + 1] - p[i * 2]) * mid))
      }
      if (show !== 'after') paint(before, show === 'both' ? 'rgba(156,163,175,0.55)' : '#9ca3af')
      if (show !== 'before') paint(after, show === 'both' ? 'rgba(157,95,248,0.75)' : '#9d5ff8')
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, mid, W, 1)
      g.fillStyle = '#ef4444'
      for (const c of clips) if (c >= from && c <= to) g.fillRect(x(c), 0, 1.5, H)
      // time ruler
      g.fillStyle = '#6b7280'; g.font = '10px system-ui'
      const stepS = [1, 2, 5, 10, 15, 30, 60].find((s) => (s / (to - from)) * W > 60) ?? 60
      for (let t = Math.ceil(from / stepS) * stepS; t < to; t += stepS) {
        g.fillRect(x(t), H - 10, 1, 10)
        g.fillText(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, x(t) + 3, H - 2)
      }
      const pos = masterPlayer.position()
      g.fillStyle = '#fff'; g.fillRect(x(pos), 0, 1.5, H)
      if (masterPlayer.playing) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  })

  const timeAt = (e: React.MouseEvent | MouseEvent): number => {
    const r = canvas.current!.getBoundingClientRect()
    return Math.max(0, Math.min(dur, scroll + ((e.clientX - r.left) / r.width) * span))
  }

  const onDown = (e: React.MouseEvent): void => {
    if (!before) return
    const t0 = timeAt(e)
    drag.current = { x0: e.clientX, t0, moved: false }
    const move = (ev: MouseEvent): void => {
      const d = drag.current
      if (!d) return
      if (Math.abs(ev.clientX - d.x0) > 4) d.moved = true
      if (d.moved) { const t = timeAt(ev); masterPlayer.setLoop({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) }, true) }
    }
    const up = (ev: MouseEvent): void => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      if (drag.current && !drag.current.moved) masterPlayer.seek(timeAt(ev))
      drag.current = null
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  const onWheel = (e: React.WheelEvent): void => {
    if (!before) return
    if (e.ctrlKey) {
      const t = timeAt(e)
      const z = Math.max(1, Math.min(200, zoom * (e.deltaY < 0 ? 1.25 : 0.8)))
      const ns = dur / z
      setZoom(z); setScroll(Math.max(0, Math.min(dur - ns, t - (t - scroll) * (ns / span))))
    } else if (zoom > 1) {
      setScroll((s) => Math.max(0, Math.min(dur - span, s + (e.deltaY + e.deltaX) / 400 * span)))
    }
  }

  return (
    <div ref={wrap} style={{ width: '100%', userSelect: 'none' }}>
      <canvas ref={canvas} onMouseDown={onDown} onWheel={onWheel} style={{ display: 'block', borderRadius: 6, cursor: 'text' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>Click: play from there · drag: loop a region · Ctrl + wheel: zoom</span>
        <span style={{ flex: 1 }} />
        {zoom > 1 && <input type="range" min={0} max={Math.max(0, dur - span)} step={0.01} value={scroll} style={{ width: 160 }}
          onChange={(e) => setScroll(Number(e.target.value))} title="Scroll" />}
        Zoom <input type="range" min={0} max={1} step={0.01} value={Math.log(zoom) / Math.log(200)} style={{ width: 90 }}
          onChange={(e) => { const z = Math.pow(200, Number(e.target.value)); setZoom(z); setScroll((s) => Math.max(0, Math.min(dur - dur / z, s))) }} />
      </div>
    </div>
  )
}
