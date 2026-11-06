export {}

declare global {
  interface Window {
    api: {
      server: { getUrl: () => Promise<string>; isReady: () => Promise<boolean> }
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
