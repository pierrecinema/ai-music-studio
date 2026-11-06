import { create } from 'zustand'

interface AudioState {
  isPlaying: boolean
  isRecording: boolean
  currentBeat: number
  bpm: number
  masterVolume: number
  metronomeEnabled: boolean

  setPlaying: (v: boolean) => void
  setRecording: (v: boolean) => void
  setCurrentBeat: (b: number) => void
  setBpm: (b: number) => void
  setMasterVolume: (v: number) => void
  toggleMetronome: () => void
  play: () => void
  pause: () => void
  stop: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isPlaying: false,
  isRecording: false,
  currentBeat: 0,
  bpm: 120,
  masterVolume: 0.8,
  metronomeEnabled: false,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setRecording: (isRecording) => set({ isRecording }),
  setCurrentBeat: (currentBeat) => set({ currentBeat }),
  setBpm: (bpm) => set({ bpm }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentBeat: 0 })
}))
