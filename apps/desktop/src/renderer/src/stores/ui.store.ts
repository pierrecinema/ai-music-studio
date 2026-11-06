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

      setActiveView: (activeView) => set({ activeView }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setZoom: (zoom) => set({ zoom }),
      setScroll: (scrollX, scrollY) => set({ scrollX, scrollY })
    }),
    { name: 'ams-ui' }
  )
)
