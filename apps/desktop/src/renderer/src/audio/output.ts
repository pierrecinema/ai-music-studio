// Where the app's sound goes and how (Settings → Audio, docs/AUDIO-PLAN.md): the output and input device, the
// sample rate and buffer size of live playback, the driver error compensation for recordings, the test tone and the
// simulated CPU load. Every player of the app asks here for its device (setSinkId).

export interface AudioSettings {
  driver: 'windows' | 'asio'
  outputId: string          // '' = the Windows default device
  inputId: string           // '' = the Windows default device, 'none' = no input
  sampleRate: number        // 0 = what the device uses
  buffer: number            // samples; 0 = automatic (small)
  compensationMs: number    // recordings are moved this much earlier (driver error compensation)
  // driver 'asio': the sound plays through the plugin host on a device of a JUCE driver type (ASIO, Windows Audio, ...)
  hostType: string          // 'ASIO', 'Windows Audio', 'DirectSound' ...
  hostDevice: string        // '' = the first device of that type
  hostRate: number          // the device's sample rate (the app runs at it); 0 = the device's own
  hostBuffer: number        // samples; 0 = the driver's
  hostChannel: number       // first output channel (0 = outputs 1/2, 2 = outputs 3/4, ...)
}

const KEY = 'ams-audio-device'
const DEFAULTS: AudioSettings = { driver: 'windows', outputId: '', inputId: '', sampleRate: 0, buffer: 0, compensationMs: 0, hostType: 'ASIO', hostDevice: '', hostRate: 0, hostBuffer: 0, hostChannel: 0 }

let current: AudioSettings = load()
const listeners = new Set<(s: AudioSettings, rebuild: boolean) => void>()

function load(): AudioSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { ...DEFAULTS } }
}

export function audioSettings(): AudioSettings { return current }

/** saves; `rebuild` is true when live playback has to be started again (sample rate, buffer) */
export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const before = current
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* not saved */ }
  const rebuild = before.sampleRate !== current.sampleRate || before.buffer !== current.buffer || before.driver !== current.driver || (current.driver === 'asio' && before.hostRate !== current.hostRate)
  for (const l of listeners) l(current, rebuild)
}

export function onAudioSettings(fn: (s: AudioSettings, rebuild: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** options for the Studio's AudioContext */
export function contextOptions(): AudioContextOptions {
  const s = current
  // ASIO: the app runs at the device's rate, so the host does not have to convert
  const rate = (s.driver === 'asio' ? s.hostRate : s.sampleRate) || undefined
  const o: AudioContextOptions = { latencyHint: s.buffer > 0 ? s.buffer / (rate ?? 48000) : 'interactive' }
  if (rate) o.sampleRate = rate
  return o
}

type Sinkable = { setSinkId?: (id: string | { type: 'none' }) => Promise<void> }

// every player's sound ends in its context's output bus: to the Windows device, or (ASIO) to the plugin host
const buses = new WeakMap<BaseAudioContext, { bus: GainNode; out?: AudioWorkletNode; key?: string }>()
let streamCount = 0
// the contexts that send their sound to the host: after a restart of the host they are connected to the new one
const streaming = new Set<AudioContext>()
let watchingHost = false

/** where a player connects its final sound (instead of ctx.destination) */
export function outputBus(ctx: AudioContext): AudioNode {
  let b = buses.get(ctx)
  if (!b) { const bus = ctx.createGain(); bus.connect(ctx.destination); b = { bus }; buses.set(ctx, b) }
  return b.bus
}

async function routeContext(ctx: AudioContext): Promise<void> {
  outputBus(ctx)
  const b = buses.get(ctx)!
  const t = ctx as unknown as Sinkable
  if (current.driver === 'asio') {
    const { loadWorklets } = await import('./master/worklets')
    const { host, setHostOutput } = await import('./vst/host')
    await loadWorklets(ctx)
    if (!b.out) {
      b.out = new AudioWorkletNode(ctx, 'ams-out', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' })
      b.key = `out#${streamCount++}`
    }
    b.bus.disconnect(); b.bus.connect(b.out); b.out.connect(ctx.destination)
    setHostOutput(true)
    await host.ensure()
    host.stream(b.out, b.key!)
    streaming.add(ctx)
    watchHost()
    // the device may not be open in this host (it was started again): open it
    if (!hostInfo?.ok) void openHostDevice()
    try { await t.setSinkId?.({ type: 'none' }) } catch { /* plays on the default device as well */ }
  } else {
    b.bus.disconnect(); b.bus.connect(ctx.destination)
    if (b.out) { b.out.port.postMessage({ dispose: true }); b.out.disconnect(); b.out = undefined }
    streaming.delete(ctx)
  }
}

/** sends a player (AudioContext or <audio>) to the chosen output device; false when that device is gone */
export async function applyOutput(target: AudioContext | HTMLMediaElement | null | undefined): Promise<boolean> {
  const t = target as unknown as Sinkable | null
  if (target instanceof AudioContext) {
    if (current.driver === 'asio') { try { await routeContext(target); return true } catch { return false } }
    await routeContext(target)
  }
  if (!t || typeof t.setSinkId !== 'function') return true
  try { await t.setSinkId(current.outputId || ''); return true }
  catch {
    try { await t.setSinkId('') } catch { /* stays where it is */ }
    return false
  }
}

export interface Devices { outputs: MediaDeviceInfo[]; inputs: MediaDeviceInfo[] }

export async function listDevices(): Promise<Devices> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    // "default" and "communications" are aliases Windows adds; the list shows the real devices
    const real = (d: MediaDeviceInfo): boolean => d.deviceId !== 'default' && d.deviceId !== 'communications'
    return { outputs: all.filter((d) => d.kind === 'audiooutput' && real(d)), inputs: all.filter((d) => d.kind === 'audioinput' && real(d)) }
  } catch { return { outputs: [], inputs: [] } }
}

/** the microphone of the recording, as chosen in Settings → Audio */
export function inputConstraints(): MediaTrackConstraints {
  const c: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  if (current.inputId && current.inputId !== 'none') c.deviceId = { exact: current.inputId }
  return c
}

/** latency of the input in ms (the audio system's own value), null when it cannot be told */
export async function measureInputLatency(): Promise<number | null> {
  if (current.inputId === 'none') return null
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: inputConstraints() })
    const lat = (s.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number }).latency
    s.getTracks().forEach((t) => t.stop())
    return typeof lat === 'number' ? lat * 1000 : null
  } catch { return null }
}

// ── test tone and simulated CPU load (on the Studio's context, so they go where the music goes) ──────────────
let tone: { osc: OscillatorNode; gain: GainNode } | null = null

export function testTone(ctx: AudioContext, on: boolean, db: number, freq: number): void {
  if (!on) {
    if (tone) { const t = tone; tone = null; t.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02); setTimeout(() => { try { t.osc.stop() } catch { /* stopped */ } }, 150) }
    return
  }
  const level = Math.pow(10, Math.max(-60, Math.min(0, db)) / 20)
  if (tone) {
    tone.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01)
    tone.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.02)
    return
  }
  const osc = ctx.createOscillator()
  osc.frequency.value = Math.max(20, Math.min(20000, freq))
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.gain.setTargetAtTime(level, ctx.currentTime, 0.05)            // fades in: no click, no jump in loudness
  osc.connect(gain).connect(outputBus(ctx))
  osc.start()
  tone = { osc, gain }
}

let load_: AudioWorkletNode | null = null

/** burns `percent` of every audio block, to find a buffer size that does not crackle (0: off) */
export function simulateLoad(ctx: AudioContext, percent: number): void {
  if (percent <= 0) {
    if (load_) { load_.port.postMessage({ percent: 0, stop: true }); load_.disconnect(); load_ = null }
    return
  }
  if (!load_) {
    try {
      load_ = new AudioWorkletNode(ctx, 'ams-cpu', { numberOfInputs: 0, numberOfOutputs: 1 })
      const silent = ctx.createGain(); silent.gain.value = 0
      load_.connect(silent).connect(ctx.destination)
    } catch { load_ = null; return }
  }
  load_.port.postMessage({ percent: Math.min(95, percent) })
}

export function stopTests(ctx: AudioContext | null): void {
  if (!ctx) return
  testTone(ctx, false, 0, 0)
  simulateLoad(ctx, 0)
}

// ── ASIO and the other drivers of the plugin host ────────────────────────────────────────────────────────────────
export interface HostDeviceType { type: string; devices: string[] }
export interface HostDeviceInfo {
  ok: boolean; error?: string; type?: string; device?: string; sampleRate?: number; buffer?: number; outputLatency?: number
  sampleRates?: number[]; buffers?: number[]; channels?: string[]; hasPanel?: boolean
}
let hostInfo: HostDeviceInfo | null = null
const hostListeners = new Set<(i: HostDeviceInfo | null) => void>()
export function hostDevice(): HostDeviceInfo | null { return hostInfo }
export function onHostDevice(fn: (i: HostDeviceInfo | null) => void): () => void { hostListeners.add(fn); return () => hostListeners.delete(fn) }
function setHostInfo(i: HostDeviceInfo | null): void { hostInfo = i; for (const l of hostListeners) l(i) }

/** the device types and devices the plugin host can play on (ASIO only when the host was built with it) */
export async function listHostDevices(): Promise<HostDeviceType[]> {
  const { host } = await import('./vst/host')
  await host.ensure()
  return (await host.call<{ types: HostDeviceType[] }>('audioDevices', {}, 30000)).types
}

/** opens the chosen device in the host (driver 'asio'); a different sample rate makes the app run at the device's */
export async function openHostDevice(): Promise<HostDeviceInfo> {
  const { host, setHostOutput } = await import('./vst/host')
  // the host must keep running now, also without plugins (it was stopped as "unused" and the device went with it)
  setHostOutput(true)
  watchHost()
  try {
    await host.ensure()
    const r = await host.call<HostDeviceInfo>('audioOpen', { type: current.hostType, device: current.hostDevice, sampleRate: current.hostRate, buffer: current.hostBuffer, channel: current.hostChannel }, 30000)
    setHostInfo(r)
    if (r.sampleRate && r.sampleRate !== current.hostRate) setAudioSettings({ hostRate: r.sampleRate })
    return r
  } catch (e) {
    const r = { ok: false, error: (e as Error).message }
    setHostInfo(r)
    return r
  }
}

export async function closeHostDevice(): Promise<void> {
  const { host, setHostOutput } = await import('./vst/host')
  try { if (host.connected) await host.call('audioClose') } catch { /* gone already */ }
  setHostInfo(null)
  setHostOutput(false)
}

/** the driver's own settings window (ASIO control panel) */
export async function showHostPanel(): Promise<void> {
  const { host } = await import('./vst/host')
  await host.call('audioPanel', {}, 600000)
  // the driver keeps its device open: only read its (maybe changed) settings. Opening it again failed with ASIO4ALL.
  try { setHostInfo(await host.call<HostDeviceInfo>('audioInfo')) } catch { /* keeps the old info */ }
}

export async function hostStats(): Promise<{ underruns: number; dropped: number; fill: number; open: boolean } | null> {
  const { host } = await import('./vst/host')
  if (!host.connected) return null
  try { return await host.call('audioStats') } catch { return null }
}

/** keeps the host's device in step with the settings: opens it with driver 'asio', closes it otherwise */
export function watchHostDevice(): () => void {
  let last = ''
  const sync = (s: AudioSettings): void => {
    const key = s.driver === 'asio' ? JSON.stringify([s.hostType, s.hostDevice, s.hostRate, s.hostBuffer, s.hostChannel]) : ''
    if (key === last) return
    const was = last
    last = key
    if (key) void openHostDevice()
    else if (was) void closeHostDevice()
  }
  sync(current)
  return onAudioSettings((s) => sync(s))
}

/** when the host stops (crash, or stopped from outside) while ASIO is chosen: start it again, open the device and
 *  connect the players' sound to it */
function watchHost(): void {
  if (watchingHost) return
  watchingHost = true
  void import('./vst/host').then(({ host }) => {
    host.onExit(() => {
      setHostInfo(null)
      if (current.driver !== 'asio') return
      window.setTimeout(() => {
        void (async () => {
          try {
            await host.ensure()
            await openHostDevice()
            for (const ctx of [...streaming]) {
              if (ctx.state === 'closed') { streaming.delete(ctx); continue }
              const b = buses.get(ctx)
              if (b?.out) { b.key = `out#${streamCount++}`; host.stream(b.out, b.key) }
            }
          } catch { /* shown in Settings → Audio */ }
        })()
      }, 500)
    })
  })
}
