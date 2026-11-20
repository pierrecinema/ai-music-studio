// The app's side of the MCP bridge (apps/server/services/app_bridge.py): the window asks the backend for work and
// runs it on the open project, so MCP clients (Claude, other agents) and the AI chat can add tracks, choose
// instruments and MIDI effects and write notes in the project the user sees.
import { nanoid } from 'nanoid'
import { baseUrl } from './api'
import { useProjectStore } from '../stores/project.store'
import { usePluginsStore } from '../stores/plugins.store'
import { isInstrumentLike, type PluginInfo } from '../audio/vst/host'
import { FREE_PLUGINS } from './freeCatalog'
import { PACK_INSTRUMENTS } from '../audio/soundbank'
import { TIMBRES } from '../audio/synth'
import type { InsertFx, Track } from '../types'

type Args = Record<string, any>   // eslint-disable-line @typescript-eslint/no-explicit-any

const isMidiPlugin = (p: Pick<PluginInfo, 'name' | 'category'>): boolean =>
  FREE_PLUGINS.some((f) => f.kind === 'midi' && f.match.test(p.name)) || /midi|arp|sequenc|chord|pattern|harmoni[sz]er/i.test(`${p.name} ${p.category ?? ''}`)

function trackOf(ref: unknown): Track {
  const tracks = useProjectStore.getState().project.tracks
  const s = String(ref ?? '').trim()
  const t = tracks.find((x) => x.id === s) ?? tracks.find((x) => x.name.toLowerCase() === s.toLowerCase())
    ?? tracks.find((x) => x.name.toLowerCase().includes(s.toLowerCase()))
  if (!t) throw new Error(`No track "${s}". Tracks: ${tracks.map((x) => x.name).join(', ') || 'none'}`)
  return t
}

function pluginOf(name: string, want: 'instrument' | 'midi' | 'any'): PluginInfo {
  const st = usePluginsStore.getState()
  const all = st.plugins.filter((p) => !st.off.includes(p.id))
  const n = name.toLowerCase()
  const hits = all.filter((p) => p.name.toLowerCase().includes(n) || `${p.vendor} ${p.name}`.toLowerCase().includes(n))
  if (!hits.length) throw new Error(`No plugin "${name}" found. Search for plugins in Settings → Plugins first. Found: ${all.map((p) => p.name).slice(0, 40).join(', ') || 'none'}`)
  const score = (p: PluginInfo): number => (p.name.toLowerCase() === n ? 4 : 0) + (want === 'instrument' && isInstrumentLike(p) ? 2 : 0) + (want === 'midi' && isMidiPlugin(p) ? 2 : 0) + (p.format === 'VST3' ? 1 : 0)
  return hits.sort((a, b) => score(b) - score(a))[0]
}

const vstFx = (p: PluginInfo): InsertFx => ({ id: nanoid(), type: 'vst', on: true, p: {}, vst: { pluginId: p.id, name: p.name, vendor: p.vendor, format: p.format, xml: p.xml, arch: p.arch } })

function describe(t: Track): Record<string, unknown> {
  return {
    id: t.id, name: t.name, type: t.type, volume: t.volume, pan: t.pan, muted: t.muted, soloed: t.soloed,
    instrument: t.instrument?.vst?.name, midiEffects: (t.midiFx ?? []).map((f) => f.vst?.name), sound: t.sound, program: t.program,
    effects: (t.fx ?? []).map((f) => (f.type === 'vst' ? f.vst?.name : f.type)),
    clips: t.clips.map((c) => ({ start: c.startTime, length: c.duration, name: c.name, notes: c.notes?.length ?? 0, audio: !!c.audioFile })),
  }
}

const HANDLERS: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  get_project: () => {
    const p = useProjectStore.getState().project
    return { name: p.name, bpm: p.bpm, tracks: p.tracks.map(describe) }
  },
  list_plugins: (a) => {
    const st = usePluginsStore.getState()
    const all = st.plugins.filter((p) => !st.off.includes(p.id))
    const kind = a.kind ?? 'all'
    const pick = all.filter((p) => kind === 'all' || (kind === 'midi' ? isMidiPlugin(p) : kind === 'instrument' ? isInstrumentLike(p) && !isMidiPlugin(p) : !isInstrumentLike(p) && !isMidiPlugin(p)))
    return {
      plugins: pick.map((p) => ({ name: p.name, vendor: p.vendor, format: p.format, kind: isMidiPlugin(p) ? 'midi' : isInstrumentLike(p) ? 'instrument' : 'effect' })),
      builtInSounds: TIMBRES.map((x) => x.id),
      soundPack: PACK_INSTRUMENTS.flatMap((g) => g.items.map(([program, label]) => ({ program, name: label, group: g.group }))),
    }
  },
  add_midi_track: (a) => {
    const st = useProjectStore.getState()
    st.addTrack('midi')
    const tracks = useProjectStore.getState().project.tracks
    const t = tracks[tracks.length - 1]
    const patch: Partial<Track> = {}
    if (a.name) patch.name = String(a.name)
    if (typeof a.program === 'number') patch.program = a.program
    if (a.sound) patch.sound = a.sound
    if (Object.keys(patch).length) st.updateTrack(t.id, patch)
    return describe(useProjectStore.getState().project.tracks.find((x) => x.id === t.id)!)
  },
  set_instrument: (a) => {
    const t = trackOf(a.track)
    const st = useProjectStore.getState()
    if (a.plugin) {
      const p = pluginOf(String(a.plugin), 'instrument')
      if (isMidiPlugin(p)) throw new Error(`${p.name} is a MIDI plugin (no sound): use app_add_midi_effect for it, and a synthesizer as the instrument.`)
      st.updateTrack(t.id, { instrument: vstFx(p) })
    } else if (typeof a.program === 'number' || a.sound) {
      st.updateTrack(t.id, { instrument: undefined, program: typeof a.program === 'number' ? a.program : undefined, sound: a.sound ?? t.sound })
    } else throw new Error('Give plugin, program or sound.')
    return describe(useProjectStore.getState().project.tracks.find((x) => x.id === t.id)!)
  },
  add_midi_effect: (a) => {
    const t = trackOf(a.track)
    if (!t.instrument?.vst) throw new Error('MIDI effects play through a VST instrument: set one first with app_set_instrument (for example plugin "Dexed").')
    const p = pluginOf(String(a.plugin), 'midi')
    useProjectStore.getState().updateTrack(t.id, { midiFx: [...(t.midiFx ?? []), vstFx(p)] })
    return describe(useProjectStore.getState().project.tracks.find((x) => x.id === t.id)!)
  },
  add_notes: (a) => {
    const t = trackOf(a.track)
    const notes = (Array.isArray(a.notes) ? a.notes : []) as Array<{ pitch: number; start: number; length: number; velocity?: number }>
    if (!notes.length) throw new Error('No notes.')
    const start = Math.max(0, (Number(a.startBar ?? 1) - 1) * 4)
    const end = Math.max(...notes.map((n) => Number(n.start) + Number(n.length)))
    const duration = Math.max(4, Math.ceil(end / 4) * 4)
    useProjectStore.getState().addClip(t.id, {
      startTime: start, duration, name: a.name ? String(a.name) : 'MIDI clip',
      notes: notes.map((n) => ({ id: nanoid(), pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), startTime: Math.max(0, Number(n.start)), duration: Math.max(0.01, Number(n.length)), velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 100))) })),
    })
    return { track: t.name, clipStartBar: start / 4 + 1, bars: duration / 4, notes: notes.length }
  },
  set_track: (a) => {
    const t = trackOf(a.track)
    const patch: Partial<Track> = {}
    for (const k of ['name', 'volume', 'pan', 'muted', 'soloed'] as const) if (a[k] !== undefined) (patch as Args)[k] = a[k]
    if (typeof patch.volume === 'number') patch.volume = Math.max(0, Math.min(1, patch.volume))
    if (typeof patch.pan === 'number') patch.pan = Math.max(-1, Math.min(1, patch.pan))
    useProjectStore.getState().updateTrack(t.id, patch)
    return describe(useProjectStore.getState().project.tracks.find((x) => x.id === t.id)!)
  },
  set_bpm: (a) => {
    const bpm = Math.max(20, Math.min(300, Number(a.bpm)))
    useProjectStore.getState().setBpm(bpm)
    return { bpm }
  },
  transport: async (a) => {
    const eng = await import('../audio/engine')
    if (a.action === 'play') await eng.play()
    else if (a.action === 'stop') eng.stop()
    else if (a.action === 'start') eng.seek(0)
    return { done: a.action }
  },
}

let running = false
/** starts asking the backend for work (once; keeps going while the window is open) */
export function startAppBridge(): void {
  if (running) return
  running = true
  void (async () => {
    for (;;) {
      try {
        const base = await baseUrl()
        const r = await fetch(`${base}/mcp/app/next`)
        if (!r.ok) throw new Error(String(r.status))
        const cmd = await r.json()
        if (cmd.none) continue
        let body: Record<string, unknown>
        try {
          const h = HANDLERS[cmd.name]
          if (!h) throw new Error(`Unknown command ${cmd.name}`)
          body = { id: cmd.id, ok: true, result: await h(cmd.args ?? {}) }
        } catch (e) { body = { id: cmd.id, ok: false, error: (e as Error).message } }
        await fetch(`${base}/mcp/app/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } catch {
        await new Promise((res) => setTimeout(res, 3000))           // backend not running (yet): try again later
      }
    }
  })()
}

export const appBridgeHandlers = HANDLERS
