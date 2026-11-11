import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { StemResult } from '../../types'
import { ExportDialog, parseTags } from '../common/ExportDialog'
import { useUIStore } from '../../stores/ui.store'

const STEM_COLORS: Record<string, string> = {
  vocals: '#7c3aed',
  drums: '#dc2626',
  bass: '#2563eb',
  piano: '#d97706',
  guitar: '#059669',
  other: '#6b7280'
}

export function StemSplitter(): React.ReactElement {
  const { t } = useTranslation()
  const [file, setFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<StemResult | null>(null)
  const [model, setModel] = useState<'htdemucs' | 'htdemucs_ft' | 'mdx_extra' | 'htdemucs_6s'>('htdemucs_ft')
  const [stems, setStems] = useState<string[]>(['vocals', 'drums', 'bass', 'other'])
  const dropRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [saved, setSaved] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const baseName = (n: string): string => n.replace(/\.[^.]+$/, '')

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      setFileName(f.name); setTitle(baseName(f.name))
      setFile((f as File & { path?: string }).path || f.name)
    }
  }

  const handleBrowse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) {
      setFile(paths[0])
      const n = paths[0].split(/[\\/]/).pop() ?? paths[0]
      setFileName(n); setTitle(baseName(n))
    }
  }

  const handleSplit = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgress(0)
    setError(null); setSaved(null); setResult(null)
    try {
      const r = await api.stems.split({ filePath: file, model, stems })
      setResult(r)
    } catch (err) {
      setError(`Splitting failed: ${(err as Error).message}`)
    } finally {
      setIsProcessing(false)
      setProgress(100)
    }
  }

  const toggleStem = (stem: string) => {
    setStems(s => s.includes(stem) ? s.filter(x => x !== stem) : [...s, stem])
  }

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{t('stemSplitter.title')}</div>

      {/* Drop Zone */}
      <div
        ref={dropRef}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={handleBrowse}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 10,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          background: 'var(--bg-secondary)',
          transition: 'border-color 0.2s'
        }}
      >
        <span style={{ fontSize: 32 }}>🎵</span>
        {fileName
          ? <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{fileName}</span>
          : <>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('stemSplitter.dropAudio')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MP3, WAV, FLAC, AIFF, M4A</span>
            </>
        }
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <div style={labelStyle}>{t('stemSplitter.model')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['htdemucs', 'htdemucs_ft', 'mdx_extra', 'htdemucs_6s'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setModel(m)
                  if (m === 'htdemucs_6s') setStems(['vocals', 'drums', 'bass', 'piano', 'guitar', 'other'])
                }}
                style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', background: model === m ? 'var(--accent)' : 'var(--bg-secondary)', color: model === m ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}
              >
                {m === 'htdemucs' ? 'Fast' : m === 'htdemucs_ft' ? 'Balanced' : m === 'mdx_extra' ? 'Quality' : '6 Stems'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={labelStyle}>Stems to extract</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.keys(STEM_COLORS).map(stem => (
              <button
                key={stem}
                onClick={() => toggleStem(stem)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${STEM_COLORS[stem]}`,
                  background: stems.includes(stem) ? STEM_COLORS[stem] + '33' : 'transparent',
                  color: stems.includes(stem) ? STEM_COLORS[stem] : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: stems.includes(stem) ? 600 : 400
                }}
              >
                {t(`stemSplitter.${stem}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Split Button */}
      <button
        onClick={handleSplit}
        disabled={!file || isProcessing}
        style={{ alignSelf: 'flex-start', padding: '10px 24px', background: file && !isProcessing ? 'var(--accent)' : 'var(--bg-hover)', color: 'white', border: 'none', borderRadius: 6, cursor: file && !isProcessing ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}
      >
        {isProcessing ? t('stemSplitter.processing') : t('stemSplitter.split')}
      </button>

      {/* Progress */}
      {isProcessing && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.5s' }} />
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          <div style={labelStyle}>Results</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {Object.entries(result).map(([stem, path]) => path && (
              <div
                key={stem}
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${STEM_COLORS[stem] ?? 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: STEM_COLORS[stem] ?? 'var(--border)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t(`stemSplitter.${stem}`)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Ready to export</div>
                </div>
              </div>
            ))}
          </div>
          {/* keep them: the library (folder "Stems") or files for a DAW */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelStyle}>Name</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name of the song" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelStyle}>Tags (optional)</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. house, 124, female vocals, remix" />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Separate with commas: genre, mood or anything you want to find the stems by later.</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" disabled={saving || saved !== null} onClick={async () => {
                setSaving(true); setError(null)
                try {
                  const r = await api.library.saveStems({ stems: result as Record<string, string>, title: title.trim() || baseName(fileName), tags: parseTags(tags), source_path: file })
                  setSaved(r.tracks.length)
                } catch (e) { setError((e as Error).message) }
                setSaving(false)
              }}>{saving ? 'Saving…' : saved !== null ? `✓ ${saved} stems saved` : 'Save to library'}</button>
              <button className="btn btn-ghost" onClick={() => setExporting(true)}>{t('stemSplitter.export')}…</button>
              {saved !== null && (
                <button className="btn btn-ghost" onClick={() => useUIStore.getState().setActiveView('library')}>Open Library → Stems</button>
              )}
            </div>
          </div>
        </div>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {exporting && result && (
        <ExportDialog title="stems" onClose={() => setExporting(false)}
          items={Object.entries(result).filter(([, p]) => p).map(([stem, p]) => ({ path: p as string, name: `${title.trim() || baseName(fileName)} – ${stem}` }))} />
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
