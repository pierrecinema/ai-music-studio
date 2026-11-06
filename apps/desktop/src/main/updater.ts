import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false   // ask user first
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

  autoUpdater.on('error', (err) => send('update:error', err?.message))

  // IPC from renderer
  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())

  // Auto-check 5 s after launch, then every 4 h
  setTimeout(() => autoUpdater.checkForUpdates(), 5000)
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}
