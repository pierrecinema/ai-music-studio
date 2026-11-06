import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioStore } from '../../stores/audio.store'
import { useProjectStore } from '../../stores/project.store'

// Animated level meters for the status bar
function LevelMeter(): React.ReactElement {
  const [levels, setLevels] = useState([0.3, 0.5, 0.4, 0.6, 0.3, 0.7, 0.5, 0.4])
  const { isPlaying } = useAudioStore()

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setLevels(prev => prev.map(() => Math.random() * 0.9 + 0.05))
    }, 80)
    return () => clearInterval(id)
  }, [isPlaying])

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, padding: '0 4px' }}>
      {levels.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: isPlaying ? `${h * 100}%` : '20%',
            background: h > 0.8 ? 'var(--red)' : h > 0.6 ? 'var(--yellow)' : 'var(--green)',
            borderRadius: 1,
            transition: 'height 60ms ease-out'
          }}
        />
      ))}
    </div>
  )
}

// Position display (bar:beat:tick)
function PositionDisplay(): React.ReactElement {
  const [pos, setPos] = useState({ bar: 1, beat: 1, tick: 0 })
  const { isPlaying } = useAudioStore()
  const { project } = useProjectStore()

  useEffect(() => {
    if (!isPlaying) return
    const bpm = project.bpm || 120
    const msPerTick = (60000 / bpm) / 24
    const id = setInterval(() => {
      setPos(prev => {
        let { bar, beat, tick } = prev
        tick++
        if (tick >= 24) { tick = 0; beat++ }
        if (beat > 4) { beat = 1; bar++ }
        return { bar, beat, tick }
      })
    }, msPerTick)
    return () => clearInterval(id)
  }, [isPlaying, project.bpm])

  return (
    <div className="tb-position">
      {String(pos.bar).padStart(3,' ')}.{pos.beat}.{String(pos.tick).padStart(2,'0')}
    </div>
  )
}

export function TopBar(): React.ReactElement {
  const { t } = useTranslation()
  const {
    isPlaying, isRecording, bpm,
    play, pause, stop, setRecording,
    setBpm, masterVolume, setMasterVolume,
    toggleMetronome, metronomeEnabled
  } = useAudioStore()
  const { project, updateProject } = useProjectStore()

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (val >= 20 && val <= 300) {
      setBpm(val)
      updateProject({ bpm: val })
    }
  }

  return (
    <header className="app-topbar" style={{ padding: '0 8px', gap: 0 }}>

      {/* Logo — no-drag region */}
      <div className="tb-section" style={{ marginRight: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="var(--accent)" />
            <path d="M6 10 L10 6 L14 10 L10 14 Z" fill="white" />
            <circle cx="10" cy="10" r="2" fill="var(--accent)" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            AMS
          </span>
        </div>
      </div>

      <div className="tb-divider" />

      {/* Transport */}
      <div className="tb-section" style={{ gap: 3 }}>
        {/* Back to start */}
        <button className="tb-btn" onClick={stop} data-tooltip={t('toolbar.stop')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
            <rect x="2" y="2" width="9" height="9" rx="1" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          className={`tb-btn${isPlaying ? ' active' : ''}`}
          onClick={isPlaying ? pause : play}
          data-tooltip={isPlaying ? t('toolbar.pause') : t('toolbar.play')}
          style={{ width: 36, height: 36, borderRadius: 8 }}
        >
          {isPlaying
            ? <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                <rect x="2" y="2" width="3.5" height="9" rx="1"/>
                <rect x="7.5" y="2" width="3.5" height="9" rx="1"/>
              </svg>
            : <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                <path d="M3 2 L11 6.5 L3 11 Z"/>
              </svg>
          }
        </button>

        {/* Record */}
        <button
          className={`tb-btn record${isRecording ? ' active' : ''}`}
          onClick={() => setRecording(!isRecording)}
          data-tooltip={t('toolbar.record')}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
            <circle cx="5.5" cy="5.5" r="4.5" />
          </svg>
        </button>
      </div>

      <div className="tb-divider" />

      {/* Position */}
      <div className="tb-section">
        <PositionDisplay />
      </div>

      <div className="tb-divider" />

      {/* BPM */}
      <div className="tb-section">
        <div className="tb-bpm">
          <span style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em' }}>BPM</span>
          <input
            type="number"
            value={bpm}
            onChange={handleBpmChange}
            min={20} max={300}
          />
        </div>
      </div>

      {/* Time sig */}
      <div className="tb-section" style={{ marginLeft: 4 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          lineHeight: 1.1, padding: '0 6px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-mid)',
          borderRadius: 6, height: 32,
          justifyContent: 'center'
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>4</span>
          <div style={{ width: '100%', height: 1, background: 'var(--border-mid)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>4</span>
        </div>
      </div>

      <div className="tb-divider" />

      {/* Metronome */}
      <div className="tb-section">
        <button
          className={`tb-btn${metronomeEnabled ? ' active' : ''}`}
          onClick={toggleMetronome}
          data-tooltip={t('toolbar.metronome')}
          style={{ fontSize: 15 }}
        >
          ♩
        </button>
      </div>

      {/* Level meters */}
      <div className="tb-section" style={{ marginLeft: 4 }}>
        <LevelMeter />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Project name */}
      <div className="tb-section" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        {project.name}
      </div>

      <div className="tb-divider" />

      {/* Master volume */}
      <div className="tb-section tb-volume">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--text-muted)">
          <path d="M1 5h3l4-3v10l-4-3H1V5z"/>
          <path d="M9.5 4.5c1 1 1.5 1.5 1.5 2.5s-.5 1.5-1.5 2.5" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <path d="M11.5 2.5c1.5 1.5 2 3 2 4.5s-.5 3-2 4.5" stroke="var(--text-secondary)" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5"/>
        </svg>
        <input
          type="range" min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVolume(parseFloat(e.target.value))}
        />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
          {Math.round(masterVolume * 100)}%
        </span>
      </div>

      {/* Right window drag padding */}
      <div style={{ width: 80, WebkitAppRegion: 'drag' } as React.CSSProperties} />
    </header>
  )
}
