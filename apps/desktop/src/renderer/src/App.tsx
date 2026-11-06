import React, { useEffect, useState } from 'react'
import { UpdateToast } from './components/updater/UpdateToast'
import { api, baseUrl } from './lib/api'
import { useUIStore } from './stores/ui.store'
import { useProjectStore } from './stores/project.store'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { PianoRoll } from './components/piano-roll/PianoRoll'
import { Timeline } from './components/timeline/Timeline'
import { Mixer } from './components/mixer/Mixer'
import { VocalEditor } from './components/vocal-editor/VocalEditor'
import { InstrumentPanel } from './components/instruments/InstrumentPanel'
import { AIChat } from './components/ai-chat/AIChat'
import { StemSplitter } from './components/stem-splitter/StemSplitter'
import { VideoComposer } from './components/video-composer/VideoComposer'
import { Settings } from './components/settings/Settings'
import { CreateMusic } from './components/create/CreateMusic'
import { Mastering } from './components/mastering/Mastering'
import { KaraokeExport } from './components/karaoke/KaraokeExport'
import { WinampMode } from './components/winamp/WinampMode'

// Hardware info fetched from backend
interface HardwareInfo {
  gpu: string
  backend: string
  cores: number
  low_cpu: boolean
}

function StatusBar({ hw, base, onWinamp, onSetup }: {
  hw: HardwareInfo | null; base: string; onWinamp: () => void; onSetup: () => void
}): React.ReactElement {
  const { project } = useProjectStore()
  const gpuLabel = hw
    ? `${hw.gpu || 'CPU'} · ${hw.backend.toUpperCase()}`
    : 'AI backend offline — click to open Settings → AI Engines'

  return (
    <footer className="app-statusbar">
      <span>AI Music Studio v{__APP_VERSION__}</span>
      <span style={{ color: 'var(--border-mid)' }}>·</span>
      <span>{project.name}</span>
      <span style={{ color: 'var(--border-mid)' }}>·</span>
      <span
        onClick={hw ? undefined : onSetup}
        style={{
          color: !hw ? 'var(--orange)' : hw.backend === 'cpu' ? 'var(--yellow)' : 'var(--green)',
          cursor: hw ? 'default' : 'pointer'
        }}
      >
        {gpuLabel}
      </span>
      {hw?.low_cpu && (
        <>
          <span style={{ color: 'var(--border-mid)' }}>·</span>
          <span style={{ color: 'var(--orange)' }}>Low-CPU mode</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button
        onClick={onWinamp}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}
      >
        Winamp (Ctrl+M)
      </button>
      <span style={{ color: 'var(--accent-light)' }}>MCP: {base ? `${base}/mcp` : '…'}</span>
    </footer>
  )
}

export default function App(): React.ReactElement {
  const { theme } = useUIStore()
  // an older version may have stored the removed 'music-gen' view
  const activeView = useUIStore((s) => ((s.activeView as string) === 'music-gen' ? 'create' : s.activeView))
  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [winamp, setWinamp] = useState(false)
  const [base, setBase] = useState('')
  const setActiveView = useUIStore(s => s.setActiveView)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setWinamp(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    // Poll backend for hardware info; clear it when the backend goes away
    const tryFetch = () =>
      Promise.all([api.health(), baseUrl()])
        .then(([d, url]) => { setHw(d.hardware ?? null); setBase(url) })
        .catch(() => { setHw(null); baseUrl().then(setBase) })
    tryFetch()
    const id = setInterval(tryFetch, 10000)
    return () => clearInterval(id)
  }, [])

  const renderPanel = () => {
    switch (activeView) {
      case 'piano-roll':    return <PianoRoll />
      case 'mixer':         return <Mixer />
      case 'vocal-editor':  return <VocalEditor />
      case 'instruments':   return <InstrumentPanel />
      case 'ai-chat':       return <AIChat />
      case 'stem-splitter': return <StemSplitter />
      case 'video-composer':return <VideoComposer />
      case 'create':        return <CreateMusic />
      case 'mastering':     return <Mastering />
      case 'karaoke':       return <KaraokeExport />
      case 'settings':      return <Settings />
      default:              return null
    }
  }

  // These views need room: they use the whole main area instead of the strip under the timeline
  const FULL_VIEWS = ['create', 'settings', 'mastering', 'karaoke', 'stem-splitter', 'video-composer', 'ai-chat']
  const panel = renderPanel()
  const fullView = FULL_VIEWS.includes(activeView)

  return (
    <div className="app-shell">
      <TopBar />

      <div className="app-body">
        <Sidebar />

        <main className="app-main">
          {fullView ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bg-primary)' }}>{panel}</div>
          ) : (
            <Timeline />
          )}

          {/* Bottom panel — shows the active view under the timeline */}
          {!fullView && panel && (
            <div style={{
              flex: '0 0 auto',
              height: 320,
              borderTop: '1px solid var(--border-mid)',
              background: 'var(--bg-secondary)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {panel}
            </div>
          )}
        </main>

        {/* AI Chat sidebar */}
        <div className={`ai-chat-sidebar${chatOpen ? '' : ' collapsed'}`}>
          {/* Toggle button */}
          <div style={{
            padding: '8px 10px', borderBottom: '1px solid var(--border-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              AI Assistant
            </span>
            <button
              onClick={() => setChatOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <AIChat compact />
          </div>
        </div>

        {/* Chat toggle when closed */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              background: 'var(--accent)', border: 'none', cursor: 'pointer',
              color: '#fff', fontSize: 11, fontWeight: 700, padding: '8px 4px',
              borderRadius: '6px 0 0 6px', writingMode: 'vertical-rl',
              letterSpacing: '0.06em'
            }}
          >
            AI ▸
          </button>
        )}
      </div>

      <StatusBar hw={hw} base={base} onWinamp={() => setWinamp(true)} onSetup={() => { sessionStorage.setItem('ams-settings-tab', 'engines'); setActiveView('settings') }} />
      <UpdateToast />
      <WinampMode open={winamp} onClose={() => setWinamp(false)} />
    </div>
  )
}
