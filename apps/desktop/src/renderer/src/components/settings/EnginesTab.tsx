import React, { useCallback, useEffect, useRef, useState } from 'react'

interface Group { id: string; name: string; desc: string; note?: string; recommended?: boolean }

const GROUPS: Group[] = [
  { id: 'core', name: 'Core backend', desc: 'API server, AI chat (Claude/ChatGPT), MIDI tools. Always installed.', recommended: true },
  { id: 'torch', name: 'PyTorch', desc: 'Needed by Demucs and most local AI models.', note: 'Large download. Variant below.', recommended: true },
  { id: 'demucs', name: 'Stem separation (Demucs)', desc: 'Vocals, drums, bass, piano, guitar.', recommended: true },
  { id: 'basicpitch', name: 'Audio → MIDI (basic-pitch)', desc: 'Default transcription engine.', recommended: true },
  { id: 'matchering', name: 'Mastering (Matchering)', desc: 'Match a mix to a reference track.', recommended: true },
  { id: 'whisper', name: 'Lyric timing (faster-whisper)', desc: 'Word timestamps for karaoke export.', recommended: true },
  { id: 'video', name: 'Video analysis', desc: 'OpenCV + librosa for the video composer.' },
  { id: 'acestep', name: 'Music generator (ACE-Step)', desc: 'Full songs + LoRA. Needs Git installed. Model weights download on first use.', note: 'Large download.' },
  { id: 'musicgen', name: 'Light music generators (MusicGen, AudioLDM 2, MusicLDM)', desc: 'Instrumental clips of 10 to 30 s. They run on old PCs without a graphics card, but take minutes.', note: 'Model weights are for non-commercial use (CC-BY-NC). Each model downloads 2 to 13 GB on first use.' },
  { id: 'training', name: 'LoRA training (ACE-Step)', desc: 'Packages for training your own LoRA. Needs an NVIDIA graphics card to run; without one you can still build a bundle for another PC.', note: 'The trainer itself (35 MB) is fetched once from the ACE-Step project when you start a training. Needs Git.' },
  { id: 'muscriptor', name: 'Audio → MIDI (MuScriptor)', desc: 'More accurate transcription.', note: 'CC BY-NC 4.0: non-commercial use only, and only for music you have the rights to transcribe.' },
]

export function EnginesTab(): React.ReactElement {
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(GROUPS.filter(g => g.recommended).map(g => g.id)))
  const [torch, setTorch] = useState('cpu')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const s = await window.api.engines.status()
    setStatus(s)
    // CPU is the safe default; DirectML stays a manual choice because it needs an older Python
    setTorch(t => (t === 'cpu' && s.gpu === 'nvidia' ? 'cuda' : t))
  }, [])

  useEffect(() => {
    refresh()
    return window.api.engines.onLog(l => setLog(prev => [...prev.slice(-400), l]))
  }, [refresh])

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  const toggle = (id: string) =>
    setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const install = async () => {
    setBusy(true); setResult(null); setLog([])
    const r = await window.api.engines.install([...picked], torch)
    setResult(r.ok ? 'Installation finished.' : (r.error ?? 'Installation failed.'))
    setBusy(false)
    refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        AI Engines
      </div>

      {status && !status.pythonFound && (
        <div style={{ color: 'var(--yellow)', fontSize: 12 }}>
          Python 3.10+ was not found. Install it from python.org (tick “Add python.exe to PATH”), then reopen this page.
        </div>
      )}
      {status && status.pythonFound && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Python {status.pythonVersion} · GPU: {status.gpu} · AI backend: {status.serverReady ? 'running' : 'not running'}
        </div>
      )}
      {status?.pythonVersion && Number(status.pythonVersion.split('.')[1]) >= 13 && (
        <div style={{ color: 'var(--yellow)', fontSize: 11 }}>
          Python {status.pythonVersion} is very new: some engines (PyTorch, basic-pitch, Whisper) may fail to install.
          Python 3.11 is recommended: <code>winget install Python.Python.3.11</code>, then reopen this page.
        </div>
      )}

      <div className="panel">
        {GROUPS.map(g => {
          const done = status?.installed[g.id]
          return (
            <label key={g.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={g.id === 'core' || picked.has(g.id)} disabled={g.id === 'core' || busy} onChange={() => toggle(g.id)} />
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>{g.desc}</span>
                {g.note && <span style={{ display: 'block', fontSize: 10, color: 'var(--orange)' }}>{g.note}</span>}
              </span>
              <span style={{ fontSize: 10, color: done ? 'var(--green)' : 'var(--text-muted)' }}>{done ? 'installed' : 'not installed'}</span>
            </label>
          )
        })}
      </div>

      {picked.has('torch') && (
        <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          PyTorch variant{' '}
          <select value={torch} onChange={e => setTorch(e.target.value)} disabled={busy}>
            <option value="cpu">CPU (works everywhere)</option>
            <option value="cuda">NVIDIA CUDA</option>
            <option value="directml">AMD / any DirectX 12 GPU (DirectML, optional add-on)</option>
          </select>
          <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            DirectML needs Python 3.12 or older. If it is not available the installer keeps the CPU build and carries on.
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={busy || !status?.pythonFound} onClick={install}>
          {busy ? 'Installing…' : 'Install selected'}
        </button>
        {busy && <button className="btn btn-ghost" onClick={() => window.api.engines.cancel()}>Cancel</button>}
      </div>

      {result && <div style={{ fontSize: 12, color: result.startsWith('Installation finished') ? 'var(--green)' : 'var(--red)' }}>{result}</div>}
      {log.length > 0 && (
        <div ref={logRef} style={{ maxHeight: 180, overflow: 'auto', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: 8, fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
