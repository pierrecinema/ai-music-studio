import React, { useState } from 'react'
import { api } from '../../lib/api'
import { AudioFile } from '../common/AudioFile'

function FilePick({ label, value, onPick }: { label: string; value: string; onPick: (p: string) => void }) {
  const browse = async () => {
    const paths = await window.api.dialog.openAudio()
    if (paths[0]) onPick(paths[0])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={browse}>Choose file…</button>
        <span className="truncate" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 420 }}>
          {value || 'nothing selected'}
        </span>
      </div>
    </div>
  )
}

export function Mastering(): React.ReactElement {
  const [target, setTarget] = useState('')
  const [reference, setReference] = useState('')
  const [bits, setBits] = useState<16 | 24>(24)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true); setError(null); setOut(null)
    try {
      const r = await api.mastering.master({ targetPath: target, referencePath: reference, bitDepth: bits })
      setOut(r.audioFile)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', height: '100%' }}>
      <div className="panel-header" style={{ padding: 0, border: 'none' }}>Mastering against a reference track</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Matches loudness, EQ balance and stereo width of your mix to a reference you like (Matchering).
      </div>
      <FilePick label="Your track" value={target} onPick={setTarget} />
      <FilePick label="Reference track" value={reference} onPick={setReference} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
        Output:
        {([16, 24] as const).map(b => (
          <button key={b} className={`btn ${bits === b ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBits(b)}>
            {b}-bit WAV
          </button>
        ))}
      </div>
      <div>
        <button className="btn btn-primary" disabled={!target || !reference || busy} onClick={run}>
          {busy ? 'Mastering…' : 'Master track'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 11 }}>{error}</div>}
      {out && <AudioFile path={out} label="Mastered" />}
    </div>
  )
}
