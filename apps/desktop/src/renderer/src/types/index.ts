export type TrackType = 'vocal' | 'instrument' | 'audio' | 'midi' | 'group'

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
  parentId?: string           // inside this group track (its sound goes through the group)
  collapsed?: boolean         // group tracks: children hidden in the Studio
  sends?: Record<string, number>          // return track id -> send level 0..1 (post fader)
  automation?: Partial<Record<AutoParam, AutoPoint[]>>
  showAutomation?: AutoParam | null       // which automation lane is open below the track
  takes?: TakeLane[]          // loop recording: one lane per pass (comping)
  showTakes?: boolean
}

// automated parameters: volume and pan of the track, and the send level to each return track ("send:<id>")
export type AutoParam = 'volume' | 'pan' | `send:${string}`
export interface AutoPoint { beat: number; value: number }     // value: volume/send 0..1, pan -1..1

export interface TakeLane { id: string; name: string; clips: Clip[] }

export interface WarpMarker { src: number; beat: number }        // file second `src` plays at clip beat `beat`

export interface Marker { id: string; beat: number; name: string; end?: number }   // `end`: a cycle marker
export interface TempoPoint { beat: number; bpm: number }
export interface SignaturePoint { bar: number; num: number; den: number }          // from this bar on (0 = first bar)

export interface ReturnTrack {
  id: string
  name: string
  effect: 'reverb' | 'delay'
  volume: number
  muted: boolean
  pan: number
  decay?: number              // reverb: seconds
  delayBeats?: number         // delay: in beats (0.5 = an eighth)
  feedback?: number           // delay: 0..0.9
}

export interface LoopRange { start: number; end: number; enabled: boolean }

export interface Clip {
  id: string
  startTime: number   // in beats
  duration: number    // in beats
  notes?: Note[]
  audioFile?: string
  offset?: number     // audio clips: seconds skipped at the start of the file (left trim)
  gain?: number       // audio clips: 0..2, default 1
  fadeIn?: number     // audio clips: fade-in length in beats
  fadeOut?: number    // audio clips: fade-out length in beats
  gridFirst?: number  // beat grid: time of the first beat in the FILE (seconds); with warpBpm it gives every beat of the clip
  warpBpm?: number    // synced samples: the tempo the file was made at; it is stretched to the project tempo
  warpMarkers?: WarpMarker[]   // timing of the audio bent by hand (Ableton warp markers)
  name?: string
  color?: string
}

export interface Project {
  id: string
  name: string
  bpm: number
  timeSignature: [number, number]
  sampleRate: number
  tracks: Track[]
  loop?: LoopRange
  markers?: Marker[]
  tempoMap?: TempoPoint[]          // tempo changes after beat 0 (beat 0 uses `bpm`)
  signatures?: SignaturePoint[]    // time signature changes after bar 0 (bar 0 uses `timeSignature`)
  returns?: ReturnTrack[]
  countIn?: number                 // bars of clicks before recording starts
  punchIn?: boolean                // recording only keeps what lies inside the loop range
  punchOut?: boolean
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

export type AIProvider = 'claude' | 'openai' | 'grok' | 'ollama'

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

export type View = 'library' | 'timeline' | 'piano-roll' | 'mixer' | 'vocal-editor' | 'instruments' | 'ai-chat' | 'stem-splitter' | 'video-composer' | 'create' | 'mastering' | 'karaoke' | 'cloud' | 'settings'
