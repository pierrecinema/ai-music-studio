import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false   // ask user first
autoUpdater.allowPrerelease = true
autoUpdater.autoInstallOnAppQuit = true

export function setupUpdater(win: BrowserWindow, stopBackend: () => Promise<void>): void {
  // Forward all update events to renderer
  const send = (event: string, data?: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(event, data)
  }

  autoUpdater.on('checking-for-update', () => send('update:checking'))

  autoUpdater.on('update-available', (info) => send('update:available', info))

  autoUpdater.on('update-not-available', () => send('update:not-available'))

  autoUpdater.on('download-progress', (p) =>
    send('update:progress', { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond })
  )

  autoUpdater.on('update-downloaded', (info) => send('update:downloaded', info))

  // Background checks must not pop up errors (offline, tag without a release yet, ...)
  let manualCheck = false
  autoUpdater.on('error', (err) => {
    if (!manualCheck) return
    const msg = err?.message ?? 'Unknown error'
    // GitHub knows the tag for ~2 minutes before the build has attached the installer
    const publishing = /latest\.yml/.test(msg) && /404/.test(msg)
    send('update:error', publishing
      ? 'A new version is being published right now. Please try again in a minute or two.'
      : msg.split('\n')[0].slice(0, 300))
  })

  const check = async (manual: boolean): Promise<void> => {
    manualCheck = manual
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      log.warn('update check failed', e)
    } finally {
      manualCheck = false
    }
  }

  // IPC from renderer (return only serialisable values)
  ipcMain.handle('updater:check', () => check(true))
  ipcMain.handle('updater:download', async () => { await autoUpdater.downloadUpdate() })
  // End the AI backend and its workers first: a Python process still running made the installer stop with
  // "please close AI Music Studio". The installer then starts the new version by itself.
  ipcMain.handle('updater:install', async () => {
    try { await stopBackend() } catch (e) { log.warn('stopping the backend before the update failed', e) }
    autoUpdater.quitAndInstall(false, true)
  })
  // the same when an update that was downloaded earlier is installed on quit
  app.on('before-quit-for-update', () => { void stopBackend() })

  // Auto-check 5 s after launch, then every 15 minutes (new versions come often; a check is one small request)
  setTimeout(() => void check(false), 5000)
  setInterval(() => void check(false), 15 * 60 * 1000)
}
