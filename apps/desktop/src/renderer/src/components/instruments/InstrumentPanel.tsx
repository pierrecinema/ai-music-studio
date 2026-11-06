import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'

const INSTRUMENTS = [
  { id: 'strings-violin', name: 'Violin', category: 'Strings', description: 'Solo violin with expressive articulations' },
  { id: 'strings-viola', name: 'Viola', category: 'Strings', description: 'Rich, warm viola timbre' },
  { id: 'strings-cello', name: 'Cello', category: 'Strings', description: 'Deep, resonant cello' },
  { id: 'strings-section', name: 'String Section', category: 'Strings', description: 'Full orchestral string ensemble' },
  { id: 'brass-trumpet', name: 'Trumpet', category: 'Brass', description: 'Bright, powerful trumpet' },
  { id: 'brass-trombone', name: 'Trombone', category: 'Brass', description: 'Warm, mellow trombone' },
  { id: 'brass-horn', name: 'French Horn', category: 'Brass', description: 'Rich French horn' },
  { id: 'woodwind-sax-alto', name: 'Alto Saxophone', category: 'Woodwind', description: 'Expressive alto sax' },
  { id: 'woodwind-clarinet', name: 'Clarinet', category: 'Woodwind', description: 'Classical clarinet' },
  { id: 'woodwind-flute', name: 'Flute', category: 'Woodwind', description: 'Delicate flute tones' },
  { id: 'ethnic-duduk', name: 'Duduk', category: 'Ethnic', description: 'Armenian duduk, haunting and expressive' },
  { id: 'ethnic-dizi', name: 'Dizi', category: 'Ethnic', description: 'Chinese bamboo flute' },
]

export function InstrumentPanel(): React.ReactElement {
  const { t } = useTranslation()
  const { project, selectedTrackId } = useProjectStore()
  const [filterCategory, setFilterCategory] = useState('all')
  const [selected, setSelected] = useState(INSTRUMENTS[0])
  const [isGenerating, setIsGenerating] = useState(false)
  const [ensembleMode, setEnsembleMode] = useState(false)

  const categories = [...new Set(INSTRUMENTS.map(i => i.category))]
  const filtered = INSTRUMENTS.filter(i => filterCategory === 'all' || i.category === filterCategory)
  const track = project.tracks.find(t => t.id === selectedTrackId && t.type === 'instrument')

  const handleGenerate = async () => {
    if (!track) return
    setIsGenerating(true)
    try {
      const clip = track.clips[0]
      if (!clip?.notes?.length) return
      await api.instruments.generate({ instrumentId: selected.id, notes: clip.notes })
    } catch (err) {
      console.error('Instrument generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Library */}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{t('instruments.select')}</div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{t(`instruments.${c.toLowerCase()}`) || c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map(inst => (
            <div
              key={inst.id}
              onClick={() => setSelected(inst)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected.id === inst.id ? 'rgba(37,99,235,0.15)' : 'transparent',
                borderLeft: selected.id === inst.id ? '3px solid var(--track-instrument)' : '3px solid transparent'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{inst.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{inst.category}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{selected.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selected.description}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="ensemble" checked={ensembleMode} onChange={e => setEnsembleMode(e.target.checked)} style={{ accentColor: 'var(--track-instrument)' }} />
          <label htmlFor="ensemble" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('instruments.ensemble')}</label>
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>AI Model Info</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Backend: DDSP-based neural synthesis<br />
            Articulations: auto-detected from MIDI velocity and pitch<br />
            Latency: ~2-5s generation (local GPU)
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !track}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 20px',
            background: isGenerating ? 'var(--bg-hover)' : 'var(--track-instrument)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: isGenerating ? 'wait' : 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {isGenerating ? 'Generating...' : t('instruments.generate')}
        </button>
        {!track && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select an instrument track first</span>
        )}
      </div>
    </div>
  )
}
