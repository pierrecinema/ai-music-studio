const BASE = 'http://127.0.0.1:8765'

export interface Resources {
  vram_gb: number; ram_gb: number; low_memory: boolean; max_duration_s: number; quant: string
}
export interface Lora {
  id: string; name: string; kind: 'style' | 'artist' | 'sound'; path: string; tags: string[]
}
export interface MusicJob {
  id: string; status: 'queued' | 'running' | 'done' | 'error'
  audio_file?: string; error?: string; warnings: string[]; engine?: string
}
export interface KaraokeWord { text: string; start: number; end: number }

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }))
    throw new Error(err.detail ?? r.statusText)
  }
  return r.json()
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(r.statusText)
  return r.json()
}

export const api = {
  health: () => get<{ status: string }>('/health'),

  vocal: {
    generate: (body: {
      voiceId: string
      notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number; lyric?: string }>
      lyrics: string
      controls: { power: number; breathiness: number; vibrato: number; pitch: number }
    }) => post<{ audioFile: string; duration: number }>('/vocal/generate', body),

    clone: (body: { audioFiles: string[]; name: string }) =>
      post<{ voiceId: string; status: string }>('/vocal/clone', body),

    voices: () => get<Array<{ id: string; name: string; language: string; gender: string; category: string }>>('/vocal/voices'),
  },

  instruments: {
    generate: (body: {
      instrumentId: string
      notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number }>
    }) => post<{ audioFile: string; duration: number }>('/instruments/generate', body),

    list: () => get<Array<{ id: string; name: string; category: string }>>('/instruments/list'),
  },

  stems: {
    split: (body: {
      filePath: string
      model: 'htdemucs' | 'htdemucs_ft' | 'mdx_extra' | 'htdemucs_6s'
      stems: string[]
    }) => post<{ vocals?: string; drums?: string; bass?: string; other?: string; piano?: string; guitar?: string }>('/stems/split', body),
  },

  audioToMidi: {
    convert: (body: { filePath: string; engine?: 'auto' | 'basic-pitch' | 'muscriptor' }) =>
      post<{ midiFile: string; engine: string; warnings: string[]; notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number }> }>('/audio-to-midi', body),
    engines: () => get<{ 'basic-pitch': boolean; muscriptor: boolean; muscriptor_license: string }>('/audio-to-midi/engines'),
  },

  video: {
    analyze: (body: { filePath: string }) =>
      post<{ description: string; scenes: Array<{ start: number; end: number; mood: string }> }>('/video/analyze', body),

    generateScore: (body: { filePath: string; prompt: string; sceneAnalysis: string }) =>
      post<{ tracks: Array<{ name: string; audioFile: string }> }>('/video/generate-score', body),
  },

  ai: {
    chat: (body: {
      provider: 'claude' | 'openai'
      apiKey: string
      model: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      systemContext: string
    }) => post<string>('/ai/chat', body),

    generateChords: (body: { key: string; mode: string; bars: number; style: string }) =>
      post<{ chords: string[]; notes: unknown[] }>('/ai/generate-chords', body),

    generateLyrics: (body: { style: string; theme: string; bars: number }) =>
      post<{ lyrics: string }>('/ai/generate-lyrics', body),
  },

  music: {
    status: () => get<{ engine_installed: boolean; resources: Resources }>('/music/status'),
    loras: () => get<{ dir: string; loras: Lora[] }>('/music/loras'),
    importLora: (body: { path: string; name?: string; kind: Lora['kind'] }) =>
      post<Lora>('/music/loras/import', body),
    generate: (body: {
      prompt: string; lyrics: string; duration: number; steps: number
      instrumental: boolean; loras: Array<{ id: string; strength: number }>
    }) => post<{ jobId: string }>('/music/generate', body),
    job: (id: string) => get<MusicJob>(`/music/jobs/${id}`),
  },

  mastering: {
    master: (body: { targetPath: string; referencePath: string; bitDepth: 16 | 24 }) =>
      post<{ audioFile: string }>('/mastering/master', body),
  },

  karaoke: {
    align: (body: { audioPath: string; language?: string }) =>
      post<{ language: string; words: KaraokeWord[] }>('/karaoke/align', body),
    lrc: (body: { words: KaraokeWord[]; title?: string }) =>
      post<{ lrcFile: string; lrc: string }>('/karaoke/lrc', body),
    video: (body: { audioPath: string; words: KaraokeWord[]; aspect: '16:9' | '9:16' | '1:1' }) =>
      post<{ videoFile: string }>('/karaoke/video', body),
  },

  vst: {
    scan: (paths: string[]) => post<Array<{ path: string; name: string; vendor: string; category: string }>>('/vst/scan', { paths }),
    list: () => get<Array<{ id: string; name: string; vendor: string }>>('/vst/list'),
  }
}
