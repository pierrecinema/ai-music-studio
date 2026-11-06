import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false   // ask user first
autoUpdater.allowPrerelease = true
autoUpdater.autoInstallOnAppQuit = true

export function setupUpdater(win: BrowserWindow): void {
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
    if (manualCheck) send('update:error', err?.message)
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
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())

  // Auto-check 5 s after launch, then every 4 h
  setTimeout(() => void check(false), 5000)
  setInterval(() => void check(false), 4 * 60 * 60 * 1000)
}
