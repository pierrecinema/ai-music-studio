// The detail area under the Studio (0.99.4): the selected track (instrument, input, output, colour), its selected
// clip (the notes or the waveform, larger) and its effects. It can be folded away; the choice is remembered.
import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { bufferOf, onBuffersChanged } from '../../audio/engine'
import { minMax } from '../../audio/wave'
import { srcAt } from './studioOps'
import { FxAddSelect, InstrumentSelect, openPlugin } from './StudioLanes'
import { TrackInput } from './TrackInput'
import { canRecordAudio } from '../../audio/recInput'
import { INSERT_LABEL } from '../../audio/fx'
import { tr } from '../../i18n/tr'
import type { Clip, Track } from '../../types'

export const DOCK_HEIGHT = 196

const head: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden'
}
const kv: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 12px', borderBottom: '1px solid var(--border-subtle, var(--border))', fontSize: 11.5 }

export function useDockOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('ams-studio-dock') !== '0' } catch { return true } })
  const toggle = (): void => { setOpen(!open); try { localStorage.setItem('ams-studio-dock', open ? '0' : '1') } catch { /* storage unavailable */ } }
  return [open, toggle]
}

export function StudioDock({ palette, clipTools, open, toggle }: { palette: string[]; clipTools?: React.ReactNode; open: boolean; toggle: () => void }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const trackId = useProjectStore((s) => s.selectedTrackId)
  const clipId = useProjectStore((s) => s.selectedClipId)
  const track = project.tracks.find((t) => t.id === trackId && t.type !== 'group')
  const clip = track ? track.clips.find((c) => c.id === clipId) ?? null : null

  if (!open) {
    return (
      <div onClick={toggle} title={tr('Show the details of the selected track')}
        style={{ ...head, cursor: 'pointer', borderTop: '1px solid var(--border-mid)', background: 'var(--bg-secondary)' }}>
        ▴ {tr('Details')}{track ? ` · ${track.name}` : ''}
      </div>
    )
  }
  return (
    <div style={{ height: DOCK_HEIGHT, flexShrink: 0, display: 'grid', gridTemplateColumns: 'minmax(170px, 250px) minmax(0, 1fr) minmax(170px, 300px)', borderTop: '1px solid var(--border-mid)', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      {/* the track */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={head}>
          <span onClick={toggle} title={tr('Hide the details')} style={{ cursor: 'pointer' }}>▾</span>
          {tr('Track')}{track ? <b style={{ color: 'var(--text-primary)', letterSpacing: 0, textTransform: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {track.name}</b> : null}
        </div>
        {track ? <TrackPart track={track} palette={palette} groupName={project.tracks.find((t) => t.id === track.parentId)?.name} /> : (
          <div style={{ padding: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>{tr('Click a track to see its details here.')}</div>
        )}
      </div>
      {/* the clip */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={head}>
          {tr('Clip')}{clip ? <b style={{ color: 'var(--text-primary)', letterSpacing: 0, textTransform: 'none' }}>· {clip.name ?? tr('Clip')}</b> : null}
          <span style={{ flex: 1 }} />
          {clip?.notes && (
            <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '1px 8px', letterSpacing: 0, textTransform: 'none' }} onClick={() => useUIStore.getState().setActiveView('piano-roll')}
              title={tr('Edit the notes in the Piano Roll (or double-click the clip)')}>{tr('Open in the Piano Roll')} ↗</button>
          )}
        </div>
        {clip && track ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {clip.audioFile && clipTools}
            <ClipPicture clip={clip} track={track} />
          </div>
        ) : (
          <div style={{ padding: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>{tr('Click a clip to see its notes or its waveform here.')}</div>
        )}
      </div>
      {/* the effects */}
      <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={head}>{tr('Effects (inserts)')}</div>
        {track ? <FxPart track={track} /> : null}
      </div>
    </div>
  )
}

function TrackPart({ track, palette, groupName }: { track: Track; palette: string[]; groupName?: string }): React.ReactElement {
  const updateTrack = useProjectStore((s) => s.updateTrack)
  return (
    <div style={{ overflow: 'auto' }}>
      {track.type === 'midi' && (
        <div style={kv}><span style={{ color: 'var(--text-muted)' }}>{tr('Instrument')}</span><InstrumentSelect track={track} style={{ fontSize: 11, maxWidth: 150 }} /></div>
      )}
      {canRecordAudio(track) && (
        <div style={kv}><span style={{ color: 'var(--text-muted)' }}>{tr('Input')}</span><TrackInput track={track} /></div>
      )}
      <div style={kv}><span style={{ color: 'var(--text-muted)' }}>{tr('Output')}</span><span>{groupName ? `${tr('Group')}: ${groupName}` : 'Master'}</span></div>
      <div style={{ ...kv, borderBottom: 'none', alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--text-muted)' }}>{tr('Colour')}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end', maxWidth: 150 }}>
          {palette.map((c) => (
            <span key={c} title={c} onClick={() => updateTrack(track.id, { color: c })}
              style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: 'pointer', outline: track.color === c ? '2px solid #fff' : 'none' }} />
          ))}
        </span>
      </div>
    </div>
  )
}

function FxPart({ track }: { track: Track }): React.ReactElement {
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const list = track.fx ?? []
  const set = (next: NonNullable<Track['fx']>): void => updateTrack(track.id, { fx: next })
  return (
    <div style={{ overflow: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {list.map((f, i) => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border-mid)', background: 'var(--bg-tertiary)', fontSize: 11.5, opacity: f.on ? 1 : 0.6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 12 }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: f.type === 'vst' ? 'pointer' : 'default' }}
            title={f.type === 'vst' ? tr('Open the plugin window') : undefined}
            onClick={() => { if (f.type === 'vst') void openPlugin(f, track.name) }}>
            {f.type === 'vst' ? `${f.vst?.name ?? tr('VST plugin')} (VST)` : tr(INSERT_LABEL[f.type])}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '0 6px', color: f.on ? 'var(--green, #22c55e)' : 'var(--text-muted)' }}
            title={f.on ? tr('On: click to bypass') : tr('Bypassed: click to switch on')}
            onClick={() => set(list.map((x) => (x.id === f.id ? { ...x, on: !x.on } : x)))}>{f.on ? `● ${tr('on')}` : `○ ${tr('off')}`}</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '0 5px', color: 'var(--red)' }} title={tr('Remove this effect')}
            onClick={() => set(list.filter((x) => x.id !== f.id))}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <FxAddSelect track={track} style={{ flex: 1, fontSize: 11 }} />
        {list.length > 0 && (
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '1px 8px' }} title={tr('Show the settings of the effects in a lane under the track')}
            onClick={() => updateTrack(track.id, { showFx: !track.showFx })}>{track.showFx ? tr('Hide settings') : tr('Settings')}</button>
        )}
      </div>
    </div>
  )
}

// the notes of a MIDI clip on a small piano-roll grid, or the waveform of an audio clip, over the whole width
function ClipPicture({ clip, track }: { clip: Clip; track: Track }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const project = useProjectStore((s) => s.project)
  const [version, bump] = useState(0)
  useEffect(() => onBuffersChanged(() => bump((n) => n + 1)), [])
  const [size, setSize] = useState({ w: 600, h: 120 })
  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return undefined
    const ro = new ResizeObserver(() => setSize({ w: Math.max(50, el.clientWidth), h: Math.max(40, el.clientHeight) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = size.w, H = size.h
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr)
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#0f1318'; g.fillRect(0, 0, W, H)
    const beats = Math.max(1e-6, clip.duration)
    // beat lines, stronger every bar
    for (let b = 0; b <= beats; b++) { g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.round((b / beats) * W), 0, 1, H) }
    if (clip.notes?.length) {
      const lo = Math.min(...clip.notes.map((n) => n.pitch)) - 2, hi = Math.max(...clip.notes.map((n) => n.pitch)) + 2
      const rows = Math.max(12, hi - lo + 1), rh = H / rows
      for (let r = 0; r < rows; r++) { if ([1, 3, 6, 8, 10].includes((hi - r) % 12)) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, r * rh, W, rh) } }
      g.fillStyle = track.color
      for (const n of clip.notes) {
        const x = (n.startTime / beats) * W, w = Math.max(2, (n.duration / beats) * W - 1)
        g.globalAlpha = 0.55 + 0.45 * Math.min(1, (n.velocity ?? 100) / 127)
        g.fillRect(x, (hi - n.pitch) * rh + 1, w, Math.max(2, rh - 2))
      }
      g.globalAlpha = 1
    } else if (clip.audioFile) {
      const buf = bufferOf(clip.audioFile)
      if (!buf) return
      const mid = H / 2, cols = Math.floor(W * dpr), gain = clip.gain ?? 1
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.fillStyle = track.color
      for (let x = 0; x < cols; x++) {
        const t0 = srcAt(clip, project, (x / cols) * beats), t1 = srcAt(clip, project, ((x + 1) / cols) * beats)
        const [l, h] = minMax(buf, t0, t1)
        const top = (mid - Math.min(1, h * gain) * mid * 0.95) * dpr, bot = (mid - Math.max(-1, l * gain) * mid * 0.95) * dpr
        g.fillRect(x, top, 1, Math.max(1, bot - top))
      }
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, Math.floor(mid * dpr), cols, 1)
    }
  }, [clip, track.color, size, project, version])
  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <canvas ref={ref} onDoubleClick={() => { if (clip.notes) useUIStore.getState().setActiveView('piano-roll') }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  )
}
