import React, { useCallback, useEffect, useState } from 'react'
import { api, type CapabilityReport } from '../../lib/api'

const card: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 14,
  display: 'flex', flexDirection: 'column', gap: 8,
}
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }

const BADGE = {
  ready: { text: 'Runs well', color: 'var(--green)' },
  slow: { text: 'Slow here', color: 'var(--orange)' },
  unavailable: { text: 'Not possible', color: 'var(--red)' },
} as const

export function HardwareTab(): React.ReactElement {
  const [r, setR] = useState<CapabilityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // everything needed to understand a problem on this computer, in one paste (no personal files, no keys)
  const copyDiagnostics = async (): Promise<void> => {
    const cap = r ? JSON.stringify({ tier: r.tier, machine: r.machine, features: r.features.map((f) => `${f.id}: ${f.status} ${f.reason}`) }, null, 1) : 'no hardware report'
    const eng = await window.api.engines.status().catch(() => null)
    const log = await window.api.server.logTail().catch(() => '')
    const text = [
      `AI Music Studio v${__APP_VERSION__}`,
      '',
      '== Hardware ==',
      cap,
      '',
      '== Engines ==',
      JSON.stringify(eng, null, 1),
      '',
      '== Backend log (end) ==',
      log,
    ].join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 4000) } catch { /* clipboard blocked */ }
  }

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true); setError(null)
    try { setR(await api.system.capabilities(refresh)) } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }, [])
  useEffect(() => { void load(false) }, [load])

  if (error) return <div style={{ padding: 24, color: 'var(--red)', fontSize: 12 }}>The AI backend is not reachable: {error}</div>
  if (!r) return <div style={{ padding: 24, ...muted }}>Checking your computer… (a few seconds)</div>

  const m = r.machine
  const groups = Array.from(new Set(r.features.map((f) => f.group)))
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      <section style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 12 }}>
          <span style={muted}>Processor</span><span>{m.cpu || 'unknown'} · {m.threads} threads</span>
          <span style={muted}>Memory</span><span>{m.ram_gb} GB RAM</span>
          <span style={muted}>Graphics</span>
          <span>
            {m.gpus.length === 0 ? 'none found' : m.gpus.map((g) => `${g.name}${g.vram_gb ? ` (${g.vram_gb} GB)` : ''}`).join(', ')}
            {m.cuda ? ' · CUDA ready' : ''}
          </span>
          <span style={muted}>Free disk space</span><span>{m.disk_free_gb} GB (models drive)</span>
        </div>
        <div style={muted}>
          This list tells you what to expect. Features marked “Slow here” still work, they just take longer.
          Nothing is blocked unless the computer truly cannot run it.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={busy} onClick={() => void load(true)}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void window.api.server.showLog()}>
            Show backend log file
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void copyDiagnostics()}>
            {copied ? 'Copied: paste it into the chat' : 'Copy diagnostics'}
          </button>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g} style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{g}</div>
          {r.features.filter((f) => f.group === g).map((f) => (
            <div key={f.id} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{f.name}</div>
                <div style={muted}>{f.status === 'ready' ? f.need : f.reason || f.need}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: BADGE[f.status].color, flexShrink: 0 }}>{BADGE[f.status].text}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
