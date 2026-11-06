import React, { useCallback, useEffect, useRef, useState } from 'react'

type Model = ModelsOverview['models'][number]

const GB = 1024 ** 3
const fmt = (b: number): string =>
  b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`

const card: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 14,
  display: 'flex', flexDirection: 'column', gap: 10,
}
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const mono: React.CSSProperties = { fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: 'var(--text-secondary)' }

const BADGE: Record<Model['status'], { text: string; color: string }> = {
  complete: { text: 'Downloaded', color: 'var(--green)' },
  downloading: { text: 'Downloading…', color: 'var(--orange)' },
  partial: { text: 'Incomplete: continues on next use', color: 'var(--orange)' },
  missing: { text: 'Not downloaded yet', color: 'var(--text-muted)' },
}

export function ModelsTab(): React.ReactElement {
  const [o, setO] = useState<ModelsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rates, setRates] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<{ path: string; free: number } | null>(null)
  const [moveFiles, setMoveFiles] = useState(true)
  const [move, setMove] = useState<{ copied: number; total: number; phase: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const last = useRef<Record<string, { bytes: number; t: number }>>({})

  const refresh = useCallback(async () => {
    const next = await window.api.models.overview()
    const now = Date.now()
    const r: Record<string, number> = {}
    for (const m of next.models) {
      const prev = last.current[m.id]
      if (prev && m.status === 'downloading' && m.bytes > prev.bytes) r[m.id] = (m.bytes - prev.bytes) / ((now - prev.t) / 1000)
      last.current[m.id] = { bytes: m.bytes, t: now }
    }
    setRates(r)
    setO(next)
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => { if (!move) void refresh() }, 3000)
    return () => window.clearInterval(id)
  }, [refresh, move])
  useEffect(() => window.api.models.onProgress(setMove), [])

  const total = o ? o.models.reduce((s, m) => s + m.bytes, 0) : 0

  const choose = async (): Promise<void> => {
    setError(null); setNotice(null)
    const path = await window.api.models.pickDir()
    if (!path) return
    const space = await window.api.models.space(path)
    setPending({ path, free: space.free })
    setMoveFiles(total > 0)
  }

  const apply = async (path: string, moveIt: boolean): Promise<void> => {
    setPending(null); setError(null); setNotice(null)
    setMove({ copied: 0, total, phase: moveIt && total > 0 ? 'copying' : 'cleaning' })
    const r = await window.api.models.move(path, moveIt && total > 0)
    setMove(null)
    if (r.ok) setNotice(moveIt && total > 0 ? 'Models moved. The AI backend restarts with the new folder.' : 'New models folder set. The AI backend restarts.')
    else setError(r.error)
    await refresh()
  }

  const remove = async (id: string): Promise<void> => {
    setConfirmDelete(null); setError(null); setNotice(null)
    const r = await window.api.models.delete(id)
    if (r.ok) setNotice('Deleted. It is downloaded again the next time it is needed.')
    else setError(r.error)
    await refresh()
  }

  const removeLora = async (id: string): Promise<void> => {
    setConfirmDelete(null); setError(null)
    const r = await window.api.models.deleteLora(id)
    if (!r.ok) setError(r.error)
    await refresh()
  }

  if (!o) return <div style={muted}>Reading the models folder…</div>

  const lowSpace = o.free > 0 && o.free < 15 * GB
  const pct = move && move.total ? Math.min(100, Math.round((move.copied / move.total) * 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        Models and storage
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontSize: 12 }}>{notice}</div>}

      {/* storage location */}
      <section style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Models folder</div>
        <div style={mono}>{o.baseDir}</div>
        <div style={{ fontSize: 12, color: lowSpace ? 'var(--orange)' : 'var(--text-secondary)' }}>
          Models use {fmt(total)} here. {o.total > 0 ? `${fmt(o.free)} free of ${fmt(o.total)} on this drive.` : ''}
          {lowSpace ? ' Space is getting tight: a folder on another drive is a good idea.' : ''}
        </div>

        {move ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${move.phase === 'copying' ? pct : 100}%`, background: 'var(--accent)', transition: 'width 200ms' }} />
            </div>
            <div style={muted}>
              {move.phase === 'copying' ? `Moving… ${fmt(move.copied)} of ${fmt(move.total)} (${pct}%). Do not close the app.`
                : move.phase === 'cleaning' ? 'Finishing, removing the old files…' : 'Done.'}
            </div>
            {move.phase === 'copying' && (
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => void window.api.models.cancelMove()}>Cancel (nothing is changed)</button>
            )}
          </div>
        ) : pending ? (
          <div style={{ border: '1px solid var(--accent)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>New folder:</div>
            <div style={mono}>{pending.path}</div>
            <div style={muted}>Free there: {fmt(pending.free)}</div>
            {total > 0 && (
              <>
                <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" checked={moveFiles} onChange={() => setMoveFiles(true)} />
                  Move the existing models ({fmt(total)}). Recommended: nothing has to be downloaded again.
                </label>
                <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" checked={!moveFiles} onChange={() => setMoveFiles(false)} />
                  Only use the new folder. Models are downloaded again when needed; the old files stay where they are.
                </label>
              </>
            )}
            {moveFiles && total > 0 && pending.free > 0 && pending.free < total + GB && (
              <div style={{ color: 'var(--red)', fontSize: 12 }}>Not enough free space there: {fmt(total + GB)} needed.</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => void apply(pending.path, moveFiles)}>{moveFiles && total > 0 ? 'Move models' : 'Use this folder'}</button>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => void choose()}>Change folder…</button>
            <button className="btn btn-ghost" onClick={() => void window.api.models.open('models')}>Open folder</button>
            {!o.usingDefault && (
              <button className="btn btn-ghost" onClick={() => void apply(o.defaultDir, true)}>Back to the default folder</button>
            )}
          </div>
        )}
      </section>

      {/* models */}
      {o.models.map((m) => {
        const badge = BADGE[m.status]
        return (
          <section key={m.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                <div style={muted}>{m.description}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: badge.color }}>{badge.text}</div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{fmt(m.bytes)}</div>
                {rates[m.id] ? <div style={muted}>{fmt(rates[m.id])}/s</div> : null}
              </div>
            </div>
            {m.id === 'acestep' && m.status === 'missing' && (
              <div style={{ fontSize: 11, color: 'var(--yellow)' }}>About 8 GB are downloaded when you create your first song.</div>
            )}
            {m.components.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                {m.components.map((c) => (
                  <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', padding: '2px 0' }}>
                    <span style={{ wordBreak: 'break-all' }}>{c.name}</span><span>{fmt(c.bytes)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={mono}>{m.dir}</div>
            {m.bytes > 0 && (
              confirmDelete === m.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--red)' }}>Really delete {fmt(m.bytes)}?</span>
                  <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={() => void remove(m.id)}>Yes, delete</button>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>No</button>
                </div>
              ) : (
                <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 11 }} onClick={() => setConfirmDelete(m.id)}>Delete to free space</button>
              )
            )}
          </section>
        )
      })}

      {/* LoRAs */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>LoRAs</div>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void window.api.models.open('loras')}>Open folder</button>
        </div>
        <div style={mono}>{o.loraDir}</div>
        {o.loras.length === 0 && <div style={muted}>No LoRAs yet. Add them in Create music → LoRA.</div>}
        {o.loras.map((l) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{l.name} <span style={muted}>({l.kind})</span></div>
              <div style={muted}>{fmt(l.bytes)}{l.source ? ` · ${l.source.replace('huggingface:', 'Hugging Face: ')}` : ''}{l.license ? ` · ${l.license}` : ''}</div>
            </div>
            {confirmDelete === `lora:${l.id}` ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={() => void removeLora(l.id)}>Delete</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>No</button>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => setConfirmDelete(`lora:${l.id}`)}>Delete</button>
            )}
          </div>
        ))}
        <div style={muted}>LoRAs stay in this folder; the models folder above does not move them.</div>
      </section>

      {/* python environment */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Python environment (engines)</div>
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{fmt(o.env.bytes)}</div>
        </div>
        <div style={mono}>{o.env.path}</div>
        <div style={muted}>Managed in Settings → AI Engines.</div>
      </section>

      <div style={{ ...muted, lineHeight: 1.5 }}>
        Model choice: with the current engine, ACE-Step v1 (3.5B) is the only music model. Other variants (XL, turbo, quantised) need a different engine and are not available yet.
      </div>
    </div>
  )
}
