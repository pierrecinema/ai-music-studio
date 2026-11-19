// Presets of VST plugins: the plugin's own settings (its state, base64) saved under a name, one file per plugin in
// <userData>/plugin-presets, so a sound made once can be loaded in any project.
import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface PluginPreset { name: string; state: string; saved: string }

const dir = (): string => join(app.getPath('userData'), 'plugin-presets')
const fileOf = (pluginId: string): string => join(dir(), `${pluginId.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}.json`)

function read(pluginId: string): PluginPreset[] {
  try { const f = fileOf(pluginId); return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf-8')) as PluginPreset[]) : [] } catch { return [] }
}
function write(pluginId: string, list: PluginPreset[]): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(fileOf(pluginId), JSON.stringify(list.sort((a, b) => a.name.localeCompare(b.name)), null, 1))
}

export function registerPluginPresetHandlers(): void {
  ipcMain.handle('presets:list', (_, pluginId: string) => read(pluginId).map(({ name, saved }) => ({ name, saved })))
  ipcMain.handle('presets:get', (_, pluginId: string, name: string) => read(pluginId).find((p) => p.name === name)?.state ?? null)
  ipcMain.handle('presets:save', (_, pluginId: string, name: string, state: string) => {
    const list = read(pluginId).filter((p) => p.name !== name)
    list.push({ name, state, saved: new Date().toISOString() })
    write(pluginId, list)
  })
  ipcMain.handle('presets:delete', (_, pluginId: string, name: string) => write(pluginId, read(pluginId).filter((p) => p.name !== name)))
}
