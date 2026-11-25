// Sound packs: recorded instruments for MIDI tracks, each downloaded once from its npm registry copy, checked against
// the published SHA-512, unpacked into the app's data folder (sounds/<pack>) with its licence. The renderer plays
// them (audio/soundbank.ts). All are free for use in software:
//   GeneralUser GS (S. Christian Collins, free licence) – every General MIDI instrument, SoundFont 2
//   MuseScore General (S. Christian Collins, MIT; parts public domain / CC0) – every GM instrument, SoundFont 3
//   Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0) – grand piano, 4 velocity layers
//   VSCO-2 Community Edition (Versilian Studios, CC0) – violin and cello sections, French horn, trombone
//   Band: Sonic Pi drum kit (CC0) and electric bass / electric, acoustic, nylon guitar (tonejs-instruments, MIT)
import { app, ipcMain, BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { gunzipSync } from 'zlib'

interface Tarball { url: string; sha512: string }
interface PackSpec {
  id: string
  name: string
  what: string
  licence: string
  downloadMb: number
  diskMb: number
  kind: 'sf2' | 'multi'
  main?: string                                   // sf2 / sf3: the bank file inside the pack folder
  tarballs: Tarball[]
  keep: (path: string, tarball: number) => string | null   // a file of tarball n -> where it goes in the pack folder (null: dropped)
}

const npm = (pkg: string, ver: string, sha512: string): Tarball => {
  const base = pkg.includes('/') ? pkg.split('/')[1] : pkg
  return { url: `https://registry.npmjs.org/${pkg}/-/${base}-${ver}.tgz`, sha512 }
}

export const PACKS: PackSpec[] = [
  {
    id: 'generaluser', name: 'GeneralUser GS 1.471', what: 'All General MIDI instruments (piano, guitars, basses, drum kits, strings, brass …)', licence: 'GeneralUser GS licence v2.0 (free for use in software)',
    downloadMb: 28, diskMb: 31, kind: 'sf2', main: 'GeneralUser.sf2',
    tarballs: [npm('generaluser', '1.47.1', 'HLojVJe4MJk3Jatr0N4sHREeGyXNH75vU2RA3nNXBbqOmhpuccYByK7r8Dr7+uCpU5aCtKnT5xoK0m8P1/TWqg==')],
    keep: (p) => (p === 'package/GeneralUser.sf2' ? 'GeneralUser.sf2' : p === 'package/LICENSE.txt' ? 'LICENSE.txt' : null),
  },
  {
    id: 'musescore', name: 'MuseScore General', what: 'All General MIDI instruments in a newer, fuller recording (strings, winds, choir, pianos …)', licence: 'MIT (parts public domain / CC0), by S. Christian Collins',
    downloadMb: 48, diskMb: 40, kind: 'sf2', main: 'MuseScore_General_Lite.sf3',
    tarballs: [npm('@librescore/sf3', '0.8.0', 'XW44V1lhiLIx22xSL89+vsbolZ82DPWFOvoy03QuVtno5ugHEDxaaVu9yw8x7wMPh7t0qrLSmLOGGPPxTDRMwQ==')],
    keep: (p) => (p === 'package/MuseScore_General_Lite.sf3.wasm' ? 'MuseScore_General_Lite.sf3' : p === 'package/MuseScore_General_Lite.copyright' ? 'LICENSE.txt' : null),
  },
  {
    id: 'salamander', name: 'Salamander Grand Piano', what: 'A concert grand piano (Yamaha C5), 4 velocity layers', licence: 'CC BY 3.0, Alexander Holm',
    downloadMb: 22, diskMb: 22, kind: 'multi',
    tarballs: [
      npm('@audio-samples/piano-mp3-velocity4', '1.0.5', 'mhePiSe5z8oCpf4HoesKdY48ulWgk19/AkBgwlizP4J2Mn4RSzmjhzQyo5UH07Z9TZ0EmyF9GqHopi77Sghm+w=='),
      npm('@audio-samples/piano-mp3-velocity8', '1.0.5', 'Dqraw6baZOPi0EYE8unF2oX2WViZHPgrDMBGl4ht298XYrAKD9YqPC2QDJpwsH6KccZxW2KpxuQ0/ccMzBptmw=='),
      npm('@audio-samples/piano-mp3-velocity12', '1.0.5', 'I5NLZNX3mbu/37mr/kgH8ClQJy4Ph8I9z3WK8so080DAzMdVYPq9zY1m0UFS/pgV0watRxYG3gQ1yXG3VKpBcw=='),
      npm('@audio-samples/piano-mp3-velocity16', '1.0.5', 'DhO0NTvcl/O4KXz+xGlbGY0oDj9k6JvTB/qfpRVkHKNvoZICP7Ep20tDwe2xojS85++EsCJTv0FKLRsex/LPWQ=='),
    ],
    keep: (p) => (/^package\/audio\/[A-G]#?\dv\d+\.mp3$/.test(p) ? p.slice('package/'.length) : p === 'package/LICENSE' ? 'LICENSE.txt' : null),
  },
  {
    id: 'vsco', name: 'VSCO-2 Orchestra', what: 'Violin section, cello section, French horn and trombone (real players)', licence: 'CC0 (public domain), Versilian Studios',
    downloadMb: 330, diskMb: 220, kind: 'multi',
    tarballs: [
      npm('@minicut/music-samples-1', '1.0.0', 'DIUjmXIgTzib3fxJ4sHPWRfDsabTB/ye+DY3o0rb/wABJPyKmoWFsY6pDMICWDwNq3bVhJx/UpuJ9BViWxrZcg=='),
      npm('@minicut/music-samples-2', '1.0.0', 'TETf6WB3y8GYYPDMOE9NWZjXsg4coqSOfr/5USmDjRxztzfD6Kf5obuZlKy5IKbKrjhLwyaWUKr6p9wy3tIeIQ=='),
    ],
    keep: (p) => {
      const m = p.match(/^package\/VSCO-2-CE\/((?:Strings\/Violin Section\/susVib|Strings\/Cello Section\/susvib|Brass\/F Horn\/sus|Brass\/Tenor Trombone\/sus)\/[^/]+\.wav)$/)
      if (m) return m[1]
      return p === 'package/VSCO-2-CE/LICENSE' ? 'LICENSE.txt' : null
    },
  },
  {
    id: 'band', name: 'Band (drums, bass, guitars)', what: 'A recorded drum kit (kick, snare, hi-hats, toms, cymbals, soft and hard), electric bass, electric, acoustic and nylon guitar: the AI band plays them',
    licence: 'Drums: CC0 (Sonic Pi samples); bass and guitars: MIT (tonejs-instruments)',
    downloadMb: 47, diskMb: 20, kind: 'multi',
    tarballs: [
      npm('supersonic-scsynth-samples', '0.99.0', '4491s7ip0USC2EyfhLPmcBWVqzaWjrgxHUenlD8iArmKMHAAkOiT/j7LQpslNUOjHhO6Z8iSh3Xjvh7QrE61Uw=='),
      npm('tonejs-instrument-bass-electric-mp3', '1.1.2', 'S/dDtLMnyfS4+izpBAZBwHHKwJ2j6lOy+h6iFxQlQETUeHomtvTuQxs/UR8VYpQ7FEAeYgFVdjE1LPpeI3wL/w=='),
      npm('tonejs-instrument-guitar-electric-mp3', '1.1.1', 'DMA0dq6KI5lMA3Eo32kbKfMKgtDwWCNzXnlzhh+p5KTsY+84ySCsSbpeVU66wqcdXEOp+7zPvRzb0GorMDvP5A=='),
      npm('tonejs-instrument-guitar-acoustic-mp3', '1.1.2', '+24Jd7q2IVeR+y0yxB9oaujXFv/1gpfzbbLn3FZBQ6Fw0AWDO1CI8qM0l4YCN/4w60/cZMIT5laQ3PYB/ZN6jQ=='),
      npm('tonejs-instrument-guitar-nylon-mp3', '1.1.1', 'HXSTXWo+vXY9J20xoq4Z9gYpy6loZT0uj/WRzkMU5UP7WKjZC5pz0nQtDm2ySrtC9LpiGneSrX550a1FziUScw=='),
    ],
    // the same file name (package/A2.mp3) comes from several tarballs: they are told apart by the tarball's number
    keep: (p, k) => {
      if (k === 0) {
        const m = p.match(/^package\/samples\/(drum_[a-z_]+)\.flac$/)
        if (m) return `drums/${m[1]}.flac`
        return p === 'package/LICENSE' ? 'LICENSE.txt' : null
      }
      const m = p.match(/^package\/([A-G]s?\d)\.mp3$/)
      return m ? `${['', 'bass', 'egtr', 'agtr', 'ngtr'][k]}/${m[1]}.mp3` : null
    },
  },
]

const root = (): string => join(app.getPath('userData'), 'sounds')
// GeneralUser came first (0.84) and kept its folder name
export const packDir = (id: string): string => join(root(), id === 'generaluser' ? 'GeneralUser-GS' : id)
const installedPack = (p: PackSpec): boolean => existsSync(join(packDir(p.id), p.main ?? 'LICENSE.txt'))

/** the files of a tar archive (ustar: 512-byte header, data padded to 512) */
export function untar(tar: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let o = 0
  while (o + 512 <= tar.length) {
    const h = tar.subarray(o, o + 512)
    if (h.every((b) => b === 0)) break
    const str = (a: number, n: number): string => h.subarray(a, a + n).toString('latin1').replace(/\0.*$/s, '')
    const prefix = str(345, 155)
    const name = (prefix ? prefix + '/' : '') + str(0, 100)
    const size = parseInt(str(124, 12).trim() || '0', 8)
    const type = str(156, 1)
    if (type === '0' || type === '') out.set(name, tar.subarray(o + 512, o + 512 + size))
    o += 512 + Math.ceil(size / 512) * 512
  }
  return out
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const f = join(d, n)
      if (statSync(f).isDirectory()) walk(f); else out.push(relative(dir, f).split('\\').join('/'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

const busy = new Map<string, Promise<{ ok: boolean; error?: string }>>()

async function install(p: PackSpec, win: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
  const say = (text: string, pct?: number): void => { win?.webContents.send('sounds:progress', { id: p.id, text, pct }) }
  const dir = packDir(p.id), tmp = dir + '.tmp'
  try {
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(tmp, { recursive: true })
    for (let k = 0; k < p.tarballs.length; k++) {
      const tb = p.tarballs[k]
      const part = p.tarballs.length > 1 ? ` (${k + 1}/${p.tarballs.length})` : ''
      say(`Downloading ${p.name}${part}…`, 0)
      const res = await fetch(tb.url, { headers: { 'User-Agent': 'AI-Music-Studio' } })
      if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length') || 0)
      const parts: Buffer[] = []
      let got = 0, last = 0
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(Buffer.from(value)); got += value.length
        if (total && Date.now() - last > 250) {
          last = Date.now()
          const pct = Math.round(((k + got / total) / p.tarballs.length) * 100)
          say(`Downloading ${p.name}${part}… ${(got / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`, pct)
        }
      }
      const tgz = Buffer.concat(parts)
      if (createHash('sha512').update(tgz).digest('base64') !== tb.sha512) throw new Error('The download is damaged (checksum does not match). Please try again.')
      say(`Unpacking${part}…`, Math.round(((k + 1) / p.tarballs.length) * 100))
      for (const [from, data] of untar(gunzipSync(tgz))) {
        const to = p.keep(from, k)
        if (!to) continue
        const f = join(tmp, ...to.split('/'))
        mkdirSync(join(f, '..'), { recursive: true })
        writeFileSync(f, data)
      }
    }
    if (p.main && !existsSync(join(tmp, p.main))) throw new Error(`The pack has no ${p.main}`)
    rmSync(dir, { recursive: true, force: true })
    renameSync(tmp, dir)
    say('Installed', 100)
    return { ok: true }
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true })
    return { ok: false, error: (e as Error).message }
  }
}

function status(): { packs: unknown[]; installed: boolean; path: string; name: string; sizeMb: number } {
  const packs = PACKS.map((p) => ({
    id: p.id, name: p.name, what: p.what, licence: p.licence, downloadMb: p.downloadMb, diskMb: p.diskMb, kind: p.kind,
    installed: installedPack(p), dir: packDir(p.id),
    main: p.main ? join(packDir(p.id), p.main) : undefined,
    files: p.kind === 'multi' && installedPack(p) ? listFiles(packDir(p.id)).filter((f) => /\.(mp3|wav|ogg|flac)$/i.test(f)) : undefined,
  }))
  const gu = PACKS[0]
  // the 0.84 fields (GeneralUser) stay for older renderer code
  return { packs, installed: installedPack(gu), path: join(packDir(gu.id), gu.main!), name: gu.name, sizeMb: gu.downloadMb }
}

export function registerSoundPackHandlers(): void {
  ipcMain.handle('sounds:status', () => status())
  ipcMain.handle('sounds:install', (e, id: string = 'generaluser') => {
    const p = PACKS.find((x) => x.id === id)
    if (!p) return { ok: false, error: `unknown pack ${id}` }
    let job = busy.get(id)
    if (!job) { job = install(p, BrowserWindow.fromWebContents(e.sender)).finally(() => busy.delete(id)); busy.set(id, job) }
    return job
  })
  ipcMain.handle('sounds:remove', (_e, id: string = 'generaluser') => { rmSync(packDir(id), { recursive: true, force: true }); return true })
}
