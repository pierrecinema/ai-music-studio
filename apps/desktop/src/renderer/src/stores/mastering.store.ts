// Mastering: the open files, the chain and its presets, recent files. Other views send a song here with
// sendToMastering(path, name).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultChain, type Chain } from '../audio/master/chain'
import { useUIStore } from './ui.store'

export interface MasterFile { path: string; name: string }

interface MasteringState {
  files: MasterFile[]             // open files (tabs)
  current: string | null          // path of the shown file
  recent: MasterFile[]
  chain: Chain
  presets: Record<string, Chain>  // the user's own presets
  open: (f: MasterFile) => void
  close: (path: string) => void
  select: (path: string) => void
  setChain: (c: Chain) => void
  savePreset: (name: string) => void
  deletePreset: (name: string) => void
}

const nameOf = (p: string): string => (p.split(/[\\/]/).pop() ?? p).replace(/\.[a-z0-9]+$/i, '')

export const useMasteringStore = create<MasteringState>()(
  persist(
    (set, get) => ({
      files: [],
      current: null,
      recent: [],
      chain: defaultChain(),
      presets: {},
      open: (f) => {
        const file = { path: f.path, name: f.name || nameOf(f.path) }
        set((s) => ({
          files: s.files.some((x) => x.path === file.path) ? s.files : [...s.files, file],
          current: file.path,
          recent: [file, ...s.recent.filter((x) => x.path !== file.path)].slice(0, 12),
        }))
      },
      close: (path) => set((s) => {
        const files = s.files.filter((f) => f.path !== path)
        return { files, current: s.current === path ? (files.at(-1)?.path ?? null) : s.current }
      }),
      select: (path) => set({ current: path }),
      setChain: (chain) => set({ chain }),
      savePreset: (name) => set((s) => ({ presets: { ...s.presets, [name]: get().chain } })),
      deletePreset: (name) => set((s) => { const p = { ...s.presets }; delete p[name]; return { presets: p } }),
    }),
    {
      name: 'ams-mastering',
      version: 1,
      partialize: (s) => ({ files: s.files, current: s.current, recent: s.recent, chain: s.chain, presets: s.presets }),
    },
  ),
)

/** Opens a song in Mastering (from the Library, Create music, the Studio or a dropped file). */
export function sendToMastering(path: string, name?: string): void {
  useMasteringStore.getState().open({ path, name: name ?? nameOf(path) })
  useUIStore.getState().setActiveView('mastering')
}
