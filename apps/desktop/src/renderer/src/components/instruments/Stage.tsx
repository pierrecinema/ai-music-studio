// The AI Instruments as a stage (owner's choice, 25.11.2026): the musicians stand on a lit stage, a click opens their
// device below. Every device has the same three helps on the right: ▶ Preview (hear it before it goes into the song),
// ✦ Ideas (three suggestions to listen to and take) and adding it, plus ✦ AI render (the notes played by the music AI
// as a real-sounding recording). Each device keeps its own look.
import React, { useEffect, useState } from 'react'
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../../stores/project.store'
import { api } from '../../lib/api'
import { beatToSec } from '../../audio/timemap'
import { encodeWav } from '../../audio/wav'
import { importAudioFiles } from '../timeline/Timeline'
import { tr, trf } from '../../i18n/tr'
import type { Note, Track } from '../../types'

export type MemberId = 'composer' | 'drums' | 'bass' | 'guitar' | 'orchestra' | 'soloist'
export interface Musician { id: MemberId; emoji: string; name: string; what: string; color: string }
export const MUSICIANS: Musician[] = [
  { id: 'composer', emoji: '🎼', name: 'Composer', what: 'Writes a whole song as MIDI: chords, melody, keys, bass, drums, guitar', color: '#22d3ee' },
  { id: 'drums', emoji: '🥁', name: 'Drummer', what: 'Plays a groove to your song', color: '#f97316' },
  { id: 'bass', emoji: '🎸', name: 'Bass player', what: 'Follows the chords of your song', color: '#3b82f6' },
  { id: 'guitar', emoji: '🎸', name: 'Guitarist', what: 'Strums or picks the chords of your song', color: '#f59e0b' },
  { id: 'orchestra', emoji: '🎻', name: 'Orchestra', what: 'Plays a MIDI track like a real musician: violin, cello, flute, trumpet …', color: '#8b5cf6' },
  { id: 'soloist', emoji: '✦', name: 'AI soloist', what: 'Any instrument you describe in words plays your MIDI track', color: '#db2777' },
]

// ── preview: notes played through the project's sounds (the sound packs), heard at once ──

type PNote = Omit<Note, 'id'>
export interface PreviewPart { notes: PNote[]; sound?: Track['sound']; program?: number }

const usePreview = create<{ key: string | null }>(() => ({ key: null }))
export function usePreviewKey(): string | null { return usePreview((s) => s.key) }

/** renders the parts (up to `beats` beats) and plays them; the same key again stops */
export async function previewParts(key: string, parts: PreviewPart[], beats: number): Promise<void> {
  const eng = await import('../../audio/engine')
  if (usePreview.getState().key === key) { eng.stopPreview(); usePreview.setState({ key: null }); return }
  eng.stopPreview()
  usePreview.setState({ key })
  try {
    const project = useProjectStore.getState().project
    const bufs: AudioBuffer[] = []
    for (const p of parts) {
      const notes = p.notes.filter((n) => n.startTime < beats).map((n) => ({ ...n, id: nanoid(), duration: Math.min(n.duration, beats - n.startTime) }))
      if (!notes.length) continue
      const t: Track = { id: 'preview', name: 'preview', type: 'midi', color: '#fff', volume: 0.8, pan: 0, muted: false, soloed: false, sound: p.sound, program: p.program,
        clips: [{ id: 'c', startTime: 0, duration: beats, notes }] }
      bufs.push(await eng.renderMidiGuide({ ...project, tracks: [t] }, t, 0, beats))
    }
    if (usePreview.getState().key !== key || !bufs.length) { if (!bufs.length) usePreview.setState({ key: null }); return }
    const len = Math.max(...bufs.map((b) => b.length))
    const out = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: bufs[0].sampleRate })
    for (const b of bufs) for (let c = 0; c < 2; c++) {
      const o = out.getChannelData(c), d = b.getChannelData(Math.min(c, b.numberOfChannels - 1))
      for (let i = 0; i < d.length; i++) o[i] += d[i] * (bufs.length > 1 ? 0.7 : 1)
    }
    const path = `preview:${key}`
    eng.putBuffer(path, out)
    const r = await eng.previewSample(path)
    if (!r) { usePreview.setState({ key: null }); return }
    void r.ended.then(() => { if (usePreview.getState().key === key) usePreview.setState({ key: null }) })
  } catch (e) { console.warn('[preview]', e); usePreview.setState({ key: null }) }
}
/** a finished recording (a demo file) as a preview; the same key again stops */
export async function previewFile(key: string, file: string): Promise<void> {
  const eng = await import('../../audio/engine')
  if (usePreview.getState().key === key) { eng.stopPreview(); usePreview.setState({ key: null }); return }
  usePreview.setState({ key })
  const r = await eng.previewSample(file)
  if (!r) { usePreview.setState({ key: null }); return }
  void r.ended.then(() => { if (usePreview.getState().key === key) usePreview.setState({ key: null }) })
}

// ── AI render: a MIDI track played by the music AI (ACE-Step cover) as a real-sounding recording ──

export const useAiRender = create<{ jobs: Record<string, { text: string; pct: number; error?: string; done?: boolean }> }>(() => ({ jobs: {} }))
const setJob = (k: string, v: { text: string; pct: number; error?: string; done?: boolean }): void => useAiRender.setState((s) => ({ jobs: { ...s.jobs, [k]: v } }))

/** the track's notes rendered as a guide, then played by ACE-Step in the described sound; the result is a new audio
 *  track at the same place, the MIDI track is muted. Goes on in the background when the page is left. */
export async function aiRender(key: string, trackId: string, style: string, strength = 0.6): Promise<void> {
  const st = useProjectStore.getState()
  const project = st.project
  const track = project.tracks.find((t) => t.id === trackId)
  if (!track) return
  const notes = track.clips.flatMap((c) => (c.notes ?? []).map((n) => ({ start: c.startTime + n.startTime, end: c.startTime + n.startTime + n.duration })))
  if (!notes.length) return
  const from = Math.floor(Math.min(...notes.map((n) => n.start)) / 4) * 4
  const to = Math.ceil(Math.max(...notes.map((n) => n.end)) / 4) * 4
  try {
    setJob(key, { text: tr('Playing the MIDI track as a guide …'), pct: 0 })
    const eng = await import('../../audio/engine')
    const buf = await eng.renderMidiGuide(project, track, from, to)
    const path = await window.api.files.saveRecording(encodeWav(buf, 16))
    eng.putBuffer(path, buf)
    const seconds = Math.max(10, Math.min(600, Math.round(beatToSec(project, to) - beatToSec(project, from))))
    const { jobId } = await api.music.generate({
      engine: 'ace-step', prompt: `${style}, studio recording, instrumental`, instrumental: true, duration: seconds, bpm: Math.round(project.bpm),
      source_track: path, source_task: 'cover', source_strength: strength, title: `${style} (AI) – ${track.name}`, tags: ['ai instrument', 'ai render'], songs: 1, variations: 1, queue: 1,
    })
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500))
      const j = await api.music.job(jobId)
      const pct = j.step_total ? Math.round(((j.step ?? 0) / j.step_total) * 100) : 0
      if (j.status === 'done' && j.audio_file) {
        const problems = await importAudioFiles([j.audio_file], { startBeat: from, noBeatMatch: true })
        if (problems.length) { setJob(key, { text: problems.join(' '), pct: 100, error: problems.join(' ') }); return }
        const ts = useProjectStore.getState().project.tracks
        useProjectStore.getState().updateTrack(ts[ts.length - 1].id, { name: `${track.name} (AI)` })
        useProjectStore.getState().updateTrack(track.id, { muted: true })
        setJob(key, { text: trf('Done: “{name}” is a recording in the Studio now (the MIDI track is muted).', { name: `${track.name} (AI)` }), pct: 100, done: true })
        return
      }
      if (j.status === 'error' || j.status === 'cancelled') { setJob(key, { text: j.error ?? tr('Cancelled.'), pct: 0, error: j.error ?? tr('Cancelled.') }); return }
      setJob(key, { text: tr(j.stage_text ?? j.status), pct })
    }
  } catch (e) { setJob(key, { text: (e as Error).message, pct: 0, error: (e as Error).message }) }
}

// ── the stage ──

export function StageView({ who, setWho, lit }: { who: MemberId; setWho: (m: MemberId) => void; lit: Partial<Record<MemberId, boolean>> }): React.ReactElement {
  return (
    <div style={{ position: 'relative', height: 250, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid #2a2240',
      background: 'radial-gradient(ellipse at 50% -10%, #4c3a8e 0%, #1d1631 50%, #0c0a12 100%)' }}>
      {/* spotlights and the stage floor */}
      <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 160deg at 20% -10%, transparent 0deg, #ffffff10 12deg, transparent 24deg), conic-gradient(from 176deg at 80% -10%, transparent 0deg, #ffffff10 12deg, transparent 24deg)' }} />
      <div style={{ position: 'absolute', left: '-5%', right: '-5%', bottom: 0, height: 92, background: 'linear-gradient(180deg, #3a2716, #160e08)', transform: 'perspective(500px) rotateX(42deg)', transformOrigin: 'bottom', borderTop: '2px solid #5b3d22' }} />
      <div style={{ position: 'absolute', inset: '18px 16px 34px', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
        {MUSICIANS.map((m) => {
          const sel = who === m.id, on = !!lit[m.id]
          return (
            <button key={m.id} onClick={() => setWho(m.id)} title={tr(m.what)}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transform: sel ? 'translateY(-6px)' : undefined, transition: 'transform 0.15s' }}>
              <span style={{ width: sel ? 104 : 84, height: sel ? 104 : 84, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: sel ? 50 : 40,
                background: on || sel ? `radial-gradient(circle at 50% 35%, ${m.color}88, ${m.color}22)` : '#ffffff0d',
                border: `2px solid ${sel ? '#fff' : on ? m.color : '#ffffff22'}`, boxShadow: sel ? `0 0 44px ${m.color}aa` : on ? `0 0 26px ${m.color}66` : 'none', transition: 'all 0.15s' }}>{m.emoji}</span>
              <b style={{ color: sel ? '#fff' : '#e5e7eb', fontSize: 13, textShadow: '0 1px 3px #000' }}>{tr(m.name)}</b>
              <span style={{ fontSize: 10, color: on ? m.color : '#ffffff66' }}>{on ? `● ${tr('in your song')}` : ' '}</span>
            </button>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 14, bottom: 8, fontSize: 11, color: '#ffffffaa' }}>{tr('Click a musician to set them up below · ▶ hear them before they go into your song · ✦ the AI has ideas')}</div>
    </div>
  )
}

/** the desk of one musician under the stage: who they are and what the knobs do (left), their device (middle),
 *  and Preview / Ideas / Add / AI render (right) */
export function Desk({ m, hints, children, actions }: { m: Musician; hints: string[]; children: React.ReactNode; actions: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 230px) minmax(0, 1fr) minmax(220px, 260px)', gap: 14, alignItems: 'start' }}>
      <div style={{ borderRadius: 12, padding: 14, background: `linear-gradient(170deg, ${m.color}44, #15131c 70%)`, border: `1px solid ${m.color}66`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 40 }}>{m.emoji}</span>
        <b style={{ fontSize: 17, color: '#fff' }}>{tr(m.name)}</b>
        <span style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.4 }}>{tr(m.what)}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
          {hints.map((h) => <span key={h} style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.35 }}>ⓘ {tr(h)}</span>)}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ borderRadius: 12, padding: 12, background: '#15131c', border: '1px solid #2a2240', display: 'flex', flexDirection: 'column', gap: 8 }}>{actions}</div>
    </div>
  )
}

export function ActBtn({ children, onClick, kind = 'plain', disabled, title }: { children: React.ReactNode; onClick: () => void; kind?: 'play' | 'ai' | 'add' | 'plain'; disabled?: boolean; title?: string }): React.ReactElement {
  const bg = kind === 'play' ? '#ffffff' : kind === 'ai' ? 'linear-gradient(90deg, #7c3aed, #db2777)' : kind === 'add' ? '#22c55e' : '#ffffff14'
  const fg = kind === 'play' ? '#111' : '#fff'
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ border: 'none', borderRadius: 999, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, background: bg, color: fg, textAlign: 'center' }}>{children}</button>
  )
}

/** three ideas: each can be heard (▶) and taken (click) */
export function Ideas<T>({ ideas, label, onHear, onTake, playingKey }: { ideas: T[]; label: (i: T) => string; onHear: (i: T, k: string) => void; onTake: (i: T) => void; playingKey: string | null }): React.ReactElement | null {
  if (!ideas.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {ideas.map((i, n) => {
        const k = `idea-${n}-${label(i)}`
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 8, background: '#ffffff0a', border: '1px solid #ffffff14' }}>
            <button onClick={() => onHear(i, k)} title={tr('Listen')} style={{ border: 'none', width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', background: playingKey === k ? '#db2777' : '#ffffff22', color: '#fff', fontSize: 10 }}>{playingKey === k ? '■' : '▶'}</button>
            <span style={{ flex: 1, fontSize: 11.5, color: '#e5e7eb', minWidth: 0 }}>{label(i)}</span>
            <button onClick={() => onTake(i)} style={{ border: '1px solid #ffffff33', borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer', background: 'transparent', color: '#fff' }}>{tr('Take')}</button>
          </div>
        )
      })}
    </div>
  )
}

/** the state of an AI render (progress, done, error) under the buttons */
export function RenderState({ k }: { k: string }): React.ReactElement | null {
  const j = useAiRender((s) => s.jobs[k])
  if (!j) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!j.done && !j.error && <div style={{ height: 6, borderRadius: 3, background: '#ffffff14', overflow: 'hidden' }}><div style={{ width: `${Math.max(4, j.pct)}%`, height: '100%', background: 'linear-gradient(90deg, #7c3aed, #db2777)' }} /></div>}
      <span style={{ fontSize: 11, color: j.error ? '#fbbf24' : j.done ? '#86efac' : '#cbd5e1' }}>{j.text}</span>
    </div>
  )
}

/** whether the AI renderer (ACE-Step) is there and whether there is an NVIDIA card */
export function useAceStatus(): { ace: boolean; cuda: boolean } | null {
  const [s, setS] = useState<{ ace: boolean; cuda: boolean } | null>(null)
  useEffect(() => { let on = true; api.instruments.status().then((x) => on && setS(x)).catch(() => on && setS(null)); return () => { on = false } }, [])
  return s
}
