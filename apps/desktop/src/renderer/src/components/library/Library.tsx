import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type LibraryTrack } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { useUIStore } from '../../stores/ui.store'
import { importAudioFiles } from '../timeline/Timeline'
import { SamplesTab } from './SamplesTab'
import { seedAnalysis } from '../../beatmatch/store'

const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const mmss = (s: number | null): string => (s == null ? '?' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const ENGINE: Record<string, string> = {
  'ace-step': 'ACE-Step', 'musicgen-small': 'MusicGen small', 'musicgen-medium': 'MusicGen medium', 'musicgen-large': 'MusicGen large',
  'audioldm2-music': 'AudioLDM 2', musicldm: 'MusicLDM', diffrhythm: 'DiffRhythm'
}

export function Library(): React.ReactElement {
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [dir, setDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<'tracks' | 'samples'>('tracks')
  // where a song lands on the timeline: always bar 1 (all songs start together), or at the playhead
  const [insertAt, setInsertAt] = useState<'bar1' | 'playhead'>(() => { try { return localStorage.getItem('ams-insert-at') === 'playhead' ? 'playhead' : 'bar1' } catch { return 'bar1' } })
  const chooseInsert = (v: 'bar1' | 'playhead'): void => { setInsertAt(v); try { localStorage.setItem('ams-insert-at', v) } catch { /* storage unavailable */ } }
  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef<string | null>(null)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const load = useCallback(async () => {
    try {
      const r = await api.library.list()
      setTracks(r.tracks); setDir(r.dir); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 5000)             // new songs appear while this is open
    return () => { window.clearInterval(id); audio.current?.pause(); if (url.current) URL.revokeObjectURL(url.current) }
  }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tracks.filter((t) => (!onlyFav || t.favorite) && (!q || `${t.title} ${t.prompt} ${t.engine}`.toLowerCase().includes(q)))
  }, [tracks, query, onlyFav])

  const play = async (t: LibraryTrack): Promise<void> => {
    if (playing === t.id) { audio.current?.pause(); setPlaying(null); return }
    try {
      const bytes = await window.api.fs.readFile(t.path)
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(new Blob([new Uint8Array(bytes)]))
      audio.current ??= new Audio()
      audio.current.src = url.current
      audio.current.onended = () => setPlaying(null)
      await audio.current.play()
      setPlaying(t.id)
    } catch (e) { setError(`Cannot play this track: ${(e as Error).message}`) }
  }

  const toProject = async (t: LibraryTrack): Promise<void> => {
    seedAnalysis(t.path, t)                                   // tempo and first beat are known: no new measurement
    const problems = await importAudioFiles([t.path], { startBeat: insertAt === 'bar1' ? 0 : useAudioStore.getState().currentBeat })
    if (problems.length) { setError(problems.join(' ')); return }
    const tracks = useProjectStore.getState().project.tracks
    useProjectStore.getState().updateTrack(tracks[tracks.length - 1].id, { name: t.title })
    setNotice(`"${t.title}" was added to the project timeline.`)
  }

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); await load() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Library</div>
        <div style={muted}>
          Every song you create is kept here for good, so nothing is lost when you close the app.
          {dir && <> Folder: <span style={{ fontFamily: 'monospace' }}>{dir}</span>{' '}
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => tracks[0] ? void window.api.files.showItem(tracks[0].path) : void window.api.shell.openPath(dir)}>Open folder</button></>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['tracks', 'samples'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { audio.current?.pause(); setPlaying(null); setTab(t) }}>
            {t === 'tracks' ? 'My tracks' : 'Samples (Ableton and others)'}
          </button>
        ))}
      </div>

      {tab === 'samples' && <SamplesTab />}

      {tab === 'tracks' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, style or model…" style={{ width: 280 }} />
        <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favourites only
        </label>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={async () => {
          const paths = await window.api.dialog.openAudio()
          for (const p of paths) await act(() => api.library.importFile(p))
        }}>Add files to the library…</button>
        <span style={{ flex: 1 }} />
        <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>Insert at
          <select value={insertAt} onChange={(e) => { chooseInsert(e.target.value as 'bar1' | 'playhead'); e.target.blur() }} style={{ fontSize: 11 }}>
            <option value="bar1">bar 1</option><option value="playhead">the playhead</option>
          </select>
        </label>
        <span style={muted}>{shown.length} of {tracks.length} tracks</span>
      </div>}

      {tab === 'tracks' && error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {tab === 'tracks' && notice && <div style={{ color: 'var(--green)', fontSize: 12 }}>{notice} <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => setActiveView('timeline')}>Show timeline</button></div>}

      {tab === 'tracks' && tracks.length === 0 && !error && (
        <div style={{ ...muted, border: '1px dashed var(--border-mid)', borderRadius: 10, padding: 24, lineHeight: 1.7 }}>
          No tracks yet. Songs made in <b>Create music</b> appear here automatically.
        </div>
      )}

      {tab === 'tracks' && shown.map((t) => (
        <div key={t.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 12, display: 'flex', gap: 12, alignItems: 'center', opacity: t.exists ? 1 : 0.55 }}>
          <button className="btn btn-primary" style={{ width: 38, height: 38, borderRadius: 19, padding: 0, justifyContent: 'center' }} disabled={!t.exists}
            title={playing === t.id ? 'Stop' : 'Play'} onClick={() => void play(t)}>{playing === t.id ? '■' : '▶'}</button>

          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming === t.id ? (
              <input autoFocus defaultValue={t.title} style={{ width: '100%', fontSize: 13 }}
                onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== t.title) void act(() => api.library.patch(t.id, { title: v })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} />
            ) : (
              <div onDoubleClick={() => setRenaming(t.id)} title="Double-click to rename" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}{!t.exists && ' (file missing)'}
              </div>
            )}
            <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.prompt}>{t.prompt || '—'}</div>
            <div style={muted}>
              {mmss(t.duration)} · {t.bpm ? `${Math.round(t.bpm)} BPM · ` : ''}{ENGINE[t.engine] ?? (t.engine || t.source)} · {new Date(t.created * 1000).toLocaleString()}{t.seed ? ` · seed ${t.seed}` : ''}
            </div>
          </div>

          <button className="btn btn-ghost" style={{ fontSize: 11 }} title="Rename this song" onClick={() => setRenaming(t.id)}>Rename</button>
          <button className="btn btn-ghost" style={{ fontSize: 16, color: t.favorite ? 'var(--yellow)' : 'var(--text-muted)' }} title="Favourite"
            onClick={() => void act(() => api.library.patch(t.id, { favorite: !t.favorite }))}>{t.favorite ? '★' : '☆'}</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!t.exists} onClick={() => void toProject(t)}>Add to project</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!t.exists} onClick={() => void window.api.files.showItem(t.path)}>Show file</button>
          {confirmId === t.id ? (
            <>
              <button className="btn btn-primary" style={{ background: 'var(--red)', fontSize: 11 }} onClick={() => { setConfirmId(null); if (playing === t.id) { audio.current?.pause(); setPlaying(null) } void act(() => api.library.remove(t.id, true)) }}>Delete file</button>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmId(null)}>No</button>
            </>
          ) : (
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmId(t.id)}>Delete</button>
          )}
        </div>
      ))}
    </div>
  )
}
