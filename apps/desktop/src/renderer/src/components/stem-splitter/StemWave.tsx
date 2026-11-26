import React, { useEffect, useRef, useState } from 'react'
import { minMax } from '../../audio/wave'

// A waveform drawn from the samples (lowest / highest of every pixel column), with a play position line.
// Click or drag to jump. Used by the stem lanes and by the original song at the top of the Stem Splitter.

interface Props {
  buffer: AudioBuffer | null
  color: string
  height?: number
  /** play position in seconds, read every frame the parent renders; omit for a picture only */
  time?: number
  onSeek?: (seconds: number) => void
  dim?: boolean
}

export function StemWave({ buffer, color, height = 40, time, onSeek, dim }: Props): React.ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(0, Math.floor(el.clientWidth))))
    ro.observe(el); setW(Math.floor(el.clientWidth))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c || w < 2) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.floor(w * dpr); c.height = Math.floor(height * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr); g.clearRect(0, 0, w, height)
    const mid = height / 2
    g.fillStyle = color + '33'; g.fillRect(0, mid, w, 1)
    if (!buffer) return
    g.fillStyle = color
    const dur = buffer.duration
    for (let x = 0; x < w; x++) {
      const [lo, hi] = minMax(buffer, (x / w) * dur, ((x + 1) / w) * dur)
      const top = Math.min(mid - 1, mid - hi * mid * 0.95), bot = Math.max(mid + 1, mid - lo * mid * 0.95)
      g.fillRect(x, top, 1, Math.max(1, bot - top))
    }
  }, [buffer, color, w, height])

  const seek = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!onSeek || !buffer || !box.current) return
    const r = box.current.getBoundingClientRect()
    onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * buffer.duration)
  }
  const frac = buffer && time !== undefined ? Math.min(1, Math.max(0, time / buffer.duration)) : null

  return (
    <div ref={box} style={{ position: 'relative', height, flex: 1, minWidth: 0, cursor: onSeek ? 'pointer' : 'default', opacity: dim ? 0.35 : 1 }}
      onPointerDown={(e) => { if (!onSeek) return; (e.target as Element).setPointerCapture?.(e.pointerId); seek(e) }}
      onPointerMove={(e) => { if (e.buttons === 1) seek(e) }}>
      <canvas ref={cv} style={{ width: '100%', height, display: 'block' }} />
      {frac !== null && frac > 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${frac * 100}%`, width: 2, background: '#fff', opacity: 0.85, pointerEvents: 'none' }} />}
    </div>
  )
}

/** decode an audio file to a buffer for drawing only (no sound device is opened) */
export async function decodeForPicture(path: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await window.api.fs.readFile(path)
    return await new OfflineAudioContext(1, 1, 44100).decodeAudioData(new Uint8Array(bytes).slice().buffer)
  } catch { return null }
}
