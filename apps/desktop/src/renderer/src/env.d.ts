export {}

declare global {
  const __APP_VERSION__: string
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
      server: { getUrl: () => Promise<string>; isReady: () => Promise<boolean> }
      engines: {
        status: () => Promise<EngineStatus>
        install: (groups: string[], torchVariant: string) => Promise<{ ok: boolean; error?: string }>
        cancel: () => Promise<void>
        onLog: (cb: (line: string) => void) => () => void
      }
      dialog: {
        openAudio: () => Promise<string[]>
        openVideo: () => Promise<string | null>
        save: (name: string) => Promise<string | null>
      }
      fs: { readFile: (path: string) => Promise<Uint8Array> }
      shell: { openPath: (path: string) => Promise<void> }
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
