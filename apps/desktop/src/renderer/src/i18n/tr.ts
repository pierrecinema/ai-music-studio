// Translations of the screens written with English text in the code: tr('English text') returns the text in the
// language chosen in Settings, or the English text itself when there is no translation. One file per language in
// ./ui (key: the English text). New texts are found with the scanner described in docs/TRANSLATING.md.
import i18n from './index'
import de from './ui/de.json'
import es from './ui/es.json'
import fr from './ui/fr.json'
import it from './ui/it.json'
import ja from './ui/ja.json'
import ko from './ui/ko.json'
import pt from './ui/pt.json'
import ru from './ui/ru.json'
import zh from './ui/zh.json'

const TABLES: Record<string, Record<string, string>> = { de, es, fr, it, ja, ko, pt, ru, zh }

// keys are stored with their white space folded to single spaces (texts in JSX may run over several lines)
const fold = (s: string): string => s.replace(/\s+/g, ' ')

export function tr(en: string): string {
  const lang = (i18n.language || 'en').slice(0, 2)
  const table = TABLES[lang]
  if (!table) return en
  const t = table[en] ?? table[fold(en)]
  return t === undefined || t === '' ? en : t
}

// A text with values in it: trf('Sync all to {bpm} BPM', { bpm: 124 }). The translation keeps the {names}.
export function trf(en: string, vars: Record<string, string | number>): string {
  return tr(en).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
