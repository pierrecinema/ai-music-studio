// MIDI song generator (AI Instruments page): a whole song as MIDI from a genre, a key and a tempo. It writes the
// chord progression of each part (intro, verse, chorus, bridge, outro) from the typical progressions of the genre,
// a melody that follows the chords (a motif per part, repeated with variations, higher in the chorus), and lets
// the virtual band (lib/band.ts) play drums, bass, guitar and keys on it, louder in the chorus.
// Deterministic for a given seed: "Take" makes another version.
import { bassist, drummer, guitarist, rng, type BandNote, type BassStyle, type Chord, type DrumStyle, type GuitarStyle, type Quality } from './band'

export type Mode = 'major' | 'minor'
export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'drop' | 'outro'
export interface Section { kind: SectionKind; bars: number }

export interface Genre {
  id: string; label: string; bpm: number; mode: Mode
  drums: DrumStyle; bass: BassStyle; guitar: GuitarStyle | null; keys: 'pad' | 'stabs' | 'arp' | 'none'
  swing?: number
  melody: { density: number; low: number; high: number }   // notes per beat (about), range of the melody
  form: Section[]
  progressions: Partial<Record<SectionKind, string[][]>>   // roman numerals, one chord per bar (or 2 per bar with "a/b")
}

const POP_FORM: Section[] = [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'pre', bars: 4 }, { kind: 'chorus', bars: 8 },
  { kind: 'verse', bars: 8 }, { kind: 'pre', bars: 4 }, { kind: 'chorus', bars: 8 }, { kind: 'bridge', bars: 8 }, { kind: 'chorus', bars: 8 }, { kind: 'outro', bars: 4 }]
const CLUB_FORM: Section[] = [{ kind: 'intro', bars: 8 }, { kind: 'verse', bars: 16 }, { kind: 'bridge', bars: 8 }, { kind: 'drop', bars: 16 },
  { kind: 'verse', bars: 8 }, { kind: 'bridge', bars: 8 }, { kind: 'drop', bars: 16 }, { kind: 'outro', bars: 8 }]

export const GENRES: Genre[] = [
  { id: 'pop', label: 'Pop', bpm: 112, mode: 'major', drums: 'pop', bass: 'rootfifth', guitar: 'strum', keys: 'pad', melody: { density: 1.2, low: 62, high: 79 }, form: POP_FORM,
    progressions: { intro: [['I', 'V', 'vi', 'IV']], verse: [['vi', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V']], pre: [['IV', 'V', 'vi', 'V']], chorus: [['I', 'V', 'vi', 'IV'], ['IV', 'I', 'V', 'vi']], bridge: [['vi', 'IV', 'ii', 'V']], outro: [['IV', 'V', 'I', 'I']] } },
  { id: 'rock', label: 'Rock', bpm: 124, mode: 'major', drums: 'rock', bass: 'eighths', guitar: 'power', keys: 'none', melody: { density: 1, low: 60, high: 77 }, form: POP_FORM,
    progressions: { intro: [['I', 'bVII', 'IV', 'I']], verse: [['I', 'bVII', 'IV', 'I'], ['vi', 'IV', 'I', 'V']], pre: [['IV', 'IV', 'V', 'V']], chorus: [['I', 'V', 'vi', 'IV'], ['IV', 'I', 'V', 'V']], bridge: [['vi', 'V', 'IV', 'V']], outro: [['I', 'bVII', 'IV', 'I']] } },
  { id: 'ballad', label: 'Ballad', bpm: 72, mode: 'major', drums: 'ballad', bass: 'root', guitar: 'arpeggio', keys: 'pad', melody: { density: 0.8, low: 60, high: 77 }, form: POP_FORM,
    progressions: { intro: [['I', 'IV', 'I', 'IV']], verse: [['I', 'iii', 'IV', 'V'], ['vi', 'iii', 'IV', 'I']], pre: [['ii', 'iii', 'IV', 'V']], chorus: [['IV', 'V', 'iii', 'vi'], ['I', 'V', 'vi', 'IV']], bridge: [['vi', 'V', 'IV', 'V']], outro: [['IV', 'V', 'I', 'I']] } },
  { id: 'house', label: 'House', bpm: 124, mode: 'minor', drums: 'house', bass: 'house', guitar: null, keys: 'stabs', melody: { density: 1, low: 64, high: 81 }, form: CLUB_FORM,
    progressions: { intro: [['i', 'i', 'VI', 'VII']], verse: [['i', 'VI', 'III', 'VII']], bridge: [['iv', 'VI', 'VII', 'VII']], drop: [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'VI', 'VII']], outro: [['i', 'i', 'VI', 'VII']] } },
  { id: 'techhouse', label: 'Tech house', bpm: 126, mode: 'minor', drums: 'techhouse', bass: 'house', guitar: null, keys: 'stabs', melody: { density: 1.4, low: 60, high: 74 }, form: CLUB_FORM,
    progressions: { intro: [['i', 'i', 'i', 'i']], verse: [['i', 'i', 'iv', 'i']], bridge: [['i', 'VII', 'VI', 'VII']], drop: [['i', 'i', 'iv', 'VII']], outro: [['i', 'i', 'i', 'i']] } },
  { id: 'afrohouse', label: 'Afro house', bpm: 122, mode: 'minor', drums: 'afrohouse', bass: 'afro', guitar: 'afro', keys: 'pad', melody: { density: 1, low: 62, high: 79 }, form: CLUB_FORM,
    progressions: { intro: [['i', 'VII', 'VI', 'VII']], verse: [['i', 'VII', 'VI', 'VII'], ['i', 'iv', 'VII', 'III']], bridge: [['VI', 'VII', 'i', 'i']], drop: [['i', 'VII', 'VI', 'VII'], ['i', 'v', 'VI', 'VII']], outro: [['i', 'VII', 'VI', 'VII']] } },
  { id: 'trap', label: 'Trap / rap', bpm: 140, mode: 'minor', drums: 'trap', bass: '808', guitar: null, keys: 'arp', melody: { density: 1.1, low: 62, high: 77 }, form: POP_FORM,
    progressions: { intro: [['i', 'VI', 'i', 'VI']], verse: [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'VI', 'v']], pre: [['VI', 'VI', 'VII', 'VII']], chorus: [['i', 'VI', 'III', 'VII']], bridge: [['iv', 'VI', 'i', 'VII']], outro: [['i', 'VI', 'i', 'VI']] } },
  { id: 'funk', label: 'Funk', bpm: 102, mode: 'minor', drums: 'funk', bass: 'funk', guitar: 'funk', keys: 'stabs', melody: { density: 1.4, low: 60, high: 76 }, form: POP_FORM,
    progressions: { intro: [['i7', 'i7', 'IV7', 'IV7']], verse: [['i7', 'i7', 'IV7', 'IV7']], pre: [['VI', 'VII', 'VI', 'VII']], chorus: [['i7', 'IV7', 'i7', 'IV7']], bridge: [['VI', 'v7', 'iv7', 'VII']], outro: [['i7', 'i7', 'IV7', 'IV7']] } },
  { id: 'reggaeton', label: 'Reggaeton', bpm: 95, mode: 'minor', drums: 'reggaeton', bass: 'root', guitar: null, keys: 'stabs', melody: { density: 1.3, low: 62, high: 77 }, form: POP_FORM,
    progressions: { intro: [['i', 'VI', 'III', 'VII']], verse: [['i', 'VI', 'III', 'VII']], pre: [['iv', 'VI', 'VII', 'VII']], chorus: [['i', 'VI', 'III', 'VII']], bridge: [['VI', 'VII', 'i', 'i']], outro: [['i', 'VI', 'III', 'VII']] } },
  { id: 'jazz', label: 'Jazz', bpm: 132, mode: 'major', drums: 'jazz', bass: 'walking', guitar: 'jazz', keys: 'none', swing: 0.6, melody: { density: 1.3, low: 60, high: 79 }, form: POP_FORM,
    progressions: { intro: [['ii7', 'V7', 'Imaj7', 'Imaj7']], verse: [['Imaj7', 'vi7', 'ii7', 'V7'], ['iii7', 'vi7', 'ii7', 'V7']], pre: [['IVmaj7', 'iv7', 'iii7', 'VI7']], chorus: [['ii7', 'V7', 'Imaj7', 'VI7']], bridge: [['IVmaj7', 'IVmaj7', 'iii7', 'VI7']], outro: [['ii7', 'V7', 'Imaj7', 'Imaj7']] } },
  { id: 'reggae', label: 'Reggae', bpm: 76, mode: 'major', drums: 'ballad', bass: 'reggae', guitar: 'reggae', keys: 'stabs', melody: { density: 1, low: 62, high: 77 }, form: POP_FORM,
    progressions: { intro: [['I', 'IV', 'I', 'V']], verse: [['I', 'IV', 'I', 'V'], ['vi', 'IV', 'I', 'V']], pre: [['IV', 'IV', 'V', 'V']], chorus: [['I', 'V', 'vi', 'IV']], bridge: [['ii', 'V', 'I', 'vi']], outro: [['I', 'IV', 'I', 'V']] } },
  { id: 'metal', label: 'Metal', bpm: 150, mode: 'minor', drums: 'metal', bass: 'eighths', guitar: 'power', keys: 'none', melody: { density: 1, low: 57, high: 74 }, form: POP_FORM,
    progressions: { intro: [['i', 'VI', 'VII', 'i']], verse: [['i', 'i', 'VI', 'VII'], ['i', 'bII', 'i', 'VII']], pre: [['iv', 'iv', 'V', 'V']], chorus: [['VI', 'VII', 'i', 'i'], ['i', 'VI', 'III', 'VII']], bridge: [['iv', 'VI', 'VII', 'V']], outro: [['i', 'VI', 'VII', 'i']] } },
]

export const SECTION_LABEL: Record<SectionKind, string> = { intro: 'Intro', verse: 'Verse', pre: 'Pre-chorus', chorus: 'Chorus', bridge: 'Bridge', drop: 'Drop', outro: 'Outro' }
const INTENSITY: Record<SectionKind, number> = { intro: 0.3, verse: 0.45, pre: 0.6, chorus: 0.85, bridge: 0.5, drop: 0.95, outro: 0.3 }

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** "vi", "bVII", "IVmaj7", "ii7", "V7", "i7", "vii°" in a key → a chord (root 0..11 and quality) */
export function romanChord(rn: string, key: number, mode: Mode): Pick<Chord, 'root' | 'quality'> {
  const m = /^(b|#)?(i{1,3}|iv|v|vi{0,2}|I{1,3}|IV|V|VI{0,2})(°|dim)?(maj7|7)?$/.exec(rn.trim())
  if (!m) throw new Error(`Not a roman numeral: ${rn}`)
  const deg = ROMAN.indexOf(m[2].toUpperCase())
  const scale = mode === 'major' ? MAJOR : MINOR
  let root = (key + scale[deg] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12
  // in minor, "bII" / "bVII" etc. are written against the major scale of the same tonic
  if (m[1] && mode === 'minor') root = (key + MAJOR[deg] + (m[1] === 'b' ? -1 : 1) + 12) % 12
  const lower = m[2] === m[2].toLowerCase()
  let quality: Quality = lower ? 'min' : 'maj'
  if (m[3]) quality = 'dim'
  if (m[4] === '7') quality = lower ? 'min7' : '7'
  if (m[4] === 'maj7') quality = 'maj7'
  return { root, quality }
}

export interface SongOptions {
  genre: string
  key: number               // 0 = C … 11 = B
  mode?: Mode
  bpm?: number
  seed?: number
  form?: Section[]
  parts?: { melody?: boolean; chords?: boolean; bass?: boolean; drums?: boolean; guitar?: boolean }
}

export interface SongPart {
  id: 'melody' | 'chords' | 'bass' | 'drums' | 'guitar'; name: string; sound: 'lead' | 'keys' | 'bass' | '808' | 'drums' | 'guitar' | 'eguitar'; notes: BandNote[]
  program?: number          // the sound pack's General MIDI instrument for this genre (the built-in sound without the pack)
  volume: number            // a starting mix: drums and bass in front, keys and guitar behind the melody
  reverb?: number           // room for this part (sound pack)
}

// The instruments of each genre from the sound pack (General MIDI programs; 128 = standard drum kit, 128+25 = TR-808,
// 128+24 = electronic kit, 128+32 = jazz kit; -1 = keep the built-in sound, like the 808 bass) and how much room each
// part gets. Without the pack the built-in sounds play.
type Band = Record<SongPart['id'], number>
const BANDS: Record<string, { p: Band; room?: Partial<Band> }> = {
  pop: { p: { melody: 0, chords: 4, bass: 33, drums: 128, guitar: 25 } },
  rock: { p: { melody: 29, chords: 16, bass: 34, drums: 128, guitar: 29 }, room: { melody: 0.15 } },
  ballad: { p: { melody: 0, chords: 48, bass: 32, drums: 128 + 40, guitar: 24 }, room: { melody: 0.3, chords: 0.4 } },
  house: { p: { melody: 81, chords: 4, bass: 38, drums: 128 + 24, guitar: 27 } },
  techhouse: { p: { melody: 81, chords: 89, bass: 38, drums: 128 + 24, guitar: 27 } },
  afrohouse: { p: { melody: 12, chords: 4, bass: 33, drums: 128 + 24, guitar: 27 }, room: { melody: 0.28 } },
  trap: { p: { melody: 8, chords: 89, bass: -1, drums: 128 + 25, guitar: 24 }, room: { melody: 0.3 } },
  funk: { p: { melody: 61, chords: 7, bass: 36, drums: 128, guitar: 28 }, room: { chords: 0.1 } },
  reggaeton: { p: { melody: 75, chords: 0, bass: 38, drums: 128 + 25, guitar: 24 } },
  jazz: { p: { melody: 65, chords: 0, bass: 32, drums: 128 + 32, guitar: 26 }, room: { melody: 0.25 } },
  reggae: { p: { melody: 22, chords: 16, bass: 33, drums: 128, guitar: 27 } },
  metal: { p: { melody: 30, chords: 48, bass: 34, drums: 128 + 16, guitar: 30 }, room: { melody: 0.12 } }
}
const LEVEL: Band = { melody: 0.78, chords: 0.55, bass: 0.82, drums: 0.85, guitar: 0.6 }
function dress(genre: string, part: Omit<SongPart, 'volume'>): SongPart {
  const b = BANDS[genre]
  const program = b?.p[part.id]
  return { ...part, program: program !== undefined && program >= 0 ? program : undefined, volume: LEVEL[part.id], reverb: b?.room?.[part.id] }
}
export interface Song { bpm: number; bars: number; sections: Array<Section & { bar: number }>; chords: Chord[]; parts: SongPart[] }

const CHORD_TONES: Record<Quality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7], '5': [0, 7] }

/** a melody over the chords: a 2-bar motif per section, repeated and varied; chord tones on strong beats */
function melodyFor(chords: Chord[], sections: Array<Section & { bar: number }>, key: number, mode: Mode, g: Genre, rand: () => number): BandNote[] {
  const scale = (mode === 'major' ? MAJOR : MINOR).map((s) => (key + s) % 12)
  const inScale = (p: number): boolean => scale.includes(((p % 12) + 12) % 12)
  const out: BandNote[] = []
  const motifs = new Map<SectionKind, Array<{ t: number; d: number; step: number }>>()
  const chordAt = (beat: number): Chord => chords.find((c) => beat >= c.beat && beat < c.beat + c.length) ?? chords[chords.length - 1]
  for (const s of sections) {
    if (s.kind === 'intro' || s.kind === 'outro') continue
    // the rhythm of the motif: 2 bars of 8th-note slots, filled by the genre's density
    let motif = motifs.get(s.kind)
    if (!motif) {
      motif = []
      let t = 0
      while (t < 8) {
        const long = rand() < 0.35 / g.melody.density
        const d = long ? (rand() < 0.5 ? 1 : 1.5) : 0.5
        if (rand() < 0.82 || t === 0) motif.push({ t, d: Math.min(d, 8 - t), step: Math.round((rand() - 0.5) * 4) })
        t += d
      }
      motifs.set(s.kind, motif)
    }
    const lift = s.kind === 'chorus' || s.kind === 'drop' ? 4 : s.kind === 'pre' ? 2 : 0
    const lo = g.melody.low + lift, hi = g.melody.high + lift
    let prev = Math.round((lo + hi) / 2)
    for (let b = 0; b < s.bars; b += 2) {
      const vary = b % 4 === 2                               // every second time the motif answers itself a little differently
      for (const n of motif) {
        const beat = (s.bar + b) * 4 + n.t
        if (beat >= (s.bar + s.bars) * 4) break
        const ch = chordAt(beat)
        const tones = CHORD_TONES[ch.quality].map((i) => (ch.root + i) % 12)
        const strong = n.t % 1 === 0
        let target = prev + n.step + (vary ? (rand() < 0.5 ? 2 : -2) : 0)
        target = Math.max(lo, Math.min(hi, target))
        // strong beats: the nearest chord tone; weak beats: the nearest note of the scale
        let best = target, dist = 99
        for (let p = target - 6; p <= target + 6; p++) {
          const ok = strong ? tones.includes(((p % 12) + 12) % 12) : inScale(p)
          if (ok && Math.abs(p - target) < dist && p >= lo - 2 && p <= hi + 2) { best = p; dist = Math.abs(p - target) }
        }
        // nothing fitting nearby (at the edge of the range): the nearest note of the scale
        if (dist === 99) for (let k = 0; k < 12; k++) { if (inScale(target - k)) { best = target - k; break } if (inScale(target + k)) { best = target + k; break } }
        prev = best
        out.push({ pitch: best, startTime: beat, duration: Math.max(0.2, n.d * 0.92), velocity: strong ? 100 : 86 })
      }
      // end of the phrase (every 4 bars): hold the root of the chord
      if (b % 4 === 2 && out.length) {
        const last = out[out.length - 1]
        const ch = chordAt(last.startTime)
        const root = ch.root + 12 * Math.round((last.pitch - ch.root) / 12)
        if (inScale(root) && root >= lo - 2 && root <= hi + 2) last.pitch = root
      }
    }
  }
  return out
}

/** the chords as a keyboard part: long pad chords, short stabs on the offbeats or a 16th arpeggio */
function keysFor(chords: Chord[], style: Genre['keys'], sections: Array<Section & { bar: number }>): BandNote[] {
  const out: BandNote[] = []
  const levelAt = (beat: number): number => INTENSITY[sections.find((s) => beat >= s.bar * 4 && beat < (s.bar + s.bars) * 4)?.kind ?? 'verse']
  for (const c of chords) {
    const tones = CHORD_TONES[c.quality]
    const base = 60 + c.root - (c.root > 7 ? 12 : 0)              // the chord sits between G3 and G4
    const voice = tones.map((i) => base + i).concat(base + 12)
    const v = Math.round(70 + 30 * levelAt(c.beat))
    if (style === 'pad') for (const p of voice) out.push({ pitch: p, startTime: c.beat, duration: c.length - 0.05, velocity: v - 10 })
    if (style === 'stabs') for (let t = 0.5; t < c.length; t += 1) for (const p of voice.slice(0, 3)) out.push({ pitch: p + 12, startTime: c.beat + t, duration: 0.2, velocity: v })
    if (style === 'arp') for (let t = 0, k = 0; t < c.length; t += 0.25, k++) out.push({ pitch: voice[k % voice.length] + 12, startTime: c.beat + t, duration: 0.2, velocity: v - 15 + (k % 4 === 0 ? 12 : 0) })
  }
  return out
}

export function generateSong(o: SongOptions): Song {
  const g = GENRES.find((x) => x.id === o.genre) ?? GENRES[0]
  const mode = o.mode ?? g.mode
  const bpm = o.bpm ?? g.bpm
  const rand = rng(o.seed ?? 1)
  const form = o.form ?? g.form
  const sections: Array<Section & { bar: number }> = []
  let bar = 0
  for (const s of form) { sections.push({ ...s, bar }); bar += s.bars }
  const total = bar
  // the chords of each kind of section stay the same each time it comes back (like a real song)
  const picked = new Map<SectionKind, string[]>()
  const chords: Chord[] = []
  for (const s of sections) {
    let prog = picked.get(s.kind)
    if (!prog) {
      const options = g.progressions[s.kind] ?? g.progressions.verse ?? [['I', 'IV', 'V', 'I']]
      prog = options[Math.floor(rand() * options.length)]
      picked.set(s.kind, prog)
    }
    for (let b = 0; b < s.bars; b++) {
      const rn = prog[b % prog.length]
      const c = romanChord(rn, o.key, mode)
      const beat = (s.bar + b) * 4
      const prev = chords[chords.length - 1]
      if (prev && prev.root === c.root && prev.quality === c.quality && prev.beat + prev.length === beat) prev.length += 4
      else chords.push({ ...c, beat, length: 4 })
    }
  }
  const want = { melody: true, chords: true, bass: true, drums: true, guitar: true, ...(o.parts ?? {}) }
  const parts: SongPart[] = []
  // the band plays each section with its own intensity
  const bySection = <T extends BandNote>(make: (s: Section & { bar: number }, intensity: number, chords: Chord[]) => T[]): BandNote[] =>
    sections.flatMap((s) => {
      const local = chords.filter((c) => c.beat < (s.bar + s.bars) * 4 && c.beat + c.length > s.bar * 4)
        .map((c) => ({ ...c, beat: Math.max(0, c.beat - s.bar * 4), length: Math.min(c.beat + c.length, (s.bar + s.bars) * 4) - Math.max(c.beat, s.bar * 4) }))
      return make(s, INTENSITY[s.kind], local).map((n) => ({ ...n, startTime: n.startTime + s.bar * 4 }))
    })
  const seed = o.seed ?? 1
  if (want.melody) parts.push(dress(g.id, { id: 'melody', name: 'Melody', sound: 'lead', notes: melodyFor(chords, sections, o.key, mode, g, rand) }))
  if (want.chords && g.keys !== 'none') parts.push(dress(g.id, { id: 'chords', name: 'Keys', sound: 'keys', notes: keysFor(chords, g.keys, sections) }))
  if (want.bass) parts.push(dress(g.id, { id: 'bass', name: 'Bass', sound: g.bass === '808' ? '808' : 'bass', notes: bySection((s, i, c) => bassist({ style: g.bass, bars: s.bars, chords: c, intensity: i, seed: seed + s.bar, humanize: 0.15, swing: g.swing })) }))
  if (want.drums) parts.push(dress(g.id, { id: 'drums', name: 'Drums', sound: 'drums', notes: bySection((s, i) => s.kind === 'intro' && g.id !== 'house' && g.id !== 'techhouse' && g.id !== 'afrohouse' ? [] : drummer({ style: g.drums, bars: s.bars, intensity: i, fills: s.bars >= 8 ? 8 : 4, seed: seed + s.bar, humanize: 0.25, swing: g.swing })) }))
  if (want.guitar && g.guitar) parts.push(dress(g.id, { id: 'guitar', name: 'Guitar', sound: g.guitar === 'power' ? 'eguitar' : 'guitar', notes: bySection((s, i, c) => s.kind === 'intro' ? [] : guitarist({ style: g.guitar!, bars: s.bars, chords: c, intensity: i, seed: seed + s.bar, swing: g.swing })) }))
  return { bpm, bars: total, sections, chords, parts }
}
