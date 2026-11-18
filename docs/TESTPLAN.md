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
| 6.1 | neu: Audio-Clip unter die letzte Spur ziehen | Rahmen „Release here: new audio track“, beim Loslassen neue Audiospur | ✅ | | beim Loslassen keine neue Spur; 0.18.3: Ablagefläche unter der letzten Spur → neu testen; 13.11.2026: vom Owner als getestet abgehakt |
| 6.2 | neu: MIDI-Clip unter die letzte Spur ziehen | neue MIDI-Spur | ✅ | |  |
| 6.3 | Audiodatei aus dem Explorer in den leeren Bereich ziehen | neue Audiospur | ✅ | | nur Audio reinziehen geht |
| 6.4 | Space, Strg+C / Strg+V / Strg+D / Strg+Z | funktionieren (Ableton- und Cubase-Layout) | ✅ | |  |
| 6.5 | Sync all / AUTO SYNC mit Loops | Loops bleiben im Takt | ✅ | | nach AUTO SYNC nicht synchron mit Beat matching, erst nach Nacharbeit → Details nötig; 13.11.2026: vom Owner als getestet abgehakt |
| 6.6 | Rechtsklick auf Clip → Split into stems | Stems als neue Spuren | ✅ | | nichts passiert / Stems nicht gefunden; 0.18.3: Fortschritt + Hinweis wo → neu testen; 13.11.2026: vom Owner als getestet abgehakt |
| 6.7 | Piano Roll: Noten zeichnen, verschieben, quantisieren | geht | ✅ | | Noten erst nach Quantize editierbar; kein Ton oder sehr verzerrt; 0.18.3: Limiter → neu testen |
| 6.8 | Mixer: Fader, Pan, Mute, Solo | hörbar, Pegelanzeige bewegt sich | ✅ | | Wunsch: Studio/Mixer-Höhe verschiebbar → 0.18.3 |
| 6.9 | Projekt speichern (Strg+S), schließen, öffnen | alles wieder da | ✅ | |  |
| 6.10 | File → Export | WAV des Songs | ✅ | |  |

## 6b. Nachtest nach 0.18.3

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 6b.1 | Clip auf die gestrichelte Fläche „+ Drag a clip … here for a new track“ unter der letzten Spur ziehen | Fläche leuchtet lila, beim Loslassen neue Spur mit dem Clip | ✅ | | |
| 6b.2 | Rechtsklick auf Song-Clip → Split into stems | oben rechts in der Werkzeugleiste „Separating stems … %“, danach Meldung; neue Spuren ganz unten in einer Gruppe | ✅ | | Wunsch: Spurhöhe mit der Maus → 0.18.9 (6b.12) |
| 6b.3 | Piano Roll: MIDI-Spur → Doppelklick (Clip) → Piano Roll → Noten zeichnen **ohne** Quantize | Noten erscheinen und lassen sich verschieben; Ton klingt sauber | ✅ | | 13.11.2026: vom Owner als getestet abgehakt |
| 6b.4 | Viele Noten gleichzeitig abspielen (z. B. → MIDI eines Stems) | kein hartes Verzerren mehr | ✅ | | 13.11.2026: vom Owner als getestet abgehakt |
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
| 6b.15 | neu (0.18.12): ACE-Step 1.5 Turbo mit LoRA „deep_house-acestep1.5-v1“ (Stärke 1.0), dann mit einem „…-xl-…“-LoRA | deep_house: Hinweis „LoRA … is used at strength 1.00“, Song klingt nach Deep House; XL: Hinweis „made for the larger XL model … left out“, Song entsteht trotzdem | ✅ | | 13.11.2026: vom Owner als getestet abgehakt |
| 6b.16 | neu (0.18.13): ACE-Step-1.5-Song mit Text (z. B. 90 s), im Studio ans Ende zoomen | Gesang ist drin (12.11. ✅); Clip endet dort, wo die Musik ausklingt, keine Sekunde Stille dahinter | ✅ | | 13.11.2026: vom Owner als getestet abgehakt |
| 6b.10 | neu (0.18.6): 2–3 Songs/Loops/Stems an verschiedenen Stellen einfügen, alle markieren (Strg+A oder Rahmen) → „Sync together“ (oder AUTO SYNC) | alle auf Master-BPM, Takt 1 von jedem auf demselben Taktstrich, starten gleichzeitig und laufen synchron (auch nach 2–3 Min.) | ✅ | | |

## 6c. Neu in 0.20.0

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 6c.1 | Studio: **A** an einer Spur | Volume und Pan als zwei eigene Spuren darunter; ▾/▸ macht eine klein; Punkte setzen geht | ✅ | | |
| 6c.2 | Studio: **FX** an einer Spur → + Effect… Delay, dann EQ; abspielen, Regler bewegen, ⏻ aus/an | Effekt hörbar, Bypass hörbar, auch im Export | ✅ | | |
| 6c.3 | Rechtsklick auf Spurkopf (oder Farbstreifen links) → Farbe wählen | Spur und Clips in der neuen Farbe | ✅ | | |
| 6c.4 | MIDI-Spur wählen, Piano Roll → **● Rec** (oder Strg+R), auf der Klaviatur links spielen; mit MIDI-Keyboard, falls vorhanden | Noten erscheinen als Kästchen, so lang wie gehalten; Strg+R stoppt | ✅ | | ● Rec ✅, Strg+R ging nicht → 6c.16 |
| 6c.5 | Create: Text eingeben, **[Chorus]**-Knopf, **Auto structure** | Abschnitte werden eingefügt bzw. automatisch gesetzt | ✅ | | |
| 6c.6 | Create (ACE-Step 1.5): **Preview voices** → 3 Proben → **Use this voice** → Create | 3 kurze Proben, nicht in der Library; Song mit der gewählten Stimme (ähnlich) | ✅ | | 0.20.7: siehe 6c.14 |
| 6c.7 | Create: LoRA-Liste bei ACE-Step 1.5 und bei v1 | passende LoRAs normal, unpassende grau mit Grund | ✅ | | bei ACE Turbo alle grau → 6c.15; 13.11.2026: vom Owner als getestet abgehakt |
| 6c.8 | Settings → AI → Gemini mit Key; AI Chat | Antwort von Gemini | ✅ | | |
| 6c.9 | Positionsanzeige oben anklicken; Channel-Tab Pan | wechselt zu Minuten:Sekunden; Pan zeigt L/R und „Center“ | ✅ | | |
| 6c.10 | neu (0.20.1): AI Chat (z. B. Gemini 3.5 Flash): „Mach mir einen kurzen Afro-House-Track mit Frauenstimme“ | KI startet den Song selbst, Fortschritt im Chat, danach „Add to the Studio“; Song in der Library | ✅ | | 0.20.3: Gemini schreibt arabischen Text, startet den Song, Fortschritt in % im Chat ✅ (0.20.1: Error 400) |
| 6c.11 | neu (0.20.1): Song aus ACE-Step 1.5 in der Library → Export… WAV/MP3 (Rate 44.1 kHz) | Datei hat 44 100 Hz (Rechtsklick → Eigenschaften → Details), Plattform nimmt sie an | ✅ | | |
| 6c.12 | neu (0.20.1): Gemini-Key eintragen, App neu starten | Key ist noch da | ✅ | | |
| 6c.13 | neu (0.20.2): Settings → Updates → Check for updates nach einem neuen Release | neue Version wird sofort gefunden; ohne Klick sucht die App nur beim Start und einmal am Tag | ✅ | | |
| 6c.14 | neu (0.20.4): Create (ACE-Step 1.5) → **Preview voices** | 3 Proben nur Stimme ohne Musik, gleicher Text; deutlich schneller als 3 Songs (Modell wird nur einmal geladen) | ✅ | | 0.20.7: 3 × 10 s nur Gesang; Proben nach 4:40, 6:30, 9:00 min |
| 6c.15 | neu (0.20.4): Create, ACE-Step 1.5 Turbo → + Add LoRA | raspy-Paket und andere 1.5-LoRAs normal wählbar, nur XL- und v1-LoRAs grau | ✅ | | |
| 6c.16 | neu (0.20.4): Studio, MIDI-Clip anklicken → Strg+R; Piano Roll → Strg+R | MIDI-Aufnahme startet (● Recording…), Strg+R stoppt | ✅ | | 0.20.4: Rec-Knopf ✅, Strg+R ❌ (Ableton und Cubase) → 0.20.6 ✅ |
| 6c.17 | neu (0.20.5): Create mit 2 oder mehr Songs / Versionen | neuester Song oben, der erste unten | ✅ | | |
| 6c.18 | neu (0.30.4): Create, ACE-Step 1.5, Länge 240 s (oder 360 s) | kein Abbruch nach 600 s; der Song wird fertig (auf dem Prozessor dauert das lange) | ✅ | | 0.30.4: 300 s fertig nach etwa 47 min (PC i7-3930K, CPU) |
| 6c.19 | neu (0.30.6): Create, ACE-Step 1.5 Turbo, LoRA „ACE-STEP-1.5v-rain-techno“ (Stärke 1), kurzer Song (30 s) | LoRA ist wählbar (nicht grau); Hinweis „LoRA … is used at strength 1.00“, keine Meldung „not an ACE-Step 1.5 LoRA“; Stil hörbar techno | ✅ | | 0.30.8: techno-acestep1.5-v1 geladen (Stärke 0.75), 60-s-Song ohne Speicherfehler |
| 6c.20 | neu (0.30.7): fertiger Song in Create → **Stem Splitter**; Library → **Stem Splitter** | Stem Splitter öffnet sich mit dem Song und seinem Namen, „Split Stems“ startet | ✅ | | 0.30.8: Stems direkt aus dem fertigen Song |
| 6c.21 | neu (0.30.9): Create mit ACE-Step 1.5, auf die Fortschrittsanzeige am Anfang achten | „Loading ACE-Step 1.5 from the disk (already downloaded …)“; falls „Downloading … missing: …“ erscheint: Text an Claude schicken | ✅ |  | 0.51.7 |

## 7. Mastering (neu in 0.30.0)

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 7.1 | Song aus dem Explorer auf die Mastering-Seite ziehen; **Open…**; Library → **Mastering**; Create → **Mastering**; Studio → File → **Send song to Mastering** | Song öffnet sich als Tab, Wellenform und Werte „vorher“ erscheinen | ✅ | | |
| 7.2 | ▶ Play, Leertaste, in die Wellenform klicken, Bereich ziehen → ⟲ Loop | spielt, springt, wiederholt den Bereich | ✅ | | |
| 7.3 | **After / Before** beim Abspielen umschalten | gleich laut, nur der Klang ändert sich | ✅ | | |
| 7.4 | Target Streaming → **Reach −14 LUFS** | Loudness „nachher“ −14 ±0,5 LUFS, True Peak ≤ −1,0 dBTP, „reached“ grün | ✅ | | 0.30.2 ✅ |
| 7.5 | EQ öffnen, Band verstellen; Kompressor, Multiband (⏻ an), Stereo-Breite / Mono-Bass | hörbar beim Abspielen, Kurve und Werte ändern sich, Gain Reduction bewegt sich | ✅ | | |
| 7.6 | Slot ↑ ↓ verschieben, × entfernen, + Add…, Preset laden und eigenes speichern | Kette ändert sich, Preset ist nach Neustart noch da | ✅ | | |
| 7.7 | Anzeigen beim Abspielen: LUFS M/S, True Peak, Korrelation, Goniometer, Spektrum, Lautheitsverlauf | bewegen sich passend zur Musik | ✅ | | |
| 7.8 | **Export…** WAV 24 + MP3 320, 44.1 kHz, Titel, Interpret, Cover | zwei Dateien; in Windows (Eigenschaften → Details) 44 100 Hz, Titel / Interpret; MP3 zeigt das Cover | ✅ | | alle spielen ab |
| 7.9 | Export FLAC, ALAC, AAC, OGG, Opus, WAV 16 mit Dither | alle Dateien spielen ab; Lautheit wie in der App gemessen | ✅ | | |
| 7.10 | Reference match mit einem Referenz-Song | Ergebnis öffnet sich als neuer Tab | ✅ | |  |
| 7.11 | neu (0.30.2): beim Abspielen **Before** / **After** drücken | Wellenform, Zahlen (groß/hell), Spektrum und Lautheitskurve springen auf Original bzw. Master | ✅ | | 0.30.2: Regler sollen mitspringen → 7.13 |
| 7.12 | neu (0.30.2): **Same loudness** aus, dann Before / After | After ist jetzt deutlich lauter (so laut wie exportiert); mit Häkchen wieder gleich laut, ohne Verzerrung | ✅ | |  |
| 7.13 | neu (0.30.3): EQ / Kompressor / Louder verstellen, dann **Before** und **After** drücken | Before: alle Regler auf Ausgangsstellung (grau), EQ-Kurve flach; After: deine Einstellung, verstellte Regler lila mit • | ✅ |  | 0.51.7 |

## 7c. Mastering 0.31.0: Assistent, Schneiden, neue Effekte

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 7c.1 | Mastering: Song öffnen, Stil wählen (z. B. Techno / House), **✨ Analyse & suggest** | nach wenigen Sekunden: Balken der 8 Bänder (lila Song, grüne Linie Ziel) und Vorschläge mit Begründung | ✅ | | 0.31.1: Deutsch ✅ |
| 7c.2 | Vorschläge anhaken / abhaken, **Apply ticked** | Kette ändert sich (EQ, Kompressor …), danach Loudness ≈ Ziel des Stils (Techno −9, Pop −11 …), True Peak ≤ Ceiling | ✅ | | 0.31.1: angeklickt = nur Haken; Balken blieben gleich → 0.31.2: eigener „Übernehmen“-Knopf, Balken zeigen den Master |
| 7c.3 | **↶ Undo suggestions** | Kette wie vorher | ✅ | | 0.31.1: Knopf nicht gefunden → 0.31.2: „↶ Vorschläge rückgängig“ immer oben rechts |
| 7c.4 | Stil **Soul / R&B** und **Funk**; dann **Reference song…** wählen und neu analysieren | andere Ziellinie und andere Vorschläge; mit Referenz steht „above / below the reference“ | ✅ | | 0.31.1 |
| 7c.5 | In der Wellenform einen Bereich ziehen → **✂ Cut** (oder Strg+X) | Bereich ist weg, Song kürzer, Zeit oben passt | ✅ | | 0.31.1: Wellenform bleibt |
| 7c.6 | Strg+Z, dann Strg+Y | Schnitt rückgängig, dann wieder da | ✅ | | |
| 7c.7 | Bereich → **Copy**, Abspielposition woanders hin → **Paste** (Strg+V) | Stück an der Position eingefügt | ✅ | | |
| 7c.8 | **Delete**, **Crop**, **Silence**, **Fade in / out** (S-curve, linear, log) | tut jeweils das Erwartete; Fades hörbar | ✅ | | |
| 7c.9 | **Gain dB**, **Normalise** (Peak / LUFS), **Trim silence**, **DC** | Werte „vorher“ ändern sich passend | ✅ | | 0.31.1: Gain nicht gefunden → 0.31.2: „Lautstärke … dB · Übernehmen“ und Master-Fader |
| 7c.10 | **+ Marker**, Namen ändern, auf die Zeit klicken | gelbe Linie mit Namen in der Wellenform; Klick springt dorthin | ✅ | | |
| 7c.11 | Nach Schnitten **Export…** | exportierte Datei hat die Schnitte; Originaldatei unverändert | ✅ | | |
| 7c.12 | **+ Add… → Dynamic EQ** (z. B. 3,5 kHz) und **Saturation / exciter** | beim Abspielen hörbar; Gain Reduction zeigt „Dynamic EQ“ | ✅ | | |
| 7c.13 | Zwei Songs öffnen, bei jedem andere Kette, zwischen den Tabs wechseln | jeder Song behält seine Kette | – | | vom Owner nicht benötigt (ein Song im Mastering reicht); funktioniert in der Vorschau |
| 7c.14 | Studio: Spur → **FX → + Effect…** → Dynamic EQ, Saturation, Stereo, Limiter | Effekte erscheinen mit Reglern, hörbar, auch im Export | ✅ | | |
| 7c.15 | Stem Splitter: Stems erstellen → bei einem Stem **Mastering** | Stem öffnet sich im Mastering | ✅ | | Bibliothek → Stems → Mastering |
| 7c.16 | **File → New project** (oder Strg+N) | Fenster fragt nach dem Namen; der Name steht oben und beim Speichern | ✅ | | |
| 7c.17 | neu (0.31.2): **Master-Gain-Fader** rechts oben: ziehen, Mausrad, Doppelklick, −1 / 0 / +1 | Master wird lauter / leiser ohne Übersteuern; TP bleibt ≤ Ceiling, GR (orange) zeigt die Arbeit des Limiters | ✅ | | |
| 7c.18 | neu (0.31.2): Assistent → bei einem Vorschlag **Übernehmen**; dann **Master noch einmal analysieren** | Vorschlag grün „übernommen“; Balken zeigen den Master (lila) mit grauer Kontur fürs Original; Runde 2 schlägt weiter vor | ✅ | | |
| 7c.19 | neu (0.31.2): Wellenform am Ende | nach dem Songende etwas dunkler Leerraum mit Endlinie; Zoom bleibt nach einem Schnitt | ✅ | | 0.31.6 |
| 7c.20 | neu (0.31.3): Mastering, KI-Leiste rechts schließen (×), dann wieder öffnen | zu: Fader und Anzeigen rechts in eigener Spalte, immer sichtbar; offen: Layout wie bisher; nach Neustart bleibt die Leiste so | ✅ | | 0.31.5 |
| 7c.21 | neu (0.31.4): KI-Leiste zu → oben rechts **✦ KI-Assistent**; Reihenfolge rechts | Knopf öffnet die Leiste wieder; rechts: Goniometer + Spektrum, Lautheitsverlauf, Whole song, Live, Master-Gain unten | ✅ | | 0.31.5 |
| 7c.22 | neu (0.31.6): Mastering: weiße Abspiellinie am ▼ oben ziehen; auf der Zeitleiste unter der Wellenform ziehen (auch beim Abspielen) | Position fährt mit der Maus vor und zurück; Klick springt; Ziehen in der Wellenform markiert weiterhin einen Bereich | ✅ | | 0.31.6 |

## 7b. AI Chat, Sonstiges

| # | Test | Erwartet | A | B | Notiz |
|---|---|---|---|---|---|
| 7b.1 | AI Chat mit Ollama (lokal) | Antwort ohne Schlüssel | ✅ | nur mit Gemini getestet; die anderen Anbieter werden als gleich angenommen | 0.51.7 |
| 7b.2 | AI Chat mit Grok / Claude / ChatGPT (mit Schlüssel) | Antwort | ✅ | nur mit Gemini getestet; die anderen Anbieter werden als gleich angenommen | 0.51.7 |
| 7b.3 | Coming-soon-Menüpunkte | „Coming soon“-Seite, kein Fehler | ✅ |  | 0.51.7 |
| 7b.4 | MCP: Claude Code lokal mit `http://127.0.0.1:38765/mcp` | Claude sieht die App-Werkzeuge | ✅ |  | 0.51.7 |

## 8. Neu in 0.40.0: Übersetzung, Speichern beim Schließen

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 8.1 | Einstellungen → Allgemein → Sprache **Deutsch**, dann durch alle Seiten gehen (Musik erstellen, Bibliothek, Studio, Mastering, Stem-Trenner, Einstellungen) | Alles auf Deutsch; nur Namen (ACE-Step, LUFS, WAV …) bleiben englisch. Notiere Stellen, die noch englisch sind (Screenshot) | ✅ | | 0.40.1 |
| 8.2 | Mastering: Song öffnen, Assistent, Kette, Schneiden, Export-Fenster | Knöpfe, Tooltips und Meldungen auf Deutsch | ✅ | | 0.40.1 |
| 8.3 | Sprache **Français**, dann **Español**, **中文** kurz durchklicken | Die ganze App in der Sprache; nichts abgeschnitten oder verrutscht | ✅ | | 0.40.1 |
| 8.4 | Sprache **日本語** | Menü links auf Japanisch, der Rest englisch (so gewollt, kommt später) | ✅ | | 0.40.1 |
| 8.5 | Etwas im Studio ändern (Spur hinzufügen), dann das Fenster mit **X** schließen | Frage „Projekt vor dem Schließen speichern?“ mit Speichern / Nicht speichern / Abbrechen | ✅ | | 0.40.1 |
| 8.6 | Bei der Frage **Abbrechen** | App bleibt offen, nichts geht verloren | ✅ | | 0.40.1 |
| 8.7 | Nochmal schließen, **Speichern** (neues Projekt: Speicherort wählen) | Projekt wird gespeichert, dann schließt die App. Beim Speichern-Dialog auf Abbrechen: App bleibt offen | ✅ | | 0.40.1 |
| 8.8 | Nochmal ändern, schließen, **Nicht speichern** | App schließt sofort | ✅ | | 0.40.1 |
| 8.9 | Ohne Änderungen schließen | Keine Frage, App schließt sofort | ✅ | | 0.40.1 |
| 8.10 | Bibliothek mit geschlossenem KI-Fenster | Liste nutzt die ganze Breite, voller Songname sichtbar, Knöpfe in eigener Zeile darunter | ✅ | | 0.40.1 |
| 8.11 | neu (0.40.1): Feedback-Fenster (unten rechts) | Kein „Beta“ mehr; dort heißt es „Ausführliches Log“. Das Willkommensfenster erscheint nur beim allerersten Start (oder nach einem Absturz mit Sicherung), darum war es nicht zu sehen: so gewollt | ✅ | Willkommensfenster nicht erschienen (so gewollt) | 0.40.1 |

## 9. Neu in 0.50.0: VST-Plugins

Vorbereitung: VST3- oder VST2-Effekte auf dem PC, am besten ein 64-Bit- und ein 32-Bit-Plugin, z. B. ein kostenloser Hall oder EQ. Falls keiner da ist: „Valhalla Supermassive“ oder „TDR Nova“ (beide kostenlos).

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 9.1 | Nach dem Update die App starten, dann Einstellungen → **Plugins** | Die Suche ist beim ersten Start von selbst gelaufen (oder läuft noch: Fortschritt „x von y“). Deine Plugins stehen in der Liste mit Hersteller, Typ, Format | ✅ | | 0.50.0 |
| 9.2 | **Search for plugins** drücken | Suche läuft mit Fortschritt; danach „Letzte Suche: … · n Plugins“. Nicht nutzbare Dateien (z. B. beim Prüfen abgestürzt) stehen unten aufklappbar; Spalte „Bits“ zeigt 64 oder 32 | ✅ | | 0.50.0 |
| 9.2b | Ein **32-Bit-Plugin** (z. B. aus *C:\\Programme (x86)\\VSTPlugins*) auf eine Spur legen, Fenster öffnen, abspielen | Es steht im Menü mit „32-bit“, öffnet sein Fenster und klingt wie ein 64-Bit-Plugin | ✅ | | 0.51.0 |
| 9.2c | Einstellungen → Plugins → **Ordner hinzufügen…** mit einem eigenen Plugin-Ordner, dann suchen | Die Plugins aus dem Ordner erscheinen in der Liste | ✅ | | 0.51.0 |
| 9.3 | Bei einem Plugin das Häkchen entfernen | Es erscheint nicht mehr im Studio unter „+ Effekt…“ | ✅ | | 0.51.0 |
| 9.4 | Studio: Spur mit Song auswählen, rechts **Kanal** → unter *Effekte* **+ Effekt…** → unter *VST-Plugins* ein Plugin wählen (geht auch über das kleine **FX** an der Spur) | Plugin erscheint in der Effekt-Zeile, sein Fenster öffnet sich und bleibt über der App | ✅ | | 0.50.0 |
| 9.5 | Abspielen, im Plugin-Fenster Regler drehen (z. B. Hall stark) | Man hört das Plugin sofort; keine Aussetzer oder Knackser | ✅ | | 0.50.0 |
| 9.6 | ⏻ am Plugin aus und wieder an, während der Song läuft | Ohne / mit Plugin; die Spur bleibt im Takt mit den anderen Spuren | ✅ | | 0.50.0 |
| 9.7 | Zwei Spuren, eine mit Plugin: zusammen abspielen | Beide laufen genau im Takt (kein Versatz, kein Echo-Effekt zwischen den Spuren) | ✅ | | 0.50.0 |
| 9.8 | Regler im Plugin ändern, Projekt speichern, App schließen und Projekt wieder öffnen, **Open** am Plugin | Das Plugin hat die geänderten Einstellungen | ✅ | | 0.50.0 |
| 9.9 | Nur im Plugin-Fenster etwas ändern (sonst nichts), dann App schließen | Die Frage „Projekt vor dem Schließen speichern?“ kommt | ✅ | | 0.50.0 |
| 9.10 | Datei → Export audio (WAV) | Die exportierte Datei klingt mit dem Plugin wie beim Abspielen | ✅ | | 0.50.0 |
| 9.11 | Mehrere Plugins auf einer Spur und auf verschiedenen Spuren | Alles hörbar, Reihenfolge mit ◀ ▶ änderbar; Rechner bleibt bedienbar | ✅ | | 0.50.0 |
| 9.12 | Projekt ohne Plugins abspielen | Wie bisher; kein Unterschied (der Plugin-Host läuft dann nicht) | ✅ | | 0.50.0 |

## 10. Neu in 0.51.0: Plugins im Mastering, Stems ins Studio

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 10.1 | Mastering: Song öffnen, **+ Hinzufügen…** → unter *VST-Plugins* ein Plugin | Plugin erscheint in der Kette, **Plugin-Fenster öffnen** zeigt seine Regler | ✅ | VST-Plugins schwer zu finden → eigenes Menü „+ VST-Plugin…“ (0.51.1) | 0.51.0 |
| 10.2 | Abspielen, Regler im Plugin drehen, ⏻ aus/an, Vorher/Nachher | Man hört das Plugin; Vorher/Nachher springt ohne Versatz | ✅ |  | 0.51.0 |
| 10.3 | Plugin mit ↑ ↓ an eine andere Stelle der Kette schieben | Klingt weiter, keine Aussetzer | ✅ |  | 0.51.0 |
| 10.4 | Exportieren… | Datei klingt mit dem Plugin wie beim Abspielen | ✅ |  | 0.51.0 |
| 10.5 | Song schließen, wieder öffnen, Plugin-Fenster öffnen | Das Plugin hat die zuletzt eingestellten Werte | ✅ |  | 0.51.0 |
| 10.6 | Stem-Trenner: Song trennen, dann **Alle Stems ins Studio** | Im Studio eine Gruppe „<Song> – Stems“ mit einer Spur pro Stem ab Takt 1, Lautstärken/Stumm wie im Stem-Mixer | ✅ |  | 0.51.0 |
| 10.7 | Bei einem Stem **→ Studio** | Nur dieser Stem auf einer neuen Spur | ✅ |  | 0.51.0 |
| 10.8 | Studio: bei einer Gruppe (z. B. nach *In Stems trennen*) die Gruppe zuklappen (▶), dann auf einen der farbigen Balken doppelklicken | Gruppe klappt auf, die Spur dieses Stems ist ausgewählt und mit Wellenform zu sehen | ❌ | Stems sollen nach Doppelklick normal hoch mit Wellenform erscheinen → 0.51.1 | 0.51.0 |
| 10.9 | Einstellungen → **Audio**: Ausgangsgerät wählen (z. B. Kopfhörer statt Lautsprecher), **Testton** an | Der Ton kommt aus dem gewählten Gerät; Lautstärke- und Frequenzregler ändern ihn sofort | ✅ | | 0.51.0 |
| 10.10 | Song im Studio und im Mastering abspielen, Bibliothek-Vorhören | Alles kommt aus dem gewählten Gerät | ✅ |  | 0.51.0 |
| 10.11 | **Puffergröße** ändern (z. B. 256, 1024) | Ausgangs- und Gesamt-Latenz ändern sich; Wiedergabe läuft danach normal | ✅ |  | 0.51.0 |
| 10.12 | Song abspielen, **Simulierte CPU-Belastung** langsam hochdrehen | Ab einem Wert knackt es; mit größerem Puffer erst später | ✅ |  | 0.51.0 |
| 10.13 | Eingangsgerät wählen, im Studio aufnehmen | Aufnahme kommt vom gewählten Mikrofon/Eingang; mit Treiberfehler-Kompensation verschiebt sich die Aufnahme | ✅ |  | 0.51.0 |
| 10.1b | Mastering: Menü **+ VST-Plugin…** neben **+ Hinzufügen…** | Listet alle Plugins; eins wählen setzt es in die Kette | ✅ | Menü links mit „VST“ beschriften → 0.51.2 | 0.51.0 |
| 10.8b | Studio: Gruppe zuklappen (▶), irgendwo in die Zeile der Gruppe doppelklicken (auf einen Balken oder daneben) | Gruppe klappt auf, jede Stem-Spur normal hoch mit Wellenform, die Ansicht scrollt dorthin | ❌ | Stem-Balken in der Gruppe zu schmal → 0.51.2 | 0.51.0 |
| 10.1c | Mastering: links steht **VST** vor dem Menü **+ VST-Plugin…**, rechts davon **+ Hinzufügen…** | Plugins sofort zu finden | ✅ | | 0.51.2 |
| 10.8c | Studio: Gruppe (z. B. nach *In Stems trennen*) zugeklappt ansehen | Gruppe ist höher, jeder Stem-Balken zeigt Namen und Wellenform; Doppelklick öffnet die Gruppe | ⚠️ | Anzeige gut, aber Doppelklick macht die Spuren nicht größer → 0.51.3 | 0.51.2 |
| 10.8d | Studio: Doppelklick auf eine Gruppe (Balken oder Zeile), dann noch einmal | Gruppe klappt auf, alle Stem-Spuren doppelt so hoch mit großer Wellenform; zweiter Doppelklick: wieder normale Höhe | ❌ | Statt neuer Zeilen soll die Gruppenzeile selbst größer werden → 0.51.5 | 0.51.4 |
| 10.8e | Studio: Doppelklick auf eine Gruppe (zugeklappt), dann noch einmal | Die Zeile der Gruppe selbst wird groß, jeder Stem mit großer Wellenform (keine neuen Zeilen); zweiter Doppelklick: wieder normal | ⚠️ | Groß geht, wieder klein nicht → 0.51.6 | 0.51.5 |
| 10.8f | Studio: Doppelklick auf eine Gruppe, dann noch einmal an derselben Stelle; danach die Taste **⇕** im Gruppenkopf | Groß, dann wieder normal; ⇕ schaltet ebenso um | ✅ | | 0.51.6 |
| 10.14 | Mastering: Module 1–6 und Lautheit öffnen | Überall runde Drehknöpfe mit Lichtkranz statt Schiebereglern | ✅ | | 0.51.3 |
| 10.15 | Knopf nach oben/unten ziehen, mit Shift ziehen, Mausrad, Doppelklick | Wert ändert sich (mit Shift fein), man hört es sofort; Doppelklick setzt den Startwert | ✅ | | 0.51.3 |
| 10.16 | Vorher/Nachher umschalten | Bei *Vorher* stehen die Knöpfe grau auf dem Startwert und lassen sich nicht drehen | ✅ | | 0.51.3 |
| 10.17 | Einstellungen → **Erscheinungsbild** → **Analog-Pult** | Holzseiten links und rechts, Bernstein-Farben, runde Transporttasten, leuchtende Positionsanzeige | ✅ | | 0.51.4 |
| 10.18 | → **Swiss** | Weiß/Schwarz, eckig, Orange; das Menü ist eine Leiste unten mit Namen; KI-Assistent bleibt rechts | ✅ | | 0.51.4 |
| 10.19 | → **Hardware-Rack** | Graue Gerätefronten mit Schrauben, grünes LCD für Position und Tempo, Bernstein | ✅ | | 0.51.4 |
| 10.20 | In jedem Look: Studio, Mastering (Wellenform, Knöpfe), Mixer, Bibliothek, Einstellungen ansehen; App neu starten | Alles lesbar, Farben passen zum Look; nach dem Neustart ist der gewählte Look noch da | ✅ | | 0.51.4 |
| 10.21 | Einstellungen → **Shortcuts**: bei „Audiospur hinzufügen“ in der Spalte **Eigene** auf **+ Taste**, dann Leertaste drücken | Abgelehnt: „Space ist schon belegt: Abspielen / Pause“ | ✅ | | 0.51.5 |
| 10.22 | Noch einmal **+ Taste**, dann z. B. Strg+Alt+K; ins Studio wechseln und Strg+Alt+K drücken | Taste erscheint in der Spalte; im Studio kommt eine neue Audiospur dazu; nach Neustart der App noch da; × entfernt sie | ❌ | Strg+Alt+K: nichts passiert (Windows meldet Strg+Alt als AltGr) → 0.51.6 | 0.51.5 |
| 10.22b | Shortcuts → bei „Audiospur hinzufügen“ **+ Taste**, Strg+Alt+K drücken; im Studio Strg+Alt+K; App neu starten | Taste erscheint in „Eigene“; im Studio kommt eine Audiospur dazu; nach dem Neustart noch da | ❌ | Taste gesetzt, aber im Studio passiert nichts → 0.51.7 | 0.51.6 |
| 10.22c | Shortcuts: bei „Audiospur hinzufügen“ das alte Ctrl+Alt+K mit × entfernen, **+ Taste**, Strg+Alt+K neu setzen; im Studio einmal klicken, Strg+Alt+K | Neue Audiospur. Wenn nicht: Feedback → Log senden (im Log steht dann, welche Taste ankam) | ✅ | Lag an einer anderen Tastaturbelegung; mit 0.51.7 unabhängig davon | 0.51.7 |

## Ergebnisse

Nach dem Test: Datei mit den Einträgen an Claude geben („hier der Testplan mit Ergebnissen“). Fehler (❌) werden zuerst
behoben, dann der nächste Bereich.

## 11. Neu in 0.60.0: Instrumente, ASIO, Hardware-Rack

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 11.1 | Einstellungen → Plugins → **Kostenlose Instrumente**: bei Dexed **Installieren** | Fortschritt, dann „Dexed … ist installiert“; Dexed erscheint in der Plugin-Liste (Typ Instrument) | ✅ |  | 0.60.0 |
| 11.2 | Ebenso **Surge XT** installieren | Wie 11.1 | ✅ |  | 0.60.0 |
| 11.3 | Studio: **+ MIDI-Spur**, rechts **Kanal** → **Instrument** → Dexed wählen | Das Fenster von Dexed öffnet sich; im Spurkopf steht „midi · Dexed“ | ⚠️ | Piano-Roll-Noten erst stumm (zweite Plugin-Kopie) → 0.60.2 | 0.60.0 |
| 11.4 | Im Piano Roll Noten zeichnen / anklicken | Man hört Dexed (nicht den eingebauten Synth) | ⚠️ | erst nach Aus/An → 0.60.2 | 0.60.0 |
| 11.5 | Song abspielen | Die Noten der MIDI-Spur spielen mit Dexed, im Takt mit den anderen Spuren | ✅ |  | 0.60.0 |
| 11.6 | MIDI-Keyboard (falls vorhanden): Taste halten | Ton klingt, solange die Taste gedrückt ist | ✅ | | 0.60.0 |
| 11.7 | In Dexed einen anderen Klang wählen, Projekt speichern, schließen, wieder öffnen | Der gewählte Klang ist wieder da | ✅ |  | 0.60.0 |
| 11.8 | Datei → Exportieren | Die MIDI-Spur ist mit Dexed im Export, die erste Note nicht verspätet | ✅ |  | 0.60.0 |
| 11.9 | Kanal → Instrument: ⏻ aus | Die Noten spielen wieder mit dem eingebauten Synth | ✅ |  | 0.60.0 |
| 11.10 | ASIO4ALL oder FlexASIO installieren; Einstellungen → Audio → Treibertyp **ASIO / andere Treiber** | Treiber „ASIO“ in der Liste; nach Wahl des Geräts grüne Zeile „Spielt auf …“ | ✅ |  | 0.60.0 |
| 11.11 | Testton an; dann Song im Studio und im Mastering abspielen | Ton kommt über ASIO; keine Aussetzer (sonst Puffer größer) | ❌ | kein Ton über ASIO (Host ohne Gerät neu gestartet) → 0.60.4 | 0.60.2 |
| 11.12 | **Treiber-Einstellungen (ASIO-Bedienfeld)…** | Das Fenster des ASIO-Treibers öffnet sich; Änderungen gelten danach | ❌ | „Gerät konnte nicht geöffnet werden“ nach dem Bedienfeld → 0.60.2 | 0.60.0 |
| 11.13 | Zurück auf **Windows (Standard)** | Ton wieder über das gewählte Windows-Gerät | ✅ |  | 0.60.0 |
| 11.14 | Einstellungen → Erscheinungsbild → **Hardware-Rack** | Großes grünes LCD oben, Menü als Rack-Tasten, rechts Effekt-Rack der gewählten Spur | ✅ |  | 0.60.0 |
| 11.15 | Im Effekt-Rack einen Knopf drehen, ein Modul mit der Lampe aus/an, **+ Effekt…** | Klang ändert sich; Modul aus/an; neues Modul erscheint | ⚠️ | nach Zurück zu Windows kein Ton bis Neustart → 0.60.2 | 0.60.0 |
| 11.16 | Mastering: Song abspielen, auf die drei Anzeigen neben dem Master-Fader achten | Sie bleiben ruhig an ihrer Stelle | ✅ |  | 0.60.0 |
| 11.14b | Erscheinungsbild **Hardware-Rack**: Menü und KI-Chat ansehen | Menü links an der Seite (Rack-Tasten); das Effekt-Rack rechts nur im Studio, Piano Roll und Mixer | ✅ |  | 0.60.2 |
| 11.3b | Neue MIDI-Spur, Kanal → Instrument → Dexed; sofort im Piano Roll Noten anklicken | Gleich Dexed-Ton, ohne Aus/An | ⚠️ | Ton erst nach ca. 1 Minute (alle Plugins wurden geladen) → 0.60.3 | 0.60.2 |
| 11.12b | ASIO: **Treiber-Einstellungen (ASIO-Bedienfeld)…**, etwas ändern, schließen | Keine Fehlermeldung; die grüne Zeile zeigt die neuen Werte; Ton läuft weiter | ❌ | kein ASIO-Treiber auf diesem PC; Meldung unklar → 0.60.3 | 0.60.2 |
| 11.13b | Von ASIO zurück auf **Windows (Standard)**, Song abspielen | Ton kommt sofort über Windows, ohne Neustart | ⚠️ | Ton geht, Noten ca. 4 s verzögert (Plugins neu geladen) → 0.60.3 | 0.60.2 |
| 11.3c | Projekt mit Surge XT auf einer Spur; neue MIDI-Spur → Instrument Dexed; sofort Noten im Piano Roll | Dexed klingt nach wenigen Sekunden (nicht erst nach einer Minute) | | | |
| 11.12c | PC ohne ASIO-Treiber: Treibertyp ASIO / andere Treiber, Treiber ASIO | Klare Meldung „Kein ASIO-Treiber installiert …“; mit Treiber „Windows Audio“ spielt es | ✅ | auf einem PC mit ASIO | 0.60.2 |
| 11.13c | Von ASIO zurück auf Windows, dann Noten im Piano Roll anklicken | Noten nach kurzer Ladezeit ohne Verzögerung | ✅ |  | 0.60.2 |
| 11.11b | PC mit ASIO: Treibertyp ASIO, Gerät wählen (grüne Zeile); Testton an; Song im Studio und im Mastering abspielen | Ton über ASIO; auch nach einigen Minuten und nach dem Öffnen/Schließen eines Plugins | | | |
