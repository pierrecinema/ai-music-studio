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

export const AUTO_LABEL = (param: AutoParam, returnName?: (id: string) => string): string =>
  param === 'volume' ? 'Volume' : param === 'pan' ? 'Pan' : `Send ${returnName?.(param.slice(5)) ?? ''}`.trim()
