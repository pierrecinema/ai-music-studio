import React, { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { api } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { ExportDialog } from '../common/ExportDialog'
import { WaveformSeek } from '../common/WaveformSeek'

// The stems of one split, played together: Solo, Mute and volume per stem, a remix of the audible stems
// (karaoke without vocals, a version without drums, ...) and Audio → MIDI of one stem into the Piano Roll.

interface Props {
  stems: Record<string, string>         // stem name -> wav file
  colors: Record<string, string>
  labels: Record<string, string>        // stem name -> shown name
  title: string                         // song name, for file and track names
}

interface Strip { volume: number; mute: boolean; solo: boolean }

export function StemMixer({ stems, colors, labels, title }: Props): React.ReactElement {
  const names = Object.keys(stems).filter((n) => stems[n])
  const [strips, setStrips] = useState<Record<string, Strip>>(() =>
    Object.fromEntries(names.map((n) => [n, { volume: 1, mute: false, solo: false }])))
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState<AudioBuffer[] | null>(null)   // all stems decoded: for the waveform
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)                  // seconds
  const [length, setLength] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)   // 'remix' or the stem being turned into MIDI
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState<{ path: string; name: string } | null>(null)

  const ctx = useRef<AudioContext | null>(null)
  const buffers = useRef<Record<string, AudioBuffer>>({})
  const gains = useRef<Record<string, GainNode>>({})
  const sources = useRef<AudioBufferSourceNode[]>([])
  const startedAt = useRef(0)                        // ctx time that matches second 0 of the song
  const raf = useRef(0)
  const lengthRef = useRef(0)                        // for the animation loop (state would be stale there)

  const anySolo = Object.values(strips).some((s) => s.solo)
  const audible = (n: string): boolean => !!strips[n] && !strips[n].mute && (!anySolo || strips[n].solo)
  const level = (n: string): number => (audible(n) ? strips[n].volume : 0)

  // live gain changes while playing
  useEffect(() => {
    for (const n of names) {
      const g = gains.current[n]
      if (g && ctx.current) g.gain.setTargetAtTime(level(n), ctx.current.currentTime, 0.02)
    }
  })

  useEffect(() => {
    void load()
    return () => {
      stopSources(); cancelAnimationFrame(raf.current)
      const c = ctx.current
      ctx.current = null; buffers.current = {}; gains.current = {}     // a remount starts clean
      void c?.close()
    }
  }, [])   // decode at once: the waveform shows before playing

  const stopSources = (): void => {
    for (const s of sources.current) { try { s.stop() } catch { /* already stopped */ } }
    sources.current = []
  }

  const load = async (): Promise<boolean> => {
    if (Object.keys(buffers.current).length === names.length) return true
    setLoading(true); setError(null)
    try {
      const c = (ctx.current ??= new AudioContext())
      for (const n of names) {
        if (buffers.current[n]) continue
        const bytes = await window.api.fs.readFile(stems[n])
        const ab = new Uint8Array(bytes).buffer
        const decoded = await c.decodeAudioData(ab)
        if (ctx.current !== c) return false                            // unmounted meanwhile
        buffers.current[n] = decoded
        const g = c.createGain()
        g.connect(c.destination)
        gains.current[n] = g
      }
      lengthRef.current = Math.max(...Object.values(buffers.current).map((b) => b.duration))
      setLoaded(Object.values(buffers.current))
      setLength(lengthRef.current)
      return true
    } catch (e) {
      if (ctx.current) setError(`Cannot play the stems: ${(e as Error).message}`)
      return false
    } finally { setLoading(false) }
  }

  const tick = (): void => {
    if (!ctx.current) return
    const t = ctx.current.currentTime - startedAt.current
    setPos(t)
    if (lengthRef.current > 0 && t >= lengthRef.current) { stop(); setPos(0); return }
    raf.current = requestAnimationFrame(tick)
  }

  const playFrom = async (from: number): Promise<void> => {
    if (!(await load()) || !ctx.current) return
    await ctx.current.resume()
    stopSources()
    const when = ctx.current.currentTime + 0.05
    for (const n of names) {
      const src = ctx.current.createBufferSource()
      src.buffer = buffers.current[n]
      src.connect(gains.current[n])
      gains.current[n].gain.value = level(n)
      src.start(when, Math.min(from, src.buffer.duration))
      sources.current.push(src)
    }
    startedAt.current = when - from
    setPlaying(true)
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
  }

  const stop = (): void => {
    stopSources(); cancelAnimationFrame(raf.current); setPlaying(false)
  }

  const set = (n: string, patch: Partial<Strip>): void => setStrips((s) => ({ ...s, [n]: { ...s[n], ...patch } }))

  // "Remix – no vocals", "Remix – vocals only", "Remix"
  const remixName = (): string => {
    const off = names.filter((n) => !audible(n))
    const on = names.filter((n) => audible(n))
    if (off.length === 0) return `${title} – remix`
    if (on.length === 1) return `${title} – ${labels[on[0]] ?? on[0]} only`
    return `${title} – no ${off.map((n) => (labels[n] ?? n).toLowerCase()).join(', no ')}`
  }

  const exportRemix = async (): Promise<void> => {
    setBusy('remix'); setError(null)
    try {
      const r = await api.stems.remix({ stems, gains: Object.fromEntries(names.map((n) => [n, level(n)])) })
      setExporting({ path: r.path, name: remixName() })
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  // Audio → MIDI: notes of one stem as a new MIDI track, opened in the Piano Roll
  const toMidi = async (n: string): Promise<void> => {
    setBusy(n); setError(null); setNotice(null)
    try {
      const r = await api.audioToMidi.convert({ filePath: stems[n] })
      if (!r.notes.length) {
        setError(r.engine === 'stub'
          ? 'Audio → MIDI is not installed: Settings → AI Engines → Audio → MIDI (basic-pitch), then Install selected.'
          : 'No notes were found in this stem.')
        setBusy(null); return
      }
      const store = useProjectStore.getState()
      const bpm = store.project.bpm || 120
      const beat = (sec: number): number => (sec * bpm) / 60
      const notes = r.notes.map((x) => ({ id: nanoid(), pitch: x.pitch, startTime: beat(x.startTime), duration: Math.max(0.05, beat(x.duration)), velocity: x.velocity }))
      const end = Math.max(...notes.map((x) => x.startTime + x.duration))
      store.addTrack('midi')
      const track = useProjectStore.getState().project.tracks.at(-1)!
      store.updateTrack(track.id, { name: `${title} – ${labels[n] ?? n} (MIDI)` })
      store.addClip(track.id, { startTime: 0, duration: Math.ceil(end / 4) * 4 || 4, notes, name: `${labels[n] ?? n} (MIDI)` })
      const clip = useProjectStore.getState().project.tracks.find((t) => t.id === track.id)!.clips[0]
      store.selectTrack(track.id); store.selectClip(clip.id)
      setNotice(`${notes.length} notes from ${labels[n] ?? n} are on a new MIDI track${r.warnings.length ? ` (${r.warnings.join(' ')})` : ''}.`)
    } catch (e) { setError(`Audio → MIDI failed: ${(e as Error).message}`) }
    setBusy(null)
  }

  const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const small: React.CSSProperties = { fontSize: 11, padding: '3px 8px', minWidth: 26 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* transport */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 720 }}>
        <button className="btn btn-primary" style={{ minWidth: 92 }} disabled={loading}
          onClick={() => (playing ? stop() : void playFrom(pos >= length ? 0 : pos))}>
          {loading ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
        </button>
        <div style={{ flex: 1 }}>
          <WaveformSeek fileKey={`stems:${names.map((n) => stems[n]).join('|')}`} buffers={loaded}
            position={() => ({ time: pos, duration: length })}
            onSeek={(v) => { setPos(v); if (playing) void playFrom(v) }} />
        </div>
      </div>

      {/* one strip per stem */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 720 }}>
        {names.map((n) => {
          const s = strips[n]
          const on = audible(n)
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
              border: `1px solid ${colors[n] ?? 'var(--border-mid)'}`, background: 'var(--bg-secondary)', opacity: on ? 1 : 0.5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: colors[n] ?? '#888', flexShrink: 0 }} />
              <span style={{ width: 90, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{labels[n] ?? n}</span>
              <button className="btn btn-ghost" style={{ ...small, background: s.solo ? '#ca8a04' : undefined, color: s.solo ? 'white' : undefined }}
                title="Solo: hear only the soloed stems" onClick={() => set(n, { solo: !s.solo })}>S</button>
              <button className="btn btn-ghost" style={{ ...small, background: s.mute ? 'var(--red)' : undefined, color: s.mute ? 'white' : undefined }}
                title="Mute: leave this stem out (also in the remix)" onClick={() => set(n, { mute: !s.mute })}>M</button>
              <input type="range" min={0} max={1.5} step={0.01} value={s.volume} style={{ flex: 1 }} title="Volume"
                onChange={(e) => set(n, { volume: Number(e.target.value) })} onDoubleClick={() => set(n, { volume: 1 })} />
              <span style={{ width: 40, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{Math.round(s.volume * 100)} %</span>
              {n !== 'drums' && (
                <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={busy !== null}
                  title="Turn this stem into MIDI notes on a new track (Piano Roll)" onClick={() => void toMidi(n)}>
                  {busy === n ? 'Converting…' : '→ MIDI'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy !== null || names.every((n) => !audible(n))} onClick={() => void exportRemix()}>
          {busy === 'remix' ? 'Mixing…' : 'Export remix…'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Mixes the stems you hear, at these levels: mute Vocals for a karaoke version, Drums for a version without drums.
        </span>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {notice && (
        <div style={{ color: 'var(--green)', fontSize: 12 }}>
          {notice} <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }}
            onClick={() => useUIStore.getState().setActiveView('piano-roll')}>Open Piano Roll</button>
        </div>
      )}
      {exporting && (
        <ExportDialog title="remix" items={[exporting]} onClose={() => setExporting(null)} />
      )}
    </div>
  )
}
