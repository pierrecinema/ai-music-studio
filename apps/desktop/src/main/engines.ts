import { spawn, execFile, ChildProcess } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statfsSync, writeFileSync } from 'fs'
import { tmpdir, totalmem, cpus } from 'os'
import https from 'https'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { modelsDir } from './settings'

export interface EngineStatus {
  pythonFound: boolean
  pythonVersion: string | null
  pythonOk: boolean                 // a Python 3.10 to 3.12 is there (the engines need one); else the app installs 3.11
  pythonBundled: boolean            // the app's own Python 3.11 (installed by the app) is there
  diskFreeGb: number | null         // free space on the drive of the app's data (engines and models go there)
  ramGb: number
  cpu: string
  venvReady: boolean
  installed: Record<string, boolean>
  gpu: 'nvidia' | 'amd' | 'none'
  serverReady: boolean
}

interface PythonCmd { cmd: string; args: string[]; version: string }

const MIN_PYTHON: [number, number] = [3, 10]

// pip package names (lower case, "_" written as "-") that show a group is installed.
// ACE-Step is published as "ace_step", so both spellings are accepted.
const GROUP_PROBE: Record<string, string[]> = {
  core: ['fastapi'],
  torch: ['torch'],
  demucs: ['demucs'],
  basicpitch: ['basic-pitch'],
  matchering: ['matchering'],
  whisper: ['faster-whisper'],
  acestep: ['ace-step', 'acestep'],
  muscriptor: ['muscriptor'],
  musicgen: ['transformers'],   // MusicGen runs as soon as transformers is there (ACE-Step brings it)
  training: ['peft', 'pytorch-lightning'],
  video: ['opencv-python-headless', 'opencv-python']
}

export function serverDir(): string {
  return is.dev ? join(app.getAppPath(), '../server') : join(process.resourcesPath, 'server')
}

export function venvDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv')
}

export function venvPython(): string {
  return join(venvDir(), 'Scripts', 'python.exe')
}

// pip's download cache for our installs: kept apart from the shared one in %LOCALAPPDATA%\pip so that
// a multi-GB torch download does not pile up there, and emptied after a successful install.
export function pipCacheDir(): string {
  return join(app.getPath('userData'), 'engines', 'pip-cache')
}

// A second, separate environment for graphics cards of AMD and Intel (DirectX 12 via torch-directml).
// torch-directml needs PyTorch 2.4.1, which must not replace the PyTorch of the main environment.
export function dmlDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-dml')
}

export function dmlPython(): string {
  return join(dmlDir(), 'Scripts', 'python.exe')
}

export function hasDml(): boolean {
  return existsSync(join(dmlDir(), 'Lib', 'site-packages', 'torch_directml'))
}

// DiffRhythm: full songs in one go. It is not a pip package: its repository is cloned next to the models
// and runs in its own environment (it pins PyTorch 2.6 and old library versions).
export function drDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-dr')
}

export function drPython(): string {
  return join(drDir(), 'Scripts', 'python.exe')
}

export function drRepo(): string {
  return join(modelsDir(), 'diffrhythm', 'DiffRhythm')
}

// The built-in singer (SoulX-Singer, Apache 2.0): its own environment with the PyTorch and Transformers versions it
// was made with, so it cannot disturb the other engines; the model (2.8 GB) and whisper-base live next to the models.
export function singerDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-singer')
}

export function singerPython(): string {
  return join(singerDir(), 'Scripts', 'python.exe')
}

export function singerModels(): string {
  return join(modelsDir(), 'soulx-singer')
}

export function hasSinger(): boolean {
  return existsSync(singerPython()) && existsSync(join(singerModels(), 'SoulX-Singer', 'model.pt')) &&
    existsSync(join(singerModels(), 'whisper-base', 'config.json'))
}

export function hasDr(): boolean {
  return existsSync(drPython()) && existsSync(join(drRepo(), 'infer', 'infer.py'))
}

// ACE-Step 1.5: songs with vocals that also run on a CPU (2B turbo model, 8 steps). Like DiffRhythm it is not a
// pip package: the repository is cloned next to the models and installed into its own environment.
export function ace15Dir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-ace15')
}

export function ace15Python(): string {
  return join(ace15Dir(), 'Scripts', 'python.exe')
}

export function ace15Repo(): string {
  return join(modelsDir(), 'ace-step-1.5', 'ACE-Step-1.5')
}

export function ace15Checkpoints(): string {
  return join(modelsDir(), 'ace-step-1.5', 'checkpoints')
}

export function hasAce15(): boolean {
  return existsSync(ace15Python()) && existsSync(join(ace15Repo(), 'acestep', 'inference.py'))
}

// Fast vocal / instrumental separation (MDX-Net ONNX models through audio-separator). Its own environment: it needs
// NumPy 2 and ONNX Runtime, which must not change the main environment. On AMD / Intel it uses DirectML, on NVIDIA CUDA.
export function sepDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-separator')
}

export function sepPython(): string {
  return join(sepDir(), 'Scripts', 'python.exe')
}

export function sepModels(): string {
  return join(modelsDir(), 'separator')
}

export function hasSep(): boolean {
  return existsSync(join(sepDir(), 'Lib', 'site-packages', 'audio_separator'))
}

// AI Instruments (MIDI-DDSP, Google Magenta): notes played like a real violin, flute, trumpet ... Its own environment,
// because it runs on TensorFlow 2.15 (Python 3.9 to 3.11), which must not meet the PyTorch of the other engines.
export function ddspDir(): string {
  return join(app.getPath('userData'), 'engines', 'venv-ddsp')
}

export function ddspPython(): string {
  return join(ddspDir(), 'Scripts', 'python.exe')
}

export function hasDdsp(): boolean {
  return existsSync(join(ddspDir(), 'Lib', 'site-packages', 'midi_ddsp'))
}

export function hasVenv(): boolean {
  return existsSync(venvPython())
}

// Everything below runs other programs. It must be asynchronous: a synchronous call freezes
// the whole app (window, dialogs, menus) for as long as the program needs.
function capture(cmd: string, args: string[], timeout = 15000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf-8', windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? ((err as unknown as { code: number }).code) : 1) : 0
      resolve({ code, out: `${stdout}${stderr}` })
    })
  })
}

// The app's own Python 3.11: installed by the app itself (python.org installer, for this user only, no admin, not on
// PATH) when the PC has no Python 3.10 to 3.12. All engines have packages for 3.11.
const PY_VERSION = '3.11.9'
export function bundledPythonDir(): string {
  return join(app.getPath('userData'), 'python311')
}
export function bundledPython(): string {
  return join(bundledPythonDir(), 'python.exe')
}

/** free space (GB) on the drive of the given folder (or of the app's data) */
export function diskFreeGb(path = app.getPath('userData')): number | null {
  try { const s = statfsSync(path); return Math.round((s.bavail * s.bsize) / 1e9 * 10) / 10 } catch { return null }
}

function download(url: string, dest: string, log: (l: string) => void, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AI-Music-Studio' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume(); download(res.headers.location, dest, log, redirects - 1).then(resolve, reject); return
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`download failed (${res.statusCode})`)); return }
      const total = Number(res.headers['content-length'] || 0)
      let got = 0, lastPct = -1
      const out = createWriteStream(dest)
      res.on('data', (d: Buffer) => {
        got += d.length
        const pct = total ? Math.floor((got / total) * 100) : 0
        if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; log(`Downloading ${url.split('/').pop()}: ${pct}%|`) }
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      out.on('error', reject)
    }).on('error', reject)
  })
}

/** installs the app's own Python 3.11 (Windows): the official installer, silently, for this user, into the app's data */
export async function installPython(log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (existsSync(bundledPython())) return { ok: true }
  if (process.platform !== 'win32') return { ok: false, error: 'Install Python 3.11 with your package manager.' }
  log(`Step: setting up Python ${PY_VERSION} for the app (about 25 MB, only once; nothing else on the PC is changed)`)
  const exe = join(tmpdir(), `python-${PY_VERSION}-amd64.exe`)
  try {
    await download(`https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-amd64.exe`, exe, log)
  } catch (e) {
    return { ok: false, error: `Python could not be downloaded (${(e as Error).message}). Check the internet connection and try again.` }
  }
  mkdirSync(bundledPythonDir(), { recursive: true })
  const code = await run(exe, ['/quiet', 'InstallAllUsers=0', 'PrependPath=0', 'Include_launcher=0', 'InstallLauncherAllUsers=0', 'Include_test=0',
    'Include_doc=0', 'Include_tcltk=0', 'Shortcuts=0', 'AssociateFiles=0', 'Include_pip=1', `TargetDir=${bundledPythonDir()}`], log)
  try { rmSync(exe, { force: true }) } catch { /* temp file */ }
  if (code !== 0 || !existsSync(bundledPython())) {
    return { ok: false, error: `Python could not be installed (code ${code}). Install Python 3.11 from python.org and try again.` }
  }
  log(`Python ${PY_VERSION} is ready.`)
  return { ok: true }
}

export async function findPython(): Promise<PythonCmd | null> {
  // The app's own Python first, then versions that have wheels for the ML packages; the newest Python often does not
  // have them yet, so 3.13+ only comes last.
  if (existsSync(bundledPython())) {
    const r = await capture(bundledPython(), ['--version'], 8000)
    const m = /Python (\d+\.\d+\.\d+)/.exec(r.out)
    if (r.code === 0 && m) return { cmd: bundledPython(), args: [], version: m[1] }
  }
  const candidates: Array<[string, string[]]> = [
    ['py', ['-3.11']], ['py', ['-3.12']], ['py', ['-3.10']], ['py', ['-3.13']],
    ['py', ['-3']], ['python', []], ['python3', []]
  ]
  for (const [cmd, pre] of candidates) {
    const r = await capture(cmd, [...pre, '--version'], 8000)
    const m = /Python (\d+)\.(\d+)\.(\d+)/.exec(r.out)
    if (r.code === 0 && m) {
      const [maj, min] = [Number(m[1]), Number(m[2])]
      if (maj > MIN_PYTHON[0] || (maj === MIN_PYTHON[0] && min >= MIN_PYTHON[1])) {
        return { cmd, args: pre, version: `${m[1]}.${m[2]}.${m[3]}` }
      }
    }
  }
  return null
}

async function detectGpuNow(): Promise<'nvidia' | 'amd' | 'none'> {
  // The registry first: instant and it works where WMI does not answer (owner's PC: PowerShell's
  // Get-CimInstance gave nothing, the registry named the "AMD Radeon R9 200 Series"). Then PowerShell; wmic is
  // removed from recent Windows 11. Laptops often list an integrated and a discrete chip: NVIDIA wins, then AMD.
  const attempts: Array<[string, string[]]> = [
    ['reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}', '/s', '/v', 'DriverDesc']],
    ['powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name']],
    ['wmic', ['path', 'win32_VideoController', 'get', 'name']]
  ]
  for (const [cmd, args] of attempts) {
    let out = (await capture(cmd, args, 20000)).out.toLowerCase()
    if (cmd === 'reg') out = out.split(/\r?\n/).filter((l) => l.includes('driverdesc')).join('\n')
    if (!out.trim()) continue
    if (/nvidia|geforce|rtx|gtx|quadro/.test(out)) return 'nvidia'
    if (/radeon|amd/.test(out)) return 'amd'
    return 'none'
  }
  return 'none'
}

// the graphics card does not change while the app runs: ask once
// "none" is not kept: on a busy PC (AI workers running) PowerShell can take longer than the timeout and the card was
// then reported as missing until the next start (owner, R9 290 shown as "none · CPU")
let gpuOnce: Promise<'nvidia' | 'amd' | 'none'> | null = null
export function detectGpu(): Promise<'nvidia' | 'amd' | 'none'> {
  gpuOnce ??= detectGpuNow().then((g) => { if (g === 'none') gpuOnce = null; return g })
  return gpuOnce
}

let pkgCache: { at: number; names: Set<string> } | null = null
async function installedPackages(): Promise<Set<string>> {
  if (!hasVenv()) return new Set()
  if (pkgCache && Date.now() - pkgCache.at < 5000) return pkgCache.names
  // pip writes notices ("a new release of pip is available", "there was an error checking the latest
  // version of pip" when offline) after the list: they made the whole list unreadable and every engine
  // looked "not installed". So the version check is off and only the JSON array itself is read.
  const r = await capture(venvPython(), ['-m', 'pip', 'list', '--format=json', '--disable-pip-version-check'], 60000)
  let names = new Set<string>()
  try {
    const json = /\[[\s\S]*\]/.exec(r.out)?.[0] ?? '[]'
    names = new Set((JSON.parse(json) as Array<{ name: string }>).map(p => p.name.toLowerCase().replace(/_/g, '-')))
  } catch { /* leave empty */ }
  pkgCache = { at: Date.now(), names }
  return names
}

export async function getStatus(serverReady: boolean): Promise<EngineStatus> {
  const [py, have, gpu] = await Promise.all([findPython(), installedPackages(), detectGpu()])
  const minor = py ? Number(py.version.split('.')[1]) : 0
  const installed: Record<string, boolean> = {}
  for (const [g, names] of Object.entries(GROUP_PROBE)) installed[g] = names.some((n) => have.has(n))
  installed.gpuamd = hasDml()
  installed.diffrhythm = hasDr()
  installed.singer = hasSinger()
  installed.ace15 = hasAce15()
  installed.separator = hasSep()
  installed.aiinst = hasDdsp()
  return {
    pythonFound: py !== null,
    pythonVersion: py?.version ?? null,
    pythonOk: !!py && minor >= 10 && minor <= 12,
    pythonBundled: existsSync(bundledPython()),
    diskFreeGb: diskFreeGb(),
    ramGb: Math.round(totalmem() / 1e9),
    cpu: cpus()[0]?.model?.trim() ?? '',
    venvReady: hasVenv(),
    installed,
    gpu,
    serverReady
  }
}

// Which CUDA build of PyTorch fits the NVIDIA card: CUDA 12.8 builds are needed for RTX 50xx (compute capability 12)
// but no longer run on older cards such as the GTX 10xx (6.1); CUDA 12.6 builds run on everything from the GTX 9xx to
// the RTX 40xx and have wheels for current Python versions (the old CUDA 12.1 builds stop at older Pythons).
let cudaCap: Promise<number | null> | null = null
function nvidiaCapability(): Promise<number | null> {
  cudaCap ??= capture('nvidia-smi', ['--query-gpu=compute_cap', '--format=csv,noheader'], 8000).then((r) => {
    const v = parseFloat(r.out.trim().split(/\r?\n/)[0] ?? '')
    return r.code === 0 && Number.isFinite(v) ? v : null
  })
  return cudaCap
}
export async function cudaIndexes(): Promise<string[]> {
  const cap = await nvidiaCapability()
  return cap !== null && cap >= 10 ? ['cu128', 'cu126'] : ['cu126', 'cu128', 'cu118']
}
const cudaIndexUrl = (tag: string): string => `https://download.pytorch.org/whl/${tag}`

function torchArgs(variant: string, cuda = 'cu126'): string[] {
  switch (variant) {
    case 'cuda': return ['torch', 'torchaudio', '--index-url', cudaIndexUrl(cuda)]
    // torch-directml is installed separately afterwards: it is optional and often missing for new Pythons
    case 'directml': return ['torch', 'torchaudio']
    default: return ['torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu']
  }
}

function groupArgs(group: string, torchVariant: string): string[] | null {
  switch (group) {
    case 'core': return ['-r', join(serverDir(), 'requirements-core.txt')]
    case 'torch': return torchArgs(torchVariant)
    case 'demucs': return ['demucs']
    // basic-pitch still imports pkg_resources, which setuptools 81+ no longer ships
    // basic-pitch itself is installed separately with --no-deps (see installGroups): its TensorFlow dependency
    // forces NumPy 1.x, which breaks every other engine. It runs fine on its bundled ONNX model instead.
    case 'basicpitch': return ['librosa', 'mir_eval', 'pretty_midi', 'resampy', 'scikit-learn', 'scipy', 'onnxruntime', 'typing_extensions', 'setuptools<81']
    case 'matchering': return ['matchering']
    case 'whisper': return ['faster-whisper']
    case 'acestep': return ['git+https://github.com/ace-step/ACE-Step.git']
    case 'muscriptor': return ['muscriptor']
    case 'training': return ['datasets==3.4.1', 'peft', 'pytorch_lightning==2.5.1', 'tensorboard', 'tensorboardX']
    case 'musicgen': return ['transformers>=4.40', 'diffusers>=0.33', 'accelerate', 'sentencepiece', 'scipy']
    case 'video': return ['opencv-python-headless', 'librosa']
    default: return null
  }
}

/** a pip constraints file that keeps the installed torch and torchaudio exactly as they are (null if none) */
async function torchConstraints(): Promise<string | null> {
  const r = await capture(venvPython(), ['-c', 'import importlib.metadata as m\nfor p in ("torch", "torchaudio"):\n    try: print(f"{p}=={m.version(p)}")\n    except Exception: pass'], 30000)
  const pins = r.out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^torch(audio)?==/.test(l))
  if (!pins.length) return null
  const f = join(venvDir(), 'torch-constraints.txt')
  writeFileSync(f, pins.join('\n') + '\n')
  return f
}

/** PyTorch and torchaudio load together? If torchaudio does not load (it was built for another PyTorch: "Could not
 *  load this library: libtorchaudio.pyd"), both are installed again as one matching pair from the same index. */
async function checkTorch(torchVariant: string, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  const probe = (): ReturnType<typeof capture> => capture(venvPython(), ['-c', 'import torch, torchaudio; print("TORCH-OK", torch.__version__, torchaudio.__version__, torch.cuda.is_available())'], 120000)
  let r = await probe()
  if (/TORCH-OK/.test(r.out)) { log(`PyTorch check: ${r.out.split(/\r?\n/).find((l) => l.includes('TORCH-OK'))?.replace('TORCH-OK', '').trim()}`); return { ok: true } }
  if (!/No module named 'torch'/.test(r.out)) {
    log('PyTorch and torchaudio do not fit together: installing them again as a matching pair.')
    const tags = torchVariant === 'cuda' ? await cudaIndexes() : [null]
    for (const tag of tags) {
      const args = tag ? torchArgs('cuda', tag) : torchArgs(torchVariant)
      if (await run(venvPython(), ['-m', 'pip', 'install', '--force-reinstall', '--no-deps', ...args], log) !== 0) continue
      r = await probe()
      if (/TORCH-OK/.test(r.out)) { log('PyTorch repaired.'); return { ok: true } }
    }
    log(r.out.split(/\r?\n/).slice(-6).join('\n'))
    return { ok: false, error: 'PyTorch and torchaudio could not be repaired (see log). Stem splitting will not work until they are.' }
  }
  return { ok: true }
}

async function venvPythonMinor(): Promise<number | null> {
  const r = await capture(venvPython(), ['--version'], 10000)
  const m = /Python 3\.(\d+)/.exec(r.out)
  return m ? Number(m[1]) : null
}

let running: ChildProcess | null = null

function run(cmd: string, args: string[], log: (l: string) => void, env: Record<string, string> = {}): Promise<number> {
  return new Promise(resolve => {
    log(`> ${cmd} ${args.join(' ')}`)
    const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PIP_CACHE_DIR: pipCacheDir(), ...env } })
    running = p
    const pipe = (d: Buffer) => d.toString().split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).forEach(log)   // \r: progress bars
    p.stdout?.on('data', pipe)
    p.stderr?.on('data', pipe)
    p.on('error', e => { log(`error: ${e.message}`); resolve(-1) })
    p.on('close', code => { running = null; resolve(code ?? -1) })
  })
}

export function cancelInstall(): void {
  running?.kill()
}

export function isInstalling(): boolean {
  return running !== null
}

async function installDiffRhythm(py: PythonCmd | null, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.10 to 3.12 was not found.' }
  if (Number(py.version.split('.')[1]) > 12) {
    return { ok: false, error: `DiffRhythm needs Python 3.12 or older (found ${py.version}). Install Python 3.10 or 3.11.` }
  }
  const git = await capture('git', ['--version'], 8000)
  if (git.code !== 0) return { ok: false, error: 'Git is needed once to fetch DiffRhythm. Install Git and try again.' }
  if (!hasDr() && !existsSync(join(drRepo(), 'infer', 'infer.py'))) {
    mkdirSync(join(drRepo(), '..'), { recursive: true })
    if (await run('git', ['clone', '--depth', '1', 'https://github.com/ASLP-lab/DiffRhythm.git', drRepo()], log) !== 0) {
      return { ok: false, error: 'Could not fetch DiffRhythm from GitHub.' }
    }
  }
  if (!existsSync(drPython())) {
    mkdirSync(join(drDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', drDir()], log) !== 0) return { ok: false, error: 'Could not create the DiffRhythm environment.' }
    await run(drPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  log('DiffRhythm pins PyTorch 2.6: installing the CUDA build for NVIDIA cards.')
  if (await run(drPython(), ['-m', 'pip', 'install', 'torch==2.6.0', 'torchaudio==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124'], log) !== 0) {
    return { ok: false, error: 'Installing PyTorch for DiffRhythm failed (see log).' }
  }
  if (await run(drPython(), ['-m', 'pip', 'install', '-r', join(drRepo(), 'requirements.txt')], log) !== 0) {
    return { ok: false, error: 'Installing the DiffRhythm packages failed (see log).' }
  }
  log('Also needed on Windows: eSpeak NG (https://github.com/espeak-ng/espeak-ng/releases, the .msi). Install it once, then DiffRhythm can sing.')
  return { ok: true }
}

async function installSinger(py: PythonCmd | null, torchVariant: string, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.10 to 3.12 was not found.' }
  const minor = Number(py.version.split('.')[1])
  if (minor < 10 || minor > 12) return { ok: false, error: `The singer needs Python 3.10 to 3.12 (found ${py.version}). Install Python 3.11 from python.org and try again.` }
  log('Step 1/4: the singer\'s own Python environment')
  if (!existsSync(singerPython())) {
    mkdirSync(join(singerDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', singerDir()], log) !== 0) return { ok: false, error: 'Could not create the singer environment.' }
    await run(singerPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  const index = torchVariant === 'cuda' ? 'https://download.pytorch.org/whl/cu121' : 'https://download.pytorch.org/whl/cpu'
  log(`Step 2/4: PyTorch 2.2 (${torchVariant === 'cuda' ? 'about 2.5 GB' : 'about 200 MB'})`)
  log(`The singer uses PyTorch 2.2 (${torchVariant === 'cuda' ? 'NVIDIA graphics card' : 'processor'}).`)
  if (await run(singerPython(), ['-m', 'pip', 'install', 'torch==2.2.2', 'torchaudio==2.2.2', '--index-url', index], log) !== 0) {
    return { ok: false, error: 'Installing PyTorch for the singer failed (see log).' }
  }
  log('Step 3/4: the singer\'s packages')
  if (await run(singerPython(), ['-m', 'pip', 'install', 'numpy<2', 'transformers==4.41.2', 'accelerate==1.0.1', 'omegaconf==2.3.0',
    'librosa==0.10.2.post1', 'soundfile', 'scipy', 'einops', 'huggingface_hub>=0.23,<0.26'], log) !== 0) {
    return { ok: false, error: 'Installing the singer packages failed (see log).' }
  }
  log('Step 4/4: the singing model (2.8 GB)')
  log('Downloading the singing model (SoulX-Singer, 2.8 GB, Apache 2.0) and whisper-base (MIT): this takes a while.')
  const models = singerModels()
  mkdirSync(models, { recursive: true })
  const script = [
    'import sys, os',
    'from huggingface_hub import hf_hub_download, snapshot_download',
    'm = sys.argv[1]',
    "hf_hub_download('Soul-AILab/SoulX-Singer', 'model.pt', local_dir=os.path.join(m, 'SoulX-Singer'))",
    // plain files in models/soulx-singer/whisper-base: the Hugging Face cache needs symbolic links, which Windows
    // refuses without admin rights or developer mode ("WinError 1314"); that made the singer install fail
    "snapshot_download('openai/whisper-base', allow_patterns=['*.json', '*.txt', '*.safetensors'], local_dir=os.path.join(m, 'whisper-base'))",
    "print('models ready')",
  ].join('\n')
  if (await run(singerPython(), ['-c', script, models], log, { HF_HOME: join(models, 'hf'), HF_HUB_ENABLE_HF_TRANSFER: '0' }) !== 0) {
    return { ok: false, error: 'Downloading the singing model failed (see log). Press Install again: finished parts are kept.' }
  }
  return { ok: true }
}

async function installAce15(py: PythonCmd | null, torchVariant: string, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.11 or 3.12 was not found.' }
  const minor = Number(py.version.split('.')[1])
  if (minor < 11 || minor > 12) {
    return { ok: false, error: `ACE-Step 1.5 needs Python 3.11 or 3.12 (found ${py.version}). Install Python 3.12 from python.org and try again.` }
  }
  if (!existsSync(join(ace15Repo(), 'acestep', 'inference.py'))) {
    mkdirSync(join(ace15Repo(), '..'), { recursive: true })
    const git = await capture('git', ['--version'], 8000)
    if (git.code === 0) {
      if (await run('git', ['clone', '--depth', '1', 'https://github.com/ACE-Step/ACE-Step-1.5.git', ace15Repo()], log) !== 0) {
        return { ok: false, error: 'Could not fetch ACE-Step 1.5 from GitHub.' }
      }
    } else {
      // no Git on this PC: the project as a ZIP from GitHub, unpacked with Windows' own tar (no Git needed)
      log('Git is not installed: fetching ACE-Step 1.5 as a ZIP instead.')
      const zip = join(tmpdir(), 'ace-step-1.5.zip')
      try { await download('https://codeload.github.com/ACE-Step/ACE-Step-1.5/zip/refs/heads/main', zip, log) } catch (e) {
        return { ok: false, error: `Could not fetch ACE-Step 1.5 from GitHub (${(e as Error).message}).` }
      }
      const parent = join(ace15Repo(), '..')
      if (await run('tar', ['-xf', zip, '-C', parent], log) !== 0) return { ok: false, error: 'Could not unpack ACE-Step 1.5.' }
      try { rmSync(zip, { force: true }) } catch { /* temp */ }
      const unpacked = join(parent, 'ACE-Step-1.5-main')
      if (existsSync(unpacked)) { try { rmSync(ace15Repo(), { recursive: true, force: true }) } catch { /* none */ } ; renameSync(unpacked, ace15Repo()) }
      if (!existsSync(join(ace15Repo(), 'acestep'))) return { ok: false, error: 'ACE-Step 1.5 was unpacked, but its files are not where expected.' }
    }
  }
  if (!existsSync(ace15Python())) {
    mkdirSync(join(ace15Dir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', ace15Dir()], log) !== 0) return { ok: false, error: 'Could not create the ACE-Step 1.5 environment.' }
    await run(ace15Python(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  if (torchVariant === 'cuda') {
    log('NVIDIA card: installing the CUDA build of PyTorch first.')
    let ok = false
    for (const tag of await cudaIndexes()) {
      if (await run(ace15Python(), ['-m', 'pip', 'install', '--upgrade', 'torch', 'torchaudio', 'torchvision', '--index-url', cudaIndexUrl(tag)], log) === 0) { ok = true; break }
      log(`The PyTorch build ${tag} could not be installed, trying the next one.`)
    }
    if (!ok) return { ok: false, error: 'Installing PyTorch (CUDA) for ACE-Step 1.5 failed (see log).' }
  } else {
    log('No NVIDIA card chosen: ACE-Step 1.5 runs on the processor (PyTorch CPU build).')
    if (await run(ace15Python(), ['-m', 'pip', 'install', '--upgrade', 'torch', 'torchaudio', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cpu'], log) !== 0) {
      return { ok: false, error: 'Installing PyTorch (CPU) for ACE-Step 1.5 failed (see log).' }
    }
  }
  // the PyTorch index does not bring NumPy, and without it ACE-Step 1.5 cannot start ("No module named numpy")
  if (await run(ace15Python(), ['-m', 'pip', 'install', 'numpy', 'soundfile'], log) !== 0) {
    return { ok: false, error: 'Installing NumPy for ACE-Step 1.5 failed (see log).' }
  }
  // setuptools: ACE-Step 1.5 asks for <72, new PyTorch builds for >=77; either works here (pkg_resources is in both)
  // ACE-Step 1.5 lists nano-vllm (its language model runtime, a uv path source, not on PyPI), CUDA builds of
  // torch pinned to its own index (torch==2.7.1+cu128) and other GPU-only packages: pip cannot resolve them, and
  // the music part we use ("DiT only") does not need them. PyTorch is installed above for this machine.
  // So: the listed dependencies without those, then the project itself without dependencies.
  const deps = await capture(ace15Python(), ['-c', [
    'import sys, tomllib, re',
    'd = tomllib.load(open(sys.argv[1], "rb"))["project"]["dependencies"]',
    'skip = ("nano-vllm", "nano_vllm", "vllm", "flash-attn", "flash_attn", "triton", "triton-windows", "xformers", "torch", "torchvision", "torchaudio", "mlx", "mlx-lm", "setuptools")',
    'keep = [x for x in d if not re.split(r"[ <>=!~;\\[]", x.strip(), maxsplit=1)[0].lower() in skip]',
    'print("\\n".join(keep))'
  ].join('; '), join(ace15Repo(), 'pyproject.toml')], 30000)
  const wanted = deps.out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(Traceback|File |<string>|\s)|Warning/.test(l))
  if (deps.code !== 0 || !wanted.length) {
    log(deps.out)
    return { ok: false, error: 'Could not read the ACE-Step 1.5 package list (see log).' }
  }
  log(`ACE-Step 1.5 packages (without nano-vllm and other GPU-only parts): ${wanted.length}`)
  // PyTorch stays exactly as installed above: one of the packages (torchao / torchcodec) made pip pull an older
  // torch from PyPI, which no longer matched torchvision ("operator torchvision::nms does not exist")
  const ver = await capture(ace15Python(), ['-c', 'import importlib.metadata as m; print("\\n".join(f"{p}=={m.version(p)}" for p in ("torch", "torchvision", "torchaudio")))'], 30000)
  const pins = ver.out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^torch(vision|audio)?==/.test(l))
  const constraints = join(ace15Dir(), 'constraints.txt')
  writeFileSync(constraints, pins.join('\n') + '\n')
  log(`Keeping ${pins.join(', ')}`)
  if (await run(ace15Python(), ['-m', 'pip', 'install', '-c', constraints, ...wanted], log) !== 0) {
    // no version of torchao / torchcodec fits this PyTorch: leave those two out (DiT-only generation runs without)
    log('Trying again without torchao and torchcodec, which do not fit this PyTorch version.')
    const lean = wanted.filter((w) => !/^(torchao|torchcodec)\b/i.test(w))
    if (await run(ace15Python(), ['-m', 'pip', 'install', '-c', constraints, ...lean], log) !== 0) {
      return { ok: false, error: 'Installing the ACE-Step 1.5 packages failed (see log).' }
    }
  }
  if (await run(ace15Python(), ['-m', 'pip', 'install', '--no-deps', '-e', ace15Repo()], log) !== 0) {
    return { ok: false, error: 'Installing ACE-Step 1.5 itself failed (see log).' }
  }
  // check that it really starts, so a broken install shows here and not on the first song
  const startCheck = (): ReturnType<typeof capture> =>
    capture(ace15Python(), ['-c', 'import numpy, torch; from acestep.handler import AceStepHandler; print("ok")'], 120000)
  let check = await startCheck()
  if (check.code !== 0 && /torchvision/.test(check.out)) {
    // torchvision is only pulled in by the training tools (lightning / torchmetrics) and is not needed for music;
    // a torchvision that does not match PyTorch ("operator torchvision::nms does not exist") is simply removed
    log('torchvision does not match this PyTorch and is not needed for music: removing it.')
    await run(ace15Python(), ['-m', 'pip', 'uninstall', '-y', 'torchvision'], log)
    check = await startCheck()
  }
  if (check.code !== 0) {
    log(check.out)
    return { ok: false, error: 'ACE-Step 1.5 is installed but does not start (see the last lines of the log). Press "Install selected" again; if it stays, send the log.' }
  }
  mkdirSync(ace15Checkpoints(), { recursive: true })
  log('ACE-Step 1.5 is installed. The model (about 10 GB) is downloaded on the first song.')
  return { ok: true }
}

async function installSep(py: PythonCmd | null, torchVariant: string, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.10 to 3.12 was not found.' }
  const minor = Number(py.version.split('.')[1])
  if (minor < 10 || minor > 12) {
    return { ok: false, error: `Fast vocal separation needs Python 3.10 to 3.12 (found ${py.version}). Install Python 3.11 or 3.12 and try again.` }
  }
  if (!existsSync(sepPython())) {
    mkdirSync(join(sepDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', sepDir()], log) !== 0) return { ok: false, error: 'Could not create the environment for fast vocal separation.' }
    await run(sepPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  let extra = 'cpu'
  if (torchVariant === 'cuda') {
    log('NVIDIA card: CUDA build of PyTorch and ONNX Runtime GPU.')
    let ok = false
    for (const tag of await cudaIndexes()) {
      if (await run(sepPython(), ['-m', 'pip', 'install', 'torch', '--index-url', cudaIndexUrl(tag)], log) === 0) { ok = true; break }
    }
    if (!ok) return { ok: false, error: 'Installing PyTorch (CUDA) for fast vocal separation failed (see log).' }
    extra = 'gpu'
  } else if (process.platform === 'win32') {
    log('AMD / Intel graphics or none: DirectML build, so a DirectX 12 graphics card can help (falls back to the processor).')
    extra = 'dml'
  } else {
    if (await run(sepPython(), ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu'], log) !== 0) {
      return { ok: false, error: 'Installing PyTorch (CPU) for fast vocal separation failed (see log).' }
    }
  }
  if (await run(sepPython(), ['-m', 'pip', 'install', `audio-separator[${extra}]`], log) !== 0) {
    if (extra !== 'dml') return { ok: false, error: 'Installing audio-separator failed (see log).' }
    log('The DirectML build could not be installed: installing the processor build instead.')
    if (await run(sepPython(), ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu'], log) !== 0 ||
        await run(sepPython(), ['-m', 'pip', 'install', 'audio-separator[cpu]'], log) !== 0) {
      return { ok: false, error: 'Installing audio-separator failed (see log).' }
    }
  }
  mkdirSync(sepModels(), { recursive: true })
  log('Fast vocal separation is installed. Its model (about 60 MB) downloads on the first split.')
  return { ok: true }
}

// The versions below were tried together (TensorFlow 2.15, MIDI-DDSP 0.2.6): MIDI-DDSP itself pins packages from
// 2022 (numba < 0.50, Python 3.8), so it and DDSP are installed without their pins and get these instead.
async function installDdsp(py: PythonCmd | null, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.11 was not found.' }
  const minor = Number(py.version.split('.')[1])
  let cmd = py
  if (minor < 9 || minor > 11) {
    // TensorFlow 2.15 has no build for Python 3.12+: use an installed 3.11 or 3.10 if there is one
    const other = await (async () => {
      for (const v of ['-3.11', '-3.10']) {
        const r = await capture('py', [v, '--version'], 8000)
        const m = /Python (\d+\.\d+\.\d+)/.exec(r.out)
        if (r.code === 0 && m) return { cmd: 'py', args: [v], version: m[1] }
      }
      return null
    })()
    if (!other) return { ok: false, error: `AI Instruments need Python 3.10 or 3.11 (found ${py.version}). Install Python 3.11 from python.org (it can stay next to your other Python) and try again.` }
    cmd = other
  }
  if (!existsSync(ddspPython())) {
    mkdirSync(join(ddspDir(), '..'), { recursive: true })
    if (await run(cmd.cmd, [...cmd.args, '-m', 'venv', ddspDir()], log) !== 0) return { ok: false, error: 'Could not create the AI Instruments environment.' }
    await run(ddspPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  const pins = ['protobuf>=3.20.3,<4.22', 'numpy<2']
  const tf = process.platform === 'win32' ? 'tensorflow==2.15.1' : 'tensorflow-cpu==2.15.1'
  log('TensorFlow 2.15 (processor build, about 600 MB)')
  if (await run(ddspPython(), ['-m', 'pip', 'install', tf, 'tensorflow-probability==0.23.0', ...pins], log) !== 0) {
    return { ok: false, error: 'Installing TensorFlow for the AI Instruments failed (see log).' }
  }
  // only used for training: a stand-in is written below if there is no build for this Python
  if (await run(ddspPython(), ['-m', 'pip', 'install', 'tensorflow-addons==0.23.0'], log) !== 0) log('tensorflow-addons is not available here: a stand-in is used (not needed to play notes).')
  if (await run(ddspPython(), ['-m', 'pip', 'install', '--no-deps', 'ddsp==3.2.0', 'midi-ddsp==0.2.6', 'note-seq==0.0.3'], log) !== 0) {
    return { ok: false, error: 'Installing MIDI-DDSP failed (see log).' }
  }
  const deps = ['gin-config', 'absl-py', 'librosa', 'pretty_midi', 'music21', 'pandas', 'mir_eval', 'pydub', 'scipy', 'six', 'future', 'tqdm',
    'hypertune', 'cloudml-hypertune', 'google-cloud-storage<2.15', 'tensorflow-datasets==4.9.3', 'bokeh', 'IPython', 'intervaltree', 'hmmlearn', 'resampy']
  if (await run(ddspPython(), ['-m', 'pip', 'install', ...deps, ...pins], log) !== 0) {
    return { ok: false, error: 'Installing the packages of MIDI-DDSP failed (see log).' }
  }
  await run(ddspPython(), [join(serverDir(), 'services', 'ddsp_stubs.py')], log)
  const check = await capture(ddspPython(), [join(serverDir(), 'services', 'midi_ddsp_worker.py'), '--check'], 300000)
  if (!/"ok": true/.test(check.out)) {
    log(check.out.split(/\r?\n/).slice(-15).join('\n'))
    return { ok: false, error: 'The AI Instruments are installed but do not start (see the last lines of the log). Press "Install selected" again; if it stays, send the log.' }
  }
  log('Downloading the MIDI-DDSP models (about 80 MB) from GitHub ...')
  const dl = await capture(ddspPython(), [join(serverDir(), 'services', 'midi_ddsp_worker.py'), '--download'], 900000)
  if (!/"weights": true/.test(dl.out)) log('The models could not be downloaded now: they are fetched again on the first use.')
  log('AI Instruments are installed (violin, viola, cello, double bass, flute, oboe, clarinet, saxophone, bassoon, trumpet, horn, trombone, tuba).')
  return { ok: true }
}

async function installDml(py: PythonCmd | null, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.11 was not found.' }
  const minor = Number(py.version.split('.')[1])
  if (minor > 12) {
    return { ok: false, error: `The graphics card add-on needs Python 3.12 or older (found ${py.version}). Install Python 3.11 and try again.` }
  }
  if (!existsSync(dmlPython())) {
    mkdirSync(join(dmlDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', dmlDir()], log) !== 0) return { ok: false, error: 'Could not create the graphics card environment.' }
    await run(dmlPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  const code = await run(dmlPython(), ['-m', 'pip', 'install', 'torch-directml', 'numpy<2', 'transformers>=4.40,<5', 'scipy', 'sentencepiece', 'accelerate'], log)
  return code === 0 ? { ok: true } : { ok: false, error: 'Installing the graphics card add-on failed (see log).' }
}

export async function installGroups(
  groups: string[],
  torchVariant: string,
  log: (l: string) => void
): Promise<{ ok: boolean; error?: string }> {
  let py = await findPython()
  pkgCache = null
  // no Python 3.10 to 3.12 on the PC: the app sets up its own Python 3.11 first (nothing to do by hand)
  if (process.platform === 'win32' && (!py || Number(py.version.split('.')[1]) > 12 || Number(py.version.split('.')[1]) < 10)) {
    const r = await installPython(log)
    if (r.ok) py = await findPython()
    else if (!py) return { ok: false, error: r.error }
  }

  // the singer alone: only its own environment, the AI backend's environment stays as it is (the backend keeps running)
  if (groups.length && groups.every((g) => g === 'singer')) {
    log('=== singer (built-in voices that sing your melody and lyrics) ===')
    const r = await installSinger(py, torchVariant, log)
    if (!r.ok) log(r.error ?? 'failed')
    return r
  }

  // An environment built on a very new Python lacks wheels for several engines (basic-pitch,
  // ACE-Step). If a better interpreter is installed now, rebuild the environment with it.
  if (hasVenv() && py) {
    const have = await venvPythonMinor()
    const want = Number(py.version.split('.')[1])
    if (have !== null && have >= 13 && want <= 12 && venvDir().endsWith('venv')) {
      log(`The AI environment uses Python 3.${have}, but Python ${py.version} is available. Rebuilding the environment with it (the old one is removed).`)
      rmSync(venvDir(), { recursive: true, force: true })
    }
  }

  if (!hasVenv()) {
    if (!py) return { ok: false, error: `Python ${MIN_PYTHON.join('.')}+ not found. Install it from python.org and tick "Add to PATH".` }
    mkdirSync(join(venvDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', venvDir()], log) !== 0) {
      return { ok: false, error: 'Could not create the Python environment.' }
    }
    await run(venvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }

  const minor = await venvPythonMinor()
  // core first, torch before anything that depends on it
  const order = ['core', 'torch', 'demucs', 'basicpitch', 'matchering', 'whisper', 'video', 'acestep', 'musicgen', 'training', 'muscriptor']
  const wanted = order.filter(g => g === 'core' || groups.includes(g))
  const failed: string[] = []
  for (const g of wanted) {
    const args = groupArgs(g, torchVariant)
    if (!args) continue
    log(`=== ${g} ===`)
    if (g === 'basicpitch') {
      // an earlier install may have left TensorFlow behind, which breaks with NumPy 2: remove it
      await run(venvPython(), ['-m', 'pip', 'uninstall', '-y', 'tensorflow', 'tensorflow-intel', 'tensorflow-cpu'], log)
    }
    let code: number
    if (g === 'torch' && torchVariant === 'cuda') {
      code = -1
      const tags = await cudaIndexes()
      const cap = await nvidiaCapability()
      if (cap !== null) log(`NVIDIA card with compute capability ${cap}: trying the PyTorch builds ${tags.join(', ')}.`)
      for (const tag of tags) {
        code = await run(venvPython(), ['-m', 'pip', 'install', ...torchArgs('cuda', tag)], log)
        if (code === 0) break
        log(`The PyTorch build ${tag} could not be installed, trying the next one.`)
      }
      if (code !== 0) {
        log('No CUDA build of PyTorch could be installed for this Python / card: installing the processor build, so the engines still work (slower).')
        code = await run(venvPython(), ['-m', 'pip', 'install', ...torchArgs('cpu')], log)
      }
    } else {
      // every package after PyTorch keeps the installed PyTorch (some ask for "torch" and pip would otherwise pull
      // a different build from PyPI: then torchaudio no longer matches and stem splitting fails to load it)
      const cons = g !== 'torch' && g !== 'core' ? await torchConstraints() : null
      code = await run(venvPython(), ['-m', 'pip', 'install', ...(cons ? ['-c', cons] : []), ...args], log)
    }
    if (code === 0 && g === 'basicpitch') {
      code = await run(venvPython(), ['-m', 'pip', 'install', '--no-deps', 'basic-pitch'], log)
    }
    if (code !== 0) {
      // everything else builds on these two: stop here
      if (g === 'core' || g === 'torch') return { ok: false, error: `Installing "${g}" failed (see log).` }
      failed.push(g)
      log(`"${g}" could not be installed, continuing with the other packages.`)
      if ((g === 'basicpitch' || g === 'acestep') && minor !== null && minor >= 13) {
        log(`Hint: ${g === 'basicpitch' ? 'basic-pitch' : 'ACE-Step'} needs Python 3.12 or older (this environment uses 3.${minor}). Install Python 3.11 and press "Install selected" again.`)
      }
      continue
    }
  }
  // PyTorch and torchaudio must fit together (and to the card): check, and repair once if they do not
  if (groups.includes('torch') || groups.includes('demucs') || hasVenv()) {
    const r = await checkTorch(torchVariant, log)
    if (!r.ok) { failed.push('torch'); log(r.error ?? 'PyTorch does not work') }
  }
  if (groups.includes('gpuamd')) {
    log('=== gpuamd (graphics card support for AMD and Intel) ===')
    const r = await installDml(py, log)
    if (!r.ok) { failed.push('gpuamd'); log(r.error ?? 'failed') }
  }
  if (groups.includes('ace15')) {
    log('=== ace15 (ACE-Step 1.5: songs with vocals, also on the processor) ===')
    const r = await installAce15(py, torchVariant, log)
    if (!r.ok) { failed.push('ace15'); log(r.error ?? 'failed') }
  }
  if (groups.includes('aiinst')) {
    log('=== aiinst (AI Instruments: MIDI-DDSP, 13 orchestral instruments on the processor) ===')
    const r = await installDdsp(py, log)
    if (!r.ok) { failed.push('aiinst'); log(r.error ?? 'failed') }
  }
  if (groups.includes('separator')) {
    log('=== separator (fast vocal / instrumental separation, also on AMD / Intel graphics) ===')
    const r = await installSep(py, torchVariant, log)
    if (!r.ok) { failed.push('separator'); log(r.error ?? 'failed') }
  }
  if (groups.includes('singer')) {
    log('=== singer (built-in voices that sing your melody and lyrics) ===')
    const r = await installSinger(py, torchVariant, log)
    if (!r.ok) { failed.push('singer'); log(r.error ?? 'failed') }
  }
  if (groups.includes('diffrhythm')) {
    log('=== diffrhythm (full songs in one go, needs an NVIDIA card) ===')
    const r = await installDiffRhythm(py, log)
    if (!r.ok) { failed.push('diffrhythm'); log(r.error ?? 'failed') }
  }
  if (failed.length > 0) {
    return { ok: false, error: `Done, but these packages failed: ${failed.join(', ')}. The others are installed. See the log for details.` }
  }
  // success: the downloaded wheels are no longer needed (on failure they stay, so a retry is fast)
  try {
    rmSync(pipCacheDir(), { recursive: true, force: true })
    log('Cleaned up the download cache.')
  } catch { /* harmless */ }
  return { ok: true }
}
