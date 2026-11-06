export type TrackType = 'vocal' | 'instrument' | 'audio' | 'midi'

export interface Note {
  id: string
  pitch: number       // MIDI note 0-127
  startTime: number   // in beats
  duration: number    // in beats
  velocity: number    // 0-127
  lyric?: string
}

export interface Track {
  id: string
  name: string
  type: TrackType
  color: string
  volume: number      // 0-1
  pan: number         // -1 to 1
  muted: boolean
  soloed: boolean
  clips: Clip[]
  voiceId?: string
  instrumentId?: string
}

export interface Clip {
  id: string
  startTime: number
  duration: number
  notes?: Note[]
  audioFile?: string
  color?: string
}

export interface Project {
  id: string
  name: string
  bpm: number
  timeSignature: [number, number]
  sampleRate: number
  tracks: Track[]
  createdAt: string
  updatedAt: string
}

export interface Voice {
  id: string
  name: string
  language: string
  gender: 'male' | 'female' | 'neutral'
  category: string
  tags: string[]
  previewUrl?: string
}

export interface AIInstrument {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
}

export type AIProvider = 'claude' | 'openai'

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface StemResult {
  vocals?: string
  drums?: string
  bass?: string
  other?: string
  piano?: string
  guitar?: string
}

export type View = 'timeline' | 'piano-roll' | 'mixer' | 'vocal-editor' | 'instruments' | 'ai-chat' | 'stem-splitter' | 'video-composer' | 'settings'
