import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'

// Only this host is ever contacted (redirects to its CDN are followed by fetch).
const HF = 'https://huggingface.co'
const UA = { 'User-Agent': 'AIMusicStudio' }
const WEIGHT_EXTS = new Set(['.safetensors', '.pt', '.bin'])
const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/

export interface HfRepo {
  id: string
  likes: number
  downloads: number
  gated: boolean
  license: string
  tags: string[]
}
export interface HfFile { name: string; size: number }

async function hfJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: UA, signal })
  if (!r.ok) throw new Error(`Hugging Face answered ${r.status} ${r.statusText}`.trim())
  return (await r.json()) as T
}

function toRepo(m: { id?: string; modelId?: string; likes?: number; downloads?: number; gated?: boolean | string; tags?: string[] }): HfRepo {
  const tags = m.tags ?? []
  return {
    id: String(m.id ?? m.modelId),
    likes: m.likes ?? 0,
    downloads: m.downloads ?? 0,
    gated: Boolean(m.gated),
    license: (tags.find((t) => t.startsWith('license:')) ?? '').slice(8),
    tags
  }
}

/** Accepts "owner/name" or a huggingface.co link and returns "owner/name", or null. */
export function parseRepo(input: string): string | null {
  const s = input.trim()
  const m = /^https?:\/\/(?:www\.)?huggingface\.co\/([^/?#\s]+\/[^/?#\s]+)/i.exec(s)
  const candidate = (m ? m[1] : s).replace(/\.git$/, '')
  return REPO_RE.test(candidate) ? candidate : null
}

const isLora = (r: HfRepo): boolean =>
  r.tags.includes('lora') || r.tags.includes('peft') || /lora|lokr/i.test(r.id)

// Repos name the model "ace-step" or "acestep" and tag it "acestep", so one query would miss many:
// ask three ways, merge, keep real LoRAs, sort by likes.
export async function searchRepos(query: string, signal?: AbortSignal): Promise<HfRepo[]> {
  const q = query.trim().replace(/\bace[- ]?step\b/gi, '').trim()
  const base = `${HF}/api/models?sort=likes&direction=-1&limit=40`
  const enc = encodeURIComponent
  const urls = [
    `${base}&search=${enc(`ace-step ${q || 'lora'}`)}`,
    `${base}&search=${enc(`acestep ${q}`.trim())}`,
    q ? `${base}&search=${enc(q)}&filter=acestep` : `${base}&filter=acestep&filter=lora`
  ]
  const settled = await Promise.allSettled(urls.map((u) => hfJson<Parameters<typeof toRepo>[0][]>(u, signal)))
  const ok = settled.filter((s): s is PromiseFulfilledResult<Parameters<typeof toRepo>[0][]> => s.status === 'fulfilled')
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason
  const merged = new Map<string, HfRepo>()
  for (const s of ok) for (const m of s.value) merged.set(String(m.id ?? m.modelId), toRepo(m))
  return [...merged.values()]
    .filter(isLora)
    .sort((a, b) => b.likes - a.likes || b.downloads - a.downloads)
    .slice(0, 40)
}

export async function listFiles(repo: string, signal?: AbortSignal): Promise<{ repo: HfRepo; files: HfFile[] }> {
  if (!REPO_RE.test(repo)) throw new Error('Not a valid Hugging Face repository name (owner/name).')
  const m = await hfJson<Parameters<typeof toRepo>[0] & { siblings?: Array<{ rfilename: string; size?: number }> }>(
    `${HF}/api/models/${repo}?blobs=true`, signal
  )
  const files = (m.siblings ?? [])
    .filter((s) => WEIGHT_EXTS.has(extname(s.rfilename).toLowerCase()))
    .map((s) => ({ name: s.rfilename, size: s.size ?? 0 }))
  return { repo: toRepo({ ...m, id: m.id ?? repo }), files }
}

// A .safetensors file starts with an 8-byte length and a JSON header: cheap proof it is not an error page.
export function checkSafetensors(path: string): number {
  const fd = openSync(path, 'r')
  try {
    const len = Buffer.alloc(8)
    if (readSync(fd, len, 0, 8, 0) !== 8) throw new Error('file too small')
    const n = Number(len.readBigUInt64LE(0))
    if (!Number.isSafeInteger(n) || n < 2 || n > 200 * 1024 * 1024) throw new Error('bad header size')
    const header = Buffer.alloc(n)
    if (readSync(fd, header, 0, n, 8) !== n) throw new Error('truncated header')
    const json = JSON.parse(header.toString('utf-8')) as Record<string, unknown>
    return Object.keys(json).filter((k) => k !== '__metadata__').length
  } catch (e) {
    throw new Error(`The downloaded file is not a valid safetensors file (${(e as Error).message}).`)
  } finally {
    closeSync(fd)
  }
}

export function localName(repo: string, file: string): string {
  const base = basename(file).replace(/[^\w.-]+/g, '_')
  return `${repo.replace('/', '__')}__${base}`
}

export async function downloadFile(
  repo: string,
  file: string,
  destDir: string,
  onProgress: (received: number, total: number) => void,
  signal: AbortSignal
): Promise<string> {
  if (!REPO_RE.test(repo)) throw new Error('Not a valid Hugging Face repository name.')
  const ext = extname(file).toLowerCase()
  if (!WEIGHT_EXTS.has(ext)) throw new Error(`Only ${[...WEIGHT_EXTS].join(', ')} files can be downloaded.`)
  if (file.split('/').some((p) => p === '..' || p === '')) throw new Error('Invalid file name.')

  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, localName(repo, file))
  const tmp = `${dest}.part`
  const url = `${HF}/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}?download=true`

  const res = await fetch(url, { headers: UA, signal })
  if (res.status === 401 || res.status === 403) {
    throw new Error('This repository is gated: accept its terms on huggingface.co first. Gated downloads are not supported yet.')
  }
  if (!res.ok || !res.body) throw new Error(`Hugging Face answered ${res.status} ${res.statusText}`.trim())

  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  let lastTick = 0
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length
      const now = Date.now()
      if (now - lastTick > 200) { lastTick = now; onProgress(received, total) }
      cb(null, chunk)
    }
  })

  try {
    await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), counter, createWriteStream(tmp), { signal })
    onProgress(received, total)
    if (total && statSync(tmp).size !== total) throw new Error('The download was incomplete. Try again.')
    if (ext === '.safetensors') checkSafetensors(tmp)
    if (existsSync(dest)) rmSync(dest, { force: true })
    renameSync(tmp, dest)
    return dest
  } catch (e) {
    rmSync(tmp, { force: true })
    if (signal.aborted) throw new Error('Download cancelled.')
    throw e
  }
}

/** The adapter_config.json that belongs to a PEFT LoRA file in the repository (same folder, or the same name
 *  prefix like "male_vocals_adapter_model" / "male_vocals_adapter_config.json"); null if there is none.
 *  Without it ACE-Step 1.5 cannot load the LoRA. */
export async function fetchAdapterConfig(repo: string, file: string, signal?: AbortSignal): Promise<string | null> {
  const m = await hfJson<{ siblings?: Array<{ rfilename: string }> }>(`${HF}/api/models/${repo}`, signal)
  const configs = (m.siblings ?? []).map((x) => x.rfilename).filter((x) => x.endsWith('adapter_config.json'))
  if (!configs.length) return null
  const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
  const base = file.slice(folder.length)
  const prefix = base.endsWith('adapter_model.safetensors') ? base.slice(0, -'adapter_model.safetensors'.length) : ''
  const wanted = [folder + prefix + 'adapter_config.json', folder + 'adapter_config.json']
  const pick = wanted.find((w) => configs.includes(w)) ?? (configs.length === 1 ? configs[0] : null)
  if (!pick) return null
  const r = await fetch(`${HF}/${repo}/resolve/main/${pick.split('/').map(encodeURIComponent).join('/')}`, { headers: UA, signal })
  if (!r.ok) return null
  const text = await r.text()
  try { if (!JSON.parse(text).peft_type) return null } catch { return null }
  return text
}
