// Tempo and time-signature changes (Cubase: tempo track and signature track; Ableton: tempo automation).
// Beats are quarter notes. Between two tempo points the tempo is constant (a step), like a tempo track
// in "jump" mode. Everything that turns beats into seconds goes through here.

import type { Project, SignaturePoint, TempoPoint } from '../types'

export type TimeProject = Pick<Project, 'bpm' | 'tempoMap' | 'timeSignature' | 'signatures'>

export function tempoPoints(p: TimeProject): TempoPoint[] {
  const extra = (p.tempoMap ?? []).filter((t) => t.beat > 0 && t.bpm > 0).sort((a, b) => a.beat - b.beat)
  return [{ beat: 0, bpm: p.bpm || 120 }, ...extra]
}

export function bpmAt(p: TimeProject, beat: number): number {
  let bpm = p.bpm || 120
  for (const t of tempoPoints(p)) { if (t.beat <= beat + 1e-9) bpm = t.bpm; else break }
  return bpm
}

export function hasTempoChanges(p: TimeProject): boolean {
  return (p.tempoMap ?? []).some((t) => t.beat > 0 && t.bpm > 0 && t.bpm !== p.bpm)
}

// seconds from beat 0 to `beat`
export function beatToSec(p: TimeProject, beat: number): number {
  const pts = tempoPoints(p)
  if (beat <= 0) return (beat * 60) / pts[0].bpm
  let sec = 0
  for (let i = 0; i < pts.length; i++) {
    const from = pts[i].beat
    const to = i + 1 < pts.length ? pts[i + 1].beat : Infinity
    if (beat <= from) break
    sec += ((Math.min(beat, to) - from) * 60) / pts[i].bpm
  }
  return sec
}

export function secToBeat(p: TimeProject, sec: number): number {
  const pts = tempoPoints(p)
  if (sec <= 0) return (sec * pts[0].bpm) / 60
  let left = sec
  for (let i = 0; i < pts.length; i++) {
    const span = i + 1 < pts.length ? pts[i + 1].beat - pts[i].beat : Infinity
    const spanSec = (span * 60) / pts[i].bpm
    if (left <= spanSec) return pts[i].beat + (left * pts[i].bpm) / 60
    left -= spanSec
  }
  return 0
}

// ── bars ─────────────────────────────────────────────────────────────────────

export const barBeats = (num: number, den: number): number => (num * 4) / (den || 4)

function signaturePoints(p: TimeProject): SignaturePoint[] {
  const [num, den] = p.timeSignature ?? [4, 4]
  const extra = (p.signatures ?? []).filter((s) => s.bar > 0 && s.num > 0).sort((a, b) => a.bar - b.bar)
  return [{ bar: 0, num, den }, ...extra]
}

export interface Bar { index: number; beat: number; num: number; den: number; length: number }

// every bar that starts before `untilBeat`
export function bars(p: TimeProject, untilBeat: number): Bar[] {
  const sigs = signaturePoints(p)
  const out: Bar[] = []
  let beat = 0
  let s = 0
  for (let index = 0; beat < untilBeat && index < 100000; index++) {
    while (s + 1 < sigs.length && sigs[s + 1].bar <= index) s++
    const { num, den } = sigs[s]
    const length = barBeats(num, den)
    out.push({ index, beat, num, den, length })
    beat += length
  }
  return out
}

export function barAt(p: TimeProject, beat: number): Bar {
  const list = bars(p, beat + 1e-6)
  return list[list.length - 1] ?? { index: 0, beat: 0, num: 4, den: 4, length: 4 }
}

// is `beat` the first beat of a bar (for the metronome accent)
export function isDownbeat(p: TimeProject, beat: number): boolean {
  return Math.abs(barAt(p, beat).beat - beat) < 1e-6
}

// "bar.beat" as DAWs show it, both counted from 1
export function formatPosition(p: TimeProject, beat: number): string {
  const b = barAt(p, beat)
  const inBar = Math.floor(((beat - b.beat) * b.den) / 4 + 1e-6) + 1
  return `${b.index + 1}.${inBar}`
}
