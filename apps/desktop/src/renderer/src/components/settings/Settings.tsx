import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { useUIStore } from '../../stores/ui.store'
import { useAIStore } from '../../stores/ai.store'
import type { AIProvider } from '../../types'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
]

const CLAUDE_MODELS = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-6']
const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini']

type SettingsTab = 'general' | 'ai' | 'audio' | 'appearance' | 'updates'

type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

function UpdatesTab(): React.ReactElement {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [info, setInfo] = useState<{ version?: string; percent?: number; bps?: number; message?: string }>({})

  const u = (window as unknown as { api: { updater: { check: () => void; download: () => void; install: () => void } } }).api?.updater

  const checkNow = () => { setPhase('checking'); u?.check() }
  const download = () => u?.download()
  const install = () => u?.install()

  React.useEffect(() => {
    if (!u) return
    const wa = window as unknown as { api: { updater: {
      onChecking: (cb: () => void) => void
      onAvailable: (cb: (i: { version: string }) => void) => void
      onNotAvailable: (cb: () => void) => void
      onProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => void
      onDownloaded: (cb: (i: { version: string }) => void) => void
      onError: (cb: (m: string) => void) => void
    } } }
    wa.api.updater.onChecking(() => setPhase('checking'))
    wa.api.updater.onAvailable(i => { setPhase('available'); setInfo({ version: i.version }) })
    wa.api.updater.onNotAvailable(() => setPhase('idle'))
    wa.api.updater.onProgress(p => { setPhase('downloading'); setInfo({ percent: p.percent, bps: p.bytesPerSecond }) })
    wa.api.updater.onDownloaded(i => { setPhase('ready'); setInfo({ version: i.version }) })
    wa.api.updater.onError(m => { setPhase('error'); setInfo({ message: m }) })
  }, [])

  const statusColor = phase === 'ready' ? 'var(--green)' : phase === 'error' ? 'var(--red)' : phase === 'available' ? 'var(--accent-light)' : 'var(--text-muted)'
  const statusText = {
    idle: 'Auf dem neuesten Stand',
    checking: 'Suche nach Updates…',
    available: `Update verfügbar — v${info.version}`,
    downloading: `Lädt herunter… ${info.percent}%`,
    ready: `v${info.version} bereit zum Installieren`,
    error: `Fehler: ${info.message}`
  }[phase]

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          AI Music Studio Updates
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Updates werden automatisch gesucht und im Hintergrund geladen.
        </div>
      </div>

      {/* Status card */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)',
        borderRadius: 8, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{statusText}</div>
          {phase === 'downloading' && (
            <div style={{ marginTop: 8, height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${info.percent}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 400ms' }} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {(phase === 'idle' || phase === 'error') && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={checkNow}>
            Jetzt suchen
          </button>
        )}
        {phase === 'available' && (
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={download}>
            Herunterladen
          </button>
        )}
        {phase === 'ready' && (
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={install}>
            Neu starten & Installieren
          </button>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-disabled)' }}>
        Updates kommen von github.com/pierrecinema/ai-music-studio
      </div>
    </div>
  )
}

export function Settings(): React.ReactElement {
  const { t } = useTranslation()
  const { theme, setTheme, language, setLanguage } = useUIStore()
  const { provider, setProvider, claudeApiKey, setClaudeApiKey, openaiApiKey, setOpenaiApiKey, model, setModel } = useAIStore()
  const [tab, setTab] = useState<SettingsTab>('general')
  const [showKey, setShowKey] = useState(false)

  const handleLanguageChange = (code: string) => {
    setLanguage(code)
    i18n.changeLanguage(code)
    localStorage.setItem('ams-language', code)
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Tab nav */}
      <div style={{ width: 160, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, padding: '0 6px' }}>{t('settings.title')}</div>
        {(['general', 'ai', 'audio', 'appearance', 'updates'] as SettingsTab[]).map(tab2 => (
          <button
            key={tab2}
            onClick={() => setTab(tab2)}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 6,
              border: 'none',
              background: tab === tab2 ? 'var(--bg-hover)' : 'transparent',
              color: tab === tab2 ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: tab === tab2 ? 600 : 400
            }}
          >
            {t(`settings.${tab2}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        {tab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.general')}</div>
            <div>
              <label style={labelStyle}>{t('settings.language')}</label>
              <select
                value={language}
                onChange={e => handleLanguageChange(e.target.value)}
                style={inputStyle}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('settings.vstPaths')}</label>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                C:\Program Files\VSTPlugins<br />
                C:\Program Files\Steinberg\VSTPlugins
              </div>
              <button style={{ marginTop: 8, ...smallBtnStyle }}>{t('settings.scanVst')}</button>
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.ai')}</div>
            <div>
              <label style={labelStyle}>{t('settings.aiProvider')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['claude', 'openai'] as AIProvider[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: `1px solid ${provider === p ? 'var(--accent)' : 'var(--border)'}`,
                      background: provider === p ? 'rgba(124,58,237,0.15)' : 'var(--bg-secondary)',
                      color: provider === p ? 'var(--accent-light)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: provider === p ? 600 : 400
                    }}
                  >
                    {p === 'claude' ? 'Claude (Anthropic)' : 'ChatGPT (OpenAI)'}
                  </button>
                ))}
              </div>
            </div>

            {provider === 'claude' && (
              <>
                <div>
                  <label style={labelStyle}>{t('settings.claudeKey')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={claudeApiKey}
                      onChange={e => setClaudeApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
                    {CLAUDE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </>
            )}

            {provider === 'openai' && (
              <>
                <div>
                  <label style={labelStyle}>{t('settings.openaiKey')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={openaiApiKey}
                      onChange={e => setOpenaiApiKey(e.target.value)}
                      placeholder="sk-..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
                    {OPENAI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'audio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.audio')}</div>
            <div>
              <label style={labelStyle}>{t('settings.sampleRate')}</label>
              <select style={inputStyle} defaultValue="44100">
                <option value="44100">44,100 Hz</option>
                <option value="48000">48,000 Hz</option>
                <option value="88200">88,200 Hz</option>
                <option value="96000">96,000 Hz</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('settings.bufferSize')}</label>
              <select style={inputStyle} defaultValue="512">
                {[64, 128, 256, 512, 1024, 2048].map(b => (
                  <option key={b} value={b}>{b} samples</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {tab === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.appearance')}</div>
            <div>
              <label style={labelStyle}>{t('settings.theme')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['dark', 'light'] as const).map(th => (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: `1px solid ${theme === th ? 'var(--accent)' : 'var(--border)'}`,
                      background: theme === th ? 'rgba(124,58,237,0.15)' : 'var(--bg-secondary)',
                      color: theme === th ? 'var(--accent-light)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 13
                    }}
                  >
                    {th === 'dark' ? '🌙 ' + t('settings.dark') : '☀️ ' + t('settings.light')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'updates' && <UpdatesTab />}
      </div>
    </div>
  )
}

const sectionStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { width: '100%', maxWidth: 400, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }
const smallBtnStyle: React.CSSProperties = { padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }
