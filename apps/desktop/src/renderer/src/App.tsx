import React, { useEffect, useState } from 'react'
import { UpdateToast } from './components/updater/UpdateToast'
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

// Hardware info fetched from backend
interface HardwareInfo {
  gpu: string
  backend: string
  cores: number
  low_cpu: boolean
}

function StatusBar({ hw }: { hw: HardwareInfo | null }): React.ReactElement {
  const { project } = useProjectStore()
  const gpuLabel = hw
    ? `${hw.gpu || 'CPU'} · ${hw.backend.toUpperCase()}`
    : 'Connecting...'

  return (
    <footer className="app-statusbar">
      <span>AI Music Studio v0.1.0-alpha</span>
      <span style={{ color: 'var(--border-mid)' }}>·</span>
      <span>{project.name}</span>
      <span style={{ color: 'var(--border-mid)' }}>·</span>
      <span style={{ color: hw?.backend === 'cpu' ? 'var(--yellow)' : 'var(--green)' }}>
        {gpuLabel}
      </span>
      {hw?.low_cpu && (
        <>
          <span style={{ color: 'var(--border-mid)' }}>·</span>
          <span style={{ color: 'var(--orange)' }}>Low-CPU mode</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--accent-light)' }}>MCP: http://localhost:8765/mcp</span>
    </footer>
  )
}

export default function App(): React.ReactElement {
  const { activeView, theme } = useUIStore()
  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const [chatOpen, setChatOpen] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    // Poll backend for hardware info
    const tryFetch = () =>
      fetch('http://127.0.0.1:8765/health')
        .then(r => r.json())
        .then(d => { if (d.hardware) setHw(d.hardware) })
        .catch(() => {})
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
      case 'settings':      return <Settings />
      default:              return null
    }
  }

  const panel = renderPanel()

  return (
    <div className="app-shell">
      <TopBar />

      <div className="app-body">
        <Sidebar />

        <main className="app-main">
          {/* Timeline always visible at top */}
          <Timeline />

          {/* Bottom panel — shows active view */}
          {panel && (
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

      <StatusBar hw={hw} />
      <UpdateToast />
    </div>
  )
}
