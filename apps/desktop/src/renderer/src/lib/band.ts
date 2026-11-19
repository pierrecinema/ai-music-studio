// The virtual band (AI Instruments page): a drummer, a bass player and a guitarist that play along with the song.
// They follow the chords of the song (read from its MIDI tracks or typed in) and play in a chosen style; what they
// play is MIDI, so it can be edited in the Piano Roll and played by the built-in sounds or any VST instrument.
// Everything here is deterministic for a given seed, so a part can be made again the same way.
import type { Note } from '../types'

export type Quality = 'maj' | 'min' | '7' | 'maj7' | 'min7' | 'dim' | 'sus4' | '5'
export interface Chord { root: number; quality: Quality; beat: number; length: number }   // root 0..11 (C = 0), beats
export type BandNote = Omit<Note, 'id'>

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7], '5': [0, 7],
}
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', '7': '7', maj7: 'maj7', min7: 'm7', dim: 'dim', sus4: 'sus4', '5': '5' }

export const chordName = (c: Pick<Chord, 'root' | 'quality'>): string => NAMES[c.root] + SUFFIX[c.quality]
export const chordTones = (c: Pick<Chord, 'root' | 'quality'>): number[] => INTERVALS[c.quality].map((i) => (c.root + i) % 12)

/** "Am", "C#m7", "Bb", "Fmaj7", "G7", "Dsus4", "E5", "F/A" (the bass note after / is ignored) */
export function parseChord(text: string): Pick<Chord, 'root' | 'quality'> | null {
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(text.trim().split('/')[0])
  if (!m) return null
  let root = NAMES.indexOf(m[1].toUpperCase())
  if (m[2] === '#') root += 1
  if (m[2] === 'b') root += 11
  const rest = m[3].trim()
  const q: Quality | undefined = ({
    '': 'maj', maj: 'maj', M: 'maj', m: 'min', min: 'min', '-': 'min', '7': '7', dom7: '7', maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7',
    m7: 'min7', min7: 'min7', '-7': 'min7', dim: 'dim', o: 'dim', sus4: 'sus4', sus: 'sus4', '5': '5',
  } as Record<string, Quality>)[rest]
  if (q === undefined) return null
  return { root: root % 12, quality: q }
}

/** "Am F C G" or "Am | F | C G": every chord lasts `beatsPerChord`; "|" starts a new bar (chords in a bar share it) */
export function parseProgression(text: string, beatsPerBar = 4, beatsPerChord = 4): { chords: Chord[]; bad: string[] } {
  const chords: Chord[] = []
  const bad: string[] = []
  const bars = text.includes('|') ? text.split('|').map((b) => b.trim()).filter(Boolean) : null
  let beat = 0
  if (bars) {
    for (const bar of bars) {
      const parts = bar.split(/\s+/).filter(Boolean)
      const len = beatsPerBar / parts.length
      for (const p of parts) {
        if (p === '-' || p === '%') { if (chords.length) chords[chords.length - 1].length += len; beat += len; continue }
        const c = parseChord(p)
        if (c) chords.push({ ...c, beat, length: len }); else bad.push(p)
        beat += len
      }
    }
  } else {
    for (const p of text.split(/[\s,]+/).filter(Boolean)) {
      if (p === '-' || p === '%') { if (chords.length) chords[chords.length - 1].length += beatsPerChord; beat += beatsPerChord; continue }
      const c = parseChord(p)
      if (c) chords.push({ ...c, beat, length: beatsPerChord }); else bad.push(p)
      beat += beatsPerChord
    }
  }
  return { chords, bad }
}

/** the chords repeated (or cut) to fill `beats` */
export function fillChords(chords: Chord[], beats: number): Chord[] {
  if (!chords.length) return []
  const cycle = chords[chords.length - 1].beat + chords[chords.length - 1].length
  const out: Chord[] = []
  for (let base = 0; base < beats; base += cycle) {
    for (const c of chords) {
      const b = base + c.beat
      if (b >= beats) break
      out.push({ ...c, beat: b, length: Math.min(c.length, beats - b) })
    }
  }
  return out
}

/** the chords of the song, read from its notes (absolute beats): one chord per `step` beats, the best match of
 * major, minor, 7th, minor 7th, diminished and sus4 to the notes sounding there (longer and lower notes count more).
 * A span with no notes keeps the chord before it. */
export function detectChords(notes: Array<{ pitch: number; start: number; duration: number }>, from: number, to: number, step = 4): Chord[] {
  const out: Chord[] = []
  for (let b = from; b < to - 1e-6; b += step) {
    const e = Math.min(to, b + step)
    const w = new Array(12).fill(0)
    let lowest = 128, lowPc = -1
    for (const n of notes) {
      const s = Math.max(b, n.start), t = Math.min(e, n.start + n.duration)
      if (t <= s) continue
      const weight = (t - s) * (1 + Math.max(0, 72 - n.pitch) / 48)
      w[n.pitch % 12] += weight
      if (n.pitch < lowest) { lowest = n.pitch; lowPc = n.pitch % 12 }
    }
    const total = w.reduce((a, x) => a + x, 0)
    if (total <= 0) {
      if (out.length) out[out.length - 1].length += e - b
      continue
    }
    let best: Chord | null = null, bestScore = -Infinity
    for (let root = 0; root < 12; root++) {
      for (const q of ['maj', 'min', '7', 'min7', 'maj7', 'dim', 'sus4'] as Quality[]) {
        const tones = INTERVALS[q].map((i) => (root + i) % 12)
        let score = 0
        for (let pc = 0; pc < 12; pc++) score += tones.includes(pc) ? w[pc] : -0.6 * w[pc]
        if (root === lowPc) score += 0.25 * total                          // the bass note is usually the root
        score += 0.15 * w[root]                                             // a chord whose root is played
        score -= (tones.length - 3) * 0.08 * total                          // a plain triad unless the extra note is there
        if (q === 'dim' || q === 'sus4') score -= 0.05 * total
        if (score > bestScore) { bestScore = score; best = { root, quality: q, beat: b, length: e - b } }
      }
    }
    const prev = out[out.length - 1]
    if (prev && best && prev.root === best.root && prev.quality === best.quality) prev.length += e - b
    else if (best) out.push(best)
  }
  return out
}

// ── a small random generator with a seed (a part can be made again the same way) ──

export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

export interface PlayOptions {
  bars: number
  beatsPerBar?: number            // 4 (other meters: the patterns are cut or repeated per bar)
  intensity?: number              // 0 quiet / sparse … 1 full / busy
  humanize?: number               // 0 exact … 1 loose (timing and velocity)
  swing?: number                  // 0 straight … 1 heavy swing of the 16ths
  seed?: number
}

function humanizeNotes(notes: BandNote[], o: PlayOptions, rand: () => number, bpm = 120): BandNote[] {
  const h = Math.max(0, Math.min(1, o.humanize ?? 0.3))
  const sw = Math.max(0, Math.min(1, o.swing ?? 0))
  const msToBeats = bpm / 60000
  return notes.map((n) => {
    let start = n.startTime
    const pos16 = Math.round(start * 4)
    if (sw > 0 && Math.abs(start * 4 - pos16) < 1e-6 && pos16 % 2 === 1) start += sw * 0.0833      // up to a triplet feel
    start += (rand() - 0.5) * 2 * h * 12 * msToBeats
    const velocity = Math.max(1, Math.min(127, Math.round(n.velocity * (1 + (rand() - 0.5) * 0.25 * h))))
    return { ...n, startTime: Math.max(0, start), velocity }
  })
}

// ── drummer ──────────────────────────────────────────────────────────────────

export const DRUM = { kick: 36, rim: 37, snare: 38, clap: 39, hat: 42, pedal: 44, open: 46, tomLow: 45, tomMid: 47, tomHigh: 50, floor: 41,
  crash: 49, ride: 51, bell: 53, tamb: 54, cowbell: 56, shaker: 70, conga: 63, congaLow: 64, bongo: 60 } as const

export type DrumStyle = 'rock' | 'pop' | 'hiphop' | 'trap' | 'house' | 'techhouse' | 'afrohouse' | 'funk' | 'reggaeton' | 'dnb' | 'ballad' | 'jazz' | 'bossa' | 'metal' | 'disco'
export const DRUM_STYLES: Array<{ id: DrumStyle; label: string; bpm: number }> = [
  { id: 'rock', label: 'Rock', bpm: 120 }, { id: 'pop', label: 'Pop', bpm: 110 }, { id: 'hiphop', label: 'Hip-hop / boom bap', bpm: 90 },
  { id: 'trap', label: 'Trap', bpm: 140 }, { id: 'house', label: 'House', bpm: 124 }, { id: 'techhouse', label: 'Tech house', bpm: 126 },
  { id: 'afrohouse', label: 'Afro house', bpm: 122 }, { id: 'funk', label: 'Funk', bpm: 100 }, { id: 'reggaeton', label: 'Reggaeton', bpm: 95 },
  { id: 'dnb', label: 'Drum & bass', bpm: 174 }, { id: 'ballad', label: 'Ballad', bpm: 70 }, { id: 'jazz', label: 'Jazz (swing)', bpm: 140 },
  { id: 'bossa', label: 'Bossa nova', bpm: 130 }, { id: 'metal', label: 'Metal', bpm: 160 }, { id: 'disco', label: 'Disco', bpm: 118 },
]

// one bar in 16th steps: [instrument, steps, velocity]
type Lane = [number, number[], number]
const GROOVES: Record<DrumStyle, { base: Lane[]; busy: Lane[]; hat: 'eighths' | 'sixteenths' | 'quarters' | 'ride' | 'none' }> = {
  rock: { base: [[DRUM.kick, [0, 8], 110], [DRUM.snare, [4, 12], 112]], busy: [[DRUM.kick, [10], 95]], hat: 'eighths' },
  pop: { base: [[DRUM.kick, [0, 6, 8], 105], [DRUM.snare, [4, 12], 108]], busy: [[DRUM.kick, [14], 85], [DRUM.tamb, [4, 12], 60]], hat: 'eighths' },
  hiphop: { base: [[DRUM.kick, [0, 7, 10], 112], [DRUM.snare, [4, 12], 115]], busy: [[DRUM.kick, [15], 80], [DRUM.snare, [15], 45]], hat: 'eighths' },
  trap: { base: [[DRUM.kick, [0, 7, 11], 115], [DRUM.clap, [8], 115]], busy: [[DRUM.kick, [14], 95], [DRUM.snare, [8], 90]], hat: 'sixteenths' },
  house: { base: [[DRUM.kick, [0, 4, 8, 12], 115], [DRUM.clap, [4, 12], 100], [DRUM.open, [2, 6, 10, 14], 80]], busy: [[DRUM.shaker, [1, 3, 5, 7, 9, 11, 13, 15], 55]], hat: 'none' },
  techhouse: { base: [[DRUM.kick, [0, 4, 8, 12], 118], [DRUM.clap, [4, 12], 100], [DRUM.open, [2, 6, 10, 14], 78], [DRUM.rim, [7, 13], 70]], busy: [[DRUM.shaker, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 45]], hat: 'none' },
  afrohouse: { base: [[DRUM.kick, [0, 4, 8, 12], 112], [DRUM.rim, [3, 6, 10, 14], 72], [DRUM.conga, [2, 5, 11], 80], [DRUM.congaLow, [7, 15], 85], [DRUM.shaker, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 50]], busy: [[DRUM.bongo, [9, 13], 70], [DRUM.clap, [4, 12], 70]], hat: 'none' },
  funk: { base: [[DRUM.kick, [0, 3, 10], 110], [DRUM.snare, [4, 12], 112], [DRUM.snare, [7, 9, 15], 38]], busy: [[DRUM.kick, [6, 14], 90], [DRUM.open, [14], 75]], hat: 'sixteenths' },
  reggaeton: { base: [[DRUM.kick, [0, 4, 8, 12], 112], [DRUM.snare, [3, 6, 11, 14], 100]], busy: [[DRUM.rim, [7, 15], 70]], hat: 'eighths' },
  dnb: { base: [[DRUM.kick, [0, 10], 115], [DRUM.snare, [4, 12], 115]], busy: [[DRUM.kick, [7], 90], [DRUM.snare, [9, 15], 45]], hat: 'eighths' },
  ballad: { base: [[DRUM.kick, [0, 10], 95], [DRUM.rim, [8], 90]], busy: [[DRUM.snare, [8], 95], [DRUM.kick, [6], 75]], hat: 'quarters' },
  jazz: { base: [[DRUM.pedal, [4, 12], 70]], busy: [[DRUM.snare, [7, 11], 40], [DRUM.kick, [0], 50]], hat: 'ride' },
  bossa: { base: [[DRUM.kick, [0, 3, 8, 11], 90], [DRUM.rim, [0, 3, 6, 10, 12], 85]], busy: [[DRUM.shaker, [1, 3, 5, 7, 9, 11, 13, 15], 50]], hat: 'eighths' },
  metal: { base: [[DRUM.kick, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 105], [DRUM.snare, [4, 12], 120]], busy: [[DRUM.crash, [0, 8], 90]], hat: 'none' },
  disco: { base: [[DRUM.kick, [0, 4, 8, 12], 112], [DRUM.snare, [4, 12], 105], [DRUM.open, [2, 6, 10, 14], 85]], busy: [[DRUM.tamb, [1, 3, 5, 7, 9, 11, 13, 15], 55]], hat: 'none' },
}

export interface DrumOptions extends PlayOptions { style: DrumStyle; fills?: 0 | 4 | 8; crashOnFirst?: boolean }

export function drummer(o: DrumOptions): BandNote[] {
  const rand = rng(o.seed ?? 1)
  const bpb = o.beatsPerBar ?? 4
  const steps = Math.round(bpb * 4)
  const g = GROOVES[o.style]
  const intensity = Math.max(0, Math.min(1, o.intensity ?? 0.5))
  const out: BandNote[] = []
  const hit = (pitch: number, beat: number, vel: number, dur = 0.25): void => { out.push({ pitch, startTime: beat, duration: dur, velocity: Math.max(1, Math.min(127, Math.round(vel))) }) }
  for (let bar = 0; bar < o.bars; bar++) {
    const b0 = bar * bpb
    const fillHere = !!o.fills && (bar + 1) % o.fills === 0
    const fillFrom = fillHere ? steps - (intensity > 0.6 ? 8 : 4) : steps
    // hats / ride
    for (let s = 0; s < Math.min(steps, fillFrom); s++) {
      const beatPos = b0 + s / 4
      const accent = s % 4 === 0 ? 1 : 0.75
      if (g.hat === 'eighths' && s % 2 === 0) hit(intensity > 0.85 && o.style === 'rock' ? DRUM.ride : DRUM.hat, beatPos, 82 * accent + 10 * intensity)
      if (g.hat === 'sixteenths') {
        if (o.style === 'trap' && intensity > 0.5 && s % 8 === 6 && rand() < 0.5) {     // a hat roll (32nds)
          for (let r = 0; r < 4; r++) hit(DRUM.hat, beatPos + r / 8, 60 + r * 8, 0.125)
          s += 1
          continue
        }
        if (intensity >= 0.3 || s % 2 === 0) hit(DRUM.hat, beatPos, (s % 2 === 0 ? 80 : 55) * accent + 12 * intensity)
      }
      if (g.hat === 'quarters' && s % 4 === 0) hit(DRUM.hat, beatPos, 70)
      if (g.hat === 'ride') {
        // the jazz ride: 1, 2, 2-a, 3, 4, 4-a (the "a" is swung by humanizeNotes)
        if (s % 4 === 0) hit(DRUM.ride, beatPos, s % 8 === 4 ? 92 : 80)
        if (s % 8 === 7) hit(DRUM.ride, beatPos, 65)
      }
    }
    const lanes = [...g.base, ...(intensity >= 0.6 ? g.busy : [])]
    for (const [pitch, list, vel] of lanes) {
      for (const s of list) if (s < fillFrom && s < steps) hit(pitch, b0 + s / 4, vel * (0.85 + 0.2 * intensity))
    }
    // a quieter player leaves out some of the extra kicks
    if (intensity < 0.25) {
      for (let i = out.length - 1; i >= 0; i--) {
        const n = out[i]
        if (n.startTime >= b0 && n.pitch === DRUM.kick && Math.abs((n.startTime - b0) % 2) > 1e-6 && rand() < 0.6) out.splice(i, 1)
      }
    }
    if ((bar === 0 && o.crashOnFirst !== false) || (bar > 0 && o.fills && bar % o.fills === 0)) {
      if (o.style !== 'jazz') hit(DRUM.crash, b0, 105)
    }
    if (fillHere) {
      // a fill: snare, then down the toms, louder towards the end
      const toms = [DRUM.snare, DRUM.snare, DRUM.tomHigh, DRUM.tomHigh, DRUM.tomMid, DRUM.tomMid, DRUM.tomLow, DRUM.floor]
      const n = steps - fillFrom
      for (let k = 0; k < n; k++) {
        const s = fillFrom + k
        if (intensity < 0.4 && k % 2 === 1) continue
        const which = toms[Math.min(toms.length - 1, Math.floor((k / n) * toms.length))]
        hit(o.style === 'house' || o.style === 'techhouse' || o.style === 'afrohouse' || o.style === 'trap' ? (k % 2 ? DRUM.snare : DRUM.clap) : which, b0 + s / 4, 80 + 35 * (k / n))
      }
      if (['house', 'techhouse', 'afrohouse', 'disco'].includes(o.style)) for (const s of [0, 4, 8, 12]) if (s >= fillFrom) hit(DRUM.kick, b0 + s / 4, 110)
    }
  }
  out.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch)
  return humanizeNotes(out, o, rand)
}

// ── bass player ──────────────────────────────────────────────────────────────

export type BassStyle = 'root' | 'eighths' | 'octaves' | 'rootfifth' | 'walking' | 'funk' | 'house' | '808' | 'reggae' | 'afro'
export const BASS_STYLES: Array<{ id: BassStyle; label: string }> = [
  { id: 'root', label: 'Long notes (root)' }, { id: 'eighths', label: 'Rock eighths' }, { id: 'rootfifth', label: 'Root and fifth (pop, country)' },
  { id: 'octaves', label: 'Octaves (disco)' }, { id: 'walking', label: 'Walking bass (jazz)' }, { id: 'funk', label: 'Funk (16ths, ghost notes)' },
  { id: 'house', label: 'House (offbeat)' }, { id: '808', label: '808 (trap, with the kick)' }, { id: 'reggae', label: 'Reggae (one drop)' },
  { id: 'afro', label: 'Afro house (syncopated)' },
]

export interface BassOptions extends PlayOptions { style: BassStyle; chords: Chord[]; octave?: number }

/** the root of the chord as a bass note: E1 .. D#2 (octave 1, like the open strings of a bass) or an octave higher */
export function bassRoot(root: number, octave = 1): number {
  return 28 + (octave - 1) * 12 + ((root - 4 + 12) % 12)
}

export function bassist(o: BassOptions): BandNote[] {
  const rand = rng((o.seed ?? 1) + 101)
  const bpb = o.beatsPerBar ?? 4
  const total = o.bars * bpb
  const chords = fillChords(o.chords, total)
  const intensity = Math.max(0, Math.min(1, o.intensity ?? 0.5))
  const oct = o.octave ?? 1
  const out: BandNote[] = []
  const play = (pitch: number, beat: number, dur: number, vel: number): void => {
    if (beat >= total - 1e-6) return
    out.push({ pitch, startTime: beat, duration: Math.max(0.05, Math.min(dur, total - beat)), velocity: Math.max(1, Math.min(127, Math.round(vel))) })
  }
  chords.forEach((c, ci) => {
    const r = bassRoot(c.root, oct)
    const third = r + (INTERVALS[c.quality].includes(3) ? 3 : 4)
    const fifth = r + (c.quality === 'dim' ? 6 : 7)
    const next = chords[ci + 1]
    const nextRoot = next ? bassRoot(next.root, oct) : r
    const b = c.beat, L = c.length
    const v = 95 + 20 * intensity
    switch (o.style) {
      case 'root':
        for (let t = 0; t < L; t += bpb) play(r, b + t, Math.min(bpb, L - t) - 0.05, v)
        if (intensity > 0.6 && L >= 2) play(fifth, b + L - 0.5, 0.45, v - 15)
        break
      case 'eighths':
        for (let t = 0; t < L; t += 0.5) play(r, b + t, 0.42, t % 1 === 0 ? v : v - 12)
        break
      case 'rootfifth':
        for (let t = 0; t < L; t += 1) play(t % 2 === 0 ? r : fifth - 12 < 28 ? fifth : fifth - 12, b + t, 0.9, v - (t % 2) * 8)
        break
      case 'octaves':
        for (let t = 0; t < L; t += 0.5) play(t % 1 === 0 ? r : r + 12, b + t, 0.4, t % 1 === 0 ? v : v - 10)
        break
      case 'walking': {
        // four quarter notes per bar: root, a chord tone, a passing tone, and a note next to the next chord's root
        for (let t = 0; t < L; t += 1) {
          const k = Math.round(t) % 4
          let p = r
          if (k === 1) p = rand() < 0.5 ? third : fifth
          else if (k === 2) p = rand() < 0.5 ? fifth : r + 12 - (rand() < 0.5 ? 2 : 0)
          else if (k === 3 || t + 1 >= L) p = nextRoot + (rand() < 0.5 ? -1 : 1)
          if (t === 0) p = r
          play(p, b + t, 0.92, v - 10 + (k === 0 ? 10 : 0))
        }
        break
      }
      case 'funk': {
        const pat = [[0, r, 0.2, 1], [0.75, r, 0.15, 0.4], [1.5, r + 12, 0.2, 0.9], [2.25, r, 0.15, 0.4], [2.5, fifth, 0.2, 0.85], [3.5, r + 12, 0.2, 0.8], [3.75, r + 10, 0.15, 0.7]]
        for (let t = 0; t < L; t += 4) for (const [d, p, dur, a] of pat) if (t + d < L && (intensity > 0.4 || a > 0.5)) play(p, b + t + d, dur, v * a)
        break
      }
      case 'house':
        for (let t = 0.5; t < L; t += 1) play(r, b + t, 0.4, v)
        if (intensity > 0.6) for (let t = 0.75; t < L; t += 2) play(r + 12, b + t, 0.2, v - 20)
        break
      case '808': {
        // long notes on the kicks of a trap beat (0, 1.75, 2.75), gliding down to the next root
        const hits = intensity > 0.6 ? [0, 1.75, 2.75, 3.5] : [0, 1.75, 2.75]
        for (let t = 0; t < L; t += 4) {
          hits.forEach((d, k) => {
            if (t + d >= L) return
            const end = k + 1 < hits.length ? hits[k + 1] : 4
            play(r - 12 < 24 ? r : r - 12, b + t + d, Math.min(end - d, L - t - d) - 0.05, v)
          })
        }
        break
      }
      case 'reggae':
        for (let t = 0; t < L; t += 4) {
          play(r, b + t + 0.5, 0.9, v); play(fifth, b + t + 1.5, 0.4, v - 10)
          if (t + 2 < L) { play(r + 12, b + t + 2.5, 0.4, v - 5); play(third, b + t + 3, 0.5, v - 10) }
        }
        break
      case 'afro':
        for (let t = 0; t < L; t += 4) for (const [d, p] of [[0, r], [0.75, r], [1.5, fifth], [2.5, r], [3.25, r + 12]] as Array<[number, number]>) {
          if (t + d < L) play(p, b + t + d, 0.35, v - (d % 1 ? 12 : 0))
        }
        break
    }
  })
  out.sort((a, b) => a.startTime - b.startTime)
  return humanizeNotes(out, { ...o, swing: o.style === 'walking' ? Math.max(o.swing ?? 0, 0.6) : o.swing }, rand)
}

// ── guitarist ────────────────────────────────────────────────────────────────

export type GuitarStyle = 'strum' | 'ballad' | 'arpeggio' | 'power' | 'funk' | 'reggae' | 'afro' | 'jazz'
export const GUITAR_STYLES: Array<{ id: GuitarStyle; label: string; distorted?: boolean }> = [
  { id: 'strum', label: 'Strumming (pop, acoustic)' }, { id: 'ballad', label: 'Ballad (long strums)' }, { id: 'arpeggio', label: 'Fingerpicking (arpeggio)' },
  { id: 'power', label: 'Power chords (rock)', distorted: true }, { id: 'funk', label: 'Funk (16th scratch)' }, { id: 'reggae', label: 'Reggae / ska (offbeat)' },
  { id: 'afro', label: 'Afro / highlife picking' }, { id: 'jazz', label: 'Jazz comping' },
]

/** a chord as a guitar would hold it: the root on a low string (E2 .. D#3), then the chord tones up to about E5 */
export function guitarVoicing(c: Pick<Chord, 'root' | 'quality'>, power = false): number[] {
  const root = 40 + ((c.root - 4 + 12) % 12)              // E2 = 40
  if (power) return [root, root + 7, root + 12]
  const tones = INTERVALS[c.quality]
  const out = [root]
  // standard open-position shape: root, fifth, octave, third, fifth, octave (with 7ths in place of an octave)
  const shape = [7, 12, 12 + (tones[1] ?? 4), 19, 24]
  for (const s of shape) {
    let p = root + s
    if (c.quality === 'sus4' && s === 12 + (tones[1] ?? 4)) p = root + 17
    if ((c.quality === '7' || c.quality === 'min7' || c.quality === 'maj7') && s === 12) p = root + (tones[3] ?? 10)
    if (c.quality === 'dim' && (s === 7 || s === 19)) p = root + s - 1
    if (c.quality === '5' && (s === 12 + (tones[1] ?? 4))) continue
    if (p <= 76) out.push(p)
  }
  return out
}

export interface GuitarOptions extends PlayOptions { style: GuitarStyle; chords: Chord[] }

export function guitarist(o: GuitarOptions): BandNote[] {
  const rand = rng((o.seed ?? 1) + 202)
  const bpb = o.beatsPerBar ?? 4
  const total = o.bars * bpb
  const chords = fillChords(o.chords, total)
  const intensity = Math.max(0, Math.min(1, o.intensity ?? 0.5))
  const out: BandNote[] = []
  const play = (pitch: number, beat: number, dur: number, vel: number): void => {
    if (beat >= total - 1e-6) return
    out.push({ pitch, startTime: beat, duration: Math.max(0.04, Math.min(dur, total - beat)), velocity: Math.max(1, Math.min(127, Math.round(vel))) })
  }
  // a strum: the strings one after the other (down: low to high, up: high to low), 10 to 18 ms apart at 120 BPM
  const strum = (notes: number[], beat: number, dur: number, vel: number, up = false): void => {
    const list = up ? [...notes].reverse().slice(0, Math.max(3, notes.length - 2)) : notes
    list.forEach((p, k) => play(p, beat + k * 0.028, dur - k * 0.028, vel * (up ? 0.8 : 1) - k * 2))
  }
  chords.forEach((c) => {
    const v = 80 + 25 * intensity
    const voice = guitarVoicing(c, o.style === 'power')
    const b = c.beat, L = c.length
    switch (o.style) {
      case 'strum': {
        // D - D U - U D U : the classic pop strum in eighths
        const pat: Array<[number, boolean]> = intensity > 0.5 ? [[0, false], [1, false], [1.5, true], [2.5, true], [3, false], [3.5, true]] : [[0, false], [1, false], [2, false], [2.5, true], [3, false]]
        for (let t = 0; t < L; t += 4) for (const [d, up] of pat) if (t + d < L) strum(voice, b + t + d, 0.48, v, up)
        break
      }
      case 'ballad':
        for (let t = 0; t < L; t += 2) strum(voice, b + t, Math.min(2, L - t) - 0.05, v - 10)
        break
      case 'arpeggio': {
        const order = [0, 2, 1, 3, 2, 4, 3, 5].map((i) => voice[Math.min(i, voice.length - 1)])
        for (let t = 0, k = 0; t < L; t += 0.5, k++) play(order[k % order.length], b + t, 0.9, v - 10 - (k % 2) * 6)
        break
      }
      case 'power':
        for (let t = 0; t < L; t += 0.5) {
          const accent = t % 2 === 0
          for (const p of voice) play(p, b + t, intensity > 0.5 ? 0.42 : 0.3, accent ? v + 5 : v - 12)
        }
        break
      case 'funk': {
        const top = voice.slice(-3)
        for (let t = 0; t < L; t += 0.25) {
          const s = Math.round(t * 4) % 16
          const hit = [0, 3, 6, 10, 12, 14].includes(s) || (intensity > 0.6 && rand() < 0.3)
          if (!hit) continue
          for (const p of top) play(p, b + t, 0.1, [0, 6, 12].includes(s) ? v + 5 : v - 25)
        }
        break
      }
      case 'reggae': {
        const top = voice.slice(-3)
        for (let t = 1; t < L; t += 2) { for (const p of top) play(p, b + t, 0.18, v); if (intensity > 0.6) for (const p of top) play(p, b + t + 0.5, 0.12, v - 25) }
        break
      }
      case 'afro': {
        const top = voice.slice(-4)
        const line = [3, 1, 2, 0, 3, 2, 1, 2].map((i) => top[Math.min(i, top.length - 1)])
        for (let t = 0, k = 0; t < L; t += 0.25, k++) if (k % 4 !== 3 || intensity > 0.6) play(line[k % line.length], b + t, 0.2, v - 15 + (k % 4 === 0 ? 12 : 0))
        break
      }
      case 'jazz': {
        const shell = voice.slice(1, 4)
        for (let t = 0; t < L; t += 4) for (const d of [0, 1.5, 2.5]) if (t + d < L && (d === 0 || rand() < 0.4 + 0.5 * intensity)) for (const p of shell) play(p, b + t + d, d === 0 ? 0.9 : 0.4, v - 15)
        break
      }
    }
  })
  out.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch)
  return humanizeNotes(out, o, rand)
}
