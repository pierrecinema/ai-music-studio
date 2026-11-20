// The sound pack: GeneralUser GS (General MIDI SoundFont by S. Christian Collins, free for use in software; see its
// LICENSE.txt, which is kept next to it). Downloaded once (about 28 MB) from the npm registry copy of the bank, checked
// against its published SHA-512, and unpacked into the app's data folder. The renderer plays it (audio/soundbank.ts).
import { app, ipcMain, BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gunzipSync } from 'zlib'

const PACK = {
  name: 'GeneralUser GS 1.471',
  url: 'https://registry.npmjs.org/generaluser/-/generaluser-1.47.1.tgz',
  sha512: 'HLojVJe4MJk3Jatr0N4sHREeGyXNH75vU2RA3nNXBbqOmhpuccYByK7r8Dr7+uCpU5aCtKnT5xoK0m8P1/TWqg==',
  files: { 'package/GeneralUser.sf2': 'GeneralUser.sf2', 'package/LICENSE.txt': 'LICENSE.txt' } as Record<string, string>
}

export function soundPackDir(): string { return join(app.getPath('userData'), 'sounds', 'GeneralUser-GS') }
export function soundPackFile(): string { return join(soundPackDir(), 'GeneralUser.sf2') }

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

let busy: Promise<{ ok: boolean; error?: string }> | null = null

async function install(win: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
  const say = (text: string, pct?: number): void => { win?.webContents.send('sounds:progress', { text, pct }) }
  try {
    say(`Downloading ${PACK.name}…`, 0)
    const res = await fetch(PACK.url, { headers: { 'User-Agent': 'AI-Music-Studio' } })
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || 0)
    const parts: Buffer[] = []
    let got = 0, last = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(Buffer.from(value)); got += value.length
      if (total && Date.now() - last > 250) { last = Date.now(); say(`Downloading ${PACK.name}… ${(got / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`, Math.round((got / total) * 100)) }
    }
    const tgz = Buffer.concat(parts)
    if (createHash('sha512').update(tgz).digest('base64') !== PACK.sha512) throw new Error('The download is damaged (checksum does not match). Please try again.')
    say('Unpacking…', 100)
    const files = untar(gunzipSync(tgz))
    const dir = soundPackDir(), tmp = dir + '.tmp'
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(tmp, { recursive: true })
    for (const [from, to] of Object.entries(PACK.files)) {
      const f = files.get(from)
      if (!f) throw new Error(`The pack has no ${from}`)
      writeFileSync(join(tmp, to), f)
    }
    rmSync(dir, { recursive: true, force: true })
    renameSync(tmp, dir)
    say('Installed', 100)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function registerSoundPackHandlers(): void {
  ipcMain.handle('sounds:status', () => ({ installed: existsSync(soundPackFile()), path: soundPackFile(), name: PACK.name, sizeMb: 28 }))
  ipcMain.handle('sounds:install', (e) => {
    busy ??= install(BrowserWindow.fromWebContents(e.sender)).finally(() => { busy = null })
    return busy
  })
  ipcMain.handle('sounds:remove', () => { rmSync(soundPackDir(), { recursive: true, force: true }); return true })
}
