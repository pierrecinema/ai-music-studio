import React, { useEffect, useRef } from 'react'
import type { EqParams } from '../../audio/master/chain'
import { masterPlayer } from '../../audio/master/player'

// The EQ's curve (what the seven filters do together) with the live spectrum of the song behind it.

const N = 256
const freqs = new Float32Array(N).map((_, i) => 20 * Math.pow(1000, i / (N - 1)))
let probe: OfflineAudioContext | null = null

function response(p: EqParams): Float32Array {
  probe ??= new OfflineAudioContext(1, 1, 48000)
  const sr = probe.sampleRate
  const total = new Float32Array(N).fill(0)
  const mag = new Float32Array(N), ph = new Float32Array(N)
  const add = (type: BiquadFilterType, f: number, q: number, g: number): void => {
    const b = probe!.createBiquadFilter()
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g
    b.getFrequencyResponse(freqs, mag, ph)
    for (let i = 0; i < N; i++) total[i] += 20 * Math.log10(Math.max(1e-6, mag[i]))
  }
  if (p.lowCut > 0) add('highpass', p.lowCut, 0.7071, 0)
  add('lowshelf', p.lowF, 0, p.lowG)
  add('peaking', p.p1F, p.p1Q, p.p1G); add('peaking', p.p2F, p.p2Q, p.p2G); add('peaking', p.p3F, p.p3Q, p.p3G)
  add('highshelf', p.highF, 0, p.highG)
  if (p.highCut > 0) add('lowpass', Math.min(p.highCut, sr / 2 - 1), 0.7071, 0)
  return total
}

const spec = new Float32Array(4096)

export function EqCurve({ p }: { p: EqParams }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const curve = useRef<Float32Array>(response(p))
  useEffect(() => { curve.current = response(p) }, [p])
  useEffect(() => {
    let raf = 0
    const draw = (): void => {
      const cv = ref.current
      if (cv) {
        const W = Math.max(50, Math.floor(cv.clientWidth)), H = 110, dpr = window.devicePixelRatio || 1
        if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px` }
        const g = cv.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.fillStyle = '#121317'; g.fillRect(0, 0, W, H)
        const fx = (f: number): number => (Math.log10(f / 20) / 3) * W
        const dy = (db: number): number => H / 2 - (db / 15) * (H / 2)
        g.font = '9px system-ui'
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(fx(f), 0, 1, H)
          g.fillStyle = '#6b7280'; g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, fx(f) + 2, H - 2)
        }
        for (const d of [-12, -6, 6, 12]) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, dy(d), W, 1) }
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, dy(0), W, 1)
        // the song's spectrum (after the chain), dimmed
        const an = masterPlayer.postAnalyser
        if (masterPlayer.playing && an) {
          an.getFloatFrequencyData(spec)
          const sr = masterPlayer.ctx?.sampleRate ?? 48000
          g.beginPath(); g.moveTo(0, H)
          for (let x = 0; x < W; x += 2) {
            const f = 20 * Math.pow(1000, x / W)
            const bin = Math.min(spec.length - 1, Math.round((f / (sr / 2)) * spec.length))
            g.lineTo(x, H - ((spec[bin] + 100) / 90) * H)
          }
          g.lineTo(W, H); g.closePath(); g.fillStyle = 'rgba(156,163,175,0.18)'; g.fill()
        }
        // the curve
        const c = curve.current
        g.beginPath()
        for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * W, y = dy(Math.max(-15, Math.min(15, c[i]))); if (i) g.lineTo(x, y); else g.moveTo(x, y) }
        g.strokeStyle = '#9d5ff8'; g.lineWidth = 2; g.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
}
