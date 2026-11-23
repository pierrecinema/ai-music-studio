// Album mastering: the songs of an album made to sit together. Every song keeps its own chain; these helpers work
// out how much louder or quieter each one has to be (and, gently, brighter or warmer) so the album sounds even.
import type { Chain, Slot } from './chain'

/** Gain changes (dB, for each song's "Louder") so that every song reaches the album's loudness.
 *  before: the songs' loudness without the chain (LUFS); after: with their chain now; target: the album target.
 *  keep (0..1): how much of a song's own difference to the album is kept: quiet songs (a ballad) stay a little quieter,
 *  loud ones a little louder, but never louder than the target plus 1 LU. */
export function planLoudness(before: number[], after: number[], target: number, keep = 0): number[] {
  const ok = before.filter((x) => Number.isFinite(x))
  const mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : target
  return after.map((a, i) => {
    if (!Number.isFinite(a)) return 0
    const own = Number.isFinite(before[i]) ? keep * (before[i] - mean) : 0
    const want = Math.min(target + 1, target + own)
    return Math.max(-24, Math.min(24, want - a))
  })
}

export interface Tone { low: number; high: number }     // dB of the lows (< ~150 Hz) and highs (> ~5 kHz) relative to all

/** How bassy and how bright a song is: the level of its lows and its highs relative to the whole signal (dB). */
export function toneOf(channels: Float32Array[], sr: number): Tone {
  const aLow = 1 - Math.exp((-2 * Math.PI * 150) / sr)
  const aHigh = Math.exp((-2 * Math.PI * 5000) / sr)
  let lp = 0, hpPrevIn = 0, hpPrevOut = 0
  let all = 0, low = 0, high = 0
  const n = channels[0].length
  const step = sr > 30000 ? 2 : 1                       // every second sample is plenty for a level
  for (let i = 0; i < n; i += step) {
    const x = channels.length > 1 ? (channels[0][i] + channels[1][i]) * 0.5 : channels[0][i]
    lp += aLow * (x - lp)
    const hp = aHigh * (hpPrevOut + x - hpPrevIn)
    hpPrevIn = x; hpPrevOut = hp
    all += x * x; low += lp * lp; high += hp * hp
  }
  const db = (e: number): number => 10 * Math.log10(Math.max(1e-12, e / Math.max(1e-12, all)))
  return { low: db(low), high: db(high) }
}

/** Gentle EQ changes that bring each song's lows and highs half way to the album's average (at most ±max dB). */
export function planTone(tones: Tone[], amount = 0.5, max = 3): Array<{ low: number; high: number }> {
  if (!tones.length) return []
  const avg = (k: keyof Tone): number => tones.reduce((a, t) => a + t[k], 0) / tones.length
  const L = avg('low'), H = avg('high')
  const clamp = (v: number): number => Math.round(Math.max(-max, Math.min(max, v)) * 10) / 10
  return tones.map((t) => ({ low: clamp(amount * (L - t.low)), high: clamp(amount * (H - t.high)) }))
}

/** The chain with "Louder" moved by dLouder and the EQ's low / high shelf by dLow / dHigh (the EQ is switched on). */
export function adjustChain(chain: Chain, dLouder: number, dLow = 0, dHigh = 0): Chain {
  const r = (v: number): number => Math.round(v * 10) / 10
  const slots = chain.slots.map((s) => {
    if (s.type !== 'eq' || (!dLow && !dHigh)) return s
    const p = s.p as Extract<Slot, { type: 'eq' }>['p']
    return { ...s, on: true, p: { ...p, lowG: r(Math.max(-12, Math.min(12, p.lowG + dLow))), highG: r(Math.max(-12, Math.min(12, p.highG + dHigh))) } }
  }) as Slot[]
  return { ...chain, slots, louderDb: r(Math.max(-12, Math.min(24, chain.louderDb + dLouder))) }
}

/** "01 - Title": the file name of a song on the album */
export const albumFileName = (index: number, name: string): string => `${String(index + 1).padStart(2, '0')} - ${name}`
