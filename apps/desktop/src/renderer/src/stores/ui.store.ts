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

  setShortcutPreset: (p: 'ableton' | 'cubase') => void
  setPianoTool: (t: 'draw' | 'select' | 'erase') => void
  setPianoZoom: (z: number) => void
  toggleSidebar: () => void
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

      setShortcutPreset: (shortcutPreset) => set({ shortcutPreset }),
      setPianoTool: (pianoTool) => set({ pianoTool }),
      setPianoZoom: (pianoZoom) => set({ pianoZoom: Math.min(4, Math.max(0.25, pianoZoom)) }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setActiveView: (activeView) => set({ activeView }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setZoom: (zoom) => set({ zoom }),
      setScroll: (scrollX, scrollY) => set({ scrollX, scrollY })
    }),
    { name: 'ams-ui' }
  )
)
