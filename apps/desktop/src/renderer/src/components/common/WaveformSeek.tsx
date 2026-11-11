import React, { useEffect, useRef, useState } from 'react'

// The real waveform of a file with the play position: click or drag anywhere to jump there.
// Either drives an HTMLAudioElement that plays the same file (Library), or reads the position and seeks through
// callbacks (sample preview, stem mixer). The picture comes from the file bytes or from decoded AudioBuffers.

const peakCache = new Map<string, Float32Array>()       // file -> [min, max] per column, so a replay draws at once

async function decode(bytes: Uint8Array): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100)
  return ctx.decodeAudioData(bytes.slice().buffer)              // decodeAudioData detaches its input: use a copy
}

function computePeaks(bufs: AudioBuffer[], columns: number): Float32Array {
  const chans = bufs.flatMap((b) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)))
  const n = Math.max(...bufs.map((b) => b.length))
  const out = new Float32Array(columns * 2)
  const step = Math.max(1, Math.floor(n / columns))
  for (let x = 0; x < columns; x++) {
    let lo = 0, hi = 0
    const start = x * step, end = Math.min(n, start + step)
    for (const ch of chans) {
      for (let i = start; i < Math.min(end, ch.length); i += 4) {     // every 4th sample is plenty for the picture
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    out[x * 2] = lo; out[x * 2 + 1] = hi
  }
  return out
}

export function WaveformSeek({ fileKey, bytes, buffers, audio, position, onSeek, color = 'var(--accent)' }: {
  fileKey: string                 // e.g. the path: identifies the cached peaks
  bytes?: Uint8Array | null       // the file, for drawing the waveform ...
  buffers?: AudioBuffer[] | null  // ... or decoded audio (several are drawn on top of each other: stems)
  audio?: HTMLAudioElement | null // the player to follow and to seek ...
  position?: () => { time: number; duration: number } | null    // ... or these two
  onSeek?: (seconds: number) => void
  color?: string
}): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(() => peakCache.get(fileKey) ?? null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)
  const dragging = useRef(false)
  const COLS = 600

  useEffect(() => {
    if (peakCache.has(fileKey)) { setPeaks(peakCache.get(fileKey)!); return }
    let cancelled = false
    const make = async (): Promise<AudioBuffer[] | null> => (buffers?.length ? buffers : bytes ? [await decode(bytes)] : null)
    make().then((b) => {
      if (!b || cancelled) return
      const p = computePeaks(b, COLS)
      peakCache.set(fileKey, p); setPeaks(p)
    }).catch(() => setFailed(true))
    return () => { cancelled = true }
  }, [fileKey, bytes, buffers])

  const where = (): { time: number; duration: number } | null =>
    audio ? { time: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 } : position?.() ?? null

  // follow the player
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const w = where()
      if (w) { setTime(w.time); if (w.duration) setDuration(w.duration) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  })

  // draw
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const w = c.clientWidth, h = c.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const css = getComputedStyle(c)
    const played = css.getPropertyValue('--wave-played').trim() || '#8b5cf6'
    const rest = css.getPropertyValue('--wave-rest').trim() || '#555'
    const pos = duration > 0 ? (time / duration) * w : 0
    const mid = h / 2
    if (peaks) {
      for (let x = 0; x < w; x++) {
        const i = Math.min(COLS - 1, Math.floor((x / w) * COLS))
        const lo = peaks[i * 2], hi = peaks[i * 2 + 1]
        const y1 = mid - Math.max(0.5, hi * mid * 0.95), y2 = mid - Math.min(-0.5, lo * mid * 0.95)
        g.fillStyle = x < pos ? played : rest
        g.fillRect(x, y1, 1, y2 - y1)
      }
    } else {
      g.fillStyle = rest
      g.fillRect(0, mid - 1, w, 2)
      g.fillStyle = played
      g.fillRect(0, mid - 1, pos, 2)
    }
    g.fillStyle = '#fff'
    g.fillRect(Math.round(pos), 0, 1.5, h)
  }, [peaks, time, duration])

  const seekTo = (clientX: number): void => {
    const el = wrap.current
    const total = duration || where()?.duration || 0
    if (!el || !(total > 0)) return
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    if (audio) audio.currentTime = f * total
    else onSeek?.(f * total)
    setTime(f * total)
  }

  const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>{mmss(time)}</span>
      <div ref={wrap} title={failed ? 'Click to jump (the waveform could not be drawn)' : 'Click or drag to jump'}
        style={{ flex: 1, height: 48, cursor: 'pointer', background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden' }}
        onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); seekTo(e.clientX) }}
        onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX) }}
        onPointerUp={() => { dragging.current = false }}>
        <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block', ['--wave-played' as string]: color, ['--wave-rest' as string]: 'var(--text-muted)' } as React.CSSProperties} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', width: 36 }}>{duration ? mmss(duration) : '–:––'}</span>
    </div>
  )
}
