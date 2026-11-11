// The ruler on top of the Studio: markers (Ableton locators / Cubase marker track with cycle markers),
// the loop brace (Ableton) / cycle range between the left and right locator (Cubase), and the bar numbers
// with time-signature changes.
import React, { useRef } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { seek } from '../../audio/engine'
import { bars } from '../../audio/timemap'
import { snapBeat } from '../../edit/grid'
import { LOOP_H, MARKER_H, NUM_H, trackPointer } from './studioLayout'
import type { PopoverSpec } from './Popover'

const EDGE = 6

export function Ruler({ beatWidth, totalBeats, popover }: { beatWidth: number; totalBeats: number; popover: (p: PopoverSpec) => void }): React.ReactElement {
  const project = useProjectStore((s) => s.project)
  const { setLoop, addMarker, updateMarker, removeMarker, updateProject } = useProjectStore.getState()
  const ref = useRef<HTMLDivElement>(null)
  const beatAt = (clientX: number): number => Math.max(0, (clientX - ref.current!.getBoundingClientRect().left) / beatWidth)
  const loop = project.loop
  const markers = project.markers ?? []

  // ── loop brace ──
  const loopDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    const b0 = beatAt(e.clientX)
    const x = loop ? (b0 - loop.start) * beatWidth : -1
    const w = loop ? (loop.end - loop.start) * beatWidth : 0
    const on = loop && x >= -EDGE && x <= w + EDGE
    const mode = !on ? 'new' : x < EDGE ? 'start' : x > w - EDGE ? 'end' : 'move'
    const orig = loop ? { ...loop } : { start: 0, end: 0, enabled: true }
    let moved = false
    trackPointer((ev) => {
      const b = beatAt(ev.clientX)
      if (!moved && Math.abs(b - b0) * beatWidth < 3) return
      moved = true
      const free = ev.altKey
      if (mode === 'new') {
        const a = snapBeat(Math.min(b0, b), free, 'floor')
        const z = Math.max(a + 0.25, snapBeat(Math.max(b0, b), free))
        setLoop({ start: a, end: z, enabled: true })
      } else if (mode === 'move') {
        const s = Math.max(0, snapBeat(orig.start + b - b0, free))
        setLoop({ start: s, end: s + orig.end - orig.start })
      } else if (mode === 'start') {
        setLoop({ start: Math.min(orig.end - 0.25, Math.max(0, snapBeat(b, free))) })
      } else {
        setLoop({ end: Math.max(orig.start + 0.25, snapBeat(b, free)) })
      }
    }, () => { if (!moved && loop && on) setLoop({ enabled: !loop.enabled }) })
  }

  // ── markers ──
  const markerDown = (e: React.PointerEvent, id: string, beat: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    const b0 = beatAt(e.clientX)
    const m = markers.find((x) => x.id === id)
    let moved = false
    trackPointer((ev) => {
      const b = beatAt(ev.clientX)
      if (!moved && Math.abs(b - b0) * beatWidth < 3) return
      moved = true
      const nb = Math.max(0, snapBeat(beat + b - b0, ev.altKey))
      updateMarker(id, m?.end !== undefined ? { beat: nb, end: nb + (m.end - m.beat) } : { beat: nb })
    }, () => { if (!moved) seek(beat) })
  }

  const editMarker = (e: React.MouseEvent, id: string): void => {
    e.preventDefault(); e.stopPropagation()
    const m = markers.find((x) => x.id === id)
    if (!m) return
    popover({
      x: e.clientX, y: e.clientY, title: m.end !== undefined ? 'Cycle marker' : 'Marker',
      fields: [{ key: 'name', label: 'Name', value: m.name }],
      onOk: (v) => updateMarker(id, { name: v.name.trim() || m.name }),
      danger: { label: 'Delete', run: () => removeMarker(id) }
    })
  }

  // ── signatures ──
  const editSignature = (e: React.MouseEvent): void => {
    e.preventDefault()
    const list = bars(project, beatAt(e.clientX) + 1e-6)
    const bar = list[list.length - 1]
    if (!bar) return
    const existing = (project.signatures ?? []).find((s) => s.bar === bar.index)
    popover({
      x: e.clientX, y: e.clientY, title: `Time signature from bar ${bar.index + 1}`,
      fields: [{ key: 'num', label: 'Beats per bar', value: String(bar.num), type: 'number' }, { key: 'den', label: 'Note value', value: String(bar.den), options: ['2', '4', '8', '16'] }],
      onOk: (v) => {
        const num = Math.max(1, Math.min(32, Math.round(Number(v.num) || bar.num)))
        const den = Number(v.den) || 4
        if (bar.index === 0) { updateProject({ timeSignature: [num, den] }); return }
        updateProject({ signatures: [...(project.signatures ?? []).filter((s) => s.bar !== bar.index), { bar: bar.index, num, den }] })
      },
      danger: existing ? { label: 'Remove change', run: () => updateProject({ signatures: (project.signatures ?? []).filter((s) => s.bar !== bar.index) }) } : undefined
    })
  }

  const barList = bars(project, totalBeats)
  let prevSig = ''
  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, height: '100%' }}>
      {/* markers */}
      <div title="Double-click: add a marker. Drag a marker to move it, click it to jump there, right-click to rename or delete. Double-click a cycle marker to loop it."
        onDoubleClick={(e) => { if (e.target === e.currentTarget) addMarker(snapBeat(beatAt(e.clientX))) }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: MARKER_H, borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
        {markers.map((m) => (
          <div key={m.id}
            onPointerDown={(e) => markerDown(e, m.id, m.beat)}
            onContextMenu={(e) => editMarker(e, m.id)}
            onDoubleClick={(e) => { e.stopPropagation(); if (m.end !== undefined) setLoop({ start: m.beat, end: m.end, enabled: true }); else editMarker(e, m.id) }}
            style={{
              position: 'absolute', left: m.beat * beatWidth, top: 1, height: MARKER_H - 3, cursor: 'grab',
              width: m.end !== undefined ? Math.max(8, (m.end - m.beat) * beatWidth) : undefined,
              background: m.end !== undefined ? 'rgba(234,179,8,0.25)' : 'transparent',
              borderLeft: '2px solid #eab308', borderRadius: 2, paddingLeft: 3,
              fontSize: 10, color: '#fde68a', whiteSpace: 'nowrap', overflow: 'hidden', userSelect: 'none'
            }}>{m.name}</div>
        ))}
      </div>
      {/* loop brace */}
      <div onPointerDown={loopDown}
        title="Loop: drag here to set the loop range, drag the brace to move it, its edges to resize, click it to switch the loop on or off"
        style={{ position: 'absolute', left: 0, right: 0, top: MARKER_H, height: LOOP_H, background: 'var(--bg-secondary)', cursor: 'pointer' }}>
        {loop && (
          <div style={{
            position: 'absolute', left: loop.start * beatWidth, width: Math.max(2, (loop.end - loop.start) * beatWidth), top: 2, height: LOOP_H - 4, borderRadius: 3,
            background: loop.enabled ? 'var(--accent)' : 'rgba(148,163,184,0.45)', boxShadow: loop.enabled ? '0 0 0 1px #fff4 inset' : 'none',
            pointerEvents: 'none'
          }} />
        )}
        {loop && (project.punchIn || project.punchOut) && (
          <>
            {project.punchIn && <div style={{ position: 'absolute', left: loop.start * beatWidth - 1, top: 0, width: 3, height: LOOP_H, background: 'var(--red)', pointerEvents: 'none' }} />}
            {project.punchOut && <div style={{ position: 'absolute', left: loop.end * beatWidth - 2, top: 0, width: 3, height: LOOP_H, background: 'var(--red)', pointerEvents: 'none' }} />}
          </>
        )}
      </div>
      {/* bar numbers */}
      <div onMouseDown={(e) => { if (e.button === 0) seek(beatAt(e.clientX)) }} onContextMenu={editSignature}
        title="Click: move the playhead. Right-click: change the time signature from this bar on"
        style={{ position: 'absolute', left: 0, right: 0, top: MARKER_H + LOOP_H, height: NUM_H, cursor: 'text' }}>
        {barList.map((b) => {
          const sig = `${b.num}/${b.den}`
          const show = sig !== prevSig
          prevSig = sig
          return (
            <div key={b.index} style={{ position: 'absolute', left: b.beat * beatWidth, top: 0, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 4, borderLeft: '1px solid var(--border)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.index + 1}</span>
              {show && <span style={{ fontSize: 9, color: 'var(--accent-light)', marginLeft: 4 }}>{sig}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
