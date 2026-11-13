import React, { useEffect, useRef, useState } from 'react'
import { masterPlayer } from '../../audio/master/player'
import type { Analysis } from '../../audio/master/dsp'

// Meters: numbers for the whole file (before → after) and live while playing, gain reduction, stereo correlation,
// goniometer, spectrum (before and after on top of each other) and the loudness over time.

const fmt = (v: number | undefined, d = 1): string => (v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(d))

const box: React.CSSProperties = { background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }

// the side that is heard (Before / After) is shown large and bright, the other one small and dim
let side: 'before' | 'after' = 'after'

function Row({ name, before, after, unit, warn, warnBefore, title }: { name: string; before?: number; after?: number; unit: string; warn?: boolean; warnBefore?: boolean; title?: string }): React.ReactElement {
  const on = (s: 'before' | 'after'): React.CSSProperties => side === s
    ? { fontWeight: 700, fontSize: 13, color: (s === 'after' ? warn : warnBefore) ? 'var(--red)' : 'var(--text-primary)' }
    : { fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }
  return (
    <div title={title} style={{ display: 'grid', gridTemplateColumns: '1fr 58px 14px 58px', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
      <span style={{ textAlign: 'right', ...on('before') }}>{fmt(before)}</span>
      <span style={{ textAlign: 'center', color: 'var(--text-muted)' }}>→</span>
      <span style={{ textAlign: 'right', ...on('after') }}>{fmt(after)} <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span></span>
    </div>
  )
}

function Bar({ value, min, max, color, text }: { value: number; min: number; max: number; color: string; text: string }): React.ReactElement {
  const f = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0
  return (
    <div style={{ position: 'relative', height: 14, background: '#121317', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${f * 100}%`, background: color, transition: 'width 80ms' }} />
      <span style={{ position: 'absolute', right: 4, top: 0, fontSize: 9, lineHeight: '14px', color: '#fff' }}>{text}</span>
    </div>
  )
}

export function MasterMeters({ before, after, target, busy, active }: { before: Analysis | null; after: Analysis | null; target: number; busy: boolean; active: 'before' | 'after' }): React.ReactElement {
  side = active
  const [, tick] = useState(0)
  useEffect(() => masterPlayer.on(() => tick((n) => n + 1)), [])
  const r = masterPlayer.report
  const live = masterPlayer.playing && r
  const red = masterPlayer.reduction
  const limDb = red.limiter < 1 ? 20 * Math.log10(red.limiter) : 0
  const corr = live ? r!.correlation : after?.correlation ?? 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={box}>
        <div style={{ ...label, display: 'flex', justifyContent: 'space-between' }}>
          <span>Whole song: <span style={{ color: active === 'before' ? 'var(--text-primary)' : undefined }}>before</span> → <span style={{ color: active === 'after' ? 'var(--accent-light)' : undefined }}>after</span> · now: <b style={{ color: 'var(--text-primary)' }}>{active === 'before' ? 'Before (original)' : 'After (master)'}</b></span>{busy && <span style={{ color: 'var(--accent-light)' }}>measuring…</span>}
        </div>
        <Row name="Loudness (integrated)" before={before?.integrated} after={after?.integrated} unit="LUFS"
          title="Integrated loudness after ITU-R BS.1770 / EBU R128: what streaming services measure" />
        <Row name="True peak" before={before?.truePeak} after={after?.truePeak} unit="dBTP" warn={(after?.truePeak ?? -99) > -0.95} warnBefore={(before?.truePeak ?? -99) > -0.95}
          title="The highest peak, also between samples (4x oversampled). Above −1 dBTP a lossy file (MP3, AAC) can distort." />
        <Row name="Sample peak" before={before?.samplePeak} after={after?.samplePeak} unit="dBFS" />
        <Row name="Loudness range" before={before?.range} after={after?.range} unit="LU" title="How much the loudness changes over the song (EBU Tech 3342)" />
        <Row name="RMS" before={before?.rms} after={after?.rms} unit="dBFS" />
        <Row name="Crest factor" before={before?.crest} after={after?.crest} unit="dB" title="Peak to RMS: lower means more compressed" />
        <Row name="Short-term max" before={before?.shortTermMax} after={after?.shortTermMax} unit="LUFS" />
        <Row name="Clipping" before={before?.clips.length} after={after?.clips.length} unit="×" warn={(after?.clips.length ?? 0) > 0} warnBefore={(before?.clips.length ?? 0) > 0} title="Places where the waveform reaches 0 dBFS (red in the waveform)" />
        {after && Number.isFinite(after.integrated) && (
          <div style={{ fontSize: 11, color: Math.abs(after.integrated - target) <= 0.5 ? 'var(--green)' : 'var(--text-secondary)' }}>
            Target {target} LUFS (master): {Math.abs(after.integrated - target) <= 0.5 ? 'reached' : `${after.integrated > target ? '+' : ''}${(after.integrated - target).toFixed(1)} LU`}
          </div>
        )}
      </div>
      <div style={box}>
        <div style={label}>Live, real level {masterPlayer.bypass ? '(before)' : '(after)'}</div>
        <Bar value={live ? r!.momentary : -Infinity} min={-40} max={0} color="var(--accent)" text={`M ${fmt(live ? r!.momentary : undefined)} LUFS`} />
        <Bar value={live ? r!.shortTerm : -Infinity} min={-40} max={0} color="var(--accent-light)" text={`S ${fmt(live ? r!.shortTerm : undefined)} LUFS`} />
        <Bar value={live ? r!.truePeak : -Infinity} min={-30} max={0} color={live && r!.truePeak > -1 ? 'var(--red)' : 'var(--green)'} text={`TP ${fmt(live ? r!.truePeak : undefined)} (max ${fmt(r?.truePeakMax)}) dBTP`} />
        <Bar value={live ? r!.rms : -Infinity} min={-40} max={0} color="var(--teal)" text={`RMS ${fmt(live ? r!.rms : undefined)} dB`} />
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Integrated since play: <b>{fmt(r?.integrated)}</b> LUFS</div>
        <div style={label}>Gain reduction</div>
        <Bar value={-limDb} min={0} max={12} color="var(--orange)" text={`Limiter ${fmt(limDb)} dB`} />
        <Bar value={red.comp} min={0} max={12} color="var(--yellow)" text={`Compressor −${fmt(red.comp)} dB`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {red.bands.map((b, i) => <Bar key={i} value={b} min={0} max={12} color="var(--yellow)" text={`${['Low', 'Mid', 'High'][i]} −${fmt(b)}`} />)}
        </div>
        <div style={label}>Stereo correlation</div>
        <div style={{ position: 'relative', height: 14, background: 'linear-gradient(90deg, #7f1d1d, #3f3f46 50%, #14532d)', borderRadius: 3 }}>
          <div style={{ position: 'absolute', top: -2, bottom: -2, width: 3, background: '#fff', left: `calc(${((corr + 1) / 2) * 100}% - 1px)` }} />
          <span style={{ position: 'absolute', left: 4, fontSize: 9, lineHeight: '14px' }}>−1</span>
          <span style={{ position: 'absolute', right: 4, fontSize: 9, lineHeight: '14px' }}>+1 ({fmt(corr, 2)})</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 10 }}>
        <div style={box}><div style={label}>Goniometer</div><Goniometer /></div>
        <div style={box}><div style={label}>Spectrum <span style={{ color: '#9ca3af' }}>before</span> / <span style={{ color: 'var(--accent-light)' }}>after</span></div><Spectrum /></div>
      </div>
      <div style={box}>
        <div style={label}>Loudness over time (short-term) · <span style={{ color: '#9ca3af' }}>before</span> / <span style={{ color: 'var(--accent-light)' }}>after</span> · target</div>
        <History before={before} after={after} target={target} active={active} />
      </div>
    </div>
  )
}

function useAnimation(draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, H: number): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const cv = ref.current
      if (cv) {
        // the canvas takes the width of its box (style 100 %), never the other way round
        const W = Math.max(50, Math.floor(cv.clientWidth)), dpr = window.devicePixelRatio || 1
        if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px` }
        const g = cv.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        draw(g, W, H)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw, H])
  return ref
}

const goniBufs = { l: new Float32Array(1024), r: new Float32Array(1024) }
const drawGonio = (g: CanvasRenderingContext2D, W: number, H: number): void => {
  g.fillStyle = '#121317'; g.fillRect(0, 0, W, H)
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) / 2 - 4
  g.strokeStyle = 'rgba(255,255,255,0.1)'
  g.beginPath(); g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad); g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy); g.stroke()
  if (!masterPlayer.playing || !masterPlayer.goniL) return
  masterPlayer.goniL.getFloatTimeDomainData(goniBufs.l); masterPlayer.goniR!.getFloatTimeDomainData(goniBufs.r)
  g.fillStyle = 'rgba(157,95,248,0.6)'
  for (let i = 0; i < 1024; i++) {
    const l = goniBufs.l[i], r = goniBufs.r[i]
    const x = (r - l) * 0.7071, y = (l + r) * 0.7071          // M up, S sideways
    g.fillRect(cx + x * rad, cy - y * rad, 1.2, 1.2)
  }
}
function Goniometer(): React.ReactElement { return <canvas ref={useAnimation(drawGonio, 130)} style={{ width: '100%', display: 'block' }} /> }

const specBufs = { pre: new Float32Array(4096), post: new Float32Array(4096) }
const drawSpectrum = (g: CanvasRenderingContext2D, W: number, H: number): void => {
  g.fillStyle = '#121317'; g.fillRect(0, 0, W, H)
  const sr = masterPlayer.ctx?.sampleRate ?? 48000
  const fx = (f: number): number => (Math.log10(f / 20) / Math.log10(20000 / 20)) * W
  g.font = '9px system-ui'
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(fx(f), 0, 1, H)
    g.fillStyle = '#6b7280'; g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, fx(f) + 2, H - 2)
  }
  if (!masterPlayer.playing || !masterPlayer.preAnalyser) return
  const draw = (an: AnalyserNode, buf: Float32Array<ArrayBuffer>, color: string, fill: boolean): void => {
    an.getFloatFrequencyData(buf)
    const n = buf.length
    g.beginPath()
    let started = false
    for (let x = 0; x < W; x += 2) {
      const f = 20 * Math.pow(1000, x / W)
      const bin = Math.min(n - 1, Math.round((f / (sr / 2)) * n))
      // a little smoothing over neighbouring bins (wider at high frequencies)
      const w = Math.max(1, Math.round(bin / 40))
      let v = 0
      for (let k = Math.max(0, bin - w); k <= Math.min(n - 1, bin + w); k++) v += buf[k]
      v /= Math.min(n - 1, bin + w) - Math.max(0, bin - w) + 1
      const y = H - ((v + 100) / 90) * H
      if (!started) { g.moveTo(x, y); started = true } else g.lineTo(x, y)
    }
    if (fill) { g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = color; g.fill() } else { g.strokeStyle = color; g.lineWidth = 1.5; g.stroke() }
  }
  if (side === 'after') {
    draw(masterPlayer.preAnalyser, specBufs.pre, 'rgba(156,163,175,0.25)', true)
    draw(masterPlayer.postAnalyser!, specBufs.post, '#9d5ff8', false)
  } else {
    draw(masterPlayer.postAnalyser!, specBufs.post, 'rgba(157,95,248,0.18)', true)
    draw(masterPlayer.preAnalyser, specBufs.pre, '#d1d5db', false)
  }
}
function Spectrum(): React.ReactElement { return <canvas ref={useAnimation(drawSpectrum, 130)} style={{ width: '100%', display: 'block' }} /> }

function History({ before, after, target, active }: { before: Analysis | null; after: Analysis | null; target: number; active: 'before' | 'after' }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const W = Math.max(50, Math.floor(cv.clientWidth)), H = 90, dpr = window.devicePixelRatio || 1
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#121317'; g.fillRect(0, 0, W, H)
    const lo = -40, hi = 0
    const y = (v: number): number => H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * H
    g.fillStyle = '#6b7280'; g.font = '9px system-ui'
    for (const v of [-30, -20, -10]) { g.fillRect(0, y(v), W, 0.5); g.fillText(`${v}`, 2, y(v) - 2) }
    g.strokeStyle = 'rgba(34,197,94,0.7)'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(0, y(target)); g.lineTo(W, y(target)); g.stroke(); g.setLineDash([])
    const line = (a: Analysis | null, color: string, width = 1.5): void => {
      if (!a || a.history.length < 2) return
      g.strokeStyle = color; g.lineWidth = width; g.beginPath()
      a.history.forEach((v, i) => { const x = (i / (a.history.length - 1)) * W; if (i === 0) g.moveTo(x, y(v)); else g.lineTo(x, y(v)) })
      g.stroke()
    }
    if (active === 'after') { line(before, 'rgba(156,163,175,0.4)', 1); line(after, '#9d5ff8', 2.2) }
    else { line(after, 'rgba(157,95,248,0.35)', 1); line(before, '#e5e7eb', 2.2) }
  }, [before, after, target, active])
  return <canvas ref={ref} style={{ width: '100%', display: 'block' }} />
}
