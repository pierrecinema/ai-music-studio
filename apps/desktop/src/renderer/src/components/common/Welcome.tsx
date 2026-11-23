import React, { useEffect, useState } from 'react'
import { api, type CapabilityReport } from '../../lib/api'
import { adoptRecovered, recoverableProject } from '../../project/io'
import type { Project } from '../../types'
import { useUIStore } from '../../stores/ui.store'
import { tr } from '../../i18n/tr'
import { SetupWizard } from './SetupWizard'

/** opens the setup assistant (also from Settings → AI Engines) */
export const OPEN_SETUP_EVENT = 'ams-open-setup'

const SEEN = 'ams-welcome-seen'

// First start: what this computer can do and where to begin. Also offers to restore unsaved work after a crash.
export function Welcome(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [rec, setRec] = useState<{ project: Project; mtime: number } | null>(null)
  const [cap, setCap] = useState<CapabilityReport | null>(null)
  const setActiveView = useUIStore((s) => s.setActiveView)
  // the first start on a PC without the AI environment: the setup assistant instead of the welcome text
  const [setup, setSetup] = useState<EngineStatus | null>(null)
  useEffect(() => {
    const open = (): void => { void window.api.engines.status().then(setSetup).catch(() => undefined) }
    window.addEventListener(OPEN_SETUP_EVENT, open)
    // the setup assistant opens after a new installation (the installer leaves a mark), and on a PC without the AI
    // environment until it was done or put off
    let decided = ''
    try { decided = localStorage.getItem('ams-setup-done') ?? '' } catch { /* storage unavailable */ }
    void (async () => {
      const fresh = await window.api.engines?.setupPending?.().catch(() => false)
      if (!fresh && decided) return
      const st = await window.api.engines?.status?.().catch(() => null)
      if (st && (fresh || !st.venvReady)) { setSetup(st); try { localStorage.setItem(SEEN, '1') } catch { /* storage */ } setOpen(false) }
    })()
    return () => window.removeEventListener(OPEN_SETUP_EVENT, open)
  }, [])

  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem(SEEN) === '1' } catch { /* storage unavailable */ }
    void recoverableProject().then((r) => { if (r) { setRec(r); setOpen(true) } })
    if (!seen) {
      setOpen(true)
      const t = window.setInterval(() => {
        api.system.capabilities().then((c) => { setCap(c); window.clearInterval(t) }).catch(() => undefined)
      }, 2500)
      api.system.capabilities().then((c) => { setCap(c); window.clearInterval(t) }).catch(() => undefined)
      return () => window.clearInterval(t)
    }
    return undefined
  }, [])

  if (setup) {
    return <SetupWizard status={setup}
      onClose={() => { try { localStorage.setItem('ams-setup-done', 'later') } catch { /* storage */ } setSetup(null) }}
      onFinish={(view) => { setSetup(null); setActiveView(view) }} />
  }
  if (!open) return null
  const close = (): void => {
    try { localStorage.setItem(SEEN, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  const go = (view: 'create' | 'timeline'): void => { close(); setActiveView(view) }
  const goSettings = (): void => { close(); sessionStorage.setItem('ams-settings-tab', 'engines'); setActiveView('settings') }
  const ready = cap?.features.filter((f) => f.status === 'ready').length ?? 0
  const slow = cap?.features.filter((f) => f.status === 'slow').length ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9800, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: '100%', overflow: 'auto', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rec && (
          <div style={{ border: '1px solid var(--orange)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tr('Restore unsaved work?')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
              {tr('The app found an automatic backup of “')}{rec.project.name}” ({rec.project.tracks.length} {tr('tracks) from')} {new Date(rec.mtime).toLocaleString()}{tr('.\n              That usually means the last session ended without saving.')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => { adoptRecovered(rec.project); setRec(null); close() }}>{tr('Restore it')}</button>
              <button className="btn btn-ghost" onClick={() => { void window.api.project.autosaveClear(); setRec(null) }}>{tr('Discard it')}</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Welcome to AI Music Studio')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {tr('Found a problem or have an idea? Press Feedback at the bottom right: your reports make the app better.')}
          {cap
            ? <> {tr('Your computer:')} <b>{cap.label.split(':')[0]}</b>. {ready} {tr('features run well,')} {slow} {tr('run slowly (see Settings → Hardware).')}</>
            : <> {tr('Checking your computer…')}</>}
        </div>

        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.9 }}>
          <li><b>{tr('Install the AI engines')}</b> {tr('once: Settings → AI Engines. Nothing generates before this.')}</li>
          <li><b>{tr('Create music')}</b> {tr('makes a song from a description. Every song is saved in the')} <b>{tr('Library')}</b> {tr('automatically.')}</li>
          <li>{tr('The')} <b>{tr('Studio')}</b> {tr('plays and edits audio and MIDI: drag audio files in, move and trim clips, mix, then')} <b>{tr('File → Export')}</b>.</li>
          <li>{tr('Press')} <b>{tr('Ctrl+S')}</b> {tr('to save your project. Unsaved work is backed up every 30 seconds.')}</li>
          <li>{tr('Something wrong? Press')} <b>{tr('Feedback')}</b> {tr('at the bottom right: it prepares a report with your system details.')}</li>
        </ol>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={goSettings}>{tr('Install AI engines')}</button>
          <button className="btn btn-ghost" onClick={() => go('create')}>{tr('Create music')}</button>
          <button className="btn btn-ghost" onClick={() => go('timeline')}>{tr('Start in the Studio')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={close}>{tr('Close')}</button>
        </div>
      </div>
    </div>
  )
}
