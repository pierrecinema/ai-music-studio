// Free open-source instruments (Settings → Plugins → Free instruments): the current Windows release is taken from the
// project's official GitHub releases, unpacked into the app's own plugin folder, and found by the plugin search there.
// Nothing is bundled in the installer: each project's own release (and license) is used as it is published.
import { app, ipcMain, shell, BrowserWindow } from 'electron'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

interface FreePlugin { id: string; repo: string; assets: RegExp[]; page: string }
const FREE: FreePlugin[] = [
  // FM synthesizer modelled on the Yamaha DX7, GPL-3
  { id: 'dexed', repo: 'asb2m10/dexed', assets: [/win.*(x64|64).*\.zip$/i, /win.*\.zip$/i], page: 'https://github.com/asb2m10/dexed/releases/latest' },
  // hybrid synthesizer (wavetable, FM, virtual analog), GPL-3
  { id: 'surge', repo: 'surge-synthesizer/releases-xt', assets: [/win64.*plugins?only.*\.zip$/i, /win.*64.*\.zip$/i], page: 'https://github.com/surge-synthesizer/releases-xt/releases/latest' },
  // probability step sequencer (MIDI), GPL-3
  { id: 'stochas', repo: 'surge-synthesizer/stochas', assets: [/win.*64.*\.zip$/i, /win.*\.zip$/i], page: 'https://github.com/surge-synthesizer/stochas/releases/latest' },
  // kick drum synthesizer, BSD-3
  { id: 'chowkick', repo: 'Chowdhury-DSP/ChowKick', assets: [/win.*64.*\.zip$/i, /win.*\.zip$/i], page: 'https://github.com/Chowdhury-DSP/ChowKick/releases/latest' },
]

export function freePluginsDir(): string { return join(app.getPath('userData'), 'plugins') }

async function unzip(zip: string, dest: string): Promise<void> {
  // Windows has it built in; elsewhere unzip
  const [cmd, args] = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`]]
    : ['unzip', ['-o', zip, '-d', dest]]
  await new Promise<void>((res, rej) => {
    const p = spawn(cmd as string, args as string[], { windowsHide: true })
    p.on('error', rej)
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`unpacking failed (${c})`))))
  })
}

export function registerFreePluginHandlers(): void {
  ipcMain.handle('plugins:free-dir', () => freePluginsDir())
  ipcMain.handle('plugins:free-installed', () => Object.fromEntries(FREE.map((f) => [f.id, existsSync(join(freePluginsDir(), f.id))])))
  ipcMain.handle('plugins:free-page', (_e, id: string) => { const f = FREE.find((x) => x.id === id); if (f) void shell.openExternal(f.page) })
  ipcMain.handle('plugins:free-install', async (e, id: string) => {
    const f = FREE.find((x) => x.id === id)
    if (!f) throw new Error('unknown plugin')
    const send = (p: { done: number; total: number; text: string }): void => { BrowserWindow.fromWebContents(e.sender)?.webContents.send('plugins:free-progress', { id, ...p }) }
    send({ done: 0, total: 0, text: 'looking up the current release' })
    const rel = await fetch(`https://api.github.com/repos/${f.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AI-Music-Studio' } })
    if (!rel.ok) throw new Error(`GitHub answered ${rel.status}`)
    const j = await rel.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string; size: number }> }
    let asset: { name: string; browser_download_url: string; size: number } | undefined
    for (const re of f.assets) { asset = j.assets.find((a) => re.test(a.name)); if (asset) break }
    if (!asset) return { ok: false, reason: 'no-zip', page: f.page, tag: j.tag_name }
    const dir = join(freePluginsDir(), f.id)
    const tmp = join(app.getPath('temp'), `ams-${f.id}-${Date.now()}.zip`)
    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'AI-Music-Studio' } })
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    let done = 0
    const body = Readable.fromWeb(res.body as never)
    body.on('data', (c: Buffer) => { done += c.length; send({ done, total: asset!.size, text: 'downloading' }) })
    await pipeline(body, createWriteStream(tmp))
    send({ done, total: asset.size, text: 'unpacking' })
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    try { await unzip(tmp, dir) } finally { rmSync(tmp, { force: true }) }
    return { ok: true, dir, tag: j.tag_name, asset: asset.name }
  })
}
