import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

export function VideoComposer(): React.ReactElement {
  const { t } = useTranslation()
  const [videoFile, setVideoFile] = useState<string | null>(null)
  const [videoName, setVideoName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [sceneAnalysis, setSceneAnalysis] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const handleBrowse = async () => {
    const path = await window.api.dialog.openVideo()
    if (path) {
      setVideoFile(path)
      setVideoName(path.split('\\').pop() ?? path)
      setSceneAnalysis(null)
      setGenerated(false)
    }
  }

  const handleAnalyze = async () => {
    if (!videoFile) return
    setIsAnalyzing(true)
    try {
      const r = await api.video.analyze({ filePath: videoFile })
      setSceneAnalysis(r.description)
    } catch (err) {
      console.error('Video analysis failed:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (!videoFile) return
    setIsGenerating(true)
    try {
      await api.video.generateScore({ filePath: videoFile, prompt, sceneAnalysis: sceneAnalysis ?? '' })
      setGenerated(true)
    } catch (err) {
      console.error('Score generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{t('videoComposer.title')}</div>

      {/* Video drop zone */}
      <div
        onClick={handleBrowse}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 10,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          background: 'var(--bg-secondary)'
        }}
      >
        <span style={{ fontSize: 36 }}>🎬</span>
        {videoName
          ? <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{videoName}</span>
          : <>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('videoComposer.dropVideo')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MP4, MOV, AVI, MKV</span>
            </>
        }
      </div>

      {videoFile && (
        <>
          {/* Scene Analysis */}
          <div>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              style={{ padding: '7px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 5, cursor: 'pointer', fontSize: 12, marginBottom: 10 }}
            >
              {isAnalyzing ? 'Analyzing...' : t('videoComposer.analyzeScene')}
            </button>
            {sceneAnalysis && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Scene Analysis</div>
                {sceneAnalysis}
              </div>
            )}
          </div>

          {/* Prompt */}
          <div>
            <div style={labelStyle}>Music Style Prompt</div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('videoComposer.prompt')}
              style={{
                width: '100%',
                height: 70,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '8px 10px',
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{ padding: '9px 20px', background: isGenerating ? 'var(--bg-hover)' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: isGenerating ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              {isGenerating ? 'Generating...' : t('videoComposer.generateMusic')}
            </button>
          </div>

          {generated && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)', borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--success)', fontSize: 18 }}>✓</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>Score generated!</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Tracks added to the Studio. Export when ready.</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
