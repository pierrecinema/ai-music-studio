import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type EngineState, type MusicEngineInfo, type MusicJob, type Resources, type Usage } from '../../lib/api'
import { useAIStore } from '../../stores/ai.store'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { AudioFile } from '../common/AudioFile'
import { LoraBrowser } from './LoraBrowser'
import { TrainLora } from './TrainLora'
import { useMusicJob } from '../../stores/musicJob.store'
import {
  DEFAULT_PARAMS, GENRES, KEYS, LANGUAGES, LAYERS, TIME_SIGNATURES, toRequest,
  type MusicParams
} from './params'

// ─── small UI building blocks ────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10, overflow: 'hidden',
  flexShrink: 0   // a scrolling flex column must not squash the cards
}
const cardBody: React.CSSProperties = { padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }
const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)'
}
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }
const full: React.CSSProperties = { width: '100%' }

function Card({ title, actions, children }: {
  title: string; actions?: React.ReactNode; children: React.ReactNode
}): React.ReactElement {
  return (
    <section style={card}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)'
      }}>
        <span style={label}>{title}</span>
        <span style={{ display: 'flex', gap: 6 }}>{actions}</span>
      </header>
      <div style={cardBody}>{children}</div>
    </section>
  )
}

function IconBtn({ title, onClick, children, disabled }: {
  title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean
}): React.ReactElement {
  return (
    <button
      className="btn btn-ghost" title={title} onClick={onClick} disabled={disabled}
      style={{ padding: '2px 8px', fontSize: 13 }}
    >{children}</button>
  )
}

function Field({ name, children, hintText }: {
  name: string; children: React.ReactNode; hintText?: string
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={label}>{name}</span>
      {children}
      {hintText && <span style={hint}>{hintText}</span>}
    </div>
  )
}

function Toggle({ name, hintText, checked, onChange }: {
  name: string; hintText?: string; checked: boolean; onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={label}>{name}</span>
        {hintText && <span style={hint}>{hintText}</span>}
      </div>
      <button
        role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: '1px solid var(--border-mid)', flexShrink: 0,
          background: checked ? 'var(--accent)' : 'var(--bg-tertiary)', position: 'relative', cursor: 'pointer'
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 120ms'
        }} />
      </button>
    </div>
  )
}

function SliderRow({ name, value, min, max, step, onChange, digits = 2, hintText }: {
  name: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; digits?: number; hintText?: string
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={label}>{name}</span>
        <input
          type="number" value={Number.isFinite(value) ? Number(value.toFixed(digits)) : 0}
          min={min} max={max} step={step}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }}
          style={{ width: 76, textAlign: 'right', padding: '3px 8px' }}
        />
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ ...full, padding: 0, accentColor: 'var(--accent)' }} />
      {hintText && <span style={hint}>{hintText}</span>}
    </div>
  )
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: Array<string | { value: string; label: string }>; placeholder?: string
}): React.ReactElement {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={full}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o) => (
        <button
          key={o.value} onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: `1px solid ${value === o.value ? 'var(--accent)' : 'var(--border-mid)'}`,
            background: value === o.value ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
            color: value === o.value ? 'var(--accent-light)' : 'var(--text-secondary)',
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

function FilePick({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}): React.ReactElement {
  const browse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) onChange(paths[0])
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="btn btn-ghost" onClick={browse} style={{ flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}>
        <span className="truncate" style={{ maxWidth: 260 }}>
          {value ? value.split(/[\\/]/).pop() : placeholder}
        </span>
      </button>
      {value && <IconBtn title="Clear" onClick={() => onChange('')}>×</IconBtn>}
    </div>
  )
}

// ─── AI helper (uses the provider/key from Settings → AI) ────────────────────

async function askAI(system: string, user: string): Promise<string> {
  const { provider, claudeApiKey, openaiApiKey, model } = useAIStore.getState()
  const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey
  if (!apiKey) throw new Error('Add an API key in Settings → AI first.')
  return api.ai.chat({
    provider, apiKey, model, systemContext: system,
    messages: [{ role: 'user', content: user }],
  })
}

// ─── main component ──────────────────────────────────────────────────────────

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// What is happening right now, so a long wait does not look like a freeze.
function ProgressPanel({ job }: { job: MusicJob }): React.ReactElement {
  const [now, setNow] = useState(Date.now())
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id) }, [])
  useEffect(() => {
    let alive = true
    const tick = (): void => { api.system.usage().then((u) => { if (alive) setUsage(u) }).catch(() => { /* busy */ }) }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])
  const started = (job.started ?? job.created ?? now / 1000) * 1000
  const elapsed = Math.max(0, (now - started) / 1000)
  const known = job.step_total ? Math.min(1, (job.step ?? 0) / job.step_total) : null
  const songs = job.progress && job.progress.total > 1 ? job.progress : null
  const overall = known === null ? null : songs ? (songs.done + known) / songs.total : known
  // seconds left, only once there is enough to extrapolate from
  const stageElapsed = job.stage_started ? Math.max(0, now / 1000 - job.stage_started) : 0
  const eta = known !== null && known > 0.05 && stageElapsed > 3 ? (stageElapsed / known) * (1 - known) : null
  const quiet = job.updated ? (now / 1000 - job.updated) : 0
  const stages: Array<[string, string]> = [['load', 'Load model'], ['prepare', 'Prepare'], ['render', 'Render'], ['finish', 'Save']]
  const at = Math.max(0, stages.findIndex(([k]) => k === job.stage))
  return (
    <div style={{ border: '1px solid var(--border-mid)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, fontSize: 11, flexWrap: 'wrap' }}>
        {stages.map(([k, name], i) => (
          <span key={k} style={{ padding: '2px 8px', borderRadius: 10,
            background: i === at ? 'var(--accent)' : 'var(--bg-elevated)',
            color: i === at ? '#fff' : i < at ? 'var(--green)' : 'var(--text-muted)' }}>
            {i < at ? '✓ ' : ''}{name}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{job.stage_text ?? 'Starting…'}</div>
      <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        {overall !== null ? (
          <div style={{ height: '100%', width: `${Math.round(overall * 100)}%`, background: 'var(--accent)', transition: 'width 400ms' }} />
        ) : (
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'var(--accent)', borderRadius: 4,
            animation: 'ams-indeterminate 1.4s ease-in-out infinite' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap', gap: 6 }}>
        <span>
          {known !== null ? `${Math.round(known * 100)}%` : 'Working…'}
          {songs ? ` · song ${Math.min(songs.done + 1, songs.total)} of ${songs.total}` : ''}
          {eta !== null ? ` · about ${mmss(eta)} left` : ''}
        </span>
        <span>Running {mmss(elapsed)}</span>
      </div>
      {job.device && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{job.device}</div>}
      {usage && (
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>CPU {Math.round(usage.cpu_percent)}% (engine {Math.round(usage.engine_cpu_percent)}%)</span>
          <span>RAM {usage.ram_used_gb} of {usage.ram_total_gb} GB ({Math.round(usage.ram_percent)}%)</span>
          {usage.swap_percent > 30 && <span style={{ color: 'var(--orange)' }}>Memory is full: the PC is swapping to disk, expect it to crawl.</span>}
        </div>
      )}
      {job.downloaded_mb !== undefined && job.downloaded_mb > 1 && job.stage === 'load' && (
        <div style={hint}>Downloaded so far: {job.downloaded_mb >= 1024 ? `${(job.downloaded_mb / 1024).toFixed(2)} GB` : `${Math.round(job.downloaded_mb)} MB`}</div>
      )}
      <div style={hint}>
        {job.stage === 'load' || job.stage === 'prepare'
          ? 'The first start loads the music model and can take many minutes on an older PC. Nothing is stuck while this counter runs.'
          : quiet > 60 ? 'No news from the engine for a minute. It is still computing; very long songs on slow hardware pause between steps.'
          : 'Rendering uses the whole computer, so other programs may feel slower meanwhile.'}
        {' '}
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => { sessionStorage.setItem('ams-settings-tab', 'models'); useUIStore.getState().setActiveView('settings') }}>
          Watch downloads in Settings → Models
        </button>
      </div>
    </div>
  )
}

export function CreateMusic(): React.ReactElement {
  const [p, setP] = useState<MusicParams>(DEFAULT_PARAMS)
  const [mode, setMode] = useState<'simple' | 'studio'>('studio')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [engine, setEngine] = useState<EngineState | null>(null)
  const [engineError, setEngineError] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const [res, setRes] = useState<Resources | null>(null)
  const [engines, setEngines] = useState<MusicEngineInfo[]>([])
  const [gpuModels, setGpuModels] = useState<string[]>([])
  const [trainOpen, setTrainOpen] = useState(false)
  const [loras, setLoras] = useState<LoraInfo[]>([])
  const [loraDir, setLoraDir] = useState('')
  const job = useMusicJob((st) => st.job)
  const setJob = useMusicJob.getState().setJob
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [intoProject, setIntoProject] = useState<'none' | 'new'>('none')
  const [chipSeed, setChipSeed] = useState(0)

  const set = useCallback(<K extends keyof MusicParams>(k: K, v: MusicParams[K]) =>
    setP((s) => ({ ...s, [k]: v })), [])

  const refreshLoras = useCallback(async () => {
    const l = await window.api.loras.list()
    setLoras(l.loras)
    setLoraDir(l.dir)
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.music.status()
      setEngine(s.engine_state)
      setEngineError(s.engine_error)
      setRes(s.resources)
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    refreshLoras().catch((e) => setError(String(e)))
    void loadStatus()
    api.music.engines().then((r) => {
      setEngines(r.engines)
      setGpuModels(r.gpu_path ? r.gpu_models : [])
      // first visit on a small PC: start with the model that gives a track in reasonable time
      if (!localStorage.getItem('ams-engine-chosen') && r.recommended) setP((cur) => (cur.engine === 'ace-step' ? { ...cur, engine: r.recommended } : cur))
    }).catch(() => { /* older backend: no picker */ })
  }, [refreshLoras, loadStatus])

  // the first engine check loads PyTorch and takes about half a minute: ask again until it is done
  useEffect(() => {
    if (engine !== 'checking') return
    const id = window.setInterval(() => void loadStatus(), 3000)
    return () => window.clearInterval(id)
  }, [engine, loadStatus])

  const busy = job?.status === 'queued' || job?.status === 'running'
  const count = p.songs * p.variations * p.queue
  const maxDur = res?.max_duration_s ?? 600
  const chips = useMemo(() => {
    const a = [...GENRES]
    let s = chipSeed + 7
    for (let i = a.length - 1; i > 0; i--) {   // seeded shuffle so chips stay stable between renders
      s = (s * 9301 + 49297) % 233280
      const j = Math.floor((s / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a.slice(0, 6)
  }, [chipSeed])

  const addToProject = useCallback((job: MusicJob) => {
    const store = useProjectStore.getState()
    job.results.forEach((r, i) => {
      store.addTrack('audio')
      const tracks = useProjectStore.getState().project.tracks
      const track = tracks[tracks.length - 1]
      const bpm = useProjectStore.getState().project.bpm || 120
      store.updateTrack(track.id, { name: `${p.title || p.prompt.split(',')[0] || 'Song'} ${i + 1}`.trim() })
      store.addClip(track.id, { startTime: 0, duration: (r.duration * bpm) / 60, audioFile: r.audio_file })
    })
    setNotice(`${job.results.length} track(s) added to the project timeline.`)
  }, [p.title, p.prompt])

  // when a job finishes while this screen is open, put the tracks on the timeline if asked
  useEffect(() => {
    if (job?.status !== 'done' || intoProject !== 'new') return
    const st = useMusicJob.getState()
    if (st.handled.includes(job.id)) return
    st.markHandled(job.id)
    addToProject(job)
  }, [job, intoProject, addToProject])

  const create = async () => {
    setError(null); setNotice(null); setJob(null)
    try {
      const body = toRequest(p)
      if (mode === 'simple') body.songs = body.variations = body.queue = 1
      const { jobId } = await api.music.generate(body)
      setJob({ id: jobId, status: 'queued', warnings: [], results: [] })
      useMusicJob.getState().track(jobId)
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const runAI = async (what: string, fn: () => Promise<void>) => {
    setAiBusy(what); setError(null)
    try { await fn() } catch (e) { setError(String((e as Error).message)) } finally { setAiBusy(null) }
  }

  const aiStyle = () => runAI('style', async () => {
    const out = await askAI(
      'You write short style descriptions for an AI music generator: comma-separated genre, mood, instruments, tempo. Reply with the description only.',
      p.prompt.trim() ? `Improve this: ${p.prompt}` : 'Invent an interesting, original style.'
    )
    set('prompt', out.trim())
  })

  const aiLyrics = () => runAI('lyrics', async () => {
    const out = await askAI(
      'You write song lyrics with section tags in brackets: [Verse 1], [Chorus], [Verse 2], [Bridge]. Reply with the lyrics only.',
      `Write lyrics in ${p.language} for this style: ${p.prompt || 'any style'}. ${p.lyrics ? 'Improve these lyrics: ' + p.lyrics : ''}`
    )
    set('lyrics', out.trim())
  })

  const aiMetadata = () => runAI('meta', async () => {
    const out = await askAI(
      'Reply with JSON only, no prose: {"bpm": number, "key": "C major"-style string, "time_signature": "4/4"-style string}.',
      `Pick fitting values for this music: ${p.prompt || 'unspecified'}`
    )
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('The AI reply had no JSON.')
    const j = JSON.parse(m[0]) as { bpm?: number; key?: string; time_signature?: string }
    setP((s) => ({
      ...s,
      bpm: j.bpm ? String(Math.round(j.bpm)) : s.bpm,
      key: j.key && KEYS.includes(j.key) ? j.key : s.key,
      timeSignature: j.time_signature && TIME_SIGNATURES.includes(j.time_signature) ? j.time_signature : s.timeSignature,
    }))
  })

  const importLora = async (mode: 'file' | 'folder') => {
    setError(null)
    const path = await window.api.loras.pick(mode)
    if (!path) return
    const r = await window.api.loras.import(path, 'style')
    if (!r.ok) { setError(r.error); return }
    await refreshLoras()
    set('selectedLoras', { ...p.selectedLoras, [r.lora.id]: 0.75 })
    setNotice(`LoRA "${r.lora.name}" imported.`)
  }

  const onDownloaded = async (lora: LoraInfo) => {
    await refreshLoras()
    setP((s) => ({ ...s, selectedLoras: { ...s.selectedLoras, [lora.id]: 0.75 } }))
    setNotice(`LoRA "${lora.name}" downloaded and selected.`)
  }

  const unusedLoras = loras.filter((l) => !(l.id in p.selectedLoras))
  const studio = mode === 'studio'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <TrainLora open={trainOpen} onClose={() => setTrainOpen(false)} onDone={(id) => { void refreshLoras(); setNotice('LoRA ' + id + ' trained and added to your list.') }} />
      <LoraBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} onImported={(l) => void onDownloaded(l)} />
      {/* ── form ── */}
      <div style={{ width: 560, maxWidth: '58%', flexShrink: 0, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>Create music</div>
            <div style={hint}>ACE-Step · local inference{res ? ` · ${res.quant} · ${res.vram_gb || '?'} GB VRAM / ${res.ram_gb} GB RAM` : ''}</div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, whiteSpace: 'nowrap',
            color: !online ? 'var(--orange)'
              : engine === 'ready' ? 'var(--green)'
              : engine === 'broken' ? 'var(--red)'
              : engine === 'missing' ? 'var(--yellow)' : 'var(--text-secondary)',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-mid)'
          }}>
            {!online ? 'Backend offline'
              : engine === 'ready' ? 'Engine ready'
              : engine === 'broken' ? 'Engine error'
              : engine === 'missing' ? 'Engine not installed' : 'Checking engine…'}
          </span>
        </div>

        {!online && (
          <div style={{ ...hint, color: 'var(--orange)' }}>
            The AI backend is offline. Open Settings → AI Engines and install the core backend. LoRA import works without it.
          </div>
        )}
        {online && engine === 'missing' && (
          <div style={{ ...hint, color: 'var(--yellow)' }}>
            ACE-Step is not installed: results are silent placeholders. Install it in Settings → AI Engines.
          </div>
        )}
        {online && engine === 'broken' && (
          <div style={{ ...hint, color: 'var(--red)' }}>
            ACE-Step is installed but cannot start: {engineError || 'unknown error'}. Songs cannot be generated until this is fixed.
          </div>
        )}
        {online && engine === 'checking' && (
          <div style={hint}>Checking the music engine. The first check loads PyTorch and takes about 30 seconds.</div>
        )}
        {res?.low_memory && (
          <div style={{ ...hint, color: 'var(--orange)' }}>
            Low-memory mode is on: songs up to {Math.round(res.max_duration_s / 60)} minutes work, but longer ones take noticeably more time and memory.
          </div>
        )}

        <Segmented value={mode} onChange={setMode} options={[{ value: 'simple', label: 'Simple' }, { value: 'studio', label: 'Studio' }]} />

        {/* song */}
        <Card title="Song" actions={<>
          <IconBtn title="Improve the style with AI" onClick={aiStyle} disabled={aiBusy !== null}>{aiBusy === 'style' ? '…' : '✨'}</IconBtn>
          <IconBtn title="Reset the form" onClick={() => setP(DEFAULT_PARAMS)}>↺</IconBtn>
        </>}>
          <input
            value={p.title} onChange={(e) => set('title', e.target.value)} placeholder="Untitled"
            style={{ ...full, fontSize: 18, fontWeight: 700, background: 'transparent', border: 'none', padding: '0 0 4px' }}
          />
          {engines.length > 0 && (
            <Field name="Music model" hintText="Each model shows how well your computer runs it. Models marked soon are not built in yet.">
              <select value={p.engine} onChange={(e) => { try { localStorage.setItem('ams-engine-chosen', '1') } catch { /* private mode */ } set('engine', e.target.value) }} style={full}>
                {engines.map((e) => (
                  <option key={e.id} value={e.id} disabled={!e.usable}>
                    {e.name}{e.recommended ? ' (recommended for this PC)' : ''} — {e.kind === 'planned' ? 'soon' : e.status === 'ready' ? 'runs well' : e.status === 'slow' ? 'slow here' : 'not enough memory'}
                  </option>
                ))}
              </select>
              {gpuModels.includes(p.engine) && (
                <select value={p.compute} onChange={(e) => set('compute', e.target.value as MusicParams['compute'])} style={{ ...full, marginTop: 6 }}>
                  <option value="auto">Compute: automatic (graphics card if possible)</option>
                  <option value="gpu">Compute: graphics card (DirectML)</option>
                  <option value="cpu">Compute: processor only</option>
                </select>
              )}
              {(() => {
                const cur = engines.find((e) => e.id === p.engine)
                if (!cur) return null
                return (
                  <div style={{ ...hint, marginTop: 4 }}>
                    {cur.description}{cur.reason ? ` ${cur.reason}` : ''}
                    {cur.license ? ` Licence: ${cur.license}.` : ''}
                    {!cur.vocals ? ' Instrumental only.' : ''}
                  </div>
                )
              })()}
            </Field>
          )}
          <Field name="Style" hintText="A description of the music: genre, mood, instruments, tempo.">
            <textarea value={p.prompt} onChange={(e) => set('prompt', e.target.value)} rows={4} style={full}
              placeholder="e.g. deep house, warm bass, dreamy pads, 122 bpm" />
          </Field>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {chips.map((g) => (
              <button key={g} className="btn btn-ghost" style={{ fontSize: 11, borderRadius: 14 }}
                onClick={() => set('prompt', p.prompt.trim() ? `${p.prompt.trim()}, ${g}` : g)}>{g}</button>
            ))}
            <IconBtn title="Show other genres" onClick={() => setChipSeed((s) => s + 1)}>⇄</IconBtn>
          </div>
        </Card>

        {/* lyrics */}
        <Card title="Lyrics" actions={<>
          <IconBtn title="Write lyrics with AI" onClick={aiLyrics} disabled={aiBusy !== null || p.instrumental}>{aiBusy === 'lyrics' ? '…' : '✨'}</IconBtn>
          <IconBtn title="Clear lyrics" onClick={() => set('lyrics', '')}>↺</IconBtn>
        </>}>
          <Toggle name="Instrumental" checked={p.instrumental} onChange={(v) => set('instrumental', v)} />
          {!p.instrumental && (
            <>
              {studio && (
                <>
                  <Field name="Language"><Select value={p.language} onChange={(v) => set('language', v)} options={LANGUAGES} /></Field>
                  <Field name="Voice">
                    <Segmented value={p.voice} onChange={(v) => set('voice', v)}
                      options={[{ value: 'any', label: 'Any' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
                  </Field>
                </>
              )}
              <textarea value={p.lyrics} onChange={(e) => set('lyrics', e.target.value)} rows={studio ? 9 : 5}
                style={{ ...full, fontFamily: 'monospace' }} placeholder={'[Verse 1]\n…\n\n[Chorus]\n…'} />
              <span style={hint}>Section tags in brackets: [Verse], [Chorus], [Bridge]. Empty lyrics are written by the model.</span>
            </>
          )}
        </Card>

        {studio && (
          <>
            {/* song parameters */}
            <Card title="Song parameters" actions={
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={aiMetadata} disabled={aiBusy !== null}>
                {aiBusy === 'meta' ? '…' : '✨ Complete the metadata'}
              </button>}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field name="Length, s">
                  <input type="number" min={5} max={maxDur} value={p.duration} placeholder="Auto"
                    onChange={(e) => set('duration', e.target.value)} />
                </Field>
                <Field name="BPM">
                  <input type="number" min={30} max={300} value={p.bpm} placeholder="Auto" onChange={(e) => set('bpm', e.target.value)} />
                </Field>
                <Field name="Key"><Select value={p.key} onChange={(v) => set('key', v)} options={KEYS} placeholder="Auto" /></Field>
                <Field name="Time"><Select value={p.timeSignature} onChange={(v) => set('timeSignature', v)} options={TIME_SIGNATURES} placeholder="Auto" /></Field>
              </div>
              <span style={hint}>Empty fields are decided by the model. Auto length is 60 s.</span>
            </Card>

            {/* source and reference */}
            <Card title="Source and reference">
              <Field name="Source track" hintText="Pick a track to cover or remix. Repaint and extend need a newer engine build.">
                <FilePick value={p.sourceTrack} onChange={(v) => set('sourceTrack', v)} placeholder="Choose a track…" />
              </Field>
              {p.sourceTrack && (
                <>
                  <Field name="Task">
                    <Select value={p.sourceTask} onChange={(v) => set('sourceTask', v as MusicParams['sourceTask'])}
                      options={[{ value: 'cover', label: 'Cover / remix' }, { value: 'repaint', label: 'Repaint' }, { value: 'extend', label: 'Extend' }]} />
                  </Field>
                  <SliderRow name="Source strength" value={p.sourceStrength} min={0} max={1} step={0.05} onChange={(v) => set('sourceStrength', v)} />
                </>
              )}
              <Field name="Timbre reference" hintText="A track whose sound the render follows.">
                <FilePick value={p.timbreReference} onChange={(v) => set('timbreReference', v)} placeholder="No reference" />
              </Field>
            </Card>
          </>
        )}

        {/* lora */}
        <Card title="LoRA">
          {Object.keys(p.selectedLoras).length === 0 && (
            <span style={hint}>No LoRA selected. Add one to steer the style, artist or sound.</span>
          )}
          {Object.entries(p.selectedLoras).map(([id, strength]) => {
            const l = loras.find((x) => x.id === id)
            return (
              <div key={id} style={{ border: '1px solid var(--border-mid)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{l?.name ?? id}</strong>
                  <IconBtn title="Remove from this song" onClick={() => {
                    const n = { ...p.selectedLoras }; delete n[id]; set('selectedLoras', n)
                  }}>×</IconBtn>
                </div>
                <SliderRow name={l?.kind ?? 'sound'} value={strength} min={0} max={2} step={0.05}
                  onChange={(v) => set('selectedLoras', { ...p.selectedLoras, [id]: v })} />
              </div>
            )
          })}
          {unusedLoras.length > 0 && (
            <Select value="" onChange={(id) => id && set('selectedLoras', { ...p.selectedLoras, [id]: 0.75 })}
              options={unusedLoras.map((l) => ({ value: l.id, label: `${l.name} (${l.kind})` }))} placeholder="+ Add LoRA" />
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setBrowserOpen(true)}>Find LoRA on Hugging Face…</button>
            <button className="btn btn-ghost" onClick={() => importLora('file')}>Import LoRA file…</button>
            <button className="btn btn-ghost" onClick={() => importLora('folder')}>Import LoRA folder…</button>
            <button className="btn btn-ghost" onClick={() => setTrainOpen(true)}>Train your own LoRA…</button>
          </div>
          <span style={hint}>Folder: {loraDir || '…'}. The engine applies one LoRA per render (the strongest).</span>
        </Card>

        {/* quality */}
        <Card title="Quality" actions={
          <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => setP((s) => ({
            ...s, think: DEFAULT_PARAMS.think, steps: DEFAULT_PARAMS.steps, songs: 1, variations: 1, queue: 1, randomizeSeed: true, seed: ''
          }))}>Reset to engine defaults</button>}>
          {studio && (
            <Toggle name="Let the model think" checked={p.think} onChange={(v) => set('think', v)}
              hintText="The language model plans the song first: metadata, lyrics when there are none, the structure." />
          )}
          <SliderRow name="DiT steps" value={p.steps} min={4} max={100} step={1} digits={0} onChange={(v) => set('steps', v)}
            hintText="More steps are slower and usually cleaner. Turbo models need only about 8." />
          {studio && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <SliderRow name="Songs" value={p.songs} min={1} max={8} step={1} digits={0} onChange={(v) => set('songs', v)} />
                <SliderRow name="Variations" value={p.variations} min={1} max={8} step={1} digits={0} onChange={(v) => set('variations', v)} />
              </div>
              <span style={hint}>Songs are separate plans, variations are renders of each plan with the next seeds.</span>
              <SliderRow name="Queue" value={p.queue} min={1} max={16} step={1} digits={0} onChange={(v) => set('queue', v)} />
              <Toggle name="Randomize seed" checked={p.randomizeSeed} onChange={(v) => set('randomizeSeed', v)} />
              {!p.randomizeSeed && (
                <Field name="Seed"><input type="number" value={p.seed} placeholder="e.g. 12345" onChange={(e) => set('seed', e.target.value)} /></Field>
              )}
            </>
          )}
        </Card>

        {/* advanced */}
        {studio && (
          <section style={card}>
            <button onClick={() => setAdvancedOpen((o) => !o)} style={{
              ...label, width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px 14px',
              background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer'
            }}>
              <span>Advanced</span><span>{advancedOpen ? '▴' : '▾'}</span>
            </button>
            {advancedOpen && (
              <div style={{ ...cardBody, gap: 14 }}>
                <div style={label}>Stage 1 · Language model</div>
                <Toggle name="Rewrite the style" checked={p.rewriteStyle} onChange={(v) => set('rewriteStyle', v)}
                  hintText="The model enriches the caption while it plans; off keeps your words." />
                <SliderRow name="Temperature" value={p.temperature} min={0} max={2} step={0.01} onChange={(v) => set('temperature', v)} />
                <SliderRow name="CFG scale" value={p.cfgScale} min={0} max={10} step={0.1} digits={1} onChange={(v) => set('cfgScale', v)} />
                <SliderRow name="Top-P" value={p.topP} min={0} max={1} step={0.01} onChange={(v) => set('topP', v)} />
                <SliderRow name="Top-K" value={p.topK} min={0} max={200} step={1} digits={0} onChange={(v) => set('topK', v)} />
                <SliderRow name="Melodic variation" value={p.melodicVariation} min={1} max={1.5} step={0.01} onChange={(v) => set('melodicVariation', v)}
                  hintText="Penalises repeated audio codes against a melody stuck in a loop. 1.00 is off; about 1.05–1.15 helps." />
                <Field name="Negative prompt"><textarea rows={2} value={p.negativePrompt} onChange={(e) => set('negativePrompt', e.target.value)} /></Field>
                <Field name="LM seed"><input value={p.lmSeed} placeholder="Random" onChange={(e) => set('lmSeed', e.target.value)} /></Field>
                <Field name="Audio codes" hintText="The structure of a track as the language model wrote it; with codes the model does not plan again.">
                  <textarea rows={2} value={p.audioCodes} onChange={(e) => set('audioCodes', e.target.value)} />
                </Field>

                <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>Rendering</div>
                <SliderRow name="Guidance" value={p.guidance} min={1} max={30} step={0.5} digits={1} onChange={(v) => set('guidance', v)} />
                <SliderRow name="Shift" value={p.shift} min={0} max={10} step={0.1} digits={1} onChange={(v) => set('shift', v)} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field name="Solver"><Select value={p.solver} onChange={(v) => set('solver', v)}
                    options={[{ value: 'euler', label: 'Euler' }, { value: 'heun', label: 'Heun' }, { value: 'pingpong', label: 'Ping-pong' }]} /></Field>
                  <Field name="Schedule"><Select value={p.schedule} onChange={(v) => set('schedule', v)}
                    options={[{ value: 'linear-quadratic', label: 'Linear-Quadratic' }, { value: 'linear', label: 'Linear' }]} /></Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field name="DCW"><Select value={p.dcwMode} onChange={(v) => set('dcwMode', v)}
                    options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} /></Field>
                  <Field name="Strength"><input type="number" step={0.01} value={p.dcwStrength} disabled={p.dcwMode === 'off'}
                    onChange={(e) => set('dcwStrength', Number(e.target.value))} /></Field>
                  <Field name="High band"><input type="number" step={0.01} value={p.dcwHighBand} disabled={p.dcwMode === 'off'}
                    onChange={(e) => set('dcwHighBand', Number(e.target.value))} /></Field>
                </div>
                <Field name="Custom timesteps" hintText="Replaces steps and shift; the last value is the end point.">
                  <input value={p.customTimesteps} placeholder="0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0"
                    onChange={(e) => set('customTimesteps', e.target.value)} style={{ fontFamily: 'monospace' }} />
                </Field>
                <SliderRow name="Retake" value={p.retake} min={0} max={1} step={0.01} onChange={(v) => set('retake', v)}
                  hintText="A variation of the same take: 0 keeps it, 1 is the take of the retake seed." />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field name="Latent shift"><input type="number" step={0.01} value={p.latentShift} onChange={(e) => set('latentShift', Number(e.target.value))} /></Field>
                  <Field name="Latent scale"><input type="number" step={0.01} value={p.latentScale} onChange={(e) => set('latentScale', Number(e.target.value))} /></Field>
                </div>

                <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>LoRA by layer</div>
                <span style={hint}>Strength of every LoRA in each part of the DiT (used when the engine supports it).</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {LAYERS.map((l) => (
                    <SliderRow key={l.key} name={l.label} value={p.loraLayers[l.key]} min={0} max={2} step={0.05}
                      onChange={(v) => set('loraLayers', { ...p.loraLayers, [l.key]: v })} />
                  ))}
                </div>

                <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>Stage 3 · Output</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field name="MP3 bitrate, kbps"><Select value={String(p.mp3Bitrate)} onChange={(v) => set('mp3Bitrate', Number(v))}
                    options={['128', '192', '256', '320'].map((b) => ({ value: b, label: `${b} kbps` }))} /></Field>
                  <Field name="Output format"><Select value={p.format} onChange={(v) => set('format', v as MusicParams['format'])}
                    options={[{ value: 'flac', label: 'FLAC' }, { value: 'mp3', label: 'MP3' }, { value: 'wav', label: 'WAV' }]} /></Field>
                  <Field name="Fade in, s"><input type="number" min={0} step={0.1} value={p.fadeIn} onChange={(e) => set('fadeIn', Math.max(0, Number(e.target.value)))} /></Field>
                  <Field name="Fade out, s"><input type="number" min={0} step={0.1} value={p.fadeOut} onChange={(e) => set('fadeOut', Math.max(0, Number(e.target.value)))} /></Field>
                </div>
                <span style={hint}>FLAC and MP3 conversion and fades need ffmpeg on the PATH.</span>
              </div>
            )}
          </section>
        )}

        {/* footer */}
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-primary)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={label}>Into project</span>
            <select value={intoProject} onChange={(e) => setIntoProject(e.target.value as 'none' | 'new')} style={{ flex: 1 }}>
              <option value="none">None</option>
              <option value="new">New audio track(s) on the timeline</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={create}
            disabled={busy || (!p.prompt.trim() && !p.lyrics.trim() && !p.sourceTrack) || !online}
            style={{ width: '100%', justifyContent: 'center', padding: '14px 0', fontSize: 15, fontWeight: 800 }}>
            {busy
              ? `Generating… ${job?.progress ? `${job.progress.done}/${job.progress.total}` : ''}${job?.step && job.step_total ? `  ${Math.round((job.step / job.step_total) * 100)}%` : ''}`
              : `Create${count > 1 ? `  (${count})` : ''}`}
          </button>
        </div>
      </div>

      {/* ── results ── */}
      <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--border-mid)', padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={label}>Results</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        {notice && <div style={{ color: 'var(--green)', fontSize: 12 }}>{notice}</div>}
        {job?.status === 'error' && <div style={{ color: 'var(--red)', fontSize: 12 }}>{job.error}</div>}
        {job?.warnings.map((w, i) => <div key={i} style={{ color: 'var(--yellow)', fontSize: 11 }}>{w}</div>)}
        {!job && !error && <div style={hint}>Your songs appear here. Describe the music on the left and press Create.</div>}
        {busy && job && <ProgressPanel job={job} />}
        {job?.results.map((r, i) => (
          <div key={r.audio_file} style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{p.title || 'Untitled'} · take {i + 1}</strong>
              <span>seed {r.seed} · {r.duration}s</span>
            </div>
            <AudioFile path={r.audio_file} />
            <div>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => addToProject({ ...job, results: [r] })}>Add to project</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
