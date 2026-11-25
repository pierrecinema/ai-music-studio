# Translating AI Music Studio

The app is written with English texts in the code. Every text a person sees goes through `tr('English text')`
(or `trf('Text with {value}', { value })` for texts with numbers or names in them). `tr` looks the text up in the
table of the language chosen in **Settings → General → Language** and falls back to English when there is no entry.

The tables live in `apps/desktop/src/renderer/src/i18n/ui/<language>.json`: the key is the English text, the value
the translation.

```json
{
  "Save the project before closing?": "Projekt vor dem Schließen speichern?",
  "Sync all to {bpm} BPM": "Alle auf {bpm} BPM synchronisieren"
}
```

| Language | File | State |
|---|---|---|
| Deutsch | `de.json` | complete |
| Français, Español, Italiano, Português, 中文 | `fr.json`, `es.json`, `it.json`, `pt.json`, `zh.json` | complete |
| Русский | `ru.json` | complete (0.86) |

## Rules

- Keep every `{name}` in the translation exactly as it is; you may move it.
- Keys are compared with their white space folded to single spaces, so a text that runs over several lines in the
  code is one line in the table.
- A text that begins or ends with a space is part of a sentence built from several pieces (for example around a
  bold word). Translate the piece so the whole sentence reads well; the spaces are kept by the code.
- Names (ACE-Step, Demucs, LUFS, WAV, MP3, Ctrl+S …) stay as they are and need no entry.

## Find the texts that are missing

```bash
cd apps/desktop
node scripts/i18n-check.cjs        # how many texts each language has and how many are missing
node scripts/i18n-check.cjs fr     # the missing texts of one language, as a JSON list
```

The check reads the whole interface with the TypeScript compiler: every `tr(…)` / `trf(…)` text, also inside
`a ? 'x' : 'y'`, the `label:`, `hint:` and `desc:` values of option lists, and the effect names. Some of the
"missing" texts are names and units that stay English on purpose.

## New code

Write new texts in English inside `tr()` / `trf()`, then add the German entry (and the other languages when you can)
to the tables in the same change. Texts in a list that is shown through `tr(item.label)` are picked up as well.
Test with the browser preview (`pnpm preview:browser`, port 5199) after choosing the language in Settings.

Translations or corrections are welcome as a pull request or in a GitHub issue.
