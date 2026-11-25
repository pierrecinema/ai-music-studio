// The first start: a setup assistant that makes the app ready without anything done by hand. It looks at the
// computer (graphics card, memory, free space, Python), offers three packages, installs the chosen one with one
// click (the app sets up its own Python 3.11 when the PC has none that fits) and shows clear progress with the time.
import React, { useEffect, useRef, useState } from 'react'
import { tr, trf } from '../../i18n/tr'

type Step = 'check' | 'package' | 'install' | 'done'
type PackageId = 'recommended' | 'full' | 'studio'

const BASE = ['core', 'torch', 'demucs', 'basicpitch', 'matchering', 'whisper']
const PACKAGES: Array<{ id: PackageId; title: string; text: string; groups: string[]; gbCpu: number; gbGpu: number; features: string[] }> = [
  { id: 'recommended', title: 'Recommended', text: 'Everything for producing: Studio, stem splitting, Audio → MIDI, mastering, karaoke. Music generation can be added later.',
    groups: BASE, gbCpu: 5, gbGpu: 8, features: ['Studio and mixer', 'Stem Splitter', 'Audio → MIDI', 'Mastering', 'Karaoke'] },
  { id: 'full', title: 'Everything', text: 'Also the music AI (songs with vocals from your lyrics), the built-in singers and the AI instruments. Large: the music model loads on the first song.',
    groups: [...BASE, 'separator', 'ace15', 'singer', 'voicechange', 'aiinst'], gbCpu: 25, gbGpu: 29, features: ['All of "Recommended"', 'Create music (ACE-Step 1.5)', 'Built-in singers', 'Songs sung by the built-in voices', 'AI instruments', 'Fast vocal separation'] },
  { id: 'studio', title: 'Studio only', text: 'The DAW, Piano Roll, mixer, VST plugins and sound packs, without any AI. Nothing is installed now; AI engines can be added any time.',
    groups: [], gbCpu: 0, gbGpu: 0, features: ['Studio, Piano Roll, mixer', 'VST plugins', 'Sound packs'] },
]
// the order the installer works in (main/engines.ts installGroups), for the progress
const ORDER = ['python', 'core', 'torch', 'demucs', 'basicpitch', 'matchering', 'whisper', 'ace15', 'aiinst', 'separator', 'singer', 'voicechange']
const NAMES: Record<string, string> = {
  python: 'Python (for the app)', core: 'Core', torch: 'PyTorch', demucs: 'Stem separation', basicpitch: 'Audio → MIDI', matchering: 'Mastering',
  whisper: 'Lyric timing', separator: 'Fast vocal separation', ace15: 'Music AI (ACE-Step 1.5)', singer: 'Singers', voicechange: 'Voice exchange', aiinst: 'AI instruments',
}
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function SetupWizard({ status, onClose, onFinish }: { status: EngineStatus; onClose: () => void; onFinish: (view: 'create' | 'timeline') => void }): React.ReactElement {
  const [step, setStep] = useState<Step>('check')
  const [pkg, setPkg] = useState<PackageId>('recommended')
  const [log, setLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [sub, setSub] = useState(0)                         // progress inside the current step (0..1), from download bars
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(0)
  const [now, setNow] = useState(Date.now())
  const logEnd = useRef<HTMLDivElement>(null)
  const gpu = status.gpu === 'nvidia'
  const chosen = PACKAGES.find((p) => p.id === pkg)!
  const needGb = (gpu ? chosen.gbGpu : chosen.gbCpu) + (status.pythonOk ? 0 : 0.2)
  const free = status.diskFreeGb ?? null
  const tooLittle = free !== null && chosen.groups.length > 0 && free < needGb + 3
  const steps = [...(status.pythonOk ? [] : ['python']), ...ORDER.filter((g) => chosen.groups.includes(g))]
  const idx = current ? Math.max(0, steps.indexOf(current)) : 0
  const pct = step === 'done' ? 100 : steps.length ? Math.min(99, Math.round(((idx + Math.min(1, sub)) / steps.length) * 100)) : 0
  const elapsed = started ? (now - started) / 1000 : 0
  const remain = pct > 3 && started ? (elapsed / pct) * (100 - pct) : null

  useEffect(() => { if (step !== 'install') return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [step])
  useEffect(() => { if (showLog) logEnd.current?.scrollIntoView({ block: 'end' }) }, [log, showLog])

  const install = async (): Promise<void> => {
    setStep('install'); setError(null); setLog([]); setStarted(Date.now()); setCurrent(steps[0] ?? null); setSub(0)
    const off = window.api.engines.onLog?.((line: string) => {
      setLog((l) => [...l.slice(-400), line])
      const m = /^=== (\w+)/.exec(line)
      if (m && ORDER.includes(m[1])) { setCurrent(m[1]); setSub(0); return }
      if (/^Step: setting up Python/.test(line)) { setCurrent('python'); setSub(0); return }
      const p = /(\d{1,3})%\|/.exec(line)
      if (p) setSub(Number(p[1]) / 100)
      const mb = /([\d.]+)\/([\d.]+) ([MG])B/.exec(line)
      if (mb && Number(mb[2]) > 0) setSub(Number(mb[1]) / Number(mb[2]))
    })
    try {
      const r = await window.api.engines.install(chosen.groups, gpu ? 'cuda' : 'cpu')
      if (r.ok) { setStep('done'); try { localStorage.setItem('ams-setup-done', '1') } catch { /* storage */ } }
      else setError(r.error ?? tr('It did not work.'))
    } catch (e) { setError((e as Error).message) }
    off?.()
  }

  const rail: Array<[Step, string]> = [['check', 'Your computer'], ['package', 'Package'], ['install', 'Installation'], ['done', 'Ready']]
  const order: Step[] = ['check', 'package', 'install', 'done']
  const row = (label: string, value: React.ReactNode, ok: boolean | null): React.ReactElement => (
    <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 22px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr(label)}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{value}</span>
      <span style={{ fontSize: 14, color: ok === null ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--yellow)' }}>{ok === null ? '•' : ok ? '✓' : '!'}</span>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9850, background: 'rgba(3,6,10,0.82)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(920px, 100%)', height: 'min(600px, 100%)', display: 'grid', gridTemplateColumns: '230px 1fr', background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        {/* the steps */}
        <div style={{ background: 'linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))', borderRight: '1px solid var(--border)', padding: '26px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>AI Music Studio</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 22 }}>{tr('Setup')}</div>
          {rail.map(([id, label], i) => {
            const pos = order.indexOf(step), mine = order.indexOf(id)
            const done = mine < pos, active = mine === pos
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 8, background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent' }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--bg-tertiary)', color: done || active ? '#fff' : 'var(--text-muted)', border: done || active ? 'none' : '1px solid var(--border-mid)' }}>{done ? '✓' : i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--text-primary)' : done ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{tr(label)}</span>
              </div>
            )
          })}
          <span style={{ flex: 1 }} />
          {step !== 'install' && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>{tr('Set up later')}</button>}
        </div>

        {/* the page of the step */}
        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'auto' }}>
          {step === 'check' && (
            <>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Welcome to AI Music Studio')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.55 }}>{tr('The app gets itself ready in a few minutes. First, what this computer brings along:')}</div>
              </div>
              <div>
                {row('Graphics card', status.gpu === 'nvidia' ? tr('NVIDIA: the AI runs on the graphics card (fast)') : status.gpu === 'amd' ? tr('AMD: the AI runs on the processor, some parts on the graphics card') : tr('None found: the AI runs on the processor (slower, but it works)'), status.gpu === 'nvidia' ? true : null)}
                {row('Processor', status.cpu || '—', null)}
                {row('Memory', status.ramGb ? `${status.ramGb} GB RAM${status.ramGb < 12 ? ` · ${tr('little for the music AI; the rest runs fine')}` : ''}` : '—', status.ramGb ? status.ramGb >= 12 : null)}
                {row('Free space', free !== null ? `${free} GB` : '—', free !== null ? free >= 15 : null)}
                {row('Python', status.pythonOk ? trf('Python {v} is there', { v: status.pythonVersion ?? '' }) : status.pythonFound ? trf('Python {v} is too new for the AI: the app sets up its own Python 3.11 (nothing to do)', { v: status.pythonVersion ?? '' }) : tr('Not installed: the app sets up its own Python 3.11 (nothing to do)'), status.pythonOk ? true : null)}
              </div>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13.5 }} onClick={() => setStep('package')}>{tr('Next')} →</button>
              </div>
            </>
          )}

          {step === 'package' && (
            <>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Choose what to install')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{tr('Everything can be added or removed later in Settings → AI Engines.')}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {PACKAGES.map((p) => {
                  const on = pkg === p.id
                  const gb = gpu ? p.gbGpu : p.gbCpu
                  return (
                    <button key={p.id} onClick={() => setPkg(p.id)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
                      background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))' : 'var(--bg-secondary)', border: `2px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{tr(p.title)}</span>
                        {p.id === 'recommended' && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{tr('Best start')}</span>}
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45, minHeight: 66 }}>{tr(p.text)}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {p.features.map((f) => <span key={f} style={{ fontSize: 11.5, color: 'var(--text-primary)' }}><span style={{ color: 'var(--green)' }}>✓</span> {tr(f)}</span>)}
                      </div>
                      <span style={{ marginTop: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{gb ? trf('about {gb} GB', { gb }) : tr('nothing to download')}</span>
                    </button>
                  )
                })}
              </div>
              {tooLittle && (
                <div style={{ fontSize: 12.5, color: 'var(--yellow)', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.35)', borderRadius: 8, padding: '9px 12px' }}>
                  {trf('Only {free} GB are free on this drive, about {need} GB are needed. Free some space, or choose a smaller package.', { free: free ?? 0, need: Math.ceil(needGb + 3) })}
                </div>
              )}
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn btn-ghost" onClick={() => setStep('check')}>← {tr('Back')}</button>
                {chosen.groups.length
                  ? <button className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13.5 }} disabled={tooLittle} onClick={() => void install()}>{tr('Install now')}</button>
                  : <button className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13.5 }} onClick={() => { try { localStorage.setItem('ams-setup-done', '1') } catch { /* storage */ } setStep('done') }}>{tr('Start without AI')}</button>}
              </div>
            </>
          )}

          {step === 'install' && (
            <>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{error ? tr('The installation stopped') : tr('Installing…')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{tr('The app keeps working on its own; you can leave it open. Finished parts stay if it is interrupted.')}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{pct}%</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{current ? trf('Step {n} of {total}: {name}', { n: idx + 1, total: steps.length, name: tr(NAMES[current] ?? current) }) : ''}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{clock(elapsed)}{remain !== null && !error ? ` · ${trf('about {t} left', { t: clock(remain) })}` : ''}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: error ? 'var(--red)' : 'linear-gradient(90deg, var(--accent), var(--accent-light))', transition: 'width 0.6s' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {steps.map((s, i) => (
                    <span key={s} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: '1px solid var(--border-mid)',
                      background: i < idx ? 'color-mix(in srgb, var(--green) 18%, transparent)' : i === idx ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'transparent',
                      color: i <= idx ? 'var(--text-primary)' : 'var(--text-muted)' }}>{i < idx ? '✓ ' : ''}{tr(NAMES[s] ?? s)}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.at(-1) ?? ''}</div>
              </div>
              {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowLog(!showLog)}>{showLog ? tr('Hide details') : tr('Show details')}</button>
                <span style={{ flex: 1 }} />
                {error
                  ? <><button className="btn btn-ghost" onClick={onClose}>{tr('Close')}</button><button className="btn btn-primary" onClick={() => void install()}>{tr('Try again')}</button></>
                  : <button className="btn btn-ghost" onClick={() => void window.api.engines.cancel()}>{tr('Cancel')}</button>}
              </div>
              {showLog && (
                <div style={{ flex: 1, minHeight: 120, overflow: 'auto', background: '#05080c', border: '1px solid #1f2a37', borderRadius: 8, padding: 10, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, color: '#9fb3c8', whiteSpace: 'pre-wrap' }}>
                  {log.join('\n')}<div ref={logEnd} />
                </div>
              )}
            </>
          )}

          {step === 'done' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, marginTop: 30 }}>
                <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>✓</span>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{tr('Ready')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.55 }}>
                  {chosen.groups.length ? tr('Everything is installed. The AI backend starts in the background; the first use of a model may download it once.') : tr('The Studio is ready. AI engines can be installed any time in Settings → AI Engines.')}
                </div>
              </div>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                {chosen.groups.includes('ace15') && <button className="btn btn-primary" style={{ padding: '9px 20px' }} onClick={() => onFinish('create')}>✦ {tr('Create music')}</button>}
                <button className={`btn ${chosen.groups.includes('ace15') ? 'btn-ghost' : 'btn-primary'}`} style={{ padding: '9px 20px' }} onClick={() => onFinish('timeline')}>{tr('Start in the Studio')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
