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

export function AudioToMidi(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const [file, setFile] = useState<string | null>(null)
  const [stemsIn, setStemsIn] = useState<Record<string, string> | null>(null)    // stems sent from the Stem Splitter
  const [separate, setSeparate] = useState(true)
  const [kind, setKind] = useState('other')
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
      setJob({ id: jobId, progress: 0, text: tr('Starting…') })
      timer.current = window.setInterval(async () => {
        try {
          const j = await api.audioToMidi.song(jobId)
          setJob({ id: jobId, progress: j.progress, text: j.text })
          if (j.status === 'running') return
          if (timer.current) clearInterval(timer.current)
          timer.current = null
          setJob(null)
          if (j.status === 'done' && j.result) {
            setRes(j.result)
            setPick(Object.fromEntries(j.result.parts.map((p) => [p.stem, true])))
            setProg(Object.fromEntries(j.result.parts.map((p) => [p.stem, p.program])))
          } else if (j.status === 'error') setError(j.error)
        } catch { /* a busy backend may miss a poll */ }
      }, 700)
    } catch (e) { setError((e as Error).message) }
  }
  const cancel = (): void => { if (job) void api.audioToMidi.cancelSong(job.id) }

  const bars = useMemo(() => (res ? resultBars(res) : 0), [res])

  const toStudio = (): void => {
    if (!res) return
    const made = importTranscription(res, { startBar, parts: pick, programs: prog, setTempo, original: withAudio ? file : null, chordTrack, chordMarkers })
    setNotice(trf('{n} tracks are in the Studio from bar {bar}. Tempo {bpm} BPM, key {key}.', { n: made.length, bar: startBar, bpm: res.bpm, key: res.key }))
  }

  const busy = !!job
  const toggle = (id: string): void => setWant((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Audio → MIDI')}</div>
        <div style={hint}>{tr('A whole song becomes MIDI tracks you can edit and play with any instrument: split into instruments, each turned into notes with the method that suits it, on the bars and beats of the song, with its tempo, key and chords.')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* source and settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={card}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined; if (f?.path) { setFile(f.path); setStemsIn(null); setRes(null) } }}>
            <div style={label}>{tr('Song')}</div>
            <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', wordBreak: 'break-all' }}>
              {stemsIn ? trf('{n} stems from the Stem Splitter', { n: Object.keys(stemsIn).length }) : file ? file.split(/[\\/]/).pop() : tr('Drop an audio file here, or:')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => void choose()} disabled={busy}>{tr('Choose a file…')}</button>
              <button className="btn btn-ghost" onClick={fromClip} disabled={busy} title={tr('The audio clip selected in the Studio')}>{tr('Selected Studio clip')}</button>
            </div>
          </div>

          <div style={card}>
            <div style={label}>{tr('Instruments')}</div>
            {!stemsIn && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} disabled={busy} />
                <span><b>{tr('Split into instruments first')}</b> <span style={hint}>{tr('(recommended for a whole song; needs Demucs)')}</span></span>
              </label>
            )}
            {separate || stemsIn ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {STEMS.map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}>
                    <input type="checkbox" checked={want.includes(s.id)} onChange={() => toggle(s.id)} disabled={busy} />
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{tr(s.label)}
                  </label>
                ))}
              </div>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                {tr('This audio is:')}
                <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
                  {STEMS.map((s) => <option key={s.id} value={s.id}>{tr(s.label)}</option>)}
                </select>
              </label>
            )}
          </div>

          <div style={card}>
            <div style={label}>{tr('Timing')}</div>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
              {tr('Quantize to')}
              <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} disabled={busy}>
                {GRIDS.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
              </select>
            </label>
            {grid > 0 && (
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 10 }}>
                {tr('Strength')}
                <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} disabled={busy} style={{ flex: 1 }} />
                <span style={{ width: 36, textAlign: 'right' }}>{Math.round(strength * 100)}%</span>
              </label>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
              <input type="checkbox" checked={useHint} onChange={(e) => setUseHint(e.target.checked)} disabled={busy} />
              {trf('The tempo is near the project tempo ({bpm} BPM)', { bpm: project.bpm })}
            </label>
            <div style={hint}>{tr('Without it the tempo is found freely; a slow song may then be read at double speed.')}</div>
          </div>

          {!busy ? (
            <button className="btn btn-primary" style={{ padding: '10px 0', fontSize: 14 }} disabled={!file && !stemsIn} onClick={() => void run()}>{tr('Convert to MIDI')}</button>
          ) : (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{job.text}</span><span>{Math.round(job.progress)} %</span></div>
              <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${job.progress}%`, height: '100%', background: 'var(--accent)' }} /></div>
              <button className="btn btn-ghost" onClick={cancel}>✕ {tr('Cancel')}</button>
            </div>
          )}
          {error && <div style={{ ...hint, color: 'var(--red)' }}>{error}</div>}
        </div>

        {/* the result */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {!res && !busy && (
            <div style={{ ...card, alignItems: 'flex-start' }}>
              <div style={label}>{tr('How it works')}</div>
              <ol style={{ ...hint, margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>{tr('The song is split into vocals, bass, drums, piano, guitar and the rest.')}</li>
                <li>{tr('Vocals and bass become one-voice lines (no doubled or overtone notes), piano, guitar and keys become chords, drums become kick, snare and hi-hat hits.')}</li>
                <li>{tr('Tempo, the first beat of the bars, the key and the chords are found in the song, and the notes are put on the bars and beats.')}</li>
                <li>{tr('You choose which parts go into the Studio and which instrument plays each one.')}</li>
              </ol>
            </div>
          )}
          {res && (
            <>
              <div style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                <Stat k={tr('Tempo')} v={`${res.bpm} BPM`} />
                <Stat k={tr('Key')} v={`${res.key}`} sub={trf('or {key}', { key: res.relativeKey })} />
                <Stat k={tr('Length')} v={trf('{n} bars', { n: bars })} />
                <Stat k={tr('First bar at')} v={`${res.firstBeat.toFixed(2)} s`} />
              </div>
              {res.chords.length > 0 && (
                <div style={card}>
                  <div style={label}>{tr('Chords')}</div>
                  <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
                    {res.chords.slice(0, 64).map((c, i) => (
                      <div key={i} title={trf('bar {bar}', { bar: Math.floor(c.beat / 4) + 1 })}
                        style={{ flex: `0 0 ${Math.max(34, c.beats * 14)}px`, padding: '5px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 700, opacity: 0.5 + 0.5 * c.confidence }}>{c.name}</div>
                    ))}
                  </div>
                </div>
              )}
              {res.parts.map((p) => (
                <div key={p.stem} style={{ ...card, borderLeft: `3px solid ${colorOf(p.stem)}`, opacity: pick[p.stem] ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={!!pick[p.stem]} onChange={(e) => setPick({ ...pick, [p.stem]: e.target.checked })} />
                    <b style={{ fontSize: 14 }}>{tr(p.name)}</b>
                    <span style={hint}>{trf('{n} notes', { n: p.notes.length })} · {p.method}</span>
                    <span style={{ ...hint, display: 'flex', alignItems: 'center', gap: 5 }} title={tr('How sure the detection is (average of the notes); faint notes in the preview are less sure')}>
                      {tr('Confidence')}
                      <span style={{ width: 60, height: 5, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', width: `${p.confidence * 100}%`, height: '100%', background: p.confidence > 0.75 ? 'var(--green)' : p.confidence > 0.5 ? 'var(--yellow)' : 'var(--orange)' }} /></span>
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Listen to this stem')} onClick={() => void import('../../audio/engine').then((m) => m.previewSample(p.audio))}>▶</button>
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} title={tr('Stop')} onClick={() => void import('../../audio/engine').then((m) => m.stopPreview())}>■</button>
                      <select value={prog[p.stem] ?? p.program} onChange={(e) => setProg({ ...prog, [p.stem]: Number(e.target.value) })} style={{ fontSize: 12, maxWidth: 190 }} title={tr('The instrument that plays this part in the Studio')}>
                        {PACK_INSTRUMENTS.map((g) => <optgroup key={g.group} label={tr(g.group)}>{g.items.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</optgroup>)}
                      </select>
                    </span>
                  </div>
                  <NotePreview part={p} bars={bars} />
                </div>
              ))}
              {res.skipped.length > 0 && <div style={hint}>{trf('Left out (nearly silent in this song): {list}', { list: res.skipped.join(', ') })}</div>}
              <div style={card}>
                <div style={label}>{tr('Into the Studio')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12.5 }}>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={setTempo} onChange={(e) => setSetTempo(e.target.checked)} />{trf('Set the project tempo to {bpm} BPM', { bpm: res.bpm })}</label>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} disabled={!file} />{tr('The original song too (muted, to compare)')}</label>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={chordTrack} onChange={(e) => setChordTrack(e.target.checked)} />{tr('A chord track (the detected chords)')}</label>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={chordMarkers} onChange={(e) => setChordMarkers(e.target.checked)} />{tr('Chord names as markers')}</label>
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>{tr('From bar')}<input type="number" min={1} value={startBar} onChange={(e) => setStartBar(Math.max(1, Number(e.target.value) || 1))} style={{ width: 64 }} /></label>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={toStudio} disabled={!Object.values(pick).some(Boolean) && !chordTrack}>{trf('Put {n} tracks into the Studio', { n: res.parts.filter((p) => pick[p.stem]).length + (chordTrack ? 1 : 0) })}</button>
                  {notice && <><span style={{ ...hint, color: 'var(--green)' }}>{notice}</span><button className="btn btn-ghost" onClick={() => useUIStore.getState().setActiveView('timeline')}>{tr('Open the Studio')}</button></>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={label}>{k}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{v}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}
