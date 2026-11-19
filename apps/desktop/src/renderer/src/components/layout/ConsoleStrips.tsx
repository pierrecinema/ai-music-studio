// The mixing desk of the Analog console look: one strip per track along the bottom of the Studio, with a VU meter
// (a needle), a pan knob, a fader and mute / solo, and the master at the right. The same settings as the Mixer.
import React, { useEffect, useRef } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { masterLevel, trackLevel } from '../../audio/engine'
import { Knob } from '../mastering/MasterRack'
import { tr } from '../../i18n/tr'

// a VU meter: the needle follows the level slowly (about 300 ms, like a real VU), -20 dB left, +3 dB right
function Vu({ read }: { read: () => number }): React.ReactElement {
  const needle = useRef<SVGLineElement>(null)
  useEffect(() => {
    let raf = 0, pos = 0, last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const v = read()
      const db = v > 0 ? 20 * Math.log10(v) : -60
      const target = Math.max(0, Math.min(1, (db + 20) / 23))
      pos += (target - pos) * Math.min(1, dt / 0.3)
      const a = (-50 + pos * 100) * (Math.PI / 180)
      needle.current?.setAttribute('x2', String(40 + Math.sin(a) * 30))
      needle.current?.setAttribute('y2', String(40 - Math.cos(a) * 30))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [read])
  const mark = (db: number): number => ((-50 + ((db + 20) / 23) * 100) * Math.PI) / 180
  return (
    <svg width={80} height={46} viewBox="0 0 80 46" style={{ background: 'radial-gradient(ellipse at 50% 100%, #f7e3b0, #e0bf7a)', borderRadius: 3, boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.6)' }}>
      {[-20, -10, -7, -5, -3, 0, 3].map((db) => {
        const a = mark(db)
        return <line key={db} x1={40 + Math.sin(a) * 26} y1={40 - Math.cos(a) * 26} x2={40 + Math.sin(a) * 33} y2={40 - Math.cos(a) * 33} stroke={db >= 0 ? '#b3261e' : '#3a2a14'} strokeWidth={db === 0 ? 1.6 : 1} />
      })}
      <path d={`M${40 + Math.sin(mark(0)) * 33},${40 - Math.cos(mark(0)) * 33} A33,33 0 0 1 ${40 + Math.sin(mark(3)) * 33},${40 - Math.cos(mark(3)) * 33}`} stroke="#b3261e" strokeWidth={2.5} fill="none" />
      <text x={40} y={30} textAnchor="middle" fontSize={7} fill="#3a2a14" fontFamily="Georgia, serif">VU</text>
      <line ref={needle} x1={40} y1={40} x2={10} y2={22} stroke="#1a120a" strokeWidth={1.2} />
      <circle cx={40} cy={40} r={3} fill="#1a120a" />
    </svg>
  )
}

const btn = (on: boolean, color: string): React.CSSProperties => ({
  width: 24, height: 18, fontSize: 9, fontWeight: 700, border: '1px solid #000', borderRadius: 3, cursor: 'pointer',
  background: on ? color : 'radial-gradient(circle at 40% 30%, #5a4a3a, #1a140f)', color: on ? '#1d1813' : '#f0c674'
})

function Strip({ name, color, read, volume, onVolume, pan, onPan, mute, solo, master }: {
  name: string; color: string; read: () => number; volume: number; onVolume: (v: number) => void
  pan?: number; onPan?: (v: number) => void; mute?: [boolean, () => void]; solo?: [boolean, () => void]; master?: boolean
}): React.ReactElement {
  const db = volume <= 0.0005 ? '-∞' : (20 * Math.log10(volume)).toFixed(1)
  return (
    <div className="console-strip" style={{ width: 92, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px',
      background: master ? 'linear-gradient(#3a2a1a, #23180e)' : 'linear-gradient(#2e251c, #1d1813)', borderLeft: '1px solid #000', borderRight: '1px solid #4a3b2a', borderTop: `3px solid ${color}` }}>
      <Vu read={read} />
      {onPan ? <div style={{ transform: 'scale(0.62)', margin: '-14px 0 -16px' }}><Knob name={tr('Pan')} value={pan ?? 0} min={-1} max={1} step={0.01} onChange={onPan} title={tr('Pan (double-click: centre)')} /></div>
        : <div style={{ height: 50 }} />}
      <div style={{ display: 'flex', gap: 3 }}>
        {mute && <button style={btn(mute[0], '#f0c674')} onClick={mute[1]} title={tr('Mute')}>M</button>}
        {solo && <button style={btn(solo[0], '#ffb347')} onClick={solo[1]} title={tr('Solo')}>S</button>}
      </div>
      <input type="range" min={0} max={master ? 1 : 1.5} step={0.01} value={volume} onChange={(e) => onVolume(Number(e.target.value))}
        onDoubleClick={() => onVolume(master ? 0.8 : 1)} title={tr('Volume (double-click: reset)')}
        style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 64, accentColor: '#f0c674' }} />
      <span style={{ fontSize: 9, color: '#b8a88a', fontFamily: 'Consolas, monospace' }}>{db} dB</span>
      <span title={name} style={{ fontSize: 11, color: '#f0c674', fontFamily: 'Georgia, serif', maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#0d0b08', padding: '1px 6px', borderRadius: 2, border: '1px solid #4a3b2a' }}>{name}</span>
    </div>
  )
}

export function ConsoleStrips(): React.ReactElement {
  const tracks = useProjectStore((s) => s.project.tracks)
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  const reads = useRef(new Map<string, () => number>())
  const readOf = (id: string): (() => number) => {
    let r = reads.current.get(id)
    if (!r) { r = () => trackLevel(id); reads.current.set(id, r) }
    return r
  }
  return (
    <div className="console-desk" style={{ display: 'flex', height: 246, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', background: '#140f0a', borderTop: '3px solid #120e0a', boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)' }}>
      {tracks.map((t) => (
        <Strip key={t.id} name={t.name} color={t.color} read={readOf(t.id)} volume={t.volume} onVolume={(v) => updateTrack(t.id, { volume: v })}
          pan={t.pan} onPan={(v) => updateTrack(t.id, { pan: Math.abs(v) < 0.02 ? 0 : v })}
          mute={[t.muted, () => updateTrack(t.id, { muted: !t.muted })]} solo={[t.soloed, () => updateTrack(t.id, { soloed: !t.soloed })]} />
      ))}
      {!tracks.length && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a7a60', fontFamily: 'Georgia, serif', fontSize: 13 }}>{tr('No tracks yet. Add tracks in the Studio.')}</div>}
      <div style={{ flex: tracks.length ? 1 : 0 }} />
      <Strip name={tr('MASTER')} color="#f0c674" read={masterLevel} volume={masterVolume} onVolume={setMasterVolume} master />
    </div>
  )
}
