import React, { useEffect, useState } from 'react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; releaseDate: string }
  | { phase: 'downloading'; percent: number; bps: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

declare global {
  interface Window {
    api: {
      updater: {
        check: () => Promise<void>
        download: () => Promise<void>
        install: () => Promise<void>
        onChecking: (cb: () => void) => void
        onAvailable: (cb: (info: { version: string; releaseDate: string }) => void) => void
        onNotAvailable: (cb: () => void) => void
        onProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => void
        onDownloaded: (cb: (info: { version: string }) => void) => void
        onError: (cb: (msg: string) => void) => void
      }
    }
  }
}

export function UpdateToast(): React.ReactElement | null {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api?.updater) return
    const u = window.api.updater
    u.onChecking(() => setState({ phase: 'checking' }))
    u.onAvailable(info => setState({ phase: 'available', version: info.version, releaseDate: info.releaseDate }))
    u.onNotAvailable(() => setState({ phase: 'idle' }))
    u.onProgress(p => setState({ phase: 'downloading', percent: p.percent, bps: p.bytesPerSecond }))
    u.onDownloaded(info => { setState({ phase: 'ready', version: info.version }); setDismissed(false) })
    u.onError(msg => setState({ phase: 'error', message: msg }))
  }, [])

  if (state.phase === 'idle' || state.phase === 'checking' || dismissed) return null

  const toastBase: React.CSSProperties = {
    position: 'fixed', bottom: 32, right: 24, zIndex: 9999,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-mid)',
    borderRadius: 10, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    minWidth: 300, maxWidth: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    fontSize: 12
  }

  const formatBps = (bps: number) =>
    bps > 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} MB/s` : `${(bps / 1000).toFixed(0)} KB/s`

  return (
    <div style={toastBase}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: state.phase === 'ready' ? 'var(--green)'
              : state.phase === 'error' ? 'var(--red)' : 'var(--accent)',
            display: 'inline-block'
          }} />
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {state.phase === 'available' && `Update verfügbar — v${state.version}`}
            {state.phase === 'downloading' && 'Update wird geladen…'}
            {state.phase === 'ready' && `v${state.version} bereit zum Installieren`}
            {state.phase === 'error' && 'Update-Fehler'}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Body */}
      {state.phase === 'available' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          Neue Version verfügbar. Jetzt herunterladen und im Hintergrund installieren.
        </div>
      )}

      {state.phase === 'downloading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 10 }}>
            <span>{state.percent}%</span>
            <span>{formatBps(state.bps)}</span>
          </div>
          <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${state.percent}%`,
              background: 'var(--accent)', borderRadius: 2,
              transition: 'width 400ms ease-out'
            }} />
          </div>
        </div>
      )}

      {state.phase === 'ready' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          Download abgeschlossen. App neu starten um zu aktualisieren.
        </div>
      )}

      {state.phase === 'error' && (
        <div style={{ color: 'var(--red)', fontSize: 11 }}>{state.message}</div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {state.phase === 'available' && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 11 }}
            onClick={() => window.api.updater.download()}
          >
            Herunterladen
          </button>
        )}
        {state.phase === 'ready' && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 11 }}
            onClick={() => window.api.updater.install()}
          >
            Jetzt neu starten & installieren
          </button>
        )}
        {state.phase === 'error' && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => window.api.updater.check()}
          >
            Erneut versuchen
          </button>
        )}
      </div>
    </div>
  )
}
