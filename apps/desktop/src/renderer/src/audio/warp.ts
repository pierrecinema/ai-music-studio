// Warp markers: pin a moment of the audio file (seconds) to a beat of the clip; the audio between two
// markers is stretched or squeezed to fit, without changing its pitch (Ableton "warp markers", Cubase
// "AudioWarp"). Before the first and after the last marker the audio plays at its normal speed.

import type { WarpMarker } from '../types'
import { stretchBuffer } from './stretch'

// the start of the file is always pinned (like the first warp marker in Ableton): moving one marker
// stretches the audio between the start and that marker, it does not just shift everything
export function sortedMarkers(m: WarpMarker[] | undefined): WarpMarker[] {
  const list = [...(m ?? [])].filter((x) => x.src > 1e-6).sort((a, b) => a.src - b.src)
  return list.length ? [{ src: 0, beat: 0 }, ...list] : []
}

// clip beat (counted from the start of the FILE) at which file second `src` plays.
// `spbSrc` = file seconds per beat without markers.
export function beatOfSrc(markers: WarpMarker[] | undefined, src: number, spbSrc: number): number {
  const m = sortedMarkers(markers)
  if (!m.length) return src / spbSrc
  if (src <= m[0].src) return m[0].beat - (m[0].src - src) / spbSrc
  for (let i = 1; i < m.length; i++) {
    if (src <= m[i].src) {
      const a = m[i - 1], b = m[i]
      return a.beat + ((b.beat - a.beat) * (src - a.src)) / Math.max(1e-9, b.src - a.src)
    }
  }
  const last = m[m.length - 1]
  return last.beat + (src - last.src) / spbSrc
}

// the inverse: which file second plays at file beat `beat`
export function srcOfBeat(markers: WarpMarker[] | undefined, beat: number, spbSrc: number): number {
  const m = sortedMarkers(markers)
  if (!m.length) return beat * spbSrc
  if (beat <= m[0].beat) return m[0].src - (m[0].beat - beat) * spbSrc
  for (let i = 1; i < m.length; i++) {
    if (beat <= m[i].beat) {
      const a = m[i - 1], b = m[i]
      return a.src + ((b.src - a.src) * (beat - a.beat)) / Math.max(1e-9, b.beat - a.beat)
    }
  }
  const last = m[m.length - 1]
  return last.src + (beat - last.beat) * spbSrc
}

// markers must keep their order in time and in beats (a segment cannot run backwards)
export function validMarkers(m: WarpMarker[]): boolean {
  const s = sortedMarkers(m)
  for (let i = 1; i < s.length; i++) if (s[i].beat - s[i - 1].beat < 1e-3 || s[i].src - s[i - 1].src < 1e-3) return false
  return true
}

// segments of the file with their stretch ratio (output seconds / input seconds) at a fixed project tempo
export interface WarpSegment { srcFrom: number; srcTo: number; ratio: number }
export function warpSegments(markers: WarpMarker[] | undefined, fileSec: number, spbSrc: number, spbProject: number): WarpSegment[] {
  const m = sortedMarkers(markers).filter((x) => x.src > 0 && x.src < fileSec)
  const cuts = [0, ...m.map((x) => x.src), fileSec]
  const segs: WarpSegment[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1]
    if (b - a < 1e-4) continue
    const beats = beatOfSrc(markers, b, spbSrc) - beatOfSrc(markers, a, spbSrc)
    segs.push({ srcFrom: a, srcTo: b, ratio: (beats * spbProject) / (b - a) })
  }
  return segs
}

// Render the whole file with its markers at the project tempo. Output second t = file beat t / spbProject
// counted from the file beat of second 0.
export async function renderWarped(raw: AudioBuffer, markers: WarpMarker[], spbSrc: number, spbProject: number): Promise<AudioBuffer> {
  const sr = raw.sampleRate
  const ch = raw.numberOfChannels
  const pieces: AudioBuffer[] = []
  for (const seg of warpSegments(markers, raw.duration, spbSrc, spbProject)) {
    const a = Math.floor(seg.srcFrom * sr)
    const b = Math.min(raw.length, Math.floor(seg.srcTo * sr))
    if (b - a < 16) continue
    const part = new AudioBuffer({ length: b - a, numberOfChannels: ch, sampleRate: sr })
    for (let c = 0; c < ch; c++) part.copyToChannel(raw.getChannelData(c).slice(a, b), c)
    const ratio = Math.min(3.9, Math.max(0.26, seg.ratio))
    pieces.push(Math.abs(ratio - 1) < 0.002 ? part : await stretchBuffer(part, ratio))
  }
  const total = pieces.reduce((n, p) => n + p.length, 0)
  const out = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: ch, sampleRate: sr })
  const XF = Math.floor(0.004 * sr)                    // short crossfade at each joint: no clicks
  for (let c = 0; c < ch; c++) {
    const dst = out.getChannelData(c)
    let at = 0
    for (const [i, p] of pieces.entries()) {
      const src = p.getChannelData(c)
      for (let k = 0; k < src.length; k++) {
        let v = src[k]
        if (i > 0 && k < XF) v *= k / XF
        if (i < pieces.length - 1 && k > src.length - XF) v *= (src.length - k) / XF
        dst[at + k] = v
      }
      at += p.length
    }
  }
  return out
}
