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
  family?: 'v1' | '1.5' | 'xl' | 'unknown'      // the model it is made for (ACE-Step v1, 1.5 2B, 1.5 XL)
}
export interface MusicResult { audio_file: string; seed: number; duration: number; library_id?: string | null; title?: string; bpm?: number | null; first_beat?: number | null; loop_bars?: number | null }
export interface MusicJob {
  id: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  audio_file?: string; error?: string; warnings: string[]; engine?: string
  results: MusicResult[]; progress?: { done: number; total: number }
  // live progress from the engine
  stage?: 'load' | 'prepare' | 'render' | 'finish' | 'done'; stage_text?: string
  step?: number | null; step_total?: number | null
  device?: string
  cancel?: boolean                      // Cancel was pressed, the job stops at the next step
  created?: number; started?: number; updated?: number; stage_started?: number; downloaded_mb?: number
}
export interface MusicEngineInfo {
  id: string; name: string; kind: 'built-in' | 'planned'; description: string; license: string
  vocals: boolean; max_seconds: number; status: 'ready' | 'slow' | 'unavailable'; reason: string; usable: boolean
  min_ram: number; vram: number; note: string; recommended?: boolean; accel?: string
}
export interface Usage {
  cpu_percent: number; engine_cpu_percent: number; ram_percent: number; ram_used_gb: number; ram_total_gb: number
  engine_ram_gb: number; swap_percent: number
}
export interface CapabilityReport {
  tier: string; label: string
  machine: { cpu: string; threads: number; ram_gb: number; disk_free_gb: number; cuda: boolean; directml: boolean
    gpus: Array<{ name: string; vendor: string; vram_gb: number; cuda: boolean }> }
  features: Array<{ id: string; name: string; group: string; need: string; status: 'ready' | 'slow' | 'unavailable'; reason: string }>
}
export interface TrainItem { path: string; name: string; seconds: number | null; caption: string; lyrics: string; caption_found: boolean; guess: string }
export interface TrainPlan { preset: string; preset_text: string; rank: number; rank_text: string; max_steps: number; save_every: number; repeat_count: number; precision: string }
export interface TrainOptions {
  verdict: { status: 'ready' | 'slow' | 'unavailable'; reason: string }
  presets: Record<string, { steps: number; text: string }>; ranks: Record<string, string>; plan: TrainPlan
}
export interface TrainJob {
  id: string; status: 'queued' | 'running' | 'done' | 'error' | 'stopped'; error?: string; stage: string; stage_text: string
  step?: number | null; step_total?: number | null; loss?: number; log: string[]; warning?: string; started?: number; updated?: number
  lora?: { id: string; name: string }
}
export interface LibraryTrack {
  id: string; title: string; file: string; path: string; exists: boolean; created: number; duration: number | null
  engine: string; source: string; prompt: string; lyrics: string; seed: number | null; favorite: boolean; notes: string
  bpm?: number | null; first_beat?: number | null     // measured when the track was saved; first_beat 0 = starts on beat 1
  aligned?: boolean; original?: string; trimmed?: number   // checked for beat 1; `original` = saved untouched file
  tags?: string[]; loop_bars?: number
  stem?: string; stem_set?: string; song?: string      // stems: which part, which split, which song
}
export type ExportFormat = 'wav16' | 'wav24' | 'wav32' | 'aiff' | 'flac' | 'mp3'
export interface SampleEntry { path: string; name: string; folder: string; root: string; size: number; bpm: number | null }
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

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${await baseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }))
    throw new Error(describeError(err.detail, r.statusText))
  }
  return r.json()
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
    // the same split in the background, with progress (Stem Splitter view)
    start: (body: { filePath: string; model: 'htdemucs' | 'htdemucs_ft' | 'mdx_extra' | 'htdemucs_6s' | 'mdx_vocals' | 'mdx_4stems'; stems: string[] }) =>
      post<{ job_id: string }>('/stems/jobs', body),
    cancel: (id: string) => post<{ ok: boolean }>(`/stems/jobs/${id}/cancel`, {}),
    remix: (body: { stems: Record<string, string>; gains: Record<string, number> }) => post<{ path: string }>('/stems/remix', body),
    job: (id: string) => get<{
      status: 'running' | 'done' | 'error' | 'cancelled'; progress: number; text: string; elapsed: number
      result: Record<string, string> | null; error: string | null
    }>(`/stems/jobs/${id}`),
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
      provider: 'claude' | 'openai' | 'grok' | 'gemini' | 'ollama' | 'local'
      apiKey: string
      model: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      systemContext: string
      baseUrl?: string               // provider 'local': the address of the server on this PC
      musicEngine?: string           // the music model of Create music: used when the AI makes a song
      tools?: boolean                // let the AI use the app (make songs, ...); default on
    }) => post<{ reply: string; jobs: string[] } | string>('/ai/chat', body)
      .then((r) => (typeof r === 'string' ? { reply: r, jobs: [] as string[] } : r)),

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
    cancel: (id: string) => post<{ cancelled: boolean; status: string }>(`/music/jobs/${id}/cancel`, {}),
    engines: () => get<{ engines: MusicEngineInfo[]; recommended: string; gpu_path: boolean; gpu_models: string[] }>('/music/engines'),
  },

  train: {
    options: (songs: number) => get<TrainOptions>(`/train/options?songs=${songs}`),
    scan: (folder: string) => post<{ items: TrainItem[] }>('/train/scan', { folder }),
    dataset: (body: { name: string; items: Array<{ path: string; caption: string; lyrics: string; seconds: number | null }>; shared_tags: string }) =>
      post<{ name: string; dir: string; songs: number; minutes: number; warnings: string[] }>('/train/dataset', body),
    exportBundle: (body: { name: string; dataset_dir: string; songs: number; preset: string; rank: number }) =>
      post<{ folder: string; zip: string }>('/train/export', body),
    start: (body: { name: string; dataset_dir: string; songs: number; preset: string; rank: number }) =>
      post<{ jobId: string }>('/train/start', body),
    job: (id: string) => get<TrainJob>(`/train/jobs/${id}`),
    stop: (id: string) => post<{ stopped: boolean }>(`/train/jobs/${id}/stop`, {}),
  },

  samples: {
    folders: () => get<{ folders: string[]; ableton: string[] }>('/samples/folders'),
    addFolder: (path: string) => post<{ folders: string[] }>('/samples/folders', { path }),
    removeFolder: (path: string) => send<{ folders: string[] }>('DELETE', `/samples/folders?path=${encodeURIComponent(path)}`),
    search: (q: string, root?: string, bpm?: number) =>
      get<{ total: number; count: number; items: SampleEntry[] }>(`/samples?q=${encodeURIComponent(q)}${root ? `&root=${encodeURIComponent(root)}` : ''}${bpm ? `&bpm=${bpm}` : ''}`),
    // a long file made ratio times as long (source BPM / project BPM) on the backend: returns the new file
    stretch: (path: string, ratio: number, grid?: { firstBeat: number; bpm: number }) =>
      post<{ path: string }>('/samples/stretch', { path, ratio, ...(grid ? { first_beat: grid.firstBeat, bpm: grid.bpm } : {}) }),
    analyze: (path: string) => post<{ bpm: number | null; first_beat?: number | null; downbeat?: number | null; beats?: number; alternatives?: number[]; duration: number | null; note?: string; steady?: boolean }>('/samples/analyze', { path }),
  },

  library: {
    list: () => get<{ dir: string; tracks: LibraryTrack[] }>('/library'),
    saveStems: (body: { stems: Record<string, string>; title: string; tags: string[]; source_path?: string | null }) =>
      post<{ tracks: LibraryTrack[] }>('/library/stems', body),
    exportFiles: (body: { items: Array<{ path: string; name: string }>; folder: string; format: ExportFormat; sampleRate?: number | null }) =>
      post<{ files: string[] }>('/library/export', body),
    patch: (id: string, body: { title?: string; favorite?: boolean; notes?: string; tags?: string[] }) => send<LibraryTrack>('PATCH', `/library/${id}`, body),
    remove: (id: string, deleteFile = true) => send<{ removed: string }>('DELETE', `/library/${id}?delete_file=${deleteFile}`),
    importFile: (path: string, title = '', source = 'import', bpm: number | null = null) => post<LibraryTrack>('/library/import', { path, title, source, bpm }),
    align: (id: string) => post<{ track: LibraryTrack; trimmed: number; message: string }>(`/library/${id}/align`, {}),
    restore: (id: string) => post<LibraryTrack>(`/library/${id}/restore`, {}),
    alignAll: () => post<{ checked: number; trimmed: number; failed: string[] }>('/library/align-all', {}),
  },

  system: {
    usage: () => get<Usage>('/system/usage'),
    capabilities: (refresh = false) => get<CapabilityReport>(`/system/capabilities${refresh ? '?refresh=true' : ''}`),
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
