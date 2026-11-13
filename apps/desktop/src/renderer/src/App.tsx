import React, { useEffect, useState } from 'react'
import { UpdateToast } from './components/updater/UpdateToast'
import { api, baseUrl } from './lib/api'
import { useShortcuts } from './shortcuts/useShortcuts'
import { useMusicJob } from './stores/musicJob.store'
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
import { ComingSoon } from './components/common/ComingSoon'
import { StemSplitter } from './components/stem-splitter/StemSplitter'
import { VideoComposer } from './components/video-composer/VideoComposer'
import { Settings } from './components/settings/Settings'
import { CreateMusic } from './components/create/CreateMusic'
import { Library } from './components/library/Library'
import { Welcome } from './components/common/Welcome'
import { BeatMatchCard } from './beatmatch/BeatMatchCard'
import { QuantizeDialog } from './edit/GridControls'
import { FeedbackButton } from './components/common/Feedback'
import { Mastering } from './components/mastering/Mastering'
import { KaraokeExport } from './components/karaoke/KaraokeExport'

// Hardware info fetched from backend
interface HardwareInfo {
  gpu: string
  backend: string
  cores: number
  low_cpu: boolean
}

// A running music job stays visible in every view, with a click back to it.
function GeneratingBadge(): React.ReactElement | null {
  const job = useMusicJob((st) => st.job)
  const busy = job?.status === 'queued' || job?.status === 'running'
  if (!job || (!busy && job.status !== 'error')) return null
  const pct = job.step_total ? Math.round(((job.step ?? 0) / job.step_total) * 100) : null
  return (
    <>
      <span style={{ color: 'var(--border-mid)' }}>·</span>
      <button
        onClick={() => useUIStore.getState().setActiveView('create')}
        title="Back to Create music"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          color: job.status === 'error' ? 'var(--red)' : 'var(--accent-light)' }}
      >
        {job.status === 'error' ? 'Music generation failed: open' : `Generating music${pct !== null ? ` ${pct}%` : '…'}${job.stage_text ? ` · ${job.stage_text.slice(0, 40)}` : ''}`}
      </button>
      {busy && !job.cancel && (
        <button onClick={() => void useMusicJob.getState().cancel()} title="Cancel music generation"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--red)', padding: '0 2px' }}>✕</button>
      )}
    </>
  )
}

function StatusBar({ hw, base, onSetup }: {
  hw: HardwareInfo | null; base: string; onSetup: () => void
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
      <GeneratingBadge />
      <span style={{ flex: 1 }} />
      <FeedbackButton />
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
  const [base, setBase] = useState('')
  const setActiveView = useUIStore(s => s.setActiveView)

  // keyboard shortcuts (Ableton Live 12 or Cubase layout, chosen in Settings → Shortcuts)
  useShortcuts()

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
      case 'vocal-editor':  return <ComingSoon name="Vocal Editor" icon="🎤" />
      case 'instruments':   return <ComingSoon name="AI Instruments" icon="🎻" />
      case 'ai-chat':       return <AIChat />
      case 'stem-splitter': return <StemSplitter />
      case 'video-composer':return <ComingSoon name="Video Composer" icon="🎬" />
      case 'create':        return <CreateMusic />
      case 'library':       return <Library />
      case 'mastering':     return <Mastering />
      case 'karaoke':       return <ComingSoon name="Karaoke Export" icon="🎙" />
      case 'cloud':         return <ComingSoon name="Cloud Rendering (Pro)" icon="☁"
        text="Render on fast NVIDIA graphics cards in the cloud: a song in a few minutes, also on a PC without a strong graphics card. An optional paid extra; everything you have now stays free and runs on your own PC." />
      case 'settings':      return <Settings />
      default:              return null
    }
  }

  // These views need room: they use the whole main area instead of the strip under the timeline
  const panelHeight = useUIStore((st) => st.panelHeight)
  const FULL_VIEWS = ['create', 'library', 'settings', 'mastering', 'karaoke', 'stem-splitter', 'video-composer', 'ai-chat', 'vocal-editor', 'instruments', 'cloud']
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
            <Timeline fill={!panel} />
          )}

          {/* Bottom panel — shows the active view under the timeline */}
          {!fullView && panel && <PanelResizer />}
          {!fullView && panel && (
            <div style={{
              flex: '0 0 auto',
              height: panelHeight,
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

      <StatusBar hw={hw} base={base} onSetup={() => { sessionStorage.setItem('ams-settings-tab', 'engines'); setActiveView('settings') }} />
      <UpdateToast />
      <Welcome />
      <BeatMatchCard />
      <QuantizeDialog />
    </div>
  )
}

// The line between the Studio and the panel under it: drag it up or down to share the height.
function PanelResizer(): React.ReactElement {
  const setPanelHeight = useUIStore((s) => s.setPanelHeight)
  const start = React.useRef<{ y: number; h: number } | null>(null)
  return (
    <div title="Drag to resize the Studio and the panel below (double-click: default)"
      style={{ flex: '0 0 auto', height: 6, cursor: 'row-resize', background: 'var(--border-mid)', position: 'relative', zIndex: 5 }}
      onDoubleClick={() => setPanelHeight(320)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId)
        start.current = { y: e.clientY, h: useUIStore.getState().panelHeight }
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const max = Math.max(160, window.innerHeight - 220)       // keep some Studio visible
        setPanelHeight(Math.round(Math.min(max, Math.max(120, start.current.h + (start.current.y - e.clientY)))))
      }}
      onPointerUp={() => { start.current = null }} />
  )
}
