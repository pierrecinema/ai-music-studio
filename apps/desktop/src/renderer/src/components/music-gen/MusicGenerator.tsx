import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Lora, type MusicJob, type Resources } from '../../lib/api'
import { AudioFile } from '../common/AudioFile'

const PRESETS = ['lofi chill beats', 'cinematic orchestral', 'synthwave 80s', 'acoustic folk', 'deep house 124 bpm']

export function MusicGenerator(): React.ReactElement {
  const [prompt, setPrompt] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [duration, setDuration] = useState(60)
  const [steps, setSteps] = useState(40)
  const [loras, setLoras] = useState<Lora[]>([])
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [engine, setEngine] = useState<boolean | null>(null)
  const [res, setRes] = useState<Resources | null>(null)
  const [job, setJob] = useState<MusicJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importPath, setImportPath] = useState('')
  const [importKind, setImportKind] = useState<Lora['kind']>('style')
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.music.status(), api.music.loras()])
      setEngine(s.engine_installed)
      setRes(s.resources)
      setLoras(l.loras)
    } catch {
      setError('Backend not reachable on port 8765')
    }
  }, [])

  useEffect(() => { refresh(); return () => { if (timer.current) clearInterval(timer.current) } }, [refresh])

  const maxDur = res?.max_duration_s ?? 600
  const busy = job?.status === 'queued' || job?.status === 'running'

  const generate = async () => {
    setError(null)
    setJob(null)
    try {
      const { jobId } = await api.music.generate({
        prompt, lyrics, duration: Math.min(duration, maxDur), steps, instrumental,
        loras: Object.entries(selected).map(([id, strength]) => ({ id, strength })),
      })
      setJob({ id: jobId, status: 'queued', warnings: [] })
      timer.current = window.setInterval(async () => {
        const j = await api.music.job(jobId)
        setJob(j)
        if (j.status === 'done' || j.status === 'error') {
          if (timer.current) clearInterval(timer.current)
        }
      }, 1500)
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const importLora = async () => {
    if (!importPath.trim()) return
    try {
      await api.music.importLora({ path: importPath.trim(), kind: importKind })
      setImportPath('')
      refresh()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const toggle = (id: string) =>
    setSelected(s => {
      const n = { ...s }
      if (id in n) delete n[id]; else n[id] = 1
      return n
    })

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="panel-header" style={{ padding: 0, border: 'none' }}>Music Generator (ACE-Step)</div>

        {res && (
          <div style={{ fontSize: 11, color: res.low_memory ? 'var(--orange)' : 'var(--green)' }}>
            {res.vram_gb || '?'} GB VRAM / {res.ram_gb} GB RAM — {res.low_memory ? 'low-memory mode' : 'full quality'},
            {' '}{res.quant}, max {res.max_duration_s}s
          </div>
        )}
        {engine === false && (
          <div style={{ fontSize: 11, color: 'var(--yellow)' }}>
            ACE-Step is not installed. Results are silent placeholders until you run:
            {' '}<code>pip install git+https://github.com/ace-step/ACE-Step.git</code>
          </div>
        )}

        <textarea
          value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
          placeholder="Describe the song: genre, mood, instruments, tempo…"
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p} className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => setPrompt(p)}>{p}</button>
          ))}
        </div>

        <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={instrumental} onChange={e => setInstrumental(e.target.checked)} />
          Instrumental
        </label>
        {!instrumental && (
          <textarea
            value={lyrics} onChange={e => setLyrics(e.target.value)} rows={7}
            placeholder={'[verse]\nYour lyrics here…\n\n[chorus]\n…'}
          />
        )}

        <div style={{ display: 'flex', gap: 16, fontSize: 11, alignItems: 'center' }}>
          <label>Length: {Math.min(duration, maxDur)}s
            <input type="range" min={10} max={maxDur} value={Math.min(duration, maxDur)}
              onChange={e => setDuration(+e.target.value)} style={{ display: 'block' }} />
          </label>
          <label>Steps: {steps}
            <input type="range" min={8} max={100} value={steps}
              onChange={e => setSteps(+e.target.value)} style={{ display: 'block' }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={!prompt.trim() || busy} onClick={generate}>
            {busy ? `Generating… (${job?.status})` : 'Generate song'}
          </button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 11 }}>{error}</div>}
        {job?.status === 'error' && <div style={{ color: 'var(--red)', fontSize: 11 }}>{job.error}</div>}
        {job?.warnings?.map((w, i) => <div key={i} style={{ color: 'var(--yellow)', fontSize: 11 }}>{w}</div>)}
        {job?.status === 'done' && job.audio_file && <AudioFile path={job.audio_file} label="Result" />}
      </div>

      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="panel-header" style={{ padding: 0, border: 'none' }}>LoRA — styles, artists, sounds</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Small add-ons that teach the model a style, artist or sound. The engine applies one LoRA per render.
        </div>

        <div className="panel" style={{ maxHeight: 220, overflow: 'auto' }}>
          {loras.length === 0 && (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              No LoRAs installed yet. Import a .safetensors file or folder below.
            </div>
          )}
          {loras.map(l => (
            <div key={l.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <input type="checkbox" checked={l.id in selected} onChange={() => toggle(l.id)} />
                <span style={{ flex: 1 }}>{l.name}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{l.kind}</span>
              </label>
              {l.id in selected && (
                <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  Strength {selected[l.id].toFixed(2)}
                  <input type="range" min={0} max={2} step={0.05} value={selected[l.id]}
                    onChange={e => setSelected(s => ({ ...s, [l.id]: +e.target.value }))}
                    style={{ width: '100%' }} />
                </label>
              )}
            </div>
          ))}
        </div>

        <input value={importPath} onChange={e => setImportPath(e.target.value)}
          placeholder="Path to LoRA file or folder" />
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={importKind} onChange={e => setImportKind(e.target.value as Lora['kind'])}>
            <option value="style">Style</option>
            <option value="artist">Artist</option>
            <option value="sound">Sound</option>
          </select>
          <button className="btn btn-ghost" onClick={importLora}>Import LoRA</button>
        </div>
      </div>
    </div>
  )
}
