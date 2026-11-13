import { closeSync, cpSync, copyFileSync, existsSync, openSync, readSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, join, resolve, sep } from 'path'

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
  family?: LoraFamily
}

// The model a LoRA is made for (same rules as the backend, services: ace15_adapter / lora_family):
// "1.5" = ACE-Step 1.5 (the 2B turbo): a folder with adapter_config.json; "xl" = ACE-Step 1.5 XL ("xl" in the name);
// "v1" = ACE-Step v1: weights without adapter_config.json
export type LoraFamily = 'v1' | '1.5' | 'xl' | 'unknown'

// a LoKr adapter for ACE-Step 1.5 is one .safetensors file with "lokr_config" in its header metadata
const isLokr = (file: string): boolean => {
  if (extname(file).toLowerCase() !== '.safetensors') return false
  try {
    const fd = openSync(file, 'r')
    try {
      const len = Buffer.alloc(8)
      readSync(fd, len, 0, 8, 0)
      const n = Number(len.readBigUInt64LE(0))
      if (n <= 0 || n > 64 * 1024 * 1024) return false
      const head = Buffer.alloc(n)
      readSync(fd, head, 0, n, 8)
      const meta = (JSON.parse(head.toString('utf-8')) as { __metadata__?: Record<string, string> }).__metadata__
      return !!meta?.lokr_config
    } finally { closeSync(fd) }
  } catch { return false }
}

const hasAdapterConfig = (dir: string, depth = 4): boolean => {
  try {
    if (existsSync(join(dir, 'adapter_config.json'))) return true
    if (depth <= 0) return false
    return readdirSync(dir).some((n) => { const f = join(dir, n); return statSync(f).isDirectory() && hasAdapterConfig(f, depth - 1) })
  } catch { return false }
}

export function loraFamily(path: string, name: string): LoraFamily {
  if (/(^|[^a-z])xl([^a-z]|$)|xlsft|xl-sft|xl_sft/.test(name.toLowerCase())) return 'xl'
  try {
    if (statSync(path).isDirectory()) {
      if (hasAdapterConfig(path)) return '1.5'
      const files = readdirSync(path).filter((n) => EXTS.has(extname(n).toLowerCase()))
      if (files.some((n) => isLokr(join(path, n)))) return '1.5'
      return files.length ? 'v1' : 'unknown'
    }
    if (isLokr(path)) return '1.5'
    return EXTS.has(extname(path).toLowerCase()) ? 'v1' : 'unknown'
  } catch { return 'unknown' }
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
      if (name === 'index.json' || name.startsWith('.')) continue   // ".engine" holds staged adapters
      const full = join(LORA_DIR, name)
      const isDir = statSync(full).isDirectory()
      if (!isDir && !EXTS.has(extname(name).toLowerCase())) continue
      // a pack of several LoRAs (one folder each, like "...-5-LoRAs"): each one on its own
      if (isDir && !existsSync(join(full, 'adapter_config.json'))) {
        const subs = readdirSync(full).filter((n) => { const f = join(full, n); return statSync(f).isDirectory() && existsSync(join(f, 'adapter_config.json')) })
        if (subs.length) {
          for (const sn of subs.sort()) {
            const id = `${name}/${sn}`
            if (!byId.has(id)) byId.set(id, { id, name: `${name} / ${sn}`, kind: 'style', path: join(full, sn), tags: [], default_strength: 1 })
          }
          continue
        }
      }
      const id = isDir ? name : basename(name, extname(name))
      if (!byId.has(id)) {
        byId.set(id, { id, name: id, kind: 'style', path: full, tags: [], default_strength: 1 })
      }
    }
  }
  return { dir: LORA_DIR, loras: [...byId.values()].map((l) => ({ ...l, family: loraFamily(l.path, l.name) })).sort((a, b) => a.name.localeCompare(b.name)) }
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

/** Delete the LoRA file or folder from disk and from the index (only inside the LoRA folder). */
export function deleteLora(id: string): void {
  const entry = listLoras().loras.find((l) => l.id === id)
  if (!entry) return
  const target = resolve(entry.path)
  if (!target.toLowerCase().startsWith(resolve(LORA_DIR).toLowerCase() + sep)) {
    throw new Error('Only LoRAs inside the LoRA folder can be deleted.')
  }
  rmSync(target, { recursive: true, force: true })
  removeLora(id)
}
