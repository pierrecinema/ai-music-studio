import { ChildProcess, spawn } from 'child_process'
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
    this.process.on('exit', () => { this.ready = false; this.process = null })

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

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.ready = false
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  isReady(): boolean {
    return this.ready
  }
}
