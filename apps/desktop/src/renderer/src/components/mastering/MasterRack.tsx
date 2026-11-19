import { usePluginsStore } from '../../stores/plugins.store'
import { onVstChange, showVstEditor, vstFailure } from '../../audio/vst/host'
import { masterPlayer } from '../../audio/master/player'
import type { VstRef } from '../../types'
import { isInstrumentLike } from '../../audio/vst/host'
import React, { useState } from 'react'
import { SLOT_LABEL, TARGETS, defaultChain, slotDefaults, type BandParams, type Chain, type Slot, type SlotType } from '../../audio/master/chain'
import { useMasteringStore } from '../../stores/mastering.store'
import { EqCurve } from './EqCurve'
import { tr, trf } from '../../i18n/tr'

// The processing chain: slots that can be switched off, moved and removed, each with its controls; the limiter with
// the "Louder" control and the loudness target at the end; presets.

const card: React.CSSProperties = { background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10 }
const small: React.CSSProperties = { fontSize: 10, padding: '1px 7px' }
const grp: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 2, padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.03)' }

// "Before" (the original) shows every control at its starting value, read-only; "After" shows the settings and
// marks each control that was moved (purple name, dot)
export const RackView = React.createContext<'before' | 'after'>('after')

const KA0 = -135, KA1 = 135                       // the knob turns from -135° to +135°
const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [34 + r * Math.cos(a), 34 + r * Math.sin(a)]
}
// a row of knobs that wraps on narrow windows
const knobs: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '6px 4px', alignItems: 'flex-start' }

// a round knob like on a mastering unit: a dark knob with a ring of lights showing the value.
// Drag up / down (Shift: fine), mouse wheel, arrow keys; double-click: back to the starting value.
export function Knob({ name, value: setValue, min, max, step, unit, onChange, log, title, off: setOff, refv }: {
  name: string; value: number; min: number; max: number; step: number; unit?: string
  onChange: (v: number) => void; log?: boolean; title?: string; off?: boolean; refv?: number
}): React.ReactElement {
  const view = React.useContext(RackView)
  const before = view === 'before' && refv !== undefined
  const value = before ? refv! : setValue
  const changed = !before && refv !== undefined && Math.abs(setValue - refv) > 1e-6
  const off = before ? setOff !== undefined && (refv === min || refv === max) : setOff
  const toPos = (v: number): number => Math.max(0, Math.min(1, log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min)))
  const fromPos = (p: number): number => { p = Math.max(0, Math.min(1, p)); return log ? min * Math.pow(max / min, p) : min + p * (max - min) }
  const put = (p: number): void => { const v = fromPos(p); onChange(log ? Math.round(v) : Math.round(v / step) * step) }
  const shown = log ? (value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} k` : value.toFixed(0)) : value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)
  const pos = toPos(value)
  const ang = KA0 + pos * (KA1 - KA0)
  const drag = React.useRef<{ y: number; p: number } | null>(null)
  const lights = Array.from({ length: 21 }, (_, i) => {
    const t = KA0 + (i * (KA1 - KA0)) / 20
    const [x, y] = polar(29, t)
    const lit = !off && t <= ang + 0.01
    return <circle key={i} cx={x} cy={y} r={1.8} style={{ fill: lit ? (before ? '#8b8f99' : 'var(--accent-light)') : '#33363d', filter: lit && !before ? 'drop-shadow(0 0 2px var(--accent-light))' : undefined }} />
  })
  const [x1, y1] = polar(9, ang), [x2, y2] = polar(19, ang)
  return (
    <div title={title} tabIndex={before ? -1 : 0}
      onKeyDown={(e) => {
        if (before) return
        const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
        if (d) { e.preventDefault(); put(pos + d * (e.shiftKey ? 0.002 : 0.01)) }
      }}
      style={{ width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 11, color: 'var(--text-secondary)', opacity: before ? 0.7 : 1, outline: 'none' }}>
      <svg width={68} height={68} style={{ cursor: before ? 'default' : 'ns-resize', touchAction: 'none' }}
        onPointerDown={(e) => {
          if (before || e.button !== 0) return
          e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, p: pos }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          // 200 px of mouse travel turn the knob from one end to the other; Shift: 5 times finer
          const np = d.p + (d.y - e.clientY) / (e.shiftKey ? 1000 : 200)
          if (e.shiftKey) drag.current = { y: e.clientY, p: np }        // fine: go on from here
          put(np)
        }}
        onPointerUp={() => { drag.current = null }}
        onWheel={(e) => { if (!before) put(pos + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.002 : 0.01)) }}
        onDoubleClick={() => { if (!before && refv !== undefined) onChange(refv) }}>
        <defs>
          <radialGradient id="ams-knob-metal" cx="40%" cy="30%">
            <stop offset="0" stopColor="#4a4e58" /><stop offset="0.6" stopColor="#25272d" /><stop offset="1" stopColor="#16171a" />
          </radialGradient>
        </defs>
        {lights}
        <circle cx={34} cy={36} r={22} fill="#000" opacity={0.45} />
        <circle cx={34} cy={34} r={22} fill="url(#ams-knob-metal)" stroke="#0c0d0f" strokeWidth={1.5} />
        <circle cx={34} cy={34} r={17} fill="none" stroke="#3a3d45" strokeWidth={1} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: off ? '#6b7280' : before ? '#9ca3af' : 'color-mix(in srgb, var(--accent-light) 60%, white)' }} strokeWidth={3} strokeLinecap="round" />
      </svg>
      <span style={{ textAlign: 'center', lineHeight: 1.2, ...(changed ? { color: 'var(--accent-light)', fontWeight: 600 } : {}) }}>{name.trim()}{changed ? ' •' : ''}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{off ? tr('off') : `${shown}${unit ? ` ${unit}` : ''}`}</span>
    </div>
  )
}

// a VST plugin in the chain: its settings are in its own window
function VstSlotBody({ slot }: { slot: Extract<Slot, { type: 'vst' }> }): React.ReactElement {
  const [, tick] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => onVstChange(() => tick((n) => n + 1)), [])
  const ref = slot.p.vst
  if (!ref) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('No plugin chosen.')}</span>
  const failure = vstFailure(slot.id)
  const open = async (): Promise<void> => {
    setBusy(true)
    try { await showVstEditor({ id: slot.id, type: 'vst', on: slot.on, p: {}, vst: ref }, masterPlayer.ctx?.sampleRate ?? 48000, tr('Mastering')) }
    catch (e) { window.alert(trf('The plugin could not be opened: {m}', { m: (e as Error).message })) }
    setBusy(false)
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{ref.vendor ? `${ref.vendor} · ` : ''}{ref.format}{ref.arch === 'x86' ? ' · 32-bit' : ''}</span>
      <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={busy} onClick={() => void open()}>{busy ? tr('Loading…') : tr('Open the plugin window')}</button>
      {failure && <span style={{ color: 'var(--red)' }} title={failure}>⚠ {tr('not loaded: plays without it')}</span>}
      <span style={{ color: 'var(--text-muted)', width: '100%' }}>{tr('Its settings are in its own window. They are kept with this song and used in the export.')}</span>
    </div>
  )
}

function SlotBody({ slot, set }: { slot: Slot; set: (s: Slot) => void }): React.ReactElement {
  // the starting values of this kind of slot: "Before" shows them, "After" marks what differs from them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = slotDefaults(slot.type, slot.id).p as any
  const db = d.bands?.[0]
  const view = React.useContext(RackView)
  if (slot.type === 'eq') {
    const p = slot.p
    const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <EqCurve p={view === 'before' ? d : p} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, auto))', columnGap: 14, rowGap: 8 }}>
          {/* each filter's controls stay together */}
          <div style={grp}>
            <Knob name={tr('Low cut')} off={!p.lowCut} refv={d.lowCut || 10} value={p.lowCut || 10} min={10} max={300} step={1} unit="Hz" log onChange={(v) => u('lowCut', v <= 10 ? 0 : v)} title={tr('High-pass: removes rumble below this frequency (all the way left: off)')} />
            <Knob name={tr('High cut')} off={!p.highCut} refv={d.highCut || 22000} value={p.highCut || 22000} min={5000} max={22000} step={1} unit="Hz" log onChange={(v) => u('highCut', v >= 21900 ? 0 : v)} title={tr('Low-pass (all the way right: off)')} />
          </div>
          <div style={grp}>
            <Knob name={tr('Low shelf')} refv={d.lowF} value={p.lowF} min={30} max={500} step={1} unit="Hz" log onChange={(v) => u('lowF', v)} />
            <Knob name={tr('  gain')} refv={d.lowG} value={p.lowG} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u('lowG', v)} />
          </div>
          {([1, 2, 3] as const).map((n) => (
            <div key={n} style={grp}>
              <Knob name={trf('Band {n}', { n })} refv={d[`p${n}F`]} value={p[`p${n}F`]} min={40} max={16000} step={1} unit="Hz" log onChange={(v) => u(`p${n}F`, v)} />
              <Knob name={tr('  gain')} refv={d[`p${n}G`]} value={p[`p${n}G`]} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u(`p${n}G`, v)} />
              <Knob name={tr('  width (Q)')} refv={d[`p${n}Q`]} value={p[`p${n}Q`]} min={0.3} max={8} step={0.1} onChange={(v) => u(`p${n}Q`, v)} />
            </div>
          ))}
          <div style={grp}>
            <Knob name={tr('High shelf')} refv={d.highF} value={p.highF} min={2000} max={18000} step={1} unit="Hz" log onChange={(v) => u('highF', v)} />
            <Knob name={tr('  gain')} refv={d.highG} value={p.highG} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u('highG', v)} />
          </div>
        </div>
      </div>
    )
  }
  if (slot.type === 'comp') {
    const p = slot.p
    const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
    return (
      <div style={knobs}>
        <Knob name={tr('Threshold')} refv={d.thresholdDb} value={p.thresholdDb} min={-40} max={0} step={0.5} unit="dB" onChange={(v) => u('thresholdDb', v)} />
        <Knob name={tr('Ratio')} refv={d.ratio} value={p.ratio} min={1} max={10} step={0.1} unit=": 1" onChange={(v) => u('ratio', v)} />
        <Knob name={tr('Attack')} refv={d.attackMs} value={p.attackMs} min={0.5} max={100} step={0.5} unit="ms" onChange={(v) => u('attackMs', v)} />
        <Knob name={tr('Release')} refv={d.releaseMs} value={p.releaseMs} min={20} max={1000} step={5} unit="ms" onChange={(v) => u('releaseMs', v)} />
        <Knob name={tr('Knee')} refv={d.kneeDb} value={p.kneeDb} min={0} max={18} step={0.5} unit="dB" onChange={(v) => u('kneeDb', v)} />
        <Knob name={tr('Make-up')} refv={d.makeupDb} value={p.makeupDb} min={0} max={12} step={0.5} unit="dB" onChange={(v) => u('makeupDb', v)} />
      </div>
    )
  }
  if (slot.type === 'multiband') {
    const p = slot.p
    const band = (i: number, k: keyof BandParams, v: number): void => {
      const bands = p.bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)) as typeof p.bands
      set({ ...slot, p: { ...p, bands } })
    }
    return (
      <div style={knobs}>
        <Knob name={tr('Split low/mid')} refv={d.xo1} value={p.xo1} min={60} max={600} step={1} unit="Hz" log onChange={(v) => set({ ...slot, p: { ...p, xo1: v } })} />
        <Knob name={tr('Split mid/high')} refv={d.xo2} value={p.xo2} min={1000} max={10000} step={1} unit="Hz" log onChange={(v) => set({ ...slot, p: { ...p, xo2: v } })} />
        {p.bands.map((b, i) => (
          <div key={i} style={{ ...grp, flexBasis: '100%', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 34, paddingTop: 26 }}>{['Low', 'Mid', 'High'][i]}</span>
            <Knob name={tr('Threshold')} refv={db.thresholdDb} value={b.thresholdDb} min={-40} max={0} step={0.5} unit="dB" onChange={(v) => band(i, 'thresholdDb', v)} />
            <Knob name={tr('Ratio')} refv={db.ratio} value={b.ratio} min={1} max={10} step={0.1} unit=": 1" onChange={(v) => band(i, 'ratio', v)} />
            <Knob name={tr('Attack')} refv={db.attackMs} value={b.attackMs} min={0.5} max={100} step={0.5} unit="ms" onChange={(v) => band(i, 'attackMs', v)} />
            <Knob name={tr('Release')} refv={db.releaseMs} value={b.releaseMs} min={20} max={1000} step={5} unit="ms" onChange={(v) => band(i, 'releaseMs', v)} />
            <Knob name={tr('Level')} refv={db.levelDb} value={b.levelDb} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => band(i, 'levelDb', v)} />
          </div>
        ))}
      </div>
    )
  }
  if (slot.type === 'dyneq') {
    const p = slot.p
    const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
    return (
      <div style={knobs}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexBasis: '100%' }}>{tr('Turns this frequency down only while it is too loud (sharp highs, booming bass). Add it twice for two bands.')}</span>
        <Knob name={tr('Frequency')} refv={d.freq} value={p.freq} min={30} max={16000} step={1} unit="Hz" log onChange={(v) => u('freq', v)} />
        <Knob name={tr('Width (Q)')} refv={d.q} value={p.q} min={0.3} max={8} step={0.1} onChange={(v) => u('q', v)} />
        <Knob name={tr('Threshold')} refv={d.thresholdDb} value={p.thresholdDb} min={-50} max={0} step={0.5} unit="dB" onChange={(v) => u('thresholdDb', v)} />
        <Knob name={tr('Ratio')} refv={d.ratio} value={p.ratio} min={1} max={10} step={0.1} unit=": 1" onChange={(v) => u('ratio', v)} />
        <Knob name={tr('Max. cut')} refv={d.rangeDb} value={p.rangeDb} min={0} max={18} step={0.5} unit="dB" onChange={(v) => u('rangeDb', v)} />
        <Knob name={tr('Attack')} refv={d.attackMs} value={p.attackMs} min={0.5} max={100} step={0.5} unit="ms" onChange={(v) => u('attackMs', v)} />
        <Knob name={tr('Release')} refv={d.releaseMs} value={p.releaseMs} min={20} max={1000} step={5} unit="ms" onChange={(v) => u('releaseMs', v)} />
      </div>
    )
  }
  if (slot.type === 'saturation') {
    const p = slot.p
    const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
    return (
      <div style={knobs}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexBasis: '100%' }}>{tr('Warmth (soft tape-like saturation) and air (new harmonics above a frequency).')}</span>
        <Knob name={tr('Drive')} refv={d.driveDb} value={p.driveDb} min={0} max={24} step={0.5} unit="dB" onChange={(v) => u('driveDb', v)} />
        <Knob name={tr('Mix')} refv={d.mix * 100} value={p.mix * 100} min={0} max={100} step={1} unit="%" onChange={(v) => u('mix', v / 100)} />
        <Knob name={tr('Exciter from')} refv={d.exciteFreq} value={p.exciteFreq} min={1000} max={16000} step={1} unit="Hz" log onChange={(v) => u('exciteFreq', v)} />
        <Knob name={tr('Exciter amount')} refv={d.excite * 100} value={p.excite * 100} min={0} max={100} step={1} unit="%" onChange={(v) => u('excite', v / 100)} />
        <Knob name={tr('Output')} refv={d.outDb} value={p.outDb} min={-12} max={6} step={0.5} unit="dB" onChange={(v) => u('outDb', v)} />
      </div>
    )
  }
  if (slot.type === 'vst') return <VstSlotBody slot={slot} />
  const p = slot.p
  const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
  return (
    <div style={knobs}>
      <Knob name={tr('Width')} refv={d.width * 100} value={p.width * 100} min={0} max={200} step={1} unit="%" onChange={(v) => u('width', v / 100)} title={tr('0 % = mono, 100 % = unchanged, 200 % = twice as wide')} />
      <Knob name={tr('Mono below')} off={!p.monoBelow} refv={d.monoBelow || 20} value={p.monoBelow || 20} min={20} max={300} step={1} unit="Hz" log onChange={(v) => u('monoBelow', v <= 20 ? 0 : v)} title={tr('Bass below this frequency in mono (all the way left: off)')} />
      <Knob name={tr('Balance')} refv={d.balance * 100} value={p.balance * 100} min={-100} max={100} step={1} unit="" onChange={(v) => u('balance', v / 100)} />
    </div>
  )
}

/** Built-in starting points. */
const BUILT_IN: Record<string, () => Chain> = {
  'Neutral (limiter only)': () => ({ ...defaultChain(), slots: defaultChain().slots.map((s) => ({ ...s, on: false })) as Slot[] }),
  'Gentle streaming': () => {
    const c = defaultChain()
    return { ...c, slots: c.slots.map((s) => (s.type === 'comp' ? { ...s, p: { ...s.p, thresholdDb: -16, ratio: 1.8, attackMs: 30, releaseMs: 250, makeupDb: 1 } }
      : s.type === 'eq' ? { ...s, p: { ...s.p, lowCut: 25, highG: 1 } } : s)) as Slot[], louderDb: 4 }
  },
  'Loud club': () => {
    const c = defaultChain()
    return { ...c, slots: c.slots.map((s) => (s.type === 'multiband' ? { ...s, on: true, p: { ...s.p, bands: s.p.bands.map((b) => ({ ...b, thresholdDb: -22, ratio: 3 })) as typeof s.p.bands } }
      : s.type === 'comp' ? { ...s, p: { ...s.p, thresholdDb: -20, ratio: 3, attackMs: 10, makeupDb: 2 } }
      : s.type === 'eq' ? { ...s, p: { ...s.p, lowCut: 30, lowG: 1.5 } } : s)) as Slot[], limiter: { on: true, ceilingDb: -0.3, releaseMs: 60 }, louderDb: 9 }
  },
  'Voice / podcast': () => {
    const c = defaultChain()
    return { ...c, slots: c.slots.map((s) => (s.type === 'eq' ? { ...s, p: { ...s.p, lowCut: 80, p3F: 3500, p3G: 2 } }
      : s.type === 'comp' ? { ...s, p: { ...s.p, thresholdDb: -24, ratio: 3, makeupDb: 4 } }
      : s.type === 'stereo' ? { ...s, p: { ...s.p, width: 0.8 } } : s)) as Slot[], louderDb: 3 }
  },
}

export function MasterRack({ chain, onChange, target, onTarget, onReachTarget, reaching, view = 'after' }: {
  chain: Chain; onChange: (c: Chain) => void
  target: string; onTarget: (id: string) => void; onReachTarget: () => void; reaching: boolean
  view?: 'before' | 'after'
}): React.ReactElement {
  const before = view === 'before'
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [presetName, setPresetName] = useState('')
  const presets = useMasteringStore((s) => s.presets)
  const savePreset = useMasteringStore((s) => s.savePreset)
  const deletePreset = useMasteringStore((s) => s.deletePreset)
  const setSlot = (i: number, s: Slot): void => onChange({ ...chain, slots: chain.slots.map((x, j) => (j === i ? s : x)) })
  const move = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= chain.slots.length) return
    const slots = [...chain.slots]; [slots[i], slots[j]] = [slots[j], slots[i]]
    onChange({ ...chain, slots })
  }
  const add = (type: SlotType): void => {
    const id = `${type}${Date.now().toString(36)}`
    onChange({ ...chain, slots: [...chain.slots, slotDefaults(type, id)] })
    setOpen((o) => ({ ...o, [id]: true }))
  }
  const plugins = usePluginsStore((st) => st.plugins.filter((p) => !isInstrumentLike(p) && !st.off.includes(p.id)))
  const pluginsLoaded = usePluginsStore((st) => st.loaded)
  React.useEffect(() => { if (!pluginsLoaded) void usePluginsStore.getState().load() }, [pluginsLoaded])
  const addPlugin = (pid: string): void => {
    const p = plugins.find((x) => x.id === pid)
    if (!p) return
    const id = `vst${Date.now().toString(36)}`
    const vst: VstRef = { pluginId: p.id, name: p.name, vendor: p.vendor, format: p.format, xml: p.xml, arch: p.arch }
    onChange({ ...chain, slots: [...chain.slots, { id, type: 'vst', on: true, p: { vst } }] })
    setOpen((o) => ({ ...o, [id]: true }))
  }
  const t = TARGETS.find((x) => x.id === target) ?? TARGETS[0]

  return (
    <RackView.Provider value={view}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {before && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderLeft: '3px solid #9ca3af', borderRadius: 6, padding: '6px 10px' }}>
          <b>{tr('Before: the original, without processing.')}</b> {tr('The controls show their starting values. Press')} <b>{tr('After')}</b> {tr('to see your settings again: every control you moved is marked')} <span style={{ color: 'var(--accent-light)' }}>•</span>.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{tr('Chain')}</span>
        <select value="" onChange={(e) => {
          const v = e.target.value
          if (BUILT_IN[v]) onChange(BUILT_IN[v]())
          else if (presets[v]) onChange(presets[v])
        }} style={{ fontSize: 11 }}>
          <option value="">{tr('Load preset…')}</option>
          <optgroup label={tr('Built in')}>{Object.keys(BUILT_IN).map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>
          {Object.keys(presets).length > 0 && <optgroup label={tr('Yours')}>{Object.keys(presets).map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>}
        </select>
        <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={tr('Preset name')} style={{ fontSize: 11, width: 110 }} />
        <button className="btn btn-ghost" style={small} disabled={!presetName.trim()} onClick={() => { savePreset(presetName.trim()); setPresetName('') }}>{tr('Save')}</button>
        {presets[presetName.trim()] && <button className="btn btn-ghost" style={small} onClick={() => deletePreset(presetName.trim())}>{tr('Delete')}</button>}
        <span style={{ flex: 1 }} />
        {/* the plugins have their own menu with a label in front, so they are easy to find */}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-light)' }}>VST</span>
        <select value="" title={tr('Put one of your VST plugins into the chain (Settings → Plugins searches for them)')}
          onChange={(e) => { const v = e.target.value; if (v) addPlugin(v); e.target.value = '' }} style={{ fontSize: 11, borderColor: 'var(--accent)' }}>
          <option value="">{tr('+ VST plugin…')}</option>
          {plugins.map((p) => <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` (${p.vendor})` : ''} · {p.format}{p.arch === 'x86' ? ' · 32-bit' : ''}</option>)}
          {!plugins.length && <option value="" disabled>{tr('None yet: Settings → Plugins')}</option>}
        </select>
        <select value="" onChange={(e) => { const v = e.target.value; if (v) add(v as SlotType); e.target.value = '' }} style={{ fontSize: 11 }}>
          <option value="">{tr('+ Add…')}</option>
          {(Object.keys(SLOT_LABEL) as SlotType[]).filter((k) => k !== 'vst').map((k) => <option key={k} value={k}>{tr(SLOT_LABEL[k])}</option>)}
        </select>
      </div>

      {chain.slots.map((s, i) => (
        <div key={s.id} style={{ ...card, opacity: s.on && !before ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost" disabled={before} style={{ ...small, color: s.on && !before ? 'var(--green)' : 'var(--text-muted)' }} title={s.on ? tr('On: click to bypass') : tr('Bypassed: click to switch on')}
              onClick={() => setSlot(i, { ...s, on: !s.on } as Slot)}>⏻</button>
            <span style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 1 }} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
              {open[s.id] ? '▾' : '▸'} {i + 1}. {s.type === 'vst' ? s.p.vst?.name ?? tr('VST plugin') : tr(SLOT_LABEL[s.type])}
            </span>
            <button className="btn btn-ghost" style={small} disabled={i === 0} title={tr('Earlier in the chain')} onClick={() => move(i, -1)}>↑</button>
            <button className="btn btn-ghost" style={small} disabled={i === chain.slots.length - 1} title={tr('Later in the chain')} onClick={() => move(i, 1)}>↓</button>
            {s.type !== 'vst' && <button className="btn btn-ghost" style={small} title={tr('Reset')} onClick={() => setSlot(i, { ...slotDefaults(s.type, s.id), on: s.on } as Slot)}>↺</button>}
            <button className="btn btn-ghost" style={small} title={tr('Remove')} onClick={() => onChange({ ...chain, slots: chain.slots.filter((_, j) => j !== i) })}>×</button>
          </div>
          {open[s.id] && <div style={{ marginTop: 8 }}><SlotBody slot={s} set={(n) => setSlot(i, n)} /></div>}
        </div>
      ))}

      <div style={{ ...card, border: '1px solid var(--accent-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button className="btn btn-ghost" disabled={before} style={{ ...small, color: chain.limiter.on && !before ? 'var(--green)' : 'var(--text-muted)' }}
            onClick={() => onChange({ ...chain, limiter: { ...chain.limiter, on: !chain.limiter.on } })}>⏻</button>
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{tr('Loudness: limiter / maximizer (true peak, 4x oversampled)')}</span>
        </div>
        <div style={knobs}>
        <Knob name={tr('Louder')} refv={0} value={chain.louderDb} min={-12} max={24} step={0.1} unit="dB" onChange={(v) => onChange({ ...chain, louderDb: v })}
          title={tr('Drives the song into the limiter: louder, without going over the ceiling')} />
        <Knob name={tr('Ceiling')} refv={-1} value={chain.limiter.ceilingDb} min={-3} max={0} step={0.1} unit="dBTP" onChange={(v) => onChange({ ...chain, limiter: { ...chain.limiter, ceilingDb: v } })}
          title={tr('The highest peak allowed (true peak). −1 dBTP is safe for MP3 and AAC.')} />
        <Knob name={tr('Release')} refv={120} value={chain.limiter.releaseMs} min={10} max={500} step={5} unit="ms" onChange={(v) => onChange({ ...chain, limiter: { ...chain.limiter, releaseMs: v } })} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tr('Target')}</span>
          <select value={target} onChange={(e) => onTarget(e.target.value)} style={{ fontSize: 11 }}>
            {TARGETS.map((x) => <option key={x.id} value={x.id}>{tr(x.label)}</option>)}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={reaching} onClick={onReachTarget}
            title={trf('Sets "Louder" (and the ceiling to {c} dBTP) so the song reaches {l} LUFS', { c: t.ceiling, l: t.lufs })}>
            {reaching ? tr('Measuring…') : trf('Reach {l} LUFS', { l: t.lufs })}
          </button>
        </div>
      </div>
    </div>
    </RackView.Provider>
  )
}
