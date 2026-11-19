import { AudioTab } from './AudioTab'
import { PluginsTab } from './PluginsTab'
import logo from '../../assets/logo.png'
import { exportSampleRate, setExportSampleRate } from '../../lib/sampleRate'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { useUIStore, type Theme } from '../../stores/ui.store'
import { useAIStore } from '../../stores/ai.store'
import type { AIProvider } from '../../types'
import { EnginesTab } from './EnginesTab'
import { ShortcutsTab } from './ShortcutsTab'
import { MidiTab } from './MidiTab'
import { ModelsTab } from './ModelsTab'
import { HardwareTab } from './HardwareTab'
import { tr, trf } from '../../i18n/tr'

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

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]
const OPENAI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'o1', label: 'o1' },
  { id: 'o1-mini', label: 'o1-mini' },
]
// xAI's model names change often: "Other model ID" takes any current one from console.x.ai
const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (fast, free tier)' },
  { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' },
]
const GROK_MODELS = [
  { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast' },
  { id: 'grok-4.3', label: 'Grok 4.3' },
]
// any model pulled with "ollama pull <name>"
const OLLAMA_MODELS = [
  { id: 'llama3.2', label: 'Llama 3.2 (3B, small and quick)' },
  { id: 'qwen2.5', label: 'Qwen 2.5 (7B)' },
  { id: 'gemma3', label: 'Gemma 3' },
  { id: 'mistral', label: 'Mistral (7B)' },
]
const CUSTOM = '__custom__'

function ModelPicker({ models, value, onChange }: {
  models: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}): React.ReactElement {
  const known = models.some(m => m.id === value)
  const [custom, setCustom] = useState(!known)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select
        value={custom ? CUSTOM : value}
        onChange={e => {
          if (e.target.value === CUSTOM) setCustom(true)
          else { setCustom(false); onChange(e.target.value) }
        }}
        style={inputStyle}
      >
        {models.map(m => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}
        <option value={CUSTOM}>{tr('Other model ID…')}</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={e => onChange(e.target.value.trim())}
          placeholder={tr('exact model ID')}
          style={inputStyle}
        />
      )}
    </div>
  )
}

// tab names translated through the tables (the older locale files lack the newer tabs)
const TAB_EN: Partial<Record<string, string>> = { midi: 'MIDI', plugins: 'Plugins', engines: 'AI Engines', hardware: 'Hardware', models: 'Models', shortcuts: 'Shortcuts', audio: 'Audio', updates: 'Updates', about: 'About' }

type SettingsTab = 'general' | 'midi' | 'plugins' | 'ai' | 'engines' | 'hardware' | 'models' | 'shortcuts' | 'audio' | 'appearance' | 'updates' | 'about'

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
    wa.api.updater.onNotAvailable(() => { setPhase('idle'); setInfo({}) })
    wa.api.updater.onProgress(p => { setPhase('downloading'); setInfo(prev => ({ ...prev, percent: p.percent, bps: p.bytesPerSecond })) })
    wa.api.updater.onDownloaded(i => { setPhase('ready'); setInfo({ version: i.version }) })
    wa.api.updater.onError(m => { setPhase('error'); setInfo({ message: m }) })
  }, [])

  const statusColor = phase === 'ready' ? 'var(--green)' : phase === 'error' ? 'var(--red)' : phase === 'available' ? 'var(--accent-light)' : 'var(--text-muted)'
  const statusText = {
    idle: tr('Up to date'),
    checking: tr('Checking for updates…'),
    available: trf('Update available: v{v}', { v: info.version ?? '' }),
    downloading: trf('Downloading… {p}%', { p: info.percent ?? 0 }),
    ready: trf('v{v} is ready to install', { v: info.version ?? '' }),
    error: trf('Error: {m}', { m: info.message ?? '' })
  }[phase]

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {tr('AI Music Studio Updates')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {tr('Updates are looked for automatically and downloaded in the background.')}
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

      {/* Versions */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 8,
        padding: '12px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12
      }}>
        <span style={{ color: 'var(--text-muted)' }}>{tr('Installed version')}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>v{__APP_VERSION__}</span>
        <span style={{ color: 'var(--text-muted)' }}>{tr('Available update')}</span>
        <span style={{ color: info.version ? 'var(--accent-light)' : 'var(--text-secondary)', fontWeight: 600 }}>
          {info.version
            ? `v${info.version}${phase === 'ready' ? ' (heruntergeladen)' : ''}`
            : phase === 'checking' ? tr('checking…') : tr('none found')}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {(phase === 'idle' || phase === 'error') && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={checkNow}>
            {tr('Check now')}
          </button>
        )}
        {phase === 'available' && (
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={download}>
            {tr('Download')}
          </button>
        )}
        {phase === 'ready' && (
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={install}>
            {tr('Restart and install')}
          </button>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-disabled)' }}>
        {tr('Updates come from github.com/pierrecinema/ai-music-studio')}
      </div>
    </div>
  )
}

// [theme, name, [background, panel, accent, line]]
const THEME_LIST: Array<[Theme, string, string[]]> = [
  ['dark', 'Dark', ['#111214', '#1a1c20', '#7c3aed', '#333']],
  ['light', 'Light', ['#f0f1f3', '#ffffff', '#7c3aed', '#ccc']],
  ['swiss', 'Swiss', ['#ffffff', '#ffffff', '#ff4f00', '#000000']],
  ['rack', 'Hardware rack', ['#17181b', '#3b3e44', '#f5a623', '#9db48a']],
]

export function Settings(): React.ReactElement {
  const { t } = useTranslation()
  const { theme, setTheme, language, setLanguage } = useUIStore()
  const THEMES = THEME_LIST.map(([th, label, sw]) => [th, tr(label), sw] as [Theme, string, string[]])
  const { provider, setProvider, claudeApiKey, setClaudeApiKey, openaiApiKey, setOpenaiApiKey, grokApiKey, setGrokApiKey, geminiApiKey, setGeminiApiKey, model, setModel, localUrl, setLocalUrl } = useAIStore()
  const [tab, setTab] = useState<SettingsTab>(() => {
    const wanted = sessionStorage.getItem('ams-settings-tab') as SettingsTab | null
    sessionStorage.removeItem('ams-settings-tab')
    return wanted ?? 'general'
  })
  const [showKey, setShowKey] = useState(false)
  const closeSettings = useUIStore((s) => s.closeSettings)

  const handleLanguageChange = (code: string) => {
    setLanguage(code)
    i18n.changeLanguage(code)
    localStorage.setItem('ams-language', code)
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)', position: 'relative' }}>
      {/* Close button (Esc and a second click on the Settings icon also close it) */}
      <button
        onClick={closeSettings}
        title={tr('Close settings (Esc)')}
        aria-label={tr('Close settings')}
        style={{
          position: 'absolute', top: 10, right: 14, zIndex: 5, width: 30, height: 30, borderRadius: 8,
          border: '1px solid var(--border-mid)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 16, lineHeight: 1,
        }}
      >✕</button>

      {/* Tab nav */}
      <div style={{ width: 160, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, padding: '0 6px' }}>{t('settings.title')}</div>
        {(['general', 'plugins', 'ai', 'engines', 'hardware', 'models', 'shortcuts', 'audio', 'midi', 'appearance', 'updates', 'about'] as SettingsTab[]).map(tab2 => (
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
            {TAB_EN[tab2] ? tr(TAB_EN[tab2]) : t(`settings.${tab2}`)}
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
              <button style={smallBtnStyle} onClick={() => setTab('plugins')}>{tr('VST plugins: folders and search →')}</button>
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.ai')}</div>
            <div>
              <label style={labelStyle}>{t('settings.aiProvider')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['claude', 'openai', 'gemini', 'grok', 'ollama', 'local'] as AIProvider[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: `1px solid ${provider === p ? 'var(--accent)' : 'var(--border)'}`,
                      background: provider === p ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-secondary)',
                      color: provider === p ? 'var(--accent-light)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: provider === p ? 600 : 400
                    }}
                  >
                    {p === 'claude' ? tr('Claude (Anthropic)') : p === 'openai' ? tr('ChatGPT (OpenAI)') : p === 'grok' ? tr('Grok (xAI)') : p === 'gemini' ? tr('Gemini (Google)') : p === 'ollama' ? tr('Ollama (free, on this PC)') : tr('Local server (LM Studio, KoboldCpp, llama.cpp)')}
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
                      placeholder={tr('sk-ant-...')}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? tr('Hide') : tr('Show')}</button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <ModelPicker models={CLAUDE_MODELS} value={model} onChange={setModel} />
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
                      placeholder={tr('sk-...')}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? tr('Hide') : tr('Show')}</button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <ModelPicker models={OPENAI_MODELS} value={model} onChange={setModel} />
                </div>
              </>
            )}

            {provider === 'gemini' && (
              <>
                <div>
                  <label style={labelStyle}>{tr('Gemini API key (Google)')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type={showKey ? 'text' : 'password'} value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder={tr('AIza...')} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? tr('Hide') : tr('Show')}</button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    {tr('Create a key at aistudio.google.com (Get API key). Google offers a free tier with limits per minute and\n                    per day. If a model name no longer exists, choose "Other model ID" and enter a current one.')}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <ModelPicker models={GEMINI_MODELS} value={model} onChange={setModel} />
                </div>
              </>
            )}

            {provider === 'grok' && (
              <>
                <div>
                  <label style={labelStyle}>{tr('Grok API key (xAI)')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type={showKey ? 'text' : 'password'} value={grokApiKey} onChange={e => setGrokApiKey(e.target.value)}
                      placeholder={tr('xai-...')} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => setShowKey(s => !s)} style={smallBtnStyle}>{showKey ? tr('Hide') : tr('Show')}</button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    {tr('Create a key at console.x.ai. New xAI accounts have often received free starter credits; check your\n                    credit balance there. If a model name no longer exists, choose "Other model ID" and enter a current one.')}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <ModelPicker models={GROK_MODELS} value={model} onChange={setModel} />
                </div>
              </>
            )}

            {provider === 'ollama' && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <b>{tr('Completely free, no account, no key:')}</b> {tr('Ollama runs an AI model on your own PC.')}
                  <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    <li>{tr('Install Ollama from ollama.com (Windows installer).')}</li>
                    <li>{tr('Open a command prompt once and type')} <code>{tr('ollama pull llama3.2')}</code> {tr('(about 2 GB).')}</li>
                    <li>{tr('Keep Ollama running; choose the same model below.')}</li>
                  </ol>
                  {tr('Answers come slower than from the cloud on a PC without a strong graphics card, and small models know less.')}
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <ModelPicker models={OLLAMA_MODELS} value={model} onChange={setModel} />
                </div>
              </>
            )}

            {provider === 'local' && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <b>{tr('Free, on this PC, also on older AMD graphics cards:')}</b> {tr('any program that offers an OpenAI-compatible\n                  server works. LM Studio and KoboldCpp run models on the graphics card through')} <b>{tr('Vulkan')}</b>{tr(', which also works on\n                  cards that ROCm and CUDA do not support (for example an AMD Radeon R9 290 with 4 GB: small models of 1 to 3\n                  billion parameters, 4-bit GGUF files of up to about 2.5 GB).')}
                  <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    <li>{tr('Install LM Studio (lmstudio.ai) or KoboldCpp (github.com/LostRuins/koboldcpp, file koboldcpp.exe).')}</li>
                    <li>{tr('Choose')} <b>{tr('Vulkan')}</b> {tr('as backend (LM Studio: runtime "Vulkan llama.cpp"; KoboldCpp: preset "Use Vulkan") and load a small GGUF model.')}</li>
                    <li>{tr('Start the server (LM Studio: Developer → Start Server; KoboldCpp starts it by itself), then choose the address below.')}</li>
                  </ol>
                </div>
                <div>
                  <label style={labelStyle}>{tr('Server address')}</label>
                  <input value={localUrl} onChange={e => setLocalUrl(e.target.value.trim())} placeholder={tr('http://127.0.0.1:1234/v1')} style={inputStyle} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {[['LM Studio', 'http://127.0.0.1:1234/v1'], ['KoboldCpp', 'http://127.0.0.1:5001/v1'], ['llama.cpp server', 'http://127.0.0.1:8080/v1']].map(([n, u]) => (
                      <button key={n} onClick={() => setLocalUrl(u)} style={{ ...smallBtnStyle, fontWeight: localUrl === u ? 700 : 400 }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('settings.model')}</label>
                  <input value={model} onChange={e => setModel(e.target.value)} placeholder={tr('local-model')} style={inputStyle} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{tr('The model loaded in the server; most servers answer with the loaded model whatever name is given here.')}</div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'audio' && <AudioTab />}

        {tab === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={sectionStyle}>{t('settings.appearance')}</div>
            <div>
              <label style={labelStyle}>{t('settings.theme')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, maxWidth: 820 }}>
                {THEMES.map(([th, label, sw]) => (
                  <button key={th} onClick={() => setTheme(th)}
                    style={{
                      padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${theme === th ? 'var(--accent)' : 'var(--border-mid)'}`, background: 'var(--bg-secondary)'
                    }}>
                    {/* a small picture of the look: background, panel, accent */}
                    <div style={{ height: 54, background: sw[0], display: 'flex', alignItems: 'flex-end', gap: 4, padding: 6 }}>
                      <div style={{ flex: 1, height: 26, background: sw[1], border: `1px solid ${sw[3]}` }} />
                      <div style={{ width: 22, height: 22, borderRadius: th === 'swiss' ? 0 : 11, background: sw[2] }} />
                    </div>
                    <div style={{ padding: '6px 10px', fontSize: 12, color: theme === th ? 'var(--accent-light)' : 'var(--text-secondary)', fontWeight: theme === th ? 700 : 500 }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'updates' && <UpdatesTab />}
        {tab === 'plugins' && <PluginsTab />}
        {tab === 'about' && <AboutTab />}
        {tab === 'engines' && <EnginesTab />}
        {tab === 'hardware' && <HardwareTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'midi' && <MidiTab />}
      </div>
    </div>
  )
}

const sectionStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { width: '100%', maxWidth: 400, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }
const smallBtnStyle: React.CSSProperties = { padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }

// About: what the project is, where it lives, and a friendly ask for a GitHub star
function AboutTab(): React.ReactElement {
  const link = (page: 'home' | 'releases' | 'issues' | 'newIssue' | 'discussions' | 'donate', text: string, primary = false): React.ReactElement => (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void window.api.shell.openProject(page)}>{text}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <img src={logo} alt="AI Music Studio" style={{ width: 84, height: 84, borderRadius: 18 }} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>{tr('AI Music Studio')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tr('Version')} {__APP_VERSION__} {tr('· free and open source (GPL-3.0)')}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {tr('AI Music Studio is a free music studio for Windows: a DAW with Studio, mixer and piano roll, and AI music\n        generation that runs on your own computer. Describe a style, write lyrics and make songs or seamless loops,\n        without a cloud service or a subscription. Your music and lyrics stay on your PC.')}
      </div>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('⭐ Do you like AI Music Studio?')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {tr('Give it a star on GitHub. It takes a second (with a free GitHub account), helps other musicians find the\n          project and shows that it is worth working on.')}
        </div>
        <div>{link('home', '⭐ Star on GitHub', true)}</div>
      </div>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('❤ Support the project')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {tr('AI Music Studio is free and stays free. If it is useful to you, a small donation helps to keep it going:\n          new features, more AI models and code signing for the installer.')}
        </div>
        <div>{link('donate', '❤ Donate with PayPal', true)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {link('home', 'Project page')}
        {link('releases', 'All versions')}
        {link('newIssue', 'Report a problem')}
        {link('issues', 'Known issues')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('github.com/pierrecinema/ai-music-studio')}</div>
    </div>
  )
}
