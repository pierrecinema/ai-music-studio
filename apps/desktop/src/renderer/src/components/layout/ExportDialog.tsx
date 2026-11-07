import React, { useEffect, useState } from 'react'
import { renderMix, projectEndBeat, beatsToSec } from '../../audio/engine'
import { useProjectStore } from '../../stores/project.store'

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
  const project = useProjectStore((s) => s.project)
  const [format, setFormat] = useState<'wav' | 'mp3'>('wav')
  const [bits, setBits] = useState<16 | 24>(16)
  const [kbps, setKbps] = useState(320)
  const [normalize, setNormalize] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { if (open) setResult(null) }, [open])
  if (!open) return null

  const seconds = beatsToSec(projectEndBeat(project), project.bpm)
  const label = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

  const run = async (): Promise<void> => {
    setBusy(true); setResult(null)
    try {
      const out = await window.api.exporter.saveDialog(`${project.name.replace(/[\\/:*?"<>|]+/g, '_')}.${format}`, format)
      if (!out) { setBusy(false); return }
      const mix = await renderMix({ bits, normalize })
      let note = ''
      if (format === 'wav') {
        await window.api.exporter.write(out, mix.wav)
      } else {
        const r = await window.api.exporter.mp3(mix.wav, out, kbps)
        if (!r.ok) {
          // no ffmpeg: keep the work and write a WAV next to the wanted file
          const wavPath = out.replace(/\.mp3$/i, '.wav')
          await window.api.exporter.write(wavPath, mix.wav)
          setResult({ ok: false, text: `MP3 needs ffmpeg (${r.error}). A WAV file was saved instead: ${wavPath}` })
          setBusy(false)
          return
        }
      }
      const db = mix.peak > 0 ? (20 * Math.log10(mix.peak)).toFixed(1) : '-inf'
      if (mix.peak >= 0.999) note = ' Warning: the mix clips (peak at 0 dBFS). Lower the track faders or tick Normalize.'
      setResult({ ok: true, text: `Saved ${out}. Length ${Math.round(mix.seconds)} s, peak ${db} dBFS.${note}` })
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  return (
    <div onClick={() => { if (!busy) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Export audio</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          The whole project ({project.tracks.length} track{project.tracks.length === 1 ? '' : 's'}, {label}) is mixed into one file, with mute, solo, volume and pan as you hear them.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['wav', 'mp3'] as const).map((f) => (
            <button key={f} className={`btn ${format === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
          ))}
        </div>
        {format === 'wav' ? (
          <label style={row}>Bit depth
            <select value={bits} onChange={(e) => setBits(Number(e.target.value) as 16 | 24)}>
              <option value={16}>16 bit (CD)</option><option value={24}>24 bit (studio)</option>
            </select>
          </label>
        ) : (
          <label style={row}>Bitrate
            <select value={kbps} onChange={(e) => setKbps(Number(e.target.value))}>
              <option value={128}>128 kbit/s</option><option value={192}>192 kbit/s</option><option value={320}>320 kbit/s</option>
            </select>
          </label>
        )}
        <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }}>
          <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
          Normalize to −1 dBFS (raises or lowers the whole mix)
        </label>
        {result && <div style={{ fontSize: 12, color: result.ok ? 'var(--green)' : 'var(--red)', wordBreak: 'break-word' }}>{result.text}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>{busy ? 'Rendering…' : 'Export…'}</button>
        </div>
      </div>
    </div>
  )
}

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-primary)' }
