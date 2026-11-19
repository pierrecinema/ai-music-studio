// MIDI hardware (Settings → MIDI): every connected MIDI device, with two switches like in Ableton: Notes (keys and
// pads play the selected track, and are recorded) and Control (knobs, faders and buttons drive the app through a
// mapping). Known devices start with a ready mapping (midi/devices.ts); MIDI Learn links any control to any target.
// A Novation Launchpad is put into programmer mode and its grid drives the Studio (midi/launchpad.ts).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useProjectStore } from '../stores/project.store'
import { useAudioStore } from '../stores/audio.store'
import { isPlaying, pause, play, stop } from '../audio/engine'
import { noteOff, noteOn, startAnyRecording } from '../audio/midiRecord'
import { jumpMarker, toggleLoop } from '../components/timeline/studioOps'
import { vstParams, vstSetParam, type VstParam } from '../audio/vst/host'
import { liveSampleRate } from '../audio/engine'
import { INSERT_PARAMS } from '../audio/fx'
import { keyOf, profileFor, type Mapping, type Target } from './devices'
import { launchpadAttach, launchpadMessage } from './launchpad'
import type { InsertFx, Track } from '../types'

export interface DeviceSettings { notes: boolean; control: boolean; mappings?: Mapping[] }   // no mappings: the profile's
export interface Port { id: string; name: string; type: 'input' | 'output'; manufacturer: string; state: string }

interface MidiHwState {
  devices: Record<string, DeviceSettings>
  ports: Port[]                       // not saved: what is connected now
  learning: { device: string; target: Target } | null
  last: { device: string; key: string; value: number } | null   // the last control message (shown in Settings)
  available: boolean
  set: (name: string, patch: Partial<DeviceSettings>) => void
}

const DEFAULT: DeviceSettings = { notes: true, control: true }

export const useMidiHw = create<MidiHwState>()(
  persist(
    (set): MidiHwState => ({
      devices: {},
      ports: [] as Port[],
      learning: null,
      last: null,
      available: true,
      set: (name: string, patch: Partial<DeviceSettings>): void => set((s: MidiHwState) => ({ devices: { ...s.devices, [name]: { ...(s.devices[name] ?? DEFAULT), ...patch } } })),
    }),
    { name: 'ams-midi-hardware', partialize: (s) => ({ devices: s.devices }) as Partial<MidiHwState> }
  )
)

export function settingsOf(name: string, devices = useMidiHw.getState().devices): DeviceSettings {
  return devices[name] ?? DEFAULT
}
export function mappingsOf(name: string): Mapping[] {
  return settingsOf(name).mappings ?? profileFor(name)?.mappings ?? []
}

// ── the targets ───────────────────────────────────────────────────────────────

const selectedTrack = (): Track | undefined => {
  const s = useProjectStore.getState()
  return s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? s.project.tracks[0]
}

// the effect (or instrument) whose knobs the plugin targets turn: the instrument of a MIDI track, else its first effect
const pluginOf = (t: Track): InsertFx | undefined => (t.instrument?.vst ? t.instrument : t.fx?.[0])
const paramCache = new Map<string, VstParam[]>()
let paramBusy = false

async function turnPlugin(slot: number, v: number): Promise<void> {
  const t = selectedTrack()
  const fx = t && pluginOf(t)
  if (!t || !fx) return
  if (fx.type === 'vst') {
    if (paramBusy) return                                // knobs send many messages: drop the ones in between
    paramBusy = true
    try {
      let list = paramCache.get(fx.id)
      if (!list) { list = (await vstParams(fx, liveSampleRate())).filter((p) => !/bypass/i.test(p.name)); paramCache.set(fx.id, list) }
      const p = list[slot]
      if (p) await vstSetParam(fx, liveSampleRate(), p.i, v)
    } catch { /* plugin not loaded */ } finally { paramBusy = false }
    return
  }
  const d = INSERT_PARAMS[fx.type]?.[slot]
  if (!d) return
  const value = Math.round((d.min + v * (d.max - d.min)) / d.step) * d.step
  useProjectStore.getState().updateTrack(t.id, { fx: (t.fx ?? []).map((f) => (f.id === fx.id ? { ...f, p: { ...f.p, [d.key]: value } } : f)) })
}

/** what a control does: `v` 0..1 for knobs and faders; `press` for buttons (note-on, or CC above 63) */
export function runTarget(target: Target, v: number, press: boolean): void {
  const pst = useProjectStore.getState()
  switch (target.kind) {
    case 'transport':
      if (!press) return
      if (target.action === 'play') { if (isPlaying()) pause(); else void play() }
      else if (target.action === 'stop') stop()
      else if (target.action === 'record') void startAnyRecording()
      else if (target.action === 'loop') toggleLoop()
      else if (target.action === 'metronome') useAudioStore.getState().toggleMetronome()
      else if (target.action === 'back') jumpMarker(-1)
      else if (target.action === 'forward') jumpMarker(1)
      return
    case 'selected': {
      const t = selectedTrack()
      if (!t) return
      if (target.what === 'volume') pst.updateTrack(t.id, { volume: v })
      else if (target.what === 'pan') pst.updateTrack(t.id, { pan: Math.abs(v * 2 - 1) < 0.02 ? 0 : v * 2 - 1 })
      else if (target.what === 'mute' && press) pst.updateTrack(t.id, { muted: !t.muted })
      else if (target.what === 'solo' && press) pst.updateTrack(t.id, { soloed: !t.soloed })
      else if (target.what === 'send') { const r = pst.project.returns?.[0]; if (r) pst.updateTrack(t.id, { sends: { ...(t.sends ?? {}), [r.id]: v } }) }
      return
    }
    case 'plugin': void turnPlugin(target.slot, v); return
    case 'master': useAudioStore.getState().setMasterVolume(v); return
    case 'bpm': pst.setBpm(Math.round(60 + v * 140)); return
    case 'select': {
      if (!press) return
      const ts = pst.project.tracks
      const i = ts.findIndex((t) => t.id === pst.selectedTrackId)
      const next = ts[Math.max(0, Math.min(ts.length - 1, (i < 0 ? 0 : i) + target.dir))]
      if (next) pst.selectTrack(next.id)
    }
  }
}

// ── messages ──────────────────────────────────────────────────────────────────

/** one message from a device (exported for tests) */
export function onMessage(name: string, data: Uint8Array): void {
  const [status, d1 = 0, d2 = 0] = Array.from(data)
  if (status >= 0xf0) return
  const kind = status & 0xf0
  const key = keyOf(status, d1)
  const st = useMidiHw.getState()
  const isOn = kind === 0x90 && d2 > 0
  // MIDI Learn: the next knob, fader, button or pad becomes the control of the waiting target
  if (st.learning && st.learning.device === name && key && (kind === 0xb0 || isOn)) {
    const list = mappingsOf(name).filter((m) => m.key !== key && JSON.stringify(m.target) !== JSON.stringify(st.learning!.target))
    st.set(name, { mappings: [...list, { key, target: st.learning.target }] })
    useMidiHw.setState({ learning: null })
    return
  }
  const cfg = settingsOf(name)
  if (key && (kind === 0xb0 || kind === 0x90 || kind === 0x80)) useMidiHw.setState({ last: { device: name, key, value: d2 } })
  if (launchpadMessage(name, status, d1, d2)) return
  if (cfg.control && key) {
    const m = mappingsOf(name).find((x) => x.key === key)
    if (m) {
      if (kind === 0xb0) runTarget(m.target, d2 / 127, d2 > 63)
      else if (isOn) runTarget(m.target, d2 / 127, true)
      return                                              // a mapped pad does not also play a note
    }
  }
  if (!cfg.notes) return
  if (isOn) noteOn(d1, d2)
  else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) noteOff(d1)
}

// ── connection ────────────────────────────────────────────────────────────────

let access: MIDIAccess | null = null
let starting: Promise<number> | null = null

function refreshPorts(): void {
  if (!access) return
  const ports: Port[] = []
  access.inputs.forEach((p) => ports.push({ id: p.id, name: p.name ?? '?', type: 'input', manufacturer: p.manufacturer ?? '', state: p.state }))
  access.outputs.forEach((p) => ports.push({ id: p.id, name: p.name ?? '?', type: 'output', manufacturer: p.manufacturer ?? '', state: p.state }))
  useMidiHw.setState({ ports })
}

function hook(input: MIDIInput): void {
  const name = input.name ?? '?'
  input.onmidimessage = (e: MIDIMessageEvent) => { if (e.data) onMessage(name, e.data) }
}

/** connects every MIDI device (once); returns the number of inputs. New devices are taken as they are plugged in. */
export function startMidiHardware(): Promise<number> {
  if (starting) return starting.then(() => access?.inputs.size ?? 0)
  starting = (async () => {
    const nav = navigator as Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MIDIAccess> }
    if (!nav.requestMIDIAccess) { useMidiHw.setState({ available: false }); return 0 }
    try { access = await nav.requestMIDIAccess({ sysex: true }) } catch { try { access = await nav.requestMIDIAccess() } catch { useMidiHw.setState({ available: false }); return 0 } }
    access.inputs.forEach(hook)
    access.onstatechange = (e) => {
      const port = (e as MIDIConnectionEvent).port
      if (port?.type === 'input' && port.state === 'connected') hook(port as MIDIInput)
      refreshPorts()
      launchpadAttach(access!)
    }
    refreshPorts()
    launchpadAttach(access)
    return access.inputs.size
  })()
  return starting
}

/** waits for the next control of `device` and links it to `target` (Escape or cancelLearn stops it) */
export function learn(device: string, target: Target): void { useMidiHw.setState({ learning: { device, target } }) }
export function cancelLearn(): void { useMidiHw.setState({ learning: null }) }
