// Loads the mastering processors (dsp.ts) into an AudioContext or OfflineAudioContext as AudioWorklets. The worklet
// code is made from the source text of the same classes, so live playback and the export run identical code.
import { BiquadBank, CompressorCore, DynEqCore, LimiterCore, MeterCore, MultibandCore, SaturationCore, StereoCore } from './dsp'
import { VstLink } from '../vst/link'

function workletSource(): string {
  const cls = (name: string, c: { toString(): string }): string => `const ${name} = (${c.toString()});\n`
  return [
    cls('BiquadBank', BiquadBank), cls('CompressorCore', CompressorCore), cls('LimiterCore', LimiterCore),
    cls('MultibandCore', MultibandCore), cls('StereoCore', StereoCore), cls('MeterCore', MeterCore),
    cls('DynEqCore', DynEqCore), cls('SaturationCore', SaturationCore), cls('VstLink', VstLink),
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
    else if (o.kind === 'dyneq') this.core = new DynEqCore({ sr, channels: 2 })
    else if (o.kind === 'saturation') this.core = new SaturationCore({ sr, channels: 2 })
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

// a VST insert: blocks go to the plugin host through the audio worker (see audio/vst/host.ts) and come back delayed
class AmsVst extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.alive = true
    this.first = true
    this.wport = null
    this.lastUnder = 0
    this.link = new VstLink({ block: o.block, delay: o.delay, on: o.on, send: (seq, b, midi) => this.toWorker(seq, b, midi) })
    this.start = -1            // context frame of the link's first input sample
    this.pending = []          // MIDI with context times (seconds), until the start is known
    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (d.link) {
        this.wport = d.link
        this.wport.onmessage = (ev) => {
          const m = ev.data
          if (m.sync !== undefined) { this.wport.postMessage({ synced: m.sync }); return }
          this.link.receive(m.seq, m.block)
        }
      }
      if ('on' in d) this.link.on = !!d.on
      if (d.events) { for (const e of d.events) this.pending.push(e); this.place() }
      if (d.dispose) { this.alive = false; if (this.wport) this.wport.close() }
    }
  }
  // MIDI times (context seconds) become input frames of the link
  place() {
    if (this.start < 0 || !this.pending.length) return
    this.link.addEvents(this.pending.map((e) => [Math.max(0, Math.round(e[0] * sampleRate) - this.start), e[1], e[2], e[3]]))
    this.pending = []
  }
  toWorker(seq, b, midi) {
    if (!this.wport) return
    this.wport.postMessage({ seq, block: b, midi, reset: this.first }, b.map((x) => x.buffer))
    this.first = false
  }
  process(inputs, outputs) {
    if (this.start < 0) { this.start = currentFrame; this.place() }
    const out = outputs[0]
    this.link.process(inputs[0] || [], out, out[0].length)
    if (this.link.underruns !== this.lastUnder && this.link.t % 12288 < 128) { this.lastUnder = this.link.underruns; this.port.postMessage({ underruns: this.lastUnder }) }
    return this.alive
  }
}
registerProcessor('ams-vst', AmsVst)

// Settings → Audio → ASIO: the master mix in blocks of 512 to the plugin host, which plays it on the sound card
class AmsOut extends AudioWorkletProcessor {
  constructor() {
    super()
    this.B = 512; this.fill = 0; this.cur = [new Float32Array(this.B), new Float32Array(this.B)]
    this.wport = null; this.alive = true
    this.port.onmessage = (e) => { const d = e.data || {}; if (d.link) this.wport = d.link; if (d.dispose) this.alive = false }
  }
  process(inputs) {
    const inp = inputs[0] || []
    const n = (inp[0] && inp[0].length) || 128
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) { const src = inp[Math.min(c, inp.length - 1)]; this.cur[c][this.fill] = src ? src[i] : 0 }
      if (++this.fill === this.B) {
        const b = this.cur
        if (this.wport) this.wport.postMessage({ block: b }, b.map((x) => x.buffer))
        this.cur = [new Float32Array(this.B), new Float32Array(this.B)]; this.fill = 0
      }
    }
    return this.alive
  }
}
registerProcessor('ams-out', AmsOut)

// Settings → Audio, "Simulated CPU load": spends the given share of every block doing nothing useful, to find a
// buffer size that does not crackle
class AmsCpu extends AudioWorkletProcessor {
  constructor() {
    super()
    this.percent = 0
    this.alive = true
    this.port.onmessage = (e) => { this.percent = e.data.percent || 0; if (e.data.stop) this.alive = false }
  }
  process(inputs, outputs) {
    const frames = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128
    const budget = (frames / sampleRate) * 1000 * this.percent / 100
    if (budget > 0) { const end = Date.now() + budget; let x = 0; while (Date.now() < end) x += Math.sqrt(x + 1) }
    return this.alive
  }
}
registerProcessor('ams-cpu', AmsCpu)
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
