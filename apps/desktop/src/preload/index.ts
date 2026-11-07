import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  server: {
    getUrl: () => ipcRenderer.invoke('server:url'),
    isReady: () => ipcRenderer.invoke('server:ready'),
    showLog: () => ipcRenderer.invoke('server:show-log'),
    logTail: () => ipcRenderer.invoke('server:log-tail')
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
  loras: {
    list: () => ipcRenderer.invoke('loras:list'),
    import: (src: string, kind: string, name?: string) => ipcRenderer.invoke('loras:import', src, kind, name),
    remove: (id: string) => ipcRenderer.invoke('loras:remove', id),
    pick: (mode: 'file' | 'folder') => ipcRenderer.invoke('dialog:open-lora', mode)
  },
  models: {
    overview: () => ipcRenderer.invoke('models:overview'),
    pickDir: () => ipcRenderer.invoke('models:pick-dir'),
    space: (path: string) => ipcRenderer.invoke('models:space', path),
    open: (which: 'models' | 'loras') => ipcRenderer.invoke('models:open', which),
    move: (newBase: string, move: boolean) => ipcRenderer.invoke('models:move', newBase, move),
    cancelMove: () => ipcRenderer.invoke('models:cancel-move'),
    delete: (id: string) => ipcRenderer.invoke('models:delete', id),
    deleteLora: (id: string) => ipcRenderer.invoke('models:delete-lora', id),
    clearCache: (id: string) => ipcRenderer.invoke('models:clear-cache', id),
    onProgress: (cb: (p: { copied: number; total: number; phase: string }) => void) => {
      const h = (_: unknown, p: { copied: number; total: number; phase: string }) => cb(p)
      ipcRenderer.on('models:progress', h)
      return () => ipcRenderer.removeListener('models:progress', h)
    }
  },
  huggingface: {
    search: (query: string) => ipcRenderer.invoke('hf:search', query),
    files: (repo: string) => ipcRenderer.invoke('hf:files', repo),
    download: (repo: string, file: string, kind: string) => ipcRenderer.invoke('hf:download', repo, file, kind),
    cancel: () => ipcRenderer.invoke('hf:cancel'),
    openPage: (repo: string) => ipcRenderer.invoke('shell:open-url', `https://huggingface.co/${repo}`),
    onProgress: (cb: (p: { received: number; total: number }) => void) => {
      const h = (_: unknown, p: { received: number; total: number }) => cb(p)
      ipcRenderer.on('hf:progress', h)
      return () => ipcRenderer.removeListener('hf:progress', h)
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
