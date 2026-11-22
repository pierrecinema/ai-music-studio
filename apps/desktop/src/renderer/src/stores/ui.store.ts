import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** look of the app: light / dark, or one of the layouts that change more than the colours (Settings → Appearance) */
export type Theme = 'dark' | 'light' | 'swiss' | 'rack'
import type { View } from '../types'

interface UIState {
  activeView: View
  theme: Theme
  sidebarWidth: number
  timelineHeight: number
  pianoRollVisible: boolean
  zoom: number
  scrollX: number
  scrollY: number
  language: string
  sidebarOpen: boolean
  shortcutPreset: 'ableton' | 'cubase'
  customKeys: Record<string, string[]>     // the user's own extra keys per action (Settings → Shortcuts)
  pianoTool: 'draw' | 'select' | 'erase'
  pianoZoom: number
  grid: string          // id of a grid size (see edit/grid.ts)
  snap: boolean         // snap to the grid while moving, trimming and drawing
  tool: 'pointer' | 'scissors'   // the Studio's tool: select and move, or cut clips with a click
  singingToMidi: boolean          // the Vocal Editor turns the selected audio clip into a melody when it opens
  setSingingToMidi: (on: boolean) => void
  libraryTab: 'tracks' | 'stems' | 'samples'   // open tab of the Library (other views can open it on a tab)
  panelHeight: number   // the panel under the Studio (mixer, piano roll, ...): drag its top edge
  chatOpen: boolean     // the AI assistant panel on the right
  aiTrackId?: string    // AI Instruments: the MIDI track to start with (set by the Channel tab)
  setChatOpen: (open: boolean) => void
  setPanelHeight: (h: number) => void

  setLibraryTab: (tab: 'tracks' | 'stems' | 'samples') => void

  setGrid: (id: string) => void
  toggleSnap: () => void
  setTool: (tool: 'pointer' | 'scissors') => void
  setShortcutPreset: (p: 'ableton' | 'cubase') => void
  setCustomKeys: (k: Record<string, string[]>) => void
  setPianoTool: (t: 'draw' | 'select' | 'erase') => void
  setPianoZoom: (z: number) => void
  toggleSidebar: () => void
  previousView: View
  closeSettings: () => void
  setActiveView: (view: View) => void
  setTheme: (theme: Theme) => void
  setLanguage: (lang: string) => void
  setZoom: (z: number) => void
  setScroll: (x: number, y: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeView: 'timeline',
      libraryTab: 'tracks',
      panelHeight: 320,
      setPanelHeight: (panelHeight) => set({ panelHeight }),
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
      customKeys: {},
      pianoTool: 'draw',
      pianoZoom: 1,
      grid: '1/16',
      snap: true,
      tool: 'pointer',
      singingToMidi: false,

      setGrid: (grid) => set({ grid }),
      toggleSnap: () => set((s) => ({ snap: !s.snap })),
      setTool: (tool) => set({ tool }),
      setSingingToMidi: (singingToMidi) => set({ singingToMidi }),
      chatOpen: true,
      setChatOpen: (chatOpen) => set({ chatOpen }),
      setShortcutPreset: (shortcutPreset) => set({ shortcutPreset }),
      setCustomKeys: (customKeys) => set({ customKeys }),
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
    {
      name: 'ams-ui',
      // the Analog console look was removed in 0.70.1: whoever had it gets Dark
      merge: (saved, cur) => {
        const s = { ...cur, ...(saved as Partial<UIState>) }
        if (!['dark', 'light', 'swiss', 'rack'].includes(s.theme)) s.theme = 'dark'
        return s
      }
    }
  )
)
