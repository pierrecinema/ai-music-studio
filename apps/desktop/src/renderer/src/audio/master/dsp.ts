// Mastering DSP: loudness measurement (ITU-R BS.1770-4 / EBU R128), true peak, and the processors of the
// mastering chain (compressor, multiband compressor, stereo / mono bass, true-peak limiter).
//
// Every processor is a "core" class that works on plain Float32Arrays. The same classes run
//  - live in an AudioWorklet while a song plays (worklets.ts builds the worklet code from their source text), and
//  - in the offline render for the export and the analysis,
// so what is heard is exactly what is written to the file. For that the classes must stay self-contained:
// no imports, no helpers outside the class, no class fields (only assignments in the constructor); everything
// they need (filter coefficients, interpolation taps) comes in through the options object.

/** Biquad coefficients [b0, b1, b2, a1, a2] (a0 = 1). */
export type Coeffs = [number, number, number, number, number]

/** The two K-weighting filters of BS.1770 for any sample rate (formulas as in libebur128). */
export function kWeighting(sr: number): [Coeffs, Coeffs] {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196
  let K = Math.tan(Math.PI * f0 / sr)
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const shelf: Coeffs = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0,
    2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
  f0 = 38.13547087602444; Q = 0.5003270373238773
  K = Math.tan(Math.PI * f0 / sr)
  a0 = 1 + K / Q + K * K
  const hp: Coeffs = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
  return [shelf, hp]
}

/** 4x oversampling for the true peak: the three in-between phases, 12 taps each (windowed sinc). */
export function truePeakTaps(): number[][] {
  const taps = 12, phases = 4
  const out: number[][] = []
  for (let p = 1; p < phases; p++) {
    const row: number[] = []
    let sum = 0
    for (let t = 0; t < taps; t++) {
      const x = t - (taps / 2 - 1) - p / phases               // distance from the in-between point, in samples
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / (taps / 2))  // Hann window over the 12 taps
      row.push(sinc * w); sum += sinc * w
    }
    out.push(row.map((v) => v / sum))                          // unity gain at low frequencies
  }
  return out
}

/** Linkwitz-Riley 4 crossover (two Butterworth biquads in a row) at f: [low, high] coefficients. */
export function crossover(sr: number, f: number): { low: Coeffs; high: Coeffs } {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr
  const cs = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2)
  const a0 = 1 + al
  return {
    low: [(1 - cs) / 2 / a0, (1 - cs) / a0, (1 - cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0],
    high: [(1 + cs) / 2 / a0, -(1 + cs) / a0, (1 + cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0],
  }
}

// ── loudness meter ──────────────────────────────────────────────────────────────────────────────────────────────

export interface MeterReport {
  t: number              // seconds since the start
  momentary: number      // LUFS, 400 ms
  shortTerm: number      // LUFS, 3 s
  integrated: number     // LUFS, gated, since the start
  peak: number           // dBFS, sample peak of the last 100 ms
  truePeak: number       // dBTP, of the last 100 ms
  truePeakMax: number    // dBTP since the start
  rms: number            // dBFS, 300 ms
  correlation: number    // -1 … +1, 300 ms
  clips: number          // samples at or above 0 dBFS since the start
}

/** Measures loudness, peaks, RMS and stereo correlation of a stream; reports every 100 ms. */
export class MeterCore {
  constructor(opts: { sr: number; k: number[][]; tp: number[][] }) {
    this.sr = opts.sr
    this.k = opts.k
    this.tp = opts.tp
    this.hop = Math.round(opts.sr / 10)
    this.reset()
  }

  reset(): void {
    this.z = [[0, 0, 0, 0], [0, 0, 0, 0]]          // K-filter state per channel: shelf x1 x2 y1 y2 ... (see below)
    this.z2 = [[0, 0, 0, 0], [0, 0, 0, 0]]
    this.hist = [new Float32Array(12), new Float32Array(12)]  // last 12 samples per channel, for the true peak
    this.hpos = 0
    this.acc = 0; this.n = 0
    this.sq = 0; this.ll = 0; this.rr = 0; this.lr = 0
    this.pk = 0; this.tpk = 0
    this.sub = []                                     // K-weighted power of each 100 ms
    this.rmsSub = []; this.llSub = []; this.rrSub = []; this.lrSub = []
    this.blocks = []                                  // power of every 400 ms block (100 ms apart), for the gate
    this.tpMax = 0; this.clips = 0; this.ticks = 0
  }

  /** Feeds a block (1 or 2 channels); returns the reports finished in it. */
  process(ch: Float32Array[], frames: number): MeterReport[] {
    const out: MeterReport[] = []
    const two = ch.length > 1
    const L = ch[0], R = two ? ch[1] : ch[0]
    const k0 = this.k[0], k1 = this.k[1], taps = this.tp
    for (let i = 0; i < frames; i++) {
      let e = 0
      for (let c = 0; c < 2; c++) {
        const x = c === 0 ? L[i] : R[i]
        // K-weighting: two biquads (direct form I)
        const s = this.z[c], s2 = this.z2[c]
        const y1 = k0[0] * x + k0[1] * s[0] + k0[2] * s[1] - k0[3] * s[2] - k0[4] * s[3]
        s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y1
        const y2 = k1[0] * y1 + k1[1] * s2[0] + k1[2] * s2[1] - k1[3] * s2[2] - k1[4] * s2[3]
        s2[1] = s2[0]; s2[0] = y1; s2[3] = s2[2]; s2[2] = y2
        if (c === 1 && !two) break                    // mono: counted once below as both channels
        e += y2 * y2
        // peaks
        const a = Math.abs(x)
        if (a > this.pk) this.pk = a
        if (a >= 0.99999) this.clips++
        const h = this.hist[c]
        h[this.hpos] = x
        let tpv = a
        for (let p = 0; p < 3; p++) {
          const row = taps[p]
          let v = 0
          for (let t = 0; t < 12; t++) v += row[t] * h[(this.hpos + 1 + t) % 12]
          const av = Math.abs(v)
          if (av > tpv) tpv = av
        }
        if (tpv > this.tpk) this.tpk = tpv
      }
      if (!two) e *= 2
      this.hpos = (this.hpos + 1) % 12
      const l = L[i], r = R[i]
      this.acc += e
      this.sq += (l * l + r * r) / 2
      this.ll += l * l; this.rr += r * r; this.lr += l * r
      this.n++
      if (this.n >= this.hop) out.push(this.tick())
    }
    return out
  }

  tick(): MeterReport {
    const n = this.n
    this.sub.push(this.acc / n); this.rmsSub.push(this.sq / n)
    this.llSub.push(this.ll); this.rrSub.push(this.rr); this.lrSub.push(this.lr)
    if (this.sub.length > 30) this.sub.shift()
    if (this.rmsSub.length > 3) { this.rmsSub.shift(); this.llSub.shift(); this.rrSub.shift(); this.lrSub.shift() }
    this.acc = 0; this.sq = 0; this.ll = 0; this.rr = 0; this.lr = 0; this.n = 0
    this.ticks++
    const mean = (a: number[], k: number): number => {
      const s = a.slice(-k)
      let v = 0
      for (const x of s) v += x
      return v / Math.max(1, s.length)
    }
    const lufs = (p: number): number => (p > 0 ? -0.691 + 10 * Math.log10(p) : -Infinity)
    const mPow = mean(this.sub, 4)
    if (this.sub.length >= 4) this.blocks.push(mPow)
    // integrated: absolute gate -70 LUFS, then relative gate 10 LU below the mean of what passed
    let s1 = 0, n1 = 0
    for (const b of this.blocks) if (lufs(b) > -70) { s1 += b; n1++ }
    let integrated = -Infinity
    if (n1) {
      const gate = lufs(s1 / n1) - 10
      let s2 = 0, n2 = 0
      for (const b of this.blocks) if (lufs(b) > -70 && lufs(b) > gate) { s2 += b; n2++ }
      integrated = n2 ? lufs(s2 / n2) : -Infinity
    }
    let ll = 0, rr = 0, lr = 0
    for (let j = 0; j < this.llSub.length; j++) { ll += this.llSub[j]; rr += this.rrSub[j]; lr += this.lrSub[j] }
    const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity)
    if (this.tpk > this.tpMax) this.tpMax = this.tpk
    const rep: MeterReport = {
      t: this.ticks / 10,
      momentary: lufs(mPow),
      shortTerm: lufs(mean(this.sub, 30)),
      integrated,
      peak: db(this.pk),
      truePeak: db(this.tpk),
      truePeakMax: db(this.tpMax),
      rms: db(Math.sqrt(mean(this.rmsSub, 3))),
      correlation: ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 1,
      clips: this.clips,
    }
    this.pk = 0; this.tpk = 0
    return rep
  }
}

// ── processors ──────────────────────────────────────────────────────────────────────────────────────────────────

/** True-peak brickwall limiter with look-ahead: the output never goes above the ceiling (also between samples). */
export class LimiterCore {
  constructor(opts: { sr: number; channels: number; tp: number[][]; lookaheadMs?: number }) {
    this.sr = opts.sr
    this.chs = opts.channels
    this.tp = opts.tp
    this.L = Math.max(1, Math.round(opts.sr * (opts.lookaheadMs ?? 5) / 1000))
    this.D = 6                                       // the in-between peaks need 6 samples ahead
    this.size = 1
    while (this.size < this.L * 2 + 32) this.size *= 2
    this.mask = this.size - 1
    this.buf = []
    for (let c = 0; c < this.chs; c++) this.buf.push(new Float32Array(this.size))
    this.gq = new Float32Array(this.size)           // the gain each sample needs
    this.dqIdx = new Int32Array(this.size); this.dqVal = new Float32Array(this.size)
    this.dqHead = 0; this.dqTail = 0
    this.st = new Float64Array(this.size).fill(1)  // smoothed gain, per sample (1 before the start: no fade-in)
    this.sum = this.L + 1
    this.state = 1
    this.n = 0
    this.reduction = 1
    this.set({ gainDb: 0, ceilingDb: -1, releaseMs: 120 })
  }

  set(p: { gainDb?: number; ceilingDb?: number; releaseMs?: number }): void {
    if (p.gainDb !== undefined) this.gain = Math.pow(10, p.gainDb / 20)
    if (p.ceilingDb !== undefined) this.ceil = Math.pow(10, p.ceilingDb / 20) * 0.9995
    if (p.releaseMs !== undefined) this.rel = Math.exp(-1 / (Math.max(1, p.releaseMs) * this.sr / 1000))
  }

  /** Samples of delay between input and output. */
  latency(): number { return this.D + this.L }

  process(inp: Float32Array[], out: Float32Array[], frames: number): void {
    const L = this.L, D = this.D, m = this.mask, taps = this.tp
    let minG = 1
    for (let i = 0; i < frames; i++) {
      const n = this.n
      for (let c = 0; c < this.chs; c++) this.buf[c][n & m] = (inp[c] ? inp[c][i] : inp[0][i]) * this.gain
      // the peak of sample k = n - D: the sample itself and the three points after it (4x oversampled)
      const k = n - D
      let pk = 0
      for (let c = 0; c < this.chs; c++) {
        const b = this.buf[c]
        const a = Math.abs(b[k & m])
        if (a > pk) pk = a
        for (let p = 0; p < 3; p++) {
          const row = taps[p]
          let v = 0
          for (let t = 0; t < 12; t++) v += row[t] * b[(k - 5 + t) & m]
          const av = Math.abs(v)
          if (av > pk) pk = av
        }
      }
      const g = pk > this.ceil ? this.ceil / pk : 1
      // sliding minimum over the gains of k-L … k
      while (this.dqTail > this.dqHead && this.dqVal[(this.dqTail - 1) & m] >= g) this.dqTail--
      this.dqIdx[this.dqTail & m] = k; this.dqVal[this.dqTail & m] = g; this.dqTail++
      while (this.dqIdx[this.dqHead & m] < k - L) this.dqHead++
      const env = this.dqVal[this.dqHead & m]       // = the lowest gain needed in s … s+L, with s = k - L
      // down at once, up with the release time
      this.state = env < this.state ? env : env + (this.state - env) * this.rel
      const s = k - L
      this.sum += this.state
      this.st[s & m] = this.state
      this.sum -= this.st[(s - L - 1) & m]
      const gain = this.sum / (L + 1)               // average over s-L … s: never above what sample s needs
      for (let c = 0; c < this.chs; c++) {
        let y = s >= 0 ? this.buf[c][s & m] * gain : 0
        if (y > this.ceil) y = this.ceil; else if (y < -this.ceil) y = -this.ceil
        out[c][i] = y
      }
      if (gain < minG) minG = gain
      this.n = n + 1
      if ((this.n & 8191) === 0) {                  // re-add now and then, against rounding drift
        let t = 0
        for (let j = 0; j <= L; j++) t += this.st[(s - j) & m]
        this.sum = t
      }
    }
    if (minG < this.reduction) this.reduction = minG      // the strongest since it was last read (reset by the reader)
  }
}

/** Feed-forward compressor (peak / RMS detector, soft knee, attack, release, make-up), linked stereo. */
export class CompressorCore {
  constructor(opts: { sr: number; channels: number }) {
    this.sr = opts.sr
    this.chs = opts.channels
    this.env = 0
    this.gr = 0
    this.reduction = 0
    this.set({ thresholdDb: -18, ratio: 2, attackMs: 20, releaseMs: 200, kneeDb: 6, makeupDb: 0 })
  }

  set(p: { thresholdDb?: number; ratio?: number; attackMs?: number; releaseMs?: number; kneeDb?: number; makeupDb?: number }): void {
    if (p.thresholdDb !== undefined) this.th = p.thresholdDb
    if (p.ratio !== undefined) this.ratio = Math.max(1, p.ratio)
    if (p.attackMs !== undefined) this.att = Math.exp(-1 / (Math.max(0.05, p.attackMs) * this.sr / 1000))
    if (p.releaseMs !== undefined) this.relc = Math.exp(-1 / (Math.max(1, p.releaseMs) * this.sr / 1000))
    if (p.kneeDb !== undefined) this.knee = Math.max(0, p.kneeDb)
    if (p.makeupDb !== undefined) this.makeup = Math.pow(10, p.makeupDb / 20)
  }

  /** Gain reduction in dB for an input level in dB (soft knee). */
  curve(x: number): number {
    const t = this.th, k = this.knee, r = this.ratio
    if (2 * (x - t) < -k) return 0
    if (k > 0 && 2 * Math.abs(x - t) <= k) { const d = x - t + k / 2; return (1 / r - 1) * d * d / (2 * k) }
    return (1 / r - 1) * (x - t)
  }

  process(inp: Float32Array[], out: Float32Array[], frames: number): void {
    let most = 0
    for (let i = 0; i < frames; i++) {
      let a = 0
      for (let c = 0; c < this.chs; c++) { const v = Math.abs(inp[c] ? inp[c][i] : inp[0][i]); if (v > a) a = v }
      const x = a > 1e-9 ? 20 * Math.log10(a) : -180
      const want = -this.curve(x)                   // dB of reduction wanted (positive)
      this.gr = want > this.gr ? want + (this.gr - want) * this.att : want + (this.gr - want) * this.relc
      const g = Math.pow(10, -this.gr / 20) * this.makeup
      for (let c = 0; c < this.chs; c++) out[c][i] = (inp[c] ? inp[c][i] : inp[0][i]) * g
      if (this.gr > most) most = this.gr
    }
    if (most > this.reduction) this.reduction = most      // the strongest since it was last read (reset by the reader)
  }
}

/** Biquad helper for the cores below (direct form I, one state per channel and stage). */
export class BiquadBank {
  constructor(coeffs: number[], channels: number) {
    this.c = coeffs
    this.s = []
    for (let i = 0; i < channels; i++) this.s.push([0, 0, 0, 0])
  }

  run(x: number, ch: number): number {
    const c = this.c, s = this.s[ch]
    const y = c[0] * x + c[1] * s[0] + c[2] * s[1] - c[3] * s[2] - c[4] * s[3]
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y
    return y
  }
}

/** Three-band compressor: Linkwitz-Riley crossovers, a compressor and a level per band, summed again. */
export class MultibandCore {
  constructor(opts: { sr: number; channels: number; Comp: typeof CompressorCore; Bank: typeof BiquadBank; xo: number[][][] }) {
    this.chs = opts.channels
    this.sr = opts.sr
    this.Bank = opts.Bank
    this.bands = [0, 1, 2].map(() => new opts.Comp({ sr: opts.sr, channels: opts.channels }))
    this.level = [1, 1, 1]
    this.setXo(opts.xo)
    this.tmp = [0, 1, 2].map(() => Array.from({ length: opts.channels }, () => new Float32Array(128)))
    this.reductions = [0, 0, 0]
    this.reduction = 0
  }

  /** xo: [[low1, high1], [low2, high2]] coefficients of the two crossovers (from crossover()). */
  setXo(xo: number[][][]): void {
    const B = this.Bank, ch = this.chs
    // band 1: low of xo1 (twice = LR4); rest: high of xo1, then split by xo2. The low band also runs through an
    // all-pass of xo2 (low2 + high2) so the three bands sum flat.
    this.f = {
      l1: [new B(xo[0][0], ch), new B(xo[0][0], ch)], h1: [new B(xo[0][1], ch), new B(xo[0][1], ch)],
      l2: [new B(xo[1][0], ch), new B(xo[1][0], ch)], h2: [new B(xo[1][1], ch), new B(xo[1][1], ch)],
      apL: [new B(xo[1][0], ch), new B(xo[1][0], ch)], apH: [new B(xo[1][1], ch), new B(xo[1][1], ch)],
    }
  }

  set(band: number, p: Record<string, number>): void {
    if (p.levelDb !== undefined) this.level[band] = Math.pow(10, p.levelDb / 20)
    this.bands[band].set(p)
  }

  process(inp: Float32Array[], out: Float32Array[], frames: number): void {
    if (this.tmp[0][0].length < frames) this.tmp = [0, 1, 2].map(() => Array.from({ length: this.chs }, () => new Float32Array(frames)))
    const f = this.f
    for (let c = 0; c < this.chs; c++) {
      const x = inp[c] ?? inp[0]
      for (let i = 0; i < frames; i++) {
        const v = x[i]
        let low = f.l1[1].run(f.l1[0].run(v, c), c)
        low = f.apL[1].run(f.apL[0].run(low, c), c) + f.apH[1].run(f.apH[0].run(low, c), c)
        const rest = f.h1[1].run(f.h1[0].run(v, c), c)
        this.tmp[0][c][i] = low
        this.tmp[1][c][i] = f.l2[1].run(f.l2[0].run(rest, c), c)
        this.tmp[2][c][i] = f.h2[1].run(f.h2[0].run(rest, c), c)
      }
    }
    for (let b = 0; b < 3; b++) {
      this.bands[b].process(this.tmp[b], this.tmp[b], frames)
      this.reductions[b] = this.bands[b].reduction        // each band keeps its strongest until it is read
    }
    this.reduction = Math.max(this.reductions[0], this.reductions[1], this.reductions[2])
    for (let c = 0; c < this.chs; c++) {
      const o = out[c]
      for (let i = 0; i < frames; i++) o[i] = this.tmp[0][c][i] * this.level[0] + this.tmp[1][c][i] * this.level[1] + this.tmp[2][c][i] * this.level[2]
    }
  }
}

/** Stereo width (mid / side) and mono bass: the side signal below a frequency is removed. */
export class StereoCore {
  constructor(opts: { sr: number; Bank: typeof BiquadBank; hp: number[] | null }) {
    this.Bank = opts.Bank
    this.width = 1
    this.balance = 0
    this.setMono(opts.hp)
  }

  /** hp: high-pass coefficients for the side signal (mono below that frequency), or null (off). */
  setMono(hp: number[] | null): void {
    this.hp = hp ? [new this.Bank(hp, 1), new this.Bank(hp, 1)] : null
  }

  set(p: { width?: number; balance?: number }): void {
    if (p.width !== undefined) this.width = Math.max(0, p.width)
    if (p.balance !== undefined) this.balance = Math.max(-1, Math.min(1, p.balance))
  }

  process(inp: Float32Array[], out: Float32Array[], frames: number): void {
    const L = inp[0], R = inp[1] ?? inp[0]
    const gl = this.balance > 0 ? 1 - this.balance : 1, gr = this.balance < 0 ? 1 + this.balance : 1
    for (let i = 0; i < frames; i++) {
      const mid = (L[i] + R[i]) * 0.5
      let side = (L[i] - R[i]) * 0.5 * this.width
      if (this.hp) side = this.hp[1].run(this.hp[0].run(side, 0), 0)
      out[0][i] = (mid + side) * gl
      if (out[1]) out[1][i] = (mid - side) * gr
    }
  }
}

// ── whole-file analysis ─────────────────────────────────────────────────────────────────────────────────────────

export interface Analysis {
  duration: number
  integrated: number       // LUFS
  range: number            // LU (loudness range, EBU Tech 3342)
  truePeak: number         // dBTP
  samplePeak: number       // dBFS
  rms: number              // dBFS
  crest: number            // dB (peak to RMS)
  shortTermMax: number     // LUFS
  momentaryMax: number     // LUFS
  correlation: number      // average
  history: number[]        // short-term loudness every 0.5 s (LUFS)
  clips: number[]          // seconds where the waveform reaches 0 dBFS (up to 400)
}

/** Measures a whole file the way the live meter does (same code), plus the loudness range. */
export function analyze(channels: Float32Array[], sr: number): Analysis {
  const meter = new MeterCore({ sr, k: kWeighting(sr), tp: truePeakTaps() })
  const st: number[] = [], history: number[] = []
  let last: MeterReport | null = null, mMax = -Infinity, sMax = -Infinity, sq = 0, peak = 0, corr = 0, nCorr = 0
  const clips: number[] = []
  const n = channels[0].length
  const chunk = 4096
  for (let o = 0; o < n; o += chunk) {
    const len = Math.min(chunk, n - o)
    const part = channels.slice(0, 2).map((c) => c.subarray(o, o + len))
    for (const r of meter.process(part, len)) {
      last = r
      if (r.momentary > mMax) mMax = r.momentary
      if (r.t >= 3) { st.push(r.shortTerm); if (r.shortTerm > sMax) sMax = r.shortTerm }
      if (Math.round(r.t * 10) % 5 === 0) history.push(r.shortTerm)
      if (r.rms > -60) { corr += r.correlation; nCorr++ }
    }
  }
  for (let c = 0; c < Math.min(2, channels.length); c++) {
    const d = channels[c]
    let lastClip = -1
    for (let i = 0; i < n; i++) {
      const a = Math.abs(d[i])
      sq += d[i] * d[i]
      if (a > peak) peak = a
      if (a >= 0.99999 && i - lastClip > sr * 0.05 && clips.length < 400) { clips.push(i / sr); lastClip = i }
    }
  }
  const nch = Math.min(2, channels.length)
  const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity)
  const rms = db(Math.sqrt(sq / Math.max(1, n * nch)))
  // loudness range: short-term values above -70 LUFS and above (their energy mean - 20 LU), 10th to 95th percentile
  const pow = (l: number): number => Math.pow(10, (l + 0.691) / 10)
  const abs = st.filter((v) => v > -70)
  let range = 0
  if (abs.length > 1) {
    const meanL = -0.691 + 10 * Math.log10(abs.reduce((s, v) => s + pow(v), 0) / abs.length)
    const rel = abs.filter((v) => v > meanL - 20).sort((a, b) => a - b)
    if (rel.length > 1) {
      const q = (p: number): number => rel[Math.min(rel.length - 1, Math.max(0, Math.round(p * (rel.length - 1))))]
      range = q(0.95) - q(0.1)
    }
  }
  clips.sort((a, b) => a - b)
  return {
    duration: n / sr,
    integrated: last ? last.integrated : -Infinity,
    range,
    truePeak: last ? last.truePeakMax : -Infinity,
    samplePeak: db(peak),
    rms,
    crest: db(peak) - rms,
    shortTermMax: sMax,
    momentaryMax: mMax,
    correlation: nCorr ? corr / nCorr : 1,
    history,
    clips,
  }
}

// Fields the classes above set in their constructors (declared here so TypeScript knows them; no class fields,
// which would add helper code the worklet does not have).
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MeterCore { [k: string]: any }
export interface LimiterCore { [k: string]: any }
export interface CompressorCore { [k: string]: any }
export interface BiquadBank { [k: string]: any }
export interface MultibandCore { [k: string]: any }
export interface StereoCore { [k: string]: any }
