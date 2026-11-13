import React, { useState } from 'react'

// The output menu: formats (several at once), sample rate, bit depth with dither, bit rates, metadata and cover,
// folder and file name, presets per destination. The settings are remembered.

export interface OutFormat { format: string; bits?: number; kbps?: number; vbr?: boolean }
export interface OutputSettings {
  formats: OutFormat[]
  sampleRate: number
  dither: boolean
  folder: string
  name: string
  meta: { title: string; artist: string; album: string; year: string; isrc: string; comment: string }
  cover: string | null
}

const KEY = 'ams-master-output'
export function loadOutput(name: string): OutputSettings {
  let s: Partial<OutputSettings> = {}
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { /* none */ }
  return {
    formats: s.formats?.length ? s.formats : [{ format: 'wav', bits: 24 }, { format: 'mp3', kbps: 320 }],
    sampleRate: s.sampleRate ?? 44100,
    dither: s.dither ?? true,
    folder: s.folder ?? '',
    name,
    meta: { title: name, artist: s.meta?.artist ?? '', album: s.meta?.album ?? '', year: s.meta?.year ?? String(new Date().getFullYear()), isrc: '', comment: '' },
    cover: null,
  }
}
function saveOutput(s: OutputSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify({ formats: s.formats, sampleRate: s.sampleRate, dither: s.dither, folder: s.folder, meta: { artist: s.meta.artist, album: s.meta.album, year: s.meta.year } })) } catch { /* no storage */ }
}

const ALL: Array<{ id: string; label: string; pcm?: boolean; bits?: number[]; lossy?: boolean; rates?: number[]; vbr?: boolean }> = [
  { id: 'wav', label: 'WAV', pcm: true, bits: [16, 24, 32] },
  { id: 'aiff', label: 'AIFF', pcm: true, bits: [16, 24, 32] },
  { id: 'flac', label: 'FLAC', pcm: true, bits: [16, 24] },
  { id: 'alac', label: 'ALAC (Apple Lossless, .m4a)', pcm: true, bits: [16, 24] },
  { id: 'mp3', label: 'MP3', lossy: true, rates: [128, 192, 256, 320], vbr: true },
  { id: 'aac', label: 'AAC (.m4a)', lossy: true, rates: [128, 192, 256, 320] },
  { id: 'ogg', label: 'OGG Vorbis', lossy: true, rates: [128, 192, 256, 320], vbr: true },
  { id: 'opus', label: 'Opus (48 kHz)', lossy: true, rates: [96, 128, 160, 192, 256] },
]

const DESTINATIONS: Record<string, Pick<OutputSettings, 'formats' | 'sampleRate' | 'dither'>> = {
  'Streaming / distributor (WAV 24 + MP3)': { formats: [{ format: 'wav', bits: 24 }, { format: 'mp3', kbps: 320 }], sampleRate: 44100, dither: true },
  'CD (WAV 16-bit, 44.1 kHz)': { formats: [{ format: 'wav', bits: 16 }], sampleRate: 44100, dither: true },
  'Bandcamp (FLAC 24-bit)': { formats: [{ format: 'flac', bits: 24 }], sampleRate: 48000, dither: true },
  'Hi-res (WAV 24-bit, 96 kHz)': { formats: [{ format: 'wav', bits: 24 }], sampleRate: 96000, dither: true },
  'YouTube / video (AAC 320, 48 kHz)': { formats: [{ format: 'aac', kbps: 320 }], sampleRate: 48000, dither: false },
  'Apple (ALAC 24 + AAC 256)': { formats: [{ format: 'alac', bits: 24 }, { format: 'aac', kbps: 256 }], sampleRate: 48000, dither: true },
  'Web / demo (MP3 320 + OGG)': { formats: [{ format: 'mp3', kbps: 320 }, { format: 'ogg', kbps: 256 }], sampleRate: 44100, dither: false },
}

const field: React.CSSProperties = { fontSize: 12, width: '100%' }
const lab: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }

export function MasterOutput({ initial, onClose, onExport, busy, results }: {
  initial: OutputSettings
  onClose: () => void
  onExport: (s: OutputSettings) => void
  busy: string | null
  results: Array<{ format: string; path?: string; error?: string; warning?: string }> | null
}): React.ReactElement {
  const [s, setS] = useState<OutputSettings>(initial)
  const upd = (p: Partial<OutputSettings>): void => setS((x) => ({ ...x, ...p }))
  const has = (id: string): OutFormat | undefined => s.formats.find((f) => f.format === id)
  const toggle = (id: string): void => {
    const d = ALL.find((a) => a.id === id)!
    upd({ formats: has(id) ? s.formats.filter((f) => f.format !== id) : [...s.formats, d.pcm ? { format: id, bits: 24 } : { format: id, kbps: id === 'opus' ? 160 : 320 }] })
  }
  const setFmt = (id: string, p: Partial<OutFormat>): void => upd({ formats: s.formats.map((f) => (f.format === id ? { ...f, ...p } : f)) })
  const go = (): void => { saveOutput(s); onExport(s) }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div style={{ width: 720, maxHeight: '90vh', overflow: 'auto', background: 'var(--bg-elevated)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-mid)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Export the master</span>
          <select value="" onChange={(e) => { const d = DESTINATIONS[e.target.value]; if (d) upd(d) }} style={{ fontSize: 11 }}>
            <option value="">Preset for…</option>
            {Object.keys(DESTINATIONS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={!!busy} onClick={onClose}>×</button>
        </div>

        <div style={lab}>Formats (several at once)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {ALL.map((a) => {
            const f = has(a.id)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: f ? 'var(--accent-dim)' : 'var(--bg-tertiary)', borderRadius: 6, padding: '5px 8px' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f} onChange={() => toggle(a.id)} /> {a.label}
                </label>
                {f && a.bits && (
                  <select value={f.bits} onChange={(e) => setFmt(a.id, { bits: Number(e.target.value) })} style={{ fontSize: 11 }}>
                    {a.bits.map((b) => <option key={b} value={b}>{b === 32 ? '32-bit float' : `${b}-bit`}</option>)}
                  </select>
                )}
                {f && a.rates && (
                  <select value={f.vbr ? 'vbr' : f.kbps} onChange={(e) => setFmt(a.id, e.target.value === 'vbr' ? { vbr: true } : { vbr: false, kbps: Number(e.target.value) })} style={{ fontSize: 11 }}>
                    {a.rates.map((r) => <option key={r} value={r}>{r} kbps</option>)}
                    {a.vbr && <option value="vbr">VBR (best)</option>}
                  </select>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
          <label>Sample rate{' '}
            <select value={s.sampleRate} onChange={(e) => upd({ sampleRate: Number(e.target.value) })}>
              {[44100, 48000, 88200, 96000].map((r) => <option key={r} value={r}>{(r / 1000).toFixed(1).replace('.0', '')} kHz</option>)}
            </select>
          </label>
          <label title="Adds a very quiet noise when the bit depth is reduced (e.g. to 16-bit), so quiet parts fade out smoothly instead of grainy">
            <input type="checkbox" checked={s.dither} onChange={(e) => upd({ dither: e.target.checked })} /> Dither (TPDF) when reducing bit depth
          </label>
        </div>

        <div style={lab}>Metadata</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {(['title', 'artist', 'album', 'year', 'isrc', 'comment'] as const).map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-secondary)' }}>
              {k === 'isrc' ? 'ISRC' : k[0].toUpperCase() + k.slice(1)}
              <input style={field} value={s.meta[k]} placeholder={k === 'isrc' ? 'e.g. DEABC2600001' : ''}
                onChange={(e) => upd({ meta: { ...s.meta, [k]: e.target.value } })} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={async () => { const p = await window.api.dialog.openImage(); if (p) upd({ cover: p }) }}>Cover picture…</button>
          <span className="truncate" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{s.cover ?? 'none (JPG or PNG, square, e.g. 3000 × 3000)'}</span>
          {s.cover && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => upd({ cover: null })}>×</button>}
        </div>

        <div style={lab}>Where</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-secondary)' }}>File name
            <input style={field} value={s.name} onChange={(e) => upd({ name: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={async () => { const f = await window.api.dialog.pickFolder('Folder for the master'); if (f) upd({ folder: f }) }}>Folder…</button>
            <span className="truncate" style={{ fontSize: 11, color: s.folder ? 'var(--text-secondary)' : 'var(--orange)' }}>{s.folder || 'choose a folder'}</span>
          </div>
        </div>

        {results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', color: r.error ? 'var(--red)' : 'var(--green)' }}>
                <b style={{ width: 44 }}>{r.format.toUpperCase()}</b>
                <span className="truncate" style={{ flex: 1 }}>{r.error ?? r.path}{r.warning ? ` (${r.warning})` : ''}</span>
                {r.path && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => void window.api.files.showItem(r.path!)}>Show</button>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {busy && <span style={{ fontSize: 11, color: 'var(--accent-light)' }}>{busy}</span>}
          <button className="btn btn-ghost" disabled={!!busy} onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={!!busy || !s.folder || !s.formats.length || !s.name.trim()} onClick={go}>
            Export {s.formats.length} file{s.formats.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
