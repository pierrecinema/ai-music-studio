// The songs of the Mastering page: decoding a file at the processing rate and the edits made to each song.
import type { EditOp } from '../../audio/master/edit'

// edits of each open song (this session): the original file is never changed
export const editsByPath = new Map<string, { ops: EditOp[]; redo: EditOp[] }>()

export const SR = 48000                                     // the processing rate; the export converts to the chosen rate

export async function decodeFile(path: string): Promise<AudioBuffer> {
  const bytes: Uint8Array = await window.api.fs.readFile(path)
  const ctx = new OfflineAudioContext(2, 1, SR)
  const buf = await ctx.decodeAudioData(new Uint8Array(bytes).buffer)
  if (buf.numberOfChannels >= 2) return buf
  const st = new AudioBuffer({ numberOfChannels: 2, length: buf.length, sampleRate: buf.sampleRate })   // mono → both sides
  st.copyToChannel(buf.getChannelData(0), 0); st.copyToChannel(buf.getChannelData(0), 1)
  return st
}

export const chansOf = (b: AudioBuffer): Float32Array[] => [b.getChannelData(0), b.getChannelData(1)]
