// Novation Launchpad (X, Mini MK3, Pro MK3) in programmer mode: the 8x8 grid drives the Studio and shows its state.
//   top row:       jump to markers 1–8 (amber: a marker is there)
//   rows 7..1:     tracks 1–7 (from the top): pad 1 mute (red), pad 2 solo (blue), pad 3 select (white),
//                  pads 4–8 volume in five steps (green up to the level)
// Pads send notes 11..88 (row * 10 + column, row 1 at the bottom); a note to the device lights a pad (palette colour).
import { useProjectStore } from '../stores/project.store'
import { seek } from '../audio/engine'
import { PROFILES } from './devices'

const SYSEX_ID: Record<string, number> = { x: 0x0c, mini3: 0x0d, pro3: 0x0e }
const C = { off: 0, white: 3, red: 5, amber: 9, green: 21, dim: 1, blue: 45 }
const VOL_STEPS = [0, 0.25, 0.5, 0.75, 1]

const launchpadOf = (name: string): string | null => {
  // the DAW port of a Launchpad is not the one that sends the pads in programmer mode
  if (/daw|midiin2/i.test(name)) return null
  return PROFILES.find((p) => p.launchpad && (p.match.test(name) || (p.launchpad === 'x' && /lpx/i.test(name)) || (p.launchpad === 'mini3' && /lpmini/i.test(name)) || (p.launchpad === 'pro3' && /lppro/i.test(name))))?.launchpad ?? null
}

const outputs = new Map<string, { port: MIDIOutput; model: string }>()
let unsub: (() => void) | null = null
let timer = 0

export function launchpadAttach(access: MIDIAccess): void {
  access.outputs.forEach((port) => {
    const model = launchpadOf(port.name ?? '')
    if (!model || outputs.has(port.id) || port.state !== 'connected') return
    outputs.set(port.id, { port, model })
    try { port.send([0xf0, 0x00, 0x20, 0x29, 0x02, SYSEX_ID[model], 0x0e, 0x01, 0xf7]) } catch { /* no SysEx permission */ }
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
  for (const { port, model } of outputs.values()) { try { port.send([0xf0, 0x00, 0x20, 0x29, 0x02, SYSEX_ID[model], 0x0e, 0x00, 0xf7]) } catch { /* gone */ } }
}

function draw(): void {
  if (!outputs.size) return
  const { project, selectedTrackId } = useProjectStore.getState()
  const markers = [...(project.markers ?? [])].sort((a, b) => a.beat - b.beat)
  const msgs: number[] = []
  const pad = (row: number, col: number, colour: number): void => { msgs.push(0x90, row * 10 + col, colour) }
  for (let col = 1; col <= 8; col++) pad(8, col, markers[col - 1] ? C.amber : C.off)
  for (let row = 7; row >= 1; row--) {
    const t = project.tracks[7 - row]
    if (!t) { for (let col = 1; col <= 8; col++) pad(row, col, C.off); continue }
    pad(row, 1, t.muted ? C.red : C.dim)
    pad(row, 2, t.soloed ? C.blue : C.dim)
    pad(row, 3, t.id === selectedTrackId ? C.white : C.dim)
    for (let k = 0; k < 5; k++) pad(row, 4 + k, k === 0 ? (t.volume > 0.01 ? C.green : C.red) : VOL_STEPS[k] <= t.volume + 0.01 ? C.green : C.off)
  }
  for (const { port } of outputs.values()) { try { port.send(msgs) } catch { /* unplugged */ } }
}

/** a message from a Launchpad: true if it was handled (a pad press) */
export function launchpadMessage(name: string, status: number, d1: number, d2: number): boolean {
  if (!launchpadOf(name)) return false
  const kind = status & 0xf0
  if (kind === 0xb0) return true                          // round buttons: not used yet
  if (kind !== 0x90 && kind !== 0x80) return false
  if (kind === 0x80 || d2 === 0) return true              // pad released
  const row = Math.floor(d1 / 10), col = d1 % 10
  if (row < 1 || row > 8 || col < 1 || col > 8) return true
  const st = useProjectStore.getState()
  if (row === 8) {
    const m = [...(st.project.markers ?? [])].sort((a, b) => a.beat - b.beat)[col - 1]
    if (m) seek(m.beat)
    return true
  }
  const t = st.project.tracks[7 - row]
  if (!t) return true
  if (col === 1) st.updateTrack(t.id, { muted: !t.muted })
  else if (col === 2) st.updateTrack(t.id, { soloed: !t.soloed })
  else if (col === 3) st.selectTrack(t.id)
  else st.updateTrack(t.id, { volume: VOL_STEPS[col - 4] })
  return true
}

export function launchpadCount(): number { return outputs.size }
