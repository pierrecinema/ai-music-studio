import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui.store'
import type { View } from '../../types'

interface NavItem {
  view: View
  icon: string
  labelKey: string
}

const NAV_ITEMS: NavItem[] = [
  { view: 'timeline',       icon: '⊞', labelKey: 'sidebar.timeline' },
  { view: 'piano-roll',     icon: '♪', labelKey: 'sidebar.pianoRoll' },
  { view: 'vocal-editor',   icon: '🎤', labelKey: 'sidebar.vocalEditor' },
  { view: 'instruments',    icon: '🎻', labelKey: 'sidebar.instruments' },
  { view: 'mixer',          icon: '🎚', labelKey: 'sidebar.mixer' },
  { view: 'music-gen',      icon: '♫', labelKey: 'sidebar.musicGen' },
  { view: 'stem-splitter',  icon: '✂', labelKey: 'sidebar.stemSplitter' },
  { view: 'mastering',      icon: '◎', labelKey: 'sidebar.mastering' },
  { view: 'karaoke',        icon: '🎙', labelKey: 'sidebar.karaoke' },
  { view: 'video-composer', icon: '🎬', labelKey: 'sidebar.videoComposer' },
  { view: 'ai-chat',        icon: '✦', labelKey: 'sidebar.aiChat' },
]

const LABEL_FALLBACK: Partial<Record<View, string>> = {
  'music-gen': 'Music Generator',
  mastering: 'Mastering',
  karaoke: 'Karaoke Export',
}

export function Sidebar(): React.ReactElement {
  const { t } = useTranslation()
  const { activeView, setActiveView } = useUIStore()

  return (
    <nav style={{
      width: 56,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 0',
      gap: 2
    }}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.view}
          onClick={() => setActiveView(item.view)}
          title={t(item.labelKey, { defaultValue: LABEL_FALLBACK[item.view] ?? item.view })}
          style={{
            width: 40,
            height: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: activeView === item.view ? 'var(--accent)' : 'transparent',
            color: activeView === item.view ? 'white' : 'var(--text-muted)',
            fontSize: 16,
            transition: 'all 0.15s'
          }}
        >
          {item.icon}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {/* Settings */}
      <button
        onClick={() => setActiveView('settings')}
        title={t('app.settings')}
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          background: activeView === 'settings' ? 'var(--accent)' : 'transparent',
          color: activeView === 'settings' ? 'white' : 'var(--text-muted)',
          fontSize: 18
        }}
      >
        ⚙
      </button>
    </nav>
  )
}
