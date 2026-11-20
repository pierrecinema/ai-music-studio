import { isInstrumentLike } from '../../audio/vst/host'
import React, { useEffect, useState } from 'react'
import { usePluginsStore, DEFAULT_FOLDERS } from '../../stores/plugins.store'
import { tr, trf } from '../../i18n/tr'
import { FREE_PLUGINS, type FreeKind, type FreePluginInfo } from '../../lib/freeCatalog'

// Settings → Plugins: where VST plugins are searched, the search, and which plugins appear in the app.
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }
const box: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }

// Free plugins (the LANDR list 2026 and the open-source instruments): open-source ones are installed with one click from
// their official releases into the app's plugin folder; for the others the maker's own page opens (some ask for a free
// account), and the plugin search finds them once they are installed.
type Kind = 'all' | FreeKind
function FreePlugins(): React.ReactElement {
  const s = usePluginsStore()
  const [installed, setInstalled] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<Record<string, string>>({})
  const [msg, setMsg] = React.useState<string | null>(null)
  const [kind, setKind] = React.useState<Kind>('all')
  const api = window.api?.plugins
  React.useEffect(() => {
    void api?.freeInstalled?.().then(setInstalled)
    return api?.onFreeProgress?.((p) => setBusy((b) => ({ ...b, [p.id]: p.total ? `${p.text} ${Math.round((p.done / p.total) * 100)} %` : p.text })))
  }, [])
  const found = (f: FreePluginInfo): boolean => s.plugins.some((p) => f.match.test(p.name)) || (!!f.auto && !!installed[f.auto])
  const install = async (f: FreePluginInfo): Promise<void> => {
    if (!f.auto || !api?.freeInstall) return
    const id = f.auto
    setMsg(null); setBusy((b) => ({ ...b, [id]: tr('starting') }))
    try {
      const r = await api.freeInstall(id)
      if (!r.ok) { setMsg(trf('{name}: no zip download in the current release ({tag}). The release page opens: install it from there, then press Search for plugins.', { name: f.name, tag: r.tag ?? '' })); void api.freePage?.(id); return }
      const dir = await api.freeDir!()
      s.addFolder(dir)
      setInstalled((x) => ({ ...x, [id]: true }))
      setBusy((b) => ({ ...b, [id]: tr('searching') }))
      await s.scan()
      setMsg(trf('{name} {tag} is installed.', { name: f.name, tag: r.tag ?? '' }))
    } catch (e) {
      setMsg(trf('{name} could not be installed: {m}', { name: f.name, m: (e as Error).message }))
    } finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n }) }
  }
  const list = FREE_PLUGINS.filter((f) => kind === 'all' || f.kind === kind)
  const have = FREE_PLUGINS.filter(found).length
  const tabs: Array<{ id: Kind; label: string }> = [{ id: 'all', label: tr('All') }, { id: 'effect', label: tr('Effects') }, { id: 'instrument', label: tr('Instruments') }, { id: 'midi', label: 'MIDI' }]
  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{tr('Free plugins')} <span style={{ ...muted, fontWeight: 400 }}>· {trf('{n} of {total} installed', { n: have, total: FREE_PLUGINS.length })}</span></div>
        {tabs.map((t) => <button key={t.id} className={`btn ${kind === t.id ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '2px 9px' }} onClick={() => setKind(t.id)}>{t.label}</button>)}
      </div>
      <div style={{ ...muted, marginBottom: 8 }}>{tr('The best free plugins (LANDR list 2026). Open-source ones install with one click. For the others the maker’s page opens: download and install the plugin there (some ask for a free account), then press Search for plugins below and it appears in the app.')}</div>
      {list.map((f) => {
        const ok = found(f)
        const b = f.auto ? busy[f.auto] : undefined
        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ width: 16, textAlign: 'center', color: ok ? 'var(--green)' : 'var(--text-muted)' }} title={ok ? tr('Installed (found by the plugin search)') : tr('Not installed yet')}>{ok ? '✓' : '○'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{f.name} <span style={{ ...muted, fontWeight: 400 }}>· {f.vendor} · {tr(f.what)}</span></div>
              {(f.note || f.account || f.kind === 'midi') && (
                <div style={muted}>
                  {[f.note ? tr(f.note) : '', f.account ? tr('Needs a free account / the maker’s installer app') : '', f.kind === 'midi' ? tr('MIDI plugin: use it on a MIDI track with a VST instrument, Channel → MIDI effects.') : ''].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {b ? <span style={muted}>{b}</span> : f.auto
              ? <button className={ok ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize: 11 }} onClick={() => void install(f)}>{ok ? tr('Update') : tr('Install')}</button>
              : <a className="btn btn-ghost" style={{ fontSize: 11, textDecoration: 'none' }} href={f.url} target="_blank" rel="noreferrer" title={f.url}>{tr('Download page')} ↗</a>}
          </div>
        )
      })}
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

      <FreePlugins />

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
                  <td>{isInstrumentLike(p) ? tr('Instrument') : tr('Effect')}</td>
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
