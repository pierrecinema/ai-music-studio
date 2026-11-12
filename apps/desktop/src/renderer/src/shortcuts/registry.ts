export type PresetId = 'ableton' | 'cubase'
export type Group = 'Transport' | 'Edit' | 'Tracks' | 'Tools' | 'Zoom' | 'Views' | 'App'

export interface ActionDef {
  id: string
  label: string
  group: Group
  repeatable?: boolean   // fires again while the key is held (zoom)
}

// Only actions this app can really perform.
export const ACTIONS: ActionDef[] = [
  { id: 'transport.playStop', label: 'Play / pause', group: 'Transport' },
  { id: 'transport.play', label: 'Play (continue)', group: 'Transport' },
  { id: 'transport.stop', label: 'Stop', group: 'Transport' },
  { id: 'transport.toStart', label: 'Stop and return to start', group: 'Transport' },
  { id: 'transport.record', label: 'Record on / off', group: 'Transport' },
  { id: 'transport.metronome', label: 'Metronome on / off', group: 'Transport' },
  { id: 'transport.loop', label: 'Loop (cycle) on / off', group: 'Transport' },
  { id: 'loop.selection', label: 'Loop around the selected clips (set locators)', group: 'Transport' },
  { id: 'transport.punchIn', label: 'Punch in on / off', group: 'Transport' },
  { id: 'transport.punchOut', label: 'Punch out on / off', group: 'Transport' },
  { id: 'marker.add', label: 'Add a marker at the playhead', group: 'Transport' },
  { id: 'marker.next', label: 'Jump to the next marker', group: 'Transport' },
  { id: 'marker.prev', label: 'Jump to the previous marker', group: 'Transport' },

  { id: 'edit.undo', label: 'Undo', group: 'Edit' },
  { id: 'edit.redo', label: 'Redo', group: 'Edit' },
  { id: 'edit.copy', label: 'Copy the selected clips', group: 'Edit' },
  { id: 'edit.cut', label: 'Cut the selected clips', group: 'Edit' },
  { id: 'edit.paste', label: 'Paste at the playhead (again: right behind it)', group: 'Edit' },
  { id: 'edit.duplicate', label: 'Duplicate the selected clips right after them (or the track)', group: 'Edit' },
  { id: 'file.new', label: 'New project', group: 'Edit' },
  { id: 'file.open', label: 'Open project', group: 'Edit' },
  { id: 'file.save', label: 'Save project', group: 'Edit' },
  { id: 'file.saveAs', label: 'Save project as', group: 'Edit' },
  { id: 'file.export', label: 'Export audio (WAV / MP3)', group: 'Edit' },
  { id: 'grid.toggle', label: 'Snap to grid on / off', group: 'Edit' },
  { id: 'grid.triplet', label: 'Triplet grid on / off', group: 'Edit' },
  { id: 'grid.narrow', label: 'Narrower grid', group: 'Edit' },
  { id: 'grid.widen', label: 'Wider grid', group: 'Edit' },
  { id: 'edit.quantize', label: 'Quantize the selected clip or notes', group: 'Edit' },
  { id: 'edit.quantizeSettings', label: 'Quantize settings', group: 'Edit' },
  { id: 'clip.nudgeLeft', label: 'Nudge clip or notes earlier (one grid step)', group: 'Edit', repeatable: true },
  { id: 'clip.nudgeRight', label: 'Nudge clip or notes later (one grid step)', group: 'Edit', repeatable: true },
  { id: 'note.up', label: 'Selected notes up one semitone', group: 'Edit', repeatable: true },
  { id: 'note.down', label: 'Selected notes down one semitone', group: 'Edit', repeatable: true },
  { id: 'clip.split', label: 'Split selected clip at the playhead', group: 'Edit' },
  { id: 'clip.delete', label: 'Delete selected clips (or the track if no clip is selected)', group: 'Edit' },
  { id: 'edit.selectAll', label: 'Select all clips', group: 'Edit' },
  { id: 'clip.consolidate', label: 'Consolidate the selected clips into one', group: 'Edit' },
  { id: 'clip.crossfade', label: 'Crossfade the selected clip with the clip before', group: 'Edit' },

  { id: 'track.addAudio', label: 'Add audio track', group: 'Tracks' },
  { id: 'track.addMidi', label: 'Add MIDI track', group: 'Tracks' },
  { id: 'track.delete', label: 'Delete selected track', group: 'Tracks' },
  { id: 'track.mute', label: 'Mute selected track', group: 'Tracks' },
  { id: 'track.solo', label: 'Solo selected track', group: 'Tracks' },
  { id: 'track.group', label: 'Group the selected tracks', group: 'Tracks' },
  { id: 'track.automation', label: 'Show / hide the automation lane', group: 'Tracks' },

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
      'transport.record': ['F9', 'Ctrl+R'],
      'transport.metronome': ['O'],
      'loop.selection': ['Ctrl+L'],
      'edit.undo': ['Ctrl+Z'],
      'edit.redo': ['Ctrl+Y'],
      'edit.selectAll': ['Ctrl+A'],
      'edit.copy': ['Ctrl+C'],
      'edit.cut': ['Ctrl+X'],
      'edit.paste': ['Ctrl+V'],
      'clip.consolidate': ['Ctrl+J'],
      'track.group': ['Ctrl+G'],
      'track.automation': ['A'],
      'edit.duplicate': ['Ctrl+D'],
      'file.new': ['Ctrl+N'],
      'file.open': ['Ctrl+O'],
      'file.save': ['Ctrl+S'],
      'file.saveAs': ['Ctrl+Shift+S'],
      'file.export': ['Ctrl+Shift+R'],
      'clip.split': ['Ctrl+E'],
      'grid.toggle': ['Ctrl+4'],
      'grid.narrow': ['Ctrl+1'],
      'grid.triplet': ['Ctrl+3'],
      'grid.widen': ['Ctrl+2'],
      'edit.quantize': ['Ctrl+U'],
      'edit.quantizeSettings': ['Ctrl+Shift+U'],
      'clip.nudgeLeft': ['ArrowLeft'],
      'clip.nudgeRight': ['ArrowRight'],
      'note.up': ['ArrowUp'],
      'note.down': ['ArrowDown'],
      'clip.delete': ['Delete', 'Backspace'],
      'track.addAudio': ['Ctrl+T'],
      'track.addMidi': ['Ctrl+Shift+T'],
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
      'transport.record': ['Num*', 'Ctrl+R'],
      'transport.metronome': ['C'],
      'transport.loop': ['Num/'],
      'loop.selection': ['P'],
      'transport.punchIn': ['I'],
      'transport.punchOut': ['O'],
      'marker.add': ['Insert'],
      'marker.next': ['Shift+N'],
      'marker.prev': ['Shift+B'],
      'edit.undo': ['Ctrl+Z'],
      'edit.redo': ['Ctrl+Shift+Z'],
      'edit.selectAll': ['Ctrl+A'],
      'edit.copy': ['Ctrl+C'],
      'edit.cut': ['Ctrl+X'],
      'edit.paste': ['Ctrl+V'],
      'clip.crossfade': ['X'],
      'edit.duplicate': ['Ctrl+D'],
      'file.new': ['Ctrl+N'],
      'file.open': ['Ctrl+O'],
      'file.save': ['Ctrl+S'],
      'file.saveAs': ['Ctrl+Shift+S'],
      'clip.split': ['Alt+X'],
      'grid.toggle': ['J'],
      'edit.quantize': ['Q'],
      'clip.delete': ['Delete', 'Backspace'],
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
