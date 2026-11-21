// Sound packs: real recorded instruments played by a small sampler. MIDI tracks with a built-in sound or a pack
// program play them when a pack is installed (Settings → Audio → Sound packs); without one the old synthesizer plays.
//   GeneralUser GS (SoundFont 2) and MuseScore General (SoundFont 3: Ogg Vorbis samples): every GM instrument
//   Salamander Grand Piano (MP3) and VSCO-2 orchestra (WAV): multisampled instruments, used first where they exist
//
// Each note is one or two AudioBufferSourceNodes (the zones that match key and velocity) with the zone's tuning,
// loop, volume envelope, low-pass filter and pan. Works the same in live playback and in the offline export.
// Compressed and file-based samples are decoded before playing (prepareSounds), so playing a note stays synchronous.

export interface Sf2Sample {
  name: string
  start: number; end: number              // PCM: frames in the bank's data; SF3: bytes of the Ogg stream
  loopStart: number; loopEnd: number      // frames from the sample's start
  rate: number; root: number; correction: number; type: number
  compressed?: boolean                    // SF3: an Ogg Vorbis stream
  file?: string                           // multisample packs: the audio file
  buffer?: AudioBuffer | null             // decoded (null: could not be decoded)
}
interface Zone {
  keyLo: number; keyHi: number; velLo: number; velHi: number
  sample: number
  gen: Map<number, number>              // the instrument's generators (absolute)
  add: Map<number, number>              // the preset's generators (added)
  cutAtNoteOff?: boolean                // a one-shot that still stops (with its release) when the key goes up (piano)
}
export interface Sf2Preset { name: string; bank: number; program: number; zones: Zone[]; owner?: SoundBank; gain?: number }
export interface SoundBank { id: string; presets: Map<string, Sf2Preset>; samples: Sf2Sample[]; data?: Int16Array; raw?: Uint8Array; names: Array<{ bank: number; program: number; name: string }> }

const RANGE = new Set([43, 44])

/** reads a SoundFont 2 or 3 file (RIFF sfbk: INFO, sdta/smpl, pdta) */
export function parseSf2(buf: ArrayBuffer, bankId = 'sf'): SoundBank {
  const v = new DataView(buf)
  const id = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  const isId = (o: number): boolean => { if (o + 4 > buf.byteLength) return false; for (let i = 0; i < 4; i++) { const c = v.getUint8(o + i); if (c < 32 || c > 126) return false } return true }
  if (id(0) !== 'RIFF' || id(8) !== 'sfbk') throw new Error('Not a SoundFont file')
  const chunks = new Map<string, { off: number; len: number }>()
  const walk = (from: number, to: number): void => {
    let o = from
    while (o + 8 <= to) {
      const name = id(o), len = v.getUint32(o + 4, true)
      if (name === 'LIST') walk(o + 12, Math.min(to, o + 8 + len))
      else chunks.set(name, { off: o + 8, len })
      // chunks are padded to even sizes, but some files (MuseScore General) leave the pad byte out
      const next = o + 8 + len
      o = (len & 1) && isId(next) ? next : next + (len & 1)
    }
  }
  walk(12, buf.byteLength)
  const need = (n: string): { off: number; len: number } => { const c = chunks.get(n); if (!c) throw new Error(`SoundFont: no ${n} chunk`); return c }
  const str = (o: number, n: number): string => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c) } return s.trim() }
  const smpl = need('smpl')

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
    const type = v.getUint16(o + 44, true)
    const start = v.getUint32(o + 20, true), compressed = (type & 0x10) !== 0
    const s: Sf2Sample = { name: str(o, 20), start, end: v.getUint32(o + 24, true), loopStart: v.getUint32(o + 28, true),
      loopEnd: v.getUint32(o + 32, true), rate: v.getUint32(o + 36, true), root: v.getUint8(o + 40), correction: v.getInt8(o + 41), type, compressed }
    // SoundFont 2 loop points count from the start of the whole sample data; SoundFont 3 ones from the sample
    if (!compressed) { s.loopStart -= start; s.loopEnd -= start }
    samples.push(s)
  }
  const anyCompressed = samples.some((s) => s.compressed)
  const raw = new Uint8Array(buf, smpl.off, Math.min(smpl.len, buf.byteLength - smpl.off))
  const data = anyCompressed ? undefined : new Int16Array(buf.slice(smpl.off, smpl.off + (smpl.len & ~1)))
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
  const bank: SoundBank = { id: bankId, presets: new Map(), samples, data, raw: anyCompressed ? raw : undefined, names: [] }
  const phdr = need('phdr')
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
    bank.presets.set(`${h.bank}:${h.program}`, { name: h.name, bank: h.bank, program: h.program, zones, owner: bank })
    bank.names.push({ bank: h.bank, program: h.program, name: h.name })
  }
  return bank
}

// ── multisampled packs (one audio file per note and velocity layer) ──────────────

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
/** "C4" -> 60 (scientific: middle C = C4), or with middle C = C3 (VSCO) */
export function noteNumber(name: string, middleC = 4): number | null {
  const m = name.match(/^([A-G](?:#|b)?)(-?\d)$/)
  if (!m || NOTE[m[1]] === undefined) return null
  return (Number(m[2]) + (5 - middleC)) * 12 + NOTE[m[1]]
}

export interface MultiSample { file: string; root: number; layer: number }
/** a preset from samples: each key goes to the nearest sample (key ranges split half way), velocity layers split the
 *  range 1..127 evenly; the samples are decoded later (prepareSounds) */
export function multiPreset(bank: SoundBank, name: string, program: number, list: MultiSample[], opts: { release?: number; attenuation?: number } = {}): Sf2Preset {
  const zones: Zone[] = []
  const layers = [...new Set(list.map((s) => s.layer))].sort((a, b) => a - b)
  layers.forEach((layer, li) => {
    const velLo = Math.round((li * 127) / layers.length) + 1, velHi = Math.round(((li + 1) * 127) / layers.length)
    const notes = list.filter((s) => s.layer === layer).sort((a, b) => a.root - b.root)
    notes.forEach((s, i) => {
      const keyLo = i === 0 ? 0 : Math.floor((notes[i - 1].root + s.root) / 2) + 1
      const keyHi = i === notes.length - 1 ? 127 : Math.floor((s.root + notes[i + 1].root) / 2)
      let idx = bank.samples.findIndex((x) => x.file === s.file)
      if (idx < 0) { idx = bank.samples.length; bank.samples.push({ name: s.file, start: 0, end: 0, loopStart: 0, loopEnd: 0, rate: 0, root: s.root, correction: 0, type: 1, file: s.file }) }
      const gen = new Map<number, number>([[38, Math.round(1200 * Math.log2(opts.release ?? 0.35))], [48, opts.attenuation ?? 0], [33, -12000], [34, -12000], [35, -12000], [36, -12000], [37, 0]])
      zones.push({ keyLo, keyHi, velLo, velHi, sample: idx, gen, add: new Map(), cutAtNoteOff: true })
    })
  })
  const p: Sf2Preset = { name, bank: 0, program, zones, owner: bank }
  bank.presets.set(`0:${program}`, p)
  bank.names.push({ bank: 0, program, name })
  return p
}

/** the instruments of a multisample pack from its file list (paths relative to the pack folder) */
export function buildMultiBank(id: string, files: string[]): SoundBank {
  const bank: SoundBank = { id, presets: new Map(), samples: [], names: [] }
  if (id === 'salamander') {
    // audio/C4v8.mp3: scientific pitch names, velocity layers v4 / v8 / v12 / v16
    const list = files.map((f) => { const m = f.match(/([A-G]#?\d)v(\d+)\.mp3$/); const root = m ? noteNumber(m[1]) : null; return m && root !== null ? { file: f, root, layer: Number(m[2]) } : null }).filter(Boolean) as MultiSample[]
    if (list.length) { multiPreset(bank, 'Salamander Grand Piano', 0, list, { release: 0.5 }); multiPreset(bank, 'Salamander Grand Piano (bright)', 1, list, { release: 0.45 }) }
  }
  if (id === 'vsco') {
    // VSCO names: middle C = C3; velocity layer _vN
    const pick = (re: RegExp, folder: string): MultiSample[] => files.filter((f) => f.startsWith(folder)).map((f) => {
      const m = f.match(re); const root = m ? noteNumber(m[1], 3) : null
      return m && root !== null ? { file: f, root, layer: Number(m[2]) } : null
    }).filter(Boolean).filter((s, i, all) => all.findIndex((t) => t!.root === s!.root && t!.layer === s!.layer) === i) as MultiSample[]
    const violins = pick(/_([A-G]#?-?\d)_v(\d)/, 'Strings/Violin Section/')
    const cellos = pick(/_([A-G]#?-?\d)_v(\d)/, 'Strings/Cello Section/')
    const horn = pick(/_([A-G]#?-?\d)_v(\d)/, 'Brass/F Horn/')
    const trombone = pick(/_([A-G]#?-?\d)_v(\d)/, 'Brass/Tenor Trombone/')
    const strings = [...cellos.filter((s) => s.root < 55), ...violins.filter((s) => s.root >= 55)]
    if (violins.length) { multiPreset(bank, 'VSCO Violin section', 40, violins, { release: 0.4 }); multiPreset(bank, 'VSCO Violas (violins)', 41, violins, { release: 0.4 }) }
    if (cellos.length) { multiPreset(bank, 'VSCO Cello section', 42, cellos, { release: 0.4 }); multiPreset(bank, 'VSCO Basses (cellos)', 43, cellos, { release: 0.4 }) }
    if (strings.length) { multiPreset(bank, 'VSCO Strings', 48, strings, { release: 0.45 }); multiPreset(bank, 'VSCO Strings (slow)', 49, strings, { release: 0.8 }) }
    if (trombone.length) multiPreset(bank, 'VSCO Trombone', 57, trombone, { release: 0.3 })
    if (horn.length) multiPreset(bank, 'VSCO French horn', 60, horn, { release: 0.35 })
    const brass = [...trombone.filter((s) => s.root < 53), ...horn.filter((s) => s.root >= 53)]
    if (brass.length) multiPreset(bank, 'VSCO Brass section', 61, brass, { release: 0.3 })
  }
  return bank
}

// ── the loaded banks ──────────────────────────────────────────────────────────────

const banks = new Map<string, SoundBank>()
const packDirs = new Map<string, string>()
const listeners = new Set<() => void>()
/** the first loaded bank (any pack installed), or null */
export function soundBank(): SoundBank | null { return banks.values().next().value ?? null }
export function loadedPacks(): string[] { return [...banks.keys()] }
export function setSoundBank(b: SoundBank | null, id?: string): void {
  if (b) banks.set(id ?? b.id, b)
  else if (id) banks.delete(id)
  else banks.clear()
  for (const f of listeners) f()
}
export function onSoundBank(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f) }

/** loads every installed pack (paths from the main process); quietly stays on the synthesizer if there is none */
let loading: Promise<boolean> | null = null
export function loadSoundPack(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const st = await window.api.sounds?.status()
      const packs = st?.packs ?? (st?.installed ? [{ id: 'generaluser', kind: 'sf2', installed: true, main: st.path, dir: '' } as SoundPackInfo] : [])
      for (const p of packs) {
        if (!p.installed) { if (banks.has(p.id)) setSoundBank(null, p.id); continue }
        if (banks.has(p.id)) continue
        try {
          if (p.kind === 'sf2' && p.main) {
            const bytes: Uint8Array = await window.api.fs.readFile(p.main)
            setSoundBank(parseSf2(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, p.id), p.id)
          } else if (p.kind === 'multi') {
            packDirs.set(p.id, p.dir)
            setSoundBank(buildMultiBank(p.id, p.files ?? []), p.id)
          }
        } catch (e) { console.warn('[sounds]', p.id, e) }
      }
      return banks.size > 0
    } catch (e) {
      console.warn('[sounds]', e)
      return false
    } finally { loading = null }
  })()
  return loading
}

// ── decoding ─────────────────────────────────────────────────────────────────────

function pcmBuffer(b: SoundBank, s: Sf2Sample): AudioBuffer | null {
  const n = s.end - s.start
  if (!b.data || n <= 1 || s.rate < 3000 || s.type & 0x8000) return null           // ROM samples are not in the file
  const ab = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: Math.min(192000, s.rate) })
  const ch = ab.getChannelData(0), src = b.data
  for (let k = 0; k < n; k++) ch[k] = src[s.start + k] / 32768
  return ab
}

const decoders = new Map<number, OfflineAudioContext>()
async function decode(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer | null> {
  const r = rate >= 8000 && rate <= 192000 ? rate : 44100
  let d = decoders.get(r)
  if (!d) { d = new OfflineAudioContext(1, 1, r); decoders.set(r, d) }
  try { return await d.decodeAudioData(bytes) } catch { return null }
}

/** the sample ready to play (PCM banks: made at once; compressed and file samples: after prepareSounds) */
function bufferOf(b: SoundBank, i: number): AudioBuffer | null {
  const s = b.samples[i]
  if (!s) return null
  if (s.buffer !== undefined) return s.buffer
  if (s.compressed || s.file) return null
  s.buffer = pcmBuffer(b, s)
  return s.buffer
}

/** decodes what the given presets need (SF3 Ogg samples, multisample files); also sets a preset's level */
export async function preparePreset(p: Sf2Preset | null): Promise<void> {
  const b = p?.owner
  if (!p || !b) return
  const todo = [...new Set(p.zones.map((z) => z.sample))].filter((i) => b.samples[i] && b.samples[i].buffer === undefined && (b.samples[i].compressed || b.samples[i].file))
  await Promise.all(todo.map(async (i) => {
    const s = b.samples[i]
    if (s.compressed && b.raw) {
      const bytes = b.raw.slice(s.start, s.end)
      s.buffer = await decode(bytes.buffer, s.rate)
    } else if (s.file) {
      try {
        const dir = packDirs.get(b.id) ?? ''
        const bytes: Uint8Array = await window.api.fs.readFile(`${dir}/${s.file}`)
        s.buffer = await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 44100)
      } catch { s.buffer = null }
    }
  }))
  // multisample packs are recorded at their own levels: bring the loudest sample of the preset to a common peak
  if (p.gain === undefined && p.zones.some((z) => z.cutAtNoteOff)) {
    let peak = 0
    for (const i of new Set(p.zones.map((z) => z.sample))) {
      const buf = b.samples[i]?.buffer
      if (!buf) continue
      const d = buf.getChannelData(0)
      for (let k = 0; k < d.length; k += 4) { const a = Math.abs(d[k]); if (a > peak) peak = a }
    }
    p.gain = peak > 0 ? Math.min(8, 0.9 / peak) : 1
  }
}

/** decodes the samples the given programs need before they are played */
export async function prepareSounds(programs: Array<number | null>): Promise<void> {
  await Promise.all([...new Set(programs)].filter((x): x is number => x !== null).map((p) => preparePreset(presetFor(p))))
}

const tc = (t: number | undefined, dflt = -12000): number => Math.pow(2, (t ?? dflt) / 1200)        // timecents -> s
const val = (z: Zone, op: number, dflt = 0): number => (z.gen.get(op) ?? dflt) + (z.add.get(op) ?? 0)

// Which pack plays a program first: the multisampled packs where they have the instrument, then MuseScore General,
// then GeneralUser GS
const ORDER = ['salamander', 'vsco', 'musescore', 'generaluser']
/** the preset for a General MIDI program (0-127) or a drum kit (128+), from the best installed pack */
export function presetFor(program: number): Sf2Preset | null {
  for (const id of [...ORDER, ...banks.keys()]) {
    const b = banks.get(id)
    if (!b) continue
    const p = program >= 128 ? (b.presets.get(`128:${program - 128}`) ?? (id === 'musescore' || id === 'generaluser' ? b.presets.get('128:0') : undefined)) : b.presets.get(`0:${program}`)
    if (p && p.zones.length) return p
  }
  return null
}
/** which pack plays a program (for the instrument list) */
export function packOf(program: number): string | null { return presetFor(program)?.owner?.id ?? null }

/** notes of the same exclusive class cut each other (open and closed hi-hat): per player */
export type Choke = Map<number, Array<{ src: AudioScheduledSourceNode; g: GainNode }>>

export function playSampleNote(ctx: BaseAudioContext, dest: AudioNode, preset: Sf2Preset, pitch: number, velocity: number,
  when: number, duration: number, choke?: Choke): AudioScheduledSourceNode[] {
  const b = preset.owner
  if (!b) return []
  const vel = Math.max(1, Math.min(127, Math.round(velocity)))
  const out: AudioScheduledSourceNode[] = []
  for (const z of preset.zones) {
    if (pitch < z.keyLo || pitch > z.keyHi || vel < z.velLo || vel > z.velHi) continue
    const s = b.samples[z.sample]
    const buf = s && bufferOf(b, z.sample)
    if (!buf) continue
    const rate = s.rate || buf.sampleRate
    const root = z.gen.get(58) ?? s.root
    const scale = val(z, 56, 100)
    const cents = (pitch - root) * scale + val(z, 51) * 100 + val(z, 52) + s.correction
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = Math.pow(2, cents / 1200)
    const startOfs = val(z, 0) + val(z, 4) * 32768
    const offset = Math.max(0, startOfs) / rate
    const mode = val(z, 54) & 3
    if (mode === 1 || mode === 3) {
      const ls = (s.loopStart + val(z, 2) + val(z, 45) * 32768) / rate
      const le = (s.loopEnd + val(z, 3) + val(z, 50) * 32768) / rate
      if (le > ls + 0.0005 && le <= buf.duration + 0.001) { src.loop = true; src.loopStart = ls; src.loopEnd = le }
    }
    // volume: initial attenuation (cB, scaled 0.4 like FluidSynth for SoundFont files) and the velocity curve
    const att = Math.max(0, val(z, 48)) * 0.4
    const peak = Math.pow(10, -att / 200) * Math.pow(vel / 127, 2) * 0.3 * (preset.gain ?? 1)
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
    // one-shot samples (drums) play to their end; looped ones and piano-like ones stop with the note
    const looped = src.loop
    const len = (buf.duration - Math.max(0, startOfs) / rate) / src.playbackRate.value
    const held = looped || mode === 3 || z.cutAtNoteOff
    const off = held ? when + Math.max(0.01, duration) : when + Math.min(len, Math.max(0.01, duration) + release)
    if (held || off < when + len) {
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
