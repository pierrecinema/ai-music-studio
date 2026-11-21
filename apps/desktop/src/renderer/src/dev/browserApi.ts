// Stand-in for the Electron bridge (window.api) when the interface runs in a normal browser for testing
// (pnpm --filter ./apps/desktop preview:browser). Inside the app window.api comes from the preload script
// and this file does nothing.
// Files: http(s) URLs are fetched; recordings and rendered clips live in memory as "mem://N".
const mem = new Map<string, Uint8Array>()
let n = 0

async function readFile(path: string): Promise<Uint8Array> {
  const have = mem.get(path)
  if (have) return have
  const r = await fetch(path.replace(/#/g, '%23'))
  if (!r.ok) throw new Error(`cannot read ${path}`)
  return new Uint8Array(await r.arrayBuffer())
}

const real = {
  fs: { readFile },
  // sound packs: a test may serve /packs/index.json (the packs list of the main process, with URLs as paths)
  sounds: {
    status: async () => {
      const packs = await fetch('/packs/index.json').then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : [])).catch(() => [])
      const gu = (packs as SoundPackInfo[]).find((x) => x.id === 'generaluser')
      return { installed: !!gu?.installed, path: gu?.main ?? '', name: 'GeneralUser GS 1.471', sizeMb: 28, packs }
    },
    install: async () => ({ ok: false, error: 'browser preview' }), remove: async () => true, onProgress: () => () => undefined,
  },
  files: {
    exists: async (paths: string[]) => paths.map(() => true),
    saveRecording: async (bytes: Uint8Array) => { const k = `mem://${++n}.wav`; mem.set(k, bytes); return k },
    showItem: async () => undefined
  },
  dialog: { openAudio: async () => [] as string[], openVideo: async () => null, save: async () => null },
  loras: { list: async () => ({ loras: [], dir: '' }), import: async () => ({ ok: false, error: 'browser preview' }), remove: async () => undefined, pick: async () => null },
  engines: { status: async () => ({ pythonFound: false, pythonVersion: null, venvReady: false, installed: {}, gpu: 'none', serverReady: false }), onLog: () => () => undefined },
  diag: { get: async () => false, set: async (on: boolean) => on, append: async () => undefined, collect: async (x: string) => x, clear: async () => undefined, save: async () => null },
  server: { getUrl: async () => 'http://127.0.0.1:8765', isReady: async () => false, logTail: async () => '' },
  feedback: { logError: async () => undefined, crashTail: async () => '' },
  project: { autosaveRead: async () => null, autosaveWrite: async () => undefined, autosaveClear: async () => undefined },
  updater: { onChecking: () => undefined, onAvailable: () => undefined, onNotAvailable: () => undefined, onProgress: () => undefined, onDownloaded: () => undefined, onError: () => undefined },
  models: { onProgress: () => () => undefined },
  plugins: { onFreeProgress: () => () => undefined, freeInstalled: async () => ({ dexed: true, surge: true }) },
  huggingface: { onProgress: () => () => undefined }
} as Record<string, Record<string, unknown>>

// every other call resolves to nothing instead of failing
const ns = (name: string): Record<string, unknown> =>
  new Proxy(real[name] ?? {}, { get: (t, k: string) => (k in t ? t[k] : async () => undefined) })

const w = window as unknown as { api?: unknown; __browserMem?: Map<string, Uint8Array> }
if (!w.api) {
  w.api = new Proxy({}, { get: (_, k: string) => ns(k) })
  w.__browserMem = mem
  // browser tests only: read the stores from Playwright (window.__ams.project.getState())
  void Promise.all([import('../stores/project.store'), import('../stores/audio.store'), import('../stores/ui.store'),
    import('../stores/mastering.store'), import('../audio/engine'), import('../stores/stemHandoff')]).then(([p, a, u, m, e, st]) => {
    (window as unknown as { __ams: unknown }).__ams = {
      project: p.useProjectStore, audio: a.useAudioStore, ui: u.useUIStore, mastering: m.useMasteringStore, loadBuffer: e.loadBuffer, toStems: st.sendToStemSplitter,
    }
  })
}
export {}
