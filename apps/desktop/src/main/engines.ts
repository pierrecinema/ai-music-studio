import { spawn, execFile, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { modelsDir } from './settings'

export interface EngineStatus {
  pythonFound: boolean
  pythonVersion: string | null
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

export async function findPython(): Promise<PythonCmd | null> {
  // Prefer versions that have wheels for the ML packages; the newest Python often does not yet.
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
  // wmic is removed from recent Windows 11, so ask PowerShell first. Laptops often list
  // an integrated and a discrete chip: NVIDIA wins, then AMD.
  const attempts: Array<[string, string[]]> = [
    ['powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name']],
    ['wmic', ['path', 'win32_VideoController', 'get', 'name']]
  ]
  for (const [cmd, args] of attempts) {
    const out = (await capture(cmd, args, 8000)).out.toLowerCase()
    if (!out.trim()) continue
    if (/nvidia|geforce|rtx|gtx|quadro/.test(out)) return 'nvidia'
    if (/radeon|amd/.test(out)) return 'amd'
    return 'none'
  }
  return 'none'
}

// the graphics card does not change while the app runs: ask once
let gpuOnce: Promise<'nvidia' | 'amd' | 'none'> | null = null
export function detectGpu(): Promise<'nvidia' | 'amd' | 'none'> {
  gpuOnce ??= detectGpuNow()
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
  const installed: Record<string, boolean> = {}
  for (const [g, names] of Object.entries(GROUP_PROBE)) installed[g] = names.some((n) => have.has(n))
  installed.gpuamd = hasDml()
  installed.diffrhythm = hasDr()
  installed.ace15 = hasAce15()
  installed.separator = hasSep()
  return {
    pythonFound: py !== null,
    pythonVersion: py?.version ?? null,
    venvReady: hasVenv(),
    installed,
    gpu,
    serverReady
  }
}

function torchArgs(variant: string): string[] {
  switch (variant) {
    case 'cuda': return ['torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121']
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

async function venvPythonMinor(): Promise<number | null> {
  const r = await capture(venvPython(), ['--version'], 10000)
  const m = /Python 3\.(\d+)/.exec(r.out)
  return m ? Number(m[1]) : null
}

let running: ChildProcess | null = null

function run(cmd: string, args: string[], log: (l: string) => void): Promise<number> {
  return new Promise(resolve => {
    log(`> ${cmd} ${args.join(' ')}`)
    const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PIP_CACHE_DIR: pipCacheDir() } })
    running = p
    const pipe = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(log)
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

async function installAce15(py: PythonCmd | null, torchVariant: string, log: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!py) return { ok: false, error: 'Python 3.11 or 3.12 was not found.' }
  const minor = Number(py.version.split('.')[1])
  if (minor < 11 || minor > 12) {
    return { ok: false, error: `ACE-Step 1.5 needs Python 3.11 or 3.12 (found ${py.version}). Install Python 3.12 from python.org and try again.` }
  }
  const git = await capture('git', ['--version'], 8000)
  if (git.code !== 0) return { ok: false, error: 'Git is needed once to fetch ACE-Step 1.5. Install Git and try again.' }
  if (!existsSync(join(ace15Repo(), 'acestep', 'inference.py'))) {
    mkdirSync(join(ace15Repo(), '..'), { recursive: true })
    if (await run('git', ['clone', '--depth', '1', 'https://github.com/ACE-Step/ACE-Step-1.5.git', ace15Repo()], log) !== 0) {
      return { ok: false, error: 'Could not fetch ACE-Step 1.5 from GitHub.' }
    }
  }
  if (!existsSync(ace15Python())) {
    mkdirSync(join(ace15Dir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', ace15Dir()], log) !== 0) return { ok: false, error: 'Could not create the ACE-Step 1.5 environment.' }
    await run(ace15Python(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }
  if (torchVariant === 'cuda') {
    log('NVIDIA card: installing the CUDA build of PyTorch first.')
    if (await run(ace15Python(), ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu128'], log) !== 0) {
      return { ok: false, error: 'Installing PyTorch (CUDA) for ACE-Step 1.5 failed (see log).' }
    }
  } else {
    log('No NVIDIA card chosen: ACE-Step 1.5 runs on the processor (PyTorch CPU build).')
    if (await run(ace15Python(), ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu'], log) !== 0) {
      return { ok: false, error: 'Installing PyTorch (CPU) for ACE-Step 1.5 failed (see log).' }
    }
  }
  if (await run(ace15Python(), ['-m', 'pip', 'install', '-e', ace15Repo()], log) !== 0) {
    return { ok: false, error: 'Installing the ACE-Step 1.5 packages failed (see log).' }
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
    if (await run(sepPython(), ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cu128'], log) !== 0) {
      return { ok: false, error: 'Installing PyTorch (CUDA) for fast vocal separation failed (see log).' }
    }
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
  const py = await findPython()
  pkgCache = null

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
    let code = await run(venvPython(), ['-m', 'pip', 'install', ...args], log)
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
  if (groups.includes('separator')) {
    log('=== separator (fast vocal / instrumental separation, also on AMD / Intel graphics) ===')
    const r = await installSep(py, torchVariant, log)
    if (!r.ok) { failed.push('separator'); log(r.error ?? 'failed') }
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
