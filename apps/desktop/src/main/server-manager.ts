import { ChildProcess, spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { createServer } from 'net'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { hasVenv, venvPython, serverDir } from './engines'

export const DEFAULT_PORT = 38765

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
      env: { ...process.env, AMS_PORT: String(this.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    this.process.stdout?.on('data', (d) => console.log('[Server]', d.toString().trim()))
    this.process.stderr?.on('data', (d) => console.error('[Server]', d.toString().trim()))
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
