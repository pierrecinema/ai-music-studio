import { sendToMastering } from '../../stores/mastering.store'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type LibraryTrack } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { useUIStore } from '../../stores/ui.store'
import { WaveformSeek } from '../common/WaveformSeek'
import { importAudioFiles } from '../timeline/Timeline'
import { SamplesTab } from './SamplesTab'
import { seedAnalysis } from '../../beatmatch/store'
import { ExportDialog, parseTags } from '../common/ExportDialog'
import { matchesQuery } from '../../lib/librarySearch'

const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const mmss = (s: number | null): string => (s == null ? '?' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const ENGINE: Record<string, string> = {
  'ace-step': 'ACE-Step', 'musicgen-small': 'MusicGen small', 'musicgen-medium': 'MusicGen medium', 'musicgen-large': 'MusicGen large',
  'audioldm2-music': 'AudioLDM 2', musicldm: 'MusicLDM', diffrhythm: 'DiffRhythm', 'ace-step-1.5': 'ACE-Step 1.5'
}

const chip: React.CSSProperties = { fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)', cursor: 'pointer' }

export function Library(): React.ReactElement {
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [dir, setDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [playBytes, setPlayBytes] = useState<Uint8Array | null>(null)     // the playing file, for its waveform
  const [notice, setNotice] = useState<string | null>(null)
  const tab = useUIStore((s) => s.libraryTab)                       // kept in the store: Stem Splitter opens the Stems tab
  const setTab = useUIStore((s) => s.setLibraryTab)
  const [editTags, setEditTags] = useState<string | null>(null)
  const [exporting, setExporting] = useState<{ title: string; items: Array<{ path: string; name: string }> } | null>(null)
  const [aligning, setAligning] = useState<string | null>(null)       // a track id, or 'all'
  const [confirmAll, setConfirmAll] = useState(false)
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

  const inTab = useMemo(() => tracks.filter((t) => (tab === 'stems') === (t.source === 'stem')), [tracks, tab])
  const shown = useMemo(() => inTab.filter((t) => (!onlyFav || t.favorite) && matchesQuery(t, query)), [inTab, query, onlyFav])
  // stems of one split stay together
  const stemSets = useMemo(() => {
    const m = new Map<string, LibraryTrack[]>()
    for (const t of shown) { const k = t.stem_set ?? t.id; m.set(k, [...(m.get(k) ?? []), t]) }
    return [...m.values()]
  }, [shown])

  const play = async (t: LibraryTrack): Promise<void> => {
    if (playing === t.id) { audio.current?.pause(); setPlaying(null); return }
    try {
      const bytes = await window.api.fs.readFile(t.path)
      setPlayBytes(new Uint8Array(bytes))
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
    const startBeat = insertAt === 'bar1' ? 0 : Math.round(useAudioStore.getState().currentBeat)
    // loops know their exact tempo and start on beat 1: synced at once and never measured again
    const problems = await importAudioFiles([t.path], t.loop_bars && t.bpm
      ? { startBeat, warpBpm: t.bpm, gridFirst: 0, noBeatMatch: true }
      : { startBeat: insertAt === 'bar1' ? 0 : useAudioStore.getState().currentBeat })
    if (problems.length) { setError(problems.join(' ')); return }
    const tracks = useProjectStore.getState().project.tracks
    useProjectStore.getState().updateTrack(tracks[tracks.length - 1].id, { name: t.title })
    setNotice(`"${t.title}" was added to the Studio.`)
  }

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); await load() } catch (e) { setError((e as Error).message) }
  }

  // songs made before 0.11.0 can start with a little lead-in: cut it so that they start on beat 1
  const stopIfPlaying = (id?: string): void => { if (!id || playing === id) { audio.current?.pause(); setPlaying(null) } }
  const alignOne = async (t: LibraryTrack): Promise<void> => {
    stopIfPlaying(t.id); setAligning(t.id); setError(null)
    try { const r = await api.library.align(t.id); setNotice(`"${t.title}": ${r.message}`) } catch (e) { setError((e as Error).message) }
    setAligning(null); await load()
  }
  const alignEverything = async (): Promise<void> => {
    stopIfPlaying(); setConfirmAll(false); setAligning('all'); setError(null)
    try {
      const r = await api.library.alignAll()
      setNotice(r.checked === 0 ? 'All songs already start on beat 1.'
        : `${r.checked} songs checked, ${r.trimmed} cut to start on beat 1. The originals are kept (Restore original).${r.failed.length ? ` ${r.failed.length} failed.` : ''}`)
    } catch (e) { setError((e as Error).message) }
    setAligning(null); await load()
  }
  const unaligned = tracks.filter((t) => t.exists && !t.aligned && (t.source || 'generated') === 'generated').length

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
        {(['tracks', 'stems', 'samples'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { audio.current?.pause(); setPlaying(null); setTab(t) }}>
            {t === 'tracks' ? 'My tracks' : t === 'stems' ? `Stems (${tracks.filter((x) => x.source === 'stem').length})` : 'Samples (Ableton and others)'}
          </button>
        ))}
      </div>

      {tab === 'samples' && <SamplesTab />}

      {tab !== 'samples' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, tag or BPM (e.g. house, 124, 120-130)…" style={{ width: 320 }} />
        <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favourites only
        </label>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={async () => {
          const paths = await window.api.dialog.openAudio()
          for (const p of paths) await act(() => api.library.importFile(p))
        }}>Add files to the library…</button>
        {unaligned > 0 && (confirmAll ? (
          <span style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>
            Cut the lead-in of {unaligned} older songs? The originals are kept.
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => void alignEverything()}>Yes, cut</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmAll(false)}>No</button>
          </span>
        ) : (
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={aligning !== null}
            title="Songs made before version 0.11 may start with a little silence or lead-in. This cuts it, so that every song starts exactly on beat 1. Stems and imported files are not touched."
            onClick={() => setConfirmAll(true)}>{aligning === 'all' ? 'Cutting…' : `Start all on beat 1 (${unaligned})`}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ ...muted, display: 'flex', gap: 4, alignItems: 'center' }}>Insert at
          <select value={insertAt} onChange={(e) => { chooseInsert(e.target.value as 'bar1' | 'playhead'); e.target.blur() }} style={{ fontSize: 11 }}>
            <option value="bar1">bar 1</option><option value="playhead">the playhead</option>
          </select>
        </label>
        <span style={muted}>{shown.length} of {inTab.length} {tab === 'stems' ? 'stems' : 'tracks'}</span>
      </div>}

      {tab !== 'samples' && error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {tab !== 'samples' && notice && <div style={{ color: 'var(--green)', fontSize: 12 }}>{notice} <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => setActiveView('timeline')}>Show Studio</button></div>}

      {tab === 'stems' && inTab.length === 0 && !error && (
        <div style={{ ...muted, border: '1px dashed var(--border-mid)', borderRadius: 10, padding: 24, lineHeight: 1.7 }}>
          No stems yet. Split a song in the <b>Stem Splitter</b> and press <b>Save to library</b>: its stems are kept here together, with tags, and can be exported for any DAW later.
        </div>
      )}

      {tab === 'stems' && stemSets.map((set) => (
        <div key={set[0].stem_set ?? set[0].id} style={{ border: '1px solid var(--border-mid)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>{set[0].song ?? set[0].title}</b>
            <span style={muted}>{set.length} stems{set[0].bpm ? ` · ${Math.round(set[0].bpm)} BPM` : ''} · {new Date(set[0].created * 1000).toLocaleDateString()}</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!set.some((t) => t.exists)}
              onClick={() => setExporting({ title: `${set[0].song ?? 'stems'} (${set.length} stems)`, items: set.filter((t) => t.exists).map((t) => ({ path: t.path, name: t.title })) })}>Export all…</button>
          </div>
          {set.map((t) => row(t))}
        </div>
      ))}

      {tab === 'tracks' && inTab.length > 0 && tracks.some((x) => x.source === 'stem') && (
        <div style={muted}>Saved stems are kept in the <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => setTab('stems')}>Stems</button> tab, grouped by song.</div>
      )}
      {tab === 'tracks' && inTab.length === 0 && !error && (
        <div style={{ ...muted, border: '1px dashed var(--border-mid)', borderRadius: 10, padding: 24, lineHeight: 1.7 }}>
          No tracks yet. Songs made in <b>Create music</b> appear here automatically.{tracks.some((x) => x.source === 'stem') && <> Your saved stems are in the <b>Stems</b> tab.</>}
        </div>
      )}

      {tab === 'tracks' && shown.map((t) => row(t))}
      {exporting && <ExportDialog title={exporting.title} items={exporting.items} onClose={() => setExporting(null)} />}
    </div>
  )

  function row(t: LibraryTrack): React.ReactElement {
    return (
      <div key={t.id} style={{ background: 'var(--bg-panel)', border: `1px solid ${playing === t.id ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, opacity: t.exists ? 1 : 0.55 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
            {editTags === t.id ? (
              <input autoFocus defaultValue={(t.tags ?? []).join(', ')} placeholder="tags, separated by commas" style={{ width: '100%', fontSize: 11, marginTop: 2 }}
                onBlur={(e) => { setEditTags(null); void act(() => api.library.patch(t.id, { tags: parseTags(e.target.value) })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditTags(null) }} />
            ) : (t.tags?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                {t.tags!.map((g) => <span key={g} style={chip} title="Show everything with this tag" onClick={() => setQuery(g)}>{g}</span>)}
              </div>
            )}
            <div style={muted}>
              {t.loop_bars ? `loop ${t.loop_bars} bars · ` : ''}{mmss(t.duration)} · {t.bpm ? `${Math.round(t.bpm)} BPM · ` : ''}{t.trimmed ? `cut ${t.trimmed.toFixed(2)} s to beat 1 · ` : ''}{ENGINE[t.engine] ?? (t.engine || t.source)} · {new Date(t.created * 1000).toLocaleString()}{t.seed ? ` · seed ${t.seed}` : ''}
            </div>
          </div>

          <button className="btn btn-ghost" style={{ fontSize: 11 }} title="Rename this song" onClick={() => setRenaming(t.id)}>Rename</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} title="Tags: genre, mood or anything you want to search for" onClick={() => setEditTags(t.id)}>Tags</button>
          {t.original ? (
            <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={aligning !== null} title="Undo the cut: put the untouched file back"
              onClick={() => { stopIfPlaying(t.id); void act(() => api.library.restore(t.id)).then(() => setNotice(`"${t.title}": the original is back.`)) }}>Restore original</button>
          ) : !t.aligned && t.exists && (t.source || 'generated') === 'generated' ? (
            <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={aligning !== null} title="Cut the lead-in so that the song starts exactly on beat 1 (the original is kept)"
              onClick={() => void alignOne(t)}>{aligning === t.id ? 'Cutting…' : 'Start on beat 1'}</button>
          ) : null}
          <button className="btn btn-ghost" style={{ fontSize: 16, color: t.favorite ? 'var(--yellow)' : 'var(--text-muted)' }} title="Favourite"
            onClick={() => void act(() => api.library.patch(t.id, { favorite: !t.favorite }))}>{t.favorite ? '★' : '☆'}</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!t.exists} onClick={() => void toProject(t)}>Add to project</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!t.exists} title="Open this song in Mastering" onClick={() => sendToMastering(t.path, t.title)}>Mastering</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!t.exists} title="Save a copy as WAV, AIFF, FLAC or MP3"
            onClick={() => setExporting({ title: `"${t.title}"`, items: [{ path: t.path, name: t.title }] })}>Export…</button>
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
        {/* while it plays: the real waveform, click or drag to jump */}
        {playing === t.id && <WaveformSeek fileKey={t.path} bytes={playBytes} audio={audio.current} />}
      </div>
    )
  }
}
