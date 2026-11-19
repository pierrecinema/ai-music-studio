// Automation lanes: breakpoints with straight lines in between (like Ableton and Cubase).
import type { AutoParam, AutoPoint, Track } from '../types'

export const rangeOf = (param: AutoParam): [number, number] => (param === 'pan' ? [-1, 1] : [0, 1])

export function sortedPoints(points: AutoPoint[] | undefined): AutoPoint[] {
  return [...(points ?? [])].sort((a, b) => a.beat - b.beat)
}

// the value of the lane at `beat` (before the first point: the first value; after the last: the last value)
export function valueAt(points: AutoPoint[] | undefined, beat: number, fallback: number): number {
  const pts = sortedPoints(points)
  if (!pts.length) return fallback
  if (beat <= pts[0].beat) return pts[0].value
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (beat <= b.beat) {
      const span = b.beat - a.beat
      return span <= 0 ? b.value : a.value + ((b.value - a.value) * (beat - a.beat)) / span
    }
  }
  return pts[pts.length - 1].value
}

export const hasAutomation = (t: Track, param: AutoParam): boolean => (t.automation?.[param]?.length ?? 0) > 0

// Write the lane into an AudioParam, from `fromBeat` on. `toTime(beat)` gives the context time of a beat;
// `scale` multiplies every value (mute/solo).
export function scheduleLane(
  param: AudioParam, points: AutoPoint[] | undefined, fromBeat: number, toTime: (beat: number) => number,
  scale = 1, fallback = 0
): void {
  const pts = sortedPoints(points)
  const t0 = Math.max(0, toTime(fromBeat))
  param.cancelScheduledValues(0)
  param.setValueAtTime(valueAt(pts, fromBeat, fallback) * scale, t0)
  for (const p of pts) {
    if (p.beat <= fromBeat) continue
    param.linearRampToValueAtTime(p.value * scale, toTime(p.beat))
  }
}

/** a lane of a plugin parameter: `fx:<insert id>:<parameter index>` */
export function fxParamOf(param: AutoParam): { fxId: string; index: number; key: string } | null {
  if (!param.startsWith('fx:')) return null
  const k = param.lastIndexOf(':')
  const key = param.slice(k + 1)
  return { fxId: param.slice(3, k), index: Number(key), key }    // index: a VST parameter; key: a built-in effect's setting
}

export const AUTO_LABEL = (param: AutoParam, returnName?: (id: string) => string, track?: Track): string => {
  if (param === 'volume') return 'Volume'
  if (param === 'pan') return 'Pan'
  const fp = fxParamOf(param)
  if (fp) {
    const fx = [...(track?.fx ?? []), ...(track?.instrument ? [track.instrument] : [])].find((f) => f.id === fp.fxId)
    return `${fx?.vst?.name ?? fx?.paramNames?.$ ?? 'Effect'}: ${fx?.paramNames?.[fp.key] ?? `#${fp.key}`}`
  }
  return `Send ${returnName?.(param.slice(5)) ?? ''}`.trim()
}

/** automation of a plugin parameter as events for the plugin host: [context time, 0xF4, index, value], a point every
 *  `step` seconds along ramps (and one at each breakpoint), from `fromBeat` to `toBeat` */
export function paramEvents(points: AutoPoint[] | undefined, index: number | string, fromBeat: number, toBeat: number,
  toTime: (beat: number) => number, step = 0.01): Array<[number, number, number | string, number]> {
  const pts = sortedPoints(points)
  if (!pts.length) return []
  const out: Array<[number, number, number | string, number]> = []
  const put = (beat: number): void => { out.push([toTime(beat), 0xf4, index, Math.max(0, Math.min(1, valueAt(pts, beat, 0)))]) }
  put(fromBeat)
  let prev = fromBeat
  const marks = pts.map((p) => p.beat).filter((b) => b > fromBeat && b < toBeat)
  for (const m of [...marks, toBeat]) {
    const a = valueAt(pts, prev, 0), b = valueAt(pts, m, 0)
    if (Math.abs(a - b) > 1e-6) {
      const t0 = toTime(prev), t1 = toTime(m)
      const n = Math.min(4000, Math.max(1, Math.ceil((t1 - t0) / step)))
      for (let k = 1; k < n; k++) put(prev + ((m - prev) * k) / n)
    }
    if (m < toBeat || marks.length === 0 || m === toBeat) put(Math.min(m, toBeat))
    prev = m
  }
  // one event per moment, in time order
  const seen = new Set<string>()
  return out.filter((e) => { const k = e[0].toFixed(6); if (seen.has(k)) return false; seen.add(k); return true }).sort((x, y) => x[0] - y[0])
}
