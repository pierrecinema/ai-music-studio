import React, { useEffect, useRef, useState } from 'react'
import { api, type TrainItem, type TrainJob, type TrainOptions } from '../../lib/api'

const box: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10 }
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }
const lab: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const COLOR = { ready: 'var(--green)', slow: 'var(--orange)', unavailable: 'var(--red)' } as const
const TEXT = {
  ready: 'Your computer can train this.',
  slow: 'Your computer can train this, but slowly.',
  unavailable: 'Your computer cannot train this.',
} as const

export function TrainLora({ open, onClose, onDone }: {
  open: boolean
  onClose: () => void
  onDone: (loraId: string) => void
}): React.ReactElement | null {
  const [items, setItems] = useState<TrainItem[]>([])
  const [edit, setEdit] = useState<Record<string, { caption: string; lyrics: string }>>({})
  const [name, setName] = useState('my_style')
  const [shared, setShared] = useState('')
  const [preset, setPreset] = useState('normal')
  const [rank, setRank] = useState(256)
  const [opts, setOpts] = useState<TrainOptions | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string[]>([])
  const [dataset, setDataset] = useState<{ dir: string; songs: number } | null>(null)
  const [bundle, setBundle] = useState<string | null>(null)
  const [job, setJob] = useState<TrainJob | null>(null)
  const timer = useRef<number | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (open) api.train.options(Math.max(items.length, 1)).then(setOpts).catch((e) => setError((e as Error).message))
  }, [open, items.length])
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  if (!open) return null

  const running = job?.status === 'running' || job?.status === 'queued'
  const get = (it: TrainItem): { caption: string; lyrics: string } =>
    edit[it.path] ?? { caption: it.caption || it.guess, lyrics: it.lyrics }
  const setField = (it: TrainItem, k: 'caption' | 'lyrics', v: string): void =>
    setEdit((e) => ({ ...e, [it.path]: { ...get(it), [k]: v } }))

  const pick = async (): Promise<void> => {
    const folder = await window.api.loras.pick('folder')
    if (!folder) return
    setError(null); setBusy('Reading the folder…'); setDataset(null); setBundle(null)
    try {
      const r = await api.train.scan(folder)
      setItems(r.items); setEdit({})
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  const build = async (): Promise<{ dir: string; songs: number } | null> => {
    setError(null); setBusy('Converting the songs to the training format…')
    try {
      const d = await api.train.dataset({
        name, shared_tags: shared,
        items: items.map((it) => ({ path: it.path, seconds: it.seconds, ...get(it) })),
      })
      setInfo(d.warnings); setDataset({ dir: d.dir, songs: d.songs })
      return { dir: d.dir, songs: d.songs }
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally { setBusy(null) }
  }

  const exportIt = async (): Promise<void> => {
    const d = await build()
    if (!d) return
    setBusy('Packing the bundle…')
    try {
      const r = await api.train.exportBundle({ name, dataset_dir: d.dir, songs: d.songs, preset, rank })
      setBundle(r.zip)
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  const train = async (): Promise<void> => {
    const d = await build()
    if (!d) return
    try {
      const { jobId } = await api.train.start({ name, dataset_dir: d.dir, songs: d.songs, preset, rank })
      setJob({ id: jobId, status: 'queued', stage: 'repo', stage_text: 'Starting', log: [] })
      timer.current = window.setInterval(async () => {
        try {
          const j = await api.train.job(jobId)
          setJob(j)
          if (j.status !== 'running' && j.status !== 'queued') {
            if (timer.current) clearInterval(timer.current)
            if (j.status === 'done' && j.lora) onDone(j.lora.id)
          }
        } catch { /* backend busy: try again */ }
      }, 2000)
    } catch (e) { setError((e as Error).message) }
  }

  const v = opts?.verdict
  const known = job?.step_total ? Math.min(1, (job.step ?? 0) / job.step_total) : null
  const elapsed = job?.started ? Math.max(0, now / 1000 - job.started) : 0
  const eta = known && known > 0.03 ? (elapsed / known) * (1 - known) : null

  return (
    <div
      onClick={() => { if (!running && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...box, width: 'min(860px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border-mid)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Train your own LoRA</div>
            <div style={muted}>Teach ACE-Step a style from your own songs. Use only music you have the rights to.</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} disabled={running || !!busy}>✕</button>
        </header>

        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {v && (
            <div style={{ ...box, padding: 10, borderColor: COLOR[v.status] }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR[v.status] }}>{TEXT[v.status]}</div>
              {v.reason && <div style={muted}>{v.reason}</div>}
              {v.status === 'unavailable' && (
                <div style={muted}>
                  You can still prepare everything here and take the bundle to a stronger computer (NVIDIA graphics card,
                  12 GB or more recommended). Then import the result with “Import LoRA folder”.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={pick} disabled={!!busy || running}>1. Choose a folder with songs…</button>
            <span style={muted}>
              Text files next to a song are picked up: song_prompt.txt (style tags), song_lyrics.txt or song.txt (lyrics).
            </span>
          </div>

          {items.length > 0 && (
            <>
              <div style={lab}>2. Describe each song ({items.length} found)</div>
              <div style={{ ...box, maxHeight: 260, overflowY: 'auto' }}>
                {items.map((it) => (
                  <div key={it.path} style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{it.name}</div>
                      <div style={muted}>{it.seconds ? mmss(it.seconds) : '?'}{it.caption_found ? ' · tags found' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input
                        value={get(it).caption} onChange={(e) => setField(it, 'caption', e.target.value)}
                        placeholder="style tags, e.g. deep house, warm bass, 122 bpm" style={{ width: '100%' }}
                      />
                      <input
                        value={get(it).lyrics.includes('\n') ? '' : get(it).lyrics}
                        disabled={get(it).lyrics.includes('\n')}
                        onChange={(e) => setField(it, 'lyrics', e.target.value)}
                        placeholder={get(it).lyrics.includes('\n') ? `${get(it).lyrics.split('\n').length} lines of lyrics found` : 'lyrics (empty = instrumental)'}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={muted}>
                Good tags name the genre, mood, instruments, tempo and vocals, separated by commas. The same style words on many songs teach the LoRA best.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={lab}>Name
                  <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
                </label>
                <label style={lab}>Tags added to every song (optional)
                  <input value={shared} onChange={(e) => setShared(e.target.value)} placeholder="e.g. my-sound" style={{ width: '100%', marginTop: 4 }} />
                </label>
                <label style={lab}>Length
                  <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                    {opts && Object.entries(opts.presets).map(([k, p]) => <option key={k} value={k}>{k} · {p.steps} steps</option>)}
                  </select>
                </label>
                <label style={lab}>Strength (rank)
                  <select value={rank} onChange={(e) => setRank(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }}>
                    {opts && Object.entries(opts.ranks).map(([k, t]) => <option key={k} value={k}>{k} · {t}</option>)}
                  </select>
                </label>
              </div>
              {opts && <div style={muted}>{opts.presets[preset]?.text}</div>}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={exportIt} disabled={!!busy || running}>Build bundle for another computer</button>
                <button className="btn btn-primary" onClick={train} disabled={!!busy || running || v?.status === 'unavailable'}>3. Train here</button>
              </div>
            </>
          )}

          {busy && <div style={muted}>{busy}</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          {info.map((w, i) => <div key={i} style={{ color: 'var(--yellow)', fontSize: 11 }}>{w}</div>)}
          {bundle && (
            <div style={{ color: 'var(--green)', fontSize: 12, wordBreak: 'break-all' }}>
              Bundle ready: {bundle}. It contains the converted songs, the settings and a README with the steps.
            </div>
          )}

          {job && (
            <div style={{ ...box, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
                {job.status === 'error' ? 'Training failed' : job.status === 'done' ? 'Done: the LoRA is in your list' : job.stage_text}
              </div>
              <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                {known !== null && job.stage === 'train' ? (
                  <div style={{ height: '100%', width: `${Math.round(known * 100)}%`, background: 'var(--accent)', transition: 'width 400ms' }} />
                ) : running ? (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'var(--accent)', borderRadius: 4, animation: 'ams-indeterminate 1.4s ease-in-out infinite' }} />
                ) : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', ...muted }}>
                <span>
                  {job.stage === 'train' && known !== null ? `step ${job.step} of ${job.step_total} (${Math.round(known * 100)}%)` : 'Working…'}
                  {job.loss !== undefined ? ` · loss ${job.loss}` : ''}
                  {eta !== null ? ` · about ${mmss(eta)} left` : ''}
                </span>
                <span>Running {mmss(elapsed)}</span>
              </div>
              {job.warning && <div style={{ color: 'var(--yellow)', fontSize: 11 }}>{job.warning}</div>}
              {job.error && <div style={{ color: 'var(--red)', fontSize: 11, wordBreak: 'break-word' }}>{job.error}</div>}
              {job.log.length > 0 && (
                <pre style={{ ...muted, margin: 0, maxHeight: 90, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{job.log.slice(-6).join('\n')}</pre>
              )}
              {running && <div><button className="btn btn-ghost" onClick={() => void api.train.stop(job.id)}>Stop</button></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
