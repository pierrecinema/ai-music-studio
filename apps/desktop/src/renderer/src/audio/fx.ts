// The effects of return tracks (Ableton "Return tracks", Cubase "FX channels"): a reverb and a tempo delay.
import type { InsertFx, InsertType, ReturnTrack } from '../types'

const irCache = new Map<string, AudioBuffer>()

// a smooth, decaying stereo noise tail: a simple, natural sounding hall without impulse-response files
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const key = `${ctx.sampleRate}|${seconds.toFixed(2)}`
  const have = irCache.get(key)
  if (have && have.sampleRate === ctx.sampleRate) return have
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  let seed = 1234567
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1 }
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      lp = lp * 0.6 + rnd() * 0.4                     // a little darker than white noise
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1)
    }
  }
  irCache.set(key, buf)
  return buf
}

// input -> effect -> output (the effect is 100 % wet: the dry sound stays on the track itself)
export function makeEffect(ctx: BaseAudioContext, r: ReturnTrack, secPerBeat: number): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain()
  const output = ctx.createGain()
  if (r.effect === 'delay') {
    const delay = ctx.createDelay(4)
    delay.delayTime.value = Math.min(3.9, Math.max(0.01, (r.delayBeats ?? 0.75) * secPerBeat))
    const fb = ctx.createGain()
    fb.gain.value = Math.min(0.9, Math.max(0, r.feedback ?? 0.4))
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 5000                      // each repeat a little darker, like a tape delay
    input.connect(delay)
    delay.connect(tone).connect(fb).connect(delay)
    tone.connect(output)
  } else {
    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx, Math.min(8, Math.max(0.3, r.decay ?? 2.2)))
    const pre = ctx.createDelay(0.2)
    pre.delayTime.value = 0.02                        // pre-delay keeps the dry sound clear
    input.connect(pre).connect(conv).connect(output)
  }
  return { input, output }
}

export const RETURN_DEFAULTS: Record<ReturnTrack['effect'], Partial<ReturnTrack>> = {
  reverb: { decay: 2.2 },
  delay: { delayBeats: 0.75, feedback: 0.4 },
}

// ── effects in a track (inserts) ─────────────────────────────────────────────

export interface ParamDef { key: string; label: string; min: number; max: number; step: number; def: number; unit?: string }

// what each insert can set; the Studio's effects lane shows these as sliders
export const INSERT_PARAMS: Record<InsertType, ParamDef[]> = {
  eq: [
    { key: 'low', label: 'Low', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
    { key: 'mid', label: 'Mid', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
    { key: 'high', label: 'High', min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, def: -18, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, def: 4, unit: ':1' },
    { key: 'attack', label: 'Attack', min: 1, max: 200, step: 1, def: 10, unit: 'ms' },
    { key: 'release', label: 'Release', min: 20, max: 1000, step: 10, def: 200, unit: 'ms' },
    { key: 'makeup', label: 'Gain', min: 0, max: 24, step: 0.5, def: 0, unit: 'dB' },
  ],
  delay: [
    { key: 'beats', label: 'Time', min: 0.125, max: 2, step: 0.125, def: 0.75, unit: 'beats' },
    { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, def: 0.35 },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.25 },
  ],
  reverb: [
    { key: 'decay', label: 'Decay', min: 0.3, max: 8, step: 0.1, def: 2, unit: 's' },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.25 },
  ],
  filter: [
    { key: 'mode', label: 'High-pass', min: 0, max: 1, step: 1, def: 0 },
    { key: 'freq', label: 'Frequency', min: 20, max: 20000, step: 10, def: 8000, unit: 'Hz' },
    { key: 'q', label: 'Resonance', min: 0.1, max: 12, step: 0.1, def: 0.7 },
  ],
}

export const INSERT_LABEL: Record<InsertType, string> = { eq: 'EQ', compressor: 'Compressor', delay: 'Delay', reverb: 'Reverb', filter: 'Filter' }

export function insertDefaults(type: InsertType): Record<string, number> {
  return Object.fromEntries(INSERT_PARAMS[type].map((d) => [d.key, d.def]))
}

const dbToGain = (db: number): number => Math.pow(10, db / 20)

// one insert: input -> effect -> output. Delay and reverb mix their wet sound with the dry one (Mix).
export function makeInsert(ctx: BaseAudioContext, fx: InsertFx, secPerBeat: number): { input: AudioNode; output: AudioNode } {
  const p = { ...insertDefaults(fx.type), ...fx.p }
  const input = ctx.createGain()
  const output = ctx.createGain()
  if (!fx.on) { input.connect(output); return { input, output } }
  if (fx.type === 'eq') {
    const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 120; lo.gain.value = p.low
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.8; mid.gain.value = p.mid
    const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 8000; hi.gain.value = p.high
    input.connect(lo).connect(mid).connect(hi).connect(output)
  } else if (fx.type === 'compressor') {
    const c = ctx.createDynamicsCompressor()
    c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.knee.value = 6
    c.attack.value = p.attack / 1000; c.release.value = p.release / 1000
    const makeup = ctx.createGain(); makeup.gain.value = dbToGain(p.makeup)
    input.connect(c).connect(makeup).connect(output)
  } else if (fx.type === 'filter') {
    const f = ctx.createBiquadFilter()
    f.type = p.mode >= 0.5 ? 'highpass' : 'lowpass'; f.frequency.value = p.freq; f.Q.value = p.q
    input.connect(f).connect(output)
  } else {
    const dry = ctx.createGain(); dry.gain.value = 1 - p.mix * 0.5
    const wet = ctx.createGain(); wet.gain.value = p.mix
    input.connect(dry).connect(output)
    const send = makeEffect(ctx, fx.type === 'delay'
      ? { id: fx.id, name: '', effect: 'delay', volume: 1, muted: false, pan: 0, delayBeats: p.beats, feedback: p.feedback }
      : { id: fx.id, name: '', effect: 'reverb', volume: 1, muted: false, pan: 0, decay: p.decay }, secPerBeat)
    input.connect(send.input); send.output.connect(wet).connect(output)
  }
  return { input, output }
}
