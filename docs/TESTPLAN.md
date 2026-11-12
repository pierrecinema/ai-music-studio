# Testplan AI Music Studio

Damit wir systematisch testen: jede Zeile einmal durchgehen, Ergebnis eintragen (✅ geht, ❌ Fehler, ⏭ nicht getestet) und
bei Fehlern kurz notieren, was passiert ist. Stand: Version 0.18.2.

**Ergebnisse (11.11.2026, PC A):** Bereiche 1, 2, 4, 5 alles ✅ · Bereich 3 ✅ außer 3.6 (ACE-Step 1.5) ❌ · Bereich 6 getestet: 6.1, 6.5, 6.6, 6.7 ❌ (siehe Notizen), Rest ✅ · Bereich 7 wird zuerst umgebaut.

**Fehler melden:** In der App unten rechts *Feedback* → *Detailliertes Log* einschalten → Fehler nachstellen → Log speichern
und mit Screenshot in einem GitHub-Issue anhängen (https://github.com/pierrecinema/ai-music-studio/issues) oder Claude geben.

**Testrechner:** A = PC mit AMD Radeon R9 290 · B = PC mit 16 GB RAM (nur Prozessor) · C = später NVIDIA

Tipp: Pro Sitzung einen Bereich testen (z. B. heute 1–3, morgen 4–6). Nach jedem Update die Zeilen mit „neu“ zuerst.

## 1. Installation und Updates

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 1.1 | Installer von GitHub laden und starten | SmartScreen-Warnung → „Weitere Informationen“ → „Trotzdem ausführen“ → installiert | ✅ | | |
| 1.2 | Settings → Updates, „Nach Updates suchen“ | neueste Version wird angeboten bzw. „aktuell“ | ✅ | | |
| 1.3 | Update installieren, während die App läuft | App schließt sich selbst, installiert, startet neu, ohne Rückfrage | ✅ | | |
| 1.4 | Settings → About | richtige Version, Links öffnen GitHub, „Donate with PayPal“ öffnet PayPal | ✅ | | |

## 2. AI Engines

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 2.1 | Settings → AI Engines → empfohlene Pakete → Install selected | Log läuft durch, am Ende alles grün | ✅ | | |
| 2.2 | „Graphics card support (AMD / Intel)“ installieren | grün, Hardware-Tab zeigt die Grafikkarte | ✅ | – | |
| 2.3 | neu: „Fast vocal separation“ installieren | grün, eigene Umgebung | ✅ | | |
| 2.4 | „Audio → MIDI (basic-pitch)“ installieren | grün | ✅ | | |
| 2.5 | Text im Log markieren, Strg+C / Rechtsklick → Kopieren | Text wird kopiert | ✅ | | |

## 3. Create music

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 3.1 | MusicGen small, Instrumental, 30 s | Song entsteht, landet in der Library | ✅ | | |
| 3.2 | Längerer Track (2 min) | mehrere Teile werden aneinandergehängt, keine hörbare Naht | ✅ | | |
| 3.3 | Create loop, 4 Takte, 120 BPM | Titel „… Loop 120 BPM 4 bars“, wiederholt sich nahtlos | ✅ | | |
| 3.4 | Abbrechen während der Erzeugung | stoppt innerhalb weniger Sekunden | ✅ | | |
| 3.5 | Tags eintragen | Tags erscheinen in der Library | ✅ | | |
| 3.6 | ACE-Step 1.5 (falls installiert): kurzer Song mit Text | Song mit Gesang (langsam auf dem Prozessor) | ❌ | | hat nie funktioniert: Log/Fehlermeldung nachreichen |

## 4. Library

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 4.1 | ▶ bei einem Song | spielt, Wellenform erscheint darunter | ✅ | | |
| 4.2 | In die Wellenform klicken / ziehen | springt an die Stelle | ✅ | | |
| 4.3 | Suche: Name, Tag, „124“, „120-130“ | passende Einträge | ✅ | | |
| 4.4 | Umbenennen, Tags, Favorit | wird gespeichert | ✅ | | |
| 4.5 | Export… WAV 24 / FLAC / MP3 | Dateien im gewählten Ordner, abspielbar | ✅ | | |
| 4.6 | neu: „Add to project“ zweimal | jedes Mal eine neue Audiospur | ✅ | | |
| 4.7 | Loop „Add to project“, mehrmals Strg+D im Studio | Loop läuft endlos ohne Lücke, bleibt im Takt | ✅ | | |
| 4.8 | Samples: Ordner hinzufügen, ▶ | spielt, Wellenform, Spulen geht | ✅ | | |
| 4.9 | neu: Samples „Studio: synced“ / „as is“ mehrmals | jedes Mal eine neue Audiospur | ✅ | | |
| 4.10 | Samples „+ Library“ | erscheint unter My tracks | ✅ | | |

## 5. Stem Splitter

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 5.1 | „Vocals + Instrumental (fastest)“ | Fortschrittsbalken, am Ende „Done (DirectML)“ auf A; Zeit notieren | ✅ | | |
| 5.2 | neu: „4 Stems on the graphics card“ | 4 Stems, „Done (DirectML)“ auf A; Zeit notieren | ✅ | | |
| 5.3 | „Fast“ | 4 Stems auf dem Prozessor; Zeit notieren | ✅ | | |
| 5.4 | „Balanced“ / „6 Stems“ | funktioniert (dauert lange) | ✅ | | |
| 5.4b | neu: während einer Trennung ✕ Cancel, dann eine neue starten | bricht ab, neue startet sofort (kein Hängen bei 0 %) | ✅ | | |
| 5.5 | Stem-Mixer: Play, Solo, Mute, Lautstärke, Wellenform spulen | hört sich richtig an | ✅ | | |
| 5.6 | Vocals stumm → Export remix… | Karaoke-Datei „… – no vocals“ | ✅ | | |
| 5.7 | → MIDI bei Bass oder Vocals | neue MIDI-Spur mit Noten, Piano Roll zeigt sie | ✅ | | |
| 5.8 | Save to library → Open Library → Stems | Tab Stems mit dem Song und allen Stems | ✅ | | |
| 5.9 | Export Stems… | jede Stem-Datei im Ordner | ✅ | | |

## 6. Studio, Piano Roll, Mixer

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 6.1 | neu: Audio-Clip unter die letzte Spur ziehen | Rahmen „Release here: new audio track“, beim Loslassen neue Audiospur | ❌ | | beim Loslassen keine neue Spur; 0.18.3: Ablagefläche unter der letzten Spur → neu testen |
| 6.2 | neu: MIDI-Clip unter die letzte Spur ziehen | neue MIDI-Spur | ✅ | |  |
| 6.3 | Audiodatei aus dem Explorer in den leeren Bereich ziehen | neue Audiospur | ✅ | | nur Audio reinziehen geht |
| 6.4 | Space, Strg+C / Strg+V / Strg+D / Strg+Z | funktionieren (Ableton- und Cubase-Layout) | ✅ | |  |
| 6.5 | Sync all / AUTO SYNC mit Loops | Loops bleiben im Takt | ❌ | | nach AUTO SYNC nicht synchron mit Beat matching, erst nach Nacharbeit → Details nötig |
| 6.6 | Rechtsklick auf Clip → Split into stems | Stems als neue Spuren | ❌ | | nichts passiert / Stems nicht gefunden; 0.18.3: Fortschritt + Hinweis wo → neu testen |
| 6.7 | Piano Roll: Noten zeichnen, verschieben, quantisieren | geht | ✅ | | Noten erst nach Quantize editierbar; kein Ton oder sehr verzerrt; 0.18.3: Limiter → neu testen |
| 6.8 | Mixer: Fader, Pan, Mute, Solo | hörbar, Pegelanzeige bewegt sich | ✅ | | Wunsch: Studio/Mixer-Höhe verschiebbar → 0.18.3 |
| 6.9 | Projekt speichern (Strg+S), schließen, öffnen | alles wieder da | ✅ | |  |
| 6.10 | File → Export | WAV des Songs | ✅ | |  |

## 6b. Nachtest nach 0.18.3

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 6b.1 | Clip auf die gestrichelte Fläche „+ Drag a clip … here for a new track“ unter der letzten Spur ziehen | Fläche leuchtet lila, beim Loslassen neue Spur mit dem Clip | | | |
| 6b.2 | Rechtsklick auf Song-Clip → Split into stems | oben rechts in der Werkzeugleiste „Separating stems … %“, danach Meldung; neue Spuren ganz unten in einer Gruppe | | | |
| 6b.3 | Piano Roll: MIDI-Spur → Doppelklick (Clip) → Piano Roll → Noten zeichnen **ohne** Quantize | Noten erscheinen und lassen sich verschieben; Ton klingt sauber | | | |
| 6b.4 | Viele Noten gleichzeitig abspielen (z. B. → MIDI eines Stems) | kein hartes Verzerren mehr | | | |
| 6b.4b | Piano Roll: mehrere Noten zeichnen, in die Piano Roll klicken, Strg+A → Quantize; mit „Select“ einen Rahmen um Noten ziehen → verschieben / Entf | alle bzw. die eingerahmten Noten werden gewählt, zusammen verschoben, quantisiert oder gelöscht | ✅ | |  |
| 6b.7 | ACE-Step 1.5 neu installieren (AI Engines → Haken → Install selected), dann kurzer Song | Install endet grün, Song entsteht (langsam); sonst Fehlermeldung an Claude | ❌ | | 0.18.3: nano-vllm nicht gefunden → 0.18.4 neu testen |
| 6b.8 | App zweimal starten | zweites Mal kommt nur das offene Fenster nach vorne | ✅ | |  |
| 6b.5 | Trennlinie zwischen Studio und Mixer ziehen, Doppelklick | Höhe stufenlos, Doppelklick = Standard | | | |
| 6b.6 | AUTO SYNC: Loop/Song einfügen, AUTO SYNC an, abspielen | Clip im Takt; wenn nicht: Tempo des Songs, BPM des Projekts, Screenshot | | | |

## 7. Mastering, AI Chat, Sonstiges (wird zuerst umgebaut)

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 7.1 | Mastering mit Referenz-Track | gemasterte Datei | | | |
| 7.2 | AI Chat mit Ollama (lokal) | Antwort ohne Schlüssel | | | |
| 7.3 | AI Chat mit Grok / Claude / ChatGPT (mit Schlüssel) | Antwort | | | |
| 7.4 | Coming-soon-Menüpunkte | „Coming soon“-Seite, kein Fehler | | | |
| 7.5 | MCP: Claude Code lokal mit `http://127.0.0.1:38765/mcp` | Claude sieht die App-Werkzeuge | | | |

## Ergebnisse

Nach dem Test: Datei mit den Einträgen an Claude geben („hier der Testplan mit Ergebnissen“). Fehler (❌) werden zuerst
behoben, dann der nächste Bereich.
