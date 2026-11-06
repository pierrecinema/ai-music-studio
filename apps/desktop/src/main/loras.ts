import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, join } from 'path'

// Same folder and index format the Python backend uses, so both sides see the same LoRAs.
export const LORA_DIR = join(process.env.AMS_HOME ?? join(homedir(), '.ai-music-studio'), 'loras')
const INDEX = join(LORA_DIR, 'index.json')
const EXTS = new Set(['.safetensors', '.pt', '.bin'])

export interface LoraEntry {
  id: string
  name: string
  kind: 'style' | 'artist' | 'sound'
  path: string
  tags: string[]
  default_strength: number
  source?: string    // e.g. "huggingface:owner/name"
  license?: string
}

function readIndex(): LoraEntry[] {
  try {
    return JSON.parse(readFileSync(INDEX, 'utf-8')) as LoraEntry[]
  } catch {
    return []
  }
}

function writeIndex(items: LoraEntry[]): void {
  mkdirSync(LORA_DIR, { recursive: true })
  writeFileSync(INDEX, JSON.stringify(items, null, 2), 'utf-8')
}

export function listLoras(): { dir: string; loras: LoraEntry[] } {
  const byId = new Map(readIndex().filter((i) => existsSync(i.path)).map((i) => [i.id, i]))
  if (existsSync(LORA_DIR)) {
    for (const name of readdirSync(LORA_DIR)) {
      if (name === 'index.json') continue
      const full = join(LORA_DIR, name)
      const isDir = statSync(full).isDirectory()
      if (!isDir && !EXTS.has(extname(name).toLowerCase())) continue
      const id = isDir ? name : basename(name, extname(name))
      if (!byId.has(id)) {
        byId.set(id, { id, name: id, kind: 'style', path: full, tags: [], default_strength: 1 })
      }
    }
  }
  return { dir: LORA_DIR, loras: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)) }
}

export function importLora(
  src: string,
  kind: LoraEntry['kind'],
  name?: string,
  extra?: Pick<LoraEntry, 'source' | 'license'>
): LoraEntry {
  if (!existsSync(src)) throw new Error(`Not found: ${src}`)
  const isDir = statSync(src).isDirectory()
  if (!isDir && !EXTS.has(extname(src).toLowerCase())) {
    throw new Error(`Unsupported LoRA file type "${extname(src)}". Use .safetensors, .pt or .bin, or a folder.`)
  }
  mkdirSync(LORA_DIR, { recursive: true })
  const dest = join(LORA_DIR, basename(src))
  if (!existsSync(dest)) {
    if (isDir) cpSync(src, dest, { recursive: true })
    else copyFileSync(src, dest)
  }
  const id = isDir ? basename(dest) : basename(dest, extname(dest))
  const entry: LoraEntry = {
    id, name: name?.trim() || id, kind, path: dest, tags: [], default_strength: 1, ...extra
  }
  writeIndex([...readIndex().filter((i) => i.id !== id), entry])
  return entry
}

export function removeLora(id: string): void {
  writeIndex(readIndex().filter((i) => i.id !== id))
}
