import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

export class ServerManager {
  private process: ChildProcess | null = null
  private port = 8765
  private ready = false

  get serverUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<void> {
    const pythonPath = is.dev
      ? 'python'
      : join(process.resourcesPath, 'server', 'server.exe')

    const serverScript = is.dev
      ? join(app.getAppPath(), '../../server/main.py')
      : join(process.resourcesPath, 'server', 'main.py')

    const env = { ...process.env, AMS_PORT: String(this.port) }

    this.process = spawn(is.dev ? 'python' : pythonPath, [serverScript], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Application startup complete')) {
        this.ready = true
      }
      console.log('[Server]', msg.trim())
    })

    this.process.stderr?.on('data', (data) => {
      console.error('[Server]', data.toString().trim())
    })

    await this.waitForReady()
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ready) return resolve()
      const interval = setInterval(async () => {
        try {
          const r = await fetch(`${this.serverUrl}/health`)
          if (r.ok) {
            this.ready = true
            clearInterval(interval)
            resolve()
          }
        } catch {}
      }, 500)
      setTimeout(() => { clearInterval(interval); resolve() }, 15000)
    })
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  isReady(): boolean {
    return this.ready
  }
}
