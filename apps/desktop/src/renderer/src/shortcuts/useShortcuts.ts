import { pianoFocus } from '../components/timeline/studioOps'
import { useEffect } from 'react'
import { useUIStore } from '../stores/ui.store'
import { runAction } from './handlers'
import { ACTIONS, buildMap, eventToCombo } from './registry'


const REPEATABLE = new Set(ACTIONS.filter((a) => a.repeatable).map((a) => a.id))
// Ctrl+C / X / V / A copy clips only in the editors. Everywhere else (logs, library, settings, dialogs), and
// whenever text is selected, they are the normal text commands: since 0.14.2 log texts could not be copied.
const TEXT_ACTIONS = new Set(['edit.copy', 'edit.cut', 'edit.paste', 'edit.selectAll'])
const CLIP_VIEWS = new Set(['timeline', 'piano-roll', 'mixer'])

function wantsTextCommand(id: string): boolean {
  if (!TEXT_ACTIONS.has(id)) return false
  if (id === 'edit.selectAll' && pianoFocus.active) return false      // Ctrl+A in the Piano Roll: all notes
  if ((window.getSelection()?.toString() ?? '').trim()) return true
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return true
  return !CLIP_VIEWS.has(useUIStore.getState().activeView)
}
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
      if (wantsTextCommand(id)) return                     // the browser copies / pastes the text itself
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.tagName === 'INPUT')) el.blur()   // keys go to the Studio again
      e.preventDefault()
      if (e.repeat && !REPEATABLE.has(id)) return
      runAction(id)
    }

    // Space also "clicks" a focused button on key-up: swallow that when Space is a shortcut
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ' && map.has('space') && !isEditable(e.target, 'Space')) {
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
