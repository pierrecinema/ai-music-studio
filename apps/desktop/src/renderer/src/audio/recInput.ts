// Which input of the audio interface a track records: both as stereo (In 1+2), or one of them as mono (In 1 is the
// left channel, In 2 the right). A microphone on one input of a stereo interface was recorded hard on one side
// (user report); as mono it sits in the middle and is panned with the track's pan.
import type { Project, Track } from '../types'

export type RecInput = NonNullable<Track['input']>

export const REC_INPUTS: Array<{ id: RecInput; label: string; title: string }> = [
  { id: 'stereo', label: 'In 1+2', title: 'Stereo: inputs 1 and 2 (left and right)' },
  { id: 'in1', label: 'In 1', title: 'Mono: input 1 (left channel), e.g. a microphone on input 1' },
  { id: 'in2', label: 'In 2', title: 'Mono: input 2 (right channel), e.g. a microphone or guitar on input 2' },
]

/** the channels a track keeps of what the interface delivered: one mono channel, or both */
export function pickInput(channels: Float32Array[], input: RecInput | undefined): Float32Array[] {
  if (!channels.length) return channels
  if (input === 'in1') return [channels[0]]
  if (input === 'in2') return [channels[Math.min(1, channels.length - 1)]]
  return channels
}

/** the channel index a live level of the input is measured on (-1: both) */
export function inputChannel(input: RecInput | undefined, count: number): number {
  if (input === 'in1') return 0
  if (input === 'in2') return Math.min(1, count - 1)
  return -1
}

/** the track that is armed for recording (the red button in its header), if any */
export function armedTrack(p: Project): Track | undefined {
  return p.tracks.find((t) => t.armed && t.type !== 'group')
}

export const canRecordAudio = (t: Track): boolean => t.type === 'audio' || t.type === 'vocal'
