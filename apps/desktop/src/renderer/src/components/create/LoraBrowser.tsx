import React, { useCallback, useEffect, useState } from 'react'

type RepoInfo = HfRepoInfo
interface FileInfo { name: string; size: number }

const fmtSize = (b: number): string =>
  b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`
const fmtCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

// Best guess from the repo name and tags; the model card has the truth.
function fit(r: RepoInfo): { text: string; color: string } {
  const s = `${r.id} ${r.tags.join(' ')}`.toLowerCase()
  if (/\bxl\b|[-_]xl[-_]|xl-base/.test(s) || /1\.5|v15|acestep1\.5|5b/.test(s)) {
    return { text: 'made for ACE-Step 1.5 / XL, this app runs ACE-Step v1: it may not load', color: 'var(--orange)' }
  }
  if (/(^|[^\d.])v1([^\d.]|$)/.test(s)) {
    return { text: 'made for ACE-Step v1: fits this app', color: 'var(--green)' }
  }
  return { text: 'model version unknown: check the model card', color: 'var(--text-muted)' }
}

const box: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10
}

export function LoraBrowser({ open, onClose, onImported }: {
  open: boolean
  onClose: () => void
  onImported: (lora: LoraInfo) => void
}): React.ReactElement | null {
  const [query, setQuery] = useState('')
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [progress, setProgress] = useState({ received: 0, total: 0 })
  const [done, setDone] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    setLoading(true); setError(null); setRepo(null); setFiles([])
    const r = await window.api.huggingface.search(q)
    if (r.ok) setRepos(r.repos); else { setRepos([]); setError(r.error) }
    setLoading(false)
  }, [])

  useEffect(() => { if (open) { setDone(null); void search('') } }, [open, search])
  useEffect(() => (open ? window.api.huggingface.onProgress(setProgress) : undefined), [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busyFile) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busyFile, onClose])

  const openRepo = async (r: RepoInfo): Promise<void> => {
    setRepo(r); setFiles([]); setFilesLoading(true); setError(null); setDone(null)
    const res = await window.api.huggingface.files(r.id)
    if (res.ok) { setFiles(res.files); setRepo(res.repo) } else setError(res.error)
    setFilesLoading(false)
  }

  const download = async (file: FileInfo): Promise<void> => {
    if (!repo) return
    setBusyFile(file.name); setProgress({ received: 0, total: file.size }); setError(null); setDone(null)
    const res = await window.api.huggingface.download(repo.id, file.name, 'style')
    setBusyFile(null)
    if (res.ok) { setDone(`"${res.lora.name}" is downloaded and added to your LoRAs.`); onImported(res.lora) }
    else setError(res.error)
  }

  if (!open) return null
  const pct = progress.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0

  return (
    <div
      onClick={() => { if (!busyFile) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...box, width: 'min(860px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-mid)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>LoRA from Hugging Face</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Search is sorted by likes. Paste a huggingface.co link or owner/name to open a repo directly.</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!busyFile} aria-label="Close" style={{ padding: '2px 10px' }}>✕</button>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); void search(query) }}
          style={{ display: 'flex', gap: 8, padding: '12px 16px' }}
        >
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
            placeholder="e.g. synthwave, jazz, rap, or tarn59/super_eurobeats_ACE_STEP-1.5-lora"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !!busyFile}>{loading ? 'Searching…' : 'Search'}</button>
        </form>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, padding: '0 16px 8px' }}>{error}</div>}
        {done && <div style={{ color: 'var(--green)', fontSize: 12, padding: '0 16px 8px' }}>{done}</div>}

        <div style={{ display: 'flex', gap: 12, padding: '0 16px 16px', minHeight: 0, flex: 1, overflow: 'hidden' }}>
          {/* results */}
          <div style={{ ...box, flex: '1 1 50%', overflowY: 'auto', minHeight: 200 }}>
            {!loading && repos.length === 0 && !error && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>No LoRA found. Try another word.</div>
            )}
            {repos.map((r) => (
              <button
                key={r.id} onClick={() => void openRepo(r)} disabled={!!busyFile}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                  background: repo?.id === r.id ? 'var(--accent-dim)' : 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>{r.id}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  ♥ {fmtCount(r.likes)} · ↓ {fmtCount(r.downloads)}{r.license ? ` · ${r.license}` : ''}{r.gated ? ' · gated' : ''}
                </div>
              </button>
            ))}
          </div>

          {/* details */}
          <div style={{ ...box, flex: '1 1 50%', overflowY: 'auto', minHeight: 200, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!repo && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pick a LoRA on the left to see its files.</div>}
            {repo && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{repo.id}</div>
                <div style={{ fontSize: 11, color: fit(repo).color }}>{fit(repo).text}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Licence: <strong>{repo.license || 'not stated'}</strong>. Check it before you use the music commercially.
                </div>
                <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 11 }} onClick={() => void window.api.huggingface.openPage(repo.id)}>
                  Open model card in the browser
                </button>
                {repo.gated && (
                  <div style={{ fontSize: 11, color: 'var(--orange)' }}>This repo is gated: you have to accept its terms on huggingface.co. Downloading gated files is not supported yet.</div>
                )}
                {filesLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading files…</div>}
                {!filesLoading && files.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No LoRA weight files (.safetensors, .pt, .bin) in this repo.</div>}
                {files.map((f) => (
                  <div key={f.name} style={{ border: '1px solid var(--border-mid)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{f.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.size ? fmtSize(f.size) : 'size unknown'}</span>
                      {busyFile === f.name ? (
                        <button className="btn btn-ghost" onClick={() => void window.api.huggingface.cancel()}>Cancel</button>
                      ) : (
                        <button className="btn btn-primary" disabled={!!busyFile || repo.gated} onClick={() => void download(f)}>Download</button>
                      )}
                    </div>
                    {busyFile === f.name && (
                      <>
                        <div style={{ height: 5, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 200ms' }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtSize(progress.received)} of {progress.total ? fmtSize(progress.total) : '?'} ({pct}%)</span>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
