// The mastering chain: its settings (saved with presets), the Web Audio graph for it (live and offline) and the
// offline render used for the analysis "after" and for the export.
import { crossover, truePeakTaps } from './dsp'
import { loadWorklets } from './worklets'

export type SlotType = 'eq' | 'comp' | 'multiband' | 'stereo'

export interface EqParams {
  lowCut: number                                   // Hz, 0 = off
  lowF: number; lowG: number                       // low shelf
  p1F: number; p1G: number; p1Q: number
  p2F: number; p2G: number; p2Q: number
  p3F: number; p3G: number; p3Q: number
  highF: number; highG: number                     // high shelf
  highCut: number                                  // Hz, 0 = off
}
export interface CompParams { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; kneeDb: number; makeupDb: number }
export interface BandParams { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; levelDb: number }
export interface MultibandParams { xo1: number; xo2: number; bands: [BandParams, BandParams, BandParams] }
export interface StereoParams { width: number; monoBelow: number; balance: number }   // width 1 = unchanged; monoBelow 0 = off

export type Slot =
  | { id: string; type: 'eq'; on: boolean; p: EqParams }
  | { id: string; type: 'comp'; on: boolean; p: CompParams }
  | { id: string; type: 'multiband'; on: boolean; p: MultibandParams }
  | { id: string; type: 'stereo'; on: boolean; p: StereoParams }

export interface Chain {
  slots: Slot[]
  limiter: { on: boolean; ceilingDb: number; releaseMs: number }
  louderDb: number                                 // gain into the limiter ("Louder")
}

export const SLOT_LABEL: Record<SlotType, string> = {
  eq: 'Equalizer', comp: 'Compressor (glue)', multiband: 'Multiband compressor', stereo: 'Stereo / mono bass',
}

export function slotDefaults(type: SlotType, id: string): Slot {
  switch (type) {
    case 'eq': return { id, type, on: true, p: { lowCut: 0, lowF: 100, lowG: 0, p1F: 250, p1G: 0, p1Q: 1, p2F: 1000, p2G: 0, p2Q: 1, p3F: 4000, p3G: 0, p3Q: 1, highF: 10000, highG: 0, highCut: 0 } }
    case 'comp': return { id, type, on: true, p: { thresholdDb: -18, ratio: 2, attackMs: 30, releaseMs: 200, kneeDb: 6, makeupDb: 0 } }
    case 'multiband': {
      const band = (): BandParams => ({ thresholdDb: -20, ratio: 2, attackMs: 20, releaseMs: 150, levelDb: 0 })
      return { id, type, on: true, p: { xo1: 150, xo2: 3000, bands: [band(), band(), band()] } }
    }
    case 'stereo': return { id, type, on: true, p: { width: 1, monoBelow: 120, balance: 0 } }
  }
}

export function defaultChain(): Chain {
  return {
    slots: [slotDefaults('eq', 'eq1'), slotDefaults('comp', 'comp1'), slotDefaults('multiband', 'mb1'), slotDefaults('stereo', 'st1')]
      .map((s) => (s.type === 'multiband' ? { ...s, on: false } : s)) as Slot[],
    limiter: { on: true, ceilingDb: -1, releaseMs: 120 },
    louderDb: 0,
  }
}

/** Loudness targets: the integrated loudness and the true-peak ceiling each destination asks for. */
export const TARGETS = [
  { id: 'streaming', label: 'Streaming (−14 LUFS)', lufs: -14, ceiling: -1 },
  { id: 'apple', label: 'Apple Music (−16 LUFS)', lufs: -16, ceiling: -1 },
  { id: 'loud', label: 'Loud / club (−9 LUFS)', lufs: -9, ceiling: -0.3 },
  { id: 'broadcast', label: 'Broadcast EBU R128 (−23 LUFS)', lufs: -23, ceiling: -1 },
  { id: 'podcast', label: 'Podcast (−16 LUFS)', lufs: -16, ceiling: -1 },
] as const

// ── graph ───────────────────────────────────────────────────────────────────────────────────────────────────────

const xoCoeffs = (sr: number, f1: number, f2: number): number[][][] =>
  [crossover(sr, f1), crossover(sr, Math.max(f2, f1 * 1.5))].map((x) => [x.low, x.high])

const sideHp = (sr: number, f: number): number[] | null => (f > 0 ? crossover(sr, f).high : null)

export interface ChainNodes {
  input: AudioNode
  output: AudioNode
  latency: number                                   // seconds of delay through the chain (the limiter's look-ahead)
  update: (chain: Chain) => void                    // new settings without rebuilding (same slots in the same order)
  onReduction?: (r: { limiter: number; comp: number; bands: number[] }) => void
  dispose: () => void
}

/** Builds the chain in a context; `update` changes settings live. Rebuild when slots are added, removed or moved. */
export async function buildChain(ctx: BaseAudioContext, chain: Chain): Promise<ChainNodes> {
  await loadWorklets(ctx)
  const sr = ctx.sampleRate
  const input = ctx.createGain()
  const nodes: AudioNode[] = [input]
  const updaters: Array<(c: Chain) => void> = []
  const fx = (kind: string, extra: Record<string, unknown>): AudioWorkletNode =>
    new AudioWorkletNode(ctx, 'ams-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { kind, ...extra } })
  const red = { limiter: 1, comp: 0, bands: [0, 0, 0] }
  const result: ChainNodes = { input, output: input, latency: 0, update: () => {}, dispose: () => {} }

  let last: AudioNode = input
  const add = (n: AudioNode): void => { last.connect(n); last = n; nodes.push(n) }

  chain.slots.forEach((slot, idx) => {
    const find = (c: Chain): Slot | undefined => c.slots[idx]?.id === slot.id ? c.slots[idx] : c.slots.find((s) => s.id === slot.id)
    // each slot: a bypass switch (dry and wet gain)
    const inG = ctx.createGain(), wet = ctx.createGain(), dry = ctx.createGain(), sum = ctx.createGain()
    last.connect(inG); nodes.push(inG, wet, dry, sum)
    inG.connect(dry); dry.connect(sum)
    const setOn = (on: boolean): void => { wet.gain.value = on ? 1 : 0; dry.gain.value = on ? 0 : 1 }
    setOn(slot.on)
    let head: AudioNode = inG, tail: AudioNode = inG
    if (slot.type === 'eq') {
      const mk = (type: BiquadFilterType): BiquadFilterNode => { const b = ctx.createBiquadFilter(); b.type = type; nodes.push(b); return b }
      const f = [mk('highpass'), mk('lowshelf'), mk('peaking'), mk('peaking'), mk('peaking'), mk('highshelf'), mk('lowpass')]
      for (let i = 0; i < f.length - 1; i++) f[i].connect(f[i + 1])
      head = f[0]; tail = f[f.length - 1]
      const set = (p: EqParams): void => {
        f[0].frequency.value = p.lowCut > 0 ? p.lowCut : 1; f[0].Q.value = 0.7071
        f[1].frequency.value = p.lowF; f[1].gain.value = p.lowG
        f[2].frequency.value = p.p1F; f[2].gain.value = p.p1G; f[2].Q.value = p.p1Q
        f[3].frequency.value = p.p2F; f[3].gain.value = p.p2G; f[3].Q.value = p.p2Q
        f[4].frequency.value = p.p3F; f[4].gain.value = p.p3G; f[4].Q.value = p.p3Q
        f[5].frequency.value = p.highF; f[5].gain.value = p.highG
        f[6].frequency.value = p.highCut > 0 ? p.highCut : sr / 2 - 1; f[6].Q.value = 0.7071
      }
      set(slot.p)
      updaters.push((c) => { const s = find(c); if (s?.type === 'eq') { set(s.p); setOn(s.on) } })
      ;(result as ChainNodes & { eqNodes?: BiquadFilterNode[] }).eqNodes = f
    } else if (slot.type === 'comp') {
      const n = fx('comp', { params: slot.p })
      n.port.onmessage = (e) => { if (e.data.reduction !== undefined) { red.comp = e.data.reduction; result.onReduction?.(red) } }
      nodes.push(n); head = tail = n
      updaters.push((c) => { const s = find(c); if (s?.type === 'comp') { n.port.postMessage(s.p); setOn(s.on) } })
    } else if (slot.type === 'multiband') {
      const p = slot.p
      const n = fx('multiband', { xo: xoCoeffs(sr, p.xo1, p.xo2), params: { bands: p.bands } })
      n.port.onmessage = (e) => { if (e.data.reductions) { red.bands = e.data.reductions; result.onReduction?.(red) } }
      nodes.push(n); head = tail = n
      updaters.push((c) => { const s = find(c); if (s?.type === 'multiband') { n.port.postMessage({ xo: xoCoeffs(sr, s.p.xo1, s.p.xo2), bands: s.p.bands }); setOn(s.on) } })
    } else if (slot.type === 'stereo') {
      const n = fx('stereo', { hp: sideHp(sr, slot.p.monoBelow), params: slot.p })
      nodes.push(n); head = tail = n
      updaters.push((c) => { const s = find(c); if (s?.type === 'stereo') { n.port.postMessage({ ...s.p, hp: sideHp(sr, s.p.monoBelow) }); setOn(s.on) } })
    }
    if (head !== inG) inG.connect(head)
    tail.connect(wet); wet.connect(sum)
    last = sum
  })

  // limiter (always last): "Louder" is its input gain; when it is off, the gain is applied without limiting
  const lim = fx('limiter', { tp: truePeakTaps(), lookaheadMs: 5, params: { gainDb: chain.louderDb, ceilingDb: chain.limiter.ceilingDb, releaseMs: chain.limiter.releaseMs } })
  const latSamples = 6 + Math.max(1, Math.round(sr * 5 / 1000))
  const bypass = ctx.createDelay(1); bypass.delayTime.value = latSamples / sr
  const bypassGain = ctx.createGain()
  const limWet = ctx.createGain(), limDry = ctx.createGain(), out = ctx.createGain()
  nodes.push(lim, bypass, bypassGain, limWet, limDry, out)
  last.connect(lim); lim.connect(limWet); limWet.connect(out)
  last.connect(bypassGain); bypassGain.connect(bypass); bypass.connect(limDry); limDry.connect(out)
  lim.port.onmessage = (e) => { if (e.data.reduction !== undefined) { red.limiter = e.data.reduction; result.onReduction?.(red) } }
  const setLim = (c: Chain): void => {
    limWet.gain.value = c.limiter.on ? 1 : 0; limDry.gain.value = c.limiter.on ? 0 : 1
    bypassGain.gain.value = Math.pow(10, c.louderDb / 20)
    lim.port.postMessage({ gainDb: c.louderDb, ceilingDb: c.limiter.ceilingDb, releaseMs: c.limiter.releaseMs })
  }
  setLim(chain)
  updaters.push(setLim)

  result.output = out
  result.latency = latSamples / sr
  result.update = (c) => { for (const u of updaters) u(c) }
  result.dispose = () => { for (const n of nodes) { try { n.disconnect() } catch { /* already */ } } }
  return result
}

/** The order and kinds of slots: when this changes the graph must be rebuilt. */
export const chainShape = (c: Chain): string => c.slots.map((s) => `${s.type}:${s.id}`).join('|')

/** Renders a buffer through the chain (offline, same code as live). Returns the processed audio, aligned. */
export async function renderChain(buf: AudioBuffer, chain: Chain): Promise<AudioBuffer> {
  const sr = buf.sampleRate
  const extra = Math.ceil(sr * 0.05)
  const ctx = new OfflineAudioContext(2, buf.length + extra, sr)
  const nodes = await buildChain(ctx, chain)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(nodes.input)
  nodes.output.connect(ctx.destination)
  src.start()
  const rendered = await ctx.startRendering()
  // remove the look-ahead delay so the result lines up with the original
  const lat = Math.round(nodes.latency * sr)
  const out = new AudioBuffer({ numberOfChannels: 2, length: buf.length, sampleRate: sr })
  for (let c = 0; c < 2; c++) out.copyToChannel(rendered.getChannelData(c).subarray(lat, lat + buf.length), c)
  return out
}
