import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import { ServerManager, backendLogPath } from './server-manager'
import { getStatus, installGroups, cancelInstall } from './engines'
import { listLoras, importLora, removeLora, deleteLora, LORA_DIR, type LoraEntry } from './loras'
import { clearCache, deleteModel, diskSpace, getOverview, moveModels } from './models'
import { MODEL_SUBDIRS, modelsDir, writeSettings, type ModelId } from './settings'
import { resolve } from 'path'
import { downloadFile, listFiles, parseRepo, searchRepos } from './huggingface'
import * as fs from 'fs'

// A dialog without a parent window can open behind the app on Windows and look like a hang.
function openDialog(e: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function registerIpcHandlers(serverManager: ServerManager): void {
  ipcMain.handle('server:url', () => serverManager.serverUrl)
  ipcMain.handle('server:ready', () => serverManager.isReady())
  // the end of the backend log without the polling noise, for "Copy diagnostics"
  ipcMain.handle('server:log-tail', () => {
    try {
      const raw = fs.readFileSync(backendLogPath(), 'utf-8')
      const lines = raw.split(/\r?\n/).filter((l) => l && !/"(GET|POST) \/(music\/jobs|system\/usage|health)/.test(l))
      return lines.slice(-80).join('\n')
    } catch { return '(no backend log yet)' }
  })
  ipcMain.handle('server:show-log', () => { shell.showItemInFolder(backendLogPath()) })

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

  ipcMain.handle('dialog:open-audio', async (e) => {
    const result = await openDialog(e, {
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

  // Models and storage: overview, change folder (optionally moving the files), delete
  let moving = false
  let moveCancelled = false
  ipcMain.handle('models:overview', () => getOverview())
  ipcMain.handle('models:pick-dir', async (e) => {
    const r = await openDialog(e, { properties: ['openDirectory', 'createDirectory'] })
    return r.filePaths[0] ?? null
  })
  ipcMain.handle('models:space', (_, path: string) => diskSpace(path))
  ipcMain.handle('models:open', (_, which: 'models' | 'loras') => {
    void shell.openPath(which === 'loras' ? LORA_DIR : modelsDir())
  })
  ipcMain.handle('models:move', async (e, newBase: string, move: boolean) => {
    if (moving) return { ok: false as const, error: 'A move is already running.' }
    moving = true
    moveCancelled = false
    try {
      await serverManager.stop()          // files must not be in use while they move
      if (move) {
        await moveModels(newBase, (p) => e.sender.send('models:progress', p), () => moveCancelled)
      } else {
        fs.mkdirSync(newBase, { recursive: true })
        writeSettings({ modelsDir: resolve(newBase) })
      }
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    } finally {
      moving = false
      void serverManager.start()          // comes back with the (new or unchanged) folder
    }
  })
  ipcMain.handle('models:cancel-move', () => { moveCancelled = true })
  ipcMain.handle('models:delete', async (_, id: string) => {
    if (!(id in MODEL_SUBDIRS)) return { ok: false as const, error: 'Unknown model.' }
    try {
      await serverManager.stop()
      deleteModel(id as ModelId)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    } finally {
      void serverManager.start()
    }
  })
  ipcMain.handle('models:clear-cache', async (_, id: string) => {
    try { return { ok: true as const, freed: await clearCache(id) } } catch (err) { return { ok: false as const, error: (err as Error).message } }
  })
  ipcMain.handle('models:delete-lora', (_, id: string) => {
    try { deleteLora(id); return { ok: true as const } } catch (err) { return { ok: false as const, error: (err as Error).message } }
  })

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
  // the project's own GitHub pages (About, star, issues, releases): nothing else
  ipcMain.handle('shell:open-project', (_, page: string) => {
    const pages: Record<string, string> = {
      home: '', releases: '/releases', issues: '/issues', newIssue: '/issues/new', discussions: '/discussions'
    }
    if (page in pages) void shell.openExternal(`https://github.com/pierrecinema/ai-music-studio${pages[page]}`)
  })
  ipcMain.handle('dialog:open-lora', async (e, mode: 'file' | 'folder') => {
    const result = await openDialog(
      e,
      mode === 'folder'
        ? { properties: ['openDirectory'] }
        : { filters: [{ name: 'LoRA', extensions: ['safetensors', 'pt', 'bin'] }], properties: ['openFile'] }
    )
    return result.filePaths[0] ?? null
  })

  // a folder to export into (stems, loops: one file each)
  ipcMain.handle('dialog:pick-folder', async (e, title?: string) => {
    const result = await openDialog(e, { title: title || 'Choose a folder', properties: ['openDirectory', 'createDirectory'] })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:open-video', async (e) => {
    const result = await openDialog(e, {
      filters: [
        { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }
      ],
      properties: ['openFile']
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:save', async (e, defaultName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = {
      defaultPath: defaultName,
      filters: [
        { name: 'AI Music Studio Project', extensions: ['ams'] },
        { name: 'Audio', extensions: ['wav', 'mp3'] }
      ]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    return result.filePath ?? null
  })

  ipcMain.handle('fs:read-file', async (_, path: string) => {
    return fs.readFileSync(path)
  })

  ipcMain.handle('shell:open-path', async (_, path: string) => {
    shell.openPath(path)
  })
}
