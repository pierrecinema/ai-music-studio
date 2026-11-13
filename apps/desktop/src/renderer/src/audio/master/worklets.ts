// Loads the mastering processors (dsp.ts) into an AudioContext or OfflineAudioContext as AudioWorklets. The worklet
// code is made from the source text of the same classes, so live playback and the export run identical code.
import { BiquadBank, CompressorCore, LimiterCore, MeterCore, MultibandCore, StereoCore } from './dsp'

function workletSource(): string {
  const cls = (name: string, c: { toString(): string }): string => `const ${name} = (${c.toString()});\n`
  return [
    cls('BiquadBank', BiquadBank), cls('CompressorCore', CompressorCore), cls('LimiterCore', LimiterCore),
    cls('MultibandCore', MultibandCore), cls('StereoCore', StereoCore), cls('MeterCore', MeterCore),
    `
class AmsFx extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.kind = o.kind
    const sr = sampleRate
    if (o.kind === 'limiter') this.core = new LimiterCore({ sr, channels: 2, tp: o.tp, lookaheadMs: o.lookaheadMs })
    else if (o.kind === 'comp') this.core = new CompressorCore({ sr, channels: 2 })
    else if (o.kind === 'multiband') this.core = new MultibandCore({ sr, channels: 2, Comp: CompressorCore, Bank: BiquadBank, xo: o.xo })
    else if (o.kind === 'stereo') this.core = new StereoCore({ sr, Bank: BiquadBank, hp: o.hp })
    else if (o.kind === 'meter') this.core = new MeterCore({ sr, k: o.k, tp: o.tp })
    this.apply(o.params || {})
    this.count = 0
    this.port.onmessage = (e) => this.apply(e.data || {})
  }
  apply(m) {
    const c = this.core
    if (!c) return
    if (m.reset && c.reset) c.reset()
    if (this.kind === 'multiband') {
      if (m.xo) c.setXo(m.xo)
      if (m.bands) m.bands.forEach((b, i) => c.set(i, b))
    } else if (this.kind === 'stereo') {
      if ('hp' in m) c.setMono(m.hp)
      c.set(m)
    } else if (c.set) c.set(m)
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]
    if (!inp || !inp.length) { if (this.kind === 'meter') return true; for (const o of out) o.fill(0); return true }
    const frames = inp[0].length
    const two = inp.length > 1 ? inp : [inp[0], inp[0]]
    if (this.kind === 'meter') {
      const reps = this.core.process(two, frames)
      for (const r of reps) this.port.postMessage({ report: r })
      if (out[0]) for (let c = 0; c < out.length; c++) out[c].set(two[Math.min(c, 1)])
      return true
    }
    const o2 = out.length > 1 ? out : [out[0], new Float32Array(frames)]
    this.core.process(two, o2, frames)
    if (++this.count % 32 === 0 && this.core.reduction !== undefined) {
      this.port.postMessage({ reduction: this.core.reduction, reductions: this.core.reductions && this.core.reductions.slice() })
      // start collecting again: the meter shows the strongest reduction of each ~85 ms
      this.core.reduction = this.kind === 'limiter' ? 1 : 0
      if (this.core.bands) for (const b of this.core.bands) b.reduction = 0
    }
    return true
  }
}
registerProcessor('ams-fx', AmsFx)
`,
  ].join('\n')
}

let url: string | null = null
const loaded = new WeakMap<BaseAudioContext, Promise<void>>()

/** Makes the "ams-fx" processor available in this context (once per context). */
export function loadWorklets(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx)
  if (!p) {
    if (!url) url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' }))
    p = ctx.audioWorklet.addModule(url)
    loaded.set(ctx, p)
  }
  return p
}
