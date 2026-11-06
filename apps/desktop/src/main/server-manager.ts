import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { hasVenv, venvPython, serverDir } from './engines'

export class ServerManager {
  private process: ChildProcess | null = null
  private port = 8765
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
