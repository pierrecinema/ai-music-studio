// Standard MIDI files (.mid): read the notes of every track and write MIDI clips back out.
// Times in the app are beats (quarter notes), so ticks are divided by the file's resolution (PPQ).
// Only notes, tempo and track names are used; controllers, pitch bend and SMPTE timing are skipped.
import type { Note } from '../types'

export interface MidiTrackData { name: string; notes: Omit<Note, 'id'>[]; channel?: number }
export interface MidiFileData { bpm?: number; ppq: number; tracks: MidiTrackData[] }

function readVar(b: Uint8Array, p: { i: number }): number {
  let v = 0
  for (let k = 0; k < 4; k++) {
    const c = b[p.i++]
    v = (v << 7) | (c & 0x7f)
    if (!(c & 0x80)) break
  }
  return v
}

const text = (b: Uint8Array): string => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s }

export function parseMidi(bytes: Uint8Array): MidiFileData {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (text(bytes.subarray(0, 4)) !== 'MThd') throw new Error('not a MIDI file')
  const headLen = dv.getUint32(4)
  const count = dv.getUint16(10)
  const division = dv.getUint16(12)
  if (division & 0x8000) throw new Error('MIDI files with SMPTE timing are not supported')
  const ppq = division || 480
  let pos = 8 + headLen
  let bpm: number | undefined
  const tracks: MidiTrackData[] = []
  for (let t = 0; t < count && pos + 8 <= bytes.length; t++) {
    const id = text(bytes.subarray(pos, pos + 4))
    const len = dv.getUint32(pos + 4)
    const start = pos + 8, end = Math.min(bytes.length, start + len)
    pos = end
    if (id !== 'MTrk') continue
    const p = { i: start }
    let tick = 0, status = 0, name = ''
    const open = new Map<number, { tick: number; vel: number }[]>()     // channel*128+pitch -> notes still sounding
    const notes: (Omit<Note, 'id'> & { ch: number })[] = []
    const close = (key: number, at: number): void => {
      const list = open.get(key)
      const on = list?.shift()
      if (!on) return
      notes.push({ pitch: key % 128, startTime: on.tick / ppq, duration: Math.max(1 / 64, (at - on.tick) / ppq), velocity: on.vel, ch: Math.floor(key / 128) })
    }
    while (p.i < end) {
      tick += readVar(bytes, p)
      let s = bytes[p.i]
      if (s & 0x80) { p.i++; if (s < 0xf0) status = s } else s = status        // running status
      if (s === 0xff) {
        const type = bytes[p.i++]
        const l = readVar(bytes, p)
        const data = bytes.subarray(p.i, p.i + l)
        p.i += l
        if (type === 0x03 && !name) name = text(data).trim()
        else if (type === 0x51 && l === 3 && bpm === undefined) bpm = Math.round((60000000 / ((data[0] << 16) | (data[1] << 8) | data[2])) * 100) / 100
        else if (type === 0x2f) break
      } else if (s === 0xf0 || s === 0xf7) {
        p.i += readVar(bytes, p)
      } else {
        const kind = s & 0xf0, ch = s & 0x0f
        const d1 = bytes[p.i++]
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p.i++]
        const key = ch * 128 + d1
        if (kind === 0x90 && d2 > 0) {
          if (!open.has(key)) open.set(key, [])
          open.get(key)!.push({ tick, vel: d2 })
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) close(key, tick)
      }
    }
    for (const key of [...open.keys()]) while (open.get(key)?.length) close(key, tick)
    if (!notes.length) continue
    // one app track per MIDI channel used in this file track (type 0 files keep everything in one track)
    const channels = [...new Set(notes.map((n) => n.ch))].sort((a, b) => a - b)
    for (const ch of channels) {
      const these = notes.filter((n) => n.ch === ch).sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch)
      const label = name || `Track ${tracks.length + 1}`
      tracks.push({ name: channels.length > 1 ? `${label} (ch ${ch + 1})` : label, channel: ch, notes: these.map(({ ch: _c, ...n }) => n) })
    }
  }
  return { bpm, ppq, tracks }
}

function writeVar(out: number[], v: number): void {
  const stack = [v & 0x7f]
  while ((v >>= 7) > 0) stack.unshift((v & 0x7f) | 0x80)
  out.push(...stack)
}

const u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]

// A type-1 file: a tempo track, then one track per entry (notes in beats from the start of the file).
export function writeMidi(tracks: MidiTrackData[], bpm: number, ppq = 480): Uint8Array {
  const chunks: number[][] = []
  const tempo: number[] = []
  const us = Math.round(60000000 / (bpm || 120))
  writeVar(tempo, 0); tempo.push(0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255)
  writeVar(tempo, 0); tempo.push(0xff, 0x58, 0x04, 4, 2, 24, 8)
  writeVar(tempo, 0); tempo.push(0xff, 0x2f, 0x00)
  chunks.push(tempo)
  tracks.forEach((t, i) => {
    const ch = (t.channel ?? i) & 0x0f
    const ev: { tick: number; order: number; bytes: number[] }[] = []
    for (const n of t.notes) {
      const on = Math.max(0, Math.round(n.startTime * ppq))
      const off = Math.max(on + 1, Math.round((n.startTime + n.duration) * ppq))
      const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)))
      ev.push({ tick: on, order: 1, bytes: [0x90 | ch, pitch, Math.max(1, Math.min(127, Math.round(n.velocity)))] })
      ev.push({ tick: off, order: 0, bytes: [0x80 | ch, pitch, 0] })        // note-offs before note-ons at the same tick
    }
    ev.sort((a, b) => a.tick - b.tick || a.order - b.order)
    const out: number[] = []
    const name = [...t.name].map((c) => c.charCodeAt(0) & 0x7f)
    writeVar(out, 0); out.push(0xff, 0x03); writeVar(out, name.length); out.push(...name)
    let last = 0
    for (const e of ev) { writeVar(out, e.tick - last); last = e.tick; out.push(...e.bytes) }
    writeVar(out, 0); out.push(0xff, 0x2f, 0x00)
    chunks.push(out)
  })
  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 1, (chunks.length >> 8) & 255, chunks.length & 255, (ppq >> 8) & 255, ppq & 255]
  const body = chunks.flatMap((c) => [0x4d, 0x54, 0x72, 0x6b, ...u32(c.length), ...c])
  return new Uint8Array([...head, ...body])
}
