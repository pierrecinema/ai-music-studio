import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  server: {
    getUrl: () => ipcRenderer.invoke('server:url'),
    isReady: () => ipcRenderer.invoke('server:ready')
  },
  engines: {
    status: () => ipcRenderer.invoke('engines:status'),
    install: (groups: string[], torchVariant: string) => ipcRenderer.invoke('engines:install', groups, torchVariant),
    cancel: () => ipcRenderer.invoke('engines:cancel'),
    onLog: (cb: (line: string) => void) => {
      const h = (_: unknown, line: string) => cb(line)
      ipcRenderer.on('engines:log', h)
      return () => ipcRenderer.removeListener('engines:log', h)
    }
  },
  dialog: {
    openAudio: () => ipcRenderer.invoke('dialog:open-audio'),
    openVideo: () => ipcRenderer.invoke('dialog:open-video'),
    save: (name: string) => ipcRenderer.invoke('dialog:save', name)
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path)
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onChecking: (cb: () => void) => ipcRenderer.on('update:checking', cb),
    onAvailable: (cb: (info: unknown) => void) => ipcRenderer.on('update:available', (_, i) => cb(i)),
    onNotAvailable: (cb: () => void) => ipcRenderer.on('update:not-available', cb),
    onProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) =>
      ipcRenderer.on('update:progress', (_, p) => cb(p)),
    onDownloaded: (cb: (info: unknown) => void) => ipcRenderer.on('update:downloaded', (_, i) => cb(i)),
    onError: (cb: (msg: string) => void) => ipcRenderer.on('update:error', (_, m) => cb(m))
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
}

export type API = typeof api
