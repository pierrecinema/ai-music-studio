// The sound pack card: install the real recorded instruments (GeneralUser GS) once, then MIDI tracks play them.
// Shown on the AI Instruments page (while not installed) and in Settings → Audio.
import { useEffect, useState } from 'react'
import { loadSoundPack, setSoundBank } from '../../audio/soundbank'
import { useSoundPack } from '../../lib/useSoundPack'
import { tr } from '../../i18n/tr'

export function SoundPackCard({ compact = false }: { compact?: boolean }): React.ReactElement | null {
  const loaded = useSoundPack()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<{ text: string; pct?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void window.api.sounds?.status().then((s) => setInstalled(s.installed)).catch(() => setInstalled(false)) }, [loaded])
  useEffect(() => window.api.sounds?.onProgress((p) => setBusy(p)), [])
  if (!window.api.sounds) return null
  if (compact && (loaded || installed)) return null

  const install = async (): Promise<void> => {
    setError(null); setBusy({ text: tr('Starting the download…'), pct: 0 })
    const r = await window.api.sounds!.install()
    if (!r.ok) { setBusy(null); setError(r.error ?? tr('The download failed.')); return }
    setBusy({ text: tr('Loading the instruments…'), pct: 100 })
    await loadSoundPack()
    setBusy(null); setInstalled(true)
  }
  const remove = async (): Promise<void> => { await window.api.sounds!.remove(); setSoundBank(null); setInstalled(false) }

  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 8,
      background: 'linear-gradient(180deg, #1e2a36, #17202a)', border: '1px solid #2f4254', color: '#dbe4ee', fontSize: 12.5 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <b style={{ fontSize: 13 }}>{tr('Sound pack: real instruments')}</b>
        <span style={{ color: '#9fb0c2' }}>
          {loaded
            ? tr('Installed. MIDI tracks with a built-in sound play recorded piano, guitars, basses, drum kits, strings, brass and more. Pick one per track in the Studio (instrument list).')
            : tr('Recorded piano, guitars, basses, drum kits, strings, brass and more for the MIDI tracks, the song generator and the band, instead of the simple synthesizer. GeneralUser GS by S. Christian Collins, about 28 MB, downloaded once.')}
        </span>
        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 180, height: 6, borderRadius: 3, background: '#0d141b', overflow: 'hidden' }}>
              <div style={{ width: `${busy.pct ?? 0}%`, height: '100%', background: '#f59e0b' }} />
            </div>
            <span style={{ color: '#9fb0c2' }}>{busy.text}</span>
          </div>
        )}
        {error && <span style={{ color: '#f87171' }}>{error}</span>}
      </div>
      {!loaded && !busy && <button className="btn btn-primary" onClick={() => void install()}>{installed ? tr('Load') : tr('Install (28 MB)')}</button>}
      {loaded && !compact && <button className="btn btn-ghost" onClick={() => void remove()} title={tr('Delete the pack: MIDI tracks play the built-in synthesizer again')}>{tr('Remove')}</button>}
    </div>
  )
}
