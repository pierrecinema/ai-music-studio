// Vocal Editor: a melody of a MIDI track is sung with lyrics.
//   DiffSinger: a voicebank (OpenUtau format, imported by the user) sings exactly the notes: pitch, timing, length.
//   AI singer (ACE-Step): the music AI sings the lyrics in the song's tempo, key and length, in many languages, but
//   only roughly along the melody.
// Lyrics live on the notes (Note.lyric): a word on its first note, "+" on notes that hold further syllables. They are
// saved with the project and shown in the Piano Roll.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, type SingerVoice } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useMusicJob } from '../../stores/musicJob.store'
import { beatToSec } from '../../audio/timemap'
import { tr, trf } from '../../i18n/tr'
import type { Note, Track } from '../../types'

interface BuiltinVoice { id: string; name: string; description: string; style: string; gender: string; credit: string; demo: string | null }
const LANGS: Array<[string, string]> = [['en', 'English'], ['de', 'Deutsch'], ['es', 'Español'], ['', 'Phonemes / the voice’s own language']]
const QUALITY: Array<[number, string]> = [[8, 'Fast (draft)'], [20, 'Normal'], [50, 'Best (slower)']]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (p: number): string => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`

const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }

interface SungNote { trackId: string; clipId: string; note: Note; beat: number }

/** the notes of a MIDI track in time order, with their position in the song (beats) */
function melodyOf(t: Track | undefined): SungNote[] {
  if (!t) return []
  return t.clips.flatMap((c) => (c.notes ?? []).filter((n) => n.startTime < c.duration).map((n) => ({ trackId: t.id, clipId: c.id, note: n, beat: c.startTime + n.startTime })))
    .sort((a, b) => a.beat - b.beat || b.note.pitch - a.note.pitch)
}

export function VocalEditor(): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const midiTracks = project.tracks.filter((t) => t.type === 'midi' && t.clips.some((c) => c.notes?.length))
  const [trackId, setTrackId] = useState<string>('')
  const track = midiTracks.find((t) => t.id === trackId) ?? midiTracks.find((t) => t.id === selectedTrackId) ?? midiTracks[0]
  const melody = useMemo(() => melodyOf(track), [track])
  const [engine, setEngine] = useState<'builtin' | 'diffsinger' | 'ai'>('builtin')
  const [builtin, setBuiltin] = useState<{ voices: BuiltinVoice[]; problem: string | null } | null>(null)
  const [bVoice, setBVoice] = useState('')
  const bv = builtin?.voices.find((v) => v.id === bVoice) ?? builtin?.voices[0]
  const [natural, setNatural] = useState(true)
  const [voices, setVoices] = useState<SingerVoice[] | null>(null)
  const [voicesInfo, setVoicesInfo] = useState<{ vocalsFolder: string; vocoderLicence: string } | null>(null)
  const [voiceId, setVoiceId] = useState('')
  const voice = voices?.find((v) => v.id === voiceId) ?? voices?.find((v) => !v.error)
  const [lang, setLang] = useState('en')
  const [text, setText] = useState('')
  const [steps, setSteps] = useState(20)
  const [vibrato, setVibrato] = useState(0.25)
  const [busy, setBusy] = useState<{ text: string; pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [aiVoice, setAiVoice] = useState('female')
  const [aiStyle, setAiStyle] = useState('pop')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const loadBuiltin = (): void => { api.singer.builtin().then(setBuiltin).catch(() => setBuiltin({ voices: [], problem: tr('The AI backend does not answer.') })) }
  useEffect(loadBuiltin, [])
  const installSinger = async (): Promise<void> => {
    if (!window.confirm(tr('Install the singer now? About 4 GB are downloaded once (the singing model SoulX-Singer and its own Python environment). The AI backend restarts afterwards.'))) return
    setError(null); setBusy({ text: tr('Installing the singer…'), pct: 0 })
    const off = window.api.engines.onLog?.((line: string) => setBusy({ text: line.slice(0, 120), pct: 0 }))
    try {
      const st = await window.api.engines.status()
      const r = await window.api.engines.install(['singer'], st.gpu === 'nvidia' ? 'cuda' : 'cpu')
      if (!r.ok) setError(r.error ?? tr('It did not work.'))
      for (let i = 0; i < 60; i++) {                       // the backend restarts: wait until it answers again
        await new Promise((res) => setTimeout(res, 2000))
        try { const b = await api.singer.builtin(); setBuiltin(b); break } catch { /* not up yet */ }
      }
    } catch (e) { setError((e as Error).message) }
    off?.(); setBusy(null)
  }
  const singBuiltin = async (): Promise<void> => {
    if (!bv || !melody.length) return
    setError(null); setNotice(null)
    const p = useProjectStore.getState().project
    const notes = melody.map((m) => ({ pitch: m.note.pitch, start: beatToSec(p, m.beat), end: beatToSec(p, m.beat + m.note.duration), lyric: m.note.lyric ?? '' }))
    if (!notes.some((n) => n.lyric && n.lyric !== '+')) { setError(tr('Put lyrics on the notes first.')); return }
    try {
      const { jobId } = await api.singer.builtinRender({ voice: bv.id, notes, lang: lang || 'en', rap: bv.style === 'rap', steps: natural ? 32 : 16, name: `${track?.name ?? 'Vocals'} ${bv.name}` })
      setBusy({ text: tr('Singing…'), pct: 0 })
      if (await poll(() => api.singer.job(jobId))) {
        const j = await api.singer.job(jobId)
        if (j.result) {
          addAudioTrack(j.result.file, `${tr('Vocals')} – ${bv.name}`, 0, j.result.seconds)
          setNotice((j.result.unknown.length ? trf('Sung as "ah" (word not known): {list}. ', { list: j.result.unknown.join(', ') }) : '') + tr('The vocals are on a new track in the Studio, in time with the song.'))
        }
      }
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  const loadVoices = (): void => {
    api.singer.voices().then((r) => { setVoices(r.voices); setVoicesInfo({ vocalsFolder: r.vocalsFolder, vocoderLicence: r.vocoderLicence }) })
      .catch((e: Error) => { setVoices([]); setError(trf('The AI backend does not answer ({m}).', { m: e.message })) })
  }
  useEffect(loadVoices, [])
  useEffect(() => { if (voice?.languages?.length && !voice.languages.includes(lang)) setLang(voice.languages.includes('en') ? 'en' : voice.languages[0]) }, [voice?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const poll = async (get: () => Promise<{ status: string; progress: number; text: string; error?: string | null }>): Promise<boolean> => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 800))
      if (!alive.current) return false
      let j
      try { j = await get() } catch { continue }
      setBusy({ text: j.text, pct: j.progress })
      if (j.status === 'done') return true
      if (j.status === 'error') { setError(j.error ?? tr('It did not work.')); return false }
    }
  }

  const importVoice = async (): Promise<void> => {
    const path = await window.api.dialog.openVoicebank?.()
    if (!path) return
    setError(null); setBusy({ text: tr('Importing…'), pct: 0 })
    try {
      const r = await api.singer.importVoice(path)
      const v = r.imported.find((x) => x.kind === 'voice')
      if (v?.id) setVoiceId(v.id)
      setNotice(trf('Imported: {list}', { list: r.imported.map((x) => x.id ?? x.name).join(', ') }))
      loadVoices()
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }
  const installVocoder = async (): Promise<void> => {
    if (!voice) return
    setError(null)
    try {
      const { jobId } = await api.singer.installVocoder(voice.vocoder || 'nsf_hifigan')
      setBusy({ text: tr('Downloading the vocoder…'), pct: 0 })
      if (await poll(() => api.singer.job(jobId))) loadVoices()
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }
  const removeVoice = async (): Promise<void> => {
    if (!voice || !window.confirm(trf('Delete the voice {name} from this PC?', { name: voice.name }))) return
    await api.singer.deleteVoice(voice.id).catch(() => null)
    setVoiceId(''); loadVoices()
  }

  // lyrics onto the notes: a word on its first note, "+" on the notes of its further syllables
  const putLyrics = async (): Promise<void> => {
    if (!melody.length) return
    setError(null)
    try {
      const { lyrics } = await api.singer.lyrics(text, melody.length, lang || 'en')
      const st = useProjectStore.getState()
      melody.forEach((m, i) => st.updateNote(m.trackId, m.clipId, m.note.id, { lyric: lyrics[i] || undefined }))
      const words = text.split(/\s+/).filter(Boolean).length
      const placed = lyrics.filter((l) => l && l !== '+').length
      setNotice(placed < words ? trf('{placed} of {words} words fit on the {n} notes: add notes or shorten the lyrics.', { placed, words, n: melody.length }) : trf('The lyrics are on the {n} notes. Check and correct them below.', { n: melody.length }))
    } catch (e) { setError((e as Error).message) }
  }
  const setLyric = (m: SungNote, lyric: string): void => useProjectStore.getState().updateNote(m.trackId, m.clipId, m.note.id, { lyric: lyric || undefined })

  const addAudioTrack = (file: string, name: string, startBeat: number, seconds: number): void => {
    const st = useProjectStore.getState()
    st.addTrack('vocal')
    const ts = useProjectStore.getState().project.tracks
    const id = ts[ts.length - 1].id
    st.updateTrack(id, { name })
    const p = useProjectStore.getState().project
    const beats = (seconds * p.bpm) / 60
    st.addClip(id, { startTime: startBeat, duration: beats, audioFile: file, name })
  }

  const singDiffSinger = async (): Promise<void> => {
    if (!voice || !melody.length) return
    setError(null); setNotice(null)
    const p = useProjectStore.getState().project
    const notes = melody.map((m) => ({ pitch: m.note.pitch, start: beatToSec(p, m.beat), end: beatToSec(p, m.beat + m.note.duration), lyric: m.note.lyric ?? '' }))
    if (!notes.some((n) => n.lyric && n.lyric !== '+')) { setError(tr('Put lyrics on the notes first.')); return }
    try {
      const { jobId } = await api.singer.render({ voice: voice.id, notes, lang: lang || undefined, steps, vibrato, name: `${track?.name ?? 'Vocals'} ${voice.name}` })
      setBusy({ text: tr('Singing…'), pct: 0 })
      if (await poll(() => api.singer.job(jobId))) {
        const j = await api.singer.job(jobId)
        if (j.result) {
          addAudioTrack(j.result.file, `${tr('Vocals')} – ${voice.name}`, 0, j.result.seconds)
          setNotice((j.result.unknown.length ? trf('The voice could not sing: {list}. ', { list: j.result.unknown.join(', ') }) : '') + tr('The vocals are on a new track in the Studio, in time with the song.'))
        }
      }
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  // your own singing -> a MIDI melody track (Audio → MIDI with one-voice transcription, on the song's grid)
  const singingToMidi = async (from: 'clip' | 'file'): Promise<void> => {
    setError(null); setNotice(null)
    let path: string | null = null
    let startBeat = 0
    if (from === 'clip') {
      const st = useProjectStore.getState()
      for (const t of st.project.tracks) for (const c of t.clips) if (c.id === st.selectedClipId && c.audioFile) { path = c.audioFile; startBeat = c.startTime }
      if (!path) { setError(tr('Select your recorded singing (an audio clip) in the Studio first.')); return }
    } else {
      const paths: string[] = await window.api.dialog.openAudio()
      path = paths?.[0] ?? null
      if (!path) return
    }
    try {
      const p = useProjectStore.getState().project
      const { jobId } = await api.audioToMidi.startSong({ filePath: path, separate: false, stem: 'vocals', want: ['vocals'], bpm: p.bpm, quantize: 0.25, strength: 0.5, grid_from_song: false })
      setBusy({ text: tr('Turning your singing into notes…'), pct: 0 })
      const ok = await poll(async () => { const j = await api.audioToMidi.song(jobId); return { ...j, error: j.error } })
      if (ok) {
        const j = await api.audioToMidi.song(jobId)
        const part = j.result?.parts[0]
        if (j.result && part) {
          const { importTranscription } = await import('../../lib/transcriptionImport')
          // the recording keeps the project tempo; its notes start where the clip starts
          const made = importTranscription(j.result, { startBar: Math.floor(startBeat / 4) + 1, setTempo: false, original: null, programs: { vocals: 73 } })
          const ts = useProjectStore.getState().project.tracks
          const created = ts[ts.length - 1]
          if (created) { useProjectStore.getState().updateTrack(created.id, { name: tr('My melody (MIDI)') }); setTrackId(created.id) }
          setNotice(trf('{n} notes from your singing are on a new MIDI track ({made}). Put lyrics on them and press Sing, or edit them in the Piano Roll.', { n: part.notes.length, made: made.join(', ') }))
        } else setError(tr('No notes found in the recording.'))
      }
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  // the AI singer: ACE-Step sings the lyrics a cappella in the tempo, key and length of the melody
  const singAi = async (): Promise<void> => {
    if (!melody.length || !text.trim()) { setError(tr('Write the lyrics first.')); return }
    setError(null); setNotice(null)
    const p = useProjectStore.getState().project
    const first = melody[0].beat
    const last = Math.max(...melody.map((m) => m.beat + m.note.duration))
    const seconds = Math.max(10, Math.round(beatToSec(p, last) - beatToSec(p, first) + 2))
    const counts = new Array(12).fill(0)
    for (const m of melody) counts[m.note.pitch % 12] += m.note.duration
    const tonic = melody[melody.length - 1].note.pitch % 12
    const minor = counts[(tonic + 3) % 12] > counts[(tonic + 4) % 12]
    const langName = LANGS.find(([k]) => k === lang)?.[1] ?? 'English'
    try {
      const { jobId } = await api.music.generate({
        engine: 'ace-step-1.5', acapella: true, instrumental: false, lyrics: text, duration: seconds, bpm: Math.round(p.bpm),
        key: `${NOTE_NAMES[tonic]} ${minor ? 'minor' : 'major'}`, language: langName, voice: aiVoice,
        prompt: `${aiVoice} solo vocal, ${aiStyle}, a cappella, clear lead vocal, ${Math.round(p.bpm)} bpm`, title: `${track?.name ?? 'Vocals'} (AI singer)`,
      })
      useMusicJob.getState().markHandled(jobId)
      useMusicJob.getState().setJob({ id: jobId, status: 'queued', warnings: [], results: [] })
      useMusicJob.getState().track(jobId)
      setBusy({ text: tr('The AI singer starts (this takes minutes on a CPU)…'), pct: 0 })
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!alive.current) return
        const j = useMusicJob.getState().job
        if (!j || j.id !== jobId) continue
        const pct = j.step_total ? Math.round(((j.step ?? 0) / j.step_total) * 100) : 0
        setBusy({ text: j.stage_text ?? tr('Singing…'), pct })
        if (j.status === 'done') {
          const r = j.results[0]
          if (r?.audio_file) {
            addAudioTrack(r.audio_file, `${tr('Vocals')} – ${tr('AI singer')}`, first, seconds)
            setNotice(tr('The AI vocals are on a new track in the Studio from the first note. Move the clip if they start a little early or late.'))
          }
          break
        }
        if (j.status === 'error' || j.status === 'cancelled') { setError(j.error ?? tr('Cancelled.')); break }
      }
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  const ready = engine === 'builtin' ? !!bv && !builtin?.problem && melody.length > 0 : engine === 'diffsinger' ? !!voice && !voice.error && voice.vocoderInstalled && melody.length > 0 : melody.length > 0 && !!text.trim()

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Vocal Editor')}</div>
        <div style={hint}>{tr('A melody of a MIDI track is sung with your lyrics. Write the melody in the Piano Roll (or turn a sung line into MIDI with Audio → MIDI), then choose a voice here.')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={card}>
            <div style={label}>{tr('Singer')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['builtin', tr('Built-in voices')], ['diffsinger', tr('DiffSinger voice')], ['ai', tr('AI singer (ACE-Step)')]] as const).map(([k, l]) => (
                <button key={k} className={`btn ${engine === k ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 12 }} onClick={() => setEngine(k)}>{l}</button>
              ))}
            </div>
            {engine === 'builtin' && (
              <>
                <div style={hint}>{tr('The app’s own voices sing exactly your notes and lyrics. Runs on your processor: about a minute per 5 seconds of singing.')}</div>
                {builtin?.problem ? (
                  <div style={{ ...card, background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }}>
                    <div style={hint}>{tr('The singer is installed once: about 4 GB (the singing model SoulX-Singer, Apache 2.0, and its own Python environment).')}</div>
                    <button className="btn btn-primary" onClick={() => void installSinger()} disabled={!!busy}>{tr('Install the singer')}</button>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {(builtin?.voices ?? []).map((v) => (
                    <button key={v.id} className={`btn ${bv?.id === v.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBVoice(v.id)} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '6px 8px' }} title={v.credit}>
                      <b style={{ fontSize: 12.5 }}>{v.name}</b><span style={{ fontSize: 10.5, opacity: 0.8 }}>{tr(v.description)}</span>
                    </button>
                  ))}
                </div>
                {bv?.demo && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void import('../../audio/engine').then((m) => m.previewSample(bv.demo!))}>▶ {trf('Listen to {name}', { name: bv.name })}</button>}
                <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}>
                  <input type="checkbox" checked={natural} onChange={(e) => setNatural(e.target.checked)} />{tr('Best quality (slower; off: about twice as fast)')}
                </label>
                {bv?.style === 'rap' && <div style={hint}>{tr('Rap voice: the words follow the rhythm of the notes and are spoken more than sung; put one note per syllable on one pitch.')}</div>}
              </>
            )}
            {engine === 'builtin' ? null : engine === 'diffsinger' ? (
              <>
                <div style={hint}>{tr('Sings exactly your notes: pitch, timing and length. Needs a DiffSinger voicebank (OpenUtau format) that you download from its author and import here.')}</div>
                {voices && voices.length > 0 ? (
                  <select value={voice?.id ?? ''} onChange={(e) => setVoiceId(e.target.value)}>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.languages?.length ? ` (${v.languages.join(', ')})` : ''}{v.error ? ` – ${tr('broken')}` : ''}</option>)}
                  </select>
                ) : (
                  <div style={{ ...hint, color: 'var(--yellow)' }}>{tr('No voice yet. Search the web for "DiffSinger voicebank OpenUtau" (for example Nishiren for English, German, Spanish; Tiger for English, Spanish), download the .zip, read and accept its terms, then import it.')}</div>
                )}
                {voice?.error && <div style={{ ...hint, color: 'var(--red)' }}>{voice.error}</div>}
                {voice && !voice.error && (
                  <div style={hint}>
                    {voice.author ? `${voice.author} · ` : ''}
                    {tr('Models')}: {[voice.models?.duration && tr('timing'), voice.models?.pitch && tr('natural pitch'), voice.models?.variance && tr('expression')].filter(Boolean).join(', ') || tr('basic (timing and pitch from the notes)')}
                  </div>
                )}
                {voice && !voice.error && !voice.vocoderInstalled && (
                  <div style={{ ...card, background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }}>
                    <div style={hint}>{trf('This voice needs the vocoder "{name}" (turns the voice model into sound), downloaded once.', { name: voice.vocoder ?? 'nsf_hifigan' })}</div>
                    <div style={{ ...hint, fontSize: 10.5 }}>{voicesInfo?.vocoderLicence}</div>
                    <button className="btn btn-primary" onClick={() => void installVocoder()} disabled={!!busy}>{tr('Install the vocoder')}</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => void importVoice()} disabled={!!busy}>{tr('Import a voice…')}</button>
                  {voice && <button className="btn btn-ghost" onClick={() => void removeVoice()} disabled={!!busy}>{tr('Delete')}</button>}
                </div>
                {voice?.readme && (
                  <details><summary style={{ ...hint, cursor: 'pointer' }}>{tr('Terms and notes of the voice (please read)')}</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 220, overflow: 'auto', color: 'var(--text-secondary)' }}>{voice.readme}</pre></details>
                )}
              </>
            ) : (
              <>
                <div style={hint}>{tr('The music AI sings your lyrics a cappella in the tempo, key and length of the melody, in many languages. It does not follow every note: for that use a DiffSinger voice. Takes minutes on a CPU.')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={aiVoice} onChange={(e) => setAiVoice(e.target.value)} style={{ flex: 1 }}>
                    <option value="female">{tr('Female voice')}</option><option value="male">{tr('Male voice')}</option>
                  </select>
                  <input value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} placeholder={tr('Style, e.g. soul, breathy')} style={{ flex: 1 }} />
                </div>
              </>
            )}
          </div>

          <div style={card}>
            <div style={label}>{tr('Melody')}</div>
            {midiTracks.length ? (
              <select value={track?.id ?? ''} onChange={(e) => setTrackId(e.target.value)}>
                {midiTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : <div style={{ ...hint, color: 'var(--yellow)' }}>{tr('No MIDI track with notes yet: write a melody in the Piano Roll first.')}</div>}
            <div style={hint}>{trf('{n} notes. One note per syllable; a note with "+" holds the syllable before it.', { n: melody.length })}</div>
            <div style={{ ...hint, marginTop: 4 }}>{tr('Or sing it: record yourself on an audio track in the Studio (or choose a recording), and the app writes the melody as MIDI.')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => void singingToMidi('clip')} disabled={!!busy} title={tr('The audio clip selected in the Studio')}>🎙 {tr('My singing (Studio clip) → MIDI')}</button>
              <button className="btn btn-ghost" onClick={() => void singingToMidi('file')} disabled={!!busy}>{tr('A recording file → MIDI')}</button>
            </div>
          </div>

          <div style={card}>
            <div style={label}>{tr('Lyrics')}</div>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.filter(([k]) => engine === 'ai' ? k : true).map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}
            </select>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={tr('Write the lyrics here…')} style={{ resize: 'vertical' }} />
            {engine !== 'ai' && <button className="btn btn-ghost" onClick={() => void putLyrics()} disabled={!melody.length || !text.trim() || !!busy}>{tr('Put the lyrics on the notes')}</button>}
          </div>

          {engine === 'diffsinger' && (
            <div style={card}>
              <div style={label}>{tr('Sound')}</div>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>{tr('Quality')}
                <select value={steps} onChange={(e) => setSteps(Number(e.target.value))}>{QUALITY.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</select>
              </label>
              {!voice?.models?.pitch && (
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 10 }}>{tr('Vibrato')}
                  <input type="range" min={0} max={0.8} step={0.05} value={vibrato} onChange={(e) => setVibrato(Number(e.target.value))} style={{ flex: 1 }} />
                </label>
              )}
            </div>
          )}

          {!busy ? (
            <button className="btn btn-primary" style={{ padding: '10px 0', fontSize: 14 }} disabled={!ready} onClick={() => void (engine === 'builtin' ? singBuiltin() : engine === 'diffsinger' ? singDiffSinger() : singAi())}>🎤 {tr('Sing')}</button>
          ) : (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{busy.text}</span><span>{Math.round(busy.pct)} %</span></div>
              <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${busy.pct}%`, height: '100%', background: 'var(--accent)' }} /></div>
            </div>
          )}
          {error && <div style={{ ...hint, color: 'var(--red)' }}>{error}</div>}
          {notice && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...hint, color: 'var(--green)' }}>{notice}</span>
              <button className="btn btn-ghost" onClick={() => useUIStore.getState().setActiveView('timeline')}>{tr('Open the Studio')}</button>
            </div>
          )}
        </div>

        {/* the notes with their syllables */}
        <div style={{ ...card, minWidth: 0 }}>
          <div style={label}>{tr('Notes and syllables')}</div>
          {!melody.length ? <div style={hint}>{tr('The notes of the melody appear here.')}</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {melody.slice(0, 400).map((m, i) => (
                <div key={m.note.id} title={trf('bar {bar}', { bar: Math.floor(m.beat / 4) + 1 })}
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 5px', borderRadius: 6, border: '1px solid var(--border)', background: m.note.lyric && m.note.lyric !== '+' ? 'rgba(168,85,247,0.12)' : 'rgba(0,0,0,0.15)', width: 74 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i + 1} · {noteName(m.note.pitch)}</span>
                  <input value={m.note.lyric ?? ''} onChange={(e) => setLyric(m, e.target.value)} placeholder="–" style={{ fontSize: 12, padding: '2px 4px', width: '100%' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
