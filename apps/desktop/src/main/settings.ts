import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { app } from 'electron'

interface Settings {
  modelsDir?: string
  libraryDir?: string
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export const DEFAULT_MODELS_DIR = join(process.env.AMS_HOME ?? join(homedir(), '.ai-music-studio'), 'models')

export function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(file(), 'utf-8')) as Settings
  } catch {
    return {}
  }
}

export function writeSettings(patch: Settings): void {
  const next = { ...readSettings(), ...patch }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf-8')
}

/** Folder that holds every downloaded model (ACE-Step, Hugging Face cache, PyTorch hub). */
export function modelsDir(): string {
  return readSettings().modelsDir || DEFAULT_MODELS_DIR
}

/** Folder of the track library (generated songs). Documents-style location, easy to find and back up. */
export const DEFAULT_LIBRARY_DIR = join(homedir(), 'Music', 'AI Music Studio')

export function libraryDir(): string {
  return readSettings().libraryDir || DEFAULT_LIBRARY_DIR
}

export const MODEL_SUBDIRS = { acestep: 'ace-step', huggingface: 'huggingface', torch: 'torch' } as const
export type ModelId = keyof typeof MODEL_SUBDIRS

/** Environment the Python backend gets so that all its downloads end up under modelsDir(). */
export function backendModelEnv(): Record<string, string> {
  const base = modelsDir()
  return {
    AMS_ACESTEP_DIR: join(base, MODEL_SUBDIRS.acestep),
    HF_HOME: join(base, MODEL_SUBDIRS.huggingface),
    TORCH_HOME: join(base, MODEL_SUBDIRS.torch),
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
    AMS_LIBRARY_DIR: libraryDir()
  }
}
