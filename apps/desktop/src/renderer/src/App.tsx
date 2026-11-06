import React, { useEffect } from 'react'
import { useUIStore } from './stores/ui.store'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { PianoRoll } from './components/piano-roll/PianoRoll'
import { Timeline } from './components/timeline/Timeline'
import { Mixer } from './components/mixer/Mixer'
import { VocalEditor } from './components/vocal-editor/VocalEditor'
import { InstrumentPanel } from './components/instruments/InstrumentPanel'
import { AIChat } from './components/ai-chat/AIChat'
import { StemSplitter } from './components/stem-splitter/StemSplitter'
import { VideoComposer } from './components/video-composer/VideoComposer'
import { Settings } from './components/settings/Settings'

export default function App(): React.ReactElement {
  const { activeView, theme } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const renderView = () => {
    switch (activeView) {
      case 'piano-roll': return <PianoRoll />
      case 'mixer': return <Mixer />
      case 'vocal-editor': return <VocalEditor />
      case 'instruments': return <InstrumentPanel />
      case 'ai-chat': return <AIChat />
      case 'stem-splitter': return <StemSplitter />
      case 'video-composer': return <VideoComposer />
      case 'settings': return <Settings />
      default: return <Timeline />
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Timeline />
          <div className="app-panel">
            {renderView()}
          </div>
        </main>
        <div className="app-chat">
          <AIChat compact />
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
