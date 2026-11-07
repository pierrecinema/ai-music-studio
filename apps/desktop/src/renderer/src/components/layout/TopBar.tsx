import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioStore } from '../../stores/audio.store'
import { useProjectStore } from '../../stores/project.store'
import { masterLevel, pause, play, startRecording, stop } from '../../audio/engine'
import { historySize, redo, undo } from '../../shortcuts/history'
import { FileMenu } from './FileMenu'
import { runSyncAll, useBeatMatch } from '../../beatmatch/store'
import logo from '../../assets/logo.png'

// Level meter of the master output: real peaks from the audio engine, with a short fall-back
function LevelMeter(): React.ReactElement {
  const [level, setLevel] = useState(0)
  const { isPlaying } = useAudioStore()

  useEffect(() => {
    if (!isPlaying) { setLevel(0); return }
    let raf = 0
    let held = 0
    const loop = (): void => {
      held = Math.max(masterLevel(), held * 0.9)
      setLevel(held)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const bars = 8
  return (
    <div title="Master level" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, padding: '0 4px' }}>
      {Array.from({ length: bars }, (_, i) => {
        const on = level * bars > i + 0.2
        const hot = i >= bars - 1 ? 'var(--red)' : i >= bars - 3 ? 'var(--yellow)' : 'var(--green)'
        return <div key={i} style={{ width: 3, height: `${30 + (i / bars) * 70}%`, background: on ? hot : 'var(--bg-elevated)', borderRadius: 1 }} />
      })}
    </div>
  )
}

// Position display (bar.beat.tick) that follows the real play position
function PositionDisplay(): React.ReactElement {
  const beat = useAudioStore((s) => s.currentBeat)
  const perBar = useProjectStore((s) => s.project.timeSignature?.[0] ?? 4)
  const whole = Math.floor(beat)
  const bar = Math.floor(whole / perBar) + 1
  const inBar = (whole % perBar) + 1
  const tick = Math.floor((beat - whole) * 24)
  return (
    <div className="tb-position">
      {String(bar).padStart(3, ' ')}.{inBar}.{String(tick).padStart(2, '0')}
    </div>
  )
}

export function TopBar(): React.ReactElement {
  const { t } = useTranslation()
  const {
    isPlaying, isRecording, bpm, loading,
    setBpm, masterVolume, setMasterVolume,
    toggleMetronome, metronomeEnabled
  } = useAudioStore()
  const project = useProjectStore((s) => s.project)
  const dirty = useProjectStore((s) => s.dirty)
  const setProjectBpm = useProjectStore((s) => s.setBpm)
  // re-render when the undo history changes size
  useProjectStore((s) => s.project)
  const hist = historySize()
  const autoSync = useBeatMatch((s) => s.mode === 'auto')
  const setSyncMode = useBeatMatch((s) => s.setMode)

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (val >= 20 && val <= 300) {
      setBpm(val)
      setProjectBpm(val)
    }
  }

  const toggleRecord = async (): Promise<void> => {
    if (isRecording) { pause(); return }
    const problem = await startRecording()
    if (problem) window.alert(problem)
  }

  return (
    <header className="app-topbar" style={{ padding: '0 8px', gap: 0 }}>

      {/* Logo — no-drag region */}
      <div className="tb-section" style={{ marginRight: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px' }}>
          <img
            src={logo}
            alt="AI Music Studio"
            width={34}
            height={34}
            style={{ display: 'block', filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.85))' }}
          />
          <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            AI Music Studio
          </span>
        </div>
      </div>

      <div className="tb-divider" />

      {/* File and undo */}
      <div className="tb-section" style={{ gap: 3 }}>
        <FileMenu />
        <button className="tb-btn" onClick={() => void undo()} disabled={hist.undo === 0} data-tooltip="Undo (Ctrl+Z)" style={{ opacity: hist.undo ? 1 : 0.35, fontSize: 14 }}>↶</button>
        <button className="tb-btn" onClick={() => void redo()} disabled={hist.redo === 0} data-tooltip="Redo (Ctrl+Y)" style={{ opacity: hist.redo ? 1 : 0.35, fontSize: 14 }}>↷</button>
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
          title={loading ? 'Reading audio files…' : undefined}
          onClick={() => (isPlaying ? pause() : void play())}
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
          onClick={() => void toggleRecord()}
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
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            min={20} max={300}
          />
        </div>
      </div>

      {/* Auto sync: new audio is stretched to the master BPM */}
      <div className="tb-section" style={{ marginLeft: 4 }}>
        <button
          className={`tb-btn${autoSync ? ' active' : ''}`}
          onClick={() => { const on = !autoSync; setSyncMode(on ? 'auto' : 'ask'); if (on) void runSyncAll() }}
          data-tooltip={autoSync ? 'Auto-sync is ON: every audio is kept in time with the master BPM, beats on the grid' : 'Auto-sync is off. Click: all audio in the project is synced to the master BPM now, and new audio automatically.'}
          style={{ width: 'auto', padding: '0 8px', fontSize: 10, fontWeight: 800, letterSpacing: '0.05em' }}
        >
          AUTO SYNC
        </button>
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
        {dirty ? '• ' : ''}{project.name}
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
