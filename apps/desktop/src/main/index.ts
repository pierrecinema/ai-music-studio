import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { setupUpdater } from './updater'
import { registerFileHandlers, setupCrashLog } from './files-ipc'

let mainWindow: BrowserWindow | null = null
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
    if (!mainWindow) return
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

  void serverManager.start()

  createWindow()

  if (mainWindow) setupUpdater(mainWindow, () => serverManager.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await serverManager.stop()
  if (process.platform !== 'darwin') app.quit()
})
