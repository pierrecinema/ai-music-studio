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
import type { InsertFx, InsertType, Note, Track } from '../../types'
import { insertDefaults } from '../../audio/fx'
import { nanoid } from 'nanoid'
import { installProgress, rapLyrics, STAGE_TEXT } from '../../lib/singer'
import { minLength, snapBeat } from '../../edit/grid'
import { create } from 'zustand'
import { useBeatMatch } from '../../beatmatch/store'

const useVocalJob = create<{ busy: { text: string; pct: number } | null; error: string | null; notice: string | null }>(() => ({ busy: null, error: null, notice: null }))

interface BuiltinVoice { id: string; name: string; singer?: string; styles?: Record<string, string>; description: string; style: string; gender: string; kind?: string; credit: string; demo: string | null }

// how the built-in voices sing: the way of singing is shaped in the backend (services/soulx.py STYLES), the sound
// of the new vocal track here (its effects); rap is performed by the AI singer (ACE-Step), which really raps
type SingStyle = 'pop' | 'rock' | 'ballad' | 'soul' | 'rap'
const STYLES: Array<[SingStyle, string, string]> = [
  ['pop', 'Pop', 'light vibrato, small slides, compressed with some reverb'],
  ['rock', 'Rock', 'hard attacks, slides up into the notes, short notes, saturated and upfront'],
  ['ballad', 'Ballad', 'lots of vibrato, legato, a long reverb'],
  ['soul', 'Soul', 'turns and slides into the notes, warm, with vibrato'],
  ['rap', 'Rap', 'real rap flow by the AI singer (ACE-Step) in the song’s tempo; it raps your lyrics, not the single notes'],
]
const STYLE_FX: Record<SingStyle, Array<[InsertType, Record<string, number>]>> = {
  pop: [['filter', { mode: 1, freq: 100, q: 0.7 }], ['compressor', { threshold: -20, ratio: 3, attack: 8, release: 150, makeup: 4 }], ['eq', { low: -1, mid: 0, high: 3 }], ['delay', { beats: 0.5, feedback: 0.2, mix: 0.08 }], ['reverb', { decay: 1.8, mix: 0.2 }]],
  rock: [['filter', { mode: 1, freq: 120, q: 0.7 }], ['saturation', { driveDb: 12, mix: 0.45, excite: 0.25, exciteFreq: 4000, outDb: -3 }], ['compressor', { threshold: -24, ratio: 6, attack: 4, release: 100, makeup: 6 }], ['eq', { low: -2, mid: 3, high: 2 }], ['reverb', { decay: 1.2, mix: 0.12 }]],
  ballad: [['filter', { mode: 1, freq: 90, q: 0.7 }], ['compressor', { threshold: -18, ratio: 2.5, attack: 15, release: 250, makeup: 3 }], ['eq', { low: 0, mid: -1, high: 2.5 }], ['delay', { beats: 0.75, feedback: 0.3, mix: 0.12 }], ['reverb', { decay: 3.8, mix: 0.35 }]],
  soul: [['filter', { mode: 1, freq: 90, q: 0.7 }], ['saturation', { driveDb: 5, mix: 0.25, excite: 0.1, exciteFreq: 6000, outDb: -1 }], ['compressor', { threshold: -20, ratio: 3, attack: 10, release: 200, makeup: 4 }], ['eq', { low: 1, mid: 1, high: 1.5 }], ['reverb', { decay: 2.4, mix: 0.25 }]],
  rap: [['filter', { mode: 1, freq: 110, q: 0.7 }], ['compressor', { threshold: -24, ratio: 5, attack: 5, release: 120, makeup: 6 }], ['eq', { low: -1, mid: 2, high: 3 }], ['saturation', { driveDb: 4, mix: 0.2, excite: 0.15, exciteFreq: 5000, outDb: -1 }], ['reverb', { decay: 0.9, mix: 0.08 }]],
}
const styleFx = (st: SingStyle): InsertFx[] => STYLE_FX[st].map(([type, p]) => ({ id: nanoid(), type, on: true, p: { ...insertDefaults(type), ...p } }))
/** a built-in voice's name in the UI language: "Female singer 3", with "(2)" for a singer's second recording */
const voiceLabel = (v: BuiltinVoice): string => {
  if (v.singer) return `${v.singer}${v.id.endsWith('-2') ? ' 2' : ''}`
  const n = /^[fm](\d+)/.exec(v.id)?.[1] ?? ''
  return `${tr(v.gender === 'male' ? 'Male singer' : 'Female singer')} ${n}${v.id.endsWith('-2') ? ' (2)' : ''}`
}
const KINDS: Array<[string, string]> = [['clear', 'Clear voice'], ['vibrato', 'With vibrato'], ['power', 'Powerful']]
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
  const [style, setStyle] = useState<SingStyle>('pop')
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all')
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [autoFx, setAutoFx] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  // a click on a voice chooses it and plays its demo at once (a finished recording, nothing is computed);
  // a second click on the playing voice stops it
  /** plays a finished recording (a demo); the same key again stops it */
  const listen = (key: string, file: string | null | undefined): void => {
    void import('../../audio/engine').then(async (m) => {
      if (playing === key || !file) { m.stopPreview(); setPlaying(null); return }
      setPlaying(key)
      const r = await m.previewSample(file)
      if (!r) { setPlaying(null); return }
      void r.ended.then(() => setPlaying((cur) => (cur === key ? null : cur)))
    })
  }
  const pickVoice = (v: BuiltinVoice): void => { setBVoice(v.id); listen(v.id, v.demo) }
  const [rapEx, setRapEx] = useState<Array<{ file: string; name: string; voice: string; bpm: number; language?: string }>>([])
  useEffect(() => { api.singer.examples().then((r) => setRapEx(r.rap)).catch(() => setRapEx([])) }, [])
  useEffect(() => () => { void import('../../audio/engine').then((m) => m.stopPreview()) }, [])
  const [voices, setVoices] = useState<SingerVoice[] | null>(null)
  const [voicesInfo, setVoicesInfo] = useState<{ vocalsFolder: string; vocoderLicence: string } | null>(null)
  const [voiceId, setVoiceId] = useState('')
  const voice = voices?.find((v) => v.id === voiceId) ?? voices?.find((v) => !v.error)
  const [lang, setLang] = useState('en')
  const [text, setText] = useState('')
  const [steps, setSteps] = useState(20)
  const [vibrato, setVibrato] = useState(0.25)
  // the work in progress, its result and errors live outside the page: singing goes on (and its track arrives in the
  // Studio) when the page is left meanwhile, and the progress is still shown when it is opened again (owner: after
  // leaving the page while it sang, no vocals arrived)
  const busy = useVocalJob((s) => s.busy), error = useVocalJob((s) => s.error), notice = useVocalJob((s) => s.notice)
  const setBusy = (b: { text: string; pct: number } | null): void => useVocalJob.setState({ busy: b })
  const setError = (e: string | null): void => useVocalJob.setState({ error: e })
  const setNotice = (n: string | null): void => useVocalJob.setState({ notice: n })
  const [aiVoice, setAiVoice] = useState('female')
  const [aiStyle, setAiStyle] = useState('pop')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // the AI backend may still be starting when the page opens (right after the app starts): then the voices are
  // asked for again every few seconds. Only when the backend answers that the singer is missing is "Install" shown;
  // before, a backend that was still starting looked like a missing singer.
  const [offline, setOffline] = useState(false)
  const loadBuiltin = (): void => {
    api.singer.builtin().then((b) => { setBuiltin(b); setOffline(false) }).catch(() => {
      setOffline(true)
      setTimeout(() => { if (alive.current) loadBuiltin() }, 3000)
    })
  }
  useEffect(loadBuiltin, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // sent from the Studio (right-click on a recording → "My singing → MIDI melody"): convert that clip right away
  useEffect(() => {
    if (!useUIStore.getState().singingToMidi) return
    useUIStore.getState().setSingingToMidi(false)
    const t = setTimeout(() => { void singingRef.current?.('clip') }, 50)
    return () => clearTimeout(t)
  }, [])
  const singingRef = useRef<((from: 'clip' | 'file') => Promise<void>) | null>(null)
  const stage = useRef(0)
  const pctRef = useRef(0)
  const installSinger = async (): Promise<void> => {
    if (!window.confirm(tr('Install the singer now? About 4 GB are downloaded once (the singing model SoulX-Singer and its own Python environment). The AI backend restarts afterwards.'))) return
    setError(null); stage.current = 0; pctRef.current = 0; setBusy({ text: tr('Installing the singer…'), pct: 0 })
    const off = window.api.engines.onLog?.((line: string) => {
      const p = installProgress(line, stage.current)
      stage.current = p.stage
      if (p.pct !== null) pctRef.current = Math.max(pctRef.current, p.pct)
      setBusy({ text: `${tr(STAGE_TEXT[stage.current] ?? '')}${line.startsWith('>') ? '' : ' · ' + line.slice(0, 110)}`, pct: pctRef.current })
    })
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
    if (style === 'rap') {
      // the lyrics on the notes, or the lyrics field, rapped by the AI singer
      const words = text.trim() || notes.map((n) => n.lyric).filter((l) => l && l !== '+' && l !== '-').map((l) => l.replace(/^\+/, '')).join(' ')
      if (!words) { setError(tr('Write the lyrics first.')); return }
      await singAi({ lyrics: words, voice: bv.gender === 'male' ? 'male' : 'female', rap: true }); return
    }
    const sung = await withLyrics(notes)
    if (!sung) return
    try {
      const { jobId } = await api.singer.builtinRender({ voice: bv.id, notes: sung, lang: lang || 'en', rap: false, style, steps: natural ? 32 : 16, name: `${track?.name ?? 'Vocals'} ${bv.name}` })
      setBusy({ text: tr('Singing…'), pct: 0 })
      if (await poll(() => api.singer.job(jobId))) {
        const j = await api.singer.job(jobId)
        if (j.result) {
          addAudioTrack(j.result.file, `${tr('Vocals')} – ${voiceLabel(bv)} (${tr(STYLES.find(([k]) => k === style)?.[1] ?? '')})`, 0, j.result.seconds, autoFx ? styleFx(style) : undefined)
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
  const putLyrics = async (): Promise<string[] | null> => {
    if (!melody.length || !text.trim()) return null
    setError(null)
    try {
      const { lyrics } = await api.singer.lyrics(text, melody.length, lang || 'en')
      const st = useProjectStore.getState()
      melody.forEach((m, i) => st.updateNote(m.trackId, m.clipId, m.note.id, { lyric: lyrics[i] || undefined }))
      const words = text.split(/\s+/).filter(Boolean).length
      const placed = lyrics.filter((l) => l && l !== '+').length
      setNotice(placed < words ? trf('{placed} of {words} words fit on the {n} notes: add notes or shorten the lyrics.', { placed, words, n: melody.length }) : trf('The lyrics are on the {n} notes. Check and correct them below.', { n: melody.length }))
      return lyrics
    } catch (e) { setError((e as Error).message); return null }
  }
  // the lyrics go onto the notes by themselves a moment after typing (or changing the language); single syllables
  // can then be corrected under "Notes and syllables"
  const typed = useRef(false)
  useEffect(() => {
    if (!typed.current || engine === 'ai' || !text.trim() || !melody.length) return
    const t = setTimeout(() => { void putLyrics() }, 900)
    return () => clearTimeout(t)
  }, [text, lang, melody.length])  // eslint-disable-line react-hooks/exhaustive-deps
  /** the notes to sing with their syllables: lyrics written but not yet on the notes are put on them first */
  const withLyrics = async <T extends { lyric: string }>(notes: T[]): Promise<T[] | null> => {
    if (notes.some((n) => n.lyric && n.lyric !== '+')) return notes
    if (!text.trim()) { setError(tr('Write the lyrics first (in the Lyrics field): they are put on the notes by themselves.')); return null }
    const l = await putLyrics()
    return l ? notes.map((n, i) => ({ ...n, lyric: l[i] ?? '' })) : null
  }
  const setLyric = (m: SungNote, lyric: string): void => useProjectStore.getState().updateNote(m.trackId, m.clipId, m.note.id, { lyric: lyric || undefined })

  const addAudioTrack = (file: string, name: string, startBeat: number, seconds: number, fx?: InsertFx[]): void => {
    const st = useProjectStore.getState()
    st.addTrack('vocal')
    const ts = useProjectStore.getState().project.tracks
    const id = ts[ts.length - 1].id
    st.updateTrack(id, fx?.length ? { name, fx } : { name })
    const p = useProjectStore.getState().project
    const beats = (seconds * p.bpm) / 60
    st.addClip(id, { startTime: startBeat, duration: beats, audioFile: file, name })
    useBeatMatch.getState().setNotice(trf('New vocal track in the Studio: {name}', { name }))   // also seen when the page was left
  }

  const singDiffSinger = async (): Promise<void> => {
    if (!voice || !melody.length) return
    setError(null); setNotice(null)
    const p = useProjectStore.getState().project
    const notes = melody.map((m) => ({ pitch: m.note.pitch, start: beatToSec(p, m.beat), end: beatToSec(p, m.beat + m.note.duration), lyric: m.note.lyric ?? '' }))
    const sung = await withLyrics(notes)
    if (!sung) return
    try {
      const { jobId } = await api.singer.render({ voice: voice.id, notes: sung, lang: lang || undefined, steps, vibrato, name: `${track?.name ?? 'Vocals'} ${voice.name}` })
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
  const singAi = async (opt?: { lyrics: string; voice: string; rap: boolean }): Promise<void> => {
    const lyrics = opt?.lyrics ?? text
    const who = opt?.voice ?? aiVoice
    if (!melody.length || !lyrics.trim()) { setError(tr('Write the lyrics first.')); return }
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
        engine: 'ace-step-1.5', acapella: true, instrumental: false, lyrics: opt?.rap ? rapLyrics(lyrics) : lyrics, duration: seconds, bpm: Math.round(p.bpm),
        key: `${NOTE_NAMES[tonic]} ${minor ? 'minor' : 'major'}`, language: langName, voice: who,
        prompt: opt?.rap
          ? `${who} rapper, hip hop, rap vocals, rhythmic rap flow, confident delivery, punchy, spoken rap, no singing, a cappella, dry vocal, ${Math.round(p.bpm)} bpm`
          : `${who} solo vocal, ${aiStyle}, a cappella, clear lead vocal, ${Math.round(p.bpm)} bpm`,
        title: `${track?.name ?? 'Vocals'} (${opt?.rap ? 'rap' : 'AI singer'})`,
      })
      useMusicJob.getState().markHandled(jobId)
      useMusicJob.getState().setJob({ id: jobId, status: 'queued', warnings: [], results: [] })
      useMusicJob.getState().track(jobId)
      setBusy({ text: tr('The AI singer starts (this takes minutes on a CPU)…'), pct: 0 })
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000))
        const j = useMusicJob.getState().job
        if (!j || j.id !== jobId) continue
        const pct = j.step_total ? Math.round(((j.step ?? 0) / j.step_total) * 100) : 0
        setBusy({ text: j.stage_text ?? tr('Singing…'), pct })
        if (j.status === 'done') {
          const r = j.results[0]
          if (r?.audio_file) {
            addAudioTrack(r.audio_file, `${tr('Vocals')} – ${opt?.rap ? tr('Rap') : tr('AI singer')}`, first, seconds, opt?.rap && autoFx ? styleFx('rap') : undefined)
            setNotice(tr('The AI vocals are on a new track in the Studio from the first note. Move the clip if they start a little early or late.'))
          }
          break
        }
        if (j.status === 'error' || j.status === 'cancelled') { setError(j.error ?? tr('Cancelled.')); break }
      }
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  singingRef.current = singingToMidi
  const ready = engine === 'builtin' ? !!bv && !offline && (style === 'rap' || !builtin?.problem) && melody.length > 0 : engine === 'diffsinger' ? !!voice && !voice.error && voice.vocoderInstalled && melody.length > 0 : melody.length > 0 && !!text.trim()

  // ── layout "instrument" (owner's choice, 25.11.2026): a display with the voice and style, the voices as tiles,
  // the melody with its syllables and the lyrics below, the Sing button on the right
  const engineName = engine === 'builtin' ? tr('Built-in voices') : engine === 'diffsinger' ? tr('DiffSinger voice') : tr('AI singer (ACE-Step)')
  const shownName = engine === 'builtin' ? (bv ? voiceLabel(bv) : '–') : engine === 'diffsinger' ? (voice?.name ?? '–') : tr(aiVoice === 'male' ? 'Male voice' : 'Female voice')
  const shownStyle = engine === 'builtin' ? tr(STYLES.find(([k]) => k === style)?.[1] ?? '') : engine === 'ai' ? aiStyle : ''
  const status = offline ? { c: '#facc15', t: tr('The AI backend is starting…') } : engine === 'builtin' && builtin?.problem ? { c: '#f59e0b', t: tr('Install the singer') } : { c: '#22c55e', t: tr('Singer ready') }
  const tiles = (builtin?.voices ?? []).filter((v) => (gender === 'all' || v.gender === gender) && (kindFilter === 'all' || (v.kind ?? 'clear') === kindFilter))
  const sing = (): void => void (engine === 'builtin' ? singBuiltin() : engine === 'diffsinger' ? singDiffSinger() : singAi())
  const greyWhy = !melody.length ? tr('Sing is grey: there is no melody yet. Write notes on a MIDI track in the Piano Roll (or turn your singing into MIDI), then choose that track under Melody.')
    : engine === 'builtin' && offline ? tr('Sing is grey: the AI backend is still starting.')
    : engine === 'builtin' && builtin?.problem && style !== 'rap' ? tr('Sing is grey: install the singer first (button above).')
    : engine === 'ai' && !text.trim() ? tr('Sing is grey: write the lyrics first.')
    : tr('Sing is grey: choose a voice first.')

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Vocal Editor')}</div>
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: `1px solid ${status.c}66`, color: status.c }}>● {status.t}</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>{tr('Melody')}
          {midiTracks.length ? (
            <select value={track?.id ?? ''} onChange={(e) => setTrackId(e.target.value)} style={{ fontSize: 12 }}>
              {midiTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : <span style={{ color: 'var(--yellow)' }}>{tr('No MIDI track with notes yet: write a melody in the Piano Roll first.')}</span>}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>{tr('Singer')}
          <select value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} style={{ fontSize: 12 }}>
            <option value="builtin">{tr('Built-in voices')}</option><option value="diffsinger">{tr('DiffSinger voice')}</option><option value="ai">{tr('AI singer (ACE-Step)')}</option>
          </select>
        </label>
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* the display and the style */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', gap: 14 }}>
          <div style={{ background: '#05080c', border: '1px solid #1f2a37', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, minHeight: 84 }}>
            <Avatar id={engine === 'builtin' ? bv?.id ?? 'x' : engine} name={shownName} size={54} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 21, color: '#e0f2fe', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shownName}{shownStyle ? ` · ${shownStyle}` : ''}</div>
              <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, color: '#38bdf8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[engine === 'builtin' && bv ? `${tr(bv.gender === 'male' ? 'Male' : 'Female')} · ${tr(KINDS.find(([k]) => k === (bv.kind ?? 'clear'))?.[1] ?? '')}` : engineName, trf('{n} notes', { n: melody.length }), lang.toUpperCase() || '–', engine === 'builtin' && natural ? tr('best quality') : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Meter playing={!!playing} working={!!busy} />
          </div>
          <div style={{ ...card, padding: 12, justifyContent: 'center', gap: 8 }}>
            {engine === 'builtin' && (
              <>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {STYLES.map(([k, l]) => (
                    <button key={k} className={`btn ${style === k ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 12, padding: '5px 6px' }} onClick={() => setStyle(k)} title={tr(STYLES.find(([x]) => x === k)?.[2] ?? '')}>{tr(l)}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }} title={tr('Put the style’s effects on the new vocal track')}><input type="checkbox" checked={autoFx} onChange={(e) => setAutoFx(e.target.checked)} />{tr('Style effects')}</label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }} title={tr('Best quality (slower; off: about twice as fast)')}><input type="checkbox" checked={natural} onChange={(e) => setNatural(e.target.checked)} />{tr('Best quality')}</label>
                  {bv?.styles?.[style] && (() => { const key = `${bv.id}:${style}`; return (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => listen(key, bv.styles?.[style])}>{playing === key ? '■' : '▶'} {trf('{name} in each style:', { name: voiceLabel(bv) }).replace(/:$/, '')} · {tr(STYLES.find(([k]) => k === style)?.[1] ?? '')}</button>) })()}
                </div>
                <div style={{ ...hint, fontSize: 11 }}>{tr(STYLES.find(([k]) => k === style)?.[2] ?? '')}</div>
              </>
            )}
            {engine === 'diffsinger' && (
              <>
                {voices && voices.length > 0 ? (
                  <select value={voice?.id ?? ''} onChange={(e) => setVoiceId(e.target.value)}>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.languages?.length ? ` (${v.languages.join(', ')})` : ''}{v.error ? ` – ${tr('broken')}` : ''}</option>)}
                  </select>
                ) : <div style={{ ...hint, color: 'var(--yellow)' }}>{tr('No voice yet. Search the web for "DiffSinger voicebank OpenUtau" (for example Nishiren for English, German, Spanish; Tiger for English, Spanish), download the .zip, read and accept its terms, then import it.')}</div>}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => void importVoice()} disabled={!!busy}>{tr('Import a voice…')}</button>
                  {voice && <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => void removeVoice()} disabled={!!busy}>{tr('Delete')}</button>}
                  <select value={steps} onChange={(e) => setSteps(Number(e.target.value))} style={{ fontSize: 11.5 }} title={tr('Quality')}>{QUALITY.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</select>
                  {!voice?.models?.pitch && <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>{tr('Vibrato')}<input type="range" min={0} max={0.8} step={0.05} value={vibrato} onChange={(e) => setVibrato(Number(e.target.value))} style={{ width: 80 }} /></label>}
                </div>
              </>
            )}
            {engine === 'ai' && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={aiVoice} onChange={(e) => setAiVoice(e.target.value)} style={{ flex: 1 }}>
                    <option value="female">{tr('Female voice')}</option><option value="male">{tr('Male voice')}</option>
                  </select>
                  <input value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} placeholder={tr('Style, e.g. soul, breathy')} style={{ flex: 1 }} />
                </div>
                <div style={{ ...hint, fontSize: 11 }}>{tr('The music AI sings your lyrics a cappella in the tempo, key and length of the melody, in many languages. It does not follow every note: for that use a DiffSinger voice. Takes minutes on a CPU.')}</div>
              </>
            )}
          </div>
        </div>

        {/* what the chosen singer needs first */}
        {engine === 'builtin' && offline && <div style={{ ...hint, color: 'var(--yellow)' }}>{tr('The AI backend is starting… the voices appear in a moment.')}</div>}
        {engine === 'builtin' && !offline && builtin?.problem && (
          <div style={{ ...card, flexDirection: 'row', alignItems: 'center', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }}>
            <div style={{ ...hint, flex: 1 }}>{tr('The singer is installed once: about 4 GB (the singing model SoulX-Singer, Apache 2.0, and its own Python environment).')}</div>
            <button className="btn btn-primary" onClick={() => void installSinger()} disabled={!!busy}>{tr('Install the singer')}</button>
          </div>
        )}
        {engine === 'diffsinger' && voice?.error && <div style={{ ...hint, color: 'var(--red)' }}>{voice.error}</div>}
        {engine === 'diffsinger' && voice && !voice.error && !voice.vocoderInstalled && (
          <div style={{ ...card, flexDirection: 'row', alignItems: 'center', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }}>
            <div style={{ ...hint, flex: 1 }}>{trf('This voice needs the vocoder "{name}" (turns the voice model into sound), downloaded once.', { name: voice.vocoder ?? 'nsf_hifigan' })} <span style={{ fontSize: 10.5 }}>{voicesInfo?.vocoderLicence}</span></div>
            <button className="btn btn-primary" onClick={() => void installVocoder()} disabled={!!busy}>{tr('Install the vocoder')}</button>
          </div>
        )}
        {engine === 'diffsinger' && voice?.readme && (
          <details><summary style={{ ...hint, cursor: 'pointer' }}>{tr('Terms and notes of the voice (please read)')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 220, overflow: 'auto', color: 'var(--text-secondary)' }}>{voice.readme}</pre></details>
        )}

        {/* the voices as tiles */}
        {engine === 'builtin' && (builtin?.voices.length ?? 0) > 0 && (
          <div style={{ ...card, padding: 0, gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ ...label, flex: 1 }}>{trf('Voice ({n})', { n: String(builtin?.voices.length ?? 0) })}</span>
              <Seg value={gender} onChange={setGender} items={[['all', tr('All')], ['female', tr('Female')], ['male', tr('Male')]]} />
              <Seg value={kindFilter} onChange={setKindFilter} items={[['all', tr('All')], ...KINDS.map(([k, l]) => [k, tr(l)] as [string, string])]} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, padding: 10, maxHeight: 248, overflow: 'auto' }}>
              {tiles.map((v) => {
                const on = bv?.id === v.id
                return (
                  <button key={v.id} onClick={() => pickVoice(v)} title={`${tr('Click: choose and listen (click again: stop)')}\n${tr(v.description)}\n${v.credit}`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px 8px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'color-mix(in srgb, var(--accent) 16%, var(--bg-tertiary))' : 'var(--bg-tertiary)',
                      boxShadow: on ? '0 0 0 1px var(--accent), 0 6px 18px color-mix(in srgb, var(--accent) 30%, transparent)' : 'none', color: 'var(--text-primary)' }}>
                    <Avatar id={v.id} name={voiceLabel(v)} size={42} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voiceLabel(v)}</span>
                    <span style={{ fontSize: 10, color: playing === v.id ? 'var(--accent-light)' : 'var(--text-muted)' }}>{v.gender === 'male' ? '♂' : '♀'} {playing === v.id ? '■' : '▶'}</span>
                  </button>
                )
              })}
            </div>
            {style === 'rap' && rapEx.length > 0 && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '0 12px 10px' }}>
                <span style={{ ...hint, marginRight: 2 }}>{tr('Rap examples:')}</span>
                {rapEx.map((x) => <button key={x.file} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => listen(x.file, x.file)}>{playing === x.file ? '■' : '▶'} {tr(x.voice === 'male' ? 'Male' : 'Female')} · {x.bpm} BPM{x.language && x.language !== 'English' ? ` · ${tr(x.language)}` : ''}{/-2$/.test(x.name) ? ' 2' : ''}</button>)}
              </div>
            )}
            {style === 'rap' && <div style={{ ...hint, padding: '0 12px 10px' }}>{tr('Rap is made by the AI singer (ACE-Step 1.5, installed with the music AI); it takes a few minutes. The voice choice only decides male or female. The lyrics come from the lyrics field or, if it is empty, from the notes.')}</div>}
          </div>
        )}

        {/* the melody with its syllables, the lyrics, and Sing */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)', gap: 14, alignItems: 'stretch' }}>
          <div style={{ ...card, padding: 0, gap: 0, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ ...label, flex: 1 }}>{tr('Melody and lyrics')}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void singingToMidi('clip')} disabled={!!busy} title={tr('Or sing it: record yourself on an audio track in the Studio (or choose a recording), and the app writes the melody as MIDI.')}>🎙 {tr('My singing (Studio clip) → MIDI')}</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void singingToMidi('file')} disabled={!!busy}>{tr('A recording file → MIDI')}</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { if (track) useProjectStore.getState().selectTrack(track.id); useUIStore.getState().setActiveView('piano-roll') }} disabled={!track}>{tr('Piano Roll')} ↗</button>
            </div>
            <MelodyLane melody={melody} color={track?.color ?? '#8b5cf6'} onLyric={setLyric} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
              <select value={lang} onChange={(e) => { typed.current = true; setLang(e.target.value) }} style={{ fontSize: 12 }}>
                {LANGS.filter(([k]) => engine === 'ai' ? k : true).map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}
              </select>
              <textarea value={text} onChange={(e) => { typed.current = true; setText(e.target.value) }} rows={2} placeholder={tr('Write the lyrics here…')}
                style={{ flex: 1, resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }}
                title={engine !== 'ai' ? tr('The lyrics go onto the notes by themselves while you type; correct single syllables under “Notes and syllables”.') : undefined} />
              {engine !== 'ai' && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => void putLyrics()} disabled={!melody.length || !text.trim() || !!busy} title={tr('Put the lyrics on the notes again')}>⟳</button>}
            </div>
          </div>
          <div style={{ ...card, justifyContent: 'flex-end' }}>
            {engine === 'builtin' && <div style={{ ...hint, fontSize: 11 }}>{tr('The app’s own voices sing exactly your notes and lyrics. Runs on your processor: about a minute per 5 seconds of singing.')}</div>}
            {!busy ? (
              <>
                <button className="btn btn-primary" style={{ padding: '12px 0', fontSize: 15, fontWeight: 700 }} disabled={!ready} onClick={sing}>🎤 {tr('Sing')}</button>
                {!ready && <div style={{ ...hint, color: 'var(--yellow)' }}>{greyWhy}</div>}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}><span style={{ minWidth: 0 }}>{busy.text}</span><span>{Math.round(busy.pct)} %</span></div>
                <div style={{ height: 7, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${busy.pct}%`, height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }} /></div>
              </>
            )}
            {error && <div style={{ ...hint, color: 'var(--red)' }}>{error}</div>}
            {notice && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ ...hint, color: 'var(--green)' }}>{notice}</span>
                <button className="btn btn-ghost" onClick={() => useUIStore.getState().setActiveView('timeline')}>{tr('Open the Studio')}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const AVATAR_COLOURS = ['#db2777', '#9333ea', '#2563eb', '#ea580c', '#0891b2', '#dc2626', '#059669', '#ca8a04', '#7c3aed', '#0d9488', '#e11d48', '#4f46e5']
function Avatar({ id, name, size }: { id: string; name: string; size: number }): React.ReactElement {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: Math.round(size * 0.38), color: '#fff', background: AVATAR_COLOURS[h % AVATAR_COLOURS.length] }}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<[T, string] | [string, string]> }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {items.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k as T)} style={{ border: 'none', padding: '3px 9px', fontSize: 11.5, cursor: 'pointer', background: value === k ? 'var(--accent)' : 'var(--bg-tertiary)', color: value === k ? '#fff' : 'var(--text-secondary)' }}>{l}</button>
      ))}
    </span>
  )
}

/** the level display in the LCD: the real level of the voice that plays (its history scrolls from right to left);
 *  while the singer works (nothing plays) a calm light runs across instead, so the two are not mixed up */
function Meter({ playing, working }: { playing: boolean; working: boolean }): React.ReactElement {
  const [bars, setBars] = useState<number[]>(() => new Array(16).fill(0))
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!playing && !working) { setBars(new Array(16).fill(0)); return undefined }
    let raf = 0, last = 0
    let level: (() => number) | null = null
    void import('../../audio/engine').then((m) => { level = m.previewLevel })
    const loop = (now: number): void => {
      if (now - last > 60) {
        last = now
        if (playing) { const v = level ? level() : 0; setBars((b) => [...b.slice(1), v]) } else setTick((n) => n + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, working])
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'flex-end', height: 44, flexShrink: 0 }} title={working && !playing ? tr('Singing…') : undefined}>
      {bars.map((v, i) => {
        const run = !playing && working
        const lit = run && Math.abs(i - (tick % 22 - 3)) <= 1
        const h = playing ? 4 + Math.min(1, v * 1.6) * 40 : run ? (lit ? 14 : 6) : 6 + (i % 3) * 2
        const col = playing ? (v > 0.85 ? '#facc15' : '#22d3ee') : lit ? '#a78bfa' : '#334155'
        return <span key={i} style={{ width: 5, height: h, borderRadius: 2, background: col, transition: 'height 0.06s' }} />
      })}
    </span>
  )
}

/** the melody as note blocks (pitch up, time to the right). Hold a note and drag it: sideways = time (on the grid,
 *  Alt: free), up / down = pitch, at its right edge = length. A click without dragging opens its syllable. */
function MelodyLane({ melody, color, onLyric }: { melody: SungNote[]; color: string; onLyric: (m: SungNote, lyric: string) => void }): React.ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  if (!melody.length) return <div style={{ ...hint, padding: 16, minHeight: 160 }}>{tr('The notes of the melody appear here.')}</div>
  const first = Math.floor(melody[0].beat / 4) * 4
  const last = Math.max(...melody.map((m) => m.beat + m.note.duration))
  const beats = Math.max(4, Math.ceil((last - first) / 4) * 4)
  const lo = Math.min(...melody.map((m) => m.note.pitch)), hi = Math.max(...melody.map((m) => m.note.pitch))
  const span = Math.max(6, hi - lo)
  const H = 190, NH = 22
  const pxPerPitch = (H - NH - 16) / span
  const x = (b: number): string => `${(b / beats) * 100}%`
  const y = (p: number): number => 8 + ((hi - p) / span) * (H - NH - 16)
  const grab = (e: React.PointerEvent, m: SungNote): void => {
    if (e.button !== 0 || editing === m.note.id) return
    e.preventDefault()
    const rect = box.current!.getBoundingClientRect()
    const pxPerBeat = rect.width / beats
    const el = e.currentTarget as HTMLElement
    const resize = e.clientX > el.getBoundingClientRect().right - 7
    const x0 = e.clientX, y0 = e.clientY, orig = { ...m.note }
    let moved = false
    setHeld(m.note.id)
    void import('../../audio/engine').then((eng) => { const t = useProjectStore.getState().project.tracks.find((tt) => tt.id === m.trackId); if (t) void eng.previewNote(orig.pitch, orig.velocity, t) })
    {
      let lastPitch = orig.pitch
      const move = (ev: PointerEvent): void => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
        moved = true
        const st = useProjectStore.getState()
        if (resize) {
          st.updateNote(m.trackId, m.clipId, orig.id, { duration: Math.max(minLength(), snapBeat(orig.duration + dx / pxPerBeat, ev.altKey)) })
        } else {
          const pitch = Math.max(0, Math.min(127, orig.pitch - Math.round(dy / pxPerPitch)))
          st.updateNote(m.trackId, m.clipId, orig.id, { startTime: Math.max(0, snapBeat(orig.startTime + dx / pxPerBeat, ev.altKey)), pitch })
          if (pitch !== lastPitch) {
            lastPitch = pitch
            void import('../../audio/engine').then((eng) => { const t = st.project.tracks.find((tt) => tt.id === m.trackId); if (t) void eng.previewNote(pitch, orig.velocity, t) })
          }
        }
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
        setHeld(null)
        if (!moved) setEditing(orig.id)                 // a click: change the syllable
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
  }
  return (
    <div style={{ overflowX: 'auto', background: '#0f1318' }}>
      <div ref={box} style={{ position: 'relative', width: '100%', minWidth: beats * 36, height: H, userSelect: 'none' }}>
        {Array.from({ length: beats + 1 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: x(i), top: 0, bottom: 0, width: 1, background: (first + i) % 4 === 0 ? '#2a3340' : '#1b2129' }}>
            {(first + i) % 4 === 0 && <span style={{ position: 'absolute', left: 3, top: 2, fontSize: 9, color: '#4b5563' }}>{(first + i) / 4 + 1}</span>}
          </div>
        ))}
        {melody.map((m) => {
          const hold = m.note.lyric === '+'
          const ed = editing === m.note.id
          return (
            <div key={m.note.id} onPointerDown={(e) => grab(e, m)}
              title={`${noteName(m.note.pitch)} · ${trf('bar {bar}', { bar: Math.floor(m.beat / 4) + 1 })} · ${tr('Drag: move (up / down: pitch), right edge: length · click: change the syllable')}`}
              style={{ position: 'absolute', left: `calc(${x(m.beat - first)} + 1px)`, top: y(m.note.pitch), width: `calc(${x(m.note.duration)} - 3px)`, minWidth: 18, height: NH, borderRadius: 4,
                background: hold ? `${color}88` : color, border: `1px solid ${ed || held === m.note.id ? '#fff' : m.note.lyric ? '#ffffffaa' : '#ffffff33'}`,
                boxShadow: held === m.note.id ? '0 0 0 2px #ffffff55' : undefined, display: 'flex', alignItems: 'center', overflow: 'hidden',
                cursor: ed ? 'text' : held === m.note.id ? 'grabbing' : 'grab', zIndex: ed ? 3 : 1 }}>
              {ed ? (
                <input autoFocus defaultValue={m.note.lyric ?? ''} placeholder="–"
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => onLyric(m, e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); setEditing(null) } e.stopPropagation() }}
                  style={{ all: 'unset', width: '100%', padding: '0 5px', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#0008', userSelect: 'text', cursor: 'text' }} />
              ) : (
                <span style={{ padding: '0 5px', fontSize: 11.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px #0008', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{m.note.lyric || '–'}</span>
              )}
              <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
