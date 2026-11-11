import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { View } from '../types'

interface UIState {
  activeView: View
  theme: 'dark' | 'light'
  sidebarWidth: number
  timelineHeight: number
  pianoRollVisible: boolean
  zoom: number
  scrollX: number
  scrollY: number
  language: string
  sidebarOpen: boolean
  shortcutPreset: 'ableton' | 'cubase'
  pianoTool: 'draw' | 'select' | 'erase'
  pianoZoom: number
  grid: string          // id of a grid size (see edit/grid.ts)
  snap: boolean         // snap to the grid while moving, trimming and drawing
  libraryTab: 'tracks' | 'stems' | 'samples'   // open tab of the Library (other views can open it on a tab)

  setLibraryTab: (tab: 'tracks' | 'stems' | 'samples') => void

  setGrid: (id: string) => void
  toggleSnap: () => void
  setShortcutPreset: (p: 'ableton' | 'cubase') => void
  setPianoTool: (t: 'draw' | 'select' | 'erase') => void
  setPianoZoom: (z: number) => void
  toggleSidebar: () => void
  previousView: View
  closeSettings: () => void
  setActiveView: (view: View) => void
  setTheme: (theme: 'dark' | 'light') => void
  setLanguage: (lang: string) => void
  setZoom: (z: number) => void
  setScroll: (x: number, y: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeView: 'timeline',
      libraryTab: 'tracks',
      setLibraryTab: (libraryTab) => set({ libraryTab }),
      theme: 'dark',
      sidebarWidth: 220,
      timelineHeight: 240,
      pianoRollVisible: true,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      language: 'en',
      sidebarOpen: true,
      shortcutPreset: 'ableton',
      pianoTool: 'draw',
      pianoZoom: 1,
      grid: '1/16',
      snap: true,

      setGrid: (grid) => set({ grid }),
      toggleSnap: () => set((s) => ({ snap: !s.snap })),
      setShortcutPreset: (shortcutPreset) => set({ shortcutPreset }),
      setPianoTool: (pianoTool) => set({ pianoTool }),
      setPianoZoom: (pianoZoom) => set({ pianoZoom: Math.min(4, Math.max(0.25, pianoZoom)) }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      previousView: 'timeline',
      // remember where we came from so Settings can be closed again (never Settings itself)
      setActiveView: (activeView) =>
        set((s) => ({
          activeView,
          previousView: s.activeView !== activeView && s.activeView !== 'settings' ? s.activeView : s.previousView
        })),
      closeSettings: () =>
        set((s) => (s.activeView === 'settings' ? { activeView: s.previousView || 'timeline' } : s)),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setZoom: (zoom) => set({ zoom }),
      setScroll: (scrollX, scrollY) => set({ scrollX, scrollY })
    }),
    { name: 'ams-ui' }
  )
)
