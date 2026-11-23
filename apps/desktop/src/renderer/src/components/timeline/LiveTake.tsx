// The take that is being recorded: a red clip on the armed track that grows with the playhead and draws the input's
// level as it comes in (before, nothing showed until the recording stopped; user report).
import React, { useEffect, useRef } from 'react'
import { useAudioStore } from '../../stores/audio.store'
import { liveRecording } from '../../audio/engine'
import { tr } from '../../i18n/tr'

export function LiveTake({ trackId, beatWidth, height }: { trackId: string; beatWidth: number; height: number }): React.ReactElement | null {
  const recording = useAudioStore((s) => s.isRecording)
  const beat = useAudioStore((s) => s.currentBeat)
  useAudioStore((s) => s.recTick)
  const canvas = useRef<HTMLCanvasElement>(null)
  const rec = recording ? liveRecording() : null
  const mine = rec && rec.trackId === trackId
  const width = mine ? Math.max(0, (beat - rec.startBeat) * beatWidth) : 0
  const h = height - 12

  useEffect(() => {
    const c = canvas.current
    if (!c || !mine || width < 1) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.ceil(width)
    if (c.width !== Math.ceil(w * dpr)) c.width = Math.ceil(w * dpr)
    c.height = Math.ceil(h * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    g.fillStyle = 'rgba(254,202,202,0.9)'
    const pk = rec.peaks, mid = h / 2
    if (!pk.length) return
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * pk.length), b = Math.max(a + 1, Math.floor(((x + 1) / w) * pk.length))
      let m = 0
      for (let k = a; k < b && k < pk.length; k++) if (pk[k] > m) m = pk[k]
      const y = Math.max(0.5, m * (mid - 2))
      g.fillRect(x, mid - y, 1, y * 2)
    }
  })

  if (!mine) return null
  return (
    <div title={tr('Recording…')}
      style={{ position: 'absolute', left: rec.startBeat * beatWidth, top: 6, width, height: h, boxSizing: 'border-box', background: 'rgba(220,38,38,0.28)', border: '1px solid #ef4444', borderRadius: 4, overflow: 'hidden', pointerEvents: 'none', zIndex: 3 }}>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: Math.ceil(width), height: h }} />
      <span style={{ position: 'relative', fontSize: 11, fontWeight: 700, color: '#fff', padding: '2px 8px', whiteSpace: 'nowrap', textShadow: '0 1px 2px #000a', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />{tr('Recording…')}
      </span>
    </div>
  )
}
