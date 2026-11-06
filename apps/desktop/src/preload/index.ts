import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  server: {
    getUrl: () => ipcRenderer.invoke('server:url'),
    isReady: () => ipcRenderer.invoke('server:ready')
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
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
}

export type API = typeof api
