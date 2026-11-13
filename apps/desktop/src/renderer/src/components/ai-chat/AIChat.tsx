import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { apiKeyFor, PROVIDER_LABEL, useAIStore } from '../../stores/ai.store'
import { useProjectStore } from '../../stores/project.store'
import { api } from '../../lib/api'
import { useMusicJob } from '../../stores/musicJob.store'
import { useUIStore } from '../../stores/ui.store'
import { importAudioFiles } from '../timeline/Timeline'

interface AIChatProps {
  compact?: boolean
}

export function AIChat({ compact = false }: AIChatProps): React.ReactElement {
  const { t } = useTranslation()
  const { provider, messages, isThinking, addMessage, setThinking, model } = useAIStore()
  const { project } = useProjectStore()
  const [input, setInput] = useState('')
  const [chatJob, setChatJob] = useState<string | null>(null)
  const job = useMusicJob((s) => s.job)
  const shownJob = job && job.id === chatJob ? job : null
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const projectContext = `Current project: "${project.name}", BPM: ${project.bpm}, Tracks: ${project.tracks.length}, Time sig: ${project.timeSignature.join('/')}`

  const send = async () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    addMessage({ role: 'user', content: text })
    setThinking(true)
    try {
      const apiKey = apiKeyFor(useAIStore.getState())
      let musicEngine = ''
      try { musicEngine = localStorage.getItem('ams-last-engine') ?? '' } catch { /* no storage */ }
      const r = await api.ai.chat({
        provider,
        apiKey,
        model,
        messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: text }],
        systemContext: projectContext,
        baseUrl: useAIStore.getState().localUrl,
        musicEngine
      })
      addMessage({ role: 'assistant', content: r.reply || '…' })
      // a song the AI started: its progress shows here and in the status bar, like one from Create music
      if (r.jobs.length) { setChatJob(r.jobs[r.jobs.length - 1]); useMusicJob.getState().track(r.jobs[r.jobs.length - 1]) }
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `Error: ${err.message ?? 'Unknown error'}` })
    } finally {
      setThinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const SUGGESTIONS = [
    t('aiChat.suggestions.1'),
    t('aiChat.suggestions.2'),
    t('aiChat.suggestions.3'),
    t('aiChat.suggestions.4'),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>✦</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('aiChat.title')}</span>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 10,
          padding: '2px 7px',
          borderRadius: 10,
          background: provider === 'claude' ? '#7c3aed22' : '#10a37f22',
          color: provider === 'claude' ? 'var(--accent-light)' : '#10a37f',
          border: `1px solid ${provider === 'claude' ? '#7c3aed44' : '#10a37f44'}`,
          fontWeight: 600
        }}>
          {PROVIDER_LABEL[provider]}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 10px' }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>
              AI music assistant ready. Try:
            </div>
            {SUGGESTIONS.map((s, i) => (
              <div
                key={i}
                onClick={() => { setInput(s); inputRef.current?.focus() }}
                style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: 6, padding: '7px 10px', marginBottom: 5, cursor: 'pointer', border: '1px solid var(--border)' }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 10,
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              maxWidth: '86%',
              padding: '8px 10px',
              borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-primary)',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              fontSize: 12,
              lineHeight: 1.5,
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isThinking && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 10px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent)',
                animation: `pulse 1s ${i * 0.2}s infinite`
              }} />
            ))}
          </div>
        )}
        {shownJob && (
          // a song the AI is making: progress, then into the Studio or the Library
          <div style={{ margin: '4px 0', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'var(--bg-primary)', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>🎵 {shownJob.status === 'done' ? `Ready: ${shownJob.results.length} song(s) in the Library`
              : shownJob.status === 'error' ? `The song could not be made: ${shownJob.error ?? ''}`
              : shownJob.status === 'cancelled' ? 'Cancelled'
              : `Making the song… ${shownJob.stage_text ?? ''}${shownJob.step && shownJob.step_total ? ` ${Math.round((shownJob.step / shownJob.step_total) * 100)} %` : ''}`}</span>
            {shownJob.status === 'done' && shownJob.results.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => void (async () => {
                  for (const res of shownJob.results) await importAudioFiles([res.audio_file], { startBeat: 0 })
                  useUIStore.getState().setActiveView('timeline')
                })()}>Add to the Studio</button>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => useUIStore.getState().setActiveView('library')}>Open Library</button>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('aiChat.placeholder')}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            padding: '7px 10px',
            fontSize: 12,
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || isThinking}
          style={{
            width: 32,
            height: 32,
            alignSelf: 'flex-end',
            background: input.trim() && !isThinking ? 'var(--accent)' : 'var(--bg-hover)',
            border: 'none',
            borderRadius: 6,
            cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
