// Files of the DAW: projects, autosave, recordings, export, feedback and the crash log.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { execFile } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'

const FEEDBACK_URL = 'https://github.com/pierrecinema/ai-music-studio/issues/new'

export function crashLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'crash.log')
}

export function logCrash(source: string, message: string): void {
  try {
    const p = crashLogPath()
    mkdirSync(dirname(p), { recursive: true })
    if (existsSync(p) && statSync(p).size > 1024 * 1024) renameSync(p, p + '.old')
    appendFileSync(p, `[${new Date().toISOString()}] [${source}] v${app.getVersion()} ${message}\n`)
  } catch { /* logging must never crash the app */ }
}

// errors in the main process end up in the same file
export function setupCrashLog(): void {
  process.on('uncaughtException', (e) => logCrash('main', `uncaughtException: ${e.stack ?? e.message}`))
  process.on('unhandledRejection', (e) => logCrash('main', `unhandledRejection: ${(e as Error)?.stack ?? String(e)}`))
}

function win(e: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

const autosavePath = (): string => join(app.getPath('userData'), 'autosave.ams')

export function registerFileHandlers(): void {
  // ── projects ────────────────────────────────────────────────────────────────
  ipcMain.handle('project:open-dialog', async (e) => {
    const options = { filters: [{ name: 'AI Music Studio Project', extensions: ['ams'] }], properties: ['openFile' as const] }
    const w = win(e)
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    const path = r.filePaths[0]
    if (!path) return null
    return { path, text: readFileSync(path, 'utf-8') }
  })
  ipcMain.handle('project:read', (_, path: string) => readFileSync(path, 'utf-8'))
  ipcMain.handle('project:save-dialog', async (e, defaultName: string) => {
    const options = { defaultPath: defaultName, filters: [{ name: 'AI Music Studio Project', extensions: ['ams'] }] }
    const w = win(e)
    const r = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options)
    if (!r.filePath) return null
    return r.filePath.toLowerCase().endsWith('.ams') ? r.filePath : `${r.filePath}.ams`
  })
  ipcMain.handle('project:write', (_, path: string, text: string) => {
    // write to a temporary file first: a crash in the middle must not destroy the old project
    const tmp = `${path}.tmp`
    writeFileSync(tmp, text, 'utf-8')
    renameSync(tmp, path)
  })
  ipcMain.handle('project:autosave-write', (_, text: string) => { writeFileSync(autosavePath(), text, 'utf-8') })
  ipcMain.handle('project:autosave-read', () => {
    const p = autosavePath()
    if (!existsSync(p)) return null
    return { text: readFileSync(p, 'utf-8'), mtime: statSync(p).mtimeMs }
  })
  ipcMain.handle('project:autosave-clear', () => { try { unlinkSync(autosavePath()) } catch { /* none */ } })

  ipcMain.handle('files:exists', (_, paths: string[]) => paths.map((p) => existsSync(p)))
  ipcMain.handle('files:save-recording', (_, bytes: Uint8Array) => {
    const dir = join(app.getPath('userData'), 'recordings')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const path = join(dir, `rec-${stamp}.wav`)
    writeFileSync(path, Buffer.from(bytes))
    return path
  })
  ipcMain.handle('files:show-item', (_, path: string) => { shell.showItemInFolder(path) })

  // ── export ──────────────────────────────────────────────────────────────────
  ipcMain.handle('export:save-dialog', async (e, defaultName: string, ext: 'wav' | 'mp3') => {
    const options = { defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }
    const w = win(e)
    const r = w ? await dialog.showSaveDialog(w, options) : await dialog.showSaveDialog(options)
    if (!r.filePath) return null
    return r.filePath.toLowerCase().endsWith(`.${ext}`) ? r.filePath : `${r.filePath}.${ext}`
  })
  ipcMain.handle('export:write', (_, path: string, bytes: Uint8Array) => { writeFileSync(path, Buffer.from(bytes)) })
  ipcMain.handle('export:mp3', (_, bytes: Uint8Array, outPath: string, kbps: number) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const tmp = join(tmpdir(), `ams-export-${Date.now()}.wav`)
      writeFileSync(tmp, Buffer.from(bytes))
      execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, outPath],
        { windowsHide: true }, (err, _o, stderr) => {
          try { unlinkSync(tmp) } catch { /* gone */ }
          if (err) {
            const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
            resolve({ ok: false, error: missing ? 'ffmpeg was not found on this computer.' : (stderr || err.message).slice(-300) })
          } else resolve({ ok: true })
        })
    })
  )

  // ── feedback and crash log ──────────────────────────────────────────────────
  ipcMain.handle('log:renderer', (_, message: string) => { logCrash('renderer', String(message).slice(0, 4000)) })
  ipcMain.handle('log:crash-tail', () => {
    try {
      const lines = readFileSync(crashLogPath(), 'utf-8').split(/\r?\n/).filter(Boolean)
      return lines.slice(-25).join('\n')
    } catch { return '' }
  })
  ipcMain.handle('app:open-feedback', () => { void shell.openExternal(FEEDBACK_URL) })
  ipcMain.handle('app:show-crash-log', () => { shell.showItemInFolder(crashLogPath()) })
  ipcMain.handle('app:basename', (_, p: string) => basename(p))
}
