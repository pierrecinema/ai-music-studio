// Time stretching without changing the pitch (WSOLA: waveform similarity overlap-add).
//
// A loop recorded at 120 BPM has to play at 128 BPM in a 128 BPM project: it must get shorter, not higher.
// ratio = output length / input length (above 1 = slower). Works well for ratios between about 0.6 and 1.7,
// which covers normal tempo differences of loops and drum samples.

const FRAME = 2048            // window length in samples (about 46 ms at 44.1 kHz)
const HALF = FRAME / 2        // synthesis hop (50 % overlap)
const SEARCH = 384            // how far the cut may move to find the best fit (samples, each way)
const COARSE = 4              // the similarity search looks at every 4th sample: 16 times cheaper

export const MAX_STRETCH_SECONDS = 90   // longer files are not stretched (it would take too long)

function hann(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

// stretch one mono signal; `guide` (mono mix) decides the cut positions so that all channels stay in phase
function positions(guide: Float32Array, ratio: number): { analysis: Int32Array; outLen: number } {
  const hopA = HALF / ratio
  const frames = Math.max(1, Math.ceil(guide.length / hopA))
  const analysis = new Int32Array(frames)
  let prev = 0
  for (let k = 1; k < frames; k++) {
    const nominal = Math.round(k * hopA)
    const natural = prev + HALF                      // where the previous frame would continue by itself
    let best = nominal
    if (natural + FRAME < guide.length && nominal + FRAME < guide.length + SEARCH) {
      let bestScore = -Infinity
      for (let d = -SEARCH; d <= SEARCH; d += 2) {
        const c = nominal + d
        if (c < 0 || c + FRAME > guide.length) continue
        let score = 0
        for (let i = 0; i < FRAME; i += COARSE) score += guide[natural + i] * guide[c + i]
        if (score > bestScore) { bestScore = score; best = c }
      }
    }
    analysis[k] = best
    prev = best
  }
  return { analysis, outLen: Math.ceil(guide.length * ratio) + FRAME }
}

function render(src: Float32Array, analysis: Int32Array, outLen: number, win: Float32Array): Float32Array {
  const out = new Float32Array(outLen)
  const norm = new Float32Array(outLen)
  for (let k = 0; k < analysis.length; k++) {
    const a = analysis[k]
    const o = k * HALF
    if (o + FRAME > outLen) break
    for (let i = 0; i < FRAME; i++) {
      const s = a + i < src.length ? src[a + i] : 0
      out[o + i] += s * win[i]
      norm[o + i] += win[i]
    }
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-4) out[i] /= norm[i]
  return out
}

export async function stretchBuffer(buf: AudioBuffer, ratio: number): Promise<AudioBuffer> {
  if (Math.abs(ratio - 1) < 0.002) return buf
  if (!(ratio > 0.25 && ratio < 4)) throw new Error('The tempo difference is too large to sync.')
  const ch = buf.numberOfChannels
  const len = buf.length
  const guide = new Float32Array(len)
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) guide[i] += d[i] / ch
  }
  await new Promise((r) => setTimeout(r, 0))          // let the interface breathe before the heavy part
  const { analysis, outLen } = positions(guide, ratio)
  const win = hann(FRAME)
  const target = Math.max(1, Math.round(len * ratio))
  const out = new AudioBuffer({ length: target, numberOfChannels: ch, sampleRate: buf.sampleRate })
  for (let c = 0; c < ch; c++) {
    const rendered = render(buf.getChannelData(c), analysis, outLen, win)
    out.copyToChannel(rendered.subarray(0, target), c)
    await new Promise((r) => setTimeout(r, 0))
  }
  return out
}
