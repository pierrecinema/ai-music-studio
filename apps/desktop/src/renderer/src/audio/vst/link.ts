// The part of a VST insert that runs in the audio thread (AudioWorklet): it collects the track's sound into blocks,
// hands each full block over to be processed by the plugin host, and plays the processed blocks back with a fixed
// delay of `delay` samples. A block that has not come back in time is played as silence (and counted), so the
// timing never drifts. Switched off, it plays its own input with the same delay (the track stays in time).
//
// Self-contained (no imports, no globals): the worklet is built from this class's source text (see worklets.ts),
// and the unit tests use the same class.
export class VstLink {
  B: number
  D: number
  ch: number
  on: boolean
  t: number                                    // samples seen so far (input and output run in step)
  fill: number
  cur: Float32Array[]
  seq: number
  done: Map<number, Float32Array[]>
  underruns: number
  sent: number
  events: number[][]                           // MIDI waiting to be sent: [input frame, status, data1, data2], sorted
  send: (seq: number, block: Float32Array[], midi: number[][]) => void

  constructor(o: { block: number; delay: number; channels?: number; on?: boolean; send: (seq: number, block: Float32Array[], midi: number[][]) => void }) {
    this.B = o.block
    this.D = Math.max(o.block, o.delay)
    this.ch = o.channels ?? 2
    this.on = o.on !== false
    this.send = o.send
    this.t = 0
    this.fill = 0
    this.seq = 0
    this.cur = this.fresh()
    this.done = new Map()
    this.underruns = 0
    this.sent = 0
    this.events = []
  }

  /** MIDI for an instrument: [input frame, status, data1, data2]; each goes out with the block that holds its frame
   *  (an event whose block has already gone out goes with the next one, at its start) */
  addEvents(list: number[][]): void {
    for (const e of list) this.events.push(e)
    this.events.sort((a, b) => a[0] - b[0])
  }

  /** the events of block `seq`, as [offset in the block, status, data1, data2] */
  takeEvents(seq: number): number[][] {
    const start = seq * this.B, end = start + this.B
    let n = 0
    while (n < this.events.length && this.events[n][0] < end) n++
    if (!n) return []
    const out = this.events.splice(0, n).map((e) => [Math.max(0, e[0] - start), e[1], e[2], e[3]])
    return out
  }

  fresh(): Float32Array[] {
    const a: Float32Array[] = []
    for (let c = 0; c < this.ch; c++) a.push(new Float32Array(this.B))
    return a
  }

  /** a processed block came back */
  receive(seq: number, block: Float32Array[]): void {
    // a block that arrives after its time was already played as silence is dropped
    if ((seq + 1) * this.B + this.D <= this.t) return
    this.done.set(seq, block)
  }

  process(input: Float32Array[], output: Float32Array[], n: number): void {
    // input: into the current block
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.ch; c++) {
        const src = input.length ? input[Math.min(c, input.length - 1)] : null
        this.cur[c][this.fill] = src ? src[i] : 0
      }
      this.fill++
      if (this.fill === this.B) {
        const seq = this.seq++
        const full = this.cur
        this.cur = this.fresh()
        this.fill = 0
        if (this.on) { this.sent++; this.send(seq, full, this.takeEvents(seq)) } else { this.takeEvents(seq); this.done.set(seq, full) }   // off: plays dry, same delay
      }
    }
    // output: what came in `D` samples ago, processed
    for (let i = 0; i < n; i++) {
      const s = this.t + i - this.D
      if (s < 0) { for (let c = 0; c < output.length; c++) output[c][i] = 0; continue }
      const b = Math.floor(s / this.B)
      const blk = this.done.get(b)
      const k = s - b * this.B
      if (!blk && k === 0) this.underruns++
      for (let c = 0; c < output.length; c++) output[c][i] = blk ? blk[Math.min(c, blk.length - 1)][k] : 0
    }
    this.t += n
    // forget the blocks that have been played
    const oldest = Math.floor((this.t - this.D) / this.B) - 1
    for (const k of this.done.keys()) if (k < oldest) this.done.delete(k)
  }
}

// ── the binary audio frame of the host protocol (see packages/plugin-host/src/PluginHost.h) ──
export const AUDIO_MAGIC = 0x41534d41

export function packBlock(instance: number, seq: number, block: Float32Array[], reset: boolean, midi: number[][] = []): ArrayBuffer {
  const frames = block[0].length
  const head = 24 + midi.length * 8                    // MIDI events (8 bytes each) between the header and the audio
  const buf = new ArrayBuffer(head + block.length * frames * 4)
  const v = new DataView(buf)
  v.setUint32(0, AUDIO_MAGIC, true)
  v.setUint32(4, instance, true)
  v.setUint32(8, seq >>> 0, true)
  v.setUint16(12, block.length, true)
  v.setUint16(14, reset ? 1 : 0, true)
  v.setUint32(16, frames, true)
  v.setUint32(20, midi.length, true)
  midi.forEach((e, i) => { const o = 24 + i * 8; v.setUint32(o, e[0], true); v.setUint8(o + 4, e[1]); v.setUint8(o + 5, e[2]); v.setUint8(o + 6, e[3]) })
  block.forEach((c, i) => new Float32Array(buf, head + i * frames * 4, frames).set(c))
  return buf
}

export function unpackBlock(buf: ArrayBuffer): { instance: number; seq: number; latency: number; block: Float32Array[] } | null {
  if (buf.byteLength < 24) return null
  const v = new DataView(buf)
  if (v.getUint32(0, true) !== AUDIO_MAGIC) return null
  const ch = v.getUint16(12, true), frames = v.getUint32(16, true)
  if (buf.byteLength < 24 + ch * frames * 4) return null
  const block: Float32Array[] = []
  for (let c = 0; c < ch; c++) block.push(new Float32Array(buf.slice(24 + c * frames * 4, 24 + (c + 1) * frames * 4)))
  return { instance: v.getUint32(4, true), seq: v.getUint32(8, true), latency: v.getUint32(20, true), block }
}
