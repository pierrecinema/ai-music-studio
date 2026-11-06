import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { StemResult } from '../../types'

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
  const [model, setModel] = useState<'htdemucs' | 'htdemucs_ft' | 'mdx_extra'>('htdemucs_ft')
  const [stems, setStems] = useState<string[]>(['vocals', 'drums', 'bass', 'other'])
  const dropRef = useRef<HTMLDivElement>(null)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      setFileName(f.name)
      setFile(f.path || f.name)
    }
  }

  const handleBrowse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) {
      setFile(paths[0])
      setFileName(paths[0].split('\\').pop() ?? paths[0])
    }
  }

  const handleSplit = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgress(0)
    try {
      const r = await api.stems.split({ filePath: file, model, stems })
      setResult(r)
    } catch (err) {
      console.error('Stem split failed:', err)
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
            {(['htdemucs', 'htdemucs_ft', 'mdx_extra'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', background: model === m ? 'var(--accent)' : 'var(--bg-secondary)', color: model === m ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}
              >
                {m === 'htdemucs' ? 'Fast' : m === 'htdemucs_ft' ? 'Balanced' : 'Quality'}
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
          <button style={{ marginTop: 12, padding: '6px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>
            {t('stemSplitter.export')}
          </button>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
