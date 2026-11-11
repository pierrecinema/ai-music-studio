// The effects of return tracks (Ableton "Return tracks", Cubase "FX channels"): a reverb and a tempo delay.
import type { ReturnTrack } from '../types'

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
