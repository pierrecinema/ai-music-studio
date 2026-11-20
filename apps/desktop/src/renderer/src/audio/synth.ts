// A small built-in synthesizer for MIDI notes: two detuned oscillators through a low-pass filter
// with an envelope. Works on a live AudioContext and on an OfflineAudioContext (export).

export type Timbre = 'soft' | 'bass' | 'lead' | 'drums' | 'guitar' | 'eguitar' | 'keys' | '808'

/** the built-in sounds a track can choose (Channel → Instrument) */
export const TIMBRES: Array<{ id: Timbre; label: string }> = [
  { id: 'soft', label: 'Synth (soft)' }, { id: 'lead', label: 'Synth lead' }, { id: 'bass', label: 'Synth bass' },
  { id: 'keys', label: 'Electric piano' }, { id: 'guitar', label: 'Guitar (clean)' }, { id: 'eguitar', label: 'Guitar (distorted)' },
  { id: '808', label: '808 bass' }, { id: 'drums', label: 'Drum kit (GM)' },
]

const mtof = (pitch: number): number => 440 * Math.pow(2, (pitch - 69) / 12)

export function playSynthNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  pitch: number,
  velocity: number,
  when: number,
  duration: number,
  timbre: Timbre = 'soft'
): AudioScheduledSourceNode[] {
  if (timbre === 'drums') return playDrum(ctx, dest, pitch, velocity, when)
  if (timbre === 'guitar' || timbre === 'eguitar') return playGuitar(ctx, dest, pitch, velocity, when, duration, timbre === 'eguitar')
  if (timbre === 'keys') return playKeys(ctx, dest, pitch, velocity, when, duration)
  if (timbre === '808') return play808(ctx, dest, pitch, velocity, when, duration)
  const f = mtof(pitch)
  const vel = Math.pow(Math.max(1, Math.min(127, velocity)) / 127, 1.4)
  const attack = timbre === 'bass' ? 0.004 : 0.01
  const release = timbre === 'lead' ? 0.12 : 0.18
  const end = when + Math.max(0.03, duration)

  const out = ctx.createGain()
  out.gain.setValueAtTime(0, when)
  out.gain.linearRampToValueAtTime(0.22 * vel, when + attack)
  out.gain.setTargetAtTime(0.14 * vel, when + attack, 0.12)          // decay to a sustain level
  out.gain.setValueAtTime(0.14 * vel, end)
  out.gain.linearRampToValueAtTime(0.0001, end + release)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = Math.min(9000, f * (timbre === 'bass' ? 4 : timbre === 'lead' ? 7 : 5) + 400)
  filter.Q.value = 0.8

  const a = ctx.createOscillator()
  const b = ctx.createOscillator()
  a.type = timbre === 'bass' ? 'sawtooth' : timbre === 'lead' ? 'square' : 'triangle'
  b.type = 'sawtooth'
  a.frequency.value = f
  b.frequency.value = f
  b.detune.value = timbre === 'bass' ? -6 : 8
  const bGain = ctx.createGain()
  bGain.gain.value = 0.45
  a.connect(filter)
  b.connect(bGain).connect(filter)
  filter.connect(out).connect(dest)
  a.start(when)
  b.start(when)
  a.stop(end + release + 0.05)
  b.stop(end + release + 0.05)
  return [a, b]
}

// a short click for the metronome (higher and louder on the first beat of a bar)
export function playClick(ctx: BaseAudioContext, dest: AudioNode, when: number, accent: boolean): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = accent ? 1760 : 1100
  g.gain.setValueAtTime(accent ? 0.5 : 0.3, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + 0.06)
}

// ── more built-in sounds: drum kit, guitars, electric piano, 808 ─────────────

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = b.getChannelData(0)
    let seed = 12345
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1 }
    noiseBuffers.set(ctx, b)
  }
  return b
}

const velGain = (velocity: number): number => Math.pow(Math.max(1, Math.min(127, velocity)) / 127, 1.2)

function noiseHit(ctx: BaseAudioContext, dest: AudioNode, when: number, decay: number, level: number,
  type: BiquadFilterType, freq: number, q = 0.7, offset = 0): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const f = ctx.createBiquadFilter()
  f.type = type; f.frequency.value = freq; f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(level, when + 0.001)
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
  src.connect(f).connect(g).connect(dest)
  src.start(when, offset)
  src.stop(when + decay + 0.02)
  return src
}

function toneHit(ctx: BaseAudioContext, dest: AudioNode, when: number, from: number, to: number, sweep: number,
  decay: number, level: number, type: OscillatorType = 'sine'): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(from, when)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + sweep)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(level, when + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
  o.connect(g).connect(dest)
  o.start(when)
  o.stop(when + decay + 0.02)
  return o
}

/** General MIDI drum map (channel 10): kick 35/36, snare 38/40, clap 39, hi-hats 42/44/46, toms, crash 49/57, ride 51/59 ... */
export function playDrum(ctx: BaseAudioContext, dest: AudioNode, pitch: number, velocity: number, when: number): AudioScheduledSourceNode[] {
  const v = velGain(velocity)
  const out: AudioScheduledSourceNode[] = []
  const TOMS: Record<number, number> = { 41: 82, 43: 98, 45: 115, 47: 132, 48: 150, 50: 172 }
  switch (pitch) {
    case 35: case 36:                                                   // kick
      out.push(toneHit(ctx, dest, when, 160, 45, 0.09, 0.45, 0.95 * v))
      out.push(noiseHit(ctx, dest, when, 0.012, 0.25 * v, 'lowpass', 3000))
      break
    case 37:                                                            // side stick
      out.push(noiseHit(ctx, dest, when, 0.04, 0.5 * v, 'bandpass', 1800, 3), toneHit(ctx, dest, when, 900, 700, 0.02, 0.03, 0.2 * v, 'triangle'))
      break
    case 38: case 40:                                                   // snare
      out.push(noiseHit(ctx, dest, when, 0.2, 0.55 * v, 'highpass', 1200), toneHit(ctx, dest, when, 260, 180, 0.04, 0.12, 0.4 * v, 'triangle'))
      break
    case 39:                                                            // hand clap: three quick bursts and a tail
      for (const d of [0, 0.011, 0.022]) out.push(noiseHit(ctx, dest, when + d, 0.03, 0.45 * v, 'bandpass', 1300, 1.5))
      out.push(noiseHit(ctx, dest, when + 0.03, 0.18, 0.3 * v, 'bandpass', 1300, 1.2))
      break
    case 42: case 44:                                                   // closed / pedal hi-hat
      out.push(noiseHit(ctx, dest, when, pitch === 44 ? 0.04 : 0.055, 0.32 * v, 'highpass', 7500))
      break
    case 46:                                                            // open hi-hat
      out.push(noiseHit(ctx, dest, when, 0.38, 0.3 * v, 'highpass', 7000))
      break
    case 49: case 57: case 52: case 55:                                 // crash / china / splash
      out.push(noiseHit(ctx, dest, when, pitch === 55 ? 0.6 : 1.5, 0.35 * v, 'highpass', 4500))
      out.push(noiseHit(ctx, dest, when, 0.9, 0.15 * v, 'bandpass', 3200, 0.8))
      break
    case 51: case 59: case 53:                                          // ride / bell
      out.push(noiseHit(ctx, dest, when, 0.7, 0.16 * v, 'highpass', 6500))
      out.push(toneHit(ctx, dest, when, pitch === 53 ? 760 : 520, pitch === 53 ? 755 : 515, 0.5, pitch === 53 ? 0.9 : 0.5, (pitch === 53 ? 0.18 : 0.07) * v, 'square'))
      break
    case 54: case 69: case 70: case 82:                                 // tambourine / cabasa / maracas / shaker
      out.push(noiseHit(ctx, dest, when, pitch === 54 ? 0.15 : 0.07, 0.22 * v, 'highpass', pitch === 54 ? 6000 : 8000))
      break
    case 56:                                                            // cowbell
      out.push(toneHit(ctx, dest, when, 540, 540, 0.3, 0.25, 0.18 * v, 'square'), toneHit(ctx, dest, when, 800, 800, 0.3, 0.25, 0.15 * v, 'square'))
      break
    case 75: case 76: case 77:                                          // claves / wood blocks
      out.push(toneHit(ctx, dest, when, pitch === 75 ? 2500 : pitch === 76 ? 1800 : 1400, 1300, 0.02, 0.06, 0.35 * v, 'sine'))
      break
    case 60: case 61: case 62: case 63: case 64:                        // bongos / congas
      out.push(toneHit(ctx, dest, when, [400, 300, 330, 260, 200][pitch - 60] * 1.3, [400, 300, 330, 260, 200][pitch - 60], 0.03, 0.25, 0.5 * v))
      break
    default: {
      const tom = TOMS[pitch]
      if (tom) out.push(toneHit(ctx, dest, when, tom * 1.6, tom, 0.08, 0.45, 0.7 * v), noiseHit(ctx, dest, when, 0.05, 0.12 * v, 'lowpass', 2500))
      else out.push(noiseHit(ctx, dest, when, 0.08, 0.2 * v, 'bandpass', 2000, 1))
    }
  }
  return out
}

const shaperCurves = new WeakMap<BaseAudioContext, Float32Array<ArrayBuffer>>()
function distortion(ctx: BaseAudioContext): WaveShaperNode {
  let c = shaperCurves.get(ctx)
  if (!c) {
    c = new Float32Array(new ArrayBuffer(1024 * 4))
    for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(x * 6) * 0.8 }
    shaperCurves.set(ctx, c)
  }
  const w = ctx.createWaveShaper()
  w.curve = c
  w.oversample = 'none'                 // per note: oversampling doubled its cost
  return w
}

/** a plucked string: bright at the start, then darker and quieter (clean or through a distortion) */
function playGuitar(ctx: BaseAudioContext, dest: AudioNode, pitch: number, velocity: number, when: number, duration: number, dist: boolean): AudioScheduledSourceNode[] {
  const f = mtof(pitch)
  const v = velGain(velocity)
  const ring = dist ? Math.max(0.05, duration) : Math.min(Math.max(0.05, duration), 2.5)
  const end = when + ring
  const release = dist ? 0.06 : 0.12
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, when)
  out.gain.linearRampToValueAtTime((dist ? 0.36 : 0.3) * v, when + 0.003)
  if (!dist) out.gain.setTargetAtTime(0.0001, when + 0.003, 0.45 + 60 / f)       // low strings ring longer
  else out.gain.setTargetAtTime(0.26 * v, when + 0.003, 0.4)
  out.gain.setValueAtTime(dist ? 0.26 * v : 0.0001 + 0.3 * v * Math.exp(-ring / (0.45 + 60 / f)), end)
  out.gain.linearRampToValueAtTime(0.0001, end + release)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(Math.min(12000, f * 12 + 2500), when)
  lp.frequency.setTargetAtTime(Math.min(8000, f * (dist ? 6 : 3) + 500), when, 0.08)
  lp.Q.value = 1.2
  // one oscillator per string (a strum is 6 notes at once and the song generator plays thousands of them: a second
  // oscillator and a noise burst per note made playback crackle on older processors)
  const a = ctx.createOscillator()
  a.type = 'sawtooth'
  a.frequency.value = f
  if (dist) {
    const sh = distortion(ctx)
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 4200
    a.connect(lp).connect(sh).connect(cab).connect(out)
  } else {
    a.connect(lp).connect(out)
  }
  out.connect(dest)
  a.start(when); a.stop(end + release + 0.05)
  return [a]
}

/** an electric piano: a sine with a bell-like overtone that fades faster */
function playKeys(ctx: BaseAudioContext, dest: AudioNode, pitch: number, velocity: number, when: number, duration: number): AudioScheduledSourceNode[] {
  const f = mtof(pitch)
  const v = velGain(velocity)
  const end = when + Math.max(0.05, duration)
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, when)
  out.gain.linearRampToValueAtTime(0.28 * v, when + 0.004)
  out.gain.setTargetAtTime(0.0001, when + 0.004, 1.2)
  out.gain.setValueAtTime(0.28 * v * Math.exp(-(end - when) / 1.2), end)
  out.gain.linearRampToValueAtTime(0.0001, end + 0.25)
  const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = f
  const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = f * 4
  const bg = ctx.createGain()
  bg.gain.setValueAtTime(0.35 * v, when); bg.gain.exponentialRampToValueAtTime(0.001, when + 0.4)
  a.connect(out); b.connect(bg).connect(out)
  out.connect(dest)
  for (const o of [a, b]) { o.start(when); o.stop(end + 0.3) }
  return [a, b]
}

/** an 808 bass: a sine that drops into its note, long and round, slightly driven */
function play808(ctx: BaseAudioContext, dest: AudioNode, pitch: number, velocity: number, when: number, duration: number): AudioScheduledSourceNode[] {
  const f = mtof(pitch)
  const v = velGain(velocity)
  const end = when + Math.max(0.08, duration)
  const o = ctx.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(f * 2.2, when)
  o.frequency.exponentialRampToValueAtTime(f, when + 0.05)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(0.6 * v, when + 0.004)
  g.gain.setTargetAtTime(0.35 * v, when + 0.05, 0.6)
  g.gain.setValueAtTime(0.35 * v, end)
  g.gain.linearRampToValueAtTime(0.0001, end + 0.08)
  const sh = distortion(ctx)
  const pre = ctx.createGain(); pre.gain.value = 0.35
  const post = ctx.createGain(); post.gain.value = 0.9
  o.connect(g).connect(pre).connect(sh).connect(post).connect(dest)
  o.start(when); o.stop(end + 0.1)
  return [o]
}
