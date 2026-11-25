import { sendToMastering } from '../../stores/mastering.store'
import { sendToStemSplitter, sendToAudioToMidi } from '../../stores/stemHandoff'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { autoStructure, hasSections, SECTION_TAGS } from '../../lib/lyrics'
import { api, type EngineState, type Lora, type MusicEngineInfo, type MusicJob, type MusicResult, type Resources, type Usage } from '../../lib/api'
import { apiKeyFor, useAIStore } from '../../stores/ai.store'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { TakeRow } from './TakeRow'
import { LoraBrowser } from './LoraBrowser'
import { TrainLora } from './TrainLora'
import { importAudioFiles } from '../timeline/Timeline'
import { seedAnalysis } from '../../beatmatch/store'
import { useMusicJob } from '../../stores/musicJob.store'
import { tr } from '../../i18n/tr'
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
  options: Array<string | { value: string; label: string; disabled?: boolean }>; placeholder?: string
}): React.ReactElement {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={full}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        const off = typeof o === 'string' ? false : !!o.disabled
        return <option key={v} value={v} disabled={off} style={off ? { color: '#888' } : undefined}>{l}</option>
      })}
    </select>
  )
}

// Which LoRAs a music model can use: ACE-Step v1 its own (and unknown ones), ACE-Step 1.5 turbo LoRAs made for 1.5
// (not the XL ones), the other models none.
function loraFit(engine: string, family: Lora['family']): { ok: boolean; why: string } {
  if (engine === 'ace-step') return family === '1.5' || family === 'xl'
    ? { ok: false, why: `made for ACE-Step 1.5${family === 'xl' ? ' XL' : ''}` } : { ok: true, why: '' }
  // only LoRAs known not to fit are greyed out; an unclear one may be tried (the engine skips it with a note)
  if (engine === 'ace-step-1.5') return family === 'xl' ? { ok: false, why: 'made for the larger XL model' }
    : family === 'v1' ? { ok: false, why: 'made for ACE-Step v1' } : { ok: true, why: '' }
  return { ok: false, why: 'this model uses no LoRA' }
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
        >{tr(o.label)}</button>
      ))}
    </div>
  )
}

const AUDIO_FILE = /\.(wav|mp3|flac|ogg|m4a|aac|aiff?|opus)$/i

// A file of the computer: chosen with the dialog, or dragged in from the Explorer or from the takes below.
function FilePick({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}): React.ReactElement {
  const [over, setOver] = useState(false)
  const [bad, setBad] = useState(false)
  const browse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) onChange(paths[0])
  }
  const drop = (e: React.DragEvent): void => {
    e.preventDefault(); e.stopPropagation(); setOver(false)
    const take = e.dataTransfer.getData('text/ams-path')
    const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
    const path = take || (f && AUDIO_FILE.test(f.name) ? f.path ?? '' : '')
    if (path) { onChange(path); setBad(false) } else { setBad(true); window.setTimeout(() => setBad(false), 2500) }
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) }}
      onDragLeave={() => setOver(false)} onDrop={drop}
      style={{ display: 'flex', gap: 8, alignItems: 'center', borderRadius: 8, outline: over ? '2px dashed var(--accent)' : 'none', outlineOffset: 2 }}>
      <button className="btn btn-ghost" onClick={browse} title={tr('Choose a file or drag an audio file here')}
        style={{ flex: 1, justifyContent: 'flex-start', overflow: 'hidden', borderStyle: value ? undefined : 'dashed' }}>
        <span className="truncate" style={{ maxWidth: 260, color: bad ? 'var(--danger, #ef4444)' : undefined }}>
          {bad ? tr('Drop audio files (WAV, MP3, FLAC, OGG, M4A, AIFF).') : over ? tr('Drop here') : value ? value.split(/[\\/]/).pop() : placeholder}
        </span>
      </button>
      {value && <IconBtn title={tr("Clear")} onClick={() => onChange('')}>×</IconBtn>}
    </div>
  )
}

// ─── AI helper (uses the provider/key from Settings → AI) ────────────────────

async function askAI(system: string, user: string): Promise<string> {
  const st = useAIStore.getState()
  const { provider, model } = st
  const apiKey = apiKeyFor(st)
  if (!apiKey) throw new Error(tr('Add an API key in Settings → AI first.'))
  const r = await api.ai.chat({
    provider, apiKey, model, systemContext: system, baseUrl: st.localUrl, tools: false,
    messages: [{ role: 'user', content: user }],
  })
  return r.reply
}

// ─── main component ──────────────────────────────────────────────────────────

// The name of a finished song: editable right here; it is the name in the Library as well.
function ResultName({ result, fallback }: { result: MusicResult; fallback: string }): React.ReactElement {
  const [name, setName] = useState(result.title || fallback)
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle')
  const id = result.library_id
  const save = async (): Promise<void> => {
    const v = name.trim()
    if (!v || !id) return
    try { await api.library.patch(id, { title: v }); setName(v); setState('saved') } catch { setState('failed') }
    window.setTimeout(() => setState('idle'), 2500)
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
      <input
        value={name} disabled={!id} title={id ? tr('Click to rename this song') : tr('This song is not in the library, it cannot be renamed')}
        onChange={(e) => { setName(e.target.value); setState('idle') }}
        onBlur={() => void save()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', background: 'transparent', border: '1px solid transparent', borderBottom: '1px dashed var(--border-mid)', borderRadius: 4, padding: '2px 4px' }}
      />
      <span style={{ fontSize: 10, color: state === 'failed' ? 'var(--red)' : 'var(--green)', width: 40 }}>{state === 'saved' ? tr('saved') : state === 'failed' ? tr('failed') : ''}</span>
    </span>
  )
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// What is happening right now, so a long wait does not look like a freeze: one compact row in the takes, like the
// take being recorded in a DAW (stages, step, time left, what the computer is doing).
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
  const stageElapsed = job.stage_started ? Math.max(0, now / 1000 - job.stage_started) : 0
  const eta = known !== null && known > 0.05 && stageElapsed > 3 ? (stageElapsed / known) * (1 - known) : null
  const quiet = job.updated ? (now / 1000 - job.updated) : 0
  const stages: Array<[string, string]> = [['load', tr('Load model')], ['prepare', tr('Prepare')], ['render', tr('Render')], ['finish', tr('Save')]]
  const at = Math.max(0, stages.findIndex(([k]) => k === job.stage))
  const note = job.stage === 'load' || job.stage === 'prepare'
    ? tr('The first start loads the music model and can take many minutes on an older PC. Nothing is stuck while this counter runs.')
    : quiet > 60 ? tr('No news from the engine for a minute. It is still computing; very long songs on slow hardware pause between steps.')
    : tr('Rendering uses the whole computer, so other programs may feel slower meanwhile.')
  return (
    <div title={note} style={{ display: 'grid', gridTemplateColumns: '30px minmax(150px, 220px) 1fr auto', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'ams-spin 0.9s linear infinite', display: 'inline-block' }} />
      <style>{'@keyframes ams-spin { to { transform: rotate(360deg) } }'}</style>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{songs ? `${tr('Take')} ${Math.min(songs.done + 1, songs.total)} ${tr('of')} ${songs.total}` : tr('New take')}</div>
        <div className="truncate" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{job.stage_text ?? tr('Starting…')}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, fontSize: 10.5, flexWrap: 'wrap' }}>
          {stages.map(([k, name], i) => (
            <span key={k} style={{ padding: '1px 7px', borderRadius: 9, background: i === at ? 'var(--accent)' : 'var(--bg-elevated)', color: i === at ? '#fff' : i < at ? 'var(--green)' : 'var(--text-muted)' }}>
              {i < at ? '✓ ' : ''}{name}
            </span>
          ))}
          {job.downloaded_mb !== undefined && job.downloaded_mb > 1 && job.stage === 'load' && (
            <span style={{ color: 'var(--text-muted)' }}>{tr("Downloaded so far:")} {job.downloaded_mb >= 1024 ? `${(job.downloaded_mb / 1024).toFixed(2)} GB` : `${Math.round(job.downloaded_mb)} MB`}</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>{known !== null ? `${Math.round(known * 100)} %` : tr('Working…')}{eta !== null ? ` · ${tr('about')} ${mmss(eta)} ${tr('left')}` : ''} · {tr('Running')} {mmss(elapsed)}</span>
          {job.device && <span>{job.device}</span>}
          {usage && <span>CPU {Math.round(usage.cpu_percent)} % · {tr('RAM')} {usage.ram_used_gb}/{usage.ram_total_gb} GB</span>}
          {usage && usage.swap_percent > 30 && <span style={{ color: 'var(--orange)' }}>{tr('Memory is full: the PC is swapping to disk, expect it to crawl.')}</span>}
        </div>
      </div>
      <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr("Watch downloads in Settings \u2192 Models")}
        onClick={() => { sessionStorage.setItem('ams-settings-tab', 'models'); useUIStore.getState().setActiveView('settings') }}>{tr('Downloads')}</button>
    </div>
  )
}

// A voice of the Vocal Editor for the whole song (its own compact list, apart from Male / Female): the music model
// makes the song, then the built-in singer sings it again with this voice (services/revoice.py)
interface SingerVoice { id: string; name: string; singer?: string; gender: string; description: string }
function SingerVoiceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }): React.ReactElement | null {
  const [list, setList] = useState<{ voices: SingerVoice[]; convert?: string | null } | null>(null)
  useEffect(() => { api.singer.builtin().then((b) => setList(b as { voices: SingerVoice[]; convert?: string | null })).catch(() => setList(null)) }, [])
  if (!list || !list.voices.length) return null
  const missing = list.convert ?? null                   // the voice exchange is not installed
  const label = (v: SingerVoice): string => `${v.singer ?? v.name}${v.id.endsWith('-2') ? ' 2' : ''} · ${v.description}`
  const groups: Array<['female' | 'male', string]> = [['female', tr('Women')], ['male', tr('Men')]]
  return (
    <RackRow k={tr('Singer')}>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!!missing && !value} style={{ width: '100%' }}
        title={missing ? tr(missing) : tr('The music model makes the song with a singer of the same sex, then its vocals are turned into this voice (a few minutes more per song)')}>
        <option value="">{missing ? tr('Not installed: Settings → AI Engines → Voice exchange') : tr('None: the music model sings')}</option>
        {groups.map(([g, name]) => (
          <optgroup key={g} label={name}>
            {list.voices.filter((v) => v.gender === g).map((v) => <option key={v.id} value={v.id} disabled={!!missing}>{label(v)}</option>)}
          </optgroup>
        ))}
      </select>
    </RackRow>
  )
}

export function CreateMusic(): React.ReactElement {
  const [p, setP] = useState<MusicParams>(DEFAULT_PARAMS)
  const [mode, setModeRaw] = useState<'simple' | 'studio' | 'loop'>('studio')
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
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  // the AI chat makes songs with the model chosen here
  useEffect(() => { try { localStorage.setItem('ams-last-engine', p.engine) } catch { /* no storage */ } }, [p.engine])
  const lyricsRef = useRef<HTMLTextAreaElement>(null)
  // a section tag at the cursor, on a line of its own
  const insertSection = (tag: string): void => {
    const el = lyricsRef.current
    const text = p.lyrics
    const at = el ? el.selectionStart : text.length
    const before = text.slice(0, at), after = text.slice(at)
    const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
    const insert = `${lead}[${tag}]\n`
    set('lyrics', before + insert + after)
    requestAnimationFrame(() => { if (el) { el.focus(); const c = before.length + insert.length; el.setSelectionRange(c, c) } })
  }
  const [intoProject, setIntoProject] = useState<'none' | 'new'>('none')
  const [chipSeed, setChipSeed] = useState(0)

  const set = useCallback(<K extends keyof MusicParams>(k: K, v: MusicParams[K]) =>
    setP((s) => ({ ...s, [k]: v })), [])
  // Loop is a mode of its own (one of our main functions): it makes loops, instrumental by default; the other modes
  // make songs
  const setMode = (m: 'simple' | 'studio' | 'loop'): void => {
    setModeRaw(m)
    if (m === 'loop') setP((s) => ({ ...s, loop: true, instrumental: s.loop ? s.instrumental : true, acapella: false, bpm: s.bpm || '120' }))
    else setP((s) => (s.loop ? { ...s, loop: false } : s))
  }
  // from the Library ("Use again in Create music"): the song's prompt and lyrics are filled in
  const prefill = useUIStore((s) => s.createPrefill)
  useEffect(() => {
    if (!prefill) return
    useUIStore.getState().setCreatePrefill(null)
    setP((s) => ({ ...s, prompt: prefill.prompt || s.prompt, lyrics: prefill.lyrics ?? s.lyrics }))
  }, [prefill])

  const refreshLoras = useCallback(async () => {
    const l = await window.api.loras.list()
    setLoras(l.loras)
    setLoraDir(l.dir)
    // which model a LoRA fits: the backend reads the files the way the engine loads them (LoKr, nested folders)
    try {
      const fam = new Map((await api.music.loras()).loras.map((b) => [b.id, b.family]))
      setLoras(l.loras.map((x) => (fam.get(x.id) ? { ...x, family: fam.get(x.id) } : x)))
    } catch { /* backend offline: keep the app's own guess */ }
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

  // every song lands on bar 1 (so that several songs start together) and is beat matched like any new audio
  const addToProject = useCallback((job: MusicJob) => {
    void (async () => {
      for (const [i, r] of job.results.entries()) {
        seedAnalysis(r.audio_file, r)                          // the tempo was measured when the song was saved
        const problems = await importAudioFiles([r.audio_file],
          r.loop_bars && r.bpm ? { startBeat: 0, warpBpm: r.bpm, gridFirst: 0, noBeatMatch: true } : { startBeat: 0 })
        if (problems.length) { setError(problems.join(' ')); return }
        const tracks = useProjectStore.getState().project.tracks
        const track = tracks[tracks.length - 1]
        useProjectStore.getState().updateTrack(track.id, { name: (r.title || `${p.title || p.prompt.split(',')[0] || 'Song'} ${i + 1}`).trim() })
      }
      setNotice(`${job.results.length} ${tr('song(s) added at bar 1 of the Studio.')}`)
    })()
  }, [p.title, p.prompt])

  // when a job finishes while this screen is open, put the tracks on the timeline if asked
  useEffect(() => {
    if (job?.status !== 'done' || intoProject !== 'new' || job.id === previewJobId) return
    const st = useMusicJob.getState()
    if (st.handled.includes(job.id)) return
    st.markHandled(job.id)
    addToProject(job)
  }, [job, intoProject, addToProject, previewJobId])

  // voice previews: three short takes of the first lines with different seeds; the chosen seed makes the whole song
  const canPreview = !p.instrumental && (p.engine === 'ace-step' || p.engine === 'ace-step-1.5')
  const previewVoices = async () => {
    setError(null); setNotice(null); setJob(null)
    try {
      const lines = p.lyrics.split('\n').map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l)).slice(0, 2)
      const body = { ...toRequest(p), duration: 10, songs: 3, variations: 1, queue: 1, randomize_seed: true, seed: null, loop: false, preview: true,
        lyrics: lines.length ? `[Verse]\n${lines.join('\n')}` : '' }
      const { jobId } = await api.music.generate(body)
      setPreviewJobId(jobId)
      setJob({ id: jobId, status: 'queued', warnings: [], results: [] })
      useMusicJob.getState().track(jobId)
    } catch (e) {
      setError(String((e as Error).message))
    }
  }
  const useVoice = (seed: number) => {
    setP((s) => ({ ...s, randomizeSeed: false, seed: String(seed) }))
    setNotice(`${tr('Voice chosen: the song is made with seed')} ${seed}. ${tr('Press Create.')}`)
  }

  const create = async () => {
    setError(null); setNotice(null); setJob(null); setPreviewJobId(null)
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
  const studio = mode !== 'simple'          // the loop mode has all settings of the studio mode
  const loopMode = mode === 'loop'

  const cur = engines.find((e) => e.id === p.engine)
  const statusColor = !online ? 'var(--orange)' : engine === 'ready' ? 'var(--green)' : engine === 'broken' ? 'var(--red)' : engine === 'missing' ? 'var(--yellow)' : 'var(--text-secondary)'
  const statusText = !online ? tr('Backend offline') : engine === 'ready' ? tr('Engine ready') : engine === 'broken' ? tr('Engine error') : engine === 'missing' ? tr('Engine not installed') : tr('Checking engine…')
  const engineProblem = !online ? tr("The AI backend is offline. Open Settings → AI Engines and install the core backend. LoRA import works without it.")
    : engine === 'missing' ? tr("ACE-Step is not installed: results are silent placeholders. Install it in Settings → AI Engines.")
    : engine === 'broken' ? `${tr('ACE-Step is installed but cannot start:')} ${engineError || tr('unknown error')}. ${tr('Songs cannot be generated until this is fixed.')}`
    : engine === 'checking' ? tr("Checking the music engine. The first check loads PyTorch and takes about 30 seconds.") : null
  const stepFrac = job?.step && job.step_total ? job.step / job.step_total : null
  const overall = stepFrac === null ? null : job?.progress && job.progress.total > 1 ? (job.progress.done + stepFrac) / job.progress.total : stepFrac
  const canCreate = !busy && (p.prompt.trim() || p.lyrics.trim() || p.sourceTrack) && online
  const takeName = (i: number): string => `${p.title || tr('Untitled')} · ${tr('take')} ${i + 1}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TrainLora open={trainOpen} onClose={() => setTrainOpen(false)} onDone={(id) => { void refreshLoras(); setNotice('LoRA ' + id + ' trained and added to your list.') }} />
      <LoraBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} onImported={(l) => void onDownloaded(l)} />

      {/* ── header: title, engine state, Simple / Studio ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border-mid)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{tr("Create")}</span>
        <span title={engineProblem ?? (res ? `${res.quant} · ${res.vram_gb || '?'} GB VRAM / ${res.ram_gb} GB RAM` : '')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border-mid)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          {cur?.name ?? 'ACE-Step'} · {statusText}
        </span>
        {res?.low_memory && (
          <span title={`${tr('Low-memory mode is on: songs up to')} ${Math.round(res.max_duration_s / 60)} ${tr('minutes work, but longer ones take noticeably more time and memory.')}`}
            style={{ fontSize: 11, color: 'var(--orange)', whiteSpace: 'nowrap' }}>● {tr('Low-memory mode')}</span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <MiniSeg value={mode} onChange={(v) => setMode(v as 'simple' | 'studio' | 'loop')}
            options={[['simple', tr("Simple")], ['studio', tr("Studio")], ['loop', `⟳ ${tr("Loops")}`]]}
            title={tr("Simple and Studio make songs; Loops makes loops of exactly 1 to 16 bars that repeat without a gap")} />
        </div>
      </div>
      {engineProblem && engine !== 'checking' && (
        <div style={{ padding: '6px 18px', fontSize: 12, color: statusColor, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>{engineProblem}</div>
      )}

      {/* ── song (left) and parameters (right) ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 14, padding: '14px 18px' }}>
        {/* song: title, style, lyrics */}
        <section style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <header style={panelHead}>
            <span style={label}>{tr("Song")}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <IconBtn title={tr("Improve the style with AI")} onClick={aiStyle} disabled={aiBusy !== null}>{aiBusy === 'style' ? '…' : '✨'}</IconBtn>
              <IconBtn title={tr("Reset the form")} onClick={() => setP(DEFAULT_PARAMS)}>↺</IconBtn>
            </span>
          </header>
          <div style={{ padding: '10px 14px 0', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input value={p.title} onChange={(e) => set('title', e.target.value)} placeholder={tr("Untitled")}
                style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 700, background: 'transparent', border: 'none', padding: 0 }} />
              <input value={p.tags} onChange={(e) => set('tags', e.target.value)} placeholder={tr('Tags for the Library (optional)')}
                title={tr("Genre, mood or anything you want to find this song or loop by in the Library. Separate with commas.")}
                style={{ width: 200, fontSize: 11, padding: '3px 8px' }} />
            </div>
            <textarea value={p.prompt} onChange={(e) => set('prompt', e.target.value)} rows={2}
              title={tr("A description of the music: genre, mood, instruments, tempo.")}
              placeholder={tr("e.g. deep house, warm bass, dreamy pads, 122 bpm")}
              style={{ ...full, ...lcdText, resize: 'vertical', minHeight: 46 }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
              {chips.slice(0, 5).map((g) => (
                <button key={g} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => set('prompt', p.prompt.trim() ? `${p.prompt.trim()}, ${g}` : g)}>{g}</button>
              ))}
              <IconBtn title={tr("Show other genres")} onClick={() => setChipSeed((s) => s + 1)}>⇄</IconBtn>
            </div>
          </div>
          {/* lyrics: a code-editor like field with line numbers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 6px', borderTop: '1px solid var(--border-subtle)', marginTop: 10, flexShrink: 0 }}>
            <span style={label}>{tr("Lyrics")}</span>
            <MiniSeg value={p.instrumental ? 'inst' : p.acapella ? 'acap' : 'song'}
              onChange={(v) => { set('instrumental', v === 'inst'); set('acapella', v === 'acap') }}
              options={[['song', tr('With music')], ['inst', tr('Instrumental')], ['acap', tr('A cappella')]]}
              title={tr("A cappella: the lyrics are sung without any instruments; after rendering the voice is separated (Demucs) into a clean, dry vocal.")} />
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {!p.instrumental && canPreview && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 8px', whiteSpace: 'nowrap' }} disabled={busy || !p.lyrics.trim()} onClick={previewVoices}
                  title={tr('Preview voices') + ': ' + tr('Three short takes (10 s) of the voice alone, without music, each singing your first lines with another voice. Listen, then press “Use this voice” on the one you like: the whole song is made with it.')}>
                  🎤
                </button>
              )}
              {!p.instrumental && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 8px', whiteSpace: 'nowrap' }} disabled={!p.lyrics.trim() || hasSections(p.lyrics)}
                  title={tr('Auto structure') + ': ' + tr('Lyrics without sections: stanzas become [Verse] and [Chorus] (a stanza that comes back is the chorus)')}
                  onClick={() => set('lyrics', autoStructure(p.lyrics))}>✦</button>
              )}
              <IconBtn title={tr("Write lyrics with AI")} onClick={aiLyrics} disabled={aiBusy !== null || p.instrumental}>{aiBusy === 'lyrics' ? '…' : '✨'}</IconBtn>
              <IconBtn title={tr("Clear lyrics")} onClick={() => set('lyrics', '')}>↺</IconBtn>
            </span>
          </div>
          {p.acapella && cur && !cur.vocals && (
            <div style={{ padding: '0 14px 6px', fontSize: 11, color: 'var(--yellow)' }}>{cur.name} {tr('cannot sing: choose ACE-Step or DiffRhythm as the music model.')}</div>
          )}
          {p.instrumental ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12, borderTop: '1px solid var(--border-subtle)' }}>{tr('Instrumental: no lyrics')}</div>
          ) : (
            <>
              <LyricsEditor value={p.lyrics} onChange={(v) => set('lyrics', v)} inputRef={lyricsRef} placeholder={tr('[Verse]\n…\n\n[Chorus]\n…')} />
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', overflowX: 'auto', padding: '6px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
                {SECTION_TAGS.map((tag) => (
                  <button key={tag} className="btn btn-ghost" style={{ fontSize: 10.5, padding: '1px 8px', color: 'var(--accent-light)', whiteSpace: 'nowrap', flexShrink: 0 }}
                    title={tr('Insert this section at the cursor')} onClick={() => insertSection(tag)}>[{tag}]</button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* parameters: a compact device-like column; the rare ones under Advanced */}
        <section style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <header style={panelHead}>
            <span style={label}>{tr("Parameters")}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              {studio && <IconBtn title={tr('Complete the metadata')} onClick={aiMetadata} disabled={aiBusy !== null}>{aiBusy === 'meta' ? '…' : '✨'}</IconBtn>}
              <IconBtn title={tr("Reset to engine defaults")} onClick={() => setP((s) => ({
                ...s, think: DEFAULT_PARAMS.think, steps: DEFAULT_PARAMS.steps, songs: 1, variations: 1, queue: 1, randomizeSeed: true, seed: ''
              }))}>↺</IconBtn>
            </span>
          </header>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {engines.length > 0 && (
              <RackRow k={tr("Model")} title={cur ? `${cur.description}${cur.reason ? ` ${cur.reason}` : ''}${cur.license ? ` ${tr('Licence')}: ${cur.license}.` : ''}${!cur.vocals ? ` ${tr('Instrumental only.')}` : ''}` : undefined}>
                <select value={p.engine} onChange={(e) => { try { localStorage.setItem('ams-engine-chosen', '1') } catch { /* private mode */ } set('engine', e.target.value) }} style={full}>
                  {engines.map((e) => (
                    <option key={e.id} value={e.id} disabled={!e.usable}>
                      {e.name}{e.recommended ? ` (${tr('recommended for this PC')})` : ''} — {e.kind === 'planned' ? tr('soon') : e.status === 'ready' ? tr('runs well') : e.status === 'slow' ? tr('slow here') : tr('not enough memory')}
                    </option>
                  ))}
                </select>
              </RackRow>
            )}
            {gpuModels.includes(p.engine) && (
              <RackRow k={tr("Compute")}>
                <select value={p.compute} onChange={(e) => set('compute', e.target.value as MusicParams['compute'])} style={full}>
                  <option value="auto">{tr("Automatic")}</option>
                  <option value="gpu">{tr("Graphics card (DirectML)")}</option>
                  <option value="cpu">{tr("Processor only")}</option>
                </select>
              </RackRow>
            )}
            {p.engine === 'ace-step' && (
              <RackRow k={tr("Precision")} title={tr('bf16 needs less memory but only RTX 30 cards and newer compute it; older cards always use fp32')}>
                <MiniSeg value={p.precision ?? 'auto'} onChange={(v) => set('precision', v as MusicParams['precision'])}
                  options={[['auto', tr('Auto')], ['bf16', 'bf16'], ['fp32', 'fp32']]} />
              </RackRow>
            )}
            {studio && (
              <>
                {loopMode ? (
                  <RackRow k={tr("Loop length")} title={tr("Makes a loop of exactly the chosen bars, starting on beat 1. Copies placed one after the other in the Studio (Ctrl+D) play endlessly without a gap or a click.")}>
                    <MiniSeg value={String(p.loopBars)} onChange={(v) => set('loopBars', Number(v))}
                      options={[['1', '1'], ['2', '2'], ['4', '4'], ['8', '8'], ['16', '16']]} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('bars')}</span>
                  </RackRow>
                ) : (
                <RackRow k={tr("Length")} title={tr("Empty fields are decided by the model. Auto length is 60 s.")}>
                  <input type="number" min={5} max={maxDur} value={p.loop ? '' : p.duration} placeholder={p.loop ? tr("loop") : tr("Auto")}
                    disabled={p.loop} onChange={(e) => set('duration', e.target.value)} style={{ ...lcdBox, width: 74 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('s')}{!p.loop && Number(p.duration) > 0 ? ` · ${mmss(Number(p.duration))}` : ''}</span>
                </RackRow>
                )}
                <RackRow k={tr("Tempo · Key")}>
                  <input type="number" min={30} max={300} value={p.bpm} placeholder={loopMode ? '120' : tr("BPM")} onChange={(e) => set('bpm', e.target.value)} style={{ ...lcdBox, width: 66 }}
                    title={loopMode ? tr("The loop keeps the tempo the model really played; in the Studio it is stretched to the project tempo, so every copy is exactly the chosen bars long.") : undefined} />
                  <Select value={p.key} onChange={(v) => set('key', v)} options={KEYS} placeholder={tr("Key: auto")} />
                </RackRow>
                <RackRow k={tr("Time")}>
                  <Select value={p.timeSignature} onChange={(v) => set('timeSignature', v)} options={TIME_SIGNATURES} placeholder={tr("Auto")} />
                </RackRow>
                {!p.instrumental && (
                  <>
                    <RackRow k={tr("Language")}><Select value={p.language} onChange={(v) => set('language', v)} options={LANGUAGES} /></RackRow>
                    <RackRow k={tr("Voice")}>
                      <MiniSeg value={p.voice} onChange={(v) => set('voice', v as MusicParams['voice'])}
                        options={[['any', tr('Any')], ['male', tr('Male')], ['female', tr('Female')]]} />
                    </RackRow>
                    <SingerVoiceSelect value={p.singerVoice ?? ''} onChange={(v) => set('singerVoice', v)} />
                  </>
                )}
              </>
            )}
            <RackRow k={tr("Steps")} title={tr("More steps are slower and usually cleaner. Turbo models need only about 8.")}>
              <input type="range" min={4} max={100} step={1} value={p.steps} onChange={(e) => set('steps', Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
              <span style={{ ...lcdBox, width: 44, textAlign: 'center' }}>{p.steps}</span>
            </RackRow>
            {studio && (
              <>
                <RackRow k={tr("Takes")} title={tr("Songs are separate plans, variations are renders of each plan with the next seeds.")}>
                  <Stepper value={p.songs} min={1} max={8} onChange={(v) => set('songs', v)} title={tr('Songs')} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>×</span>
                  <Stepper value={p.variations} min={1} max={8} onChange={(v) => set('variations', v)} title={tr('Variations')} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>×</span>
                  <Stepper value={p.queue} min={1} max={16} onChange={(v) => set('queue', v)} title={tr('Queue')} />
                </RackRow>
                <RackRow k={tr("Seed")}>
                  <MiniSeg value={p.randomizeSeed ? 'rnd' : 'fix'} onChange={(v) => set('randomizeSeed', v === 'rnd')} options={[['rnd', tr('Random')], ['fix', tr('Fixed')]]} />
                  {!p.randomizeSeed && <input type="number" value={p.seed} placeholder="12345" onChange={(e) => set('seed', e.target.value)} style={{ ...lcdBox, width: 80 }} />}
                </RackRow>
              </>
            )}
            {/* everything rarely changed */}
            <button onClick={() => setAdvancedOpen((o) => !o)} style={{
              ...full, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'transparent', border: 'none',
              borderBottom: advancedOpen ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11.5
            }}>
              <span>{tr('LoRA · source and reference · output')}</span>
              <span style={{ color: 'var(--text-primary)' }}>{tr("Advanced")} {advancedOpen ? '▴' : '▾'}</span>
            </button>
            {advancedOpen && (
              <div style={{ ...cardBody, gap: 14 }}>
                <div style={label}>{tr("LoRA")}</div>
                {Object.keys(p.selectedLoras).length === 0 && (
                  <span style={hint}>{tr("No LoRA selected. Add one to steer the style, artist or sound.")}</span>
                )}
                {Object.entries(p.selectedLoras).map(([id, strength]) => {
                  const l = loras.find((x) => x.id === id)
                  return (
                    <div key={id} style={{ border: '1px solid var(--border-mid)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{l?.name ?? id}</strong>
                        <IconBtn title={tr("Remove from this song")} onClick={() => {
                          const n = { ...p.selectedLoras }; delete n[id]; set('selectedLoras', n)
                        }}>×</IconBtn>
                      </div>
                      <SliderRow name={l?.kind ?? tr('sound')} value={strength} min={0} max={2} step={0.05}
                        onChange={(v) => set('selectedLoras', { ...p.selectedLoras, [id]: v })} />
                      {l && !loraFit(p.engine, l.family).ok && (
                        <span style={{ ...hint, color: 'var(--orange)' }}>{tr('Not used with this model')}: {loraFit(p.engine, l.family).why}.</span>
                      )}
                    </div>
                  )
                })}
                {unusedLoras.length > 0 && (
                  <Select value="" onChange={(id) => id && set('selectedLoras', { ...p.selectedLoras, [id]: 0.75 })}
                    options={[...unusedLoras].sort((a, b) => Number(loraFit(p.engine, b.family).ok) - Number(loraFit(p.engine, a.family).ok)).map((l) => {
                      const f = loraFit(p.engine, l.family)
                      return { value: l.id, label: f.ok ? `${l.name} (${l.kind})` : `${l.name} — ${f.why}`, disabled: !f.ok }
                    })} placeholder={tr("+ Add LoRA")} />
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setBrowserOpen(true)}>{tr("Find LoRA on Hugging Face…")}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => importLora('file')}>{tr("Import LoRA file…")}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => importLora('folder')}>{tr("Import LoRA folder…")}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setTrainOpen(true)}>{tr("Train your own LoRA…")}</button>
                </div>
                <span style={hint}>{tr('Folder')}: {loraDir || '…'}. {tr('The engine applies one LoRA per render (the strongest).')}</span>

                {studio && (
                  <>
                    <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{tr("Source and reference")}</div>
                    <Field name={tr("Source track")} hintText={tr("Pick a track to cover or remix. Repaint and extend need a newer engine build.")}>
                      <FilePick value={p.sourceTrack} onChange={(v) => set('sourceTrack', v)} placeholder={tr("Choose a track…")} />
                    </Field>
                    {p.sourceTrack && (
                      <>
                        <Field name={tr("Task")}>
                          <Select value={p.sourceTask} onChange={(v) => set('sourceTask', v as MusicParams['sourceTask'])}
                            options={[{ value: 'cover', label: tr("Cover / remix") }, { value: 'repaint', label: tr("Repaint") }, { value: 'extend', label: tr("Extend") }]} />
                        </Field>
                        <SliderRow name={tr("Source strength")} value={p.sourceStrength} min={0} max={1} step={0.05} onChange={(v) => set('sourceStrength', v)} />
                      </>
                    )}
                    <Field name={tr("Timbre reference")} hintText={tr("A track whose sound the render follows.")}>
                      <FilePick value={p.timbreReference} onChange={(v) => set('timbreReference', v)} placeholder={tr("No reference")} />
                    </Field>

                    <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{tr("Stage 1 · Language model")}</div>
                    <Toggle name={tr("Let the model think")} checked={p.think} onChange={(v) => set('think', v)}
                      hintText={tr("The language model plans the song first: metadata, lyrics when there are none, the structure.")} />
                    <Toggle name={tr("Rewrite the style")} checked={p.rewriteStyle} onChange={(v) => set('rewriteStyle', v)}
                      hintText={tr("The model enriches the caption while it plans; off keeps your words.")} />
                    <SliderRow name={tr("Temperature")} value={p.temperature} min={0} max={2} step={0.01} onChange={(v) => set('temperature', v)} />
                    <SliderRow name={tr("CFG scale")} value={p.cfgScale} min={0} max={10} step={0.1} digits={1} onChange={(v) => set('cfgScale', v)} />
                    <SliderRow name={tr("Top-P")} value={p.topP} min={0} max={1} step={0.01} onChange={(v) => set('topP', v)} />
                    <SliderRow name={tr("Top-K")} value={p.topK} min={0} max={200} step={1} digits={0} onChange={(v) => set('topK', v)} />
                    <SliderRow name={tr("Melodic variation")} value={p.melodicVariation} min={1} max={1.5} step={0.01} onChange={(v) => set('melodicVariation', v)}
                      hintText={tr("Penalises repeated audio codes against a melody stuck in a loop. 1.00 is off; about 1.05–1.15 helps.")} />
                    <Field name={tr("Negative prompt")}><textarea rows={2} value={p.negativePrompt} onChange={(e) => set('negativePrompt', e.target.value)} /></Field>
                    <Field name={tr("LM seed")}><input value={p.lmSeed} placeholder={tr("Random")} onChange={(e) => set('lmSeed', e.target.value)} /></Field>
                    <Field name={tr("Audio codes")} hintText={tr("The structure of a track as the language model wrote it; with codes the model does not plan again.")}>
                      <textarea rows={2} value={p.audioCodes} onChange={(e) => set('audioCodes', e.target.value)} />
                    </Field>

                    <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{tr("Rendering")}</div>
                    <SliderRow name={tr("Guidance")} value={p.guidance} min={1} max={30} step={0.5} digits={1} onChange={(v) => set('guidance', v)} />
                    <SliderRow name={tr("Shift")} value={p.shift} min={0} max={10} step={0.1} digits={1} onChange={(v) => set('shift', v)} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field name={tr("Solver")}><Select value={p.solver} onChange={(v) => set('solver', v)}
                        options={[{ value: 'euler', label: tr("Euler") }, { value: 'heun', label: tr("Heun") }, { value: 'pingpong', label: tr("Ping-pong") }]} /></Field>
                      <Field name={tr("Schedule")}><Select value={p.schedule} onChange={(v) => set('schedule', v)}
                        options={[{ value: 'linear-quadratic', label: tr("Linear-Quadratic") }, { value: 'linear', label: tr("Linear") }]} /></Field>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <Field name={tr("DCW")}><Select value={p.dcwMode} onChange={(v) => set('dcwMode', v)}
                        options={[{ value: 'off', label: tr("Off") }, { value: 'on', label: tr("On") }]} /></Field>
                      <Field name={tr("Strength")}><input type="number" step={0.01} value={p.dcwStrength} disabled={p.dcwMode === 'off'}
                        onChange={(e) => set('dcwStrength', Number(e.target.value))} /></Field>
                      <Field name={tr("High band")}><input type="number" step={0.01} value={p.dcwHighBand} disabled={p.dcwMode === 'off'}
                        onChange={(e) => set('dcwHighBand', Number(e.target.value))} /></Field>
                    </div>
                    <Field name={tr("Custom timesteps")} hintText={tr("Replaces steps and shift; the last value is the end point.")}>
                      <input value={p.customTimesteps} placeholder={tr("0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0")}
                        onChange={(e) => set('customTimesteps', e.target.value)} style={{ fontFamily: 'monospace' }} />
                    </Field>
                    <SliderRow name={tr("Retake")} value={p.retake} min={0} max={1} step={0.01} onChange={(v) => set('retake', v)}
                      hintText={tr("A variation of the same take: 0 keeps it, 1 is the take of the retake seed.")} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field name={tr("Latent shift")}><input type="number" step={0.01} value={p.latentShift} onChange={(e) => set('latentShift', Number(e.target.value))} /></Field>
                      <Field name={tr("Latent scale")}><input type="number" step={0.01} value={p.latentScale} onChange={(e) => set('latentScale', Number(e.target.value))} /></Field>
                    </div>

                    <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{tr("LoRA by layer")}</div>
                    <span style={hint}>{tr("Strength of every LoRA in each part of the DiT (used when the engine supports it).")}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {LAYERS.map((l) => (
                        <SliderRow key={l.key} name={tr(l.label)} value={p.loraLayers[l.key]} min={0} max={2} step={0.05}
                          onChange={(v) => set('loraLayers', { ...p.loraLayers, [l.key]: v })} />
                      ))}
                    </div>

                    <div style={{ ...label, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{tr("Stage 3 · Output")}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field name={tr("MP3 bitrate, kbps")}><Select value={String(p.mp3Bitrate)} onChange={(v) => set('mp3Bitrate', Number(v))}
                        options={['128', '192', '256', '320'].map((b) => ({ value: b, label: `${b} kbps` }))} /></Field>
                      <Field name={tr("Output format")}><Select value={p.format} onChange={(v) => set('format', v as MusicParams['format'])}
                        options={[{ value: 'flac', label: tr("FLAC") }, { value: 'mp3', label: tr("MP3") }, { value: 'wav', label: tr("WAV") }]} /></Field>
                      <Field name={tr("Fade in, s")}><input type="number" min={0} step={0.1} value={p.fadeIn} onChange={(e) => set('fadeIn', Math.max(0, Number(e.target.value)))} /></Field>
                      <Field name={tr("Fade out, s")}><input type="number" min={0} step={0.1} value={p.fadeOut} onChange={(e) => set('fadeOut', Math.max(0, Number(e.target.value)))} /></Field>
                    </div>
                    <span style={hint}>{tr("FLAC and MP3 conversion and fades need ffmpeg on the PATH.")}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── takes: the songs of this session, like takes in a DAW ── */}
      <section style={{ ...card, margin: '0 18px', maxHeight: '34%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <header style={panelHead}>
          <span style={label}>{tr("Takes")}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {job?.status === 'done' && job.results.length > 0 && job.id !== previewJobId ? (
              <>{tr("Saved in the")} <button className="btn btn-ghost" style={{ fontSize: 11, padding: '0 6px' }} onClick={() => useUIStore.getState().setActiveView('library')}>{tr("Library")}</button></>
            ) : job ? `${job.results.length} ${tr('of')} ${job.progress?.total ?? count}` : ''}
          </span>
        </header>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {error && <div style={msgStyle('var(--red)')}>{error}</div>}
          {notice && <div style={msgStyle('var(--green)')}>{notice}</div>}
          {job?.status === 'error' && <div style={msgStyle('var(--red)')}>{job.error}</div>}
          {job?.status === 'cancelled' && (
            <div style={msgStyle('var(--yellow)')}>{tr('Cancelled.')}{job.results.length > 0 ? ` ${job.results.length} ${tr('finished song(s) are kept in the library.')}` : ''}</div>
          )}
          {job?.warnings.map((w, i) => <div key={i} style={msgStyle('var(--yellow)')}>{w}</div>)}
          {(() => {
            // lyrics were typed, but the chosen model cannot sing: say so BEFORE the user waits for a song without vocals
            if (!cur || cur.vocals || p.instrumental || (!p.lyrics.trim() && !p.acapella)) return null
            const singers = engines.filter((e) => e.vocals && e.kind === 'built-in' && e.usable)
            return (
              <div style={{ ...msgStyle('var(--yellow)'), display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b>{cur.name}: {tr('this model cannot sing. Your lyrics would be ignored and the song would have no vocals.')}</b>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {singers.map((e) => (
                    <button key={e.id} className="btn btn-primary" style={{ fontSize: 11 }}
                      onClick={() => { try { localStorage.setItem('ams-engine-chosen', '1') } catch { /* private mode */ } set('engine', e.id) }}>
                      {tr('Use')} {e.name}{e.status === 'slow' ? ` (${tr('slow here')})` : ''}
                    </button>
                  ))}
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => set('instrumental', true)}>{tr('Make it instrumental')}</button>
                </div>
              </div>
            )
          })()}
          {busy && job && <ProgressPanel job={job} />}
          {/* the newest take on top */}
          {job?.results.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
            <TakeRow key={r.audio_file} path={r.audio_file}
              name={<ResultName result={r} fallback={takeName(i)} />}
              meta={`${tr('seed')} ${r.seed}${p.singerVoice ? '' : ''}`}
              actions={job.id === previewJobId ? (
                <button className="btn btn-primary" style={{ fontSize: 11 }} title={tr('Make the whole song with this voice (its seed)')}
                  onClick={() => useVoice(r.seed)}>🎤 {tr('Use this voice')}</button>
              ) : (
                <>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr("Add to project")}
                    onClick={() => addToProject({ ...job, results: [r] })}>→ {tr('Studio')}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Open this song in Mastering')}
                    onClick={() => sendToMastering(r.audio_file, `${p.title || tr('Untitled')} ${i + 1}`)}>{tr('Master')}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Split this song into vocals, drums, bass and more')}
                    onClick={() => sendToStemSplitter(r.audio_file, `${p.title || tr('Untitled')} ${i + 1}`)}>{tr('Stems')}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Turn this song into MIDI tracks (Audio → MIDI)')}
                    onClick={() => sendToAudioToMidi(r.audio_file)}>{tr('→ MIDI')}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Open file')}
                    onClick={() => window.api.shell.openPath(r.audio_file)}>⋯</button>
                </>
              )} />
          ))}
          {!job && !error && !notice && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)' }}>{tr("Your songs appear here as takes. Describe the music above and press Create.")}</div>
          )}
        </div>
      </section>

      {/* ── render bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', marginTop: 10, borderTop: '1px solid var(--border-mid)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {busy && job ? (
          <button className="btn" onClick={() => void useMusicJob.getState().cancel()} disabled={!!job.cancel}
            title={tr('Stop creating. Songs that are already finished stay in the library.')}
            style={{ width: 220, height: 42, justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent' }}>
            {job.cancel ? tr('Cancelling…') : `■ ${tr('Stop')}`}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={create} disabled={!canCreate}
            style={{ width: 220, height: 42, justifyContent: 'center', fontSize: 15, fontWeight: 800, boxShadow: canCreate ? '0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent)' : undefined }}>
            {`${p.loop ? tr('Create loop') : tr('Create')}${count > 1 ? `  (${count})` : ''}  ▸`}
          </button>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          {tr("Into")}
          <select value={intoProject} onChange={(e) => setIntoProject(e.target.value as 'none' | 'new')} style={{ fontSize: 12 }}>
            <option value="none">{tr("Library only")}</option>
            <option value="new">{tr("New track(s) in the Studio")}</option>
          </select>
        </label>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden', position: 'relative' }}>
          {busy && (overall !== null
            ? <div style={{ height: '100%', width: `${Math.round(overall * 100)}%`, background: 'var(--accent)', transition: 'width 400ms' }} />
            : <div style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'var(--accent)', borderRadius: 4, animation: 'ams-indeterminate 1.4s ease-in-out infinite' }} />)}
        </div>
        <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 320 }}>
          {busy && job ? `${job.progress && job.progress.total > 1 ? `${tr('Take')} ${Math.min(job.progress.done + 1, job.progress.total)}/${job.progress.total} · ` : ''}${job.stage_text ?? tr('Starting…')}` : count > 1 ? `${count} ${tr('takes')}` : ''}
        </span>
      </div>
    </div>
  )
}

// ─── layout helpers of the page ──────────────────────────────────────────────

const panelHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '8px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0
}
const lcdBox: React.CSSProperties = {
  background: '#05080c', border: '1px solid #1f2a37', borderRadius: 5, padding: '3px 8px', color: '#7dd3fc',
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, fontVariantNumeric: 'tabular-nums'
}
const lcdText: React.CSSProperties = {
  background: '#05080c', border: '1px solid #1f2a37', borderRadius: 7, padding: '8px 10px', color: '#d6dee6',
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13
}
const msgStyle = (color: string): React.CSSProperties => ({ padding: '7px 12px', fontSize: 12, color, borderBottom: '1px solid var(--border-subtle)' })

function RackRow({ k, title, children }: { k: string; title?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ ...label, width: 84, flexShrink: 0, fontSize: 9.5 }}>{k}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  )
}

function MiniSeg({ value, onChange, options, title }: {
  value: string; onChange: (v: string) => void; options: Array<[string, string]>; title?: string
}): React.ReactElement {
  return (
    <div title={title} style={{ display: 'inline-flex', border: '1px solid var(--border-mid)', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '3px 9px', fontSize: 11.5, border: 'none', cursor: 'pointer',
          background: value === v ? 'var(--accent-dim)' : 'transparent', color: value === v ? 'var(--accent-light)' : 'var(--text-secondary)',
          fontWeight: value === v ? 700 : 500
        }}>{l}</button>
      ))}
    </div>
  )
}

function Stepper({ value, min, max, onChange, title }: { value: number; min: number; max: number; onChange: (v: number) => void; title: string }): React.ReactElement {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-mid)', borderRadius: 5, overflow: 'hidden' }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={stepBtn}>−</button>
      <span style={{ ...lcdBox, border: 'none', borderRadius: 0, minWidth: 26, textAlign: 'center', padding: '2px 4px' }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={stepBtn}>+</button>
    </span>
  )
}
const stepBtn: React.CSSProperties = { border: 'none', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: 20, cursor: 'pointer', fontSize: 12, padding: '2px 0' }

// The lyrics like a code editor: line numbers on the left, section lines ([Verse]) in the accent colour.
function LyricsEditor({ value, onChange, inputRef, placeholder }: {
  value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLTextAreaElement>; placeholder: string
}): React.ReactElement {
  const back = useRef<HTMLDivElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const lines = value.split('\n')
  const sync = (): void => {
    const t = inputRef.current
    if (!t) return
    if (back.current) back.current.scrollTop = t.scrollTop
    if (gutter.current) gutter.current.scrollTop = t.scrollTop
  }
  const font: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5, lineHeight: '19px' }
  return (
    <div style={{ flex: 1, minHeight: 140, display: 'flex', borderTop: '1px solid var(--border-subtle)', background: '#0d1117' }}>
      <div ref={gutter} style={{ ...font, width: 38, flexShrink: 0, overflow: 'hidden', padding: '8px 6px 8px 0', textAlign: 'right', color: '#3b4654', background: '#0a0e13', borderRight: '1px solid var(--border-subtle)', userSelect: 'none' }}>
        {Array.from({ length: Math.max(1, lines.length) }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        {/* the coloured copy behind the (transparent) text field */}
        <div ref={back} aria-hidden style={{ ...font, position: 'absolute', inset: 0, padding: 8, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#d1d9e0', pointerEvents: 'none' }}>
          {lines.map((l, i) => <div key={i} style={/^\s*\[.*\]\s*$/.test(l) ? { color: 'var(--accent-light)', fontWeight: 700 } : undefined}>{l || ' '}</div>)}
        </div>
        <textarea ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} onScroll={sync} placeholder={placeholder} spellCheck={false}
          style={{ ...font, position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 8, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'transparent', caretColor: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
      </div>
    </div>
  )
}
