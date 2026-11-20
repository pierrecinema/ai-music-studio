// The sound pack: real recorded instruments (GeneralUser GS, a General MIDI SoundFont by S. Christian Collins,
// free for use in software) played by a small SoundFont 2 sampler. MIDI tracks with a built-in sound use it when the
// pack is installed (Settings → Audio → Sound pack, or the AI Instruments page); without it the old synthesizer plays.
//
// Each note is one or two AudioBufferSourceNodes (the sample zones that match key and velocity) with the SoundFont's
// tuning, loop, volume envelope, low-pass filter and pan. Works the same in live playback and in the offline export.

export interface Sf2Sample { name: string; start: number; end: number; loopStart: number; loopEnd: number; rate: number; root: number; correction: number; type: number }
interface Zone {
  keyLo: number; keyHi: number; velLo: number; velHi: number
  sample: number
  gen: Map<number, number>              // the instrument's generators (absolute)
  add: Map<number, number>              // the preset's generators (added)
}
export interface Sf2Preset { name: string; bank: number; program: number; zones: Zone[] }
export interface SoundBank { presets: Map<string, Sf2Preset>; samples: Sf2Sample[]; data: Int16Array; names: Array<{ bank: number; program: number; name: string }> }

const RANGE = new Set([43, 44])

/** reads a SoundFont 2 file (RIFF sfbk: INFO, sdta/smpl, pdta) */
export function parseSf2(buf: ArrayBuffer): SoundBank {
  const v = new DataView(buf)
  const id = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (id(0) !== 'RIFF' || id(8) !== 'sfbk') throw new Error('Not a SoundFont 2 file')
  const chunks = new Map<string, { off: number; len: number }>()
  const walk = (from: number, to: number): void => {
    let o = from
    while (o + 8 <= to) {
      const name = id(o), len = v.getUint32(o + 4, true)
      if (name === 'LIST') walk(o + 12, o + 8 + len)
      else chunks.set(name, { off: o + 8, len })
      o += 8 + len + (len & 1)
    }
  }
  walk(12, Math.min(buf.byteLength, 8 + v.getUint32(4, true)))
  const need = (n: string): { off: number; len: number } => { const c = chunks.get(n); if (!c) throw new Error(`SoundFont: no ${n} chunk`); return c }
  const str = (o: number, n: number): string => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c) } return s.trim() }
  const smpl = need('smpl')
  const data = new Int16Array(buf.slice(smpl.off, smpl.off + (smpl.len & ~1)))

  const gens = (c: { off: number; len: number }): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let o = c.off; o + 4 <= c.off + c.len; o += 4) {
      const op = v.getUint16(o, true)
      out.push([op, RANGE.has(op) ? v.getUint8(o + 2) | (v.getUint8(o + 3) << 8) : v.getInt16(o + 2, true)])
    }
    return out
  }
  // the generator index of each bag (its modulator index is not used)
  const bags = (c: { off: number; len: number }): number[] => { const out: number[] = []; for (let o = c.off; o + 4 <= c.off + c.len; o += 4) out.push(v.getUint16(o, true)); return out }

  const shdr = need('shdr'), samples: Sf2Sample[] = []
  for (let o = shdr.off; o + 46 <= shdr.off + shdr.len; o += 46) {
    samples.push({ name: str(o, 20), start: v.getUint32(o + 20, true), end: v.getUint32(o + 24, true), loopStart: v.getUint32(o + 28, true),
      loopEnd: v.getUint32(o + 32, true), rate: v.getUint32(o + 36, true), root: v.getUint8(o + 40), correction: v.getInt8(o + 41), type: v.getUint16(o + 44, true) })
  }
  const igen = gens(need('igen')), ibag = bags(need('ibag')), pgen = gens(need('pgen')), pbag = bags(need('pbag'))
  // instrument: zones of [generators]; a first zone without a sample is the global zone
  const inst = need('inst'), instruments: Array<{ global: Map<number, number>; zones: Array<Map<number, number>> }> = []
  const instBag: number[] = []
  for (let o = inst.off; o + 22 <= inst.off + inst.len; o += 22) instBag.push(v.getUint16(o + 20, true))
  for (let i = 0; i + 1 < instBag.length; i++) {
    const global = new Map<number, number>(), zones: Array<Map<number, number>> = []
    for (let b = instBag[i]; b < instBag[i + 1]; b++) {
      const m = new Map<number, number>(igen.slice(ibag[b], ibag[b + 1]).map(([op, val]) => [op, val]))
      if (m.has(53)) zones.push(m)
      else if (b === instBag[i]) for (const [k, x] of m) global.set(k, x)
    }
    instruments.push({ global, zones })
  }
  const phdr = need('phdr'), presets = new Map<string, Sf2Preset>(), names: SoundBank['names'] = []
  const heads: Array<{ name: string; program: number; bank: number; bag: number }> = []
  for (let o = phdr.off; o + 38 <= phdr.off + phdr.len; o += 38) heads.push({ name: str(o, 20), program: v.getUint16(o + 20, true), bank: v.getUint16(o + 22, true), bag: v.getUint16(o + 24, true) })
  for (let p = 0; p + 1 < heads.length; p++) {
    const h = heads[p], zones: Zone[] = []
    let pglobal = new Map<number, number>()
    for (let b = h.bag; b < heads[p + 1].bag; b++) {
      const m = new Map<number, number>(pgen.slice(pbag[b], pbag[b + 1]).map(([op, val]) => [op, val]))
      if (!m.has(41)) { if (b === h.bag) pglobal = m; continue }
      const ins = instruments[m.get(41)!]
      if (!ins) continue
      const padd = new Map<number, number>([...pglobal, ...m])
      const pk = padd.get(43) ?? 0x7f00, pv = padd.get(44) ?? 0x7f00
      for (const z of ins.zones) {
        const g = new Map<number, number>([...ins.global, ...z])
        const ik = g.get(43) ?? 0x7f00, iv = g.get(44) ?? 0x7f00
        const keyLo = Math.max(ik & 0xff, pk & 0xff), keyHi = Math.min(ik >> 8, pk >> 8)
        const velLo = Math.max(iv & 0xff, pv & 0xff), velHi = Math.min(iv >> 8, pv >> 8)
        if (keyLo > keyHi || velLo > velHi) continue
        zones.push({ keyLo, keyHi, velLo, velHi, sample: g.get(53)!, gen: g, add: padd })
      }
    }
    presets.set(`${h.bank}:${h.program}`, { name: h.name, bank: h.bank, program: h.program, zones })
    names.push({ bank: h.bank, program: h.program, name: h.name })
  }
  return { presets, samples, data, names }
}

// ── the loaded bank ──────────────────────────────────────────────────────────────

let bank: SoundBank | null = null
const listeners = new Set<() => void>()
export function soundBank(): SoundBank | null { return bank }
export function setSoundBank(b: SoundBank | null): void { bank = b; sampleCache.clear(); for (const f of listeners) f() }
export function onSoundBank(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f) }

/** loads the installed pack (path from the main process); quietly stays on the synthesizer if there is none */
let loading: Promise<boolean> | null = null
export function loadSoundPack(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const st = await window.api.sounds?.status()
      if (!st?.installed || !st.path) return false
      const bytes: Uint8Array = await window.api.fs.readFile(st.path)
      setSoundBank(parseSf2(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer))
      return true
    } catch (e) {
      console.warn('[sounds]', e)
      return false
    } finally { loading = null }
  })()
  return loading
}

// ── playing a note ───────────────────────────────────────────────────────────────

const sampleCache = new Map<number, AudioBuffer>()
function bufferOf(b: SoundBank, i: number): AudioBuffer | null {
  let ab = sampleCache.get(i)
  if (ab) return ab
  const s = b.samples[i]
  const n = s.end - s.start
  if (n <= 1 || s.rate < 3000 || s.type & 0x8000) return null           // ROM samples are not in the file
  ab = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: Math.min(192000, s.rate) })
  const ch = ab.getChannelData(0), src = b.data
  for (let k = 0; k < n; k++) ch[k] = src[s.start + k] / 32768
  sampleCache.set(i, ab)
  return ab
}

const tc = (t: number | undefined, dflt = -12000): number => Math.pow(2, (t ?? dflt) / 1200)        // timecents -> s
const val = (z: Zone, op: number, dflt = 0): number => (z.gen.get(op) ?? dflt) + (z.add.get(op) ?? 0)

/** the preset for a General MIDI program (0-127) or the drum kit (128), with fallbacks */
export function presetFor(program: number): Sf2Preset | null {
  if (!bank) return null
  if (program >= 128) return bank.presets.get(`128:${program - 128}`) ?? bank.presets.get('128:0') ?? null
  return bank.presets.get(`0:${program}`) ?? null
}

/** notes of the same exclusive class cut each other (open and closed hi-hat): per player */
export type Choke = Map<number, Array<{ src: AudioScheduledSourceNode; g: GainNode }>>

export function playSampleNote(ctx: BaseAudioContext, dest: AudioNode, preset: Sf2Preset, pitch: number, velocity: number,
  when: number, duration: number, choke?: Choke): AudioScheduledSourceNode[] {
  const b = bank
  if (!b) return []
  const vel = Math.max(1, Math.min(127, Math.round(velocity)))
  const out: AudioScheduledSourceNode[] = []
  for (const z of preset.zones) {
    if (pitch < z.keyLo || pitch > z.keyHi || vel < z.velLo || vel > z.velHi) continue
    const s = b.samples[z.sample]
    const buf = s && bufferOf(b, z.sample)
    if (!buf) continue
    const root = z.gen.get(58) ?? s.root
    const scale = val(z, 56, 100)
    const cents = (pitch - root) * scale + val(z, 51) * 100 + val(z, 52) + s.correction
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = Math.pow(2, cents / 1200) * (s.rate / buf.sampleRate)
    const startOfs = val(z, 0) + val(z, 4) * 32768
    const offset = Math.max(0, startOfs) / s.rate
    const mode = val(z, 54) & 3
    if (mode === 1 || mode === 3) {
      const ls = (s.loopStart - s.start + val(z, 2) + val(z, 45) * 32768) / s.rate
      const le = (s.loopEnd - s.start + val(z, 3) + val(z, 50) * 32768) / s.rate
      if (le > ls + 0.0005) { src.loop = true; src.loopStart = ls; src.loopEnd = le }
    }
    // volume: initial attenuation (cB, scaled 0.4 like FluidSynth for SoundFont files) and the velocity curve
    const att = Math.max(0, val(z, 48)) * 0.4
    const peak = Math.pow(10, -att / 200) * Math.pow(vel / 127, 2) * 0.3
    const delay = tc(z.gen.has(33) || z.add.has(33) ? val(z, 33) : undefined)
    const attack = tc(z.gen.has(34) || z.add.has(34) ? val(z, 34) : undefined)
    const hold = tc(z.gen.has(35) || z.add.has(35) ? val(z, 35) : undefined)
    const decay = tc(z.gen.has(36) || z.add.has(36) ? val(z, 36) : undefined)
    const sustain = Math.pow(10, -Math.max(0, Math.min(1440, val(z, 37))) / 200)
    const release = Math.min(6, Math.max(0.012, tc(z.gen.has(38) || z.add.has(38) ? val(z, 38) : undefined)))
    const g = ctx.createGain()
    const t0 = when + Math.min(delay, 1)
    const tA = t0 + Math.min(attack, 4)
    const tH = tA + Math.min(hold, 4)
    g.gain.setValueAtTime(0, when)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, Math.max(t0 + 0.001, tA))
    g.gain.setValueAtTime(peak, tH)
    g.gain.setTargetAtTime(peak * sustain, tH, Math.max(0.005, Math.min(decay, 20)) / 4)
    // one-shot samples (drums) play to their end; looped ones stop with the note
    const looped = src.loop
    const len = (s.end - s.start - Math.max(0, startOfs)) / s.rate / src.playbackRate.value
    const off = looped || mode === 3 ? when + Math.max(0.01, duration) : when + Math.min(len, Math.max(0.01, duration) + release)
    if (looped) {
      g.gain.cancelScheduledValues(off)
      g.gain.setTargetAtTime(0, off, release / 5)
    } else if (off < when + len) {
      g.gain.cancelScheduledValues(off)
      g.gain.setTargetAtTime(0, off, release / 5)
    }
    const stop = (looped ? off + release : Math.min(when + len, off + release)) + 0.02
    // low-pass: the zone's cut-off, darker for soft notes (the default velocity-to-filter modulator)
    let node: AudioNode = src
    const fc = val(z, 8, 13500) - (z.gen.has(8) || z.add.has(8) ? 2400 * (1 - vel / 127) : 0)
    if (fc < 13400) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = Math.min(20000, 8.176 * Math.pow(2, fc / 1200))
      f.Q.value = Math.max(0.5, Math.pow(10, val(z, 9) / 200) * 0.707)
      node.connect(f); node = f
    }
    const pan = val(z, 17) / 500
    if (Math.abs(pan) > 0.01 && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p); node = p
    }
    node.connect(g).connect(dest)
    // exclusive class: a new hi-hat cuts the one before
    const cls = val(z, 57)
    if (cls && choke) {
      for (const v0 of choke.get(cls) ?? []) { try { v0.g.gain.cancelScheduledValues(when); v0.g.gain.setTargetAtTime(0, when, 0.01); v0.src.stop(when + 0.06) } catch { /* ended */ } }
      choke.set(cls, [{ src, g }])
    }
    src.start(when, Math.min(offset, buf.duration - 0.001))
    src.stop(stop)
    out.push(src)
  }
  return out
}

// ── General MIDI programs for the built-in sounds ─────────────────────────────────

/** which pack instrument plays a track: its own GM program, or one that fits its built-in sound */
export function programOf(t: { program?: number; sound?: string; name?: string }): number | null {
  if (t.program !== undefined) return t.program
  switch (t.sound) {
    case 'drums': return 128
    case 'guitar': return 25          // steel-string acoustic
    case 'eguitar': return 29         // overdriven guitar
    case 'keys': return 4             // electric piano
    case 'bass': return 33            // fingered bass
    case 'lead': return 0             // grand piano
    case '808': return null           // stays the 808 synth
    default: return null              // 'soft' and unset: the synthesizer
  }
}

/** short room reverb for the sample instruments (one per track strip) */
const irCache = new WeakMap<BaseAudioContext, AudioBuffer>()
export function roomReverb(ctx: BaseAudioContext): ConvolverNode {
  let ir = irCache.get(ctx)
  if (!ir) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.6)
    ir = ctx.createBuffer(2, n, sr)
    let seed = 7
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1 }
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = rnd() * Math.exp(-t * 3.2) * (t < 0.012 ? t / 0.012 : 1) * 0.35 }
    }
    irCache.set(ctx, ir)
  }
  const cv = ctx.createConvolver()
  cv.normalize = false
  cv.buffer = ir
  return cv
}

/** how much room a sample instrument gets (0..1): the track's own setting, else by kind of instrument */
export function reverbOf(program: number, own?: number): number {
  if (own !== undefined) return Math.max(0, Math.min(1, own))
  if (program >= 128) return 0.12                       // drums
  if (program >= 32 && program <= 39) return 0.03       // basses
  if (program >= 40 && program <= 55) return 0.32       // strings, choir
  if (program >= 88 && program <= 95) return 0.3        // pads
  return 0.2
}

/** the pack instruments offered in the Studio's instrument list (General MIDI program; 128+ = drum kits) */
export const PACK_INSTRUMENTS: Array<{ group: string; items: Array<[number, string]> }> = [
  { group: 'Drums', items: [[128, 'Drum kit (standard)'], [136, 'Drum kit (room)'], [144, 'Drum kit (power)'], [152, 'Drum kit (electronic)'], [153, 'Drum kit (808/909)'], [160, 'Drum kit (jazz)'], [168, 'Drum kit (brushes)']] },
  { group: 'Keys', items: [[0, 'Grand piano'], [1, 'Bright piano'], [4, 'Electric piano (Rhodes)'], [5, 'Electric piano (FM)'], [7, 'Clavinet'], [11, 'Vibraphone'], [12, 'Marimba'], [16, 'Organ'], [19, 'Church organ']] },
  { group: 'Guitar and bass', items: [[24, 'Nylon guitar'], [25, 'Steel-string guitar'], [26, 'Jazz guitar'], [27, 'Clean electric guitar'], [28, 'Muted guitar'], [29, 'Overdrive guitar'], [30, 'Distortion guitar'], [32, 'Acoustic bass'], [33, 'Finger bass'], [34, 'Pick bass'], [36, 'Slap bass'], [38, 'Synth bass']] },
  { group: 'Orchestra', items: [[40, 'Violin'], [42, 'Cello'], [48, 'Strings'], [49, 'Slow strings'], [52, 'Choir'], [56, 'Trumpet'], [57, 'Trombone'], [60, 'French horn'], [61, 'Brass section'], [68, 'Oboe'], [71, 'Clarinet'], [73, 'Flute'], [46, 'Harp']] },
  { group: 'Solo and synth', items: [[65, 'Alto sax'], [66, 'Tenor sax'], [22, 'Harmonica'], [75, 'Pan flute'], [8, 'Celesta'], [80, 'Square lead'], [81, 'Saw lead'], [88, 'New age pad'], [89, 'Warm pad'], [91, 'Choir pad']] }
]
