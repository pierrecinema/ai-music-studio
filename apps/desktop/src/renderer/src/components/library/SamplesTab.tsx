import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SampleEntry } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { previewSample, stopPreview } from '../../audio/engine'
import { importAudioFiles } from '../timeline/Timeline'

const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 12, background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-primary)' }
const base = (p: string): string => p.split(/[\\/]/).filter(Boolean).slice(-2).join(' / ')

export function SamplesTab(): React.ReactElement {
  const projectBpm = useProjectStore((s) => s.project.bpm)
  const [folders, setFolders] = useState<string[]>([])
  const [ableton, setAbleton] = useState<string[]>([])
  const [root, setRoot] = useState<string>('')
  const [query, setQuery] = useState('')
  const [nearTempo, setNearTempo] = useState(false)
  const [items, setItems] = useState<SampleEntry[]>([])
  const [counts, setCounts] = useState({ total: 0, count: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [synced, setSynced] = useState(true)
  const [measured, setMeasured] = useState<Record<string, number | null>>({})
  const timer = useRef<number | null>(null)

  const loadFolders = useCallback(async () => {
    try {
      const r = await api.samples.folders()
      setFolders(r.folders); setAbleton(r.ableton.filter((a) => !r.folders.includes(a)))
    } catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { void loadFolders(); return () => stopPreview() }, [loadFolders])

  const search = useCallback(async () => {
    if (!folders.length) { setItems([]); setCounts({ total: 0, count: 0 }); return }
    setBusy(true)
    try {
      const r = await api.samples.search(query, root || undefined, nearTempo ? projectBpm : undefined)
      setItems(r.items); setCounts({ total: r.total, count: r.count }); setError(null)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }, [folders, query, root, nearTempo, projectBpm])

  // search while typing (after a short pause)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void search(), 250)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [search])

  const addFolder = async (path?: string): Promise<void> => {
    const p = path ?? await window.api.loras.pick('folder')
    if (!p) return
    try { const r = await api.samples.addFolder(p); setFolders(r.folders); setAbleton((a) => a.filter((x) => x !== p)); setNotice(null) } catch (e) { setError((e as Error).message) }
  }
  const removeFolder = async (p: string): Promise<void> => {
    try { const r = await api.samples.removeFolder(p); setFolders(r.folders); if (root === p) setRoot('') } catch (e) { setError((e as Error).message) }
  }

  // the tempo to sync from: guessed from the name, or measured now
  const tempoOf = async (e: SampleEntry): Promise<number | null> => {
    if (e.bpm) return e.bpm
    if (e.path in measured) return measured[e.path]
    try {
      const r = await api.samples.analyze(e.path)
      setMeasured((m) => ({ ...m, [e.path]: r.bpm }))
      return r.bpm
    } catch (err) { setError((err as Error).message); return null }
  }

  const detect = async (e: SampleEntry): Promise<void> => {
    setError(null); setNotice(`Measuring the tempo of “${e.name}”…`)
    const t = await tempoOf(e)
    setNotice(t ? `“${e.name}”: about ${t} BPM (measured; double-check by ear: it can be half or double).` : `“${e.name}” has no clear tempo (probably a one-shot).`)
  }

  const play = async (e: SampleEntry): Promise<void> => {
    if (playing === e.path) { stopPreview(); setPlaying(null); return }
    setError(null)
    try {
      const bpm = synced ? await tempoOf(e) : null
      const r = await previewSample(e.path, bpm ?? undefined)
      if (!r) { setError('This file cannot be played.'); return }
      setPlaying(e.path)
      void r.ended.then(() => setPlaying((p) => (p === e.path ? null : p)))
    } catch (err) { setError((err as Error).message) }
  }

  const add = async (e: SampleEntry, sync: boolean): Promise<void> => {
    setError(null)
    const st = useProjectStore.getState()
    const sel = st.project.tracks.find((t) => t.id === st.selectedTrackId)
    const bpm = sync ? await tempoOf(e) : null
    if (sync && !bpm) { setNotice(`No tempo found for “${e.name}”: it was added without syncing.`) }
    const problems = await importAudioFiles([e.path], {
      trackId: sel?.type === 'audio' ? sel.id : undefined,
      startBeat: useAudioStore.getState().currentBeat,
      warpBpm: sync && bpm ? bpm : undefined
    })
    if (problems.length) { setError(problems.join(' ')); return }
    const tracks = useProjectStore.getState().project.tracks
    const track = tracks.find((t) => t.clips.some((c) => c.audioFile === e.path)) ?? tracks[tracks.length - 1]
    if (track && !sel) useProjectStore.getState().updateTrack(track.id, { name: e.name })
    setNotice(sync && bpm ? `“${e.name}” was added and synced from ${Math.round(bpm)} to ${projectBpm} BPM.` : `“${e.name}” was added.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={muted}>
        Point the app at any sample folders, for example your <b>Ableton Live library</b>. Nothing is copied: the files stay where they are.
        <b> Add synced</b> stretches a loop to the project tempo without changing its pitch; one-shots are inserted unchanged.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {folders.map((f) => (
          <span key={f} style={{ ...chip, outline: root === f ? '1px solid var(--accent)' : 'none', cursor: 'pointer' }} title={f} onClick={() => setRoot(root === f ? '' : f)}>
            {base(f)}
            <span style={{ color: 'var(--text-muted)' }} title="Remove this folder from the list (files stay)" onClick={(e) => { e.stopPropagation(); void removeFolder(f) }}>×</span>
          </span>
        ))}
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void addFolder()}>Add folder…</button>
      </div>

      {ableton.length > 0 && (
        <div style={{ border: '1px solid var(--border-mid)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Ableton Live found on this computer</div>
          {ableton.map((a) => (
            <div key={a} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...muted, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{a}</span>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => void addFolder(a)}>Use this library</button>
            </div>
          ))}
        </div>
      )}

      {folders.length === 0 && ableton.length === 0 && (
        <div style={{ ...muted, border: '1px dashed var(--border-mid)', borderRadius: 10, padding: 20, lineHeight: 1.7 }}>
          No sample folder yet. Press <b>Add folder…</b> and choose, for example, the <i>Samples</i> folder of your Ableton User Library
          (usually in Documents\Ableton\User Library\Samples) or of a pack.
        </div>
      )}

      {folders.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or folder, e.g. kick, bass loop, 128…" style={{ width: 300 }} />
          <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={nearTempo} onChange={(e) => setNearTempo(e.target.checked)} /> Only near {projectBpm} BPM
          </label>
          <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={synced} onChange={(e) => setSynced(e.target.checked)} /> Preview at project tempo
          </label>
          <span style={{ flex: 1 }} />
          <span style={muted}>{busy ? 'Searching…' : `${counts.count} of ${counts.total} files${counts.count > items.length ? ` (first ${items.length})` : ''}`}</span>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontSize: 12 }}>{notice}</div>}

      {items.map((e) => {
        const tempo = e.bpm ?? measured[e.path] ?? null
        return (
          <div key={e.path} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ width: 30, height: 30, borderRadius: 15, padding: 0, justifyContent: 'center' }} onClick={() => void play(e)} title={playing === e.path ? 'Stop' : 'Play'}>
              {playing === e.path ? '■' : '▶'}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
              <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.path}>{e.folder || base(e.root)}</div>
            </div>
            {tempo ? (
              <span style={chip} title={e.bpm ? 'Tempo from the name' : 'Tempo measured'}>{Math.round(tempo)} BPM</span>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => void detect(e)} title="Measure the tempo">BPM?</button>
            )}
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => void add(e, true)} title={`Insert on the audio track and stretch to ${projectBpm} BPM`}>Add synced</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void add(e, false)}>Add as is</button>
          </div>
        )
      })}
    </div>
  )
}
