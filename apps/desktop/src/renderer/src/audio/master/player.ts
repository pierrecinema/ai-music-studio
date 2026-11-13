// Mastering playback: plays the loaded file through the chain, switches between before and after (A/B at matched
// loudness), loops a region and feeds the live meters (loudness meter worklet, spectrum, goniometer).
import { buildChain, chainShape, type Chain, type ChainNodes } from './chain'
import { kWeighting, truePeakTaps, type MeterReport } from './dsp'
import { loadWorklets } from './worklets'

type Listener = () => void

class MasterPlayer {
  ctx: AudioContext | null = null
  buffer: AudioBuffer | null = null
  chain: ChainNodes | null = null
  shape = ''
  src: AudioBufferSourceNode | null = null
  startedAt = 0                 // context time at which offset 0 would have started
  offset = 0                    // seconds into the file when paused
  playing = false
  loop: { start: number; end: number } | null = null
  loopOn = false
  bypass = false                // A/B: true = before (original)
  matchDb = 0                   // gain for "before" so both sound equally loud
  // nodes
  dryGain: GainNode | null = null
  wetGain: GainNode | null = null
  dryDelay: DelayNode | null = null
  preAnalyser: AnalyserNode | null = null
  postAnalyser: AnalyserNode | null = null
  goniL: AnalyserNode | null = null
  goniR: AnalyserNode | null = null
  meter: AudioWorkletNode | null = null
  report: MeterReport | null = null
  reduction = { limiter: 1, comp: 0, bands: [0, 0, 0] }
  listeners = new Set<Listener>()

  on(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l) }
  emit(): void { for (const l of this.listeners) l() }

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' })
      await loadWorklets(this.ctx)
      const c = this.ctx
      this.dryGain = c.createGain(); this.wetGain = c.createGain(); this.dryDelay = c.createDelay(1)
      this.preAnalyser = c.createAnalyser(); this.postAnalyser = c.createAnalyser()
      for (const a of [this.preAnalyser, this.postAnalyser]) { a.fftSize = 8192; a.smoothingTimeConstant = 0.8 }
      const split = c.createChannelSplitter(2)
      this.goniL = c.createAnalyser(); this.goniR = c.createAnalyser()
      this.goniL.fftSize = 1024; this.goniR.fftSize = 1024
      this.meter = new AudioWorkletNode(c, 'ams-fx', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
        processorOptions: { kind: 'meter', k: kWeighting(c.sampleRate), tp: truePeakTaps() },
      })
      this.meter.port.onmessage = (e) => { if (e.data.report) { this.report = e.data.report; this.emit() } }
      const out = c.createGain()
      this.dryDelay.connect(this.dryGain); this.dryGain.connect(out); this.wetGain.connect(out)
      out.connect(this.meter); this.meter.connect(c.destination)
      out.connect(this.postAnalyser); out.connect(split)
      split.connect(this.goniL, 0); split.connect(this.goniR, 1)
      this.applyAB()
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  /** A new file: stops, keeps the chain. */
  async load(buf: AudioBuffer | null): Promise<void> {
    this.stopSource()
    this.buffer = buf
    this.offset = 0
    this.playing = false
    this.loop = null
    this.resetMeter()
    this.emit()
  }

  // one rebuild at a time: two at once would leave two chains feeding the output (twice as loud)
  private queue: Promise<void> = Promise.resolve()
  setChain(chain: Chain): Promise<void> {
    this.queue = this.queue.then(() => this.applyChain(chain)).catch(() => undefined)
    return this.queue
  }

  private async applyChain(chain: Chain): Promise<void> {
    const c = await this.ensure()
    const shape = chainShape(chain)
    if (this.chain && shape === this.shape) { this.chain.update(chain); return }
    const old = this.chain
    const nodes = await buildChain(c, chain)
    nodes.onReduction = (r) => { this.reduction = { ...r }; }
    nodes.output.connect(this.wetGain!)
    this.dryDelay!.delayTime.value = nodes.latency
    this.chain = nodes
    this.shape = shape
    if (this.src) { try { this.src.disconnect() } catch { /* */ } this.connectSource(this.src) }
    old?.dispose()
  }

  connectSource(src: AudioBufferSourceNode): void {
    src.connect(this.preAnalyser!)
    src.connect(this.dryDelay!)
    if (this.chain) src.connect(this.chain.input)
  }

  setMatch(db: number): void { this.matchDb = db; this.applyAB() }
  setBypass(b: boolean): void { this.bypass = b; this.applyAB(); this.emit() }

  applyAB(): void {
    if (!this.ctx || !this.dryGain || !this.wetGain) return
    const t = this.ctx.currentTime
    const dry = this.bypass ? Math.pow(10, this.matchDb / 20) : 0
    this.dryGain.gain.setTargetAtTime(dry, t, 0.01)
    this.wetGain.gain.setTargetAtTime(this.bypass ? 0 : 1, t, 0.01)
  }

  position(): number {
    if (!this.buffer) return 0
    if (!this.playing || !this.ctx) return this.offset
    let p = this.ctx.currentTime - this.startedAt
    if (this.loopOn && this.loop && p >= this.loop.start) {
      const len = this.loop.end - this.loop.start
      if (len > 0.05) p = this.loop.start + ((p - this.loop.start) % len)
    }
    return Math.min(p, this.buffer.duration)
  }

  stopSource(): void {
    if (this.src) { this.src.onended = null; try { this.src.stop() } catch { /* */ } try { this.src.disconnect() } catch { /* */ } this.src = null }
  }

  async play(from?: number): Promise<void> {
    if (!this.buffer) return
    const c = await this.ensure()
    this.stopSource()
    let at = from ?? this.offset
    if (at >= this.buffer.duration - 0.05) at = 0
    const src = c.createBufferSource()
    src.buffer = this.buffer
    if (this.loopOn && this.loop && this.loop.end - this.loop.start > 0.05) {
      src.loop = true; src.loopStart = this.loop.start; src.loopEnd = this.loop.end
      if (at < this.loop.start || at >= this.loop.end) at = this.loop.start
    }
    this.connectSource(src)
    src.start(0, at)
    src.onended = () => { if (this.src === src) { this.playing = false; this.offset = 0; this.src = null; this.emit() } }
    this.src = src
    this.startedAt = c.currentTime - at
    this.playing = true
    this.emit()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.position()
    this.stopSource()
    this.playing = false
    this.emit()
  }

  seek(t: number): void {
    if (!this.buffer) return
    const to = Math.max(0, Math.min(this.buffer.duration, t))
    if (this.playing) void this.play(to)
    else { this.offset = to; this.emit() }
  }

  setLoop(region: { start: number; end: number } | null, on?: boolean): void {
    this.loop = region
    if (on !== undefined) this.loopOn = on
    if (this.playing) void this.play(this.position())
    this.emit()
  }

  resetMeter(): void { this.report = null; this.meter?.port.postMessage({ reset: true }) }
}

export const masterPlayer = new MasterPlayer()
;(globalThis as unknown as { __amsMaster?: MasterPlayer }).__amsMaster = masterPlayer   // for tests and diagnosis
