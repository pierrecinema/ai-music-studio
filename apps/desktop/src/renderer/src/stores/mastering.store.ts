// Mastering: the open files, the chain and its presets, recent files. Other views send a song here with
// sendToMastering(path, name).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultChain, type Chain } from '../audio/master/chain'
import { useUIStore } from './ui.store'

export interface MasterFile { path: string; name: string }

// an album: its songs in order, the pause between them, and how it is evened out
export interface AlbumSettings {
  songs: MasterFile[]
  gapSec: number                  // silence between the songs (s)
  keep: number                    // 0..0.5: how much quieter a quiet song (a ballad) may stay
  tone: boolean                   // also even out lows and highs (gently)
  title: string                   // the album's name (file name and tag)
  artist: string
}
const defaultAlbum = (): AlbumSettings => ({ songs: [], gapSec: 2, keep: 0.3, tone: true, title: '', artist: '' })

interface MasteringState {
  files: MasterFile[]             // open files (tabs)
  current: string | null          // path of the shown file
  recent: MasterFile[]
  chain: Chain
  presets: Record<string, Chain>  // the user's own presets
  chains: Record<string, Chain>   // the chain of each song (by path): opening a song again brings it back
  markers: Record<string, Array<{ t: number; name: string }>>
  album: AlbumSettings
  setAlbum: (a: Partial<AlbumSettings>) => void
  setChainFor: (path: string, c: Chain) => void
  setMarkers: (path: string, m: Array<{ t: number; name: string }>) => void
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
      chains: {},
      markers: {},
      album: defaultAlbum(),
      setAlbum: (a) => set((s) => ({ album: { ...s.album, ...a } })),
      setChainFor: (path, c) => set((s) => ({ chains: { ...s.chains, [path]: c }, chain: s.current === path ? c : s.chain })),
      setMarkers: (path, m) => set((s) => ({ markers: { ...s.markers, [path]: m } })),
      open: (f) => {
        const file = { path: f.path, name: f.name || nameOf(f.path) }
        set((s) => ({
          files: s.files.some((x) => x.path === file.path) ? s.files : [...s.files, file],
          current: file.path,
          chain: s.chains[file.path] ?? s.chain,
          recent: [file, ...s.recent.filter((x) => x.path !== file.path)].slice(0, 12),
        }))
      },
      close: (path) => set((s) => {
        const files = s.files.filter((f) => f.path !== path)
        return { files, current: s.current === path ? (files.at(-1)?.path ?? null) : s.current }
      }),
      select: (path) => set((s) => ({ current: path, chain: s.chains[path] ?? s.chain })),
      setChain: (chain) => set((s) => ({ chain, chains: s.current ? { ...s.chains, [s.current]: chain } : s.chains })),
      savePreset: (name) => set((s) => ({ presets: { ...s.presets, [name]: get().chain } })),
      deletePreset: (name) => set((s) => { const p = { ...s.presets }; delete p[name]; return { presets: p } }),
    }),
    {
      name: 'ams-mastering',
      version: 1,
      partialize: (s) => ({ files: s.files, current: s.current, recent: s.recent, chain: s.chain, presets: s.presets, chains: s.chains, markers: s.markers, album: s.album }),
    },
  ),
)

/** Opens a song in Mastering (from the Library, Create music, the Studio or a dropped file). */
export function sendToMastering(path: string, name?: string): void {
  useMasteringStore.getState().open({ path, name: name ?? nameOf(path) })
  useUIStore.getState().setActiveView('mastering')
}
