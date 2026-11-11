// The Studio (formerly "Timeline"): the arrangement of tracks and clips, with the functions of the Ableton
// Live arrangement view and the Cubase project window - loop range and locators, markers and cycle markers,
// tempo and signature track, several clips at once, consolidate, crossfades, automation lanes, return
// tracks with sends, group tracks, take lanes for comping, warp markers and a channel tab.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { useAudioStore } from '../../stores/audio.store'
import { bufferOf, failedFiles, loadBuffer, onBuffersChanged, peaksOf, PEAKS_PER_SECOND, projectEndBeat, secToBeats, seek } from '../../audio/engine'
import type { Clip, Track } from '../../types'
import { makeMaster, retune, runSyncAll, syncOne, useBeatMatch } from '../../beatmatch/store'
import { minLength, snapBeat } from '../../edit/grid'
import { runAction } from '../../shortcuts/handlers'
import { GridControls } from '../../edit/GridControls'
import { EXPORT_EVENT } from '../layout/FileMenu'
import { beatOfSrc, srcOfBeat, validMarkers } from '../../audio/warp'
import { hasTempoChanges } from '../../audio/timemap'
import { Ruler } from './Ruler'
import { Popover, type PopoverSpec } from './Popover'
import { AutomationHeader, AutomationLane, MiniMeter, ReturnRow, TakeHeader, TempoLane } from './StudioLanes'
import { ChannelTab } from './ChannelTab'
import {
  AUTO_HEIGHT, BEAT_WIDTH, buildRows, HANDLE, HEADER_WIDTH, RULER_HEIGHT, rowHeight, rowTops, TAKE_HEIGHT, TEMPO_HEIGHT, TRACK_HEIGHT, trackPointer, type Row
} from './studioLayout'
import {
  addCycleMarkerFromLoop, addMarkerAtPlayhead, addWarpMarker, beatsLeft, consolidate, crossfade, groupSelectedTracks, loopToSelection, spbSrcOf, splitIntoStems, togglePunch, toggleLoop
} from './studioOps'

const AUDIO_TYPES: Track['type'][] = ['audio', 'vocal', 'instrument']
const NOTE_TYPES: Track['type'][] = ['midi', 'instrument', 'vocal']

// ── importing audio ──────────────────────────────────────────────────────────

export async function importAudioFiles(
  paths: string[],
  at?: { trackId?: string; startBeat?: number; warpBpm?: number; noBeatMatch?: boolean }
): Promise<string[]> {
  const problems: string[] = []
  const startBeat = at?.startBeat ?? useAudioStore.getState().currentBeat
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
    // the new clip is selected, so its clip bar (gain, fades, SYNC, MASTER) is right there
    const t = useProjectStore.getState().project.tracks.find((x) => x.id === trackId)
    const created = t?.clips[t.clips.length - 1]
    if (created) useProjectStore.getState().selectClip(created.id)
    // new audio: offer to bring it in time with the project (not for one-shots or already synced samples)
    if (created && !warp && !at?.noBeatMatch && buf.duration >= 1) {
      void useBeatMatch.getState().propose(trackId!, created.id, path, name, !hadAudio)
    }
  }
  return problems
}

export async function pickAndImport(at?: { trackId?: string; startBeat?: number; warpBpm?: number }): Promise<string[]> {
  const paths = await window.api.dialog.openAudio()
  return paths.length ? importAudioFiles(paths, at) : []
}

// ── waveform (with sync grid and warp markers) ───────────────────────────────

const Waveform = React.memo(function Waveform({ clip, color, height, width, warpEdit, trackId }: {
  clip: Clip; color: string; height: number; width: number; warpEdit: boolean; trackId: string
}): React.ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const [version, bump] = useState(0)
  useEffect(() => onBuffersChanged(() => bump((n) => n + 1)), [])
  const project = useProjectStore((s) => s.project)
  const path = clip.audioFile
  const spb = spbSrcOf(clip, project)
  const startFileBeat = beatOfSrc(clip.warpMarkers, clip.offset ?? 0, spb)

  useLayoutEffect(() => {
    const canvas = ref.current
    const peaks = path ? peaksOf(path) : null
    if (!canvas || !peaks) return
    const w = Math.max(1, Math.min(8192, Math.floor(width)))
    const h = height
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, w, h)
    g.fillStyle = color
    const mid = h / 2
    const perPx = clip.duration / w
    for (let x = 0; x < w; x++) {
      const a = srcOfBeat(clip.warpMarkers, startFileBeat + x * perPx, spb) * PEAKS_PER_SECOND
      const b = srcOfBeat(clip.warpMarkers, startFileBeat + (x + 1) * perPx, spb) * PEAKS_PER_SECOND
      const from = Math.max(0, Math.floor(a))
      const to = Math.max(from + 1, Math.floor(b))
      let m = 0
      for (let i = from; i < to && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i]
      const half = Math.min(mid, Math.max(m > 0.002 ? 1 : 0, m * mid * 0.95))
      if (half > 0) g.fillRect(x, mid - half, 1, half * 2)
    }
    // the beat grid of a measured clip: one line per beat, a stronger one every fourth beat
    if (clip.warpBpm && clip.gridFirst !== undefined && !clip.warpMarkers?.length) {
      const secPerBeat = 60 / clip.warpBpm
      const off = clip.offset ?? 0
      const spanSec = clip.duration * secPerBeat
      const k0 = Math.max(0, Math.ceil((off - clip.gridFirst) / secPerBeat - 1e-6))
      for (let k = k0; ; k++) {
        const t = clip.gridFirst + k * secPerBeat - off
        if (t > spanSec + 1e-6) break
        const x = Math.round((t / spanSec) * w)
        g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'
        g.fillRect(x, 0, 1, k % 4 === 0 ? h : Math.round(h * 0.45))
      }
    }
  }, [path, clip.offset, clip.duration, clip.warpBpm, clip.gridFirst, clip.warpMarkers, width, height, color, version, spb, startFileBeat])

  if (!path || !peaksOf(path)) return null
  const markers = clip.warpMarkers ?? []
  const pxPerBeat = width / Math.max(1e-6, clip.duration)
  return (
    <>
      <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0.75, pointerEvents: 'none' }} />
      {(warpEdit || markers.length > 0) && markers.map((m, i) => {
        const x = (m.beat - startFileBeat) * pxPerBeat
        if (x < -2 || x > width + 2) return null
        return (
          <div key={i}
            onPointerDown={(e) => {
              if (!warpEdit || e.button !== 0) return
              e.stopPropagation()
              if (e.altKey) { useProjectStore.getState().updateClip(trackId, clip.id, { warpMarkers: markers.filter((_, k) => k !== i) }); return }
              const x0 = e.clientX
              trackPointer((ev) => {
                const dBeat = (ev.clientX - x0) / pxPerBeat
                const free = ev.altKey
                const target = snapBeat(clip.startTime + m.beat - startFileBeat + dBeat, free) - clip.startTime + startFileBeat
                const next = markers.map((mm, k) => (k === i ? { ...mm, beat: target } : mm))
                if (validMarkers(next)) useProjectStore.getState().updateClip(trackId, clip.id, { warpMarkers: next })
              })
            }}
            title={warpEdit ? 'Warp marker: drag to move this moment of the audio onto another beat, Alt+click to delete' : 'Warp marker'}
            style={{ position: 'absolute', left: x - 4, top: 0, width: 9, height: '100%', cursor: warpEdit ? 'ew-resize' : 'default', pointerEvents: warpEdit ? 'auto' : 'none', zIndex: 2 }}>
            <div style={{ position: 'absolute', left: 4, top: 0, width: 1, height: '100%', background: '#facc15' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, width: 9, height: 7, background: '#facc15', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          </div>
        )
      })}
    </>
  )
})

// ── the Studio ───────────────────────────────────────────────────────────────

interface ClipDrag { kind: 'move' | 'trimL' | 'trimR'; trackId: string; clipId: string; startX: number; startY: number; orig: Clip; moved: boolean; group?: Map<string, number> }

export function Timeline({ fill = false }: { fill?: boolean }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId)
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds)
  const { addTrack, updateTrack, removeTrack, selectTrack, selectClip, selectClips, toggleClipSelection, updateClip, moveClip, addClip, moveTrack, addReturn, promoteTake } = useProjectStore.getState()
  const zoom = useUIStore((s) => s.zoom)
  const setZoom = useUIStore((s) => s.setZoom)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const loadingAudio = useAudioStore((s) => s.loading)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const drag = useRef<ClipDrag | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [popover, setPopover] = useState<PopoverSpec | null>(null)
  const [warpClip, setWarpClip] = useState<string | null>(null)
  const [showTempo, setShowTempo] = useState(() => { try { return localStorage.getItem('ams-show-tempo') === '1' } catch { return false } })
  const [showChannel, setShowChannel] = useState(() => { try { return localStorage.getItem('ams-show-channel') === '1' } catch { return false } })
  const remember = (k: string, v: boolean): void => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* storage unavailable */ } }
  const notice = useBeatMatch((s) => s.notice)
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'track' | 'clip' | 'take'; trackId: string; clipId?: string; laneId?: string } | null>(null)
  useEffect(() => {
    if (!menu) return undefined
    const close = (): void => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', close) }
  }, [menu])
  const [, rerender] = useState(0)
  useEffect(() => onBuffersChanged(() => rerender((n) => n + 1)), [])

  const bpm = project.bpm || 120
  const beatWidth = BEAT_WIDTH * zoom
  const totalBeats = Math.max(128, Math.ceil(projectEndBeat(project)) + 32, Math.ceil(project.loop?.end ?? 0) + 16)
  const snap = (b: number, free: boolean): number => snapBeat(b, free)         // free = Alt held, or Snap is off
  const rows = useMemo(() => buildRows(project), [project])
  const tops = useMemo(() => rowTops(rows), [rows])
  const lanesTop = RULER_HEIGHT + (showTempo ? TEMPO_HEIGHT : 0)
  const selected = new Set(selectedClipIds)

  const beatAt = useCallback((clientX: number): number => {
    const rect = lanesRef.current!.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left) / beatWidth)
  }, [beatWidth])

  const rowAt = (clientY: number): Row | undefined => {
    const y = clientY - lanesRef.current!.getBoundingClientRect().top
    const i = tops.findIndex((top, k) => k < rows.length && y >= top && y < tops[k + 1])
    return i >= 0 ? rows[i] : undefined
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
      const p = useProjectStore.getState().project
      if (d.kind === 'move' && d.group) {
        // several clips: all move by the same snapped amount and stay on their tracks
        const delta = Math.max(-Math.min(...d.group.values()), snap(o.startTime + dBeats, free) - o.startTime)
        useProjectStore.setState((s) => ({
          project: { ...s.project, tracks: s.project.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (d.group!.has(c.id) ? { ...c, startTime: d.group!.get(c.id)! + delta } : c)) })) }
        }))
      } else if (d.kind === 'move') {
        const start = snap(o.startTime + dBeats, free)
        const from = p.tracks.find((t) => t.clips.some((c) => c.id === d.clipId))
        let toId = from?.id ?? d.trackId
        const hover = rowAt(e.clientY)
        const accepts = (t: Track): boolean => (o.audioFile ? AUDIO_TYPES.includes(t.type) : NOTE_TYPES.includes(t.type))
        if (hover?.kind === 'track' && accepts(hover.track)) toId = hover.track.id
        moveClip(from?.id ?? d.trackId, d.clipId, toId, Math.max(0, start))
        d.trackId = toId
      } else if (d.kind === 'trimR') {
        let dur = Math.max(minLength(), snap(o.startTime + o.duration + dBeats, free) - o.startTime)
        if (o.audioFile) dur = Math.min(dur, beatsLeft(o, p))
        updateClip(d.trackId, d.clipId, { duration: dur })
      } else {
        const end = o.startTime + o.duration
        let start = Math.min(end - minLength(), Math.max(0, snap(o.startTime + dBeats, free)))
        let offset = o.offset
        if (o.audioFile) {
          const spb = spbSrcOf(o, p)
          const fb0 = beatOfSrc(o.warpMarkers, o.offset ?? 0, spb)
          const fb0File = beatOfSrc(o.warpMarkers, 0, spb)
          let fb = fb0 + (start - o.startTime)
          if (fb < fb0File) { fb = fb0File; start = o.startTime - (fb0 - fb0File) }
          offset = Math.max(0, srcOfBeat(o.warpMarkers, fb, spb))
        }
        updateClip(d.trackId, d.clipId, { startTime: start, duration: end - start, offset })
      }
    }
    const onUp = (): void => { drag.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatWidth, bpm, rows, tops])

  const startDrag = (e: React.PointerEvent, track: Track, clip: Clip, width: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey || e.shiftKey) { toggleClipSelection(clip.id); selectTrack(track.id); return }
    const keepGroup = selected.has(clip.id) && selected.size > 1
    selectTrack(track.id)
    if (!keepGroup) selectClip(clip.id)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    // warp editing: a double-click on the waveform sets a marker (handled on the clip)
    const kind: ClipDrag['kind'] = x < HANDLE ? 'trimL' : x > width - HANDLE ? 'trimR' : 'move'
    const group = keepGroup && kind === 'move'
      ? new Map(project.tracks.flatMap((t) => t.clips.filter((c) => selected.has(c.id)).map((c) => [c.id, c.startTime] as [string, number])))
      : undefined
    drag.current = { kind, trackId: track.id, clipId: clip.id, startX: e.clientX, startY: e.clientY, orig: { ...clip }, moved: false, group }
  }

  const clipDoubleClick = (e: React.MouseEvent, track: Track, clip: Clip, width: number): void => {
    e.stopPropagation()
    if (clip.audioFile && warpClip === clip.id) {
      const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left
      const local = (x / width) * clip.duration
      const spb = spbSrcOf(clip, project)
      addWarpMarker(track.id, clip, srcOfBeat(clip.warpMarkers, beatOfSrc(clip.warpMarkers, clip.offset ?? 0, spb) + local, spb))
      return
    }
    if (clip.audioFile) return
    selectTrack(track.id)
    selectClip(clip.id)
    setActiveView('piano-roll')
  }

  const laneDoubleClick = async (e: React.MouseEvent, track: Track): Promise<void> => {
    const beat = snap(beatAt(e.clientX), false)
    if (track.type === 'audio') {
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

  // drag a frame on empty lanes: selects every clip it touches (Ctrl/Shift: adds to the selection)
  const startFrame = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const rect = lanesRef.current!.getBoundingClientRect()
    const x0 = e.clientX - rect.left
    const y0 = e.clientY - rect.top
    const add = e.ctrlKey || e.shiftKey
    const before = add ? [...useProjectStore.getState().selectedClipIds] : []
    let moved = false
    trackPointer((ev) => {
      const x1 = ev.clientX - rect.left
      const y1 = ev.clientY - rect.top
      if (!moved && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 4) return
      moved = true
      setFrame({ x0, y0, x1, y1 })
      const [bx0, bx1] = [Math.min(x0, x1) / beatWidth, Math.max(x0, x1) / beatWidth]
      const [ya, yb] = [Math.min(y0, y1), Math.max(y0, y1)]
      const ids: string[] = []
      rows.forEach((r, i) => {
        if (r.kind !== 'track' || tops[i + 1] < ya || tops[i] > yb) return
        for (const c of r.track.clips) if (c.startTime < bx1 && c.startTime + c.duration > bx0) ids.push(c.id)
      })
      selectClips([...new Set([...before, ...ids])])
    }, () => { setFrame(null); if (!moved && !add) selectClip(null) })
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
    const row = lanes ? rowAt(e.clientY) : undefined
    const problems = await importAudioFiles(paths, { trackId: row?.track.id, startBeat: beat })
    setMessage(problems.length ? problems.join(' ') : null)
  }

  // ── view ───────────────────────────────────────────────────────────────────

  const onWheel = (e: React.WheelEvent): void => {
    if (!e.ctrlKey) return
    e.preventDefault()
    setZoom(Math.min(4, Math.max(0.25, +(zoom * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(3))))
  }

  const rootStyle: React.CSSProperties = fill ? { flex: 1, minHeight: 240 } : { height: 240, flexShrink: 0 }
  const empty = project.tracks.length === 0
  const selectedAudioClip = (() => {
    const id = useProjectStore.getState().selectedClipId
    for (const t of project.tracks) {
      const c = t.clips.find((x) => x.id === id && x.audioFile)
      if (c) return { trackId: t.id, clip: c }
    }
    return null
  })()
  const run = async (label: string, fn: () => Promise<string | null> | string | null): Promise<void> => {
    setBusy(label); setMessage(null)
    try { const m = await fn(); if (m) setMessage(m) } catch (e) { setMessage((e as Error).message) }
    setBusy(null)
  }
  const loop = project.loop
  const returns = project.returns ?? []
  const lanesHeight = tops[rows.length] ?? 0
  const childCount = (g: Track): number => project.tracks.filter((t) => t.parentId === g.id).length

  // ── one row: header on the left, lane on the right ──
  const renderRow = (row: Row, i: number): React.ReactElement => {
    const h = rowHeight(row)
    const track = row.track
    const isSel = selectedTrackId === track.id && row.kind === 'track'
    let header: React.ReactNode
    let lane: React.ReactNode
    if (row.kind === 'auto') {
      header = <AutomationHeader track={track} />
      lane = <AutomationLane track={track} param={row.param} beatWidth={beatWidth} />
    } else if (row.kind === 'take') {
      header = <TakeHeader track={track} lane={row.lane} />
      lane = row.lane.clips.map((clip) => {
        const width = Math.max(6, clip.duration * beatWidth)
        return (
          <div key={clip.id}
            onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); promoteTake(track.id, row.lane.id, clip.id); setMessage(`${row.lane.name} now plays on ${track.name}.`) } }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, kind: 'take', trackId: track.id, clipId: clip.id, laneId: row.lane.id }) }}
            title="Click: use this take on the track (comping)"
            style={{ position: 'absolute', left: clip.startTime * beatWidth, top: 4, width, height: TAKE_HEIGHT - 8, background: `${track.color}22`, border: `1px dashed ${track.color}aa`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer' }}>
            {clip.audioFile && <Waveform clip={clip} color={track.color} height={TAKE_HEIGHT - 10} width={width} warpEdit={false} trackId={track.id} />}
            <span style={{ position: 'relative', fontSize: 10, color: '#fff', padding: '1px 6px', pointerEvents: 'none' }}>{clip.name}</span>
          </div>
        )
      })
    } else {
      const isGroup = track.type === 'group'
      header = (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {isGroup ? (
              <span onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { collapsed: !track.collapsed }) }} title={track.collapsed ? 'Show the tracks of this group' : 'Hide the tracks of this group'}
                style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, width: 10 }}>{track.collapsed ? '▶' : '▼'}</span>
            ) : (
              <span draggable onDragStart={(e) => { e.dataTransfer.setData('text/ams-track', track.id); e.dataTransfer.effectAllowed = 'move' }} onClick={(e) => e.stopPropagation()}
                title="Drag to change the order of the tracks" style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 11, userSelect: 'none' }}>⋮⋮</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming === track.id ? (
                <input autoFocus defaultValue={track.name} style={{ width: '100%', fontSize: 12 }}
                  onBlur={(e) => { updateTrack(track.id, { name: e.target.value.trim() || track.name }); setRenaming(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation() }} />
              ) : (
                <div onDoubleClick={() => setRenaming(track.id)} title="Double-click to rename"
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{track.name}</div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isGroup ? `group · ${childCount(track)} tracks` : track.type}{track.takes?.length ? ` · ${track.takes.length} takes` : ''}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }} style={{ ...tinyBtn, color: track.muted ? '#f59e0b' : 'var(--text-muted)' }} title="Mute">M</button>
            <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }} style={{ ...tinyBtn, color: track.soloed ? 'var(--accent-light)' : 'var(--text-muted)' }} title="Solo">S</button>
            <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { showAutomation: track.showAutomation ? null : 'volume' }) }}
              style={{ ...tinyBtn, color: track.showAutomation ? 'var(--accent-light)' : Object.values(track.automation ?? {}).some((l) => l?.length) ? '#eab308' : 'var(--text-muted)' }}
              title="Show / hide the automation lane (volume, pan, sends)">A</button>
            {(track.takes?.length ?? 0) > 0 && (
              <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { showTakes: !track.showTakes }) }} style={{ ...tinyBtn, color: track.showTakes ? 'var(--accent-light)' : 'var(--text-muted)' }} title="Show / hide the take lanes">T</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }} style={{ ...tinyBtn, color: 'var(--text-muted)' }} title="Delete track (Ctrl+Z brings it back)">×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <input type="range" min={0} max={1} step={0.01} value={track.volume} title="Volume" onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })} style={{ width: 62, accentColor: track.color }} />
            {returns.map((r, k) => (
              <label key={r.id} title={`Send to ${r.name}`} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 9, color: 'var(--text-muted)' }}>
                {String.fromCharCode(65 + k)}
                <input type="range" min={0} max={1} step={0.01} value={track.sends?.[r.id] ?? 0} style={{ width: 30, accentColor: '#0ea5e9' }}
                  onChange={(e) => useProjectStore.getState().setSend(track.id, r.id, Number(e.target.value))} />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 3 }}><MiniMeter id={track.id} /></div>
        </>
      )
      lane = isGroup
        ? project.tracks.filter((t) => t.parentId === track.id).flatMap((t) => t.clips.map((c) => (
          <div key={c.id} style={{ position: 'absolute', left: c.startTime * beatWidth, width: Math.max(2, c.duration * beatWidth), top: 10 + (project.tracks.indexOf(t) % 6) * 8, height: 6, background: t.color, opacity: 0.6, borderRadius: 2, pointerEvents: 'none' }} />
        )))
        : renderClips(track)
    }
    return (
      <div key={`${row.kind}-${track.id}-${row.kind === 'take' ? row.lane.id : ''}`} style={{ display: 'flex', height: h }}>
        <div
          onContextMenu={row.kind === 'track' ? (e) => { e.preventDefault(); selectTrack(track.id); selectClip(null); setMenu({ x: e.clientX, y: e.clientY, kind: 'track', trackId: track.id }) } : undefined}
          onClick={row.kind === 'track' ? () => { selectTrack(track.id); selectClip(null) } : undefined}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/ams-track')) { e.preventDefault(); e.stopPropagation() } }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/ams-track')
            if (!id || row.kind !== 'track') return
            e.preventDefault(); e.stopPropagation()
            moveTrack(id, project.tracks.findIndex((t) => t.id === track.id))
            // dropped onto a group (or a track inside one): it joins that group
            const target = track.type === 'group' ? track.id : track.parentId
            if (id !== track.id) updateTrack(id, { parentId: target })
          }}
          style={{
            width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, boxSizing: 'border-box',
            borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderLeft: `3px solid ${track.color}`,
            padding: row.kind === 'track' ? `6px 8px 4px ${8 + (row.depth ?? 0) * 12}px` : 0, cursor: row.kind === 'track' ? 'pointer' : 'default',
            background: isSel ? 'var(--bg-hover)' : row.kind === 'track' ? (track.type === 'group' ? 'var(--bg-panel)' : 'var(--bg-secondary)') : 'var(--bg-primary)'
          }}>
          {header}
        </div>
        <div
          data-lane={track.id}
          onDoubleClick={row.kind === 'track' ? (e) => { if (e.target === e.currentTarget) void laneDoubleClick(e, track) } : undefined}
          onPointerDown={row.kind === 'track' ? (e) => { if (e.target === e.currentTarget) { selectTrack(track.id); startFrame(e) } } : undefined}
          style={{ flex: 1, position: 'relative', zIndex: 1, borderBottom: '1px solid var(--border)', background: isSel ? 'rgba(124,58,237,0.05)' : 'transparent' }}>
          {lane}
        </div>
      </div>
    )
    void i
  }

  const renderClips = (track: Track): React.ReactNode => {
    const audio = track.clips.filter((c) => c.audioFile)
    return (
      <>
        {track.clips.map((clip) => {
          const width = Math.max(6, clip.duration * beatWidth)
          const sel = selected.has(clip.id)
          const missing = !!clip.audioFile && failedFiles.has(clip.audioFile)
          const warpEdit = warpClip === clip.id
          return (
            <div key={clip.id}
              onPointerDown={(e) => startDrag(e, track, clip, width)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); selectTrack(track.id); if (!selected.has(clip.id)) selectClip(clip.id); setMenu({ x: e.clientX, y: e.clientY, kind: 'clip', trackId: track.id, clipId: clip.id }) }}
              onDoubleClick={(e) => clipDoubleClick(e, track, clip, width)}
              style={{
                position: 'absolute', left: clip.startTime * beatWidth, top: 6, width, height: TRACK_HEIGHT - 12, boxSizing: 'border-box',
                background: missing ? 'rgba(239,68,68,0.15)' : `${track.color}${sel ? '55' : '33'}`,
                border: `1px solid ${warpEdit ? '#facc15' : sel ? '#fff' : track.color + '88'}`, borderRadius: 4, overflow: 'hidden', cursor: 'grab', userSelect: 'none'
              }}>
              {clip.audioFile && !missing && <Waveform clip={clip} color={track.color} height={TRACK_HEIGHT - 14} width={width} warpEdit={warpEdit} trackId={track.id} />}
              {clip.notes && <MiniNotes clip={clip} color={track.color} />}
              <span style={{ position: 'relative', fontSize: 11, color: missing ? 'var(--red)' : '#fff', fontWeight: 600, padding: '2px 8px', whiteSpace: 'nowrap', textShadow: '0 1px 2px #000a', pointerEvents: 'none' }}>
                {missing ? `Missing: ${clip.name ?? clip.audioFile}` : `${clip.name ?? (clip.notes ? `${clip.notes.length} notes` : 'Clip')}${clip.warpBpm ? ` · synced from ${Math.round(clip.warpBpm)} BPM` : ''}${clip.warpMarkers?.length ? ` · ${clip.warpMarkers.length} warp markers` : ''}`}
              </span>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE, cursor: 'ew-resize' }} />
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE, cursor: 'ew-resize' }} />
            </div>
          )
        })}
        {/* crossfades: where two audio clips overlap */}
        {audio.flatMap((a) => audio.filter((b) => b.startTime > a.startTime && b.startTime < a.startTime + a.duration).map((b) => {
          const from = b.startTime
          const to = Math.min(a.startTime + a.duration, b.startTime + b.duration)
          return (
            <svg key={`x${a.id}${b.id}`} style={{ position: 'absolute', left: from * beatWidth, top: 6, width: Math.max(2, (to - from) * beatWidth), height: TRACK_HEIGHT - 12, pointerEvents: 'none', zIndex: 3 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <title>Crossfade</title>
              <path d="M0,100 L100,0 M0,0 L100,100" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={0.8} />
            </svg>
          )
        }))}
      </>
    )
  }

  const toolbarBtn = (label: string, title: string, onClick: () => void, active = false, disabled = false): React.ReactElement => (
    <button className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`} style={tb} title={title} disabled={disabled} onClick={onClick}>{label}</button>
  )

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => void onDrop(e)}
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', position: 'relative', ...rootStyle }}
    >
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <button className="btn btn-ghost" style={tb} onClick={async () => setMessage((await pickAndImport({ trackId: selectedTrackId ?? undefined })).join(' ') || null)}>Import audio…</button>
        {(['audio', 'midi'] as const).map((t) => (
          <button key={t} className="btn btn-ghost" style={tb} onClick={() => addTrack(t)}>+ {t === 'audio' ? 'Audio' : 'MIDI'} track</button>
        ))}
        <select value="" style={{ ...tb, padding: '2px 4px' }} title="Return tracks: one reverb or delay that many tracks share through their send knobs"
          onChange={(e) => { if (e.target.value) addReturn(e.target.value as 'reverb' | 'delay'); e.target.value = ''; e.target.blur() }}>
          <option value="">+ Return…</option><option value="reverb">Reverb</option><option value="delay">Delay</option>
        </select>
        <button className="btn btn-ghost" style={tb} disabled={syncing || !project.tracks.some((t) => t.clips.some((c) => c.audioFile))}
          title="Measure all audio clips and bring every one in time with the master BPM"
          onClick={async () => { setSyncing(true); setMessage(null); await runSyncAll(); setSyncing(false) }}>
          {syncing ? 'Syncing…' : `Sync all to ${project.bpm} BPM`}
        </button>
        <button className="btn btn-ghost" style={tb} disabled={!selectedAudioClip}
          title={selectedAudioClip ? 'Measure the tempo of the selected audio and bring it in time with the project' : 'Select an audio clip first'}
          onClick={() => selectedAudioClip && void useBeatMatch.getState().propose(selectedAudioClip.trackId, selectedAudioClip.clip.id, selectedAudioClip.clip.audioFile!, selectedAudioClip.clip.name ?? 'Audio', false, true)}>
          Beat match…
        </button>
        <GridControls />
        <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {toolbarBtn('Loop', 'Loop on / off (Ableton: loop switch, Cubase: cycle, Num /). Drag in the strip under the markers to set the range.', toggleLoop, !!loop?.enabled)}
        {toolbarBtn('Punch in', 'Punch in (Cubase I): recording starts at the start of the loop range', () => togglePunch('punchIn'), !!project.punchIn)}
        {toolbarBtn('Punch out', 'Punch out (Cubase O): recording stops at the end of the loop range', () => togglePunch('punchOut'), !!project.punchOut)}
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }} title="Count-in: bars of clicks before recording starts">Count-in
          <select value={String(project.countIn ?? 0)} style={{ fontSize: 11 }} onChange={(e) => { useProjectStore.getState().updateProject({ countIn: Number(e.target.value) }); e.target.blur() }}>
            <option value="0">off</option><option value="1">1 bar</option><option value="2">2 bars</option><option value="4">4 bars</option>
          </select>
        </label>
        {toolbarBtn('+ Marker', 'Add a marker at the playhead (Cubase: Insert). Right-click the ruler for time signatures.', addMarkerAtPlayhead)}
        {toolbarBtn('Tempo', 'Show / hide the tempo track (tempo changes during the song)', () => { setShowTempo(!showTempo); remember('ams-show-tempo', !showTempo) }, showTempo || hasTempoChanges(project))}
        {toolbarBtn('Channel', 'Show / hide the channel tab of the selected track (Cubase 15)', () => { setShowChannel(!showChannel); remember('ams-show-channel', !showChannel) }, showChannel)}
        {toolbarBtn('Export', 'Quick export: the whole song as WAV or MP3', () => window.dispatchEvent(new CustomEvent(EXPORT_EVENT)))}
        <span style={{ flex: 1 }} />
        {busy && <span style={{ fontSize: 11, color: 'var(--accent-light)' }}>{busy}…</span>}
        {loadingAudio && <span style={{ fontSize: 11, color: 'var(--accent-light)' }}>Reading audio files…</span>}
        {(message ?? notice) && <span style={{ fontSize: 11, color: 'var(--yellow)', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={message ?? notice ?? ''}>{message ?? notice}</span>}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Zoom</span>
        <input type="range" min={0.25} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 70, accentColor: 'var(--accent)' }} />
      </div>

      {selectedAudioClip && <ClipInspector trackId={selectedAudioClip.trackId} clip={selectedAudioClip.clip} bpm={bpm} warpEdit={warpClip === selectedAudioClip.clip.id}
        onWarpEdit={(on) => setWarpClip(on ? selectedAudioClip.clip.id : null)} />}
      {selectedClipIds.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', fontSize: 11, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>{selectedClipIds.length} clips selected</b>
          <span>Drag one to move all · Delete removes them</span>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => void run('Consolidating', consolidate)} title="Join into one clip (Ableton Ctrl+J)">Consolidate</button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => loopToSelection()} title="Loop around the selection (Ableton Ctrl+L, Cubase P)">Loop selection</button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => groupSelectedTracks()} title="Put their tracks into a group track (Ctrl+G)">Group tracks</button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => selectClip(null)}>Clear selection</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={scrollRef} onWheel={onWheel} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div style={{ width: HEADER_WIDTH + totalBeats * beatWidth, minHeight: '100%', position: 'relative' }}>
            {/* ruler */}
            <div style={{ display: 'flex', height: RULER_HEIGHT, position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', padding: '3px 8px', boxSizing: 'border-box', lineHeight: 1.6 }}>
                <div>Markers <span style={{ opacity: 0.7 }}>(double-click to add)</span></div>
                <div>Loop {loop ? `${(loop.start / 4 + 1).toFixed(2)}–${(loop.end / 4 + 1).toFixed(2)}` : '(drag to set)'}{loop && <span title="Save the loop range as a cycle marker" onClick={() => addCycleMarkerFromLoop()} style={{ marginLeft: 6, cursor: 'pointer', color: 'var(--accent-light)' }}>+ cycle</span>}</div>
              </div>
              <Ruler beatWidth={beatWidth} totalBeats={totalBeats} popover={setPopover} />
            </div>
            {showTempo && (
              <div style={{ display: 'flex', height: TEMPO_HEIGHT, position: 'sticky', top: RULER_HEIGHT, zIndex: 5, background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: HEADER_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', borderLeft: '3px solid #10b981', fontSize: 11, color: 'var(--text-secondary)', padding: '4px 8px', boxSizing: 'border-box' }}>
                  <b>Tempo track</b><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>double-click: tempo change</div>
                </div>
                <div style={{ flex: 1, position: 'relative' }}><TempoLane beatWidth={beatWidth} popover={setPopover} /></div>
              </div>
            )}

            {empty && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8, position: 'sticky', left: 0, width: 'min(100%, 640px)' }}>
                Start here: drag audio files onto this area, or press <b>Import audio…</b>.<br />
                Add a <b>MIDI track</b> and double-click its lane to draw notes.<br />
                Songs from <b>Create music</b> are added to the project from the Library.
              </div>
            )}

            {rows.map(renderRow)}
            {returns.map((r) => <ReturnRow key={r.id} r={r} />)}

            {/* the lane area (for coordinates) with bar lines, the loop range, the frame and the playhead */}
            <div ref={lanesRef} style={{ position: 'absolute', left: HEADER_WIDTH, top: lanesTop, width: totalBeats * beatWidth, height: lanesHeight, pointerEvents: 'none', zIndex: 0 }}>
              {Array.from({ length: totalBeats + 1 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: i * beatWidth, top: 0, width: 1, height: '100%', background: i % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)' }} />
              ))}
              {loop && <div style={{ position: 'absolute', left: loop.start * beatWidth, width: (loop.end - loop.start) * beatWidth, top: 0, height: '100%', background: loop.enabled ? 'rgba(124,58,237,0.08)' : 'rgba(148,163,184,0.05)', borderLeft: '1px solid rgba(124,58,237,0.5)', borderRight: '1px solid rgba(124,58,237,0.5)' }} />}
              {(project.markers ?? []).map((m) => <div key={m.id} style={{ position: 'absolute', left: m.beat * beatWidth, top: 0, width: 1, height: '100%', background: 'rgba(234,179,8,0.35)' }} />)}
            </div>
            {frame && (
              <div style={{ position: 'absolute', left: HEADER_WIDTH + Math.min(frame.x0, frame.x1), top: lanesTop + Math.min(frame.y0, frame.y1), width: Math.abs(frame.x1 - frame.x0), height: Math.abs(frame.y1 - frame.y0), border: '1px solid var(--accent-light)', background: 'rgba(124,58,237,0.12)', zIndex: 8, pointerEvents: 'none' }} />
            )}
            <Playhead scrollRef={scrollRef} beatWidth={beatWidth} />
          </div>
        </div>
        {showChannel && <ChannelTab onClose={() => { setShowChannel(false); remember('ams-show-channel', false) }} />}
      </div>

      {menu && (
        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9900, minWidth: 210, background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: 4, boxShadow: '0 8px 24px #000a' }}>
          {(menu.kind === 'track'
            ? [
              { label: 'Rename track', run: () => setRenaming(menu.trackId) },
              { label: 'Duplicate track', run: () => { selectTrack(menu.trackId); runAction('edit.duplicate') } },
              { label: 'Show automation', run: () => updateTrack(menu.trackId, { showAutomation: 'volume' }) },
              ...(project.tracks.find((t) => t.id === menu.trackId)?.type === 'group'
                ? [{ label: 'Ungroup (keep the tracks)', run: () => useProjectStore.getState().ungroup(menu.trackId) }]
                : [{ label: 'Put into a new group (Ctrl+G)', run: () => useProjectStore.getState().groupTracks([menu.trackId]) },
                  ...(project.tracks.find((t) => t.id === menu.trackId)?.parentId ? [{ label: 'Take out of the group', run: () => updateTrack(menu.trackId, { parentId: undefined }) }] : [])]),
              { label: 'Delete track', run: () => removeTrack(menu.trackId), danger: true }
            ]
            : menu.kind === 'take'
              ? [
                { label: 'Use this take', run: () => promoteTake(menu.trackId, menu.laneId!, menu.clipId!) },
                { label: 'Delete this take lane', run: () => { const t = project.tracks.find((x) => x.id === menu.trackId); updateTrack(menu.trackId, { takes: (t?.takes ?? []).filter((l) => l.id !== menu.laneId) }) }, danger: true }
              ]
              : [
                { label: 'SYNC to the master BPM', run: () => { void syncOne(menu.trackId, menu.clipId!).then((m) => useBeatMatch.getState().setNotice(m)) } },
                { label: 'Make this the MASTER tempo', run: () => { void makeMaster(menu.trackId, menu.clipId!).then((m) => useBeatMatch.getState().setNotice(m)) } },
                { label: 'Split at the playhead', run: () => runAction('clip.split') },
                { label: 'Duplicate clip', run: () => runAction('edit.duplicate') },
                { label: 'Quantize', run: () => runAction('edit.quantize') },
                { label: 'Consolidate selection (Ctrl+J)', run: () => void run('Consolidating', consolidate) },
                { label: 'Crossfade with the clip before (X)', run: () => setMessage(crossfade()) },
                { label: 'Loop this clip (Ctrl+L)', run: () => loopToSelection() },
                { label: 'Edit warp markers', run: () => { setWarpClip(menu.clipId!); setMessage('Warp: double-click the waveform to set a marker, drag a marker onto another beat, Alt+click deletes it.') } },
                { label: 'Split into stems (Demucs)', run: () => void run('Separating stems (this can take a few minutes)', () => splitIntoStems(menu.trackId, menu.clipId!)) },
                { label: 'Delete clip', run: () => { const ids = selected.size > 1 && selected.has(menu.clipId!) ? [...selected] : [menu.clipId!]; useProjectStore.getState().removeClips(ids) }, danger: true }
              ]
          ).map((it) => (
            <div key={it.label}
              onClick={() => { it.run(); setMenu(null) }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: (it as { danger?: boolean }).danger ? 'var(--red)' : 'var(--text-primary)' }}>
              {it.label}
            </div>
          ))}
        </div>
      )}

      {popover && <Popover spec={popover} onClose={() => setPopover(null)} />}

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

// Gain, tempo, fades and warp of the selected audio clip
function ClipInspector({ trackId, clip, bpm, warpEdit, onWarpEdit }: { trackId: string; clip: Clip; bpm: number; warpEdit: boolean; onWarpEdit: (on: boolean) => void }): React.ReactElement {
  const updateClip = useProjectStore((s) => s.updateClip)
  const [busy, setBusy] = useState(false)
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {clip.warpBpm ? (
          <>
            <span title="Tempo of this audio: correct it by hand if the measurement is slightly off">Tempo</span>
            <input key={`bp${clip.id}${clip.warpBpm}`} defaultValue={String(clip.warpBpm)} style={{ width: 56 }}
              onBlur={(e) => { const v = parseFloat(e.target.value.replace(',', '.')); if (v && v !== clip.warpBpm) retune(trackId, clip.id, v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title="Half speed" onClick={() => retune(trackId, clip.id, clip.warpBpm! / 2)}>÷2</button>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title="Double speed" onClick={() => retune(trackId, clip.id, clip.warpBpm! * 2)}>×2</button>
          </>
        ) : <span style={{ color: 'var(--text-muted)' }}>not synced</span>}
        <button className="btn btn-primary" style={{ fontSize: 10, padding: '1px 8px' }} disabled={busy} title="Stretch this audio to the master BPM and put its beats on the project beats"
          onClick={async () => { setBusy(true); useBeatMatch.getState().setNotice(await syncOne(trackId, clip.id)); setBusy(false) }}>SYNC</button>
        <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 8px' }} disabled={busy} title="Make the project tempo the tempo of this audio"
          onClick={async () => { setBusy(true); useBeatMatch.getState().setNotice(await makeMaster(trackId, clip.id)); setBusy(false) }}>MASTER</button>
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Fade in
        <input key={`fi${clip.id}${clip.fadeIn ?? 0}`} defaultValue={sec(clip.fadeIn)} style={{ width: 46 }} onBlur={(e) => setFade('fadeIn', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /> s
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Fade out
        <input key={`fo${clip.id}${clip.fadeOut ?? 0}`} defaultValue={sec(clip.fadeOut)} style={{ width: 46 }} onBlur={(e) => setFade('fadeOut', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /> s
      </label>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button className={`btn ${warpEdit ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 10, padding: '1px 8px' }}
          title="Warp markers: double-click the waveform to pin a moment of the audio, then drag it onto another beat. Alt+click deletes a marker."
          onClick={() => onWarpEdit(!warpEdit)}>WARP</button>
        {(clip.warpMarkers?.length ?? 0) > 0 && (
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title="Remove all warp markers" onClick={() => updateClip(trackId, clip.id, { warpMarkers: [] })}>
            Clear {clip.warpMarkers!.length}
          </button>
        )}
      </span>
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
  const h = TRACK_HEIGHT - 14
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

const tb: React.CSSProperties = { fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }

const tinyBtn: React.CSSProperties = {
  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3,
  cursor: 'pointer', color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, padding: 0
}

void AUTO_HEIGHT
void bufferOf
void seek
