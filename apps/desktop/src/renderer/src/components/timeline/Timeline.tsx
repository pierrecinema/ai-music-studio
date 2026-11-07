import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useAudioStore } from '../../stores/audio.store'
import { bufferOf, failedFiles, loadBuffer, onBuffersChanged, peaksOf, PEAKS_PER_SECOND, projectEndBeat, secToBeats, seek, sourceSecPerBeat } from '../../audio/engine'
import type { Clip, Track } from '../../types'
import { useBeatMatch } from '../../beatmatch/store'
import { minLength, snapBeat } from '../../edit/grid'
import { GridControls } from '../../edit/GridControls'

const TRACK_HEIGHT = 72
const HEADER_WIDTH = 200
const RULER_HEIGHT = 24
const BEAT_WIDTH = 80
const HANDLE = 6

const AUDIO_TYPES: Track['type'][] = ['audio', 'vocal', 'instrument']
const NOTE_TYPES: Track['type'][] = ['midi', 'instrument', 'vocal']

// ── importing audio ──────────────────────────────────────────────────────────

export async function importAudioFiles(
  paths: string[],
  at?: { trackId?: string; startBeat?: number; warpBpm?: number; noBeatMatch?: boolean }
): Promise<string[]> {
  const problems: string[] = []
  let startBeat = at?.startBeat ?? useAudioStore.getState().currentBeat
  for (const [i, path] of paths.entries()) {
    const buf = await loadBuffer(path)
    const name = (path.split(/[\\/]/).pop() ?? 'Audio').replace(/\.[^.]+$/, '')
    if (!buf) { problems.push(`${name}: this file cannot be read as audio.`); continue }
    const store = useProjectStore.getState()
    let trackId = i === 0 ? at?.trackId : undefined
    const target = store.project.tracks.find((t) => t.id === trackId)
    if (!target || !AUDIO_TYPES.includes(target.type)) {
      store.addTrack('audio')
      const tracks = useProjectStore.getState().project.tracks
      trackId = tracks[tracks.length - 1].id
      useProjectStore.getState().updateTrack(trackId, { name })
    }
    const warp = at?.warpBpm && buf.duration >= 1 ? at.warpBpm : undefined      // one-shots are not stretched
    const hadAudio = useProjectStore.getState().project.tracks.some((t) => t.clips.some((c) => c.audioFile))
    useProjectStore.getState().addClip(trackId!, {
      startTime: startBeat,
      // a synced sample is measured in its own tempo: a 2-bar loop stays 8 beats long at any project tempo
      duration: secToBeats(buf.duration, warp ?? store.project.bpm),
      audioFile: path, name, warpBpm: warp
    })
    useProjectStore.getState().selectTrack(trackId!)
    // new audio: offer to bring it in time with the project (not for one-shots or already synced samples)
    if (!warp && !at?.noBeatMatch && buf.duration >= 1) {
      const t = useProjectStore.getState().project.tracks.find((x) => x.id === trackId)
      const created = t?.clips[t.clips.length - 1]
      if (created) void useBeatMatch.getState().propose(trackId!, created.id, path, name, !hadAudio)
    }
  }
  return problems
}

export async function pickAndImport(at?: { trackId?: string; startBeat?: number; warpBpm?: number }): Promise<string[]> {
  const paths = await window.api.dialog.openAudio()
  return paths.length ? importAudioFiles(paths, at) : []
}

// ── waveform ─────────────────────────────────────────────────────────────────

const Waveform = React.memo(function Waveform({ clip, color, bpm, width }: { clip: Clip; color: string; bpm: number; width: number }): React.ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const [version, bump] = useState(0)
  useEffect(() => onBuffersChanged(() => bump((n) => n + 1)), [])
  const path = clip.audioFile

  useLayoutEffect(() => {
    const canvas = ref.current
    const peaks = path ? peaksOf(path) : null
    if (!canvas || !peaks) return
    const w = Math.max(1, Math.min(8192, Math.floor(width)))
    const h = TRACK_HEIGHT - 18
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, w, h)
    g.fillStyle = color
    const startIdx = (clip.offset ?? 0) * PEAKS_PER_SECOND
    const spanIdx = clip.duration * sourceSecPerBeat(clip.warpBpm, bpm) * PEAKS_PER_SECOND
    const per = spanIdx / w
    const mid = h / 2
    for (let x = 0; x < w; x++) {
      const from = Math.floor(startIdx + x * per)
      const to = Math.max(from + 1, Math.floor(startIdx + (x + 1) * per))
      let m = 0
      for (let i = from; i < to && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i]
      const half = Math.min(mid, Math.max(m > 0.002 ? 1 : 0, m * mid * 0.95))
      if (half > 0) g.fillRect(x, mid - half, 1, half * 2)
    }
  }, [path, clip.offset, clip.duration, clip.warpBpm, width, bpm, color, version])

  if (!path || !peaksOf(path)) return null
  return <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0.75, pointerEvents: 'none' }} />
})

// ── drag state ───────────────────────────────────────────────────────────────

interface Drag {
  kind: 'move' | 'trimL' | 'trimR'
  trackId: string
  clipId: string
  startX: number
  startY: number
  orig: Clip
  moved: boolean
}

export function Timeline({ fill = false }: { fill?: boolean }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const selectedClipId = useProjectStore((s) => s.selectedClipId)
  const { addTrack, updateTrack, removeTrack, selectTrack, selectClip, updateClip, moveClip, addClip, moveTrack } = useProjectStore.getState()
  const zoom = useUIStore((s) => s.zoom)
  const setZoom = useUIStore((s) => s.setZoom)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const loadingAudio = useAudioStore((s) => s.loading)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [, rerender] = useState(0)
  useEffect(() => onBuffersChanged(() => rerender((n) => n + 1)), [])

  const bpm = project.bpm || 120
  const beatWidth = BEAT_WIDTH * zoom
  const totalBeats = Math.max(128, Math.ceil(projectEndBeat(project)) + 32)
  const snap = (b: number, free: boolean): number => snapBeat(b, free)         // free = Alt held, or Snap is off

  const beatAt = useCallback((clientX: number): number => {
    const rect = lanesRef.current!.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left) / beatWidth)
  }, [beatWidth])

  const trackIndexAt = (clientY: number): number => {
    const rect = lanesRef.current!.getBoundingClientRect()
    return Math.floor((clientY - rect.top) / TRACK_HEIGHT)
  }

  // ── dragging clips ─────────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 3) return
      d.moved = true
      const dBeats = (e.clientX - d.startX) / beatWidth
      const free = e.altKey
      const o = d.orig
      if (d.kind === 'move') {
        const start = snap(o.startTime + dBeats, free)
        const tracks = useProjectStore.getState().project.tracks
        const from = tracks.find((t) => t.clips.some((c) => c.id === d.clipId))
        let toId = from?.id ?? d.trackId
        const idx = trackIndexAt(e.clientY)
        const hover = tracks[idx]
        const accepts = (t: Track): boolean => (o.audioFile ? AUDIO_TYPES.includes(t.type) : NOTE_TYPES.includes(t.type))
        if (hover && accepts(hover)) toId = hover.id
        moveClip(from?.id ?? d.trackId, d.clipId, toId, Math.max(0, start))
        d.trackId = toId
      } else if (d.kind === 'trimR') {
        let dur = Math.max(minLength(), snap(o.startTime + o.duration + dBeats, free) - o.startTime)
        if (o.audioFile) {
          const buf = bufferOf(o.audioFile)
          if (buf) dur = Math.min(dur, (buf.duration - (o.offset ?? 0)) / sourceSecPerBeat(o.warpBpm, bpm))
        }
        updateClip(d.trackId, d.clipId, { duration: dur })
      } else {
        const end = o.startTime + o.duration
        let start = Math.min(end - minLength(), Math.max(0, snap(o.startTime + dBeats, free)))
        let offset = o.offset
        if (o.audioFile) {
          const shift = (start - o.startTime) * sourceSecPerBeat(o.warpBpm, bpm)
          const newOffset = (o.offset ?? 0) + shift
          if (newOffset < 0) { start = o.startTime - (o.offset ?? 0) / sourceSecPerBeat(o.warpBpm, bpm); offset = 0 } else offset = newOffset
        }
        updateClip(d.trackId, d.clipId, { startTime: start, duration: end - start, offset })
      }
    }
    const onUp = (): void => { drag.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatWidth, bpm])

  const startDrag = (e: React.PointerEvent, track: Track, clip: Clip, width: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectTrack(track.id)
    selectClip(clip.id)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const kind: Drag['kind'] = x < HANDLE ? 'trimL' : x > width - HANDLE ? 'trimR' : 'move'
    drag.current = { kind, trackId: track.id, clipId: clip.id, startX: e.clientX, startY: e.clientY, orig: { ...clip }, moved: false }
  }

  const openClip = (track: Track, clip: Clip): void => {
    if (clip.audioFile) return
    selectTrack(track.id)
    selectClip(clip.id)
    setActiveView('piano-roll')
  }

  const laneDoubleClick = async (e: React.MouseEvent, track: Track): Promise<void> => {
    const beat = snap(beatAt(e.clientX), false)
    if (AUDIO_TYPES.includes(track.type) && track.type === 'audio') {
      const problems = await pickAndImport({ trackId: track.id, startBeat: beat })
      if (problems.length) setMessage(problems.join(' '))
    } else if (NOTE_TYPES.includes(track.type)) {
      const bar = (project.timeSignature?.[0] ?? 4)
      const start = Math.floor(beat / bar) * bar
      addClip(track.id, { startTime: start, duration: bar, notes: [], name: 'MIDI clip' })
      const t = useProjectStore.getState().project.tracks.find((x) => x.id === track.id)
      const created = t?.clips[t.clips.length - 1]
      if (created) { selectClip(created.id); selectTrack(track.id) }
    }
  }

  // ── drag and drop of files from the desktop ────────────────────────────────

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDropping(false)
    const files = [...e.dataTransfer.files].filter((f) => /\.(wav|mp3|flac|ogg|opus|m4a|aif|aiff)$/i.test(f.name))
    const paths = files.map((f) => (f as File & { path?: string }).path).filter((p): p is string => !!p)
    if (!paths.length) { setMessage('Drop audio files (wav, mp3, flac, ogg, m4a, aiff).'); return }
    const lanes = lanesRef.current
    const beat = lanes ? snap(beatAt(e.clientX), false) : 0
    const track = lanes ? project.tracks[trackIndexAt(e.clientY)] : undefined
    const problems = await importAudioFiles(paths, { trackId: track?.id, startBeat: beat })
    setMessage(problems.length ? problems.join(' ') : null)
  }

  // ── view ───────────────────────────────────────────────────────────────────

  const onWheel = (e: React.WheelEvent): void => {
    if (!e.ctrlKey) return
    e.preventDefault()
    setZoom(Math.min(4, Math.max(0.25, +(zoom * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(3))))
  }

  const seekFromRuler = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    seek(Math.max(0, (e.clientX - rect.left) / beatWidth))
  }

  const rootStyle: React.CSSProperties = fill
    ? { flex: 1, minHeight: 240 }
    : { height: 240, flexShrink: 0 }

  const empty = project.tracks.length === 0
  const selectedAudioClip = (() => {
    for (const t of project.tracks) {
      const c = t.clips.find((x) => x.id === selectedClipId && x.audioFile)
      if (c) return { trackId: t.id, clip: c }
    }
    return null
  })()

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => void onDrop(e)}
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', position: 'relative', ...rootStyle }}
    >
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <button className="btn btn-ghost" style={tb} onClick={async () => setMessage((await pickAndImport({ trackId: selectedTrackId ?? undefined })).join(' ') || null)}>Import audio…</button>
        {(['audio', 'midi'] as const).map((t) => (
          <button key={t} className="btn btn-ghost" style={tb} onClick={() => addTrack(t)}>+ {t === 'audio' ? 'Audio' : 'MIDI'} track</button>
        ))}
        <button className="btn btn-ghost" style={tb} disabled={!selectedAudioClip}
          title={selectedAudioClip ? 'Measure the tempo of the selected audio and bring it in time with the project' : 'Select an audio clip first'}
          onClick={() => selectedAudioClip && void useBeatMatch.getState().propose(selectedAudioClip.trackId, selectedAudioClip.clip.id, selectedAudioClip.clip.audioFile!, selectedAudioClip.clip.name ?? 'Audio', false, true)}>
          Beat match…
        </button>
        <GridControls />
        <span style={{ flex: 1 }} />
        {loadingAudio && <span style={{ fontSize: 11, color: 'var(--accent-light)' }}>Reading audio files…</span>}
        {message && <span style={{ fontSize: 11, color: 'var(--yellow)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={message}>{message}</span>}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Zoom</span>
        <input type="range" min={0.25} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 70, accentColor: 'var(--accent)' }} />
      </div>

      {selectedAudioClip && <ClipInspector trackId={selectedAudioClip.trackId} clip={selectedAudioClip.clip} bpm={bpm} />}

      <div ref={scrollRef} onWheel={onWheel} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ width: HEADER_WIDTH + totalBeats * beatWidth, minHeight: '100%', position: 'relative' }}>
          {/* ruler */}
          <div style={{ display: 'flex', height: RULER_HEIGHT, position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }} />
            <div onMouseDown={seekFromRuler} style={{ flex: 1, position: 'relative', cursor: 'text' }}>
              {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: i * 4 * beatWidth, top: 0, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 4, borderLeft: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {empty && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8, position: 'sticky', left: 0, width: 'min(100%, 640px)' }}>
              Start here: drag audio files onto this area, or press <b>Import audio…</b>.<br />
              Add a <b>MIDI track</b> and double-click its lane to draw notes.<br />
              Songs from <b>Create music</b> are added to the project from the Library.
            </div>
          )}

          {/* tracks */}
          {project.tracks.map((track) => (
            <div key={track.id} style={{ display: 'flex', height: TRACK_HEIGHT }}>
              <div
                onClick={() => { selectTrack(track.id); selectClip(null) }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('text/ams-track')) { e.preventDefault(); e.stopPropagation() } }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/ams-track')
                  if (!id) return
                  e.preventDefault(); e.stopPropagation()
                  moveTrack(id, project.tracks.findIndex((t) => t.id === track.id))
                }}
                style={{
                  width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, boxSizing: 'border-box',
                  borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderLeft: `3px solid ${track.color}`,
                  display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, cursor: 'pointer',
                  background: selectedTrackId === track.id ? 'var(--bg-hover)' : 'var(--bg-secondary)'
                }}
              >
                <span
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/ams-track', track.id); e.dataTransfer.effectAllowed = 'move' }}
                  onClick={(e) => e.stopPropagation()}
                  title="Drag to change the order of the tracks" style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 12, userSelect: 'none' }}
                >⋮⋮</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming === track.id ? (
                    <input
                      autoFocus defaultValue={track.name} style={{ width: '100%', fontSize: 12 }}
                      onBlur={(e) => { updateTrack(track.id, { name: e.target.value.trim() || track.name }); setRenaming(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation() }}
                    />
                  ) : (
                    <div onDoubleClick={() => setRenaming(track.id)} title="Double-click to rename"
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {track.name}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{track.type}</div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }} style={{ ...tinyBtn, color: track.muted ? '#f59e0b' : 'var(--text-muted)' }} title="Mute">M</button>
                  <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }} style={{ ...tinyBtn, color: track.soloed ? 'var(--accent-light)' : 'var(--text-muted)' }} title="Solo">S</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                    style={{ ...tinyBtn, color: 'var(--text-muted)' }} title="Delete track (Ctrl+Z brings it back)"
                  >×</button>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01} value={track.volume} title="Volume"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  style={{ width: 44, accentColor: track.color }}
                />
              </div>

              <div
                data-lane={track.id}
                onDoubleClick={(e) => { if (e.target === e.currentTarget) void laneDoubleClick(e, track) }}
                onMouseDown={(e) => { if (e.target === e.currentTarget) { selectTrack(track.id); selectClip(null) } }}
                style={{ flex: 1, position: 'relative', zIndex: 1, borderBottom: '1px solid var(--border)', background: selectedTrackId === track.id ? 'rgba(124,58,237,0.05)' : 'transparent' }}
              >
                {track.clips.map((clip) => {
                  const width = Math.max(6, clip.duration * beatWidth)
                  const selected = selectedClipId === clip.id
                  const missing = !!clip.audioFile && failedFiles.has(clip.audioFile)
                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => startDrag(e, track, clip, width)}
                      onDoubleClick={(e) => { e.stopPropagation(); openClip(track, clip) }}
                      style={{
                        position: 'absolute', left: clip.startTime * beatWidth, top: 8, width, height: TRACK_HEIGHT - 16, boxSizing: 'border-box',
                        background: missing ? 'rgba(239,68,68,0.15)' : `${track.color}${selected ? '55' : '33'}`,
                        border: `1px solid ${selected ? '#fff' : track.color + '88'}`, borderRadius: 4, overflow: 'hidden', cursor: 'grab', userSelect: 'none'
                      }}
                    >
                      {clip.audioFile && !missing && <Waveform clip={clip} color={track.color} bpm={bpm} width={width} />}
                      {clip.notes && <MiniNotes clip={clip} color={track.color} />}
                      <span style={{ position: 'relative', fontSize: 11, color: missing ? 'var(--red)' : '#fff', fontWeight: 600, padding: '2px 8px', whiteSpace: 'nowrap', textShadow: '0 1px 2px #000a', pointerEvents: 'none' }}>
                        {missing ? `Missing: ${clip.name ?? clip.audioFile}` : `${clip.name ?? (clip.notes ? `${clip.notes.length} notes` : 'Clip')}${clip.warpBpm ? ` · synced from ${Math.round(clip.warpBpm)} BPM` : ''}`}
                      </span>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE, cursor: 'ew-resize' }} />
                      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE, cursor: 'ew-resize' }} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* the lane area (for coordinates) with beat lines and the playhead, on top of all tracks */}
          <div ref={lanesRef} style={{ position: 'absolute', left: HEADER_WIDTH, top: RULER_HEIGHT, width: totalBeats * beatWidth, height: project.tracks.length * TRACK_HEIGHT, pointerEvents: 'none', zIndex: 0 }}>
            {Array.from({ length: totalBeats + 1 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: i * beatWidth, top: 0, width: 1, height: '100%', background: i % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)' }} />
            ))}
          </div>
          <Playhead scrollRef={scrollRef} beatWidth={beatWidth} />
        </div>
      </div>

      {dropping && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(124,58,237,0.18)', border: '2px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, pointerEvents: 'none', zIndex: 20 }}>
          Drop audio files to add them
        </div>
      )}
    </div>
  )
}

// The playhead is its own component: it changes every frame while playing and must not redraw the clips.
function Playhead({ scrollRef, beatWidth }: { scrollRef: React.RefObject<HTMLDivElement>; beatWidth: number }): React.ReactElement {
  const beat = useAudioStore((s) => s.currentBeat)
  const playing = useAudioStore((s) => s.isPlaying)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = HEADER_WIDTH + beat * beatWidth
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft + HEADER_WIDTH) {
      el.scrollLeft = Math.max(0, x - HEADER_WIDTH - 80)         // follow the playhead
    }
  }, [beat, playing, beatWidth, scrollRef])
  return <div style={{ position: 'absolute', left: HEADER_WIDTH + beat * beatWidth, top: 0, width: 2, height: '100%', background: 'var(--accent)', zIndex: 7, pointerEvents: 'none' }} />
}

// Gain and fades of the selected audio clip
function ClipInspector({ trackId, clip, bpm }: { trackId: string; clip: Clip; bpm: number }): React.ReactElement {
  const updateClip = useProjectStore((s) => s.updateClip)
  const gain = clip.gain ?? 1
  const db = gain <= 0.001 ? '-inf' : (20 * Math.log10(gain)).toFixed(1)
  const sec = (beats: number | undefined): string => (((beats ?? 0) * 60) / bpm).toFixed(2)
  const setFade = (key: 'fadeIn' | 'fadeOut', seconds: string): void => {
    const v = Math.max(0, Math.min(clip.duration / 2, ((parseFloat(seconds.replace(',', '.')) || 0) * bpm) / 60))
    updateClip(trackId, clip.id, { [key]: v })
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, flexWrap: 'wrap' }}>
      <b style={{ color: 'var(--text-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name ?? 'Clip'}</b>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Gain
        <input type="range" min={0} max={2} step={0.01} value={gain} style={{ width: 90, accentColor: 'var(--accent)' }}
          onChange={(e) => updateClip(trackId, clip.id, { gain: Number(e.target.value) })} onDoubleClick={() => updateClip(trackId, clip.id, { gain: 1 })} />
        <span style={{ width: 52 }}>{db} dB</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Fade in
        <input key={`fi${clip.id}${clip.fadeIn ?? 0}`} defaultValue={sec(clip.fadeIn)} style={{ width: 46 }} onBlur={(e) => setFade('fadeIn', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /> s
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Fade out
        <input key={`fo${clip.id}${clip.fadeOut ?? 0}`} defaultValue={sec(clip.fadeOut)} style={{ width: 46 }} onBlur={(e) => setFade('fadeOut', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /> s
      </label>
    </div>
  )
}

// a tiny picture of the notes inside a MIDI clip
function MiniNotes({ clip, color }: { clip: Clip; color: string }): React.ReactElement | null {
  const notes = clip.notes ?? []
  if (!notes.length) return null
  const lo = Math.min(...notes.map((n) => n.pitch))
  const hi = Math.max(...notes.map((n) => n.pitch))
  const span = Math.max(12, hi - lo + 1)
  const h = TRACK_HEIGHT - 18
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {notes.map((n) => (
        <div key={n.id ?? nanoid()} style={{
          position: 'absolute', left: `${(n.startTime / clip.duration) * 100}%`, width: `${Math.max(0.5, (n.duration / clip.duration) * 100)}%`,
          top: ((hi - n.pitch) / span) * (h - 6) + 14, height: 3, background: color, borderRadius: 1
        }} />
      ))}
    </div>
  )
}

const tb: React.CSSProperties = { fontSize: 11, padding: '3px 10px' }

const tinyBtn: React.CSSProperties = {
  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3,
  cursor: 'pointer', color: 'var(--text-muted)', fontSize: 9, fontWeight: 700
}
