// Sound packs: real recorded instruments for MIDI tracks, the song generator and the band. Each pack is installed once
// (Settings → Audio, or the AI Instruments page while none is installed); the app plays the best installed one for
// each instrument (multisampled piano and orchestra first, then MuseScore General, then GeneralUser GS).
import { useEffect, useState } from 'react'
import { loadSoundPack, setSoundBank } from '../../audio/soundbank'
import { useSoundPack } from '../../lib/useSoundPack'
import { tr, trf } from '../../i18n/tr'

export function SoundPackCard({ compact = false }: { compact?: boolean }): React.ReactElement | null {
  const loaded = useSoundPack()
  const [packs, setPacks] = useState<SoundPackInfo[] | null>(null)
  const [busy, setBusy] = useState<Record<string, { text: string; pct?: number }>>({})
  const [error, setError] = useState<Record<string, string>>({})
  const refresh = (): void => { void window.api.sounds?.status().then((s) => setPacks(s.packs ?? null)).catch(() => setPacks(null)) }
  useEffect(refresh, [loaded])
  useEffect(() => window.api.sounds?.onProgress((p) => setBusy((b) => ({ ...b, [p.id ?? 'generaluser']: { text: p.text, pct: p.pct } }))), [])
  if (!window.api.sounds || !packs) return null
  const anyInstalled = packs.some((p) => p.installed)
  if (compact && anyInstalled) return null

  const install = async (id: string): Promise<void> => {
    setError((e) => ({ ...e, [id]: '' })); setBusy((b) => ({ ...b, [id]: { text: tr('Starting the download…'), pct: 0 } }))
    const r = await window.api.sounds!.install(id)
    if (!r.ok) { setBusy((b) => { const n = { ...b }; delete n[id]; return n }); setError((e) => ({ ...e, [id]: r.error ?? tr('The download failed.') })); return }
    setBusy((b) => ({ ...b, [id]: { text: tr('Loading the instruments…'), pct: 100 } }))
    await loadSoundPack()
    setBusy((b) => { const n = { ...b }; delete n[id]; return n })
    refresh()
  }
  const remove = async (id: string): Promise<void> => { await window.api.sounds!.remove(id); setSoundBank(null, id); refresh() }
  const total = packs.filter((p) => p.installed).reduce((a, p) => a + p.diskMb, 0)

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderRadius: 8,
      background: 'linear-gradient(180deg, #1e2a36, #17202a)', border: '1px solid #2f4254', color: '#dbe4ee', fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 13 }}>{tr('Sound packs: real instruments')}</b>
        <span style={{ color: '#9fb0c2', fontSize: 11.5 }}>
          {anyInstalled ? trf('Installed: {mb} MB on disk. The best installed pack plays each instrument.', { mb: total }) : tr('Recorded instruments for the MIDI tracks, the song generator and the band, instead of the simple synthesizer. Each pack is downloaded once.')}
        </span>
      </div>
      {packs.map((p) => {
        const b = busy[p.id]
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: `1px solid ${p.installed ? '#2f6b45' : '#2a3a4a'}` }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.installed ? '#3ddc84' : '#3a4654', boxShadow: p.installed ? '0 0 6px #3ddc84' : 'none', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span><b>{p.name}</b> <span style={{ color: '#9fb0c2' }}>· {tr(p.what)}</span></span>
              <span style={{ color: '#7f90a3', fontSize: 11 }}>{trf('{dl} MB download, {disk} MB on disk', { dl: p.downloadMb, disk: p.diskMb })} · {p.licence}</span>
              {b && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 180, height: 6, borderRadius: 3, background: '#0d141b', overflow: 'hidden' }}><div style={{ width: `${b.pct ?? 0}%`, height: '100%', background: '#f59e0b' }} /></div>
                  <span style={{ color: '#9fb0c2', fontSize: 11 }}>{b.text}</span>
                </div>
              )}
              {error[p.id] && <span style={{ color: '#f87171', fontSize: 11 }}>{error[p.id]}</span>}
            </div>
            {!b && !p.installed && <button className="btn btn-primary" style={{ fontSize: 11.5 }} onClick={() => void install(p.id)}>{trf('Install ({mb} MB)', { mb: p.downloadMb })}</button>}
            {!b && p.installed && !compact && <button className="btn btn-ghost" style={{ fontSize: 11.5 }} title={tr('Delete this pack: its instruments are played by another installed pack or the synthesizer')} onClick={() => void remove(p.id)}>{tr('Remove')}</button>}
          </div>
        )
      })}
    </div>
  )
}
