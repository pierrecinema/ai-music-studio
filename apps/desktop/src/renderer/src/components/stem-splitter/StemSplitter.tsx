import React, { useEffect, useState, useRef } from 'react'
import { useStemHandoff } from '../../stores/stemHandoff'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { StemResult } from '../../types'
import { ExportDialog, parseTags } from '../common/ExportDialog'
import { useUIStore } from '../../stores/ui.store'
import { StemMixer } from './StemMixer'
import { StemWave, decodeForPicture } from './StemWave'
import { tr, trf } from '../../i18n/tr'

const STEM_COLORS: Record<string, string> = {
  vocals: '#7c3aed',
  drums: '#dc2626',
  bass: '#2563eb',
  piano: '#d97706',
  guitar: '#059669',
  other: '#6b7280',
  instrumental: '#0891b2'
}

export function StemSplitter(): React.ReactElement {
  const { t } = useTranslation()
  const [file, setFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const jobId = useRef<string | null>(null)                 // the running split, for Cancel
  const [result, setResult] = useState<StemResult | null>(null)
  const [model, setModel] = useState<'htdemucs' | 'htdemucs_ft' | 'mdx_extra' | 'htdemucs_6s' | 'mdx_vocals' | 'mdx_4stems'>('htdemucs_ft')
  const [stems, setStems] = useState<string[]>(['vocals', 'drums', 'bass', 'other'])
  const dropRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [saved, setSaved] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [originalBuf, setOriginalBuf] = useState<AudioBuffer | null>(null)   // the song as a picture
  const originalLength = originalBuf?.duration ?? 0
  const baseName = (n: string): string => n.replace(/\.[^.]+$/, '')

  // a song sent here from Create music, the Library or Mastering
  const pending = useStemHandoff((s) => s.pending)
  useEffect(() => {
    if (!pending || isProcessing) return
    const p = useStemHandoff.getState().take()
    if (!p) return
    setFile(p.path); setFileName(p.path.split(/[\\/]/).pop() ?? p.path); setTitle(p.name)
    setResult(null); setError(null); setSaved(null)
  }, [pending, isProcessing])

  useEffect(() => {
    setOriginalBuf(null)
    if (!file) return
    let alive = true
    void decodeForPicture(file).then((b) => { if (alive) setOriginalBuf(b) })
    return () => { alive = false }
  }, [file])

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (isProcessing) return
    const f = e.dataTransfer.files[0]
    if (f) {
      setResult(null); setError(null); setSaved(null)
      setFileName(f.name); setTitle(baseName(f.name))
      setFile((f as File & { path?: string }).path || f.name)
    }
  }

  const handleBrowse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) {
      setResult(null); setError(null); setSaved(null)
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
    setStage('Starting'); setElapsed(0)
    try {
      const { job_id } = await api.stems.start({ filePath: file, model, stems })
      jobId.current = job_id
      for (;;) {                                             // poll the backend once a second
        await new Promise((r) => setTimeout(r, 1000))
        const j = await api.stems.job(job_id)
        setProgress(j.progress); setStage(j.text); setElapsed(j.elapsed)
        if (j.status === 'done') { setResult(j.result as StemResult); break }
        if (j.status === 'error') throw new Error(j.error ?? 'unknown error')
        if (j.status === 'cancelled') { setError(tr('Splitting was cancelled.')); break }
      }
    } catch (err) {
      setError(`Splitting failed: ${(err as Error).message}`)
    } finally {
      jobId.current = null
      setIsProcessing(false)
      setProgress(100)
    }
  }

  const toggleStem = (stem: string) => {
    setStems(s => s.includes(stem) ? s.filter(x => x !== stem) : [...s, stem])
  }

  const modelNames: Record<typeof model, string> = {
    mdx_vocals: tr('Vocals + Instrumental (fastest)'), mdx_4stems: tr('4 Stems on the graphics card'), htdemucs: tr('Fast'),
    htdemucs_ft: tr('Balanced'), mdx_extra: tr('Quality'), htdemucs_6s: tr('6 Stems')
  }
  const chooseModel = (m: typeof model): void => {
    setModel(m)
    if (m === 'htdemucs_6s') setStems(['vocals', 'drums', 'bass', 'piano', 'guitar', 'other'])
    if (m === 'mdx_vocals') setStems(['vocals', 'instrumental'])
    else if (m === 'mdx_4stems') setStems(['vocals', 'drums', 'bass', 'other'])
    else if (stems.includes('instrumental')) setStems(['vocals', 'drums', 'bass', 'other'])
  }
  const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  const visibleStems = Object.keys(STEM_COLORS).filter((st) => (model === 'mdx_vocals' ? st === 'vocals' || st === 'instrumental' : model === 'mdx_4stems' ? ['vocals', 'drums', 'bass', 'other'].includes(st) : st !== 'instrumental'))
  const left = isProcessing && progress > 8 && progress < 100 ? (elapsed / (progress - 5)) * (100 - progress) : null
  const stemWord = (st: string): string => t(`stemSplitter.${st}`, { defaultValue: st.charAt(0).toUpperCase() + st.slice(1) })

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{t('stemSplitter.title')}</div>
        {fileName && <span className="chip" style={chip}>{fileName}{originalLength ? ` · ${mmss(originalLength)}` : ''}</span>}
        {file && <span style={{ fontSize: 11.5, padding: '4px 12px', borderRadius: 999, background: 'linear-gradient(90deg,#7c3aed,#db2777)', color: '#fff', fontWeight: 700 }}
          title={tr('Balanced is the best mix of quality and speed for most songs.')}>{tr('✦ Recommended')}: {modelNames[model]} · {trf('{n} stems', { n: stems.length })}</span>}
        <span style={{ flex: 1 }} />
        {file && !isProcessing && <button className="btn btn-ghost" onClick={handleBrowse}>{tr('Change song')}</button>}
        {isProcessing
          ? <button className="btn btn-ghost" title={tr('Stop this split')} onClick={() => { if (jobId.current) void api.stems.cancel(jobId.current).catch(() => undefined) }}>{tr('✕ Cancel')}</button>
          : <button className="btn btn-primary" disabled={!file} onClick={handleSplit}>✂ {t('stemSplitter.split')}</button>}
      </div>

      <div style={{ padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* the song */}
        {!file ? (
          <div ref={dropRef} onClick={handleBrowse} style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '56px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--bg-secondary)' }}>
            <span style={{ fontSize: 36 }}>✂</span>
            <span style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>{t('stemSplitter.dropAudio')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('MP3, WAV, FLAC, AIFF, M4A')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 520, textAlign: 'center' }}>{tr('The song is split into its parts: vocals, drums, bass and the rest. Then you hear them together, mix them and use them in the Studio.')}</span>
          </div>
        ) : (
          <div ref={dropRef} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle0}>{tr('Original')}</span>
              <span style={chip}>{tr('drag a song here to replace it')}</span>
            </div>
            <div style={{ marginTop: 6 }}><StemWave buffer={originalBuf} color="#64748b" height={54} /></div>
          </div>
        )}

        {/* what to split */}
        {file && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={labelStyle}>{t('stemSplitter.model')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['mdx_vocals', 'mdx_4stems', 'htdemucs', 'htdemucs_ft', 'mdx_extra', 'htdemucs_6s'] as const).map((m) => (
                    <button key={m} disabled={isProcessing} onClick={() => chooseModel(m)}
                      style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', background: model === m ? 'var(--accent)' : 'var(--bg-primary)', color: model === m ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
                      {modelNames[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={labelStyle}>{tr('Stems to extract')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {visibleStems.map((st) => (
                    <button key={st} disabled={isProcessing} onClick={() => toggleStem(st)}
                      style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${STEM_COLORS[st]}`, background: stems.includes(st) ? STEM_COLORS[st] + '33' : 'transparent', color: stems.includes(st) ? STEM_COLORS[st] : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: stems.includes(st) ? 600 : 400 }}>
                      {stemWord(st)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 760 }}>
              {model === 'mdx_vocals'
                ? tr('Only vocals and instrumental, but much faster; uses the graphics card on AMD, Intel and NVIDIA. Needs "Fast vocal separation" in Settings → AI Engines.')
                : model === 'mdx_4stems'
                ? tr('Vocals, drums, bass and other with four small models on the graphics card (AMD, Intel, NVIDIA): much faster than Fast on these cards, a little less clean than Balanced. Needs "Fast vocal separation" in Settings → AI Engines; the four models (a few dozen MB each) download on the first split.')
                : tr('Balanced runs 4 models one after the other: on the processor (AMD / Intel graphics too) Fast is about 4 times quicker.')}
            </div>
          </div>
        )}

        {/* progress */}
        {isProcessing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#db2777)', transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              <b>{Math.floor(progress)} %</b>
              <span>{stage}</span>
              <span style={{ flex: 1 }} />
              <span>{mmss(elapsed)}{left !== null ? ` · ${trf('about {t} left', { t: mmss(left) })}` : ''}</span>
            </div>
          </div>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

        {/* results: one lane per stem under the song */}
        {result && (
          <>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>▼ {trf('split into {n} stems', { n: Object.keys(result).filter((k) => (result as Record<string, string>)[k]).length })} ▼</div>
            <StemMixer source={file ?? undefined} stems={result as Record<string, string>} colors={STEM_COLORS} title={title.trim() || baseName(fileName)}
              labels={Object.fromEntries(Object.keys(result).map((st) => [st, stemWord(st)]))} />
            {/* keep them: the library (folder "Stems") or files for a DAW */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
                <span style={labelStyle}>{tr('Name')}</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Name of the song')} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '2 1 260px' }}>
                <span style={labelStyle}>{tr('Tags (optional)')}</span>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tr('e.g. house, 124, female vocals, remix')} title={tr('Separate with commas: genre, mood or anything you want to find the stems by later.')} />
              </label>
              <button className="btn btn-primary" disabled={saving || saved !== null} onClick={async () => {
                setSaving(true); setError(null)
                try {
                  const r = await api.library.saveStems({ stems: result as Record<string, string>, title: title.trim() || baseName(fileName), tags: parseTags(tags), source_path: file })
                  setSaved(r.tracks.length)
                } catch (e) { setError((e as Error).message) }
                setSaving(false)
              }}>{saving ? tr('Saving…') : saved !== null ? `✓ ${saved} stems saved` : tr('Save to library')}</button>
              <button className="btn btn-ghost" onClick={() => setExporting(true)}>{t('stemSplitter.export')}…</button>
              {saved !== null && (
                <button className="btn btn-ghost" onClick={() => { useUIStore.getState().setLibraryTab('stems'); useUIStore.getState().setActiveView('library') }}>{tr('Open Library → Stems')}</button>
              )}
            </div>
          </>
        )}
      </div>
      {exporting && result && (
        <ExportDialog title={tr('stems')} onClose={() => setExporting(false)}
          items={Object.entries(result).filter(([, p]) => p).map(([stem, p]) => ({ path: p as string, name: `${title.trim() || baseName(fileName)} – ${stem}` }))} />
      )}
    </div>
  )
}

const chip: React.CSSProperties = { fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }
const labelStyle0: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
