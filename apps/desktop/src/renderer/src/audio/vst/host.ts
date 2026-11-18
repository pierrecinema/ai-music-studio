// The app's side of the VST plugin host (docs/VST-PLAN.md): the connection, the audio worker, and the plugin
// instances of the project. The host is started only while a plugin is in use; without plugins nothing here runs.
//
//   track ── ams-vst worklet ⇄ MessagePort ⇄ audio worker ⇄ WebSocket (binary) ⇄ ams-plugin-host ⇄ plugin
//   this module ⇄ WebSocket (JSON commands: scan, load, state, editor)
import type { InsertFx, Project, VstRef } from '../../types'
import { AUDIO_MAGIC } from './link'

export const VST_BLOCK = 512           // samples per block sent to the host
export const VST_BLOCKS_AHEAD = 3      // blocks of headroom for the round trip (about 32 ms at 48 kHz)
export const VST_DELAY = VST_BLOCK * VST_BLOCKS_AHEAD

export interface PluginInfo {
  id: string; name: string; vendor: string; format: string; category: string; isInstrument: boolean
  file: string; version: string; inputs: number; outputs: number; xml: string
  arch?: 'x64' | 'x86'        // a 32-bit plugin runs in the 32-bit host
}
export interface FailedPlugin { file: string; format: string; reason: string }

type Pending = { res: (v: any) => void; rej: (e: Error) => void }   // eslint-disable-line @typescript-eslint/no-explicit-any

// ── the audio worker: relays blocks between the worklets and the host without touching the page's main thread ──
function workerSource(): string {
  return `
const MAGIC = ${AUDIO_MAGIC}
let ws = null, ready = false, gseq = 1
const links = new Map()          // key -> { port, instance }
const out = new Map()            // global seq -> { key, seq }
let flushing = null
function pack(instance, seq, block, reset, midi) {
  midi = midi || []
  const frames = block[0].length, head = 24 + midi.length * 8, buf = new ArrayBuffer(head + block.length * frames * 4), v = new DataView(buf)
  v.setUint32(0, MAGIC, true); v.setUint32(4, instance, true); v.setUint32(8, seq >>> 0, true)
  v.setUint16(12, block.length, true); v.setUint16(14, reset ? 1 : 0, true); v.setUint32(16, frames, true); v.setUint32(20, midi.length, true)
  midi.forEach((e, i) => { const o = 24 + i * 8; v.setUint32(o, e[0], true); v.setUint8(o + 4, e[1]); v.setUint8(o + 5, e[2]); v.setUint8(o + 6, e[3]) })
  block.forEach((c, i) => new Float32Array(buf, head + i * frames * 4, frames).set(c))
  return buf
}
function checkFlush() {
  if (!flushing || flushing.stage !== 2 || out.size) return
  flushing.stage = 3
  syncAll(flushing.id + ':b', () => { const id = flushing.id; flushing = null; postMessage({ flushed: id }) })
}
function syncAll(tag, done) {
  // only the links of offline rendering take part (live playback never waits)
  const ls = [...links].filter(([k]) => k.startsWith('off:')).map(([, l]) => l)
  let left = ls.length
  if (!left) { done(); return }
  for (const l of ls) { l.waiting = tag; l.done = () => { if (--left === 0) done() }; l.port.postMessage({ sync: tag }) }
}
onmessage = (e) => {
  const d = e.data
  if (d.connect) {
    ws = new WebSocket('ws://127.0.0.1:' + d.connect.port)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, cmd: 'hello', token: d.connect.token }))
    ws.onclose = () => { ready = false; postMessage({ closed: true }) }
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); if (m.id === 1) { ready = !!m.ok; postMessage({ ready }) } return }
      const v = new DataView(ev.data)
      if (v.getUint32(0, true) !== MAGIC) return
      const g = v.getUint32(8, true), o = out.get(g)
      if (!o) return
      out.delete(g)
      const l = links.get(o.key)
      const ch = v.getUint16(12, true), frames = v.getUint32(16, true), lat = v.getUint32(20, true)
      if (l) {
        const block = []
        for (let c = 0; c < ch; c++) block.push(new Float32Array(ev.data.slice(24 + c * frames * 4, 24 + (c + 1) * frames * 4)))
        l.port.postMessage({ seq: o.seq, block }, block.map((b) => b.buffer))
        if (l.latency !== lat) { l.latency = lat; postMessage({ latency: { key: o.key, latency: lat } }) }
      }
      checkFlush()
    }
  } else if (d.attach) {
    const { key, instance, port } = d.attach
    const l = { port, instance, latency: -1 }
    links.set(key, l)
    port.onmessage = (ev) => {
      const m = ev.data
      if (m.synced !== undefined) { if (l.waiting === m.synced && l.done) { const f = l.done; l.done = null; f() } return }
      if (!ready || !l.instance) { port.postMessage({ seq: m.seq, block: m.block }, m.block.map((b) => b.buffer)); return }   // no host: dry
      const g = gseq++
      out.set(g, { key, seq: m.seq })
      ws.send(pack(l.instance, g, m.block, m.reset, m.midi))
    }
  } else if (d.stream) {
    // the app's master mix for the host's sound card (Settings → Audio → ASIO): sent on, no answer
    const sp = d.stream.port
    links.set(d.stream.key, { port: sp, instance: 0, latency: 0 })
    sp.onmessage = (ev) => { if (ready && ws) ws.send(pack(0xFFFFFFF0, 0, ev.data.block, false)) }
  } else if (d.instance) {
    const l = links.get(d.instance.key); if (l) l.instance = d.instance.instance
  } else if (d.detach) {
    const l = links.get(d.detach); if (l) { l.port.close(); links.delete(d.detach) }
  } else if (d.flush !== undefined) {
    // 1. every worklet confirms (its earlier blocks are here), 2. every block came back, 3. every worklet has them
    flushing = { id: d.flush, stage: 1 }
    syncAll(d.flush + ':a', () => { if (flushing) { flushing.stage = 2; checkFlush() } })
  } else if (d.close) {
    if (ws) ws.close()
    close()
  }
}
`
}

// ── the connection ─────────────────────────────────────────────────────────────
class HostClient {
  private ws: WebSocket | null = null
  private worker: Worker | null = null
  private connecting: Promise<void> | null = null
  private nextId = 10
  private pending = new Map<number, Pending>()
  private flushes = new Map<number, () => void>()
  private eventListeners = new Set<(m: any) => void>()          // eslint-disable-line @typescript-eslint/no-explicit-any
  private exitListeners = new Set<() => void>()
  latencyOf = new Map<string, number>()
  windowHandle = ''

  constructor(readonly arch: 'x64' | 'x86') {
    if (typeof window !== 'undefined') window.api?.plugins?.onHostExit?.((i) => { if (!i.arch || i.arch === arch) this.lost() })
  }

  /** the host program is part of this installation */
  async available(): Promise<boolean> {
    if (devHost()) return true
    try { return (await window.api?.plugins?.available?.()) === true } catch { return false }
  }

  get connected(): boolean { return this.ws?.readyState === WebSocket.OPEN }

  ensure(): Promise<void> {
    if (this.connected && this.worker) return Promise.resolve()
    if (!this.connecting) {
      this.connecting = this.open().finally(() => { this.connecting = null })
    }
    return this.connecting
  }

  private async open(): Promise<void> {
    const dev = devHost()
    const { port, token } = dev ?? (await window.api.plugins!.host(this.arch))
    try { this.windowHandle = (await window.api?.plugins?.windowHandle?.()) ?? '' } catch { this.windowHandle = '' }
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('The plugin host cannot be reached.')) })
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data))
      if (m.event) { for (const l of this.eventListeners) l(m); return }
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      if (m.ok) p.res(m); else p.rej(new Error(m.error || 'plugin host error'))
    }
    ws.onclose = () => { if (this.ws === ws) this.lost() }
    this.ws = ws
    await this.call('hello', { token })
    const url = URL.createObjectURL(new Blob([workerSource()], { type: 'application/javascript' }))
    const w = new Worker(url)
    await new Promise<void>((res, rej) => {
      w.onmessage = (e) => {
        const d = e.data
        if (d.ready !== undefined) { if (d.ready) res(); else rej(new Error('The plugin host refused the audio connection.')) }
        if (d.flushed !== undefined) { this.flushes.get(d.flushed)?.(); this.flushes.delete(d.flushed) }
        if (d.latency) this.latencyOf.set(d.latency.key, d.latency.latency)
        if (d.closed) this.lost()
      }
      w.postMessage({ connect: { port, token } })
    })
    this.worker = w
  }

  private lost(): void {
    const had = this.ws !== null
    this.ws?.close(); this.ws = null
    this.worker?.postMessage({ close: true }); this.worker = null
    for (const p of this.pending.values()) p.rej(new Error('The plugin host stopped.'))
    this.pending.clear()
    for (const f of this.flushes.values()) f()
    this.flushes.clear()
    if (had) for (const l of this.exitListeners) l()
  }

  onExit(fn: () => void): () => void { this.exitListeners.add(fn); return () => this.exitListeners.delete(fn) }
  onEvent(fn: (m: any) => void): () => void { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn) }   // eslint-disable-line @typescript-eslint/no-explicit-any

  call<T = any>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 60000): Promise<T> {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('The plugin host is not running.'))
    const id = this.nextId++
    return new Promise<T>((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`The plugin host did not answer (${cmd}).`)) }, timeoutMs)
      this.pending.set(id, { res: (v) => { clearTimeout(timer); res(v) }, rej: (e) => { clearTimeout(timer); rej(e) } })
      ws.send(JSON.stringify({ id, cmd, ...args }))
    })
  }

  /** connect a worklet node to the host through the audio worker */
  attach(node: AudioWorkletNode, key: string, instance: number): void {
    if (!this.worker) return
    const ch = new MessageChannel()
    node.port.postMessage({ link: ch.port1 }, [ch.port1])
    this.worker.postMessage({ attach: { key, instance, port: ch.port2 } }, [ch.port2])
  }
  detach(key: string): void { this.worker?.postMessage({ detach: key }) }
  /** the master mix of a context goes to the host's sound card (ASIO) */
  stream(node: AudioWorkletNode, key: string): void {
    if (!this.worker) return
    const ch = new MessageChannel()
    node.port.postMessage({ link: ch.port1 }, [ch.port1])
    this.worker.postMessage({ stream: { key, port: ch.port2 } }, [ch.port2])
  }

  /** waits until every block sent so far has come back into its worklet (offline rendering) */
  flush(): Promise<void> {
    if (!this.worker) return Promise.resolve()
    const id = this.nextId++
    return new Promise((res) => { this.flushes.set(id, res); this.worker!.postMessage({ flush: id }) })
  }

  /** nothing uses the host any more: stop it */
  release(): void {
    this.lost()
    if (!devHost()) void window.api?.plugins?.release?.(this.arch)
  }
}

// development: the browser preview can use a host started by hand (localStorage "ams-dev-host" = "port:token")
function devHost(): { port: number; token: string } | null {
  try {
    const v = localStorage.getItem('ams-dev-host')
    if (!v) return null
    const [port, token] = v.split(':')
    return { port: Number(port), token }
  } catch { return null }
}

export const host = new HostClient('x64')       // 64-bit plugins (and the search)
export const host32 = new HostClient('x86')     // 32-bit plugins
const clients = [host, host32]
const clientFor = (ref?: { arch?: string }): HostClient => (ref?.arch === 'x86' ? host32 : host)

// ── plugin instances of the project (live playback) ────────────────────────────
interface Live { instance: number; latency: number; ref: VstRef; sampleRate: number; client: HostClient; scope: 'studio' | 'master' }
const live = new Map<string, Live>()           // insert / slot id -> loaded instance
const loading = new Map<string, Promise<Live | null>>()
const failures = new Map<string, string>()     // insert id -> why it could not be loaded
const listeners = new Set<() => void>()
export function onVstChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn) }
const changed = (): void => { for (const l of listeners) l() }

for (const c of clients) c.onExit(() => { for (const [id, l] of live) if (l.client === c) live.delete(id); changed() })

/** a plugin's settings were changed in its window (the project then has unsaved changes) */
export function onVstSettingsChanged(fn: (fxId: string) => void): () => void {
  const offs = clients.map((c) => c.onEvent((m) => {
    if (m.event !== 'changed') return
    for (const [id, l] of live) if (l.client === c && l.instance === m.instance) fn(id)
  }))
  return () => offs.forEach((o) => o())
}

export function vstFailure(fxId: string): string | undefined { return failures.get(fxId) }
export function vstLoaded(fxId: string): boolean { return live.has(fxId) }
/** a plugin of the project is loaded (or loading): the host must keep running */
export function vstInUse(client?: HostClient): boolean { return [...live.values()].some((l) => !client || l.client === client) || loading.size > 0 }

async function loadInstance(ref: VstRef, sampleRate: number): Promise<{ instance: number; latency: number; client: HostClient }> {
  const c = clientFor(ref)
  await c.ensure()
  const r = await c.call<{ instance: number; latency: number }>('load', { xml: ref.xml, sampleRate, blockSize: VST_BLOCK }, 120000)
  if (ref.state) {
    try { const s = await c.call<{ latency: number }>('setState', { instance: r.instance, state: ref.state }); r.latency = s.latency ?? r.latency }
    catch { /* the plugin keeps its defaults */ }
  }
  return { ...r, client: c }
}

/** the 64-bit host also plays the sound (Settings → Audio → ASIO): it must keep running without plugins */
let hostOutput = false
export function setHostOutput(on: boolean): void { hostOutput = on; if (!on) releaseIdle() }

/** stops the hosts that no plugin uses any more */
function releaseIdle(): void {
  for (const c of clients) if (c.connected && !vstInUse(c) && ![...offlineClients].includes(c) && !(hostOutput && c === host)) c.release()
}

/** every plugin of a project: the effects (inserts) and the instruments of MIDI tracks */
export function projectPlugins(project: Project): InsertFx[] {
  const list: InsertFx[] = []
  for (const t of project.tracks) {
    for (const fx of t.fx ?? []) if (fx.type === 'vst' && fx.vst) list.push(fx)
    if (t.instrument?.vst) list.push(t.instrument)
  }
  return list
}

/** loads every plugin of the project (live playback at `sampleRate`); unloads plugins no longer in it */
export async function prepareVst(project: Project, sampleRate: number): Promise<void> {
  const wanted = new Map<string, InsertFx>()
  for (const fx of projectPlugins(project)) wanted.set(fx.id, fx)
  for (const [id, l] of live) {
    if (l.scope !== 'studio') continue
    if (!wanted.has(id) || l.sampleRate !== sampleRate || l.ref.pluginId !== wanted.get(id)!.vst!.pluginId) {
      live.delete(id)
      l.client.call('unload', { instance: l.instance }).catch(() => {})
    }
  }
  if (wanted.size === 0) { releaseIdle(); return }
  await Promise.all([...wanted.values()].map((fx) => {
    if (live.has(fx.id)) return Promise.resolve()
    let p = loading.get(fx.id)
    if (!p) {
      p = loadInstance(fx.vst!, sampleRate)
        .then((r) => { const l: Live = { ...r, ref: fx.vst!, sampleRate, scope: 'studio' }; live.set(fx.id, l); failures.delete(fx.id); return l })
        .catch((e: Error) => { failures.set(fx.id, e.message); return null })
        .finally(() => { loading.delete(fx.id); changed() })
      loading.set(fx.id, p)
    }
    return p.then(() => {})
  }))
}

// ── plugins in the Mastering chain (their own scope: the Studio does not unload them) ─────────────────────────
const masterIds = new Set<string>()

/** loads the plugins of the mastering chain for live playback at `sampleRate`; unloads chain plugins no longer in it */
export async function prepareMasterVst(slots: Array<{ id: string; vst?: VstRef }>, sampleRate: number): Promise<void> {
  const wanted = new Map(slots.filter((x) => x.vst).map((x) => [x.id, x.vst!]))
  masterIds.clear(); for (const id of wanted.keys()) masterIds.add(id)
  for (const [id, l] of live) {
    if (l.scope !== 'master') continue
    if (!wanted.has(id) || l.sampleRate !== sampleRate || l.ref.pluginId !== wanted.get(id)!.pluginId) {
      live.delete(id); l.client.call('unload', { instance: l.instance }).catch(() => {})
    }
  }
  await Promise.all([...wanted].map(async ([id, ref]) => {
    if (live.has(id)) return
    try {
      const r = await loadInstance(ref, sampleRate)
      live.set(id, { ...r, ref, sampleRate, scope: 'master' }); failures.delete(id)
    } catch (e) { failures.set(id, (e as Error).message) }
  }))
  changed()
  if (!wanted.size) releaseIdle()
}

/** the current settings of one loaded plugin (base64), or undefined */
export async function vstStateOf(id: string): Promise<string | undefined> {
  const l = live.get(id)
  if (!l) return undefined
  try { return (await l.client.call<{ state: string }>('getState', { instance: l.instance })).state } catch { return undefined }
}

/** a plugin's settings were changed in its window: the id of its insert / slot */
export function onVstEdited(fn: (id: string, scope: 'studio' | 'master') => void): () => void {
  const offs = clients.map((c) => c.onEvent((m) => {
    if (m.event !== 'changed') return
    for (const [id, l] of live) if (l.client === c && l.instance === m.instance) fn(id, l.scope)
  }))
  return () => offs.forEach((o) => o())
}

/** the current settings of every loaded plugin into the project's inserts (before saving) */
export async function collectVstStates(project: Project): Promise<Project> {
  if (live.size === 0) return project
  const states = new Map<string, string>()
  await Promise.all([...live].filter(([, l]) => l.scope === 'studio').map(async ([id, l]) => {
    try { states.set(id, (await l.client.call<{ state: string }>('getState', { instance: l.instance })).state) } catch { /* keep the old state */ }
  }))
  if (!states.size) return project
  const withState = (f: InsertFx): InsertFx => (states.has(f.id) && f.vst ? { ...f, vst: { ...f.vst, state: states.get(f.id) } } : f)
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      let n = t
      if (t.fx?.some((f) => states.has(f.id))) n = { ...n, fx: t.fx!.map(withState) }
      if (t.instrument && states.has(t.instrument.id)) n = { ...n, instrument: withState(t.instrument) }
      return n
    }),
  }
}

/** opens (or brings to the front) the plugin's own window */
export async function showVstEditor(fx: InsertFx, sampleRate: number, trackName: string): Promise<void> {
  if (!fx.vst) return
  // the plugin may still be loading (the project was just opened, or Play was pressed): use that one
  if (!live.get(fx.id) && loading.has(fx.id)) await loading.get(fx.id)
  let l = live.get(fx.id)
  if (!l) {
    // through the loading map, so a note played meanwhile (Piano Roll) does not load a second copy of the plugin
    const ref = fx.vst
    const p = loadInstance(ref, sampleRate)
      .then((r) => { const n: Live = { ...r, ref, sampleRate, scope: masterIds.has(fx.id) ? 'master' : 'studio' }; live.set(fx.id, n); failures.delete(fx.id); return n })
      .finally(() => { loading.delete(fx.id); changed() })
    loading.set(fx.id, p.catch(() => null))
    l = await p
  }
  await l.client.call('editor', { instance: l.instance, show: true, title: `${fx.vst.name} – ${trackName}`, parent: l.client.windowHandle })
}

// ── offline rendering (export): separate instances with the saved settings ──────
const offline = new WeakMap<BaseAudioContext, Map<string, { instance: number; latency: number; client: HostClient }>>()
const offlineClients = new Set<HostClient>()

export async function prepareVstOffline(ctx: BaseAudioContext, project: Project): Promise<boolean> {
  const fxs = projectPlugins(project).filter((f) => f.on)
  return prepareVstOfflineList(ctx, fxs.map((f) => ({ id: f.id, vst: f.vst! })))
}

/** separate instances for offline rendering, with the settings the plugins have right now (also unsaved ones) */
export async function prepareVstOfflineList(ctx: BaseAudioContext, list: Array<{ id: string; vst: VstRef }>): Promise<boolean> {
  if (!list.length) return false
  const m = new Map<string, { instance: number; latency: number; client: HostClient }>()
  for (const fx of list) {
    try {
      const state = (await vstStateOf(fx.id)) ?? fx.vst.state
      const r = await loadInstance({ ...fx.vst, state }, ctx.sampleRate); m.set(fx.id, r); offlineClients.add(r.client)
    }
    catch (e) { failures.set(fx.id, (e as Error).message) }
  }
  offline.set(ctx, m)
  return true
}

export async function releaseVstOffline(ctx: BaseAudioContext): Promise<void> {
  const m = offline.get(ctx)
  if (!m) return
  offline.delete(ctx)
  await Promise.all([...m.values()].map((r) => r.client.call('unload', { instance: r.instance }).catch(() => {})))
  offlineClients.clear()
  releaseIdle()
}

/** for an OfflineAudioContext with plugins: pauses every block until the host has answered */
export function pumpOffline(ctx: OfflineAudioContext, seconds: number): void {
  const step = VST_BLOCK / ctx.sampleRate
  for (let t = step; t < seconds; t += step) {
    ctx.suspend(t).then(async () => { await Promise.all([...offlineClients].map((c) => c.flush())); await ctx.resume() }).catch(() => {})
  }
}

// ── the insert node ──────────────────────────────────────────────────────────────
let nodeCount = 0

/** the delay (seconds) a plugin insert adds; the track is fed this much earlier so it stays in time */
export function vstDelaySeconds(ctx: BaseAudioContext, fx: InsertFx): number {
  const inst = instanceFor(ctx, fx)
  return (VST_DELAY + (inst?.latency ?? 0)) / ctx.sampleRate
}

function instanceFor(ctx: BaseAudioContext, fx: InsertFx): { instance: number; latency: number; client: HostClient } | undefined {
  const off = offline.get(ctx)
  if (off) return off.get(fx.id)
  return live.get(fx.id)
}

export function makeVstInsert(ctx: BaseAudioContext, fx: InsertFx): { input: AudioNode; output: AudioNode; dispose: () => void } {
  const inst = instanceFor(ctx, fx)
  const node = new AudioWorkletNode(ctx, 'ams-vst', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
    // a plugin that could not be loaded plays the sound unchanged (with the same delay)
    processorOptions: { block: VST_BLOCK, delay: VST_DELAY + (inst?.latency ?? 0), on: fx.on && !!inst },
  })
  const key = `${offline.has(ctx) ? 'off:' : 'live:'}${fx.id}#${nodeCount++}`
  if (inst) inst.client.attach(node, key, inst.instance)
  return {
    input: node, output: node,
    dispose: () => { node.port.postMessage({ dispose: true }); inst?.client.detach(key) },
  }
}

export function projectHasVst(project: Project): boolean {
  return projectPlugins(project).length > 0
}

/** an instrument plugin of a MIDI track: no input, the notes go in as MIDI events with their context times */
/** the host instance a plugin of the Studio runs in right now (0: not loaded) */
export function liveInstance(fxId: string): number { return live.get(fxId)?.instance ?? 0 }

export function makeVstInstrument(ctx: BaseAudioContext, fx: InsertFx): { output: AudioNode; play: (events: number[][]) => void; dispose: () => void; instance: number } | null {
  const inst = instanceFor(ctx, fx)
  if (!inst || !fx.on) return null
  const node = new AudioWorkletNode(ctx, 'ams-vst', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
    processorOptions: { block: VST_BLOCK, delay: VST_DELAY + inst.latency, on: true },
  })
  const key = `${offline.has(ctx) ? 'off:' : 'live:'}${fx.id}#${nodeCount++}`
  inst.client.attach(node, key, inst.instance)
  return {
    output: node,
    instance: inst.instance,
    // events: [context time in seconds, status, data1, data2]
    play: (events) => { if (events.length) node.port.postMessage({ events }) },
    dispose: () => {
      // all notes off on every channel, so nothing hangs when playback stops
      const t = ctx.currentTime
      node.port.postMessage({ events: Array.from({ length: 16 }, (_, ch) => [t, 0xb0 | ch, 123, 0]) })
      setTimeout(() => { node.port.postMessage({ dispose: true }); inst.client.detach(key) }, 200)
    },
  }
}
