// Settings → MIDI: the connected MIDI devices (keyboards, pad controllers, Launchpads), like Ableton's MIDI settings:
// per device Notes (play and record) and Control (knobs and buttons drive the app), the mapping of a known device,
// and MIDI Learn for any control.
import React, { useEffect, useState } from 'react'
import { cancelLearn, learn, mappingsOf, settingsOf, startMidiHardware, useMidiHw } from '../../midi/hardware'
import { keyLabel, profileFor, type Target } from '../../midi/devices'
import { tr, trf } from '../../i18n/tr'

const TARGETS: Array<{ label: string; target: Target }> = [
  { label: 'Play / pause', target: { kind: 'transport', action: 'play' } },
  { label: 'Stop', target: { kind: 'transport', action: 'stop' } },
  { label: 'Record', target: { kind: 'transport', action: 'record' } },
  { label: 'Loop on / off', target: { kind: 'transport', action: 'loop' } },
  { label: 'Metronome', target: { kind: 'transport', action: 'metronome' } },
  { label: 'Previous marker', target: { kind: 'transport', action: 'back' } },
  { label: 'Next marker', target: { kind: 'transport', action: 'forward' } },
  { label: 'Selected track: volume', target: { kind: 'selected', what: 'volume' } },
  { label: 'Selected track: pan', target: { kind: 'selected', what: 'pan' } },
  { label: 'Selected track: mute', target: { kind: 'selected', what: 'mute' } },
  { label: 'Selected track: solo', target: { kind: 'selected', what: 'solo' } },
  { label: 'Selected track: send to the first return', target: { kind: 'selected', what: 'send' } },
  ...Array.from({ length: 8 }, (_, i) => ({ label: `Plugin knob ${i + 1}`, target: { kind: 'plugin', slot: i } as Target })),
  { label: 'Previous track', target: { kind: 'select', dir: -1 } },
  { label: 'Next track', target: { kind: 'select', dir: 1 } },
  { label: 'Master volume', target: { kind: 'master' } },
  { label: 'Tempo (60–200 BPM)', target: { kind: 'bpm' } },
]
const same = (a: Target, b: Target): boolean => JSON.stringify(a) === JSON.stringify(b)

const box: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }

export function MidiTab(): React.ReactElement {
  const ports = useMidiHw((s) => s.ports)
  const devices = useMidiHw((s) => s.devices)
  const learning = useMidiHw((s) => s.learning)
  const last = useMidiHw((s) => s.last)
  const available = useMidiHw((s) => s.available)
  const setDev = useMidiHw((s) => s.set)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { void startMidiHardware() }, [])
  useEffect(() => () => cancelLearn(), [])
  const inputs = [...new Set(ports.filter((p) => p.type === 'input' && p.state === 'connected').map((p) => p.name))]
  const outputs = [...new Set(ports.filter((p) => p.type === 'output' && p.state === 'connected').map((p) => p.name))]
  void devices

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>{tr('MIDI devices')}</h3>
        <p style={{ ...muted, margin: '4px 0 0' }}>
          {tr('Keyboards, pad controllers and Launchpads are found by themselves when they are plugged in. Notes: the keys and pads play the selected track (and are recorded). Control: knobs, faders and buttons drive the app. Known devices start with a ready mapping; Learn links any control to anything in the list.')}
        </p>
      </div>
      {!available && <div style={{ ...box, color: 'var(--red)', fontSize: 12 }}>{tr('MIDI is not available here.')}</div>}
      {available && !inputs.length && <div style={{ ...box, ...muted }}>{tr('No MIDI device is connected. Plug one in: it appears here at once.')}</div>}

      {inputs.map((name) => {
        const cfg = settingsOf(name)
        const prof = profileFor(name)
        const maps = mappingsOf(name)
        const isOpen = open === name || inputs.length === 1
        return (
          <div key={name} style={box}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18 }}>{prof?.launchpad ? '▦' : '🎹'}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{name}</div>
                <div style={muted}>{prof ? trf('Recognised: {name}', { name: prof.name }) : tr('Not in the list of known devices: use Learn to link its controls.')}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }} title={tr('The keys and pads play the selected track and are recorded')}>
                <input type="checkbox" checked={cfg.notes} onChange={(e) => setDev(name, { notes: e.target.checked })} /> {tr('Notes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }} title={tr('Knobs, faders and buttons drive the app')}>
                <input type="checkbox" checked={cfg.control} onChange={(e) => setDev(name, { control: e.target.checked })} /> {tr('Control')}
              </label>
              {inputs.length > 1 && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setOpen(isOpen ? null : name)}>{isOpen ? tr('Hide mapping') : tr('Mapping…')}</button>}
            </div>
            {prof && <div style={muted}>{tr(prof.notes)}</div>}
            {prof?.launchpad && (
              <div style={{ ...muted, color: 'var(--text-secondary)' }}>
                {tr('Launchpad grid: top row = jump to markers 1–8 (amber where a marker is). Rows below = tracks 1–7: pad 1 mute (red), pad 2 solo (blue), pad 3 select (white), pads 4–8 volume in steps (green).')}
              </div>
            )}
            {isOpen && !prof?.launchpad && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 150px auto', gap: '4px 10px', alignItems: 'center', fontSize: 12 }}>
                <b style={muted}>{tr('Function')}</b><b style={muted}>{tr('Control on the device')}</b><span />
                {TARGETS.map(({ label, target }) => {
                  const m = maps.find((x) => same(x.target, target))
                  const waiting = learning && learning.device === name && same(learning.target, target)
                  return (
                    <React.Fragment key={label}>
                      <span style={{ color: 'var(--text-secondary)' }}>{tr(label)}</span>
                      <span style={{ fontFamily: 'Consolas, monospace', fontSize: 11, color: waiting ? 'var(--accent-light)' : m ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {waiting ? tr('move a control…') : m ? keyLabel(m.key) : '–'}
                      </span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button className={`btn ${waiting ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '2px 8px' }}
                          title={tr('Click, then turn a knob, move a fader or press a button or pad on the device')}
                          onClick={() => (waiting ? cancelLearn() : learn(name, target))}>{waiting ? tr('Cancel') : tr('Learn')}</button>
                        {m && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }} title={tr('Remove this link')}
                          onClick={() => setDev(name, { mappings: maps.filter((x) => x !== m) })}>×</button>}
                      </span>
                    </React.Fragment>
                  )
                })}
              </div>
            )}
            {isOpen && !prof?.launchpad && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setDev(name, { mappings: undefined })}
                  title={tr('Back to the mapping the app knows for this device (or none)')}>{tr('Reset mapping')}</button>
                {last?.device === name && <span style={muted}>{trf('Last control: {key} = {value}', { key: keyLabel(last.key), value: last.value })}</span>}
              </div>
            )}
          </div>
        )
      })}

      {outputs.length > 0 && (
        <div style={{ ...muted }}>
          <b>{tr('MIDI outputs')}:</b> {outputs.join(' · ')}
        </div>
      )}
    </div>
  )
}
