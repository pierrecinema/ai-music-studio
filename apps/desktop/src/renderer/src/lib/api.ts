const DEFAULT_BASE = 'http://127.0.0.1:38765'

// The main process picks a free port, so ask it every time (cheap IPC call).
export async function baseUrl(): Promise<string> {
  try {
    return (await window.api.server.getUrl()) || DEFAULT_BASE
  } catch {
    return DEFAULT_BASE
  }
}

export type EngineState = 'checking' | 'ready' | 'missing' | 'broken'

export interface Resources {
  vram_gb: number; ram_gb: number; low_memory: boolean; max_duration_s: number; quant: string
}
export interface Lora {
  id: string; name: string; kind: 'style' | 'artist' | 'sound'; path: string; tags: string[]
}
export interface MusicResult { audio_file: string; seed: number; duration: number }
export interface MusicJob {
  id: string; status: 'queued' | 'running' | 'done' | 'error'
  audio_file?: string; error?: string; warnings: string[]; engine?: string
  results: MusicResult[]; progress?: { done: number; total: number }
}
export interface KaraokeWord { text: string; start: number; end: number }

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${await baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }))
    throw new Error(describeError(err.detail, r.statusText))
  }
  return r.json()
}

// FastAPI sends a plain string for our own errors but a list of objects for invalid input.
function describeError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      const where = Array.isArray(d?.loc) ? d.loc.filter((x: unknown) => x !== 'body').join('.') : ''
      return `${where ? where + ': ' : ''}${d?.msg ?? JSON.stringify(d)}`
    }).join('; ')
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  return fallback
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${await baseUrl()}${path}`)
  if (!r.ok) throw new Error(r.statusText)
  return r.json()
}

export const api = {
  health: () => get<{
    status: string
    hardware?: { gpu: string; backend: string; cores: number; low_cpu: boolean }
  }>('/health'),

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
    status: () => get<{
      engine_state: EngineState; engine_error: string; engine_installed: boolean; resources: Resources
    }>('/music/status'),
    generate: (body: Record<string, unknown>) => post<{ jobId: string }>('/music/generate', body),
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
