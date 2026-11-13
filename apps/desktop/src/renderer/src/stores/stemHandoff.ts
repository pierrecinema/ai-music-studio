// Hands a song to the Stem Splitter from another view (Create music, Library, Mastering): the Stem Splitter takes it
// when it opens (or at once if it is open) and shows it ready to split.
import { create } from 'zustand'
import { useUIStore } from './ui.store'

interface Handoff { pending: { path: string; name: string } | null; take: () => { path: string; name: string } | null }

export const useStemHandoff = create<Handoff>()((set, get) => ({
  pending: null,
  take: () => { const p = get().pending; if (p) set({ pending: null }); return p },
}))

export function sendToStemSplitter(path: string, name?: string): void {
  const n = name ?? (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '')
  useStemHandoff.setState({ pending: { path, name: n } })
  useUIStore.getState().setActiveView('stem-splitter')
}
