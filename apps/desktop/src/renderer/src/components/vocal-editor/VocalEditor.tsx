import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../stores/project.store'
import { api } from '../../lib/api'

const VOICES = [
  { id: 'v001', name: 'Aria', language: 'en', gender: 'female', category: 'Pop' },
  { id: 'v002', name: 'Marco', language: 'en', gender: 'male', category: 'Pop' },
  { id: 'v003', name: 'Sakura', language: 'ja', gender: 'female', category: 'J-Pop' },
  { id: 'v004', name: 'Luna', language: 'es', gender: 'female', category: 'Latin' },
  { id: 'v005', name: 'Kai', language: 'ko', gender: 'male', category: 'K-Pop' },
  { id: 'v006', name: 'Elena', language: 'it', gender: 'female', category: 'Opera' },
  { id: 'v007', name: 'Chen', language: 'zh', gender: 'male', category: 'Mandopop' },
  { id: 'v008', name: 'Baptiste', language: 'fr', gender: 'male', category: 'Chanson' },
]

const LANG_LABELS: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', pt: 'Português', zh: '中文', ja: '日本語', ko: '한국어'
}

export function VocalEditor(): React.ReactElement {
  const { t } = useTranslation()
  const { project, selectedTrackId, updateTrack } = useProjectStore()
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0])
  const [filterLang, setFilterLang] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [lyrics, setLyrics] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [controls, setControls] = useState({ power: 0.8, breathiness: 0.3, vibrato: 0.5, pitch: 0 })

  const track = project.tracks.find(t => t.id === selectedTrackId && t.type === 'vocal')

  const categories = [...new Set(VOICES.map(v => v.category))]
  const filtered = VOICES.filter(v =>
    (filterLang === 'all' || v.language === filterLang) &&
    (filterCategory === 'all' || v.category === filterCategory)
  )

  const handleGenerate = async () => {
    if (!track) return
    setIsGenerating(true)
    try {
      const clip = track.clips[0]
      if (!clip?.notes?.length) return
      await api.vocal.generate({
        voiceId: selectedVoice.id,
        notes: clip.notes,
        lyrics,
        controls
      })
    } catch (err) {
      console.error('Vocal generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Voice Library */}
      <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{t('vocal.selectVoice')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={selectStyle}>
              <option value="all">{t('vocal.language')}: All</option>
              {Object.entries(LANG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
              <option value="all">Category: All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map(voice => (
            <div
              key={voice.id}
              onClick={() => setSelectedVoice(voice)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selectedVoice.id === voice.id ? 'rgba(124,58,237,0.15)' : 'transparent',
                borderLeft: selectedVoice.id === voice.id ? '3px solid var(--accent)' : '3px solid transparent'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{voice.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {LANG_LABELS[voice.language]} · {voice.category} · {voice.gender}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('sidebar.vocalEditor')} — {selectedVoice.name}
        </div>

        {/* Lyrics */}
        <div>
          <label style={labelStyle}>{t('vocal.lyrics')}</label>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Enter lyrics here, one line per note group..."
            style={{
              width: '100%',
              height: 80,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              padding: '8px 10px',
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        </div>

        {/* Vocal Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(Object.entries(controls) as [keyof typeof controls, number][]).map(([key, val]) => (
            <div key={key}>
              <label style={labelStyle}>{t(`vocal.${key}`)}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="range"
                  min={key === 'pitch' ? -12 : 0}
                  max={key === 'pitch' ? 12 : 1}
                  step={key === 'pitch' ? 1 : 0.01}
                  value={val}
                  onChange={(e) => setControls(c => ({ ...c, [key]: parseFloat(e.target.value) }))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>
                  {key === 'pitch' ? `${val > 0 ? '+' : ''}${val}` : Math.round(val * 100) + '%'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Generate */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !track}
            style={{
              padding: '8px 20px',
              background: isGenerating ? 'var(--bg-hover)' : 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: isGenerating ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {isGenerating ? t('vocal.generating') : t('vocal.generate')}
          </button>
          {!track && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              Select a vocal track in the Studio first
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  marginBottom: 4,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 11,
  cursor: 'pointer'
}
