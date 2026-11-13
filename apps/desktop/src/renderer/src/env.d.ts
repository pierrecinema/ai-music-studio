export {}

declare global {
  const __APP_VERSION__: string
  interface ModelsOverview {
    caches: Array<{ id: 'pip-shared' | 'pip-app' | 'updater'; name: string; description: string; path: string; bytes: number | null }>
    baseDir: string
    defaultDir: string
    usingDefault: boolean
    free: number
    total: number
    models: Array<{
      id: 'acestep' | 'huggingface' | 'torch'
      name: string
      description: string
      dir: string
      bytes: number
      status: 'missing' | 'partial' | 'downloading' | 'complete'
      components: Array<{ name: string; bytes: number }>
    }>
    loras: Array<{ id: string; name: string; kind: string; bytes: number; source?: string; license?: string }>
    loraDir: string
    env: { path: string; bytes: number | null }
  }
  interface HfRepoInfo {
    id: string
    likes: number
    downloads: number
    gated: boolean
    license: string
    tags: string[]
  }
  interface LoraInfo {
    id: string
    name: string
    kind: 'style' | 'artist' | 'sound'
    path: string
    tags: string[]
    family?: 'v1' | '1.5' | 'xl' | 'unknown'
  }
  interface EngineStatus {
    pythonFound: boolean
    pythonVersion: string | null
    venvReady: boolean
    installed: Record<string, boolean>
    gpu: 'nvidia' | 'amd' | 'none'
    serverReady: boolean
  }

  interface Window {
    api: {
      server: { getUrl: () => Promise<string>; isReady: () => Promise<boolean>; showLog: () => Promise<void>; logTail: () => Promise<string> }
      loras: {
        list: () => Promise<{ dir: string; loras: LoraInfo[] }>
        import: (src: string, kind: LoraInfo['kind'], name?: string) =>
          Promise<{ ok: true; lora: LoraInfo } | { ok: false; error: string }>
        remove: (id: string) => Promise<void>
        pick: (mode: 'file' | 'folder') => Promise<string | null>
      }
      models: {
        overview: () => Promise<ModelsOverview>
        pickDir: () => Promise<string | null>
        space: (path: string) => Promise<{ free: number; total: number }>
        open: (which: 'models' | 'loras') => Promise<void>
        move: (newBase: string, move: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
        cancelMove: () => Promise<void>
        delete: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
        deleteLora: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
        clearCache: (id: string) => Promise<{ ok: true; freed: number } | { ok: false; error: string }>
        onProgress: (cb: (p: { copied: number; total: number; phase: string }) => void) => () => void
      }
      huggingface: {
        search: (query: string) => Promise<{ ok: true; repos: HfRepoInfo[] } | { ok: false; error: string }>
        files: (repo: string) => Promise<{ ok: true; repo: HfRepoInfo; files: Array<{ name: string; size: number }> } | { ok: false; error: string }>
        download: (repo: string, file: string, kind: LoraInfo['kind']) => Promise<{ ok: true; lora: LoraInfo } | { ok: false; error: string }>
        cancel: () => Promise<void>
        openPage: (repo: string) => Promise<void>
        onProgress: (cb: (p: { received: number; total: number }) => void) => () => void
      }
      engines: {
        status: () => Promise<EngineStatus>
        install: (groups: string[], torchVariant: string) => Promise<{ ok: boolean; error?: string }>
        cancel: () => Promise<void>
        onLog: (cb: (line: string) => void) => () => void
      }
      dialog: {
        openAudio: () => Promise<string[]>
        openVideo: () => Promise<string | null>
        openImage: () => Promise<string | null>
        pickFolder: (title?: string) => Promise<string | null>
        save: (name: string) => Promise<string | null>
      }
      fs: { readFile: (path: string) => Promise<Uint8Array> }
      shell: { openPath: (path: string) => Promise<void>; openProject: (page: 'home' | 'releases' | 'issues' | 'newIssue' | 'discussions' | 'donate') => Promise<void> }
      project: {
        openDialog: () => Promise<{ path: string; text: string } | null>
        read: (path: string) => Promise<string>
        saveDialog: (name: string) => Promise<string | null>
        write: (path: string, text: string) => Promise<void>
        autosaveWrite: (text: string) => Promise<void>
        autosaveRead: () => Promise<{ text: string; mtime: number } | null>
        autosaveClear: () => Promise<void>
      }
      files: {
        exists: (paths: string[]) => Promise<boolean[]>
        saveRecording: (bytes: Uint8Array) => Promise<string>
        saveTemp: (bytes: Uint8Array, name: string) => Promise<string>
        showItem: (path: string) => Promise<void>
      }
      exporter: {
        saveDialog: (name: string, ext: 'wav' | 'mp3') => Promise<string | null>
        write: (path: string, bytes: Uint8Array) => Promise<void>
        mp3: (bytes: Uint8Array, outPath: string, kbps: number) => Promise<{ ok: boolean; error?: string }>
      }
      feedback: {
        logError: (message: string) => Promise<void>
        crashTail: () => Promise<string>
        openIssues: () => Promise<void>
        showCrashLog: () => Promise<void>
      }
      diag: {
        get: () => Promise<boolean>
        set: (on: boolean) => Promise<boolean>
        append: (text: string) => Promise<void>
        collect: (extra: string) => Promise<string>
        clear: () => Promise<void>
        save: (text: string) => Promise<string | null>
      }
      updater: {
        check: () => Promise<void>
        download: () => Promise<void>
        install: () => Promise<void>
        onChecking: (cb: () => void) => void
        onAvailable: (cb: (info: { version: string; releaseDate: string }) => void) => void
        onNotAvailable: (cb: () => void) => void
        onProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => void
        onDownloaded: (cb: (info: { version: string }) => void) => void
        onError: (cb: (msg: string) => void) => void
      }
    }
  }
}
