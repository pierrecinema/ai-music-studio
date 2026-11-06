import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import { getStatus, installGroups, cancelInstall } from './engines'
import { listLoras, importLora, removeLora, LORA_DIR, type LoraEntry } from './loras'
import { downloadFile, listFiles, parseRepo, searchRepos } from './huggingface'
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

  ipcMain.handle('loras:list', () => listLoras())
  ipcMain.handle('loras:import', (_, src: string, kind: LoraEntry['kind'], name?: string) => {
    try {
      return { ok: true as const, lora: importLora(src, kind, name) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
  ipcMain.handle('loras:remove', (_, id: string) => removeLora(id))

  // Hugging Face: search, list weight files, download into the LoRA folder (one download at a time)
  let hfAbort: AbortController | null = null
  ipcMain.handle('hf:search', async (_, query: string) => {
    try {
      const repo = parseRepo(query)
      if (repo) return { ok: true as const, repos: [(await listFiles(repo)).repo] }
      return { ok: true as const, repos: await searchRepos(query) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
  ipcMain.handle('hf:files', async (_, repo: string) => {
    try {
      return { ok: true as const, ...(await listFiles(repo)) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
  ipcMain.handle('hf:download', async (e, repo: string, file: string, kind: LoraEntry['kind']) => {
    if (hfAbort) return { ok: false as const, error: 'Another download is already running.' }
    hfAbort = new AbortController()
    try {
      const info = await listFiles(repo, hfAbort.signal)
      const path = await downloadFile(
        repo, file, LORA_DIR,
        (received, total) => e.sender.send('hf:progress', { received, total }),
        hfAbort.signal
      )
      const stem = repo.split('/')[1]
      const lora = importLora(path, kind, stem, { source: `huggingface:${repo}`, license: info.repo.license })
      return { ok: true as const, lora }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    } finally {
      hfAbort = null
    }
  })
  ipcMain.handle('hf:cancel', () => hfAbort?.abort())
  ipcMain.handle('shell:open-url', (_, url: string) => {
    // only Hugging Face pages, never an arbitrary address from the page
    if (/^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/?$/.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('dialog:open-lora', async (_, mode: 'file' | 'folder') => {
    const result = await dialog.showOpenDialog(
      mode === 'folder'
        ? { properties: ['openDirectory'] }
        : { filters: [{ name: 'LoRA', extensions: ['safetensors', 'pt', 'bin'] }], properties: ['openFile'] }
    )
    return result.filePaths[0] ?? null
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
