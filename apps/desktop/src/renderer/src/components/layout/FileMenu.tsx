import { sendToMastering } from '../../stores/mastering.store'
import { renderMix } from '../../audio/engine'
import React, { useEffect, useRef, useState } from 'react'
import { newProject, openProject, recentProjects, saveProject, saveProjectAs } from '../../project/io'
import { useProjectStore } from '../../stores/project.store'
import { useUIStore } from '../../stores/ui.store'
import { ExportDialog } from './ExportDialog'

export const EXPORT_EVENT = 'ams:export-audio'

export function reportOpen(r: { ok: boolean; message?: string; missing?: string[] }): void {
  if (r.message) window.alert(r.message)
  else if (r.ok && r.missing?.length) {
    window.alert(`The project opened, but ${r.missing.length} audio file(s) are missing and will be silent:\n\n` +
      r.missing.slice(0, 6).join('\n') + (r.missing.length > 6 ? '\n…' : ''))
  }
}

export function FileMenu(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dirty = useProjectStore((s) => s.dirty)
  const name = useProjectStore((s) => s.project.name)
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    const show = (): void => setExporting(true)
    window.addEventListener(EXPORT_EVENT, show)
    return () => window.removeEventListener(EXPORT_EVENT, show)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const run = (fn: () => unknown): void => { setOpen(false); void Promise.resolve(fn()).catch((e) => window.alert(`That did not work: ${(e as Error).message}`)) }
  const recent = recentProjects()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="tb-btn" style={{ width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }} onClick={() => setOpen((v) => !v)}>
        File ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 9500, minWidth: 250, background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: 4, boxShadow: '0 8px 24px #0008' }}>
          <Item label="New project" keys="Ctrl+N" onClick={() => run(() => newProject())} />
          <Item label="Open…" keys="Ctrl+O" onClick={() => run(async () => reportOpen(await openProject()))} />
          {recent.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 10px 2px' }}>Recent</div>}
          {recent.slice(0, 5).map((p) => (
            <Item key={p} label={(p.split(/[\\/]/).pop() ?? p).replace(/\.ams$/i, '')} title={p} small onClick={() => run(async () => reportOpen(await openProject(p)))} />
          ))}
          <Sep />
          <Item label={`Save${dirty ? ' •' : ''}`} keys="Ctrl+S" onClick={() => run(() => saveProject())} />
          <Item label="Save as…" keys="Ctrl+Shift+S" onClick={() => run(() => saveProjectAs(name))} />
          <Sep />
          <Item label="Export audio (WAV / MP3)…" onClick={() => { setOpen(false); setExporting(true) }} />
          <Item label="Send song to Mastering" onClick={() => run(async () => {
            const mix = await renderMix({ bits: 24, normalize: false })
            const path = await window.api.files.saveTemp(mix.wav, `${(name || 'song').replace(/[^\w.-]+/g, '_')}-mix-${Date.now()}.wav`)
            sendToMastering(path, name || 'Studio mix')
          })} />
          <Item label="Library" onClick={() => { setOpen(false); setActiveView('library') }} />
        </div>
      )}
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </div>
  )
}

function Item({ label, keys, onClick, small, title }: { label: string; keys?: string; onClick: () => void; small?: boolean; title?: string }): React.ReactElement {
  return (
    <div
      onClick={onClick} title={title}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: small ? '4px 18px' : '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: small ? 11 : 12, color: 'var(--text-primary)' }}
    >
      <span>{label}</span>
      {keys && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{keys}</span>}
    </div>
  )
}

const Sep = (): React.ReactElement => <div style={{ height: 1, background: 'var(--border-mid)', margin: '4px 0' }} />
