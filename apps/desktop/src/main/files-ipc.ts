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

// ── diagnostic log for beta testers ───────────────────────────────────────────
// Switched on in Feedback → "Record a detailed log". Then the interface writes what it does (actions,
// warnings, errors) to diag.log. The tester copies or saves everything and sends it to us; nothing is
// sent automatically.
const diagPath = (): string => join(app.getPath('userData'), 'logs', 'diag.log')
const diagFlag = (): string => join(app.getPath('userData'), 'logs', 'diag.on')

export function diagEnabled(): boolean {
  return existsSync(diagFlag())
}

function diagAppend(text: string): void {
  if (!diagEnabled()) return
  try {
    const p = diagPath()
    mkdirSync(dirname(p), { recursive: true })
    if (existsSync(p) && statSync(p).size > 8 * 1024 * 1024) renameSync(p, p + '.old')
    appendFileSync(p, text.endsWith('\n') ? text : text + '\n')
  } catch { /* logging must never stop the app */ }
}

function tail(path: string, maxBytes: number): string {
  try {
    const t = readFileSync(path, 'utf-8')
    return t.length > maxBytes ? '…\n' + t.slice(-maxBytes) : t
  } catch { return '' }
}

function collectDiag(extra: string): string {
  const logs = join(app.getPath('userData'), 'logs')
  return [
    `AI Music Studio v${app.getVersion()} · ${process.platform} ${process.getSystemVersion?.() ?? ''} · ${new Date().toISOString()}`,
    `Detailed log: ${diagEnabled() ? 'on' : 'off'}`,
    '',
    extra,
    '',
    '== Interface log (diag.log) ==',
    tail(diagPath(), 1_500_000) || '(empty: switch on "Record a detailed log" and repeat what went wrong)',
    '',
    '== Errors (crash.log) ==',
    tail(join(logs, 'crash.log'), 200_000) || '(none)',
    '',
    '== Backend log (backend.log) ==',
    tail(join(logs, 'backend.log'), 1_000_000) || '(empty)',
  ].join('\n')
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
  ipcMain.handle('diag:get', () => diagEnabled())
  ipcMain.handle('diag:set', (_, on: boolean) => {
    try {
      mkdirSync(dirname(diagFlag()), { recursive: true })
      if (on) { writeFileSync(diagFlag(), new Date().toISOString()); diagAppend(`\n===== detailed log switched on ${new Date().toISOString()} (v${app.getVersion()}) =====`) }
      else if (existsSync(diagFlag())) unlinkSync(diagFlag())
    } catch { /* read-only profile: stays as it was */ }
    return diagEnabled()
  })
  ipcMain.handle('diag:append', (_, text: string) => diagAppend(String(text).slice(0, 200_000)))
  ipcMain.handle('diag:collect', (_, extra: string) => collectDiag(String(extra ?? '')))
  ipcMain.handle('diag:clear', () => {
    try { writeFileSync(diagPath(), '') } catch { /* nothing to clear */ }
  })
  ipcMain.handle('diag:save', async (e, text: string) => {
    const w = win(e)
    const name = `ai-music-studio-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
    const opts = { defaultPath: join(app.getPath('desktop'), name), filters: [{ name: 'Text', extensions: ['txt'] }] }
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, text, 'utf-8')
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })
  ipcMain.handle('app:open-feedback', () => { void shell.openExternal(FEEDBACK_URL) })
  ipcMain.handle('app:show-crash-log', () => { shell.showItemInFolder(crashLogPath()) })
  ipcMain.handle('app:basename', (_, p: string) => basename(p))
}
