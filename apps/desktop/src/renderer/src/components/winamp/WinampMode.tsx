import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type WebampInstance = {
  renderWhenReady: (node: HTMLElement) => Promise<void>
  appendTracks: (tracks: Array<{ url: string; metaData?: { artist?: string; title?: string } }>) => void
  dispose: () => void
}

export function WinampMode({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const webamp = useRef<WebampInstance | null>(null)
  const urls = useRef<string[]>([])
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) setStarted(true) }, [open])

  useEffect(() => {
    if (!started || webamp.current || !host.current) return
    let cancelled = false
    import('webamp')
      .then(async ({ default: Webamp }) => {
        if (cancelled || !host.current) return
        const w = new Webamp({ zIndex: 10010 }) as unknown as WebampInstance
        webamp.current = w
        await w.renderWhenReady(host.current)
      })
      .catch(e => setError(String(e?.message ?? e)))
    return () => { cancelled = true }
  }, [started])

  useEffect(() => () => {
    webamp.current?.dispose()
    webamp.current = null
    urls.current.forEach(URL.revokeObjectURL)
  }, [])

  const addFiles = (files: FileList | null) => {
    if (!files || !webamp.current) return
    const tracks = Array.from(files).map(f => {
      const url = URL.createObjectURL(f)
      urls.current.push(url)
      return { url, metaData: { title: f.name.replace(/\.[^.]+$/, ''), artist: 'AI Music Studio' } }
    })
    webamp.current.appendTracks(tracks)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: open ? 'block' : 'none',
        background: 'radial-gradient(circle at 30% 20%, #1c1f2e, #07080c)',
      }}
    >
      <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', zIndex: 10020 }}>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {t('winamp.addFiles', { defaultValue: 'Add audio files' })}
          <input type="file" accept="audio/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </label>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('winamp.back', { defaultValue: 'Back to studio' })} (Ctrl+M)
        </button>
        {error && <span style={{ color: 'var(--red)', fontSize: 11 }}>{error}</span>}
      </div>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
