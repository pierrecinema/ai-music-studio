import React, { useState } from 'react'
import { api, type ExportFormat } from '../../lib/api'
import { exportSampleRate, setExportSampleRate } from '../../lib/sampleRate'

// Export audio files (stems, loops, songs) into a folder of the user's choice: one file each, in the format
// their DAW wants. Used by the Stem Splitter and the Library.

export const EXPORT_FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
  { id: 'wav24', label: 'WAV 24-bit', hint: 'Recommended: every DAW reads it, full quality' },
  { id: 'wav16', label: 'WAV 16-bit', hint: 'CD quality, smaller files' },
  { id: 'wav32', label: 'WAV 32-bit float', hint: 'Maximum headroom for further mixing' },
  { id: 'aiff', label: 'AIFF 24-bit', hint: 'Logic Pro, GarageBand and other Mac DAWs' },
  { id: 'flac', label: 'FLAC 24-bit', hint: 'Lossless and about half the size of WAV' },
  { id: 'mp3', label: 'MP3 320 kbit/s', hint: 'Small, for listening and sharing (needs ffmpeg)' },
]

const FORMAT_KEY = 'ams-export-format'

export function ExportDialog({ items, title, onClose }: {
  items: Array<{ path: string; name: string }>
  title: string
  onClose: () => void
}): React.ReactElement {
  const [format, setFormat] = useState<ExportFormat>(() => {
    try { return (localStorage.getItem(FORMAT_KEY) as ExportFormat) || 'wav24' } catch { return 'wav24' }
  })
  const [rate, setRate] = useState<number>(() => exportSampleRate())     // 0 = keep the file's own rate
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string[] | null>(null)

  const run = async (): Promise<void> => {
    setError(null)
    const folder = await window.api.dialog.pickFolder('Export to this folder')
    if (!folder) return
    try { localStorage.setItem(FORMAT_KEY, format) } catch { /* storage unavailable */ }
    setBusy(true)
    try {
      if (rate) setExportSampleRate(rate)
      const r = await api.library.exportFiles({ items, folder, format, sampleRate: rate || null })
      setDone(r.files)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Export {title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {items.length === 1 ? 'The file is' : `Each of the ${items.length} parts is`} saved as its own audio file in the folder you choose next.
        </div>
        {!done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {EXPORT_FORMATS.map((f) => (
              <label key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '6px 8px', borderRadius: 6,
                background: format === f.id ? 'var(--bg-hover)' : 'transparent', border: `1px solid ${format === f.id ? 'var(--accent)' : 'var(--border-mid)'}` }}>
                <input type="radio" name="export-format" checked={format === f.id} onChange={() => setFormat(f.id)} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{f.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {!done && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            Sample rate
            <select value={String(rate)} onChange={(e) => setRate(Number(e.target.value))} style={{ fontSize: 12 }}>
              <option value="44100">44.1 kHz (streaming platforms, CD)</option>
              <option value="48000">48 kHz (video)</option>
              <option value="88200">88.2 kHz</option>
              <option value="96000">96 kHz</option>
              <option value="0">Keep the file's own rate</option>
            </select>
          </label>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        {done && (
          <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>{done.length} file{done.length === 1 ? '' : 's'} exported:</span>
            {done.map((f) => <span key={f} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{f}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {done ? (
            <>
              <button className="btn btn-ghost" onClick={() => void window.api.files.showItem(done[0])}>Show in folder</button>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void run()} disabled={busy || items.length === 0}>{busy ? 'Exporting…' : 'Choose folder and export'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "house, Deep , house" -> ['house', 'deep']
export function parseTags(text: string): string[] {
  const out: string[] = []
  for (const t of text.split(',')) {
    const v = t.trim().toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out.slice(0, 20)
}
