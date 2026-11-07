// WAV writer for an AudioBuffer: 16 or 24 bit PCM, interleaved, with optional peak normalisation.

export function peakOf(buf: AudioBuffer): number {
  let peak = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i])
      if (a > peak) peak = a
    }
  }
  return peak
}

export function encodeWav(buf: AudioBuffer, bits: 16 | 24 = 16, gain = 1): Uint8Array {
  const ch = Math.min(2, buf.numberOfChannels)
  const frames = buf.length
  const bytes = bits / 8
  const dataSize = frames * ch * bytes
  const out = new ArrayBuffer(44 + dataSize)
  const v = new DataView(out)
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * bytes, true)
  v.setUint16(32, ch * bytes, true); v.setUint16(34, bits, true)
  str(36, 'data'); v.setUint32(40, dataSize, true)
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] * gain))
      if (bits === 16) {
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2
      } else {
        const n = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff)
        v.setUint8(o, n & 255); v.setUint8(o + 1, (n >> 8) & 255); v.setUint8(o + 2, (n >> 16) & 255); o += 3
      }
    }
  }
  return new Uint8Array(out)
}
