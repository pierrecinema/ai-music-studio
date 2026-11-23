// The recording input of an audio track, like "Audio From" in a DAW: which input device (any microphone, line input,
// audio interface or USB device Windows knows) and which of its inputs: In 1+2 (stereo), In 1 or In 2 (mono).
import React, { useEffect, useState } from 'react'
import { useProjectStore } from '../../stores/project.store'
import { audioSettings, listDevices } from '../../audio/output'
import { REC_INPUTS } from '../../audio/recInput'
import type { Track } from '../../types'
import { tr } from '../../i18n/tr'

let cache: MediaDeviceInfo[] = []
const watchers = new Set<(d: MediaDeviceInfo[]) => void>()
async function refresh(): Promise<void> {
  cache = (await listDevices()).inputs
  for (const w of watchers) w(cache)
}
try { navigator.mediaDevices?.addEventListener?.('devicechange', () => { void refresh() }) } catch { /* no media devices */ }

const nameOf = (d: MediaDeviceInfo, i: number): string => d.label || `${tr('Input device')} ${i + 1}`

export function TrackInput({ track }: { track: Track }): React.ReactElement {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>(cache)
  useEffect(() => {
    watchers.add(setDevices)
    if (!cache.length) void refresh()
    return () => { watchers.delete(setDevices) }
  }, [])
  const update = useProjectStore((s) => s.updateTrack)
  const dev = track.inputDevice ?? ''
  const mode = track.input ?? 'stereo'
  // a device that is not connected now stays in the list, so the choice is not lost silently
  const known = !dev || devices.some((d) => d.deviceId === dev)
  const settingsId = audioSettings().inputId
  const settingsName = settingsId === 'none' ? tr('none') : devices.find((d) => d.deviceId === settingsId)?.label || tr('Windows default')
  const devName = dev ? (devices.find((d) => d.deviceId === dev)?.label || tr('Device not connected')) : `${tr('Settings → Audio')} (${settingsName})`
  const label = (m: typeof REC_INPUTS[number]): string => m.label
  return (
    <select value={`${dev}|${mode}`} onClick={(e) => e.stopPropagation()} onFocus={() => void refresh()}
      onChange={(e) => { const [d, m] = e.target.value.split('|'); update(track.id, { inputDevice: d || undefined, input: m as Track['input'] }) }}
      title={`${tr('Recording input')}: ${devName} · ${tr(REC_INPUTS.find((m) => m.id === mode)?.title ?? '')}`}
      style={{ fontSize: 9.5, padding: '0 2px', height: 17, maxWidth: 52, background: 'var(--bg-primary)', color: track.armed ? '#fca5a5' : 'var(--text-secondary)', border: `1px solid ${dev ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 3 }}>
      <optgroup label={`${tr('Settings → Audio')} (${settingsName})`}>
        {REC_INPUTS.map((m) => <option key={m.id} value={`|${m.id}`}>{label(m)}</option>)}
      </optgroup>
      {devices.map((d, i) => (
        <optgroup key={d.deviceId} label={nameOf(d, i)}>
          {REC_INPUTS.map((m) => <option key={m.id} value={`${d.deviceId}|${m.id}`}>{label(m)}</option>)}
        </optgroup>
      ))}
      {!known && (
        <optgroup label={tr('Device not connected')}>
          {REC_INPUTS.map((m) => <option key={m.id} value={`${dev}|${m.id}`}>{label(m)}</option>)}
        </optgroup>
      )}
    </select>
  )
}
