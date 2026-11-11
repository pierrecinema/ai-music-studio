// The detailed log for beta testers. While it is on, console output (log, info, warn, error), uncaught
// errors, every keyboard/menu action and every request to the AI backend are written to diag.log
// (through the main process). The tester then copies or saves the log in Feedback and sends it to us.
let on = false
let buffer: string[] = []
let timer = 0
let installed = false

const stamp = (): string => new Date().toISOString().slice(11, 23)

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack ?? v.message
  try { return JSON.stringify(v)?.slice(0, 2000) ?? String(v) } catch { return String(v) }
}

export function diagWrite(kind: string, ...parts: unknown[]): void {
  if (!on) return
  buffer.push(`${stamp()} [${kind}] ${parts.map(str).join(' ')}`.slice(0, 4000))
  if (!timer) timer = window.setTimeout(flush, 1500)
}

function flush(): void {
  timer = 0
  if (!buffer.length) return
  const text = buffer.join('\n')
  buffer = []
  void window.api?.diag?.append(text).catch(() => { /* main process busy */ })
}

function install(): void {
  if (installed) return
  installed = true
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => { diagWrite(level, ...args); original(...args) }
  }
  window.addEventListener('error', (e) => diagWrite('error', `${e.message} at ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => diagWrite('error', 'unhandled rejection:', e.reason))
  // requests to the backend: what was asked, how it ended and how long it took
  const origFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const quiet = /\/(jobs\/|system\/usage|library$)/.test(url)          // polled every second: too chatty
    const t0 = performance.now()
    if (!quiet) diagWrite('fetch', method, url, typeof init?.body === 'string' ? init.body.slice(0, 1500) : '')
    try {
      const r = await origFetch(input, init)
      if (!quiet || !r.ok) diagWrite('fetch', method, url, '→', r.status, `${Math.round(performance.now() - t0)} ms`)
      return r
    } catch (e) {
      diagWrite('fetch', method, url, '→ failed:', e)
      throw e
    }
  }
}

export async function initDiagLog(): Promise<void> {
  try { on = !!(await window.api?.diag?.get()) } catch { on = false }
  install()
  if (on) diagWrite('app', `started v${__APP_VERSION__}`, navigator.userAgent)
}

export function diagIsOn(): boolean {
  return on
}

export async function setDiag(value: boolean): Promise<boolean> {
  try { on = !!(await window.api.diag.set(value)) } catch { on = false }
  if (on) diagWrite('app', `detailed log on, v${__APP_VERSION__}`, navigator.userAgent)
  return on
}

export function flushDiag(): void {
  if (timer) { window.clearTimeout(timer); timer = 0 }
  flush()
}
