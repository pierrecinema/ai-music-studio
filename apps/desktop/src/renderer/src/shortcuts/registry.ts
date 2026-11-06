export type PresetId = 'ableton' | 'cubase'
export type Group = 'Transport' | 'Edit' | 'Tracks' | 'Tools' | 'Zoom' | 'Views' | 'App'

export interface ActionDef {
  id: string
  label: string
  group: Group
  repeatable?: boolean   // fires again while the key is held (zoom)
}

// Only actions this app can really perform. Other DAW shortcuts (loop, quantize, comping, ...)
// are left out until the matching feature exists.
export const ACTIONS: ActionDef[] = [
  { id: 'transport.playStop', label: 'Play / pause', group: 'Transport' },
  { id: 'transport.play', label: 'Play (continue)', group: 'Transport' },
  { id: 'transport.stop', label: 'Stop', group: 'Transport' },
  { id: 'transport.toStart', label: 'Stop and return to start', group: 'Transport' },
  { id: 'transport.record', label: 'Record on / off', group: 'Transport' },
  { id: 'transport.metronome', label: 'Metronome on / off', group: 'Transport' },

  { id: 'edit.undo', label: 'Undo', group: 'Edit' },
  { id: 'edit.redo', label: 'Redo', group: 'Edit' },
  { id: 'edit.duplicate', label: 'Duplicate selected track', group: 'Edit' },
  { id: 'file.new', label: 'New project', group: 'Edit' },

  { id: 'track.addAudio', label: 'Add audio track', group: 'Tracks' },
  { id: 'track.addMidi', label: 'Add MIDI track', group: 'Tracks' },
  { id: 'track.delete', label: 'Delete selected track', group: 'Tracks' },
  { id: 'track.mute', label: 'Mute selected track', group: 'Tracks' },
  { id: 'track.solo', label: 'Solo selected track', group: 'Tracks' },

  { id: 'tool.drawToggle', label: 'Piano roll: toggle draw mode', group: 'Tools' },
  { id: 'tool.draw', label: 'Piano roll: draw tool', group: 'Tools' },
  { id: 'tool.select', label: 'Piano roll: select tool', group: 'Tools' },
  { id: 'tool.erase', label: 'Piano roll: erase tool', group: 'Tools' },

  { id: 'zoom.in', label: 'Zoom in', group: 'Zoom', repeatable: true },
  { id: 'zoom.out', label: 'Zoom out', group: 'Zoom', repeatable: true },

  { id: 'view.pianoRoll', label: 'Show / hide piano roll', group: 'Views' },
  { id: 'view.mixer', label: 'Show / hide mixer', group: 'Views' },
  { id: 'view.settings', label: 'Open settings', group: 'Views' },
  { id: 'view.closeSettings', label: 'Close settings', group: 'Views' },
  { id: 'view.fullscreen', label: 'Full screen', group: 'Views' },

  { id: 'app.winamp', label: 'Winamp mode', group: 'App' },
]

export interface Preset {
  name: string
  description: string
  keys: Record<string, string[]>
}

// Ableton Live 12: official manual, chapter "Live Keyboard Shortcuts" (Windows).
// Cubase: default key commands (Steinberg forum list, Cubase 11; newer versions may differ).
export const PRESETS: Record<PresetId, Preset> = {
  ableton: {
    name: 'Ableton Live 12',
    description: 'Space, F9 record, O metronome, Ctrl+T new audio track, B draw mode, Ctrl+Y redo',
    keys: {
      'transport.playStop': ['Space'],
      'transport.play': ['Shift+Space'],
      'transport.toStart': ['Home'],
      'transport.record': ['F9'],
      'transport.metronome': ['O'],
      'edit.undo': ['Ctrl+Z'],
      'edit.redo': ['Ctrl+Y'],
      'edit.duplicate': ['Ctrl+D'],
      'file.new': ['Ctrl+N'],
      'track.addAudio': ['Ctrl+T'],
      'track.addMidi': ['Ctrl+Shift+T'],
      'track.delete': ['Delete'],
      'track.mute': ['0'],
      'track.solo': ['S'],
      'tool.drawToggle': ['B'],
      'zoom.in': ['+', '='],
      'zoom.out': ['-'],
      'view.pianoRoll': ['Shift+Tab', 'F12'],
      'view.mixer': ['Ctrl+Alt+M'],
      'view.settings': ['Ctrl+,'],
      'view.closeSettings': ['Escape'],
      'view.fullscreen': ['F11'],
      'app.winamp': ['Ctrl+M'],
    },
  },
  cubase: {
    name: 'Cubase',
    description: 'Space, Num* record, C metronome, T add track, M/S mute/solo, 1/5/8 tools, H/G zoom',
    keys: {
      'transport.playStop': ['Space'],
      'transport.play': ['NumEnter'],
      'transport.stop': ['Num0'],
      'transport.toStart': ['Num.'],
      'transport.record': ['Num*'],
      'transport.metronome': ['C'],
      'edit.undo': ['Ctrl+Z'],
      'edit.redo': ['Ctrl+Shift+Z'],
      'edit.duplicate': ['Ctrl+D'],
      'file.new': ['Ctrl+N'],
      'track.addAudio': ['T'],
      'track.delete': ['Shift+Delete'],
      'track.mute': ['M'],
      'track.solo': ['S'],
      'tool.select': ['1'],
      'tool.erase': ['5'],
      'tool.draw': ['8'],
      'zoom.in': ['H'],
      'zoom.out': ['G'],
      'view.pianoRoll': ['Ctrl+E'],
      'view.mixer': ['F3'],
      'view.closeSettings': ['Escape'],
      'app.winamp': ['Ctrl+M'],
    },
  },
}

const NUMPAD: Record<string, string> = {
  NumpadEnter: 'NumEnter', NumpadDecimal: 'Num.', NumpadMultiply: 'Num*',
  NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadDivide: 'Num/',
}

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey?: boolean
  getModifierState?: (k: string) => boolean
}

// Turns a keyboard event into a combo string such as "Ctrl+Shift+Z", "Space", "Num*".
export function eventToCombo(e: KeyLike): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return null
  // AltGr on many layouts is reported as Ctrl+Alt: it types characters, it is not a shortcut
  if (e.getModifierState?.('AltGraph')) return null

  let main: string
  let shiftInKey = false
  if (e.code in NUMPAD) {
    main = NUMPAD[e.code]
  } else if (/^Numpad\d$/.test(e.code)) {
    main = `Num${e.code.slice(6)}`
  } else if (e.key === ' ') {
    main = 'Space'
  } else if (e.key.length === 1) {
    main = e.key.toUpperCase()
    // symbols like "+" already encode Shift; letters and digits do not
    shiftInKey = !/[A-Z0-9]/.test(main)
  } else {
    main = e.key
  }

  const mods = [e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && !shiftInKey ? 'Shift' : '']
  return [...mods.filter(Boolean), main].join('+')
}

export function buildMap(preset: PresetId): Map<string, string> {
  const map = new Map<string, string>()
  for (const [id, combos] of Object.entries(PRESETS[preset].keys)) {
    for (const c of combos) map.set(c.toLowerCase(), id)
  }
  return map
}

export function formatCombo(c: string): string {
  return c.replace(/(^|\+)Num(?=\S)/g, '$1Num ').replace('Escape', 'Esc')
}
