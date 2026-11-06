import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { setupUpdater } from './updater'

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.aimusic.studio')

  // The default Electron menu owns accelerators such as Ctrl+M (minimize) and the Edit/View
  // roles, which would swallow DAW shortcuts before the page sees them.
  Menu.setApplicationMenu(null)
  console.log(`[app] application menu removed: ${Menu.getApplicationMenu() === null}`)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers(serverManager)

  void serverManager.start()

  createWindow()

  if (mainWindow) setupUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await serverManager.stop()
  if (process.platform !== 'darwin') app.quit()
})
