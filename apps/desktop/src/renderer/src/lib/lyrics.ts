// Song structure for lyrics: ACE-Step sings best when the text is split into sections ([Verse], [Chorus], ...).

export const SECTION_TAGS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'] as const

const TAG = /^\s*\[[^\]]+\]\s*$/m

export function hasSections(text: string): boolean {
  return TAG.test(text)
}

/**
 * Give lyrics without section tags a structure: stanzas (blocks between empty lines) become sections; a stanza that
 * comes back is the chorus, the others are verses; without a repeated stanza they alternate verse / chorus.
 * One long block without empty lines is cut into stanzas of four lines first. Text that has tags stays as it is.
 */
export function autoStructure(text: string): string {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean || hasSections(clean)) return text
  let blocks = clean.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length === 1) {
    const lines = blocks[0].split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 4) {
      blocks = []
      for (let i = 0; i < lines.length; i += 4) blocks.push(lines.slice(i, i + 4).join('\n'))
    }
  }
  const key = (b: string): string => b.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim()
  const count = new Map<string, number>()
  for (const b of blocks) count.set(key(b), (count.get(key(b)) ?? 0) + 1)
  const repeated = blocks.some((b) => (count.get(key(b)) ?? 0) > 1)
  return blocks.map((b, i) => {
    const chorus = repeated ? (count.get(key(b)) ?? 0) > 1 : blocks.length > 1 && i % 2 === 1
    return `[${chorus ? 'Chorus' : 'Verse'}]\n${b}`
  }).join('\n\n')
}
