import React, { useState } from 'react'
import { api } from '../../lib/api'
import { useProjectStore } from '../../stores/project.store'
import { copyText } from '../../lib/clipboard'
import { diagIsOn, flushDiag, setDiag } from '../../lib/diagLog'
import { tr } from '../../i18n/tr'

// Collects what a developer needs to understand a problem. Nothing is sent anywhere: the user copies it.
export async function buildReport(note: string): Promise<string> {
  const { project } = useProjectStore.getState()
  const [cap, eng, log, crash] = await Promise.all([
    api.system.capabilities().catch(() => null),
    window.api.engines.status().catch(() => null),
    window.api.server.logTail().catch(() => ''),
    window.api.feedback.crashTail().catch(() => '')
  ])
  const lines = [
    `AI Music Studio v${__APP_VERSION__}`,
    `Windows: ${navigator.userAgent}`,
    '',
    '== What happened ==',
    note.trim() || '(not described)',
    '',
    '== Project ==',
    `${project.tracks.length} tracks, ${project.bpm} BPM, ` +
      `${project.tracks.reduce((n, t) => n + t.clips.length, 0)} clips`,
    '',
    '== Hardware ==',
    cap ? JSON.stringify({ tier: cap.tier, machine: cap.machine, features: cap.features.map((f) => `${f.id}: ${f.status} ${f.reason}`) }, null, 1) : 'backend not reachable',
    '',
    '== Engines ==',
    JSON.stringify(eng, null, 1),
    '',
    '== Errors of the app ==',
    crash || '(none)',
    '',
    '== Backend log (end) ==',
    log
  ]
  return lines.join('\n')
}

export function FeedbackButton(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')

  const copy = async (): Promise<void> => {
    setState('busy')
    try {
      setState((await copyText(await buildReport(note))) ? 'copied' : 'failed')
    } catch { setState('failed') }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setState('idle') }} title="Report a problem or an idea"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}>
        Feedback
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9700, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Feedback</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Describe what you did and what went wrong (or what you wish for). The report adds your system details,
              the engine status and the last log lines. <b>Nothing is sent automatically</b>: you copy the report and paste it into
              a GitHub issue or a message.
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="e.g. I pressed Create with 300 seconds and the track was only 30 seconds long."
              style={{ width: '100%', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" disabled={state === 'busy'} onClick={() => void copy()}>
                {state === 'busy' ? 'Preparing…' : 'Copy report'}
              </button>
              <button className="btn btn-ghost" onClick={() => void window.api.feedback.openIssues()}>Open GitHub issues</button>
              <button className="btn btn-ghost" onClick={() => void window.api.feedback.showCrashLog()}>Show error log</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
            {state === 'copied' && <div style={{ color: 'var(--green)', fontSize: 12 }}>Copied. Paste it into the issue (Ctrl+V).</div>}
            {state === 'failed' && <div style={{ color: 'var(--red)', fontSize: 12 }}>Could not copy to the clipboard.</div>}
            <DiagSection note={note} />
          </div>
        </div>
      )}
    </>
  )
}

// Beta testers: record a detailed log, then copy it or save it as a file and send it to us.
function DiagSection({ note }: { note: string }): React.ReactElement {
  const [on, setOn] = useState(diagIsOn())
  const [msg, setMsg] = useState<string | null>(null)
  const full = async (): Promise<string> => { flushDiag(); await new Promise((r) => setTimeout(r, 150)); return window.api.diag.collect(await buildReport(note)) }
  const act = async (fn: () => Promise<string | null>): Promise<void> => { setMsg(tr('Preparing…')); try { setMsg(await fn()) } catch (e) { setMsg((e as Error).message) } }
  return (
    <div style={{ borderTop: '1px solid var(--border-mid)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{tr('Detailed log (beta)')}</b>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: on ? 'var(--red)' : 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={on} onChange={async (e) => { setOn(await setDiag(e.target.checked)) }} />
          {on ? tr('Recording') : tr('Record a detailed log')}
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {tr('Switch it on, repeat what went wrong, then copy the log or save it as a file and send it to us (GitHub issue, e-mail or message). It contains what you clicked, warnings and errors of the app and the log of the AI backend: no audio, no lyrics of your songs beyond what you typed into the AI fields, no passwords. It stays on after a restart until you switch it off.')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={() => void act(async () => ((await copyText(await full())) ? tr('Log copied. Paste it with Ctrl+V.') : tr('Could not copy to the clipboard.')))}>{tr('Copy log')}</button>
        <button className="btn btn-ghost" onClick={() => void act(async () => { const p = await window.api.diag.save(await full()); return p ? tr('Saved:') + ' ' + p : null })}>{tr('Save log as file…')}</button>
        <button className="btn btn-ghost" onClick={() => void act(async () => { await window.api.diag.clear(); return tr('Log cleared.') })}>{tr('Clear log')}</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--green)', wordBreak: 'break-all' }}>{msg}</div>}
    </div>
  )
}
