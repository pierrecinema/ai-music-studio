# Testplan AI Music Studio

Damit wir systematisch testen: jede Zeile einmal durchgehen, Ergebnis eintragen (✅ geht, ❌ Fehler, ⏭ nicht getestet) und
bei Fehlern kurz notieren, was passiert ist. Stand: Version 0.18.6.

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
| 3.6 | ACE-Step 1.5 (falls installiert): kurzer Song mit Text | Song mit Gesang (langsam auf dem Prozessor) | ✅ | | geht seit 0.18.7 (siehe 6b.7) |

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
| 6b.1 | Clip auf die gestrichelte Fläche „+ Drag a clip … here for a new track“ unter der letzten Spur ziehen | Fläche leuchtet lila, beim Loslassen neue Spur mit dem Clip | ✅ | | |
| 6b.2 | Rechtsklick auf Song-Clip → Split into stems | oben rechts in der Werkzeugleiste „Separating stems … %“, danach Meldung; neue Spuren ganz unten in einer Gruppe | ✅ | | Wunsch: Spurhöhe mit der Maus → 0.18.9 (6b.12) |
| 6b.3 | Piano Roll: MIDI-Spur → Doppelklick (Clip) → Piano Roll → Noten zeichnen **ohne** Quantize | Noten erscheinen und lassen sich verschieben; Ton klingt sauber | | | |
| 6b.4 | Viele Noten gleichzeitig abspielen (z. B. → MIDI eines Stems) | kein hartes Verzerren mehr | | | |
| 6b.4b | Piano Roll: mehrere Noten zeichnen, in die Piano Roll klicken, Strg+A → Quantize; mit „Select“ einen Rahmen um Noten ziehen → verschieben / Entf | alle bzw. die eingerahmten Noten werden gewählt, zusammen verschoben, quantisiert oder gelöscht | ✅ | |  |
| 6b.7 | ACE-Step 1.5 neu installieren (AI Engines → Haken → Install selected), dann kurzer Song | Install endet grün, Song entsteht (langsam); sonst Fehlermeldung an Claude | ✅ | ❌ | 0.18.7: Install ✅, Song ✅ („sehr gut“); 78 % nach 3 Min., bei 80 % „Decoding audio…“ einige Minuten ohne Fortschritt auf dem Prozessor; PC B (16 GB, 0.18.9): „Auslagerungsdatei zu klein“ (os error 1455) → Windows-Auslagerungsdatei vergrößern, 0.18.11 erklärt es |
| 6b.8 | App zweimal starten | zweites Mal kommt nur das offene Fenster nach vorne | ✅ | |  |
| 6b.9 | neu (0.18.5): Neues Projekt, einen ganzen Song (über 90 s) einfügen → Sync to … BPM, Metronom an, abspielen, auch nach 2–3 Minuten | Kick liegt auf den Klicks, Takt 1 des Songs auf einem Taktstrich, kein Auseinanderlaufen | ⏳ | | 0.18.7: läuft mit, aber Start nicht ganz genau → 0.18.8 (Schlag für Schlag gestreckt) neu testen, auch schon den ersten Kick |
| 6b.11 | neu (0.18.7): blaue Abspiel-Linie mit der Maus an eine andere Stelle ziehen, auch während der Song läuft; in den Taktzahlen klicken und ziehen | Linie folgt der Maus (rastet aufs Raster, Alt = frei), beim Loslassen spielt der Song dort weiter | ✅ | | |
| 6b.5 | Trennlinie zwischen Studio und Mixer ziehen, Doppelklick | Höhe stufenlos, Doppelklick = Standard | ✅ | | |
| 6b.6 | AUTO SYNC mit **einem** Clip: Projekt-BPM anders als der Song (z. B. 128), Song einfügen, AUTO SYNC an, Metronom an, abspielen | Clip wird auf das Projekt-BPM gestreckt, Kick auf den Metronom-Klicks (synchronisiert wird zum Projekt-Raster, kein zweiter Track nötig) | ✅ | | 0.18.10 ✅ (Projekt-Tempo oben ändern); nachgemessen: Kick 1 ms nach dem Klick |
| 6b.12 | neu (0.18.9): untere Kante einer Audio- oder MIDI-Spur nach unten/oben ziehen, dann Doppelklick auf die Kante | Spur wird höher/niedriger (Wellenform und Noten wachsen mit), Doppelklick = normale Höhe, bleibt nach Speichern erhalten | ✅ | | |
| 6b.13 | neu (0.18.10): oben im BPM-Feld 128 tippen + Enter; dann 95.5; Pfeil hoch/runter, Mausrad | Tempo ändert sich jedes Mal, ganze Zahl sichtbar | ✅ | | 0.18.10 ✅; Enter stoppte den Song → 0.18.11: spielt mit neuem Tempo weiter (neu testen) |
| 6b.14 | neu (0.18.10): im Studio irgendwo einfach klicken und doppelklicken | blaue Linie springt dorthin (aufs Raster) | ✅ | | |
| 6b.15 | neu (0.18.12): ACE-Step 1.5 Turbo mit LoRA „deep_house-acestep1.5-v1“ (Stärke 1.0), dann mit einem „…-xl-…“-LoRA | deep_house: Hinweis „LoRA … is used at strength 1.00“, Song klingt nach Deep House; XL: Hinweis „made for the larger XL model … left out“, Song entsteht trotzdem | | | |
| 6b.16 | neu (0.18.13): ACE-Step-1.5-Song mit Text (z. B. 90 s), im Studio ans Ende zoomen | Gesang ist drin (12.11. ✅); Clip endet dort, wo die Musik ausklingt, keine Sekunde Stille dahinter | | | |
| 6b.10 | neu (0.18.6): 2–3 Songs/Loops/Stems an verschiedenen Stellen einfügen, alle markieren (Strg+A oder Rahmen) → „Sync together“ (oder AUTO SYNC) | alle auf Master-BPM, Takt 1 von jedem auf demselben Taktstrich, starten gleichzeitig und laufen synchron (auch nach 2–3 Min.) | ✅ | | |

## 6c. Neu in 0.20.0

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 6c.1 | Studio: **A** an einer Spur | Volume und Pan als zwei eigene Spuren darunter; ▾/▸ macht eine klein; Punkte setzen geht | | | |
| 6c.2 | Studio: **FX** an einer Spur → + Effect… Delay, dann EQ; abspielen, Regler bewegen, ⏻ aus/an | Effekt hörbar, Bypass hörbar, auch im Export | | | |
| 6c.3 | Rechtsklick auf Spurkopf (oder Farbstreifen links) → Farbe wählen | Spur und Clips in der neuen Farbe | | | |
| 6c.4 | MIDI-Spur wählen, Piano Roll → **● Rec** (oder Strg+R), auf der Klaviatur links spielen; mit MIDI-Keyboard, falls vorhanden | Noten erscheinen als Kästchen, so lang wie gehalten; Strg+R stoppt | | | |
| 6c.5 | Create: Text eingeben, **[Chorus]**-Knopf, **Auto structure** | Abschnitte werden eingefügt bzw. automatisch gesetzt | | | |
| 6c.6 | Create (ACE-Step 1.5): **Preview voices** → 3 Proben → **Use this voice** → Create | 3 kurze Proben, nicht in der Library; Song mit der gewählten Stimme (ähnlich) | | | |
| 6c.7 | Create: LoRA-Liste bei ACE-Step 1.5 und bei v1 | passende LoRAs normal, unpassende grau mit Grund | | | |
| 6c.8 | Settings → AI → Gemini mit Key; AI Chat | Antwort von Gemini | | | |
| 6c.9 | Positionsanzeige oben anklicken; Channel-Tab Pan | wechselt zu Minuten:Sekunden; Pan zeigt L/R und „Center“ | | | |
| 6c.10 | neu (0.20.1): AI Chat (z. B. Gemini 3.5 Flash): „Mach mir einen kurzen Afro-House-Track mit Frauenstimme“ | KI startet den Song selbst, Fortschritt im Chat, danach „Add to the Studio“; Song in der Library |  | | |
| 6c.11 | neu (0.20.1): Song aus ACE-Step 1.5 in der Library → Export… WAV/MP3 (Rate 44.1 kHz) | Datei hat 44 100 Hz (Rechtsklick → Eigenschaften → Details), Plattform nimmt sie an | | | |
| 6c.12 | neu (0.20.1): Gemini-Key eintragen, App neu starten | Key ist noch da | | | |

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
