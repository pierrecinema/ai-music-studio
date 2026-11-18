import React, { useEffect, useState } from 'react'
import { usePluginsStore, DEFAULT_FOLDERS } from '../../stores/plugins.store'
import { tr, trf } from '../../i18n/tr'

// Settings → Plugins: where VST plugins are searched, the search, and which plugins appear in the app.
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const box: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }

// free open-source instruments: downloaded from their official releases into the app's own plugin folder
const FREE = [
  { id: 'dexed', name: 'Dexed', what: 'FM synthesizer modelled on the classic DX7 (electric pianos, basses, bells)', license: 'GPL-3' },
  { id: 'surge', name: 'Surge XT', what: 'Big all-round synthesizer: pads, leads, basses, thousands of sounds', license: 'GPL-3' },
]

function FreeInstruments(): React.ReactElement {
  const s = usePluginsStore()
  const [installed, setInstalled] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<Record<string, string>>({})
  const [msg, setMsg] = React.useState<string | null>(null)
  const api = window.api?.plugins
  React.useEffect(() => {
    void api?.freeInstalled?.().then(setInstalled)
    return api?.onFreeProgress?.((p) => setBusy((b) => ({ ...b, [p.id]: p.total ? `${p.text} ${Math.round((p.done / p.total) * 100)} %` : p.text })))
  }, [])
  if (!api?.freeInstall) return <></>
  const install = async (id: string, name: string): Promise<void> => {
    setMsg(null); setBusy((b) => ({ ...b, [id]: tr('starting') }))
    try {
      const r = await api.freeInstall!(id)
      if (!r.ok) { setMsg(trf('{name}: no zip download in the current release ({tag}). The release page opens: install it from there, then press Search for plugins.', { name, tag: r.tag ?? '' })); void api.freePage?.(id); return }
      const dir = await api.freeDir!()
      s.addFolder(dir)
      setInstalled((x) => ({ ...x, [id]: true }))
      setBusy((b) => ({ ...b, [id]: tr('searching') }))
      await s.scan()
      setMsg(trf('{name} {tag} is installed. Choose it on a MIDI track: Channel → Instrument.', { name, tag: r.tag ?? '' }))
    } catch (e) {
      setMsg(trf('{name} could not be installed: {m}', { name, m: (e as Error).message }))
    } finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n }) }
  }
  return (
    <div style={box}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{tr('Free instruments (open source)')}</div>
      <div style={{ ...muted, marginBottom: 8 }}>{tr('Downloaded from the official release of each project into the app’s plugin folder, then found by the search. Use them on MIDI tracks (Channel → Instrument).')}</div>
      {FREE.map((f) => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{f.name} <span style={{ ...muted, fontWeight: 400 }}>· {f.license}</span></div>
            <div style={muted}>{tr(f.what)}</div>
          </div>
          {busy[f.id] ? <span style={muted}>{busy[f.id]}</span>
            : <button className={installed[f.id] ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize: 11 }} onClick={() => void install(f.id, f.name)}>{installed[f.id] ? tr('Update') : tr('Install')}</button>}
        </div>
      ))}
      {msg && <div style={{ ...muted, marginTop: 6, color: 'var(--text-secondary)' }}>{msg}</div>}
    </div>
  )
}

export function PluginsTab(): React.ReactElement {
  const s = usePluginsStore()
  const [filter, setFilter] = useState('')
  const [showFailed, setShowFailed] = useState(false)
  useEffect(() => { if (!s.loaded) void s.load() }, [s.loaded])

  const shown = s.plugins.filter((p) => !filter || `${p.name} ${p.vendor} ${p.format}`.toLowerCase().includes(filter.toLowerCase()))
  const pick = async (): Promise<void> => {
    const f = await window.api?.dialog?.pickFolder?.(tr('Choose a folder with VST plugins'))
    if (typeof f === 'string' && f) s.addFolder(f)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{tr('VST plugins')}</div>
        <div style={muted}>
          {tr('Your VST3 and VST2 effects can be used in the Studio (effects of a track: “+ Effect…”). 64-bit and 32-bit plugins work; a 32-bit plugin runs in its own 32-bit plugin host.')}
        </div>
      </div>

      <FreeInstruments />

      {s.available === false && (
        <div style={{ ...box, color: 'var(--orange)', fontSize: 12 }}>
          {tr('The plugin host is not part of this installation (development build). Plugins work in the installed app.')}
        </div>
      )}

      <div style={box}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{tr('Folders')}</div>
        <div style={{ ...muted, marginBottom: 6 }}>{tr('Always searched (where plugins are usually installed):')}</div>
        {DEFAULT_FOLDERS.map((f) => <div key={f} style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{f}</div>)}
        {s.folders.length > 0 && <div style={{ ...muted, margin: '8px 0 4px' }}>{tr('Your folders:')}</div>}
        {s.folders.map((f) => (
          <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontFamily: 'monospace' }}>
            <span style={{ flex: 1 }}>{f}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => s.removeFolder(f)}>{tr('Remove')}</button>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 8 }} onClick={() => void pick()}>{tr('Add folder…')}</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!!s.scanning || s.available === false} onClick={() => void s.scan()}>
          {s.scanning ? tr('Searching…') : tr('Search for plugins')}
        </button>
        {s.scanning && (
          <span style={muted}>
            {s.scanning.total > 0 ? trf('{done} of {total}', { done: s.scanning.done, total: s.scanning.total }) : tr('Looking for plugin files…')}
            {s.scanning.file ? ` · ${s.scanning.file.split(/[\\/]/).pop()}` : ''}
          </span>
        )}
        {!s.scanning && s.scannedAt > 0 && (
          <span style={muted}>{trf('Last search: {date} · {n} plugins', { date: new Date(s.scannedAt).toLocaleString(), n: s.plugins.length })}</span>
        )}
        {s.error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{s.error}</span>}
      </div>
      <div style={muted}>{tr('Each plugin is checked on its own: one that crashes while being checked is skipped and listed below, the app keeps running. New plugins: press Search for plugins again.')}</div>

      {s.plugins.length > 0 && (
        <div style={box}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr('Search name or vendor…')} style={{ flex: 1, fontSize: 12 }} />
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => s.setAll(true)}>{tr('Tick all')}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => s.setAll(false)}>{tr('None')}</button>
          </div>
          <div style={{ ...muted, marginBottom: 6 }}>{tr('Ticked plugins appear in the app.')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ width: 28 }} /><th>{tr('Name')}</th><th>{tr('Vendor')}</th><th>{tr('Type')}</th><th>{tr('Format')}</th><th>{tr('Bits')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }} title={p.file}>
                  <td><input type="checkbox" checked={!s.off.includes(p.id)} onChange={(e) => s.setOn(p.id, e.target.checked)} /></td>
                  <td style={{ padding: '4px 0', color: 'var(--text-primary)' }}>{p.name}</td>
                  <td>{p.vendor || '–'}</td>
                  <td>{p.isInstrument ? tr('Instrument (later)') : tr('Effect')}</td>
                  <td>{p.format}</td>
                  <td>{p.arch === 'x86' ? '32' : '64'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.loaded && !s.scanning && s.scannedAt > 0 && s.plugins.length === 0 && (
        <div style={{ ...box, fontSize: 12 }}>{tr('No plugins found in these folders. Add the folder your plugins are in and search again.')}</div>
      )}

      {s.failed.length > 0 && (
        <div style={box}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowFailed(!showFailed)}>
            {showFailed ? '▾' : '▸'} {trf('{n} files could not be used', { n: s.failed.length })}
          </button>
          {showFailed && s.failed.map((f) => (
            <div key={f.file} style={{ fontSize: 11, marginTop: 4 }}>
              <span style={{ fontFamily: 'monospace' }}>{f.file}</span> <span style={muted}>({f.format}): {tr(f.reason)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
