import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import { getStatus, installGroups, cancelInstall } from './engines'
import * as fs from 'fs'

export function registerIpcHandlers(serverManager: ServerManager): void {
  ipcMain.handle('server:url', () => serverManager.serverUrl)
  ipcMain.handle('server:ready', () => serverManager.isReady())

  ipcMain.handle('engines:status', () => getStatus(serverManager.isReady()))
  ipcMain.handle('engines:cancel', () => cancelInstall())
  ipcMain.handle('engines:install', async (e, groups: string[], torchVariant: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const log = (line: string) => win?.webContents.send('engines:log', line)
    await serverManager.stop()
    const result = await installGroups(groups, torchVariant, log)
    log(result.ok ? 'Done. Restarting the AI backend…' : `Failed: ${result.error}`)
    await serverManager.start()
    return result
  })

  ipcMain.handle('dialog:open-audio', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aiff', 'm4a', 'ogg'] },
        { name: 'MIDI', extensions: ['mid', 'midi'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.filePaths
  })

  ipcMain.handle('dialog:open-video', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }
      ],
      properties: ['openFile']
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:save', async (_, defaultName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'AI Music Studio Project', extensions: ['ams'] },
        { name: 'Audio', extensions: ['wav', 'mp3'] }
      ]
    })
    return result.filePath ?? null
  })

  ipcMain.handle('fs:read-file', async (_, path: string) => {
    return fs.readFileSync(path)
  })

  ipcMain.handle('shell:open-path', async (_, path: string) => {
    shell.openPath(path)
  })
}
