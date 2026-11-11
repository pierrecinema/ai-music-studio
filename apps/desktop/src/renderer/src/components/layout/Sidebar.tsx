import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui.store'
import type { View } from '../../types'

interface NavItem {
  view: View
  icon: string
  labelKey: string
  fallback: string
  soon?: boolean        // not finished yet: shown dimmed, opens a "Coming soon" page
}

export const COMING_SOON: View[] = ['vocal-editor', 'instruments', 'karaoke', 'video-composer', 'cloud']

const NAV_ITEMS: NavItem[] = [
  { view: 'create',         icon: '✨', labelKey: 'sidebar.create',        fallback: 'Create music' },
  { view: 'library',        icon: '🎵', labelKey: 'sidebar.library',       fallback: 'Library' },
  { view: 'timeline',       icon: '⊞',  labelKey: 'sidebar.timeline',      fallback: 'Studio' },
  { view: 'piano-roll',     icon: '♪',  labelKey: 'sidebar.pianoRoll',     fallback: 'Piano Roll' },
  { view: 'vocal-editor',   icon: '🎤', labelKey: 'sidebar.vocalEditor',   fallback: 'Vocal Editor' },
  { view: 'instruments',    icon: '🎻', labelKey: 'sidebar.instruments',   fallback: 'AI Instruments' },
  { view: 'mixer',          icon: '🎚', labelKey: 'sidebar.mixer',         fallback: 'Mixer' },
  { view: 'stem-splitter',  icon: '✂',  labelKey: 'sidebar.stemSplitter',  fallback: 'Stem Splitter' },
  { view: 'mastering',      icon: '◎',  labelKey: 'sidebar.mastering',     fallback: 'Mastering' },
  { view: 'karaoke',        icon: '🎙', labelKey: 'sidebar.karaoke',       fallback: 'Karaoke Export' },
  { view: 'video-composer', icon: '🎬', labelKey: 'sidebar.videoComposer', fallback: 'Video Composer' },
  { view: 'ai-chat',        icon: '💬', labelKey: 'sidebar.aiChat',        fallback: 'AI Chat' },
  { view: 'cloud',          icon: '☁',  labelKey: 'sidebar.cloud',         fallback: 'Cloud Rendering (Pro)' },
]

const COLLAPSED = 56
const EXPANDED = 214

export function Sidebar(): React.ReactElement {
  const { t } = useTranslation()
  const { activeView, setActiveView, closeSettings, sidebarOpen, toggleSidebar } = useUIStore()

  const button = (view: View, icon: string, text: string, size = 16) => {
    const active = activeView === view
    const soon = COMING_SOON.includes(view)
    return (
      <button
        key={view}
        // a second click on the open Settings button closes it again
        onClick={() => (view === 'settings' && active ? closeSettings() : setActiveView(view))}
        title={soon ? `${text} (coming soon)` : text}
        aria-label={text}
        style={{
          width: '100%', height: 40, display: 'flex', alignItems: 'center',
          justifyContent: sidebarOpen ? 'flex-start' : 'center', gap: 12,
          padding: sidebarOpen ? '0 12px' : 0, borderRadius: 8, border: 'none', cursor: 'pointer',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? 'white' : 'var(--text-secondary)', fontSize: 13, fontWeight: active ? 700 : 500,
          transition: 'background 0.15s', textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap',
          opacity: soon && !active ? 0.4 : 1, filter: soon ? 'grayscale(0.8)' : undefined,
        }}
      >
        <span style={{ width: 24, textAlign: 'center', fontSize: size, flexShrink: 0 }}>{icon}</span>
        {sidebarOpen && <span className="truncate">{text}</span>}
      </button>
    )
  }

  return (
    <nav
      style={{
        width: sidebarOpen ? EXPANDED : COLLAPSED, flexShrink: 0, transition: 'width 0.15s',
        background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '8px 8px', gap: 2, overflowY: 'auto', overflowX: 'hidden',
      }}
    >
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
        aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
        style={{
          width: '100%', height: 36, display: 'flex', alignItems: 'center',
          justifyContent: sidebarOpen ? 'space-between' : 'center', padding: sidebarOpen ? '0 12px' : 0,
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
        }}
      >
        {sidebarOpen && <span>Menu</span>}
        <span style={{ fontSize: 15 }}>{sidebarOpen ? '«' : '»'}</span>
      </button>

      {NAV_ITEMS.map((item) =>
        button(item.view, item.icon, t(item.labelKey, { defaultValue: item.fallback }))
      )}

      <div style={{ flex: 1 }} />

      {button('settings', '⚙', t('app.settings', { defaultValue: 'Settings' }), 18)}
    </nav>
  )
}
