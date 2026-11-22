import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { setupUpdater } from './updater'
import { registerFileHandlers, setupCrashLog } from './files-ipc'
import { registerPluginHostHandlers, stopPluginHost } from './plugin-host'
import { registerFreePluginHandlers } from './free-plugins'
import { registerSoundPackHandlers } from './sound-pack'
import { registerPluginPresetHandlers } from './plugin-presets'

let mainWindow: BrowserWindow | null = null
// Closing the window first asks the page whether the project has unsaved changes (Save / Don't save / Cancel).
// A quit started by the app itself (update install) closes without asking.
let allowClose = false
const serverManager = new ServerManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f0f0f',
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#ffffff',
      height: 32
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // the window is gone: forget it, so a later start of the app opens a new one instead of showing nothing
  mainWindow.on('closed', () => { mainWindow = null })
  // the page crashed (blank window): load it again instead of leaving an empty window
  mainWindow.webContents.on('render-process-gone', (_e, d) => {
    console.error(`[app] the page stopped (${d.reason}); loading it again`)
    if (d.reason === 'clean-exit') return
    setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload() }, 500)
  })

  mainWindow.on('close', (e) => {
    const w = mainWindow
    if (allowClose || !w || w.webContents.isCrashed() || w.webContents.isLoading()) return
    e.preventDefault()
    w.webContents.send('app:close-request')
  })

  // back from a plugin window or another program: the page gets the keyboard (text fields typed nothing otherwise)
  mainWindow.on('focus', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.focus() })
  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Right-click on text: Copy / Cut / Paste / Select all. The app menu is removed (it owned shortcuts the
  // Studio needs), and Electron shows no context menu by itself, so log texts could not be copied at all.
  // The Studio's own right-click menus (tracks, clips) prevent this event, so they are not doubled.
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      items.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' })
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow! })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

setupCrashLog()

// One app at a time: a second start (double-click again, start menu) only brings the open window to the front.
// Before, every start ran its own AI backend on the next port, so splits and songs waited on each other.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // the app was still running without a window (it had not quit completely): open the window again
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (app.isReady()) { allowClose = false; if (!serverManager.isReady()) void serverManager.start(); createWindow() }
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

app.whenReady().then(async () => {
  registerFileHandlers()
  electronApp.setAppUserModelId('com.aimusic.studio')

  // The default Electron menu owns accelerators such as Ctrl+M (minimize) and the Edit/View
  // roles, which would swallow DAW shortcuts before the page sees them.
  Menu.setApplicationMenu(null)
  console.log(`[app] application menu removed: ${Menu.getApplicationMenu() === null}`)

  // The toolkit's shortcut helper swallows Ctrl+R (and Ctrl+Shift+R) in the installed app to stop a page reload,
  // so the record and export shortcuts never reached the page. Without the application menu Ctrl+R reloads
  // nothing anyway: the helper is only used while developing (F12 opens the DevTools there).
  if (is.dev) {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  }

  registerIpcHandlers(serverManager)
  registerPluginHostHandlers()
  registerFreePluginHandlers()
  registerSoundPackHandlers()
  registerPluginPresetHandlers()
  ipcMain.handle('app:close-confirmed', () => { allowClose = true; mainWindow?.close() })
  // Windows: after a message box (alert / confirm) or a plugin window, text fields of the page took no more typing
  // until the window was left and entered again. Blur and focus the window to give the page the keyboard back.
  ipcMain.handle('app:refocus', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.blur(); mainWindow.focus(); mainWindow.webContents.focus()
  })
  app.on('before-quit', () => { allowClose = true })

  void serverManager.start()

  createWindow()

  if (mainWindow) setupUpdater(mainWindow, () => serverManager.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Closing the window ends the app completely: the AI backend and the plugin host are stopped (waiting at most a few
// seconds for them), then the app quits; if anything still holds it, it is ended for sure. Before, an app left
// running in the background (seen in the Task Manager) kept the next start from opening any window.
app.on('window-all-closed', async () => {
  if (process.platform === 'darwin') { await serverManager.stop(); return }
  const hard = setTimeout(() => app.exit(0), 8000)
  hard.unref?.()
  try { stopPluginHost() } catch { /* already gone */ }
  await Promise.race([serverManager.stop().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))])
  app.quit()
})
