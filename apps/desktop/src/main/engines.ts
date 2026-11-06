import { spawn, spawnSync, ChildProcess } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

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

// pip package name used to detect each group as installed
const GROUP_PROBE: Record<string, string> = {
  core: 'fastapi',
  torch: 'torch',
  demucs: 'demucs',
  basicpitch: 'basic-pitch',
  matchering: 'matchering',
  whisper: 'faster-whisper',
  acestep: 'acestep',
  muscriptor: 'muscriptor',
  video: 'opencv-python-headless'
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

export function hasVenv(): boolean {
  return existsSync(venvPython())
}

export function findPython(): PythonCmd | null {
  const candidates: Array<[string, string[]]> = [['py', ['-3']], ['python', []], ['python3', []]]
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf-8', windowsHide: true })
    const m = /Python (\d+)\.(\d+)\.(\d+)/.exec(`${r.stdout}${r.stderr}`)
    if (r.status === 0 && m) {
      const [maj, min] = [Number(m[1]), Number(m[2])]
      if (maj > MIN_PYTHON[0] || (maj === MIN_PYTHON[0] && min >= MIN_PYTHON[1])) {
        return { cmd, args: pre, version: `${m[1]}.${m[2]}.${m[3]}` }
      }
    }
  }
  return null
}

export function detectGpu(): 'nvidia' | 'amd' | 'none' {
  try {
    const r = spawnSync('wmic', ['path', 'win32_VideoController', 'get', 'name'], {
      encoding: 'utf-8', windowsHide: true, timeout: 5000
    })
    const out = (r.stdout ?? '').toLowerCase()
    if (/nvidia|geforce|rtx|gtx/.test(out)) return 'nvidia'
    if (/radeon|amd/.test(out)) return 'amd'
  } catch { /* wmic missing on newer Windows */ }
  return 'none'
}

function installedPackages(): Set<string> {
  if (!hasVenv()) return new Set()
  const r = spawnSync(venvPython(), ['-m', 'pip', 'list', '--format=json'], {
    encoding: 'utf-8', windowsHide: true, timeout: 30000
  })
  try {
    return new Set((JSON.parse(r.stdout) as Array<{ name: string }>).map(p => p.name.toLowerCase().replace(/_/g, '-')))
  } catch {
    return new Set()
  }
}

export function getStatus(serverReady: boolean): EngineStatus {
  const py = findPython()
  const have = installedPackages()
  const installed: Record<string, boolean> = {}
  for (const [g, pkg] of Object.entries(GROUP_PROBE)) installed[g] = have.has(pkg)
  return {
    pythonFound: py !== null,
    pythonVersion: py?.version ?? null,
    venvReady: hasVenv(),
    installed,
    gpu: detectGpu(),
    serverReady
  }
}

function torchArgs(variant: string): string[] {
  switch (variant) {
    case 'cuda': return ['torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121']
    case 'directml': return ['torch', 'torchaudio', 'torch-directml']
    default: return ['torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu']
  }
}

function groupArgs(group: string, torchVariant: string): string[] | null {
  switch (group) {
    case 'core': return ['-r', join(serverDir(), 'requirements-core.txt')]
    case 'torch': return torchArgs(torchVariant)
    case 'demucs': return ['demucs']
    case 'basicpitch': return ['basic-pitch']
    case 'matchering': return ['matchering']
    case 'whisper': return ['faster-whisper']
    case 'acestep': return ['git+https://github.com/ace-step/ACE-Step.git']
    case 'muscriptor': return ['muscriptor']
    case 'video': return ['opencv-python-headless', 'librosa']
    default: return null
  }
}

let running: ChildProcess | null = null

function run(cmd: string, args: string[], log: (l: string) => void): Promise<number> {
  return new Promise(resolve => {
    log(`> ${cmd} ${args.join(' ')}`)
    const p = spawn(cmd, args, { windowsHide: true })
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

export async function installGroups(
  groups: string[],
  torchVariant: string,
  log: (l: string) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!hasVenv()) {
    const py = findPython()
    if (!py) return { ok: false, error: `Python ${MIN_PYTHON.join('.')}+ not found. Install it from python.org and tick "Add to PATH".` }
    mkdirSync(join(venvDir(), '..'), { recursive: true })
    if (await run(py.cmd, [...py.args, '-m', 'venv', venvDir()], log) !== 0) {
      return { ok: false, error: 'Could not create the Python environment.' }
    }
    await run(venvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], log)
  }

  // core first, torch before anything that depends on it
  const order = ['core', 'torch', 'demucs', 'basicpitch', 'matchering', 'whisper', 'video', 'acestep', 'muscriptor']
  const wanted = order.filter(g => g === 'core' || groups.includes(g))
  for (const g of wanted) {
    const args = groupArgs(g, torchVariant)
    if (!args) continue
    log(`=== ${g} ===`)
    const code = await run(venvPython(), ['-m', 'pip', 'install', ...args], log)
    if (code !== 0) return { ok: false, error: `Installing "${g}" failed (see log).` }
  }
  return { ok: true }
}
