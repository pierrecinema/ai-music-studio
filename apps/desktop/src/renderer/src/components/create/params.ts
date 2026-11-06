export interface MusicParams {
  title: string
  prompt: string
  lyrics: string
  instrumental: boolean
  language: string
  voice: 'any' | 'male' | 'female'
  duration: string          // '' = auto
  bpm: string
  key: string
  timeSignature: string
  sourceTrack: string
  sourceTask: 'cover' | 'repaint' | 'extend'
  sourceStrength: number
  timbreReference: string
  selectedLoras: Record<string, number>
  loraLayers: Record<LayerKey, number>
  think: boolean
  steps: number
  songs: number
  variations: number
  queue: number
  randomizeSeed: boolean
  seed: string
  rewriteStyle: boolean
  temperature: number
  cfgScale: number
  topP: number
  topK: number
  melodicVariation: number
  negativePrompt: string
  lmSeed: string
  audioCodes: string
  guidance: number
  shift: number
  solver: string
  schedule: string
  dcwMode: string
  dcwStrength: number
  dcwHighBand: number
  customTimesteps: string
  retake: number
  latentShift: number
  latentScale: number
  mp3Bitrate: number
  format: 'flac' | 'mp3' | 'wav'
  fadeIn: number
  fadeOut: number
}

export type LayerKey = 'self_attention' | 'cross_attention' | 'mlp' | 'condition' | 'time' | 'input'

export const LAYERS: Array<{ key: LayerKey; label: string }> = [
  { key: 'self_attention', label: 'Self-attention' },
  { key: 'cross_attention', label: 'Cross-attention' },
  { key: 'mlp', label: 'MLP' },
  { key: 'condition', label: 'Condition' },
  { key: 'time', label: 'Time' },
  { key: 'input', label: 'Input' },
]

export const DEFAULT_PARAMS: MusicParams = {
  title: '',
  prompt: '',
  lyrics: '',
  instrumental: false,
  language: 'English',
  voice: 'any',
  duration: '',
  bpm: '',
  key: '',
  timeSignature: '',
  sourceTrack: '',
  sourceTask: 'cover',
  sourceStrength: 0.7,
  timbreReference: '',
  selectedLoras: {},
  loraLayers: { self_attention: 1, cross_attention: 1, mlp: 1, condition: 1, time: 1, input: 1 },
  think: false,
  steps: 40,
  songs: 1,
  variations: 1,
  queue: 1,
  randomizeSeed: true,
  seed: '',
  rewriteStyle: false,
  temperature: 0.85,
  cfgScale: 2.0,
  topP: 0.9,
  topK: 0,
  melodicVariation: 1.0,
  negativePrompt: '',
  lmSeed: '',
  audioCodes: '',
  guidance: 15,
  shift: 3.0,
  solver: 'euler',
  schedule: 'linear-quadratic',
  dcwMode: 'off',
  dcwStrength: 0.1,
  dcwHighBand: 0,
  customTimesteps: '',
  retake: 0,
  latentShift: 0,
  latentScale: 1,
  mp3Bitrate: 320,
  format: 'flac',
  fadeIn: 0,
  fadeOut: 0,
}

export const GENRES = [
  'grunge', 'trance', 'afro-cuban jazz', 'cape verdean', 'garage', 'acoustic rock', 'deep house',
  'lofi hip hop', 'synthwave', 'orchestral cinematic', 'drum and bass', 'bossa nova', 'techno',
  'indie folk', 'reggae', 'ambient', 'funk', 'k-pop', 'afro house', 'dream pop',
]

export const LANGUAGES = [
  'English', 'German', 'French', 'Spanish', 'Italian', 'Portuguese', 'Chinese', 'Japanese',
  'Korean', 'Russian', 'Dutch', 'Turkish', 'Arabic', 'Hindi',
]

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  .flatMap((k) => [`${k} major`, `${k} minor`])

export const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '5/4', '7/8', '12/8']

const num = (s: string): number | null => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}

// Request body for POST /music/generate (snake_case, matches the Python model)
export function toRequest(p: MusicParams): Record<string, unknown> {
  return {
    title: p.title,
    prompt: p.prompt,
    lyrics: p.lyrics,
    instrumental: p.instrumental,
    language: p.language,
    voice: p.voice,
    duration: num(p.duration),
    bpm: num(p.bpm),
    key: p.key || null,
    time_signature: p.timeSignature || null,
    source_track: p.sourceTrack || null,
    source_task: p.sourceTask,
    source_strength: p.sourceStrength,
    timbre_reference: p.timbreReference || null,
    loras: Object.entries(p.selectedLoras).map(([id, strength]) => ({ id, strength })),
    lora_layers: p.loraLayers,
    think: p.think,
    steps: p.steps,
    songs: p.songs,
    variations: p.variations,
    queue: p.queue,
    randomize_seed: p.randomizeSeed,
    seed: p.randomizeSeed ? null : num(p.seed),
    rewrite_style: p.rewriteStyle,
    temperature: p.temperature,
    cfg_scale: p.cfgScale,
    top_p: p.topP,
    top_k: p.topK,
    melodic_variation: p.melodicVariation,
    negative_prompt: p.negativePrompt,
    lm_seed: num(p.lmSeed),
    audio_codes: p.audioCodes,
    guidance: p.guidance,
    shift: p.shift,
    solver: p.solver,
    schedule: p.schedule,
    dcw: { mode: p.dcwMode, strength: p.dcwStrength, high_band: p.dcwHighBand },
    custom_timesteps: p.customTimesteps,
    retake: p.retake,
    latent_shift: p.latentShift,
    latent_scale: p.latentScale,
    output_format: p.format,
    mp3_bitrate: p.mp3Bitrate,
    fade_in: p.fadeIn,
    fade_out: p.fadeOut,
  }
}
