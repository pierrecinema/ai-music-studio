import React, { useState } from 'react'
import { api, type KaraokeWord } from '../../lib/api'

export function KaraokeExport(): React.ReactElement {
  const [audio, setAudio] = useState('')
  const [words, setWords] = useState<KaraokeWord[]>([])
  const [lrc, setLrc] = useState('')
  const [lrcFile, setLrcFile] = useState('')
  const [videoFile, setVideoFile] = useState('')
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const guard = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setError(null)
    try { await fn() } catch (e) { setError(String((e as Error).message)) } finally { setBusy(null) }
  }

  const browse = async () => {
    const p = await window.api.dialog.openAudio()
    if (p[0]) { setAudio(p[0]); setWords([]); setLrc(''); setVideoFile('') }
  }

  const align = () => guard('align', async () => {
    const r = await api.karaoke.align({ audioPath: audio })
    setWords(r.words)
    const l = await api.karaoke.lrc({ words: r.words })
    setLrc(l.lrc); setLrcFile(l.lrcFile)
  })

  const makeVideo = () => guard('video', async () => {
    const r = await api.karaoke.video({ audioPath: audio, words, aspect })
    setVideoFile(r.videoFile)
  })

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', height: '100%' }}>
      <div className="panel-header" style={{ padding: 0, border: 'none' }}>Karaoke export</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Detects word timings in a song (Whisper), writes an enhanced .lrc and renders an MP4 with highlighted lyrics (needs ffmpeg).
        Works best on an isolated vocal stem.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={browse}>Choose song…</button>
        <span className="truncate" style={{ fontSize: 11, maxWidth: 420 }}>{audio || 'nothing selected'}</span>
      </div>
      <div>
        <button className="btn btn-primary" disabled={!audio || !!busy} onClick={align}>
          {busy === 'align' ? 'Detecting words…' : 'Detect lyrics & timing'}
        </button>
      </div>

      {words.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--green)' }}>{words.length} words aligned</div>
          <textarea readOnly value={lrc} rows={8} style={{ fontFamily: 'monospace', fontSize: 11 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => window.api.shell.openPath(lrcFile)}>Open .lrc</button>
            {(['16:9', '9:16', '1:1'] as const).map(a => (
              <button key={a} className={`btn ${aspect === a ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAspect(a)}>{a}</button>
            ))}
            <button className="btn btn-primary" disabled={!!busy} onClick={makeVideo}>
              {busy === 'video' ? 'Rendering…' : 'Render MP4'}
            </button>
          </div>
        </>
      )}
      {videoFile && (
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => window.api.shell.openPath(videoFile)}>
          Open video
        </button>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 11 }}>{error}</div>}
    </div>
  )
}
