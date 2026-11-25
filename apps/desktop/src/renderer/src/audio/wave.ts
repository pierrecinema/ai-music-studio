// Waveforms drawn from the samples themselves, as detailed as the Mastering view at every zoom: each column of
// pixels shows the lowest and the highest sample of its time span (not one peak per 10 ms, which turns into blocks
// when zoomed in). For long spans a summary (lowest / highest of every BLOCK samples) keeps it fast.

export const BLOCK = 64

export interface WaveSource { length: number; sampleRate: number; numberOfChannels: number; getChannelData(c: number): Float32Array }

interface Summary { lo: Float32Array; hi: Float32Array }
const summaries = new WeakMap<object, Summary>()

function summary(buf: WaveSource): Summary {
  const hit = summaries.get(buf)
  if (hit) return hit
  const n = Math.ceil(buf.length / BLOCK)
  const lo = new Float32Array(n), hi = new Float32Array(n)
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    const d = buf.getChannelData(c)
    for (let k = 0; k < n; k++) {
      let l = lo[k], h = hi[k]
      const e = Math.min(d.length, (k + 1) * BLOCK)
      for (let i = k * BLOCK; i < e; i++) { const v = d[i]; if (v < l) l = v; if (v > h) h = v }
      lo[k] = l; hi[k] = h
    }
  }
  const s = { lo, hi }
  summaries.set(buf, s)
  return s
}

/** lowest and highest sample (both channels) between t0 and t1 seconds; [0, 0] outside the file */
export function minMax(buf: WaveSource, t0: number, t1: number): [number, number] {
  const a = Math.max(0, Math.floor(Math.min(t0, t1) * buf.sampleRate))
  const b = Math.min(buf.length, Math.max(a + 1, Math.ceil(Math.max(t0, t1) * buf.sampleRate)))
  if (a >= buf.length || b <= 0) return [0, 0]
  let lo = 0, hi = 0
  if (b - a >= BLOCK * 4) {
    const s = summary(buf)
    const k1 = Math.ceil(a / BLOCK), k2 = Math.floor(b / BLOCK)
    for (let k = k1; k < k2; k++) { if (s.lo[k] < lo) lo = s.lo[k]; if (s.hi[k] > hi) hi = s.hi[k] }
    // the partial blocks at both ends, sample by sample
    const edge = (from: number, to: number): void => {
      for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
        const d = buf.getChannelData(c)
        for (let i = from; i < to; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v }
      }
    }
    edge(a, Math.min(b, k1 * BLOCK)); edge(Math.max(a, k2 * BLOCK), b)
    return [lo, hi]
  }
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    const d = buf.getChannelData(c)
    for (let i = a; i < b; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v }
  }
  return [lo, hi]
}
