// The Mixer, built like the output section of a large-format console channel strip (owner's reference): a dark
// blue-grey strip, a fader with a white cap and a dB scale, two orange LED meters with a red / yellow / white scale,
// lit square buttons, the fader and peak values underneath and a pan knob at the bottom.
import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { masterLevel, trackLevel } from '../../audio/engine'
import { tr } from '../../i18n/tr'
import { MasterFxBar } from '../timeline/StudioLanes'

const C = {
  strip: 'linear-gradient(180deg, #34404d 0%, #2a333e 45%, #252d37 100%)',
  edge: '#1a2028',
  panel: '#1d242c',
  text: '#e8edf2',
  label: '#9aa7b4',
  scale: '#c9d2db',
  orange: '#ff8c1a',
  orangeOff: '#3a2a1c',
  red: '#ff4a3d',
  yellow: '#ffd23a',
  font: '"Inter", "Segoe UI", system-ui, sans-serif'
}

const gainToDb = (v: number): number => (v <= 0.00001 ? -Infinity : 20 * Math.log10(v))
const fmtDb = (db: number): string => (!isFinite(db) || db < -99 ? '-∞' : db.toFixed(1))

// fader travel: console-style, more room around 0 dB (position 0..1 from the bottom)
const FADER_DB: Array<[number, number]> = [[-Infinity, 0], [-60, 0.03], [-48, 0.1], [-36, 0.22], [-30, 0.3], [-24, 0.4], [-18, 0.52], [-12, 0.66], [-6, 0.82], [0, 1]]
function dbToPos(db: number): number {
  if (!isFinite(db)) return 0
  if (db >= 0) return 1
  for (let i = 1; i < FADER_DB.length; i++) {
    const [d1, p1] = FADER_DB[i], [d0, p0] = FADER_DB[i - 1]
    if (db <= d1) return isFinite(d0) ? p0 + ((db - d0) / (d1 - d0)) * (p1 - p0) : (db < -60 ? 0 : p1)
  }
  return 1
}
function posToDb(pos: number): number {
  if (pos <= 0.005) return -Infinity
  for (let i = 1; i < FADER_DB.length; i++) {
    const [d1, p1] = FADER_DB[i], [d0, p0] = FADER_DB[i - 1]
    if (pos <= p1) return isFinite(d0) ? d0 + ((pos - p0) / (p1 - p0)) * (d1 - d0) : -60 - (1 - pos / p1) * 40
  }
  return 0
}
const posToGain = (pos: number): number => { const db = posToDb(pos); return isFinite(db) ? Math.pow(10, db / 20) : 0 }

/** scale labels that do not overlap: from the top, a label is left out when it is closer than `gap` px to the last one */
function spaced<T extends [string, number, ...unknown[]]>(marks: T[], y: (db: number) => number, gap: number): T[] {
  const out: T[] = []
  let last = -Infinity
  for (const m of [...marks].sort((a, b) => y(a[1]) - y(b[1]))) {
    const at = y(m[1])
    if (at - last >= gap) { out.push(m); last = at }
  }
  return out
}

/** the fader: a dark slot, the dB scale on the left, a white cap; drag, wheel, double-click for 0 dB */
function Fader({ value, onChange, height = 220 }: { value: number; onChange: (v: number) => void; height?: number }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const pos = dbToPos(gainToDb(value))
  const CAP = 34
  const travel = height - CAP
  const drag = (e: React.PointerEvent): void => {
    const el = ref.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const startY = e.clientY, startPos = pos
    const fine = (ev: PointerEvent): number => (ev.shiftKey ? 0.25 : 1)
    const move = (ev: PointerEvent): void => onChange(posToGain(Math.max(0, Math.min(1, startPos - ((ev.clientY - startY) / travel) * fine(ev)))))
    const up = (): void => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const marks: Array<[string, number]> = [['0', 0], ['6', -6], ['12', -12], ['18', -18], ['24', -24], ['30', -30], ['36', -36], ['48', -48], ['∞', -Infinity]]
  return (
    <div style={{ display: 'flex', gap: 4, height }}>
      <div style={{ position: 'relative', width: 16, height }}>
        {spaced(marks, (db) => (1 - dbToPos(db)) * travel, 11).map(([l, db]) => (
          <span key={l} style={{ position: 'absolute', right: 0, top: CAP / 2 + (1 - dbToPos(db)) * travel - 6, fontSize: 9, color: C.scale, fontFamily: C.font, lineHeight: '12px' }}>{l}</span>
        ))}
      </div>
      <div ref={ref} onPointerDown={drag} onDoubleClick={() => onChange(1)} title={tr('Volume (double-click: 0 dB, Shift: fine)')}
        onWheel={(e) => onChange(posToGain(Math.max(0, Math.min(1, pos - Math.sign(e.deltaY) * 0.02))))}
        style={{ position: 'relative', width: 30, height, cursor: 'ns-resize', touchAction: 'none' }}>
        {/* slot */}
        <div style={{ position: 'absolute', left: 13, top: CAP / 2, width: 4, height: travel, background: '#0b0f13', borderRadius: 2, boxShadow: 'inset 0 1px 2px #000, 0 0 0 1px #3c4753' }} />
        {/* tick lines */}
        {marks.map(([l, db]) => <div key={l} style={{ position: 'absolute', left: 2, width: 8, height: 1, background: '#5a6673', top: CAP / 2 + (1 - dbToPos(db)) * travel }} />)}
        {/* cap */}
        <div style={{ position: 'absolute', left: 1, top: (1 - pos) * travel, width: 28, height: CAP, borderRadius: 3,
          background: 'linear-gradient(180deg, #ffffff 0%, #e4e7ea 28%, #b9bec4 50%, #e9ecef 72%, #c8cdd2 100%)',
          boxShadow: '0 3px 6px rgba(0,0,0,0.6), inset 0 1px 0 #fff' }}>
          <div style={{ position: 'absolute', left: 3, right: 3, top: CAP / 2 - 1, height: 2, background: '#30363d' }} />
          {[7, 11, CAP - 12, CAP - 8].map((y) => <div key={y} style={{ position: 'absolute', left: 5, right: 5, top: y, height: 1, background: 'rgba(0,0,0,0.18)' }} />)}
        </div>
      </div>
    </div>
  )
}

// LED meter scale (dBFS) like the reference: red at the top, yellow, then white
const SEGS = 26
const SCALE: Array<[string, number, string, boolean?]> = [['0', 0, C.red], ['3', -3, C.red, true], ['6', -6, C.yellow], ['9', -9, C.yellow, true], ['12', -12, C.scale], ['18', -18, C.scale], ['24', -24, C.scale], ['30', -30, C.scale], ['40', -40, C.scale], ['50', -50, C.scale, true]]
const segDb = (i: number): number => -52 + (i / (SEGS - 1)) * 52           // segment i (0 = bottom) lights from this level
const levelPos = (db: number): number => Math.max(0, Math.min(1, (db + 52) / 52))

/** two orange LED columns with the scale on the right, and the held peak in dB under it */
function LedMeter({ read, height = 220, peakRef }: { read: () => number; height?: number; peakRef?: React.RefObject<HTMLSpanElement> }): React.ReactElement {
  const cols = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const isPlaying = useAudioStore((s) => s.isPlaying)
  useEffect(() => {
    let raf = 0, level = 0, held = -Infinity, heldAt = 0, shown = ''
    const loop = (t: number): void => {
      const now = isPlaying ? read() : 0
      level = Math.max(now, level * 0.9)
      const db = gainToDb(level)
      const ndb = gainToDb(now)
      if (ndb >= held || t - heldAt > 1500) { held = isFinite(ndb) ? ndb : (t - heldAt > 1500 ? -Infinity : held); heldAt = t }
      const lit = Math.round(levelPos(db) * SEGS)
      const holdSeg = isFinite(held) ? Math.min(SEGS - 1, Math.round(levelPos(held) * SEGS) - 1) : -1
      for (const c of cols) {
        const el = c.current
        if (!el) continue
        for (let i = 0; i < SEGS; i++) {
          const seg = el.children[SEGS - 1 - i] as HTMLElement
          const on = i < lit || i === holdSeg
          const col = segDb(i) > -3 ? C.red : segDb(i) > -10 ? C.yellow : C.orange
          seg.style.background = on ? col : C.orangeOff
          seg.style.boxShadow = on ? `0 0 4px ${col}` : 'none'
        }
      }
      const text = fmtDb(held)
      if (peakRef?.current && text !== shown) { peakRef.current.textContent = text; shown = text }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, read, peakRef])
  const segH = (height - 4) / SEGS
  return (
    <div style={{ display: 'flex', gap: 3, height, padding: 2, background: '#0c1014', borderRadius: 3, boxShadow: 'inset 0 1px 3px #000, 0 0 0 1px #3c4753' }}>
      {cols.map((r, k) => (
        <div key={k} ref={r} style={{ display: 'flex', flexDirection: 'column', gap: 1, width: 7 }}>
          {Array.from({ length: SEGS }, (_, i) => <div key={i} style={{ height: segH - 1, borderRadius: 1, background: C.orangeOff }} />)}
        </div>
      ))}
      <div style={{ position: 'relative', width: 14 }}>
        {spaced(SCALE, (db) => (1 - levelPos(db)) * (height - 4), 10).map(([l, db, col]) => (
          <span key={l} style={{ position: 'absolute', left: 2, top: (1 - levelPos(db)) * (height - 4) - 5, fontSize: 8, fontWeight: 700, color: col, fontFamily: C.font, lineHeight: '10px' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

/** a square console button: grey cap, lit when on */
function Key({ label, on, color, onClick, title }: { label: string; on: boolean; color: string; onClick: () => void; title: string }): React.ReactElement {
  return (
    <button onClick={onClick} title={title} style={{ width: 24, height: 20, padding: 0, borderRadius: 2, cursor: 'pointer', fontSize: 9, fontWeight: 800, fontFamily: C.font,
      border: '1px solid #11161b', color: on ? '#14181d' : '#c9d2db',
      background: on ? `linear-gradient(180deg, ${color}, ${color}cc)` : 'linear-gradient(180deg, #59646f, #3e4751)',
      boxShadow: on ? `0 0 8px ${color}99, inset 0 1px 0 rgba(255,255,255,0.5)` : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px #000' }}>{label}</button>
  )
}

/** the pan knob: a black knurled knob with a white line, L / C / R around it */
function PanKnob({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const angle = value * 135
  const drag = (e: React.PointerEvent): void => {
    const el = ref.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    // drag up / right = right, down / left = left (owner: dragging sideways did nothing)
    const x0 = e.clientX, y0 = e.clientY, v0 = value
    const move = (ev: PointerEvent): void => onChange(Math.max(-1, Math.min(1, Math.round((v0 + ((ev.clientX - x0) - (ev.clientY - y0)) / 80) * 100) / 100)))
    const up = (): void => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ position: 'relative', width: 52, height: 40 }}>
        <span style={{ position: 'absolute', left: 0, bottom: 0, fontSize: 8, color: C.label, fontWeight: 700 }}>L</span>
        <span style={{ position: 'absolute', left: 23, top: -2, fontSize: 8, color: C.label, fontWeight: 700 }}>C</span>
        <span style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 8, color: C.label, fontWeight: 700 }}>R</span>
        <div ref={ref} onPointerDown={drag} onDoubleClick={() => onChange(0)} title={tr('Pan: drag sideways or up / down, mouse wheel (double-click: center)')}
          onWheel={(e) => onChange(Math.max(-1, Math.min(1, Math.round((value - Math.sign(e.deltaY) * 0.05) * 100) / 100)))}
          style={{ position: 'absolute', left: 10, top: 8, width: 32, height: 32, borderRadius: '50%', cursor: 'grab', touchAction: 'none',
            background: 'radial-gradient(circle at 35% 30%, #4a4f55 0%, #1c1f23 55%, #0b0d0f 100%)',
            boxShadow: '0 3px 6px rgba(0,0,0,0.7), 0 0 0 2px #0e1114, inset 0 1px 1px rgba(255,255,255,0.15)', transform: `rotate(${angle}deg)` }}>
          <div style={{ position: 'absolute', left: 15, top: 3, width: 2, height: 11, background: '#f2f4f6', borderRadius: 1 }} />
        </div>
      </div>
      <span style={{ fontSize: 9, color: C.text, fontFamily: C.font }}>{value === 0 ? 'C' : value > 0 ? `R${Math.round(value * 100)}` : `L${Math.round(-value * 100)}`}</span>
    </div>
  )
}

function Strip({ name, color, volume, setVolume, read, pan, setPan, muted, soloed, onMute, onSolo, master = false, height }: {
  height: number; name: string; color: string; volume: number; setVolume: (v: number) => void; read: () => number
  pan?: number; setPan?: (v: number) => void; muted?: boolean; soloed?: boolean; onMute?: () => void; onSolo?: () => void; master?: boolean
}): React.ReactElement {
  const peak = useRef<HTMLSpanElement>(null)
  return (
    <div style={{ width: master ? 112 : 100, flexShrink: 0, background: C.strip, borderRadius: 4, border: `1px solid ${C.edge}`,
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.06), 0 6px 14px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'stretch', fontFamily: C.font, overflow: 'hidden' }}>
      <div style={{ height: 4, background: color }} />
      <div title={name} style={{ padding: '6px 6px 4px', color: C.text, fontSize: master ? 12.5 : 11.5, fontWeight: master ? 800 : 600, fontStyle: master ? 'normal' : 'italic',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: master ? '0.12em' : 0 }}>{name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px 6px' }}>
        <span style={{ fontSize: 8, color: C.label, fontWeight: 700, letterSpacing: '0.04em' }}>{tr('OUTPUT')}</span>
        {!master && <div style={{ display: 'flex', gap: 3 }}>
          <Key label="M" on={!!muted} color="#ffb020" onClick={onMute!} title={tr('Mute')} />
          <Key label="S" on={!!soloed} color="#5ee36a" onClick={onSolo!} title={tr('Solo')} />
        </div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 4px 6px', background: 'rgba(0,0,0,0.12)', borderTop: '1px solid rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Fader value={volume} onChange={setVolume} height={height} />
        <LedMeter read={read} peakRef={peak} height={height} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 6px', fontSize: 10.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        <span title={tr('Fader (dB)')}>{fmtDb(gainToDb(volume))}</span>
        <span ref={peak} title={tr('Peak (dB)')} style={{ color: C.orange }}>-∞</span>
      </div>
      <div style={{ padding: '4px 0 8px', display: 'flex', justifyContent: 'center', minHeight: 60, background: C.panel, borderTop: '1px solid #11161b' }}>
        {setPan ? <PanKnob value={pan ?? 0} onChange={setPan} /> : <span style={{ alignSelf: 'center', fontSize: 9, color: C.label, letterSpacing: '0.1em' }}>STEREO</span>}
      </div>
    </div>
  )
}

export function Mixer(): React.ReactElement {
  const tracks = useProjectStore((s) => s.project.tracks)
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  // the faders use the height there is (the Mixer is a panel under the Studio or a whole page)
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(260)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(Math.max(90, Math.min(360, el.clientHeight - 28 - 190))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(ellipse at 40% 0%, #20262d 0%, #121519 70%)' }}>
      <div ref={box} style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'auto', padding: 14, gap: 6, alignItems: 'flex-start' }}>
        {tracks.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
            {tr('No tracks yet. Add tracks in the Studio.')}
          </div>
        )}
        {tracks.map((track) => (
          <Strip key={track.id} height={h} name={track.name} color={track.color} volume={track.volume} read={() => trackLevel(track.id)}
            setVolume={(v) => updateTrack(track.id, { volume: Math.min(1, v) })}
            pan={track.pan} setPan={(v) => updateTrack(track.id, { pan: v })}
            muted={track.muted} soloed={track.soloed}
            onMute={() => updateTrack(track.id, { muted: !track.muted })} onSolo={() => updateTrack(track.id, { soloed: !track.soloed })} />
        ))}
        <div style={{ width: 10, flexShrink: 0 }} />
        <Strip master height={h} name={tr('MASTER')} color="#c9d2db" volume={masterVolume} setVolume={(v) => setMasterVolume(Math.min(1, v))} read={masterLevel} />
      </div>
      <MasterFxBar />
    </div>
  )
}
