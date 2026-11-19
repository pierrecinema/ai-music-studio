// Novation Launchpads: the 8x8 grid drives the Studio and shows its state.
//   top row:       jump to markers 1–8 (amber: a marker is there)
//   rows 7..1:     tracks 1–7 (from the top): pad 1 mute (red), pad 2 solo (blue), pad 3 select (white),
//                  pads 4–8 volume in five steps (green up to the level)
// Newer models (X, Mini MK3, Pro MK3, Pro MK2 in programmer mode, MK2 in session layout) number their pads
// row * 10 + column (row 1 at the bottom) and light a pad with a palette colour. The original Launchpad, S and
// Mini MK1/MK2 use the X-Y layout (row * 16 + column from the top) and a red/green velocity.
import { useProjectStore } from '../stores/project.store'
import { seek } from '../audio/engine'
import { profileFor } from './devices'

type Model = 'x' | 'mini3' | 'pro3' | 'mk2' | 'pro2' | 'classic'
const VOL_STEPS = [0, 0.25, 0.5, 0.75, 1]

// colours: palette numbers (newer models) and red/green velocities (classic)
const PALETTE = { off: 0, white: 3, red: 5, amber: 9, green: 21, dim: 1, blue: 45 }
const CLASSIC = { off: 0x0c, white: 0x3e, red: 0x0f, amber: 0x3f, green: 0x3c, dim: 0x1d, blue: 0x3e }

const START: Record<Model, number[][]> = {
  x: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0c, 0x0e, 0x01, 0xf7]],
  mini3: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x0e, 0x01, 0xf7]],
  pro3: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x01, 0xf7]],
  pro2: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x10, 0x2c, 0x03, 0xf7]],      // programmer layout
  mk2: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x18, 0x22, 0x00, 0xf7]],       // session layout
  classic: [[0xb0, 0x00, 0x00], [0xb0, 0x00, 0x01]],                  // reset, X-Y layout
}
const STOP: Record<Model, number[][]> = {
  x: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0c, 0x0e, 0x00, 0xf7]],
  mini3: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x0e, 0x00, 0xf7]],
  pro3: [[0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x00, 0xf7]],
  pro2: [], mk2: [], classic: [[0xb0, 0x00, 0x00]],
}

// a pad (row 1..8 from the bottom, column 1..8) as a note, and back
const noteOf = (m: Model, row: number, col: number): number => (m === 'classic' ? (8 - row) * 16 + (col - 1) : row * 10 + col)
function padOf(m: Model, note: number): { row: number; col: number } | null {
  if (m === 'classic') { const r = Math.floor(note / 16), c = note % 16; return c < 8 && r < 8 ? { row: 8 - r, col: c + 1 } : null }
  const row = Math.floor(note / 10), col = note % 10
  return row >= 1 && row <= 8 && col >= 1 && col <= 8 ? { row, col } : null
}

/** the Launchpad model of a port, or null (the DAW port of a newer Launchpad is not the one for programmer mode) */
export function launchpadOf(name: string): Model | null {
  if (/daw|midiin2/i.test(name)) return null
  return (profileFor(name)?.launchpad as Model | undefined) ?? null
}

const outputs = new Map<string, { port: MIDIOutput; model: Model }>()
let unsub: (() => void) | null = null
let timer = 0

export function launchpadAttach(access: MIDIAccess): void {
  access.outputs.forEach((port) => {
    const model = launchpadOf(port.name ?? '')
    if (!model || outputs.has(port.id) || port.state !== 'connected') return
    outputs.set(port.id, { port, model })
    for (const msg of START[model]) { try { port.send(msg) } catch { /* no SysEx permission */ } }
  })
  for (const [id, o] of outputs) if (o.port.state !== 'connected') outputs.delete(id)
  if (outputs.size && !unsub) {
    unsub = useProjectStore.subscribe(() => { clearTimeout(timer); timer = window.setTimeout(draw, 40) })
    window.addEventListener('beforeunload', release)
  }
  draw()
}

/** back to the Launchpad's own mode when the app closes */
function release(): void {
  for (const { port, model } of outputs.values()) for (const msg of STOP[model]) { try { port.send(msg) } catch { /* gone */ } }
}

function draw(): void {
  if (!outputs.size) return
  const { project, selectedTrackId } = useProjectStore.getState()
  const markers = [...(project.markers ?? [])].sort((a, b) => a.beat - b.beat)
  for (const { port, model } of outputs.values()) {
    const C = model === 'classic' ? CLASSIC : PALETTE
    const msgs: number[] = []
    const pad = (row: number, col: number, colour: number): void => { msgs.push(0x90, noteOf(model, row, col), colour) }
    for (let col = 1; col <= 8; col++) pad(8, col, markers[col - 1] ? C.amber : C.off)
    for (let row = 7; row >= 1; row--) {
      const t = project.tracks[7 - row]
      if (!t) { for (let col = 1; col <= 8; col++) pad(row, col, C.off); continue }
      pad(row, 1, t.muted ? C.red : C.dim)
      pad(row, 2, t.soloed ? C.blue : C.dim)
      pad(row, 3, t.id === selectedTrackId ? C.white : C.dim)
      for (let k = 0; k < 5; k++) pad(row, 4 + k, k === 0 ? (t.volume > 0.01 ? C.green : C.red) : VOL_STEPS[k] <= t.volume + 0.01 ? C.green : C.off)
    }
    try { port.send(msgs) } catch { /* unplugged */ }
  }
}

/** a message from a Launchpad: true if it was handled (a pad press) */
export function launchpadMessage(name: string, status: number, d1: number, d2: number): boolean {
  const model = launchpadOf(name)
  if (!model) return false
  const kind = status & 0xf0
  if (kind === 0xb0) return true                          // round buttons: not used yet
  if (kind !== 0x90 && kind !== 0x80) return false
  if (kind === 0x80 || d2 === 0) return true              // pad released
  const p = padOf(model, d1)
  if (!p) return true
  const st = useProjectStore.getState()
  if (p.row === 8) {
    const m = [...(st.project.markers ?? [])].sort((a, b) => a.beat - b.beat)[p.col - 1]
    if (m) seek(m.beat)
    return true
  }
  const t = st.project.tracks[7 - p.row]
  if (!t) return true
  if (p.col === 1) st.updateTrack(t.id, { muted: !t.muted })
  else if (p.col === 2) st.updateTrack(t.id, { soloed: !t.soloed })
  else if (p.col === 3) st.selectTrack(t.id)
  else st.updateTrack(t.id, { volume: VOL_STEPS[p.col - 4] })
  return true
}

export function launchpadCount(): number { return outputs.size }
