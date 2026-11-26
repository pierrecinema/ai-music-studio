// The Mixer, built like the output section of a large-format console channel strip (owner's reference): a dark
// blue-grey strip, a fader with a white cap and a dB scale, two orange LED meters with a red / yellow / white scale,
// lit square buttons, the fader and peak values underneath and a pan knob at the bottom.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { masterLevel, trackLevel } from '../../audio/engine'
import { tr } from '../../i18n/tr'
import { MasterFxBar } from '../timeline/StudioLanes'
import { useUIStore } from '../../stores/ui.store'
import { applySuggestion, contribution, db as toDb, measureMix, suggest, type MixReport, type MixSuggestion } from '../../audio/mixAssist'
import { trf } from '../../i18n/tr'
import type { ReturnTrack, Track } from '../../types'

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
        onWheel={(e) => { e.stopPropagation(); onChange(posToGain(Math.max(0, Math.min(1, pos - Math.sign(e.deltaY) * 0.02)))) }}
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
          onWheel={(e) => { e.stopPropagation(); onChange(Math.max(-1, Math.min(1, Math.round((value - Math.sign(e.deltaY) * 0.05) * 100) / 100))) }}
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

// The Mixer (0.99.13): a card for every track (name, type, M S, fader with LED meter, pan, the sends, the effects,
// where it goes), the master with the loudness, the returns, and the mix assistant that measures the mix and
// suggests what to change (owner's choice of five layouts).

const lbl: React.CSSProperties = { fontSize: 9, color: C.label, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }
const panText = (v: number): string => (Math.abs(v) < 0.01 ? 'C' : v > 0 ? `R${Math.round(v * 100)}` : `L${Math.round(-v * 100)}`)

function Card({ track, height, returns, hints, groupName }: { track: Track; height: number; returns: ReturnTrack[]; hints: MixSuggestion[]; groupName?: string }): React.ReactElement {
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const setSend = useProjectStore((s) => s.setSend)
  const peak = useRef<HTMLSpanElement>(null)
  const fx = track.fx ?? []
  return (
    <div style={{ width: 118, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.edge}`, background: `linear-gradient(180deg, ${track.color}2e 0%, #232b35 36%, #1d242c 100%)`,
      boxShadow: '0 6px 14px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', fontFamily: C.font, overflow: 'hidden', opacity: track.muted ? 0.6 : 1 }}>
      <div style={{ height: 4, background: track.color }} />
      <div title={track.name} style={{ padding: '7px 8px 0', color: track.color, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
      <div style={{ padding: '0 8px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={lbl}>{track.type === 'midi' ? 'MIDI' : track.type === 'audio' ? 'Audio' : tr(track.type)}</span>
        <span style={{ flex: 1 }} />
        <Key label="M" on={track.muted} color="#ffb020" onClick={() => updateTrack(track.id, { muted: !track.muted })} title={tr('Mute: this track is not heard')} />
        <Key label="S" on={track.soloed} color="#5ee36a" onClick={() => updateTrack(track.id, { soloed: !track.soloed })} title={tr('Solo: only this track is heard')} />
      </div>
      <div style={{ height: 22, padding: '0 8px' }}>
        {hints.length > 0 && <span title={hints.map((h) => `${h.text}\n${h.why}`).join('\n\n')} style={{ display: 'inline-block', fontSize: 10, color: '#fde68a', border: '1px solid #a16207', borderRadius: 999, padding: '1px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠ {hints[0].text}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 4px 6px', background: 'rgba(0,0,0,0.14)', borderTop: '1px solid rgba(0,0,0,0.3)' }}>
        <Fader value={track.volume} onChange={(v) => updateTrack(track.id, { volume: Math.min(1, v) })} height={height} />
        <LedMeter read={() => trackLevel(track.id)} peakRef={peak} height={height} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '3px 6px', fontSize: 10.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        <span title={tr('Fader (dB)')}>{fmtDb(gainToDb(track.volume))}</span>
        <span ref={peak} title={tr('Peak (dB)')} style={{ color: C.orange }}>-∞</span>
      </div>
      <div style={{ padding: '2px 0 4px', display: 'flex', justifyContent: 'center', background: C.panel, borderTop: '1px solid #11161b' }}>
        <PanKnob value={track.pan ?? 0} onChange={(v) => updateTrack(track.id, { pan: v })} />
      </div>
      {returns.length > 0 && (
        <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 3, background: C.panel, borderTop: '1px solid #11161b' }} title={tr('Sends: how much of this track goes into the reverb or delay (after the fader)')}>
          {returns.map((r, k) => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: C.label }}>
              <span style={{ width: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.effect === 'reverb' ? tr('Reverb') : tr('Delay')} {String.fromCharCode(65 + k)}</span>
              <input type="range" min={0} max={1} step={0.01} value={track.sends?.[r.id] ?? 0} onChange={(e) => setSend(track.id, r.id, Number(e.target.value))} style={{ flex: 1, minWidth: 0, accentColor: '#0ea5e9', height: 12 }} />
            </label>
          ))}
        </div>
      )}
      <div style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4, background: C.panel, borderTop: '1px solid #11161b' }}>
        <button onClick={() => { useProjectStore.getState().selectTrack(track.id); updateTrack(track.id, { showFx: true }); useUIStore.getState().setActiveView('timeline') }}
          title={fx.length ? fx.map((f) => (f.type === 'vst' ? f.vst?.name ?? 'VST' : f.type)).join(' · ') + '\n' + tr('Open the effects in the Studio') : tr('No effects yet: open the Studio to add one')}
          style={{ fontSize: 10, fontFamily: C.font, padding: '2px 6px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${fx.length ? '#3a2f63' : '#2c3540'}`, background: fx.length ? '#1a1530' : 'transparent', color: fx.length ? '#ddd6fe' : C.label }}>
          {fx.length ? `FX · ${fx.length}` : `+ ${tr('Effect')}`}
        </button>
        <span title={tr('Where the sound of this track goes')} style={{ ...lbl, textAlign: 'center' }}>→ {groupName ?? tr('Master')}</span>
      </div>
    </div>
  )
}

/** the master: the same strip as before (fader, LED meter, peak) */
function MasterStrip({ height }: { height: number }): React.ReactElement {
  const masterVolume = useAudioStore((s) => s.masterVolume)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  const peak = useRef<HTMLSpanElement>(null)
  return (
    <div style={{ width: 112, flexShrink: 0, background: C.strip, borderRadius: 10, border: `1px solid ${C.edge}`, boxShadow: '0 6px 14px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', fontFamily: C.font, overflow: 'hidden' }}>
      <div style={{ height: 4, background: '#c9d2db' }} />
      <div style={{ padding: '7px 6px 6px', color: C.text, fontSize: 12.5, fontWeight: 800, textAlign: 'center', letterSpacing: '0.12em' }}>{tr('MASTER')}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 4px 6px', background: 'rgba(0,0,0,0.14)', borderTop: '1px solid rgba(0,0,0,0.3)' }}>
        <Fader value={masterVolume} onChange={(v) => setMasterVolume(Math.min(1, v))} height={height} />
        <LedMeter read={masterLevel} peakRef={peak} height={height} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 6px 8px', fontSize: 10.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        <span title={tr('Fader (dB)')}>{fmtDb(gainToDb(masterVolume))}</span>
        <span ref={peak} title={tr('Peak (dB)')} style={{ color: C.orange }}>-∞</span>
      </div>
    </div>
  )
}

const TARGETS: Array<[number, string]> = [[-14, 'Streaming (−14 LUFS)'], [-16, 'Podcast, quiet (−16 LUFS)'], [-9, 'Loud (−9 LUFS)'], [-23, 'Broadcast (−23 LUFS)']]
const box: React.CSSProperties = { background: '#1b222a', border: `1px solid ${C.edge}`, borderRadius: 10, padding: 12, fontFamily: C.font }

/** the loudness of the mix as measured by the assistant, against the target */
function Loudness({ mix, target, setTarget }: { mix: MixReport['mix']; target: number; setTarget: (t: number) => void }): React.ReactElement {
  const lufs = mix && isFinite(mix.lufs) ? mix.lufs : null
  const pos = (l: number): string => `${Math.max(0, Math.min(100, ((l + 30) / 24) * 100))}%`
  return (
    <div style={box} title={tr('The loudness of the whole mix (integrated, measured by the mix assistant). The marker is the target.')}>
      <div style={{ ...lbl, marginBottom: 6 }}>{tr('Master loudness')}</div>
      <div style={{ background: '#05080c', border: '1px solid #1f2a37', borderRadius: 7, padding: '6px 12px', color: '#7dd3fc', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 28 }}>
        {lufs === null ? '—' : lufs.toFixed(1)}<span style={{ fontSize: 12 }}> LUFS</span>
        {mix && <span style={{ fontSize: 11, color: C.label, marginLeft: 10 }}>{trf('{peak} dBTP', { peak: isFinite(mix.truePeak) ? mix.truePeak.toFixed(1) : '−∞' })}</span>}
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 4, marginTop: 10, background: 'linear-gradient(90deg, #22c55e 0 62%, #facc15 62% 85%, #ef4444 85%)', opacity: 0.85 }}>
        {lufs !== null && <div style={{ position: 'absolute', left: pos(lufs), top: -3, width: 4, height: 14, borderRadius: 2, background: '#fff', transform: 'translateX(-2px)' }} />}
        <div style={{ position: 'absolute', left: pos(target), top: -5, width: 2, height: 18, background: '#a78bfa', transform: 'translateX(-1px)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.label, marginTop: 4 }}><span>−30</span><span>{tr('target')} {target}</span><span>−6</span></div>
      <select value={target} onChange={(e) => setTarget(Number(e.target.value))} style={{ marginTop: 8, width: '100%', fontSize: 11 }} title={tr('The loudness you aim for (set in Mastering)')}>
        {TARGETS.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
      </select>
    </div>
  )
}

function Assistant({ report, busy, error, onAnalyse, suggestions, applied, onApply, onApplyAll }: {
  report: MixReport | null; busy: { text: string; pct: number } | null; error: string | null; onAnalyse: () => void
  suggestions: MixSuggestion[]; applied: Set<string>; onApply: (s: MixSuggestion) => void; onApplyAll: () => void
}): React.ReactElement {
  const open = suggestions.filter((s) => s.kind !== 'info' && !applied.has(s.id))
  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: '#c084fc' }}>✦</span>{tr('Mix assistant')}</div>
      <div style={{ fontSize: 11, color: C.label, lineHeight: 1.4 }}>{tr('It measures every track and the whole mix (without effects) and suggests what to change. Take a suggestion with one click; Ctrl+Z takes it back.')}</div>
      <button disabled={!!busy} onClick={onAnalyse} title={tr('Measures the first minute of the song, track by track')}
        style={{ border: 'none', borderRadius: 999, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', background: 'linear-gradient(90deg, #7c3aed, #db2777)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
        ✦ {report ? tr('Measure again') : tr('Measure my mix')}
      </button>
      {busy && <div><div style={{ fontSize: 11, color: C.text }}>{busy.text}</div><div style={{ height: 5, borderRadius: 3, background: '#0c1014', marginTop: 4, overflow: 'hidden' }}><div style={{ width: `${Math.max(4, busy.pct)}%`, height: '100%', background: 'linear-gradient(90deg, #7c3aed, #db2777)' }} /></div></div>}
      {error && <div style={{ fontSize: 11, color: '#fbbf24' }}>{error}</div>}
      {report && !busy && suggestions.length === 0 && <div style={{ fontSize: 12, color: '#86efac' }}>✓ {tr('The balance looks good: nothing to change.')}</div>}
      {suggestions.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 9px', borderRadius: 8, background: '#11161c', border: '1px solid #2a3340', opacity: applied.has(s.id) ? 0.55 : 1 }}>
          <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{s.kind === 'info' ? 'ⓘ ' : ''}{s.text}</span>
          <span style={{ fontSize: 10.5, color: C.label, lineHeight: 1.35 }}>{s.why}</span>
          {s.kind !== 'info' && <button disabled={applied.has(s.id)} onClick={() => onApply(s)} style={{ alignSelf: 'flex-start', fontSize: 11, padding: '2px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid #ffffff44', background: 'transparent', color: '#fff' }}>{applied.has(s.id) ? `✓ ${tr('done')}` : tr('Do it')}</button>}
        </div>
      ))}
      {open.length > 1 && <button onClick={onApplyAll} style={{ border: 'none', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#22c55e', color: '#fff' }}>✦ {tr('Balance the whole mix')}</button>}
      {report && <div style={{ fontSize: 10, color: C.label }}>{trf('Measured: the first {s} s, without effects and sends.', { s: Math.round(report.seconds) })}</div>}
    </div>
  )
}

function Returns(): React.ReactElement {
  const returns = useProjectStore((s) => s.project.returns ?? [])
  const { addReturn, updateReturn, removeReturn } = useProjectStore.getState()
  return (
    <div style={box}>
      <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 6 }}>{tr('Returns')}<span style={{ flex: 1 }} />
        <button onClick={() => addReturn('reverb')} title={tr('A reverb that many tracks share through their send knobs')} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, cursor: 'pointer', border: '1px solid #ffffff44', background: 'transparent', color: C.text }}>+ {tr('Reverb')}</button>
        <button onClick={() => addReturn('delay')} title={tr('A delay that many tracks share through their send knobs')} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, cursor: 'pointer', border: '1px solid #ffffff44', background: 'transparent', color: C.text }}>+ {tr('Delay')}</button>
      </div>
      {returns.length === 0 && <div style={{ fontSize: 11, color: C.label, marginTop: 6 }}>{tr('No returns yet: add a reverb or a delay, then turn up the send knob of a track.')}</div>}
      {returns.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
          <span style={{ width: 48, fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
          <input type="range" min={0} max={1} step={0.01} value={r.volume} onChange={(e) => updateReturn(r.id, { volume: Number(e.target.value) })} title={tr('Level of the return')} style={{ flex: 1, minWidth: 0, accentColor: '#0ea5e9' }} />
          <span style={{ width: 34, fontSize: 10, color: C.label, textAlign: 'right' }}>{fmtDb(gainToDb(r.volume))}</span>
          <Key label="M" on={r.muted} color="#ffb020" onClick={() => updateReturn(r.id, { muted: !r.muted })} title={tr('Mute')} />
          <button onClick={() => removeReturn(r.id)} title={tr('Remove this return')} style={{ border: 'none', background: 'transparent', color: C.label, cursor: 'pointer', fontSize: 13 }}>×</button>
        </div>
      ))}
    </div>
  )
}

export function Mixer(): React.ReactElement {
  const tracks = useProjectStore((s) => s.project.tracks)
  const returns = useProjectStore((s) => s.project.returns ?? [])
  const box0 = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(240)
  useEffect(() => {
    const el = box0.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(Math.max(110, Math.min(380, el.clientHeight - 34 - (250 + returns.length * 20)))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [returns.length])

  const [report, setReport] = useState<MixReport | null>(null)
  const [busy, setBusy] = useState<{ text: string; pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState(() => { try { return Number(localStorage.getItem('ams-mix-target')) || -14 } catch { return -14 } })
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const say = (en: string, vars?: Record<string, string | number>): string => (vars ? trf(en, vars as Record<string, string | number>) : tr(en))
  const suggestions = useMemo(() => (report ? suggest(report.stats, report.mix, target, say) : []), [report, target])  // eslint-disable-line react-hooks/exhaustive-deps
  const analyse = async (): Promise<void> => {
    setError(null); setApplied(new Set()); setBusy({ text: tr('Starting…'), pct: 0 })
    try {
      const r = await measureMix(useProjectStore.getState().project, (text, pct) => setBusy({ text, pct }), say)
      setReport(r)
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }
  const choose = (t: number): void => { setTarget(t); try { localStorage.setItem('ams-mix-target', String(t)) } catch { /* storage unavailable */ } }
  const take = (s: MixSuggestion): void => { applySuggestion(s); setApplied((a) => new Set(a).add(s.id)) }
  const takeAll = (): void => { for (const s of suggestions) if (s.kind !== 'info' && !applied.has(s.id)) take(s) }
  const hintsOf = (id: string): MixSuggestion[] => suggestions.filter((s) => s.kind !== 'info' && !applied.has(s.id) && s.tracks.includes(id))
  void contribution; void toDb

  const shown = tracks.filter((t) => t.type !== 'group')
  const issues = suggestions.filter((s) => s.kind !== 'info' && !applied.has(s.id))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(ellipse at 40% 0%, #20262d 0%, #121519 70%)', fontFamily: C.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #11161b', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{tr('Mixer')}</span>
        <span style={{ fontSize: 11, color: C.label, border: '1px solid #2a3340', borderRadius: 999, padding: '2px 9px' }}>{trf('{n} tracks · {r} returns', { n: shown.length, r: returns.length })}</span>
        <span style={{ flex: 1 }} />
        {issues.length > 0 && <span style={{ fontSize: 11, color: '#fde68a', border: '1px solid #a16207', borderRadius: 999, padding: '2px 9px' }}>⚠ {issues.length === 1 ? tr('1 suggestion') : trf('{n} suggestions', { n: issues.length })}</span>}
        <button disabled={!!busy} onClick={issues.length > 1 ? takeAll : () => void analyse()} style={{ border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(90deg, #7c3aed, #db2777)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
          ✦ {issues.length > 1 ? tr('Balance the whole mix') : tr('Measure my mix')}
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* the tracks scroll sideways (scroll bar, or the mouse wheel over the cards); the master stays next to them */}
        <div ref={box0} className="mixer-scroll" onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY }}
          style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', padding: '14px 10px 8px 14px', gap: 8, alignItems: 'flex-start' }}>
          {shown.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>{tr('No tracks yet. Add tracks in the Studio.')}</div>
          )}
          {shown.map((t) => (
            <Card key={t.id} track={t} height={h} returns={returns} hints={hintsOf(t.id)} groupName={tracks.find((g) => g.id === t.parentId)?.name} />
          ))}
        </div>
        <div style={{ flexShrink: 0, padding: '14px 10px 8px 6px' }}><MasterStrip height={h} /></div>
        <div style={{ width: 268, flexShrink: 0, padding: '14px 14px 8px 4px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <Loudness mix={report?.mix ?? null} target={target} setTarget={choose} />
          <Assistant report={report} busy={busy} error={error} onAnalyse={() => void analyse()} suggestions={suggestions} applied={applied} onApply={take} onApplyAll={takeAll} />
          <Returns />
        </div>
      </div>
      <MasterFxBar />
    </div>
  )
}
