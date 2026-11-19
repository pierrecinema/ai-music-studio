// Known MIDI controllers: a starting mapping for each, recognised by the port name. Factory settings of the devices;
// if a device was set up differently (another preset in its editor), MIDI Learn in Settings → MIDI fixes any control.
// Keys: "cc:<channel 1-16>:<number>" or "note:<channel>:<number>"; targets: see Target in midi/hardware.ts.

export type Target =
  | { kind: 'transport'; action: 'play' | 'stop' | 'record' | 'loop' | 'metronome' | 'back' | 'forward' }
  | { kind: 'selected'; what: 'volume' | 'pan' | 'mute' | 'solo' | 'send' }
  | { kind: 'plugin'; slot: number }                 // knob n (0-based) of the selected track's first effect / instrument
  | { kind: 'master' }
  | { kind: 'bpm' }
  | { kind: 'select'; dir: 1 | -1 }                  // previous / next track

export interface Mapping { key: string; target: Target }
export interface DeviceProfile {
  id: string
  name: string
  match: RegExp
  notes: string                                      // a short note shown in Settings
  mappings: Mapping[]
  launchpad?: 'x' | 'mini3' | 'pro3'                 // a Launchpad: its grid drives the Studio (see launchpad.ts)
}

const knobs = (ch: number, ccs: number[], first: Target[]): Mapping[] =>
  ccs.map((cc, i) => ({ key: `cc:${ch}:${cc}`, target: first[i] ?? { kind: 'plugin', slot: i - first.length } }))

// what the first knobs do on a device without labels: volume, pan of the selected track, then plugin knobs 1..n
const KNOB_LAYOUT: Target[] = [{ kind: 'selected', what: 'volume' }, { kind: 'selected', what: 'pan' }]

export const PROFILES: DeviceProfile[] = [
  {
    id: 'mpk-mini-3', name: 'Akai MPK Mini (MK3, Play, Plus)', match: /mpk ?mini/i,
    notes: 'Keys and pads play the selected track. Knobs K1–K8 (CC 70–77): K1 volume, K2 pan of the selected track, K3–K8 the first knobs of its effect or instrument.',
    mappings: knobs(1, [70, 71, 72, 73, 74, 75, 76, 77], KNOB_LAYOUT),
  },
  {
    id: 'mpk-mini-2', name: 'Akai MPK Mini MK2', match: /mpk ?mini ?(mk ?ii|mk2)/i,
    notes: 'Knobs K1–K8 (CC 1–8): K1 volume, K2 pan, K3–K8 plugin knobs. If your knobs send other numbers, use Learn.',
    mappings: knobs(1, [1, 2, 3, 4, 5, 6, 7, 8], KNOB_LAYOUT),
  },
  {
    id: 'minilab-3', name: 'Arturia MiniLab 3', match: /minilab ?3/i,
    notes: 'Knobs 1–8 (CC 74, 71, 76, 77, 93, 18, 19, 16) and faders 1–4 (CC 82, 83, 85, 17). Use Learn if your preset differs.',
    mappings: [...knobs(1, [74, 71, 76, 77, 93, 18, 19, 16], KNOB_LAYOUT), { key: 'cc:1:82', target: { kind: 'master' } }],
  },
  {
    id: 'minilab-2', name: 'Arturia MiniLab MK II', match: /minilab ?(mk ?ii|mkii|2)/i,
    notes: 'Upper knobs 1–8: volume, pan, then plugin knobs. Use Learn if your preset differs.',
    mappings: knobs(1, [112, 74, 71, 76, 77, 93, 73, 75], KNOB_LAYOUT),
  },
  {
    id: 'keystep', name: 'Arturia KeyStep / KeyStep 37', match: /keystep/i,
    notes: 'Keys play the selected track (no knobs to map; KeyStep 37 knobs: use Learn).',
    mappings: [],
  },
  {
    id: 'launchkey-mini-3', name: 'Novation Launchkey Mini MK3', match: /launchkey ?mini/i,
    notes: 'Keys and pads play the selected track. Knobs 1–8 (CC 21–28): volume, pan, then plugin knobs.',
    mappings: knobs(1, [21, 22, 23, 24, 25, 26, 27, 28], KNOB_LAYOUT),
  },
  {
    id: 'launchkey', name: 'Novation Launchkey MK3', match: /launchkey(?! ?mini)/i,
    notes: 'Keys play the selected track. Knobs 1–8 (CC 21–28): volume, pan, plugin knobs. Transport buttons: use Learn.',
    mappings: knobs(1, [21, 22, 23, 24, 25, 26, 27, 28], KNOB_LAYOUT),
  },
  { id: 'launchpad-x', name: 'Novation Launchpad X', match: /launchpad ?x/i, launchpad: 'x', notes: 'The grid controls the Studio (see below).', mappings: [] },
  { id: 'launchpad-mini-3', name: 'Novation Launchpad Mini MK3', match: /launchpad ?mini/i, launchpad: 'mini3', notes: 'The grid controls the Studio (see below).', mappings: [] },
  { id: 'launchpad-pro-3', name: 'Novation Launchpad Pro MK3', match: /launchpad ?pro/i, launchpad: 'pro3', notes: 'The grid controls the Studio (see below).', mappings: [] },
]

/** the profile for a port name (the most specific match: MK2 before the general MPK Mini) */
export function profileFor(portName: string): DeviceProfile | null {
  const hits = PROFILES.filter((p) => p.match.test(portName))
  if (!hits.length) return null
  return hits.sort((a, b) => b.match.source.length - a.match.source.length)[0]
}

/** "cc:1:70" for a MIDI message (null: not a control); note-on of a pad counts too */
export function keyOf(status: number, d1: number): string | null {
  const ch = (status & 0x0f) + 1
  const kind = status & 0xf0
  if (kind === 0xb0) return `cc:${ch}:${d1}`
  if (kind === 0x90 || kind === 0x80) return `note:${ch}:${d1}`
  return null
}

export function keyLabel(key: string): string {
  const [k, ch, n] = key.split(':')
  return k === 'cc' ? `CC ${n} · ch ${ch}` : `Note ${n} · ch ${ch}`
}
