import React from 'react'
import { useUIStore } from '../../stores/ui.store'
import { ACTIONS, PRESETS, formatCombo, type Group, type PresetId } from '../../shortcuts/registry'

const GROUPS: Group[] = ['Transport', 'Edit', 'Tracks', 'Tools', 'Zoom', 'Views', 'App']

function Keys({ combos, active }: { combos: string[] | undefined; active: boolean }): React.ReactElement {
  if (!combos || combos.length === 0) {
    return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {combos.map((c) => (
        <kbd
          key={c}
          style={{
            fontFamily: 'inherit', fontSize: 11, padding: '2px 7px', borderRadius: 4,
            border: '1px solid var(--border-mid)',
            background: active ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
            color: active ? 'var(--accent-light)' : 'var(--text-muted)',
          }}
        >{formatCombo(c)}</kbd>
      ))}
    </span>
  )
}

export function ShortcutsTab(): React.ReactElement {
  const preset = useUIStore((s) => s.shortcutPreset)
  const setPreset = useUIStore((s) => s.setShortcutPreset)
  const ids = Object.keys(PRESETS) as PresetId[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        Keyboard shortcuts
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Many keys are the same in both DAWs. Where they differ, pick the layout you are used to. Shortcuts do not fire while you type in a text field (function keys and Esc excepted).
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {ids.map((id) => {
          const on = preset === id
          return (
            <button
              key={id}
              onClick={() => setPreset(id)}
              aria-pressed={on}
              style={{
                flex: '1 1 240px', textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border-mid)'}`,
                background: on ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                {on ? '● ' : '○ '}{PRESETS[id].name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{PRESETS[id].description}</div>
            </button>
          )
        })}
      </div>

      <div className="panel">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Action</th>
              {ids.map((id) => (
                <th key={id} style={{
                  padding: '8px 12px', fontSize: 10, textTransform: 'uppercase',
                  color: preset === id ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>{PRESETS[id].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={1 + ids.length} style={{ padding: '10px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{g}</td>
                </tr>
                {ACTIONS.filter((a) => a.group === g).map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>{a.label}</td>
                    {ids.map((id) => (
                      <td key={id} style={{ padding: '6px 12px' }}>
                        <Keys combos={PRESETS[id].keys[a.id]} active={preset === id} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Only shortcuts for features this app has are included (no loop, quantize or comping yet). “—” means that DAW has no default key for the action.
        Ableton keys follow the Live 12 manual; Cubase keys are the default key commands (Cubase 11 list, newer versions may differ).
        Undo and redo cover project changes (tracks, clips, notes, tempo).
      </div>
    </div>
  )
}
