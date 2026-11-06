import {
  copyFileSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync,
  readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync
} from 'fs'
import { dirname, join, parse, resolve, sep } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { promises as fsp } from 'fs'
import { homedir } from 'os'
import { app } from 'electron'
import { listLoras, LORA_DIR } from './loras'
import { DEFAULT_MODELS_DIR, MODEL_SUBDIRS, type ModelId, modelsDir, writeSettings } from './settings'
import { isInstalling, pipCacheDir, venvDir } from './engines'

export type ModelStatus = 'missing' | 'partial' | 'downloading' | 'complete'
export interface Component { name: string; bytes: number }
export interface ModelEntry {
  id: ModelId
  name: string
  description: string
  dir: string
  bytes: number
  status: ModelStatus
  components: Component[]
}
export interface LoraRow {
  id: string; name: string; kind: string; bytes: number; source?: string; license?: string
}
export type CacheId = 'pip-shared' | 'pip-app' | 'updater'
// bytes is null while a large folder is still being counted in the background
export interface CacheEntry { id: CacheId; name: string; description: string; path: string; bytes: number | null }

export interface Overview {
  caches: CacheEntry[]
  baseDir: string
  defaultDir: string
  usingDefault: boolean
  free: number
  total: number
  models: ModelEntry[]
  loras: LoraRow[]
  loraDir: string
  env: { path: string; bytes: number | null }
}

const GB = 1024 ** 3
// Components ACE-Step v1 needs, as they appear in its Hugging Face snapshot
const ACESTEP_PARTS = ['ace_step_transformer', 'music_dcae_f8c8', 'music_vocoder', 'umt5-base']

// ── sizes ────────────────────────────────────────────────────────────────────

/** Bytes of real files; symlinks are skipped so a Hugging Face cache is not counted twice. */
export function dirBytes(path: string): number {
  let total = 0
  let entries
  try { entries = readdirSync(path, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    const p = join(path, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) total += dirBytes(p)
    else if (e.isFile()) { try { total += lstatSync(p).size } catch { /* vanished */ } }
  }
  return total
}

/** Same count, but asynchronous: yields to the event loop so the app stays responsive. */
export async function dirBytesAsync(path: string): Promise<number> {
  let total = 0
  const stack = [path]
  while (stack.length) {
    const dir = stack.pop() as string
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
    await Promise.all(entries.map(async (e) => {
      if (e.isSymbolicLink()) return
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) { try { total += (await fsp.lstat(p)).size } catch { /* vanished */ } }
    }))
  }
  return total
}

// Folders with tens of thousands of files (the Python environment, pip's cache) take seconds to count.
// They are counted in the background and served from memory: callers never wait for them.
interface Slow { value: number | null; at: number; running: boolean }
const slow = new Map<string, Slow>()

/** Last known size, or null while the first count is still running. */
export function cachedBytes(path: string, ttlMs: number): number | null {
  let s = slow.get(path)
  if (!s) { s = { value: null, at: 0, running: false }; slow.set(path, s) }
  if (!s.running && Date.now() - s.at > ttlMs) {
    s.running = true
    const entry = s
    void dirBytesAsync(path)
      .then((v) => { entry.value = v })
      .catch(() => { /* keep the old value */ })
      .finally(() => { entry.at = Date.now(); entry.running = false })
  }
  return s.value
}

function setCachedBytes(path: string, value: number): void {
  slow.set(path, { value, at: Date.now(), running: false })
}

/** Bytes of what a path points to, following symlinks (used per component of a snapshot). */
function resolvedBytes(path: string): number {
  try {
    const st = statSync(path)
    if (!st.isDirectory()) return st.size
    return readdirSync(path).reduce((sum, n) => sum + resolvedBytes(join(path, n)), 0)
  } catch {
    return 0
  }
}

function findFiles(dir: string, test: (name: string) => boolean, out: string[] = []): string[] {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) findFiles(p, test, out)
    else if (test(e.name)) out.push(p)
  }
  return out
}

function downloading(dir: string): { any: boolean; recent: boolean } {
  const files = findFiles(dir, (n) => n.endsWith('.incomplete'))
  const recent = files.some((f) => { try { return Date.now() - statSync(f).mtimeMs < 60_000 } catch { return false } })
  return { any: files.length > 0, recent }
}

// ── Hugging Face cache layout: models--owner--name/{blobs,snapshots/<rev>} ───

function snapshotComponents(cacheDir: string): Component[][] {
  const result: Component[][] = []
  let repos
  try { repos = readdirSync(cacheDir, { withFileTypes: true }) } catch { return result }
  for (const r of repos) {
    if (!r.isDirectory() || !r.name.startsWith('models--')) continue
    const snaps = join(cacheDir, r.name, 'snapshots')
    let revs: string[] = []
    try { revs = readdirSync(snaps) } catch { /* none */ }
    const rev = revs
      .map((n) => ({ n, t: (() => { try { return statSync(join(snaps, n)).mtimeMs } catch { return 0 } })() }))
      .sort((a, b) => b.t - a.t)[0]
    if (!rev) { result.push([{ name: r.name.replace(/^models--/, '').replace('--', '/'), bytes: dirBytes(join(cacheDir, r.name)) }]); continue }
    const repoName = r.name.replace(/^models--/, '').replace('--', '/')
    const comps = readdirSync(join(snaps, rev.n))
      .map((n) => ({ name: `${repoName}  ›  ${n}`, bytes: resolvedBytes(join(snaps, rev.n, n)) }))
      .filter((c) => c.bytes > 1024 * 1024)
    result.push(comps)
  }
  return result
}

function acestepEntry(base: string): ModelEntry {
  const dir = join(base, MODEL_SUBDIRS.acestep)
  const bytes = dirBytes(dir)
  const repoDir = join(dir, 'models--ACE-Step--ACE-Step-v1-3.5B', 'snapshots')
  let components: Component[] = []
  try {
    const rev = readdirSync(repoDir)
      .map((n) => ({ n, t: statSync(join(repoDir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]
    if (rev) {
      components = ACESTEP_PARTS
        .filter((p) => existsSync(join(repoDir, rev.n, p)))
        .map((p) => ({ name: p, bytes: resolvedBytes(join(repoDir, rev.n, p)) }))
    }
  } catch { /* not downloaded yet */ }
  const dl = downloading(dir)
  let status: ModelStatus
  if (bytes === 0) status = 'missing'
  else if (dl.recent) status = 'downloading'
  else if (components.length === ACESTEP_PARTS.length && !dl.any) status = 'complete'
  else status = 'partial'
  return {
    id: 'acestep',
    name: 'ACE-Step v1 (3.5B): music generator',
    description: 'Loaded on the first song. This is the model Create music uses.',
    dir, bytes, status, components
  }
}

function hfEntry(base: string): ModelEntry {
  const dir = join(base, MODEL_SUBDIRS.huggingface)
  const hub = join(dir, 'hub')
  const bytes = dirBytes(dir)
  const components = snapshotComponents(hub).flat()
  const dl = downloading(dir)
  return {
    id: 'huggingface',
    name: 'Hugging Face cache',
    description: 'Lyric timing (Whisper), MuScriptor and other helper models. Loaded on first use.',
    dir, bytes,
    status: bytes === 0 ? 'missing' : dl.recent ? 'downloading' : dl.any ? 'partial' : 'complete',
    components
  }
}

function torchEntry(base: string): ModelEntry {
  const dir = join(base, MODEL_SUBDIRS.torch)
  const bytes = dirBytes(dir)
  const components = findFiles(dir, (n) => /\.(th|pt|pth|ckpt|safetensors)$/.test(n))
    .map((f) => ({ name: f.slice(dir.length + 1), bytes: (() => { try { return statSync(f).size } catch { return 0 } })() }))
  return {
    id: 'torch',
    name: 'PyTorch hub (Demucs stem models)',
    description: 'Loaded the first time you split stems.',
    dir, bytes, status: bytes === 0 ? 'missing' : 'complete', components
  }
}

function nearestExisting(p: string): string {
  let cur = resolve(p)
  while (!existsSync(cur) && dirname(cur) !== cur) cur = dirname(cur)
  return cur
}

export async function diskSpace(path: string): Promise<{ free: number; total: number }> {
  try {
    const s = await fsp.statfs(nearestExisting(path))
    return { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }
  } catch {
    return { free: 0, total: 0 }
  }
}

let spaceCache: { path: string; at: number; value: { free: number; total: number }; running: boolean } | null = null
function cachedSpace(path: string): { free: number; total: number } {
  if (!spaceCache || spaceCache.path !== path) spaceCache = { path, at: 0, value: { free: 0, total: 0 }, running: false }
  const c = spaceCache
  if (!c.running && Date.now() - c.at > 10_000) {
    c.running = true
    void diskSpace(path).then((v) => { c.value = v }).finally(() => { c.at = Date.now(); c.running = false })
  }
  return c.value
}

// ── caches: only these exact folders can ever be cleared ─────────────────────

function cachePaths(): Record<CacheId, Omit<CacheEntry, 'id' | 'bytes'>> {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return {
    'pip-shared': {
      name: 'pip download cache',
      description: 'Downloaded Python packages, shared with other Python programs on this PC. Only costs download time if cleared.',
      path: join(local, 'pip', 'Cache')
    },
    'pip-app': {
      name: 'Installer leftovers',
      description: 'Packages kept after an engine install that did not finish.',
      path: pipCacheDir()
    },
    updater: {
      name: 'Downloaded app updates',
      description: 'Installers of earlier updates. A new update is downloaded again when needed.',
      path: join(local, `${app.getName()}-updater`)
    }
  }
}

export function getCaches(): CacheEntry[] {
  return (Object.entries(cachePaths()) as Array<[CacheId, ReturnType<typeof cachePaths>[CacheId]]>)
    .map(([id, c]) => ({ id, ...c, bytes: cachedBytes(c.path, 30_000) }))
}

export async function clearCache(id: string): Promise<number> {
  if (isInstalling()) throw new Error('An engine install is running. Wait until it has finished.')
  const entry = cachePaths()[id as CacheId]
  if (!entry) throw new Error('Unknown cache.')
  const freed = await dirBytesAsync(entry.path)
  await fsp.rm(entry.path, { recursive: true, force: true })
  setCachedBytes(entry.path, 0)
  return freed
}

export function getOverview(): Overview {
  const base = modelsDir()
  const { free, total } = cachedSpace(base)
  const loras = listLoras().loras.map((l) => ({
    id: l.id, name: l.name, kind: l.kind, bytes: resolvedBytes(l.path), source: l.source, license: l.license
  }))
  return {
    caches: getCaches(),
    baseDir: base,
    defaultDir: DEFAULT_MODELS_DIR,
    usingDefault: resolve(base).toLowerCase() === resolve(DEFAULT_MODELS_DIR).toLowerCase(),
    free, total,
    models: [acestepEntry(base), hfEntry(base), torchEntry(base)],
    loras,
    loraDir: LORA_DIR,
    env: { path: venvDir(), bytes: cachedBytes(venvDir(), 120_000) }
  }
}

// ── delete ───────────────────────────────────────────────────────────────────

export function deleteModel(id: ModelId): void {
  const sub = MODEL_SUBDIRS[id]
  if (!sub) throw new Error('Unknown model.')
  // always exactly <models folder>/<known sub folder>, never a path from the page
  rmSync(join(modelsDir(), sub), { recursive: true, force: true })
}

// ── move the models folder ───────────────────────────────────────────────────

class Cancelled extends Error { constructor() { super('Moving was cancelled. Nothing was changed.') } }

interface Counter { copied: number }

async function copyTree(src: string, dest: string, counter: Counter, tick: () => void): Promise<void> {
  mkdirSync(dest, { recursive: true })
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name)
    const d = join(dest, e.name)
    if (e.isSymbolicLink()) {
      // keep the Hugging Face layout: snapshots/<rev>/file -> ../../blobs/<hash>
      const target = readlinkSync(s)
      try {
        symlinkSync(target, d, 'file')
      } catch {
        copyFileSync(realpathSync(s), d)   // no symlink right: store the file itself
      }
    } else if (e.isDirectory()) {
      await copyTree(s, d, counter, tick)
    } else if (e.isFile()) {
      await pipeline(
        createReadStream(s),
        new Transform({ transform(chunk: Buffer, _enc, cb) { counter.copied += chunk.length; tick(); cb(null, chunk) } }),
        createWriteStream(d)
      )
      if (statSync(d).size !== statSync(s).size) throw new Error(`Copy of ${e.name} is incomplete.`)
    }
  }
}

export interface MoveProgress { copied: number; total: number; phase: 'copying' | 'cleaning' | 'done' }

export async function moveModels(
  newBase: string,
  onProgress: (p: MoveProgress) => void,
  isCancelled: () => boolean,
  opts: { forceCopy?: boolean } = {}   // forceCopy: skip the fast rename path (used by tests)
): Promise<{ bytes: number; baseDir: string }> {
  const oldBase = resolve(modelsDir())
  const target = resolve(newBase)
  const lo = (p: string): string => p.toLowerCase()
  if (lo(oldBase) === lo(target)) throw new Error('This already is the models folder.')
  if (lo(target).startsWith(lo(oldBase) + sep) || lo(oldBase).startsWith(lo(target) + sep)) {
    throw new Error('The new folder must not be inside the current one (or the other way round).')
  }

  mkdirSync(target, { recursive: true })
  const probe = join(target, '.ams-write-test')
  try { writeFileSync(probe, 'x'); rmSync(probe) } catch { throw new Error('This folder is not writable.') }

  const subs = Object.values(MODEL_SUBDIRS).filter((s) => dirBytes(join(oldBase, s)) > 0)
  const total = subs.reduce((sum, s) => sum + dirBytes(join(oldBase, s)), 0)
  const sameDrive = lo(parse(oldBase).root) === lo(parse(target).root)
  const targetFree = (await diskSpace(target)).free
  if (!sameDrive && targetFree < total + GB) {
    throw new Error(`Not enough free space: ${(total / GB).toFixed(1)} GB needed plus 1 GB reserve, ${(targetFree / GB).toFixed(1)} GB free.`)
  }
  for (const s of subs) {
    const d = join(target, s)
    if (existsSync(d) && readdirSync(d).length > 0) throw new Error(`${d} already contains data. Choose an empty folder.`)
  }

  const done: Array<{ src: string; dest: string; how: 'rename' | 'copy' }> = []
  const counter: Counter = { copied: 0 }
  let last = 0
  const tick = (): void => {
    if (isCancelled()) throw new Cancelled()
    const now = Date.now()
    if (now - last > 250) { last = now; onProgress({ copied: counter.copied, total, phase: 'copying' }) }
  }

  try {
    for (const s of subs) {
      const src = join(oldBase, s)
      const dest = join(target, s)
      if (sameDrive && !opts.forceCopy) {
        try {
          rmSync(dest, { recursive: true, force: true })
          renameSync(src, dest)
          counter.copied += dirBytes(dest)
          done.push({ src, dest, how: 'rename' })
          continue
        } catch { /* fall back to copying */ }
      }
      done.push({ src, dest, how: 'copy' })
      await copyTree(src, dest, counter, tick)
    }
  } catch (e) {
    for (const d of done.reverse()) {       // undo: put back what was renamed, drop what was copied
      if (d.how === 'rename') { try { renameSync(d.dest, d.src) } catch { /* best effort */ } }
      else rmSync(d.dest, { recursive: true, force: true })
    }
    throw e
  }

  writeSettings({ modelsDir: target })
  onProgress({ copied: counter.copied, total, phase: 'cleaning' })
  for (const d of done) if (d.how === 'copy') rmSync(d.src, { recursive: true, force: true })
  onProgress({ copied: total, total, phase: 'done' })
  return { bytes: total, baseDir: target }
}

export function resetModelsDir(): void {
  writeSettings({ modelsDir: undefined })
}
