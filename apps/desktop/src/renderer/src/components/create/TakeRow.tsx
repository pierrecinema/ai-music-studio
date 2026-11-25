// One take of the Create page, drawn like a take in a DAW: play button, name, length / seed, its waveform (click to
// play from there) and what can be done with it.
import React, { useEffect, useRef, useState } from 'react'
import { applyOutput } from '../../audio/output'
import { tr } from '../../i18n/tr'

const peaksCache = new Map<string, Float32Array>()

async function peaksOf(path: string, n = 600): Promise<Float32Array> {
  const hit = peaksCache.get(path)
  if (hit) return hit
  const buf = await window.api.fs.readFile(path)
  const ctx = new OfflineAudioContext(1, 1, 44100)
  const audio = await ctx.decodeAudioData(new Uint8Array(buf).buffer)
  const ch = audio.getChannelData(0)
  const out = new Float32Array(n)
  const per = Math.max(1, Math.floor(ch.length / n))
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let k = i * per, e = Math.min(ch.length, k + per); k < e; k += 4) { const v = Math.abs(ch[k]); if (v > m) m = v }
    out[i] = m
  }
  peaksCache.set(path, out)
  return out
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function TakeRow({ path, name, meta, actions }: {
  path: string; name: React.ReactNode; meta: string; actions: React.ReactNode
}): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    let u: string | null = null
    let alive = true
    window.api.fs.readFile(path).then((buf) => {
      if (!alive) return
      u = URL.createObjectURL(new Blob([new Uint8Array(buf)]))
      setUrl(u)
    }).catch(() => { /* shown as a flat line */ })
    peaksOf(path).then((p) => { if (alive) setPeaks(p) }).catch(() => { /* not decodable here */ })
    return () => { alive = false; if (u) URL.revokeObjectURL(u); audio.current?.pause() }
  }, [path])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.floor(w * dpr)); c.height = Math.floor(h * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6'
    const played = dur ? pos / dur : 0
    const mid = h / 2
    if (!peaks) { g.fillStyle = 'rgba(148,163,184,0.35)'; g.fillRect(0, mid, w, 1); return }
    for (let x = 0; x < w; x += 2) {
      const a = Math.floor((x / w) * peaks.length), b = Math.max(a + 1, Math.floor(((x + 2) / w) * peaks.length))
      let m = 0
      for (let k = a; k < b; k++) if (peaks[k] > m) m = peaks[k]
      const y = Math.max(1, m * (mid - 2))
      g.fillStyle = x / w <= played ? accent : 'rgba(148,163,184,0.45)'
      g.fillRect(x, mid - y, 1.4, y * 2)
    }
  }, [peaks, pos, dur])

  const ensureAudio = (): HTMLAudioElement | null => {
    if (!url) return null
    if (!audio.current) {
      const a = new Audio(url)
      void applyOutput(a)
      a.onloadedmetadata = () => setDur(a.duration)
      a.ontimeupdate = () => setPos(a.currentTime)
      a.onended = () => { setPlaying(false); setPos(0) }
      audio.current = a
    }
    return audio.current
  }
  const toggle = (): void => {
    const a = ensureAudio()
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { void a.play(); setPlaying(true) }
  }
  const seek = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const a = ensureAudio()
    if (!a) return
    const r = e.currentTarget.getBoundingClientRect()
    const go = () => { a.currentTime = ((e.clientX - r.left) / r.width) * (a.duration || 0); setPos(a.currentTime); void a.play(); setPlaying(true) }
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true })
  }

  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/ams-path', path); e.dataTransfer.effectAllowed = 'copy' }}
      style={{ display: 'grid', gridTemplateColumns: '30px minmax(150px, 220px) 1fr auto', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <button onClick={toggle} disabled={!url} title={playing ? tr('Pause') : tr('Play')}
        style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 11, display: 'grid', placeItems: 'center' }}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div style={{ minWidth: 0 }}>
        {name}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {dur ? `${mmss(pos)} / ${mmss(dur)} · ` : ''}{meta}
        </div>
      </div>
      <canvas ref={canvas} onClick={seek} title={tr('Click to play from here')}
        style={{ width: '100%', height: 34, background: '#0b0f14', borderRadius: 4, cursor: 'pointer' }} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{actions}</div>
    </div>
  )
}
