// The VST plugins found on this PC (Settings → Plugins): the result of the last search, which ones are ticked
// (shown in the app), the extra folders, and the search itself. Kept in plugins.json in the app's data folder.
// The search runs on the first start of a version with plugin support, then only when the user presses the button.
import { create } from 'zustand'
import { host, vstInUse, type FailedPlugin, type PluginInfo } from '../audio/vst/host'
import { cleanFailed, cleanPlugins } from '../lib/pluginList'

interface Saved { plugins: PluginInfo[]; failed: FailedPlugin[]; off: string[]; folders: string[]; scannedAt: number }

interface PluginsState extends Saved {
  available: boolean | null          // the plugin host is installed
  loaded: boolean
  scanning: { done: number; total: number; file: string } | null
  error: string | null
  load: () => Promise<void>
  scan: () => Promise<void>
  setOn: (id: string, on: boolean) => void
  setAll: (on: boolean) => void
  addFolder: (path: string) => void
  removeFolder: (path: string) => void
  enabled: () => PluginInfo[]
}

// the folders plugins are usually installed in (the host also searches its own default places)
export const DEFAULT_FOLDERS = [
  'C:\\Program Files\\Common Files\\VST3',
  'C:\\Program Files\\VSTPlugins',
  'C:\\Program Files\\Steinberg\\VSTPlugins',
  'C:\\Program Files\\Common Files\\VST2',
  'C:\\Program Files\\Common Files\\Steinberg\\VST2',
  // 32-bit plugins (Windows puts them under "Program Files (x86)")
  'C:\\Program Files (x86)\\Common Files\\VST3',
  'C:\\Program Files (x86)\\VSTPlugins',
  'C:\\Program Files (x86)\\Steinberg\\VSTPlugins',
  'C:\\Program Files (x86)\\Common Files\\VST2',
  'C:\\Program Files (x86)\\Common Files\\Steinberg\\VST2',
]

const persist = (s: Saved): void => {
  void window.api?.plugins?.listWrite?.({ plugins: s.plugins, failed: s.failed, off: s.off, folders: s.folders, scannedAt: s.scannedAt })
}

export const usePluginsStore = create<PluginsState>()((set, get) => ({
  plugins: [], failed: [], off: [], folders: [], scannedAt: 0,
  available: null, loaded: false, scanning: null, error: null,

  load: async () => {
    const available = await host.available()
    let saved: Partial<Saved> | null = null
    try { saved = (await window.api?.plugins?.listRead?.()) as Partial<Saved> | null } catch { saved = null }
    set({
      available, loaded: true,
      plugins: cleanPlugins(saved?.plugins), failed: cleanFailed(saved?.failed), off: saved?.off ?? [],
      folders: saved?.folders ?? [], scannedAt: saved?.scannedAt ?? 0,
    })
    // first start with plugin support: search once by itself
    if (available && !saved) void get().scan()
  },

  scan: async () => {
    if (get().scanning) return
    set({ scanning: { done: 0, total: 0, file: '' }, error: null })
    const off = host.onEvent((m) => { if (m.event === 'scan') set({ scanning: { done: m.done, total: m.total, file: m.file } }) })
    try {
      await host.ensure()
      // the folder of the free instruments (Dexed, Surge XT) is always searched, also if it was taken out of the list
      let free = ''
      try { free = (await window.api?.plugins?.freeDir?.()) ?? '' } catch { /* not in the app */ }
      const paths = [...new Set([...DEFAULT_FOLDERS, ...get().folders, ...(free ? [free] : [])])]
      const before = get().plugins
      const raw = await host.call<{ plugins: unknown; failed: unknown }>('scan', { paths, known: [] }, 3600000)
      const r = { plugins: cleanPlugins(raw?.plugins), failed: cleanFailed(raw?.failed) }
      // a plugin that worked before but failed this time (busy, slow to answer) keeps its place: it is not dropped
      const failedFiles = new Set(r.failed.map((f) => f.file))
      const kept = before.filter((p) => failedFiles.has(p.file) && !r.plugins.some((q) => q.id === p.id))
      const plugins = [...r.plugins, ...kept].sort((a, b) => a.name.localeCompare(b.name))
      set({ plugins, failed: r.failed.filter((f) => !kept.some((p) => p.file === f.file)), scannedAt: Date.now() })
      persist(get())
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      off()
      set({ scanning: null })
      // the host was only started for the search: stop it again unless a plugin is playing
      if (!vstInUse()) host.release()
    }
  },

  setOn: (id, on) => {
    const offList = get().off.filter((x) => x !== id)
    if (!on) offList.push(id)
    set({ off: offList })
    persist(get())
  },
  setAll: (on) => { set({ off: on ? [] : get().plugins.map((p) => p.id) }); persist(get()) },
  addFolder: (path) => { if (!get().folders.includes(path)) { set({ folders: [...get().folders, path] }); persist(get()) } },
  removeFolder: (path) => { set({ folders: get().folders.filter((f) => f !== path) }); persist(get()) },
  enabled: () => get().plugins.filter((p) => !get().off.includes(p.id)),
}))
