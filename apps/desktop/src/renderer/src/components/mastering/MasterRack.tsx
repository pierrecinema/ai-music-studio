import React, { useState } from 'react'
import { SLOT_LABEL, TARGETS, defaultChain, slotDefaults, type BandParams, type Chain, type Slot, type SlotType } from '../../audio/master/chain'
import { useMasteringStore } from '../../stores/mastering.store'
import { EqCurve } from './EqCurve'

// The processing chain: slots that can be switched off, moved and removed, each with its controls; the limiter with
// the "Louder" control and the loudness target at the end; presets.

const card: React.CSSProperties = { background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10 }
const small: React.CSSProperties = { fontSize: 10, padding: '1px 7px' }
const grp: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.03)' }

// "Before" (the original) shows every control at its starting value, read-only; "After" shows the settings and
// marks each control that was moved (purple name, dot)
export const RackView = React.createContext<'before' | 'after'>('after')

function Knob({ name, value: setValue, min, max, step, unit, onChange, log, title, off: setOff, refv }: {
  name: string; value: number; min: number; max: number; step: number; unit?: string
  onChange: (v: number) => void; log?: boolean; title?: string; off?: boolean; refv?: number
}): React.ReactElement {
  const view = React.useContext(RackView)
  const before = view === 'before' && refv !== undefined
  const value = before ? refv! : setValue
  const changed = !before && refv !== undefined && Math.abs(setValue - refv) > 1e-6
  const off = before ? setOff !== undefined && (refv === min || refv === max) : setOff
  // a slider with a logarithmic scale for frequencies
  const toPos = (v: number): number => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min))
  const fromPos = (p: number): number => (log ? min * Math.pow(max / min, p) : min + p * (max - min))
  const shown = log ? (value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} k` : value.toFixed(0)) : value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)
  return (
    <label title={title} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 64px', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', opacity: before ? 0.7 : 1 }}>
      <span style={changed ? { color: 'var(--accent-light)', fontWeight: 600 } : undefined}>{name}{changed ? ' •' : ''}</span>
      <input type="range" min={0} max={1} step={0.001} value={toPos(value)} disabled={before} style={{ accentColor: before ? '#6b7280' : 'var(--accent)', minWidth: 0 }}
        onChange={(e) => { const v = fromPos(Number(e.target.value)); onChange(log ? Math.round(v) : Math.round(v / step) * step) }} />
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{off ? 'off' : `${shown}${unit ? ` ${unit}` : ''}`}</span>
    </label>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: 14, rowGap: 8 }}>
          {/* each filter's controls stay together */}
          <div style={grp}>
            <Knob name="Low cut" off={!p.lowCut} refv={d.lowCut || 10} value={p.lowCut || 10} min={10} max={300} step={1} unit="Hz" log onChange={(v) => u('lowCut', v <= 10 ? 0 : v)} title="High-pass: removes rumble below this frequency (all the way left: off)" />
            <Knob name="High cut" off={!p.highCut} refv={d.highCut || 22000} value={p.highCut || 22000} min={5000} max={22000} step={1} unit="Hz" log onChange={(v) => u('highCut', v >= 21900 ? 0 : v)} title="Low-pass (all the way right: off)" />
          </div>
          <div style={grp}>
            <Knob name="Low shelf" refv={d.lowF} value={p.lowF} min={30} max={500} step={1} unit="Hz" log onChange={(v) => u('lowF', v)} />
            <Knob name="  gain" refv={d.lowG} value={p.lowG} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u('lowG', v)} />
          </div>
          {([1, 2, 3] as const).map((n) => (
            <div key={n} style={grp}>
              <Knob name={`Band ${n}`} refv={d[`p${n}F`]} value={p[`p${n}F`]} min={40} max={16000} step={1} unit="Hz" log onChange={(v) => u(`p${n}F`, v)} />
              <Knob name="  gain" refv={d[`p${n}G`]} value={p[`p${n}G`]} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u(`p${n}G`, v)} />
              <Knob name="  width (Q)" refv={d[`p${n}Q`]} value={p[`p${n}Q`]} min={0.3} max={8} step={0.1} onChange={(v) => u(`p${n}Q`, v)} />
            </div>
          ))}
          <div style={grp}>
            <Knob name="High shelf" refv={d.highF} value={p.highF} min={2000} max={18000} step={1} unit="Hz" log onChange={(v) => u('highF', v)} />
            <Knob name="  gain" refv={d.highG} value={p.highG} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => u('highG', v)} />
          </div>
        </div>
      </div>
    )
  }
  if (slot.type === 'comp') {
    const p = slot.p
    const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Knob name="Threshold" refv={d.thresholdDb} value={p.thresholdDb} min={-40} max={0} step={0.5} unit="dB" onChange={(v) => u('thresholdDb', v)} />
        <Knob name="Ratio" refv={d.ratio} value={p.ratio} min={1} max={10} step={0.1} unit=": 1" onChange={(v) => u('ratio', v)} />
        <Knob name="Attack" refv={d.attackMs} value={p.attackMs} min={0.5} max={100} step={0.5} unit="ms" onChange={(v) => u('attackMs', v)} />
        <Knob name="Release" refv={d.releaseMs} value={p.releaseMs} min={20} max={1000} step={5} unit="ms" onChange={(v) => u('releaseMs', v)} />
        <Knob name="Knee" refv={d.kneeDb} value={p.kneeDb} min={0} max={18} step={0.5} unit="dB" onChange={(v) => u('kneeDb', v)} />
        <Knob name="Make-up" refv={d.makeupDb} value={p.makeupDb} min={0} max={12} step={0.5} unit="dB" onChange={(v) => u('makeupDb', v)} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Knob name="Split low/mid" refv={d.xo1} value={p.xo1} min={60} max={600} step={1} unit="Hz" log onChange={(v) => set({ ...slot, p: { ...p, xo1: v } })} />
        <Knob name="Split mid/high" refv={d.xo2} value={p.xo2} min={1000} max={10000} step={1} unit="Hz" log onChange={(v) => set({ ...slot, p: { ...p, xo2: v } })} />
        {p.bands.map((b, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{['Low', 'Mid', 'High'][i]}</span>
            <Knob name="Threshold" refv={db.thresholdDb} value={b.thresholdDb} min={-40} max={0} step={0.5} unit="dB" onChange={(v) => band(i, 'thresholdDb', v)} />
            <Knob name="Ratio" refv={db.ratio} value={b.ratio} min={1} max={10} step={0.1} unit=": 1" onChange={(v) => band(i, 'ratio', v)} />
            <Knob name="Attack" refv={db.attackMs} value={b.attackMs} min={0.5} max={100} step={0.5} unit="ms" onChange={(v) => band(i, 'attackMs', v)} />
            <Knob name="Release" refv={db.releaseMs} value={b.releaseMs} min={20} max={1000} step={5} unit="ms" onChange={(v) => band(i, 'releaseMs', v)} />
            <Knob name="Level" refv={db.levelDb} value={b.levelDb} min={-12} max={12} step={0.5} unit="dB" onChange={(v) => band(i, 'levelDb', v)} />
          </div>
        ))}
      </div>
    )
  }
  const p = slot.p
  const u = (k: keyof typeof p, v: number): void => set({ ...slot, p: { ...p, [k]: v } })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Knob name="Width" refv={d.width * 100} value={p.width * 100} min={0} max={200} step={1} unit="%" onChange={(v) => u('width', v / 100)} title="0 % = mono, 100 % = unchanged, 200 % = twice as wide" />
      <Knob name="Mono below" off={!p.monoBelow} refv={d.monoBelow || 20} value={p.monoBelow || 20} min={20} max={300} step={1} unit="Hz" log onChange={(v) => u('monoBelow', v <= 20 ? 0 : v)} title="Bass below this frequency in mono (all the way left: off)" />
      <Knob name="Balance" refv={d.balance * 100} value={p.balance * 100} min={-100} max={100} step={1} unit="" onChange={(v) => u('balance', v / 100)} />
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
  const t = TARGETS.find((x) => x.id === target) ?? TARGETS[0]

  return (
    <RackView.Provider value={view}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {before && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderLeft: '3px solid #9ca3af', borderRadius: 6, padding: '6px 10px' }}>
          <b>Before: the original, without processing.</b> The controls show their starting values. Press <b>After</b> to see your settings again: every control you moved is marked <span style={{ color: 'var(--accent-light)' }}>•</span>.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Chain</span>
        <select value="" onChange={(e) => {
          const v = e.target.value
          if (BUILT_IN[v]) onChange(BUILT_IN[v]())
          else if (presets[v]) onChange(presets[v])
        }} style={{ fontSize: 11 }}>
          <option value="">Load preset…</option>
          <optgroup label="Built in">{Object.keys(BUILT_IN).map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>
          {Object.keys(presets).length > 0 && <optgroup label="Yours">{Object.keys(presets).map((k) => <option key={k} value={k}>{k}</option>)}</optgroup>}
        </select>
        <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" style={{ fontSize: 11, width: 110 }} />
        <button className="btn btn-ghost" style={small} disabled={!presetName.trim()} onClick={() => { savePreset(presetName.trim()); setPresetName('') }}>Save</button>
        {presets[presetName.trim()] && <button className="btn btn-ghost" style={small} onClick={() => deletePreset(presetName.trim())}>Delete</button>}
        <span style={{ flex: 1 }} />
        <select value="" onChange={(e) => { if (e.target.value) add(e.target.value as SlotType) }} style={{ fontSize: 11 }}>
          <option value="">+ Add…</option>
          {(Object.keys(SLOT_LABEL) as SlotType[]).map((k) => <option key={k} value={k}>{SLOT_LABEL[k]}</option>)}
        </select>
      </div>

      {chain.slots.map((s, i) => (
        <div key={s.id} style={{ ...card, opacity: s.on && !before ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost" disabled={before} style={{ ...small, color: s.on && !before ? 'var(--green)' : 'var(--text-muted)' }} title={s.on ? 'On: click to bypass' : 'Bypassed: click to switch on'}
              onClick={() => setSlot(i, { ...s, on: !s.on } as Slot)}>⏻</button>
            <span style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 1 }} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
              {open[s.id] ? '▾' : '▸'} {i + 1}. {SLOT_LABEL[s.type]}
            </span>
            <button className="btn btn-ghost" style={small} disabled={i === 0} title="Earlier in the chain" onClick={() => move(i, -1)}>↑</button>
            <button className="btn btn-ghost" style={small} disabled={i === chain.slots.length - 1} title="Later in the chain" onClick={() => move(i, 1)}>↓</button>
            <button className="btn btn-ghost" style={small} title="Reset" onClick={() => setSlot(i, { ...slotDefaults(s.type, s.id), on: s.on } as Slot)}>↺</button>
            <button className="btn btn-ghost" style={small} title="Remove" onClick={() => onChange({ ...chain, slots: chain.slots.filter((_, j) => j !== i) })}>×</button>
          </div>
          {open[s.id] && <div style={{ marginTop: 8 }}><SlotBody slot={s} set={(n) => setSlot(i, n)} /></div>}
        </div>
      ))}

      <div style={{ ...card, border: '1px solid var(--accent-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button className="btn btn-ghost" disabled={before} style={{ ...small, color: chain.limiter.on && !before ? 'var(--green)' : 'var(--text-muted)' }}
            onClick={() => onChange({ ...chain, limiter: { ...chain.limiter, on: !chain.limiter.on } })}>⏻</button>
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>Loudness: limiter / maximizer (true peak, 4x oversampled)</span>
        </div>
        <Knob name="Louder" refv={0} value={chain.louderDb} min={-12} max={24} step={0.1} unit="dB" onChange={(v) => onChange({ ...chain, louderDb: v })}
          title="Drives the song into the limiter: louder, without going over the ceiling" />
        <Knob name="Ceiling" refv={-1} value={chain.limiter.ceilingDb} min={-3} max={0} step={0.1} unit="dBTP" onChange={(v) => onChange({ ...chain, limiter: { ...chain.limiter, ceilingDb: v } })}
          title="The highest peak allowed (true peak). −1 dBTP is safe for MP3 and AAC." />
        <Knob name="Release" refv={120} value={chain.limiter.releaseMs} min={10} max={500} step={5} unit="ms" onChange={(v) => onChange({ ...chain, limiter: { ...chain.limiter, releaseMs: v } })} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Target</span>
          <select value={target} onChange={(e) => onTarget(e.target.value)} style={{ fontSize: 11 }}>
            {TARGETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={reaching} onClick={onReachTarget}
            title={`Sets "Louder" (and the ceiling to ${t.ceiling} dBTP) so the song reaches ${t.lufs} LUFS`}>
            {reaching ? 'Measuring…' : `Reach ${t.lufs} LUFS`}
          </button>
        </div>
      </div>
    </div>
    </RackView.Provider>
  )
}
