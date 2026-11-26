// Audio → MIDI: a song (a file, a Library song, a Studio clip) becomes editable MIDI tracks. The song is split into
// instruments first; each stem is transcribed with the method that suits it (one-voice lines for vocals and bass,
// chords for piano, guitar and keys, NMF drum transcription for drums); tempo, the first bar, key and chords come
// from the mix, so the notes land on bars and beats. The result is shown before it goes into the Studio.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, type SongToMidiResult, type TranscribedPart } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useStemHandoff } from '../../stores/stemHandoff'
import { PACK_INSTRUMENTS } from '../../audio/soundbank'
import { importTranscription, resultBars, STEM_COLORS } from '../../lib/transcriptionImport'
import { tr, trf } from '../../i18n/tr'

const STEMS: Array<{ id: string; label: string; color: string }> = [
  { id: 'vocals', label: 'Vocals', color: '#a855f7' },
  { id: 'bass', label: 'Bass', color: '#3b82f6' },
  { id: 'drums', label: 'Drums', color: '#f43f5e' },
  { id: 'piano', label: 'Piano', color: '#f59e0b' },
  { id: 'guitar', label: 'Guitar', color: '#22c55e' },
  { id: 'other', label: 'Keys / synths', color: '#22d3ee' },
]
const colorOf = (stem: string): string => STEM_COLORS[stem] ?? '#94a3b8'
const GRIDS: Array<[number, string]> = [[0, 'Off (as played)'], [0.5, '1/8'], [0.25, '1/16'], [0.125, '1/32']]

const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }

/** the notes of a part as a small piano roll */
function NotePreview({ part, bars }: { part: TranscribedPart; bars: number }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = c.clientWidth * 2, h = c.clientHeight * 2
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.clearRect(0, 0, w, h)
    const beats = Math.max(4, bars * 4)
    g.strokeStyle = 'rgba(255,255,255,0.06)'
    for (let b = 0; b <= beats; b += 4) { const x = (b / beats) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    if (!part.notes.length) return
    const ps = part.notes.map((n) => n.pitch)
    const lo = Math.min(...ps) - 1, hi = Math.max(...ps) + 1
    const col = colorOf(part.stem)
    for (const n of part.notes) {
      const x = (n.startTime / beats) * w, nw = Math.max(2, (n.duration / beats) * w)
      const y = h - ((n.pitch - lo) / Math.max(1, hi - lo)) * h
      g.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, n.confidence))
      g.fillStyle = col
      g.fillRect(x, y - 3, nw, 5)
    }
    g.globalAlpha = 1
  }, [part, bars])
  return <canvas ref={ref} style={{ width: '100%', height: 58, display: 'block', background: 'rgba(0,0,0,0.25)', borderRadius: 6 }} />
}

let running: { id: string; file: string | null } | null = null     // the job of this page, also while another page is open

export function AudioToMidi(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const [file, setFile] = useState<string | null>(null)
  const [stemsIn, setStemsIn] = useState<Record<string, string> | null>(null)    // stems sent from the Stem Splitter
  const [separate, setSeparate] = useState(true)
  const [kind, setKind] = useState('other')
  const [goal, setGoal] = useState('song')       // what should become MIDI: the whole song, one part, or parts picked by hand
  const [want, setWant] = useState<string[]>(STEMS.map((s) => s.id))
  const [grid, setGrid] = useState(0.25)
  const [strength, setStrength] = useState(0.6)
  const [useHint, setUseHint] = useState(true)
  const [job, setJob] = useState<{ id: string; progress: number; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<SongToMidiResult | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [prog, setProg] = useState<Record<string, number>>({})
  const [setTempo, setSetTempo] = useState(true)
  const [chordTrack, setChordTrack] = useState(false)
  const [chordMarkers, setChordMarkers] = useState(false)
  const [withAudio, setWithAudio] = useState(true)
  const [startBar, setStartBar] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  // a song sent here from the Library, Create music or the Stem Splitter
  const pending = useStemHandoff((s) => s.midi)
  useEffect(() => {
    if (!pending || job) return
    const p = useStemHandoff.getState().takeMidi()
    if (p) { setFile(p.path || null); setStemsIn(p.stems ?? null); setRes(null); setError(null) }
  }, [pending, job])
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const studioClip = (): { path: string; startBeat: number } | null => {
    const st = useProjectStore.getState()
    for (const t of st.project.tracks) for (const c of t.clips) if (c.id === st.selectedClipId && c.audioFile) return { path: c.audioFile, startBeat: c.startTime }
    return null
  }
  const choose = async (): Promise<void> => {
    const paths: string[] = await window.api.dialog.openAudio()
    if (paths?.[0]) { setFile(paths[0]); setStemsIn(null); setRes(null); setError(null) }
  }
  const fromClip = (): void => {
    const c = studioClip()
    if (!c) { setError(tr('Select an audio clip in the Studio first.')); return }
    setFile(c.path); setStemsIn(null); setRes(null); setError(null); setStartBar(Math.floor(c.startBeat / 4) + 1)
  }

  const run = async (): Promise<void> => {
    if (!file && !stemsIn) return
    setError(null); setRes(null); setNotice(null)
    try {
      const { jobId } = await api.audioToMidi.startSong({
        filePath: file ?? '', separate: !stemsIn && separate, stem: kind, stems: stemsIn ?? undefined,
        want, bpm: useHint ? project.bpm : undefined, quantize: grid, strength,
      })
      running = { id: jobId, file }
      poll(jobId)
    } catch (e) { setError((e as Error).message) }
  }
  // follows a job; it keeps running in the backend when the page is left, and is followed again on return
  const poll = (jobId: string): void => {
    if (timer.current) clearInterval(timer.current)
    setJob({ id: jobId, progress: 0, text: tr('Starting…') })
    {
      let inFlight = false, misses = 0
      const stopPolling = (): void => { if (timer.current) clearInterval(timer.current); timer.current = null; setJob(null); running = null }
      timer.current = window.setInterval(async () => {
        if (inFlight) return                           // a slow answer must not pile up requests
        inFlight = true
        try {
          const j = await api.audioToMidi.song(jobId)
          misses = 0
          setJob({ id: jobId, progress: j.progress, text: `${j.text} · ${Math.round(j.elapsed)} s` })
          if (j.status === 'running') return
          stopPolling()
          if (j.status === 'done' && j.result) {
            setRes(j.result)
            setPick(Object.fromEntries(j.result.parts.map((p) => [p.stem, true])))
            setProg(Object.fromEntries(j.result.parts.map((p) => [p.stem, p.program])))
          } else if (j.status === 'error') setError(j.error)
          else if (j.status === 'cancelled') setError(tr('Cancelled.'))
        } catch (e) {
          // the backend was restarted (the job is gone) or does not answer for a long time: say so instead of waiting forever
          const m = (e as Error).message
          if (/not found/i.test(m) || ++misses > 60) {
            stopPolling()
            setError(/not found/i.test(m) ? tr('The AI backend was restarted, so this conversion was lost. Please start it again.') : trf('No answer from the AI backend for a minute ({m}). Please start it again.', { m }))
          }
        } finally { inFlight = false }
      }, 1000)
    }
  }
  useEffect(() => { if (running) { setFile(running.file); poll(running.id) } }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = (): void => { if (job) void api.audioToMidi.cancelSong(job.id) }

  const bars = useMemo(() => (res ? resultBars(res) : 0), [res])

  const toStudio = (): void => {
    if (!res) return
    const made = importTranscription(res, { startBar, parts: pick, programs: prog, setTempo, original: withAudio ? file : null, chordTrack, chordMarkers })
    setNotice(trf('{n} tracks are in the Studio from bar {bar}. Tempo {bpm} BPM, key {key}.', { n: made.length, bar: startBar, bpm: res.bpm, key: res.key }))
  }

  const busy = !!job
  const toggle = (id: string): void => setWant((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))

  const goals: Array<{ id: string; icon: string; title: string; text: string; parts: string[] }> = [
    { id: 'song', icon: '🎼', title: tr('Whole song'), text: tr('All parts, chords and tempo'), parts: STEMS.map((x) => x.id) },
    { id: 'vocals', icon: '🎤', title: tr('Melody'), text: tr('Only the voice line'), parts: ['vocals'] },
    { id: 'bass', icon: '🎸', title: tr('Bassline'), text: tr('One clean bass line'), parts: ['bass'] },
    { id: 'drums', icon: '🥁', title: tr('Drum pattern'), text: tr('Kick, snare, hi-hat'), parts: ['drums'] },
    { id: 'custom', icon: '☑', title: tr('Choose parts'), text: tr('Tick the instruments yourself'), parts: want },
  ]
  const pickGoal = (id: string): void => {
    setGoal(id)
    const g = goals.find((x) => x.id === id)
    if (g && id !== 'custom') setWant(g.parts)
  }
  const goalTitle = goals.find((x) => x.id === goal)?.title ?? ''
  const fileName = stemsIn ? trf('{n} stems from the Stem Splitter', { n: Object.keys(stemsIn).length }) : file ? (file.split(/[\\/]/).pop() ?? file) : ''
  const th: React.CSSProperties = { ...label, padding: '8px 12px', textAlign: 'left', fontWeight: 700 }
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (busy) return; const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined; if (f?.path) { setFile(f.path); setStemsIn(null); setRes(null); setError(null) } },
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} {...dropHandlers}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{tr('Audio → MIDI')}</div>
        {fileName && <span style={chip}>{fileName}</span>}
        <span style={{ flex: 1 }} />
        {(file || stemsIn) && !busy && <>
          <button className="btn btn-ghost" onClick={fromClip} title={tr('The audio clip selected in the Studio')}>{tr('Selected Studio clip')}</button>
          <button className="btn btn-ghost" onClick={() => void choose()}>{tr('Change song')}</button>
        </>}
      </div>

      <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
        {!file && !stemsIn ? (
          <div onClick={() => void choose()} style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '52px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--bg-secondary)' }}>
            <span style={{ fontSize: 36 }}>🎼</span>
            <span style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>{tr('Drop an audio file here, or:')}</span>
            <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-primary" onClick={() => void choose()}>{tr('Choose a file…')}</button>
              <button className="btn btn-ghost" onClick={fromClip} title={tr('The audio clip selected in the Studio')}>{tr('Selected Studio clip')}</button>
            </div>
            <span style={{ ...hint, maxWidth: 620, textAlign: 'center' }}>{tr('A whole song becomes MIDI tracks you can edit and play with any instrument: split into instruments, each turned into notes with the method that suits it, on the bars and beats of the song, with its tempo, key and chords.')}</span>
            {error && <span style={{ ...hint, color: 'var(--red)' }}>{error}</span>}
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('What should become MIDI?')}</div>
              <div style={hint}>{tr('The app splits the song and picks the right engine for each part.')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {goals.map((g) => {
                const on = goal === g.id
                return (
                  <button key={g.id} disabled={busy} onClick={() => pickGoal(g.id)} style={{ textAlign: 'left', padding: 14, borderRadius: 10, cursor: busy ? 'default' : 'pointer', color: 'var(--text-primary)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(139,92,246,0.14)' : 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 24 }}>{g.icon}</span>
                    <b style={{ fontSize: 14 }}>{g.title}</b>
                    <span style={hint}>{g.text}</span>
                    {g.id === 'song' && <span style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 9px', borderRadius: 999, background: 'linear-gradient(90deg,#7c3aed,#db2777)', color: '#fff', fontWeight: 700 }}>{tr('✦ recommended')}</span>}
                  </button>
                )
              })}
            </div>
            {goal === 'custom' && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '4px 2px' }}>
                {STEMS.map((x) => (
                  <label key={x.id} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}>
                    <input type="checkbox" checked={want.includes(x.id)} onChange={() => toggle(x.id)} disabled={busy} />
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />{tr(x.label)}
                  </label>
                ))}
              </div>
            )}

            {/* convert */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {!busy
                ? <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} disabled={!file && !stemsIn} onClick={() => void run()}>{trf('Convert: {goal}', { goal: goalTitle })}</button>
                : <button className="btn btn-ghost" style={{ padding: '10px 24px', fontSize: 14 }} onClick={cancel}>✕ {tr('Cancel')}</button>}
              <span style={hint}>{tr('stoppable at any time')}</span>
              <span style={{ flex: 1 }} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>{tr('Quantize to')}
                <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} disabled={busy}>{GRIDS.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</select>
              </label>
              {grid > 0 && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>{tr('Strength')}
                  <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} disabled={busy} style={{ width: 90 }} />
                  <span style={{ width: 34 }}>{Math.round(strength * 100)}%</span>
                </label>
              )}
            </div>
            {busy && job && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${job.progress}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#db2777)', transition: 'width 0.5s' }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}><span>{job.text}</span><b>{Math.round(job.progress)} %</b></div>
              </div>
            )}
            {error && <div style={{ ...hint, color: 'var(--red)' }}>{error}</div>}
            <details style={{ ...hint }}>
              <summary style={{ cursor: 'pointer' }}>{tr('More options')}</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 0 4px' }}>
                {!stemsIn && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                    <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} disabled={busy} />
                    <span><b>{tr('Split into instruments first')}</b> <span style={hint}>{tr('(recommended for a whole song; needs Demucs)')}</span></span>
                  </label>
                )}
                {!separate && !stemsIn && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>{tr('This audio is:')}
                    <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>{STEMS.map((x) => <option key={x.id} value={x.id}>{tr(x.label)}</option>)}</select>
                  </label>
                )}
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <input type="checkbox" checked={useHint} onChange={(e) => setUseHint(e.target.checked)} disabled={busy} />
                  {trf('The tempo is near the project tempo ({bpm} BPM)', { bpm: project.bpm })}
                </label>
                <div style={hint}>{tr('Without it the tempo is found freely; a slow song may then be read at double speed.')}</div>
              </div>
            </details>
          </>
        )}

        {/* the result */}
        {res && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[[tr('Tempo'), `${res.bpm} BPM`, ''], [tr('Key'), res.key, trf('or {key}', { key: res.relativeKey })], [tr('Length'), trf('{n} bars', { n: bars }), ''], [tr('First bar at'), `${res.firstBeat.toFixed(2)} s`, '']].map(([k, v, sub]) => (
                <div key={k} style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}><Stat k={k} v={v} sub={sub || undefined} /></div>
              ))}
              {res.chords.length > 0 && (
                <div style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ ...label, marginBottom: 5 }}>{tr('Chords')}</div>
                  <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 3 }}>
                    {res.chords.slice(0, 64).map((c, i) => (
                      <div key={i} title={trf('bar {bar}', { bar: Math.floor(c.beat / 4) + 1 })}
                        style={{ flex: `0 0 ${Math.max(34, c.beats * 14)}px`, padding: '3px 6px', borderRadius: 4, background: '#1a1530', border: '1px solid #3a2f63', color: '#ddd6fe', fontSize: 11.5, fontWeight: 700, opacity: 0.5 + 0.5 * c.confidence }}>{c.name}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={{ ...label, marginBottom: 6 }}>{tr('Result')}</div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>
                    <th style={th}>{tr('Part')}</th><th style={th}>{tr('Notes')}</th><th style={{ ...th, width: '28%' }}>{tr('Preview')}</th><th style={th}>{tr('Instrument')}</th>
                    <th style={th} title={tr('How sure the detection is (average of the notes); faint notes in the preview are less sure')}>{tr('Sure')}</th><th style={th}>{tr('Listen')}</th><th style={th}>{tr('Studio')}</th>
                  </tr></thead>
                  <tbody>
                    {res.parts.map((p) => (
                      <tr key={p.stem} style={{ borderTop: '1px solid var(--border)', opacity: pick[p.stem] ? 1 : 0.5 }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: colorOf(p.stem), marginRight: 8 }} /><b>{tr(p.name)}</b></td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{p.notes.length}<div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{p.method}</div></td>
                        <td style={{ padding: '8px 12px' }}><NotePreview part={p} bars={bars} /></td>
                        <td style={{ padding: '8px 12px' }}>
                          <select value={prog[p.stem] ?? p.program} onChange={(e) => setProg({ ...prog, [p.stem]: Number(e.target.value) })} style={{ fontSize: 12, maxWidth: 190 }} title={tr('The instrument that plays this part in the Studio')}>
                            {PACK_INSTRUMENTS.map((g) => <optgroup key={g.group} label={tr(g.group)}>{g.items.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</optgroup>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: p.confidence > 0.75 ? 'var(--green)' : p.confidence > 0.5 ? 'var(--yellow)' : 'var(--orange)', fontWeight: 700 }}>{Math.round(p.confidence * 100)} %</td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Listen to this stem')} onClick={() => void import('../../audio/engine').then((m) => m.previewSample(p.audio))}>▶</button>{' '}
                          <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Stop')} onClick={() => void import('../../audio/engine').then((m) => m.stopPreview())}>■</button>
                        </td>
                        <td style={{ padding: '8px 12px' }}><input type="checkbox" checked={!!pick[p.stem]} onChange={(e) => setPick({ ...pick, [p.stem]: e.target.checked })} title={tr('Put this part into the Studio')} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {res.skipped.length > 0 && <div style={{ ...hint, marginTop: 6 }}>{trf('Left out (nearly silent in this song): {list}', { list: res.skipped.join(', ') })}</div>}
            </div>
            <div style={card}>
              <div style={label}>{tr('Into the Studio')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 6, fontSize: 12.5 }}>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={setTempo} onChange={(e) => setSetTempo(e.target.checked)} />{trf('Set the project tempo to {bpm} BPM', { bpm: res.bpm })}</label>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} disabled={!file} />{tr('The original song too (muted, to compare)')}</label>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={chordTrack} onChange={(e) => setChordTrack(e.target.checked)} />{tr('A chord track (the detected chords)')}</label>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={chordMarkers} onChange={(e) => setChordMarkers(e.target.checked)} />{tr('Chord names as markers')}</label>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>{tr('From bar')}<input type="number" min={1} value={startBar} onChange={(e) => setStartBar(Math.max(1, Number(e.target.value) || 1))} style={{ width: 64 }} /></label>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={toStudio} disabled={!Object.values(pick).some(Boolean) && !chordTrack}>{trf('Put {n} tracks into the Studio', { n: res.parts.filter((p) => pick[p.stem]).length + (chordTrack ? 1 : 0) })}</button>
                {notice && <><span style={{ ...hint, color: 'var(--green)' }}>{notice}</span><button className="btn btn-ghost" onClick={() => useUIStore.getState().setActiveView('timeline')}>{tr('Open the Studio')}</button></>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const chip: React.CSSProperties = { fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={label}>{k}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{v}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}
