// the result of a plugin search, checked (kept free of the host, so the tests can use it)
import type { FailedPlugin, PluginInfo } from '../audio/vst/host'

/** only real plugin descriptions: a plugin that prints its own text while it is checked could leave an empty entry
 *  (null), and one such entry made the whole list fail ("cannot read properties of null (reading 'name')") */
export function cleanPlugins(list: unknown): PluginInfo[] {
  if (!Array.isArray(list)) return []
  return list.filter((p): p is PluginInfo => !!p && typeof p === 'object' && typeof (p as PluginInfo).id === 'string' && typeof (p as PluginInfo).name === 'string' && !!(p as PluginInfo).name)
}
export function cleanFailed(list: unknown): FailedPlugin[] {
  return Array.isArray(list) ? list.filter((f): f is FailedPlugin => !!f && typeof f === 'object' && typeof (f as FailedPlugin).file === 'string') : []
}

