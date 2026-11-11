import { ChildProcess, spawn, execFile } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { createServer } from 'net'
import { dirname, join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { hasVenv, venvPython, serverDir, hasDml, dmlPython, hasDr, drPython, drRepo, hasAce15, ace15Python, ace15Repo, ace15Checkpoints } from './engines'
import { backendModelEnv } from './settings'

export const DEFAULT_PORT = 38765

export function backendLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'backend.log')
}

function canListen(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, host)
  })
}

// Another program (e.g. a web server) may already hold the port, on IPv4 or IPv6.
async function findFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 50; p++) {
    if (await canListen(p, '127.0.0.1') && await canListen(p)) return p
  }
  return start
}

export class ServerManager {
  private process: ChildProcess | null = null
  private port = DEFAULT_PORT
  private ready = false

  get serverUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  // In dev we fall back to the system Python so contributors need no setup step.
  private pythonExecutable(): string | null {
    if (hasVenv()) return venvPython()
    return is.dev ? 'python' : null
  }

  async start(): Promise<void> {
    this.stopping = false
    const python = this.pythonExecutable()
    if (!python) {
      console.warn('[Server] No Python environment yet — open Settings → AI Engines to set it up.')
      return
    }

    this.ready = false
    this.port = await findFreePort(DEFAULT_PORT)
    try {
      writeFileSync(join(app.getPath('userData'), 'server.json'), JSON.stringify({ port: this.port, url: this.serverUrl }))
    } catch { /* informational only */ }
    this.process = spawn(python, ['-u', join(serverDir(), 'main.py')], {
      cwd: serverDir(),
      // downloads (ACE-Step, Whisper, Demucs ...) go to the models folder chosen in Settings → Models
      env: { ...process.env, AMS_PORT: String(this.port), ...backendModelEnv(), ...(hasDml() ? { AMS_DML_PYTHON: dmlPython() } : {}), ...(hasDr() ? { AMS_DR_PYTHON: drPython(), AMS_DR_REPO: drRepo() } : {}), ...(hasAce15() ? { AMS_ACE15_PYTHON: ace15Python(), AMS_ACE15_REPO: ace15Repo(), AMS_ACE15_CKPT: ace15Checkpoints() } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    // keep the backend output in a file the user can open: errors during a long job must not vanish
    const log = backendLogPath()
    try {
      mkdirSync(dirname(log), { recursive: true })
      if (existsSync(log) && statSync(log).size > 5 * 1024 * 1024) renameSync(log, log + '.old')
      appendFileSync(log, `
===== backend start ${new Date().toISOString()} =====
`)
    } catch { /* logging must never stop the app */ }
    const sink = (d: Buffer): void => {
      try { appendFileSync(log, d.toString()) } catch { /* ignore */ }
    }
    this.process.stdout?.on('data', (d) => { sink(d); console.log('[Server]', d.toString().trim()) })
    this.process.stderr?.on('data', (d) => { sink(d); console.error('[Server]', d.toString().trim()) })
    this.process.on('error', (e) => console.error('[Server] failed to start:', e.message))
    const proc = this.process
    proc.on('exit', (code) => {
      if (this.process === proc) { this.ready = false; this.process = null }
      // The backend ends itself when a Cancel cannot stop the AI model in time (the model runs inside it):
      // start it again right away, so the app keeps working. Same after a crash, but at most 5 times a minute.
      if (this.stopping) return
      const now = Date.now()
      this.restarts = this.restarts.filter((t) => now - t < 60000)
      if (this.restarts.length >= 5) { console.error('[Server] stopped repeatedly; not restarting again'); return }
      this.restarts.push(now)
      console.warn(`[Server] exited (code ${code}); restarting`)
      setTimeout(() => { if (!this.process && !this.stopping) void this.start() }, 800)
    })

    await this.waitForReady()
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      const started = Date.now()
      const interval = setInterval(async () => {
        try {
          const r = await fetch(`${this.serverUrl}/health`)
          if (r.ok) {
            this.ready = true
            clearInterval(interval)
            resolve()
            return
          }
        } catch { /* not up yet */ }
        if (Date.now() - started > 20000 || !this.process) {
          clearInterval(interval)
          resolve()
        }
      }, 500)
    })
  }

  private stopping = false
  private restarts: number[] = []

  // Ends the backend AND everything it started (AI workers for DiffRhythm, ACE-Step 1.5, the graphics card).
  // A plain kill() leaves those running on Windows, which made the updater ask to close the app.
  async stop(): Promise<void> {
    this.stopping = true
    const proc = this.process
    this.process = null
    this.ready = false
    if (proc?.pid) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => resolve()))
      } else {
        proc.kill()
      }
    }
  }

  async restart(): Promise<void> {
    await this.stop()
    this.stopping = false
    await this.start()
  }

  isReady(): boolean {
    return this.ready
  }
}
