import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioStore } from '../../stores/audio.store'
import { useProjectStore } from '../../stores/project.store'

export function TopBar(): React.ReactElement {
  const { t } = useTranslation()
  const { isPlaying, isRecording, bpm, play, pause, stop, setPlaying, setBpm, masterVolume, setMasterVolume, toggleMetronome, metronomeEnabled } = useAudioStore()
  const { project, updateProject } = useProjectStore()

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (val >= 20 && val <= 300) {
      setBpm(val)
      updateProject({ bpm: val })
    }
  }

  return (
    <header style={{
      height: 48,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      WebkitAppRegion: 'drag'
    } as React.CSSProperties}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 12, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="11" fill="var(--accent)" />
          <path d="M7 11 L11 7 L15 11 L11 15 Z" fill="white" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>AI Music Studio</span>
      </div>

      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={stop}
          title={t('toolbar.stop')}
          style={btnStyle}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" />
          </svg>
        </button>
        <button
          onClick={isPlaying ? pause : play}
          title={isPlaying ? t('toolbar.pause') : t('toolbar.play')}
          style={{ ...btnStyle, background: isPlaying ? 'var(--bg-hover)' : 'var(--accent)', color: 'white' }}
        >
          {isPlaying
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="3" height="8"/><rect x="7" y="2" width="3" height="8"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2 L10 6 L3 10 Z"/></svg>
          }
        </button>
        <button
          onClick={() => setPlaying(!isRecording)}
          title={t('toolbar.record')}
          style={{ ...btnStyle, color: isRecording ? '#ef4444' : 'var(--text-secondary)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r="4" />
          </svg>
        </button>
      </div>

      {/* BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('toolbar.bpm')}</span>
        <input
          type="number"
          value={bpm}
          onChange={handleBpmChange}
          min={20}
          max={300}
          style={{
            width: 50,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center'
          }}
        />
      </div>

      {/* Metronome */}
      <button
        onClick={toggleMetronome}
        title={t('toolbar.metronome')}
        style={{ ...btnStyle, WebkitAppRegion: 'no-drag', color: metronomeEnabled ? 'var(--accent-light)' : 'var(--text-muted)' } as React.CSSProperties}
      >
        ♩
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Project Name */}
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {project.name}
      </span>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--text-muted)">
          <path d="M2 5h3l4-3v10l-4-3H2V5z"/>
          <path d="M10 4c1 1 1.5 1.9 1.5 3s-.5 2-1.5 3" stroke="var(--text-muted)" strokeWidth="1" fill="none"/>
        </svg>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
          style={{ width: 70, accentColor: 'var(--accent)' }}
        />
      </div>
    </header>
  )
}

const btnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: 14
}
