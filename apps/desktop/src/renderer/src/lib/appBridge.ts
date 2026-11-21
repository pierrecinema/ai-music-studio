// The app's side of the MCP bridge (apps/server/services/app_bridge.py): the window asks the backend for work and
// runs it on the open project, so MCP clients (Claude, other agents) and the AI chat can do in the project what the
// user can do: files (new, open, save, import, export), tracks, clips and notes, instruments and MIDI effects,
// effects and plugin settings, sends and return tracks, automation, markers and loop, the song generator and the
// band, the transport and the pages of the app.
import { nanoid } from 'nanoid'
import { baseUrl } from './api'
import { useProjectStore } from '../stores/project.store'
import { usePluginsStore } from '../stores/plugins.store'
import { useAudioStore } from '../stores/audio.store'
import { useUIStore } from '../stores/ui.store'
import { isInstrumentLike, type PluginInfo } from '../audio/vst/host'
import { FREE_PLUGINS } from './freeCatalog'
import { PACK_INSTRUMENTS } from '../audio/soundbank'
import { TIMBRES } from '../audio/synth'
import { INSERT_PARAMS, INSERT_LABEL, insertDefaults, RETURN_DEFAULTS } from '../audio/fx'
import { GENRES, generateSong, SECTION_LABEL, type Mode } from './songgen'
import { DRUM_STYLES, BASS_STYLES, GUITAR_STYLES, drummer, bassist, guitarist, parseProgression, fillChords, detectChords, chordName,
  type DrumStyle, type BassStyle, type GuitarStyle, type BandNote } from './band'
import { writeMidi } from './midiFile'
import type { AutoParam, Clip, InsertFx, InsertType, Note, Track, TrackType, View } from '../types'

type Args = Record<string, any>   // eslint-disable-line @typescript-eslint/no-explicit-any

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }
const VIEWS: View[] = ['library', 'timeline', 'piano-roll', 'mixer', 'vocal-editor', 'instruments', 'ai-chat', 'stem-splitter', 'video-composer', 'create', 'mastering', 'karaoke', 'settings']
const TRACK_TYPES: TrackType[] = ['midi', 'audio', 'vocal', 'instrument', 'group']

const proj = (): ReturnType<typeof useProjectStore.getState>['project'] => useProjectStore.getState().project
const bpb = (): number => proj().timeSignature?.[0] ?? 4
const barToBeat = (bar: unknown, fallback = 1): number => Math.max(0, (Number(bar ?? fallback) - 1) * bpb())
const beatToBar = (beat: number): number => Math.round((beat / bpb() + 1) * 1000) / 1000
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const num = (v: unknown): number | undefined => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v))

const isMidiPlugin = (p: Pick<PluginInfo, 'name' | 'category'>): boolean =>
  FREE_PLUGINS.some((f) => f.kind === 'midi' && f.match.test(p.name)) || /midi|arp|sequenc|chord|pattern|harmoni[sz]er/i.test(`${p.name} ${p.category ?? ''}`)

function trackOf(ref: unknown): Track {
  const tracks = proj().tracks
  const s = String(ref ?? '').trim()
  if (!s) throw new Error('Give the track (id or name).')
  const n = Number(s)
  const t = tracks.find((x) => x.id === s) ?? tracks.find((x) => x.name.toLowerCase() === s.toLowerCase())
    ?? tracks.find((x) => x.name.toLowerCase().includes(s.toLowerCase())) ?? (Number.isInteger(n) && n >= 1 ? tracks[n - 1] : undefined)
  if (!t) throw new Error(`No track "${s}". Tracks: ${tracks.map((x) => x.name).join(', ') || 'none'}`)
  return t
}
const fresh = (id: string): Track => proj().tracks.find((x) => x.id === id)!

/** a clip of a track: its id, its number (1 = the first clip in time), "last", or the clip at bar N ("bar:N"); default: the last one */
function clipOf(t: Track, ref: unknown): Clip {
  const clips = [...t.clips].sort((a, b) => a.startTime - b.startTime)
  if (!clips.length) throw new Error(`The track "${t.name}" has no clips.`)
  const s = String(ref ?? 'last').trim()
  let c: Clip | undefined
  if (s === 'last' || s === '') c = clips[clips.length - 1]
  else if (/^bar:/i.test(s)) { const b = barToBeat(s.slice(4)); c = clips.find((x) => b >= x.startTime && b < x.startTime + x.duration) }
  else c = clips.find((x) => x.id === s) ?? clips.find((x) => (x.name ?? '').toLowerCase() === s.toLowerCase()) ?? (Number.isInteger(Number(s)) ? clips[Number(s) - 1] : undefined)
  if (!c) throw new Error(`No clip "${s}" on "${t.name}". It has ${clips.length} clip(s): ${clips.map((x, i) => `${i + 1} = bar ${beatToBar(x.startTime)}${x.name ? ` "${x.name}"` : ''}`).join(', ')}`)
  return c
}

function pluginOf(name: string, want: 'instrument' | 'midi' | 'effect' | 'any'): PluginInfo {
  const st = usePluginsStore.getState()
  const all = st.plugins.filter((p) => !st.off.includes(p.id))
  const n = name.toLowerCase()
  const hits = all.filter((p) => p.name.toLowerCase().includes(n) || `${p.vendor} ${p.name}`.toLowerCase().includes(n))
  if (!hits.length) throw new Error(`No plugin "${name}" found. Search for plugins in Settings → Plugins first. Found: ${all.map((p) => p.name).slice(0, 40).join(', ') || 'none'}`)
  const score = (p: PluginInfo): number => (p.name.toLowerCase() === n ? 4 : 0) + (want === 'instrument' && isInstrumentLike(p) ? 2 : 0)
    + (want === 'midi' && isMidiPlugin(p) ? 2 : 0) + (want === 'effect' && !isInstrumentLike(p) && !isMidiPlugin(p) ? 2 : 0) + (p.format === 'VST3' ? 1 : 0)
  return hits.sort((a, b) => score(b) - score(a))[0]
}

const vstFx = (p: PluginInfo): InsertFx => ({ id: nanoid(), type: 'vst', on: true, p: {}, vst: { pluginId: p.id, name: p.name, vendor: p.vendor, format: p.format, xml: p.xml, arch: p.arch } })
const fxName = (f: InsertFx): string => (f.type === 'vst' ? f.vst?.name ?? 'VST' : INSERT_LABEL[f.type])
const fxInfo = (f: InsertFx, i: number): Record<string, unknown> => ({ number: i + 1, id: f.id, type: f.type, name: fxName(f), on: f.on, settings: f.type === 'vst' ? undefined : f.p })

// ── effect chains: a track's inserts, its MIDI effects, or the master ──
type Chain = { label: string; list: InsertFx[]; save: (l: InsertFx[]) => void }
function chainOf(ref: unknown, which?: unknown): Chain {
  if (String(ref ?? '').trim().toLowerCase() === 'master') {
    return { label: 'Master', list: proj().masterFx ?? [], save: (l) => useProjectStore.getState().updateProject({ masterFx: l }) }
  }
  const t = trackOf(ref)
  if (which === 'midi') return { label: `${t.name} (MIDI effects)`, list: t.midiFx ?? [], save: (l) => useProjectStore.getState().updateTrack(t.id, { midiFx: l }) }
  return { label: t.name, list: t.fx ?? [], save: (l) => useProjectStore.getState().updateTrack(t.id, { fx: l }) }
}
function fxOf(c: Chain, ref: unknown): InsertFx {
  if (!c.list.length) throw new Error(`${c.label} has no effects.`)
  const raw = String(ref ?? '').trim(), s = raw.toLowerCase()
  const n = Number(s)
  const f = (Number.isInteger(n) && n >= 1 ? c.list[n - 1] : undefined) ?? c.list.find((x) => x.id === raw) ?? c.list.find((x) => x.type === s)
    ?? c.list.find((x) => fxName(x).toLowerCase().includes(s))
  if (!f) throw new Error(`No effect "${ref}" on ${c.label}. Effects: ${c.list.map((x, i) => `${i + 1} ${fxName(x)}`).join(', ')}`)
  return f
}
/** built-in settings by key or label, kept inside their range */
function settingsFor(type: InsertType, given: Args | undefined, base: Record<string, number>): Record<string, number> {
  const out = { ...base }
  for (const [k, v] of Object.entries(given ?? {})) {
    const d = INSERT_PARAMS[type].find((x) => x.key.toLowerCase() === k.toLowerCase() || x.label.toLowerCase() === k.toLowerCase())
    if (!d) throw new Error(`${INSERT_LABEL[type]} has no setting "${k}". Settings: ${INSERT_PARAMS[type].map((x) => `${x.key} (${x.min}..${x.max}${x.unit ? ' ' + x.unit : ''})`).join(', ')}`)
    out[d.key] = clamp(Number(v), d.min, d.max)
  }
  return out
}

function returnOf(ref: unknown): NonNullable<ReturnType<typeof proj>['returns']>[number] {
  const rs = proj().returns ?? []
  const raw = String(ref ?? '').trim(), s = raw.toLowerCase()
  const r = rs.find((x) => x.id === raw) ?? rs.find((x) => x.name.toLowerCase() === s) ?? rs.find((x) => x.name.toLowerCase().includes(s))
    ?? rs.find((x) => x.name.toLowerCase().startsWith(s + ' ')) ?? (s === 'reverb' || s === 'delay' ? rs.find((x) => x.effect === s) : undefined)
  if (!r) throw new Error(`No return track "${ref}". Returns: ${rs.map((x) => x.name).join(', ') || 'none (add one with app_add_return)'}`)
  return r
}

function describe(t: Track): Record<string, unknown> {
  const parent = t.parentId ? proj().tracks.find((x) => x.id === t.parentId)?.name : undefined
  return {
    number: proj().tracks.indexOf(t) + 1, id: t.id, name: t.name, type: t.type, color: t.color, volume: t.volume, pan: t.pan, muted: t.muted, soloed: t.soloed,
    group: parent, instrument: t.instrument?.vst?.name, midiEffects: (t.midiFx ?? []).map((f) => f.vst?.name), sound: t.sound, program: t.program, reverb: t.reverb,
    effects: (t.fx ?? []).map(fxInfo),
    sends: Object.fromEntries(Object.entries(t.sends ?? {}).map(([id, v]) => [(proj().returns ?? []).find((r) => r.id === id)?.name ?? id, v])),
    automation: Object.keys(t.automation ?? {}).filter((k) => (t.automation?.[k as AutoParam]?.length ?? 0) > 0),
    clips: [...t.clips].sort((a, b) => a.startTime - b.startTime).map((c, i) => ({
      number: i + 1, id: c.id, name: c.name, startBar: beatToBar(c.startTime), bars: Math.round((c.duration / bpb()) * 1000) / 1000,
      notes: c.audioFile ? undefined : c.notes?.length ?? 0, audioFile: c.audioFile, gain: c.gain, fadeIn: c.fadeIn, fadeOut: c.fadeOut,
    })),
  }
}

const noteOut = (n: Note): Record<string, unknown> => ({ pitch: n.pitch, start: Math.round(n.startTime * 1000) / 1000, length: Math.round(n.duration * 1000) / 1000, velocity: n.velocity, ...(n.lyric ? { lyric: n.lyric } : {}) })
function notesIn(list: unknown): Note[] {
  const notes = (Array.isArray(list) ? list : []) as Array<{ pitch: number; start: number; length: number; velocity?: number; lyric?: string }>
  return notes.map((n) => ({
    id: nanoid(), pitch: clamp(Math.round(Number(n.pitch)), 0, 127), startTime: Math.max(0, Number(n.start) || 0), duration: Math.max(0.01, Number(n.length) || 0.25),
    velocity: clamp(Math.round(Number(n.velocity ?? 100)), 1, 127), ...(n.lyric ? { lyric: String(n.lyric) } : {}),
  }))
}

/** a new MIDI track holding one clip (song generator, band, MIDI import) */
function addPartTrack(name: string, notes: BandNote[], startBeat: number, beats: number, patch: Partial<Track>): Track {
  useProjectStore.getState().addTrack('midi')
  const tracks = proj().tracks
  const id = tracks[tracks.length - 1].id
  useProjectStore.getState().updateTrack(id, { name, ...patch })
  useProjectStore.getState().addClip(id, { startTime: startBeat, duration: beats, name, notes: notes.map((n) => ({ ...n, id: nanoid() })) })
  return fresh(id)
}

function keyOf(v: unknown): { key: number; mode?: Mode } {
  if (v === undefined || v === null || v === '') return { key: 9 }
  if (typeof v === 'number') return { key: ((Math.round(v) % 12) + 12) % 12 }
  const m = String(v).trim().match(/^([A-Ga-g])([#b]?)\s*(m|min|minor|maj|major|dur|moll)?$/i)
  if (!m) throw new Error(`Key "${v}": write it like C, F#, Bb, Am or C# minor.`)
  let name = m[1].toUpperCase() + (m[2] ?? '')
  name = FLATS[name] ?? (name === 'Cb' ? 'B' : name === 'Fb' ? 'E' : name === 'E#' ? 'F' : name === 'B#' ? 'C' : name)
  const k = KEYS.indexOf(name)
  const q = (m[3] ?? '').toLowerCase()
  return { key: k, mode: q ? (q.startsWith('m') && q !== 'maj' && q !== 'major' ? 'minor' : 'major') : undefined }
}

const HANDLERS: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  // ── project and files ──
  get_project: async () => {
    const st = useProjectStore.getState()
    const p = st.project
    const eng = await import('../audio/engine')
    const hist = (await import('../shortcuts/history')).historySize()
    return {
      name: p.name, file: st.filePath, unsavedChanges: st.dirty, bpm: p.bpm, timeSignature: p.timeSignature, tempoChanges: p.tempoMap, signatureChanges: p.signatures,
      lengthBars: Math.ceil(eng.projectEndBeat(p) / bpb()), playing: eng.isPlaying(), positionBar: beatToBar(useAudioStore.getState().currentBeat),
      loop: p.loop ? { startBar: beatToBar(p.loop.start), endBar: beatToBar(p.loop.end), enabled: p.loop.enabled } : undefined,
      markers: (p.markers ?? []).map((m) => ({ name: m.name, bar: beatToBar(m.beat), endBar: m.end !== undefined ? beatToBar(m.end) : undefined })),
      returns: (p.returns ?? []).map((r) => ({ name: r.name, effect: r.effect, volume: r.volume, pan: r.pan, muted: r.muted, decay: r.decay, delayBeats: r.delayBeats, feedback: r.feedback })),
      masterEffects: (p.masterFx ?? []).map(fxInfo), masterVolume: useAudioStore.getState().masterVolume,
      undoSteps: hist.undo, redoSteps: hist.redo, page: useUIStore.getState().activeView,
      tracks: p.tracks.map(describe),
    }
  },
  set_project: (a) => {
    const st = useProjectStore.getState()
    if (a.name) st.updateProject({ name: String(a.name) })
    if (num(a.bpm) !== undefined) { const bpm = clamp(Number(a.bpm), 20, 300); st.setBpm(bpm); useAudioStore.setState({ bpm }) }
    if (Array.isArray(a.timeSignature) && a.timeSignature.length === 2) st.updateProject({ timeSignature: [clamp(Math.round(a.timeSignature[0]), 1, 16), [2, 4, 8, 16].includes(Number(a.timeSignature[1])) ? Number(a.timeSignature[1]) : 4] })
    if (num(a.countInBars) !== undefined) st.updateProject({ countIn: clamp(Math.round(Number(a.countInBars)), 0, 4) })
    if (num(a.masterVolume) !== undefined) useAudioStore.setState({ masterVolume: clamp(Number(a.masterVolume), 0, 1) })
    const p = proj()
    return { name: p.name, bpm: p.bpm, timeSignature: p.timeSignature, countInBars: p.countIn ?? 0, masterVolume: useAudioStore.getState().masterVolume }
  },
  new_project: async (a) => {
    if (useProjectStore.getState().dirty && !a.discardChanges) throw new Error('The open project has unsaved changes: save it first (app_save_project) or pass discardChanges: true.')
    const io = await import('../project/io')
    io.newProjectNow(a.name ? String(a.name) : 'Untitled Project')
    return { name: proj().name }
  },
  open_project: async (a) => {
    if (!a.path) throw new Error('Give the path of an .ams project file.')
    if (useProjectStore.getState().dirty && !a.discardChanges) throw new Error('The open project has unsaved changes: save it first (app_save_project) or pass discardChanges: true.')
    const io = await import('../project/io')
    const r = await io.openProjectFile(String(a.path))
    if (!r.ok) throw new Error(r.message ?? 'The project cannot be opened.')
    return { opened: String(a.path), name: proj().name, tracks: proj().tracks.length, missingFiles: r.missing }
  },
  save_project: async (a) => {
    const st = useProjectStore.getState()
    let path = a.path ? String(a.path) : st.filePath
    if (!path) throw new Error('The project was never saved: give a path (for example C:\\Users\\me\\Music\\My song.ams).')
    if (!/\.ams$/i.test(path)) path += '.ams'
    const io = await import('../project/io')
    await io.saveProjectTo(path)
    return { saved: path }
  },
  undo: async (a) => {
    const h = await import('../shortcuts/history')
    let n = 0
    for (let i = 0; i < clamp(Math.round(Number(a.steps ?? 1)), 1, 50); i++) if (a.redo ? h.redo() : h.undo()) n++
    return { done: n, ...h.historySize() }
  },
  export_audio: async (a) => {
    if (!a.path) throw new Error('Give the path of the file to write (.wav or .mp3).')
    const path = String(a.path)
    const mp3 = /\.mp3$/i.test(path)
    const eng = await import('../audio/engine')
    const mix = await eng.renderMix({ bits: Number(a.bits) === 24 ? 24 : 16, normalize: !!a.normalize })
    if (mp3) {
      const r = await window.api.exporter.mp3(mix.wav, path, clamp(Number(a.kbps ?? 320), 64, 320))
      if (!r.ok) throw new Error(`MP3 needs ffmpeg (${r.error}). Export a .wav instead.`)
    } else await window.api.exporter.write(/\.wav$/i.test(path) ? path : `${path}.wav`, mix.wav)
    const db = mix.peak > 0 ? Math.round(20 * Math.log10(mix.peak) * 10) / 10 : -Infinity
    return { saved: path, seconds: Math.round(mix.seconds * 10) / 10, peakDb: db, clips: mix.peak >= 0.999 }
  },
  export_midi: async (a) => {
    if (!a.path) throw new Error('Give the path of the .mid file to write.')
    const p = proj()
    const tracks = (a.track ? [trackOf(a.track)] : p.tracks.filter((t) => t.type === 'midi'))
    const data = tracks.map((t, i) => ({
      name: t.name, channel: t.sound === 'drums' || (t.program ?? 0) >= 128 ? 9 : i % 16 === 9 ? 10 : i % 16,
      notes: t.clips.flatMap((c) => (c.notes ?? []).filter((n) => n.startTime < c.duration).map((n) => ({ pitch: n.pitch, startTime: c.startTime + n.startTime, duration: Math.min(n.duration, c.duration - n.startTime), velocity: n.velocity }))),
    })).filter((t) => t.notes.length)
    if (!data.length) throw new Error('No MIDI notes to export.')
    const path = /\.midi?$/i.test(String(a.path)) ? String(a.path) : `${a.path}.mid`
    await window.api.exporter.write(path, writeMidi(data, p.bpm))
    return { saved: path, tracks: data.map((t) => t.name) }
  },
  import_file: async (a) => {
    const paths = (Array.isArray(a.paths) ? a.paths : [a.path]).filter(Boolean).map(String)
    if (!paths.length) throw new Error('Give path (an audio file: wav, mp3, flac, ogg … or a .mid file).')
    const tl = await import('../components/timeline/Timeline')
    const before = proj().tracks.length
    const problems = await tl.importAudioFiles(paths, { trackId: a.track ? trackOf(a.track).id : undefined, startBeat: barToBeat(a.startBar), noBeatMatch: true, warpBpm: num(a.loopBpm) })
    if (problems.length && problems.length === paths.length) throw new Error(problems.join(' '))
    return { newTracks: proj().tracks.slice(before).map((t) => t.name), problems }
  },

  // ── pages and selection ──
  show: (a) => {
    const ui = useUIStore.getState()
    if (a.track) useProjectStore.getState().selectTrack(trackOf(a.track).id)
    if (a.track && a.clip !== undefined) { const c = clipOf(trackOf(a.track), a.clip); useProjectStore.getState().selectClip(c.id) }
    if (a.page) {
      const v = String(a.page).toLowerCase().replace(/^studio$/, 'timeline').replace(/^piano ?roll$/, 'piano-roll').replace(/\s+/g, '-') as View
      if (!VIEWS.includes(v)) throw new Error(`No page "${a.page}". Pages: ${VIEWS.join(', ')} (studio = timeline)`)
      ui.setActiveView(v)
    }
    return { page: useUIStore.getState().activeView, selectedTrack: useProjectStore.getState().selectedTrackId }
  },

  // ── plugins and instruments ──
  list_plugins: (a) => {
    const st = usePluginsStore.getState()
    const all = st.plugins.filter((p) => !st.off.includes(p.id))
    const kind = a.kind ?? 'all'
    const pick = all.filter((p) => kind === 'all' || (kind === 'midi' ? isMidiPlugin(p) : kind === 'instrument' ? isInstrumentLike(p) && !isMidiPlugin(p) : !isInstrumentLike(p) && !isMidiPlugin(p)))
    return {
      plugins: pick.map((p) => ({ name: p.name, vendor: p.vendor, format: p.format, kind: isMidiPlugin(p) ? 'midi' : isInstrumentLike(p) ? 'instrument' : 'effect' })),
      builtInSounds: TIMBRES.map((x) => x.id),
      soundPack: PACK_INSTRUMENTS.flatMap((g) => g.items.map(([program, label]) => ({ program, name: label, group: g.group }))),
      builtInEffects: Object.keys(INSERT_PARAMS).filter((k) => k !== 'vst'),
    }
  },
  list_effect_types: () => Object.fromEntries((Object.keys(INSERT_PARAMS) as InsertType[]).filter((k) => k !== 'vst').map((k) => [k, {
    name: INSERT_LABEL[k], settings: INSERT_PARAMS[k].map((d) => ({ key: d.key, label: d.label, min: d.min, max: d.max, default: d.def, unit: d.unit })),
  }])),
  list_styles: () => ({
    genres: GENRES.map((g) => ({ id: g.id, name: g.label, bpm: g.bpm, mode: g.mode })),
    drums: DRUM_STYLES.map((d) => ({ id: d.id, name: d.label, bpm: d.bpm })), bass: BASS_STYLES.map((d) => ({ id: d.id, name: d.label })),
    guitar: GUITAR_STYLES.map((d) => ({ id: d.id, name: d.label })), keys: KEYS,
  }),
  sound_packs: async (a) => {
    if (!window.api.sounds) throw new Error('Sound packs need the desktop app.')
    if (a.install) {
      const r = await window.api.sounds.install(String(a.install))
      if (!r.ok) throw new Error(r.error ?? 'The download failed.')
      await (await import('../audio/soundbank')).loadSoundPack()
    }
    const s = await window.api.sounds.status()
    return (s.packs ?? []).map((p) => ({ id: p.id, name: p.name, what: p.what, installed: p.installed, downloadMb: p.downloadMb, diskMb: p.diskMb }))
  },

  // ── tracks ──
  add_track: (a) => {
    const type = String(a.type ?? 'midi') as TrackType
    if (!TRACK_TYPES.includes(type)) throw new Error(`Track type: ${TRACK_TYPES.join(', ')}`)
    const st = useProjectStore.getState()
    st.addTrack(type)
    const t = proj().tracks[proj().tracks.length - 1]
    const patch: Partial<Track> = {}
    if (a.name) patch.name = String(a.name)
    if (a.color) patch.color = String(a.color)
    if (typeof a.program === 'number') patch.program = a.program
    if (a.sound) patch.sound = a.sound
    if (num(a.volume) !== undefined) patch.volume = clamp(Number(a.volume), 0, 1)
    if (Object.keys(patch).length) st.updateTrack(t.id, patch)
    if (num(a.position) !== undefined) st.moveTrack(t.id, Number(a.position) - 1)
    st.selectTrack(t.id)
    return describe(fresh(t.id))
  },
  add_midi_track: (a) => HANDLERS.add_track({ ...a, type: 'midi' }),
  remove_track: (a) => {
    const t = trackOf(a.track)
    useProjectStore.getState().removeTrack(t.id)
    return { removed: t.name, tracks: proj().tracks.map((x) => x.name) }
  },
  duplicate_track: (a) => {
    const t = trackOf(a.track)
    const copy: Track = JSON.parse(JSON.stringify(t))
    copy.id = nanoid(); copy.name = a.name ? String(a.name) : `${t.name} copy`
    copy.clips = copy.clips.map((c) => ({ ...c, id: nanoid(), notes: c.notes?.map((n) => ({ ...n, id: nanoid() })) }))
    copy.fx = copy.fx?.map((f) => ({ ...f, id: nanoid() })); copy.midiFx = copy.midiFx?.map((f) => ({ ...f, id: nanoid() }))
    if (copy.instrument) copy.instrument = { ...copy.instrument, id: nanoid() }
    copy.automation = undefined                                          // effect lanes would point at the old effects
    const tracks = [...proj().tracks]
    tracks.splice(tracks.indexOf(t) + 1, 0, copy)
    useProjectStore.getState().updateProject({ tracks })
    return describe(fresh(copy.id))
  },
  move_track: (a) => {
    const t = trackOf(a.track)
    useProjectStore.getState().moveTrack(t.id, clamp(Math.round(Number(a.position ?? 1)) - 1, 0, proj().tracks.length - 1))
    return { order: proj().tracks.map((x) => x.name) }
  },
  set_track: (a) => {
    const t = trackOf(a.track)
    const patch: Partial<Track> = {}
    for (const k of ['name', 'volume', 'pan', 'muted', 'soloed', 'color', 'collapsed'] as const) if (a[k] !== undefined) (patch as Args)[k] = a[k]
    if (typeof patch.volume === 'number') patch.volume = clamp(patch.volume, 0, 1)
    if (typeof patch.pan === 'number') patch.pan = clamp(patch.pan, -1, 1)
    if (num(a.reverb) !== undefined) patch.reverb = clamp(Number(a.reverb), 0, 1)
    useProjectStore.getState().updateTrack(t.id, patch)
    return describe(fresh(t.id))
  },
  group_tracks: (a) => {
    const ids = (Array.isArray(a.tracks) ? a.tracks : []).map((x: unknown) => trackOf(x).id)
    if (!ids.length) throw new Error('Give tracks: the tracks to put into a group.')
    useProjectStore.getState().groupTracks(ids)
    const g = proj().tracks.find((x) => x.type === 'group' && proj().tracks.some((c) => c.parentId === x.id && ids.includes(c.id)))!
    if (a.name) useProjectStore.getState().updateTrack(g.id, { name: String(a.name) })
    return describe(fresh(g.id))
  },
  ungroup: (a) => {
    const g = trackOf(a.track)
    if (g.type !== 'group') throw new Error(`${g.name} is not a group track.`)
    useProjectStore.getState().ungroup(g.id)
    return { ungrouped: g.name }
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
    return describe(fresh(t.id))
  },
  add_midi_effect: (a) => {
    const t = trackOf(a.track)
    if (!t.instrument?.vst) throw new Error('MIDI effects play through a VST instrument: set one first with app_set_instrument (for example plugin "Dexed").')
    const p = pluginOf(String(a.plugin), 'midi')
    useProjectStore.getState().updateTrack(t.id, { midiFx: [...(t.midiFx ?? []), vstFx(p)] })
    return describe(fresh(t.id))
  },

  // ── effects (inserts on a track or on the master) ──
  add_effect: (a) => {
    const c = chainOf(a.track, a.chain)
    let fx: InsertFx
    if (a.plugin) fx = vstFx(pluginOf(String(a.plugin), c.label.endsWith('(MIDI effects)') ? 'midi' : 'effect'))
    else {
      const type = String(a.type ?? '').toLowerCase() as InsertType
      if (!INSERT_PARAMS[type] || type === 'vst') throw new Error(`Effect type: ${Object.keys(INSERT_PARAMS).filter((k) => k !== 'vst').join(', ')}, or give plugin (a VST effect).`)
      fx = { id: nanoid(), type, on: true, p: settingsFor(type, a.settings, insertDefaults(type)) }
    }
    const list = [...c.list]
    const at = num(a.position)
    list.splice(at !== undefined ? clamp(Math.round(at) - 1, 0, list.length) : list.length, 0, fx)
    c.save(list)
    return { on: c.label, effects: list.map(fxInfo) }
  },
  set_effect: async (a) => {
    const c = chainOf(a.track, a.chain)
    const f = fxOf(c, a.effect)
    const next: InsertFx = { ...f, on: a.on !== undefined ? !!a.on : f.on }
    if (a.settings && f.type !== 'vst') next.p = settingsFor(f.type, a.settings, f.p)
    c.save(c.list.map((x) => (x.id === f.id ? next : x)))
    if (f.type === 'vst' && a.settings) {
      const vst = await import('../audio/vst/host')
      const eng = await import('../audio/engine')
      const sr = eng.liveSampleRate()
      const params = await vst.vstParams(next, sr)
      const done: string[] = []
      for (const [k, v] of Object.entries(a.settings as Args)) {
        const p = params.find((x) => String(x.i) === k || x.name.toLowerCase() === k.toLowerCase()) ?? params.find((x) => x.name.toLowerCase().includes(k.toLowerCase()))
        if (!p) throw new Error(`${fxName(f)} has no parameter "${k}". See app_plugin_params.`)
        await vst.vstSetParam(next, sr, p.i, clamp(Number(v), 0, 1)); done.push(p.name)
      }
      return { effect: fxName(f), on: next.on, set: done }
    }
    return fxInfo(next, c.list.indexOf(f))
  },
  remove_effect: (a) => {
    const c = chainOf(a.track, a.chain)
    const f = fxOf(c, a.effect)
    c.save(c.list.filter((x) => x.id !== f.id))
    return { removed: fxName(f), effects: c.list.filter((x) => x.id !== f.id).map(fxInfo) }
  },
  plugin_params: async (a) => {
    const f = a.effect === 'instrument' || (!a.effect && !a.chain) ? trackOf(a.track).instrument : fxOf(chainOf(a.track, a.chain), a.effect)
    if (!f || f.type !== 'vst') throw new Error('That is not a VST plugin (built-in effects: see app_list_effect_types).')
    const vst = await import('../audio/vst/host')
    const eng = await import('../audio/engine')
    const list = await vst.vstParams(f, eng.liveSampleRate())
    const q = String(a.search ?? '').toLowerCase()
    return { plugin: fxName(f), params: list.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 300).map((p) => ({ index: p.i, name: p.name, value: Math.round(p.value * 1000) / 1000, text: `${p.text}${p.label ? ' ' + p.label : ''}` })) }
  },
  set_plugin_param: async (a) => {
    const t = trackOf(a.track)
    const f = a.effect === undefined || a.effect === 'instrument' ? t.instrument : fxOf(chainOf(a.track, a.chain), a.effect)
    if (!f || f.type !== 'vst') throw new Error('That is not a VST plugin.')
    const vst = await import('../audio/vst/host')
    const eng = await import('../audio/engine')
    const sr = eng.liveSampleRate()
    const list = await vst.vstParams(f, sr)
    const done: string[] = []
    for (const [k, v] of Object.entries((a.params ?? {}) as Args)) {
      const p = list.find((x) => String(x.i) === k || x.name.toLowerCase() === k.toLowerCase()) ?? list.find((x) => x.name.toLowerCase().includes(k.toLowerCase()))
      if (!p) throw new Error(`${fxName(f)} has no parameter "${k}".`)
      await vst.vstSetParam(f, sr, p.i, clamp(Number(v), 0, 1)); done.push(p.name)
    }
    return { plugin: fxName(f), set: done }
  },
  open_plugin: async (a) => {
    const t = trackOf(a.track)
    const f = a.effect === undefined || a.effect === 'instrument' ? t.instrument : fxOf(chainOf(a.track, a.chain), a.effect)
    if (!f || f.type !== 'vst') throw new Error('That is not a VST plugin.')
    const vst = await import('../audio/vst/host')
    const eng = await import('../audio/engine')
    await vst.showVstEditor(f, eng.liveSampleRate(), t.name)
    return { opened: fxName(f) }
  },

  // ── sends and return tracks ──
  add_return: (a) => {
    const effect = String(a.effect ?? 'reverb') === 'delay' ? 'delay' : 'reverb'
    useProjectStore.getState().addReturn(effect)
    const r = (proj().returns ?? [])[(proj().returns ?? []).length - 1]
    return HANDLERS.set_return({ ...a, return: r.id })
  },
  set_return: (a) => {
    const r = returnOf(a.return)
    const patch: Args = {}
    if (a.name) patch.name = String(a.name)
    if (num(a.volume) !== undefined) patch.volume = clamp(Number(a.volume), 0, 1)
    if (num(a.pan) !== undefined) patch.pan = clamp(Number(a.pan), -1, 1)
    if (a.muted !== undefined) patch.muted = !!a.muted
    if (num(a.decay) !== undefined) patch.decay = clamp(Number(a.decay), 0.3, 10)
    if (num(a.delayBeats) !== undefined) patch.delayBeats = clamp(Number(a.delayBeats), 0.125, 4)
    if (num(a.feedback) !== undefined) patch.feedback = clamp(Number(a.feedback), 0, 0.9)
    useProjectStore.getState().updateReturn(r.id, patch)
    const out = (proj().returns ?? []).find((x) => x.id === r.id)!
    return { ...out, defaults: RETURN_DEFAULTS[out.effect] }
  },
  remove_return: (a) => { const r = returnOf(a.return); useProjectStore.getState().removeReturn(r.id); return { removed: r.name } },
  set_send: (a) => {
    const t = trackOf(a.track)
    const r = returnOf(a.return)
    useProjectStore.getState().setSend(t.id, r.id, clamp(Number(a.level ?? 0), 0, 1))
    return { track: t.name, return: r.name, level: fresh(t.id).sends?.[r.id] }
  },

  // ── automation ──
  set_automation: (a) => {
    const t = trackOf(a.track)
    let param = String(a.param ?? 'volume')
    if (/^send:/i.test(param)) param = `send:${returnOf(param.slice(5)).id}`
    else if (/^(effect|fx):/i.test(param)) {
      const [, ref, key] = param.split(':')
      const c = chainOf(t.id)
      const f = fxOf(c, ref)
      const d = f.type === 'vst' ? undefined : INSERT_PARAMS[f.type].find((x) => x.key === key || x.label.toLowerCase() === String(key).toLowerCase())
      if (f.type !== 'vst' && !d) throw new Error(`${fxName(f)} has no setting "${key}". Settings: ${INSERT_PARAMS[f.type].map((x) => x.key).join(', ')}`)
      const k = d ? d.key : String(Number(key))
      param = `fx:${f.id}:${k}`
      // the lane's name in the Studio
      c.save(c.list.map((x) => (x.id === f.id ? { ...x, paramNames: { ...(x.paramNames ?? {}), $: fxName(f), ...(d ? { [k]: d.label } : {}) } } : x)))
    } else if (param !== 'volume' && param !== 'pan') throw new Error('param: volume, pan, send:<return name>, effect:<effect number or name>:<setting key or VST parameter index>')
    const pts = (Array.isArray(a.points) ? a.points : []) as Array<{ bar?: number; beat?: number; value: number }>
    const lo = param === 'pan' ? -1 : 0
    const points = pts.map((p) => ({ beat: p.beat !== undefined ? Number(p.beat) : barToBeat(p.bar), value: clamp(Number(p.value), lo, 1) }))
    useProjectStore.getState().setAutomation(t.id, param as AutoParam, points)
    const lanes = new Set(fresh(t.id).autoLanes ?? [])
    if (points.length) lanes.add(param as AutoParam); else lanes.delete(param as AutoParam)
    useProjectStore.getState().updateTrack(t.id, { autoLanes: [...lanes] })
    return { track: t.name, param, points: points.length }
  },

  // ── clips and notes ──
  add_notes: (a) => {
    const t = trackOf(a.track)
    const notes = notesIn(a.notes)
    if (!notes.length) throw new Error('No notes.')
    const start = barToBeat(a.startBar)
    const end = Math.max(...notes.map((n) => n.startTime + n.duration))
    const bar = bpb()
    const duration = num(a.bars) !== undefined ? Number(a.bars) * bar : Math.max(bar, Math.ceil(end / bar) * bar)
    useProjectStore.getState().addClip(t.id, { startTime: start, duration, name: a.name ? String(a.name) : 'MIDI clip', notes })
    return { track: t.name, clipStartBar: beatToBar(start), bars: duration / bar, notes: notes.length }
  },
  get_notes: (a) => {
    const t = trackOf(a.track)
    const c = clipOf(t, a.clip)
    return { track: t.name, clip: c.name, startBar: beatToBar(c.startTime), lengthBeats: c.duration, notes: [...(c.notes ?? [])].sort((x, y) => x.startTime - y.startTime || x.pitch - y.pitch).map(noteOut) }
  },
  set_notes: (a) => {
    const t = trackOf(a.track)
    const c = clipOf(t, a.clip)
    const notes = notesIn(a.notes)
    const end = notes.length ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0
    useProjectStore.getState().updateClip(t.id, c.id, { notes, duration: Math.max(c.duration, end) })
    return { track: t.name, notes: notes.length }
  },
  edit_notes: (a) => {
    const t = trackOf(a.track)
    const c = clipOf(t, a.clip)
    const from = num(a.fromBeat) ?? -Infinity, to = num(a.toBeat) ?? Infinity
    const lo = num(a.lowestPitch) ?? 0, hi = num(a.highestPitch) ?? 127
    const hit = (n: Note): boolean => n.startTime >= from && n.startTime < to && n.pitch >= lo && n.pitch <= hi
    let notes = [...(c.notes ?? [])]
    if (a.delete) notes = notes.filter((n) => !hit(n))
    else notes = notes.map((n) => {
      if (!hit(n)) return n
      const m = { ...n }
      if (num(a.transpose) !== undefined) m.pitch = clamp(m.pitch + Math.round(Number(a.transpose)), 0, 127)
      if (num(a.quantize) !== undefined && Number(a.quantize) > 0) {
        const q = Number(a.quantize), s = clamp(Number(a.strength ?? 1), 0, 1)
        m.startTime = Math.max(0, m.startTime + (Math.round(m.startTime / q) * q - m.startTime) * s)
        if (a.quantizeLength) m.duration = Math.max(q, Math.round(m.duration / q) * q)
      }
      if (num(a.velocity) !== undefined) m.velocity = clamp(Math.round(Number(a.velocity)), 1, 127)
      if (num(a.velocityScale) !== undefined) m.velocity = clamp(Math.round(m.velocity * Number(a.velocityScale)), 1, 127)
      if (num(a.length) !== undefined) m.duration = Math.max(0.01, Number(a.length))
      if (num(a.lengthScale) !== undefined) m.duration = Math.max(0.01, m.duration * Number(a.lengthScale))
      if (num(a.shift) !== undefined) m.startTime = Math.max(0, m.startTime + Number(a.shift))
      return m
    })
    useProjectStore.getState().updateClip(t.id, c.id, { notes })
    return { track: t.name, notes: notes.length, changed: (c.notes ?? []).filter(hit).length }
  },
  edit_clip: (a) => {
    const t = trackOf(a.track)
    const c = clipOf(t, a.clip)
    const patch: Partial<Clip> = {}
    if (a.name !== undefined) patch.name = String(a.name)
    if (a.color) patch.color = String(a.color)
    if (num(a.bars) !== undefined) patch.duration = Math.max(0.25, Number(a.bars) * bpb())
    if (num(a.lengthBeats) !== undefined) patch.duration = Math.max(0.25, Number(a.lengthBeats))
    if (num(a.gain) !== undefined) patch.gain = clamp(Number(a.gain), 0, 2)
    if (num(a.fadeIn) !== undefined) patch.fadeIn = Math.max(0, Number(a.fadeIn))
    if (num(a.fadeOut) !== undefined) patch.fadeOut = Math.max(0, Number(a.fadeOut))
    if (Object.keys(patch).length) useProjectStore.getState().updateClip(t.id, c.id, patch)
    if (a.startBar !== undefined || a.toTrack !== undefined) {
      const to = a.toTrack !== undefined ? trackOf(a.toTrack) : t
      useProjectStore.getState().moveClip(t.id, c.id, to.id, a.startBar !== undefined ? barToBeat(a.startBar) : c.startTime)
      return describe(fresh(to.id))
    }
    return describe(fresh(t.id))
  },
  remove_clip: (a) => { const t = trackOf(a.track); const c = clipOf(t, a.clip); useProjectStore.getState().removeClip(t.id, c.id); return describe(fresh(t.id)) },
  split_clip: (a) => {
    const t = trackOf(a.track); const c = clipOf(t, a.clip ?? `bar:${a.atBar}`)
    if (!useProjectStore.getState().splitClip(t.id, c.id, barToBeat(a.atBar))) throw new Error('The split point must lie inside the clip.')
    return describe(fresh(t.id))
  },
  duplicate_clip: (a) => {
    const t = trackOf(a.track); const c = clipOf(t, a.clip)
    for (let i = 0; i < clamp(Math.round(Number(a.times ?? 1)), 1, 64); i++) {
      const last = clipOf(fresh(t.id), 'last')
      useProjectStore.getState().duplicateClip(t.id, i === 0 ? c.id : last.id)
    }
    return describe(fresh(t.id))
  },

  // ── markers and loop ──
  add_marker: (a) => {
    const st = useProjectStore.getState()
    const id = st.addMarker(barToBeat(a.bar), a.endBar !== undefined ? barToBeat(a.endBar) : undefined)
    if (a.name) st.updateMarker(id, { name: String(a.name) })
    return { markers: (proj().markers ?? []).map((m) => ({ name: m.name, bar: beatToBar(m.beat) })) }
  },
  remove_marker: (a) => {
    const ms = proj().markers ?? []
    const s = String(a.marker ?? '').toLowerCase()
    const m = ms.find((x) => x.name.toLowerCase() === s) ?? ms.find((x) => Math.abs(x.beat - barToBeat(a.marker)) < 0.01)
    if (!m) throw new Error(`No marker "${a.marker}". Markers: ${ms.map((x) => `${x.name} (bar ${beatToBar(x.beat)})`).join(', ') || 'none'}`)
    useProjectStore.getState().removeMarker(m.id)
    return { removed: m.name }
  },
  set_loop: (a) => {
    const cur = proj().loop ?? { start: 0, end: 4 * bpb(), enabled: false }
    useProjectStore.getState().setLoop({
      start: a.startBar !== undefined ? barToBeat(a.startBar) : cur.start, end: a.endBar !== undefined ? barToBeat(a.endBar) : cur.end,
      enabled: a.enabled !== undefined ? !!a.enabled : true,
    })
    const l = proj().loop!
    return { startBar: beatToBar(l.start), endBar: beatToBar(l.end), enabled: l.enabled }
  },

  // ── song generator and band ──
  generate_song: (a) => {
    const genre = String(a.genre ?? 'pop').toLowerCase().replace(/[\s-]/g, '')
    const g = GENRES.find((x) => x.id === genre || x.label.toLowerCase().replace(/[\s/-]/g, '').startsWith(genre))
    if (!g) throw new Error(`Genre: ${GENRES.map((x) => x.id).join(', ')}`)
    const k = keyOf(a.key)
    const mode: Mode = a.mode === 'major' || a.mode === 'minor' ? a.mode : k.mode ?? g.mode
    const bpm = clamp(Number(a.bpm ?? g.bpm), 40, 220)
    const parts = { melody: true, chords: true, bass: true, drums: true, guitar: true, ...(a.parts ?? {}) }
    const song = generateSong({ genre: g.id, key: k.key, mode, bpm, seed: Math.max(1, Math.round(Number(a.seed ?? 1))), parts })
    if (a.setTempo !== false) { useProjectStore.getState().setBpm(bpm); useAudioStore.setState({ bpm }) }
    const start = barToBeat(a.startBar)
    const keyName = `${KEYS[k.key]}${mode === 'minor' ? 'm' : ''}`
    const COLORS: Record<string, string> = { melody: '#a855f7', chords: '#22d3ee', bass: '#3b82f6', drums: '#f43f5e', guitar: '#f59e0b' }
    const made = song.parts.map((p) => addPartTrack(`${p.name} (${g.label}, ${keyName})`, p.notes, start, song.bars * 4, { sound: p.sound, color: COLORS[p.id], program: p.program, volume: p.volume, reverb: p.reverb }).name)
    if (a.markers !== false) for (const s of song.sections) {
      if ((proj().markers ?? []).some((m) => m.end === undefined && Math.abs(m.beat - (start + s.bar * 4)) < 0.01)) continue
      const id = useProjectStore.getState().addMarker(start + s.bar * 4)
      useProjectStore.getState().updateMarker(id, { name: SECTION_LABEL[s.kind] })
    }
    return { genre: g.label, key: keyName, bpm, bars: song.bars, tracks: made, sections: song.sections.map((s) => `${SECTION_LABEL[s.kind]} bar ${s.bar + 1}`), chords: song.chords.slice(0, 16).map(chordName) }
  },
  band_part: (a) => {
    const part = String(a.part ?? 'drums')
    const per = bpb()
    const bars = clamp(Math.round(Number(a.bars ?? 8)), 1, 256)
    const startBeat = barToBeat(a.startBar)
    const beats = bars * per
    const opts = { bars, beatsPerBar: per, seed: Math.max(1, Math.round(Number(a.seed ?? 1))), intensity: num(a.intensity), humanize: num(a.humanize), swing: num(a.swing) }
    let chords = a.chords ? fillChords(parseProgression(String(a.chords), per, Number(a.beatsPerChord ?? per)).chords, beats) : []
    if (!chords.length && part !== 'drums') {
      const notes = proj().tracks.filter((t) => t.type === 'midi' && t.sound !== 'drums' && (t.program ?? 0) < 128).flatMap((t) => t.clips.flatMap((c) => (c.notes ?? []).map((n) => ({ pitch: n.pitch, start: c.startTime + n.startTime, duration: n.duration }))))
      chords = detectChords(notes, startBeat, startBeat + beats, per).map((c) => ({ ...c, beat: c.beat - startBeat }))
      if (!chords.length) throw new Error('Give chords (for example "Am F C G"): there are no chords in the song at these bars.')
    }
    let notes: BandNote[], name: string, patch: Partial<Track>
    if (part === 'drums') {
      const style = (a.style ?? 'pop') as DrumStyle
      if (!DRUM_STYLES.some((d) => d.id === style)) throw new Error(`Drum style: ${DRUM_STYLES.map((d) => d.id).join(', ')}`)
      notes = drummer({ ...opts, style, fills: [0, 4, 8].includes(Number(a.fills)) ? Number(a.fills) as 0 | 4 | 8 : 4 })
      name = `Drummer (${DRUM_STYLES.find((d) => d.id === style)!.label})`; patch = { sound: 'drums', color: '#f43f5e' }
    } else if (part === 'bass') {
      const style = (a.style ?? 'rootfifth') as BassStyle
      if (!BASS_STYLES.some((d) => d.id === style)) throw new Error(`Bass style: ${BASS_STYLES.map((d) => d.id).join(', ')}`)
      notes = bassist({ ...opts, style, chords })
      name = `Bass player (${BASS_STYLES.find((d) => d.id === style)!.label})`; patch = { sound: style === '808' ? '808' : 'bass', color: '#3b82f6' }
    } else if (part === 'guitar') {
      const style = (a.style ?? 'strum') as GuitarStyle
      if (!GUITAR_STYLES.some((d) => d.id === style)) throw new Error(`Guitar style: ${GUITAR_STYLES.map((d) => d.id).join(', ')}`)
      notes = guitarist({ ...opts, style, chords })
      name = `Guitarist (${GUITAR_STYLES.find((d) => d.id === style)!.label})`; patch = { sound: a.distorted || GUITAR_STYLES.find((d) => d.id === style)?.distorted ? 'eguitar' : 'guitar', color: '#f59e0b' }
    } else throw new Error('part: drums, bass or guitar')
    if (typeof a.program === 'number') patch.program = a.program
    const t = addPartTrack(a.name ? String(a.name) : name, notes, startBeat, beats, patch)
    return { track: t.name, startBar: beatToBar(startBeat), bars, notes: notes.length, chords: chords.length ? [...new Set(chords.map(chordName))] : undefined }
  },

  // ── transport ──
  set_bpm: (a) => HANDLERS.set_project({ bpm: a.bpm }),
  transport: async (a) => {
    const eng = await import('../audio/engine')
    const act = String(a.action ?? '')
    if (a.bar !== undefined) eng.seek(barToBeat(a.bar))
    if (act === 'play') await eng.play()
    else if (act === 'stop') eng.stop()
    else if (act === 'pause') eng.pause()
    else if (act === 'start') eng.seek(0)
    else if (act !== 'seek' && a.bar === undefined) throw new Error('action: play, stop, pause, start or seek (with bar)')
    return { done: act || 'seek', playing: eng.isPlaying(), positionBar: beatToBar(useAudioStore.getState().currentBeat) }
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
