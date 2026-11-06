import { useEffect } from 'react'
import { useUIStore } from '../stores/ui.store'
import { runAction } from './handlers'
import { ACTIONS, buildMap, eventToCombo } from './registry'

// Set by the Winamp overlay: while it is open only the Winamp toggle stays active
export const shortcutState = { winampOpen: false }

const REPEATABLE = new Set(ACTIONS.filter((a) => a.repeatable).map((a) => a.id))
const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'password', 'email', 'url', 'tel', ''])

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)
}

export function useShortcuts(): void {
  const preset = useUIStore((s) => s.shortcutPreset)

  useEffect(() => {
    const map = buildMap(preset)

    const onKeyDown = (e: KeyboardEvent): void => {
      const combo = eventToCombo(e)
      if (!combo) return
      const id = map.get(combo.toLowerCase())
      if (!id) return
      // typing in a field keeps its own keys; function keys still work
      if (isEditable(e.target) && !/^F\d+$/.test(combo)) return
      if (shortcutState.winampOpen && id !== 'app.winamp') return
      e.preventDefault()
      if (e.repeat && !REPEATABLE.has(id)) return
      runAction(id)
    }

    // Space also "clicks" a focused button on key-up: swallow that when Space is a shortcut
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ' && map.has('space') && !isEditable(e.target) && !shortcutState.winampOpen) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [preset])
}
