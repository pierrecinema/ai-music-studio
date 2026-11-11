import { useEffect } from 'react'
import { useUIStore } from '../stores/ui.store'
import { runAction } from './handlers'
import { ACTIONS, buildMap, eventToCombo } from './registry'

// Set by the Winamp overlay: while it is open only the Winamp toggle stays active
export const shortcutState = { winampOpen: false }

const REPEATABLE = new Set(ACTIONS.filter((a) => a.repeatable).map((a) => a.id))
const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'password', 'email', 'url', 'tel', ''])

// Where typing needs the keys itself: text fields and text areas. A drop-down list (Grid, Count-in, ...) is
// NOT one of them: after choosing a value the focus stays on the list, and all shortcuts (Space, Ctrl+C, ...)
// went dead until the user clicked somewhere else. Only the arrow keys and Enter stay with a list.
function isEditable(target: EventTarget | null, combo: string): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return /^(ArrowUp|ArrowDown|Enter)$/.test(combo)
  if (tag !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  // a number field (BPM, length) has no use for Space: play / pause still works while it has the focus
  if (type === 'number' && combo === 'Space') return false
  return TEXT_INPUT_TYPES.has(type)
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
      // typing in a field keeps its own keys; function keys still work. A drop-down list has no use for
      // Delete or Backspace, so those still reach the editor: after choosing a grid size the focus stays on the
      // list, and Delete must not silently do nothing.
      if (isEditable(e.target, combo) && !/^(F\d+|Escape)$/.test(combo)) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.tagName === 'INPUT')) el.blur()   // keys go to the Studio again
      if (shortcutState.winampOpen && id !== 'app.winamp') return
      e.preventDefault()
      if (e.repeat && !REPEATABLE.has(id)) return
      runAction(id)
    }

    // Space also "clicks" a focused button on key-up: swallow that when Space is a shortcut
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ' && map.has('space') && !isEditable(e.target, 'Space') && !shortcutState.winampOpen) {
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
