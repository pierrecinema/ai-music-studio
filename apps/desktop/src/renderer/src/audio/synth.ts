// A small built-in synthesizer for MIDI notes: two detuned oscillators through a low-pass filter
// with an envelope. Works on a live AudioContext and on an OfflineAudioContext (export).

export type Timbre = 'soft' | 'bass' | 'lead'

const mtof = (pitch: number): number => 440 * Math.pow(2, (pitch - 69) / 12)

export function playSynthNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  pitch: number,
  velocity: number,
  when: number,
  duration: number,
  timbre: Timbre = 'soft'
): OscillatorNode[] {
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
