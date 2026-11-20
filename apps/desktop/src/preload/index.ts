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
    openImage: () => ipcRenderer.invoke('dialog:open-image'),
    pickFolder: (title?: string) => ipcRenderer.invoke('dialog:pick-folder', title),
    save: (name: string) => ipcRenderer.invoke('dialog:save', name)
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path)
  },
  sounds: {
    status: () => ipcRenderer.invoke('sounds:status'),
    install: () => ipcRenderer.invoke('sounds:install'),
    remove: () => ipcRenderer.invoke('sounds:remove'),
    onProgress: (cb: (p: { text: string; pct?: number }) => void) => {
      const h = (_: unknown, p: { text: string; pct?: number }): void => cb(p)
      ipcRenderer.on('sounds:progress', h)
      return () => { ipcRenderer.removeListener('sounds:progress', h) }
    }
  },
  shell: {
    openProject: (page: 'home' | 'releases' | 'issues' | 'newIssue' | 'discussions' | 'donate') => ipcRenderer.invoke('shell:open-project', page),
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },
  project: {
    openDialog: () => ipcRenderer.invoke('project:open-dialog'),
    read: (path: string) => ipcRenderer.invoke('project:read', path),
    saveDialog: (name: string) => ipcRenderer.invoke('project:save-dialog', name),
    write: (path: string, text: string) => ipcRenderer.invoke('project:write', path, text),
    autosaveWrite: (text: string) => ipcRenderer.invoke('project:autosave-write', text),
    autosaveRead: () => ipcRenderer.invoke('project:autosave-read'),
    autosaveClear: () => ipcRenderer.invoke('project:autosave-clear')
  },
  plugins: {
    available: () => ipcRenderer.invoke('plugins:available'),
    host: (arch?: 'x64' | 'x86') => ipcRenderer.invoke('plugins:host', arch),
    release: (arch?: 'x64' | 'x86') => ipcRenderer.invoke('plugins:release', arch),
    windowHandle: () => ipcRenderer.invoke('plugins:window-handle'),
    listRead: () => ipcRenderer.invoke('plugins:list-read'),
    listWrite: (data: unknown) => ipcRenderer.invoke('plugins:list-write', data),
    freeDir: () => ipcRenderer.invoke('plugins:free-dir'),
    freeInstalled: () => ipcRenderer.invoke('plugins:free-installed'),
    freeInstall: (id: string) => ipcRenderer.invoke('plugins:free-install', id),
    freePage: (id: string) => ipcRenderer.invoke('plugins:free-page', id),
    presetList: (pluginId: string) => ipcRenderer.invoke('presets:list', pluginId),
    presetGet: (pluginId: string, name: string) => ipcRenderer.invoke('presets:get', pluginId, name),
    presetSave: (pluginId: string, name: string, state: string) => ipcRenderer.invoke('presets:save', pluginId, name, state),
    presetDelete: (pluginId: string, name: string) => ipcRenderer.invoke('presets:delete', pluginId, name),
    onFreeProgress: (cb: (p: { id: string; done: number; total: number; text: string }) => void) => {
      const h = (_: unknown, p: { id: string; done: number; total: number; text: string }): void => cb(p)
      ipcRenderer.on('plugins:free-progress', h)
      return () => ipcRenderer.removeListener('plugins:free-progress', h)
    },
    onHostExit: (cb: (info: { code: number | null; signal: string | null; arch?: string }) => void): (() => void) => {
      const h = (_: unknown, i: { code: number | null; signal: string | null; arch?: string }): void => cb(i)
      ipcRenderer.on('plugins:host-exit', h)
      return () => ipcRenderer.removeListener('plugins:host-exit', h)
    }
  },
  app: {
    // the window is about to close: the page asks about unsaved work, then calls closeConfirmed()
    onCloseRequest: (cb: () => void): (() => void) => {
      const h = (): void => cb()
      ipcRenderer.on('app:close-request', h)
      return () => ipcRenderer.removeListener('app:close-request', h)
    },
    closeConfirmed: () => ipcRenderer.invoke('app:close-confirmed')
  },
  files: {
    exists: (paths: string[]) => ipcRenderer.invoke('files:exists', paths),
    saveRecording: (bytes: Uint8Array) => ipcRenderer.invoke('files:save-recording', bytes),
    saveTemp: (bytes: Uint8Array, name: string) => ipcRenderer.invoke('files:save-temp', bytes, name),
    showItem: (path: string) => ipcRenderer.invoke('files:show-item', path)
  },
  exporter: {
    saveDialog: (name: string, ext: 'wav' | 'mp3' | 'mid') => ipcRenderer.invoke('export:save-dialog', name, ext),
    write: (path: string, bytes: Uint8Array) => ipcRenderer.invoke('export:write', path, bytes),
    mp3: (bytes: Uint8Array, outPath: string, kbps: number) => ipcRenderer.invoke('export:mp3', bytes, outPath, kbps)
  },
  feedback: {
    logError: (message: string) => ipcRenderer.invoke('log:renderer', message),
    crashTail: () => ipcRenderer.invoke('log:crash-tail'),
    openIssues: () => ipcRenderer.invoke('app:open-feedback'),
    showCrashLog: () => ipcRenderer.invoke('app:show-crash-log')
  },
  diag: {
    get: () => ipcRenderer.invoke('diag:get'),
    set: (on: boolean) => ipcRenderer.invoke('diag:set', on),
    append: (text: string) => ipcRenderer.invoke('diag:append', text),
    collect: (extra: string) => ipcRenderer.invoke('diag:collect', extra),
    clear: () => ipcRenderer.invoke('diag:clear'),
    save: (text: string) => ipcRenderer.invoke('diag:save', text)
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
