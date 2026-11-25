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
| 11.3c | Projekt mit Surge XT auf einer Spur; neue MIDI-Spur → Instrument Dexed; sofort Noten im Piano Roll | Dexed klingt nach wenigen Sekunden (nicht erst nach einer Minute) | ✅ | | 0.60.4 |
| 11.12c | PC ohne ASIO-Treiber: Treibertyp ASIO / andere Treiber, Treiber ASIO | Klare Meldung „Kein ASIO-Treiber installiert …“; mit Treiber „Windows Audio“ spielt es | ✅ | auf einem PC mit ASIO | 0.60.2 |
| 11.13c | Von ASIO zurück auf Windows, dann Noten im Piano Roll anklicken | Noten nach kurzer Ladezeit ohne Verzögerung | ✅ |  | 0.60.2 |
| 11.11b | PC mit ASIO: Treibertyp ASIO, Gerät wählen (grüne Zeile); Testton an; Song im Studio und im Mastering abspielen | Ton über ASIO; auch nach einigen Minuten und nach dem Öffnen/Schließen eines Plugins | ✅ | | 0.60.4 |

## 12. Neu in 0.70.0: Master-Effekte, MIDI-Dateien, Anschlag, Fades, Looks

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 12.1 | Studio: **Master FX** (Werkzeugleiste) → **+ Effekt…** → ein VST-Effekt (z. B. ein Hall); Song abspielen | Plugin-Fenster öffnet sich; die ganze Mischung klingt mit dem Effekt; ⏻ aus = ohne | ✅ |  | 0.70.0 |
| 12.2 | Mixer öffnen | Unten die Zeile **MASTER FX** mit denselben Effekten | ✅ |  | 0.70.0 |
| 12.3 | Projekt speichern, schließen, öffnen; dann Datei → Exportieren | Master-Effekt mit seinen Einstellungen wieder da; Export klingt mit dem Effekt, Anfang nicht verspätet | ❌ | Master-Effekt nach Öffnen weg (auch Marker, Loop, Returns) → 0.70.1 | 0.70.0 |
| 12.4 | Eine .mid-Datei (z. B. aus dem Internet) ins Studio ziehen | Für jede Spur der Datei eine MIDI-Spur mit Noten; im leeren Projekt stimmt das Tempo | ⏳ | braucht MIDI-Datei (geschickt) | 0.70.0 |
| 12.5 | Rechtsklick auf einen MIDI-Clip → **Export as MIDI file (.mid)…**, in einem anderen Programm (z. B. Cubase, MuseScore) öffnen | Gleiche Noten, gleiche Längen und Anschläge | ⏳ | braucht MIDI-Datei (geschickt) | 0.70.0 |
| 12.6 | Piano Roll: unten die Anschlag-Spur; einen Balken nach oben/unten ziehen; mehrere Noten auswählen und ziehen | Balken und Notenhelligkeit ändern sich; ausgewählte Noten zusammen; man hört lauter/leiser | ✅ | Wunsch: mehrere Noten mit dem Fadenkreuz markieren → 0.70.1 | 0.70.0 |
| 12.7 | Piano Roll: Noten auswählen, oben **Velocity** 40 eingeben, **Length** 1/16 wählen | Alle ausgewählten Noten werden leiser und kurz | ⚠️ | Velocity-Feld nicht gefunden, Anschlag schlecht lesbar, FX rechts einklappbar → 0.70.1 | 0.70.0 |
| 12.8 | Studio: Audio-Clip, oben links das weiße Quadrat nach rechts ziehen, oben rechts nach links | Schräge Linie zeigt das Ein-/Ausblenden; beim Abspielen hört man es; Doppelklick = weg | ✅ |  | 0.70.0 |
| 12.9 | Die Linie in der Mitte des Clips nach oben/unten ziehen | dB-Anzeige am Clip; Clip lauter/leiser; Doppelklick = 0 dB | ✅ |  | 0.70.0 |
| 12.10 | Erscheinungsbild **Analog-Konsole**, Studio, Song abspielen | Unten Mischpult: VU-Nadeln bewegen sich, Pan-Knopf, Fader, M/S wirken; Titel und Spurnamen in Serifenschrift | 🗑 | Analog-Konsole entfernt (0.70.1) | 0.70.0 |
| 12.11 | Erscheinungsbild **Swiss** | Große Position und Tempo, Transport als große Blöcke, große Spurnamen, Marker lesbar | ⚠️ | BPM nicht ganz sichtbar → 0.70.1 | 0.70.0 |
| 12.12 | Erscheinungsbild **Hardware-Rack**: Menü ansehen | Bibliothek-Symbol grau wie die anderen; Stern bei „Musik erstellen“ in der Farbe des KI-Assistent-Knopfs | ✅ |  | 0.70.0 |
| 12.3b | Master-Effekt (mit eigener Einstellung), Marker und Loop setzen, speichern, schließen, öffnen | Master-Effekt mit Einstellung, Marker und Loop sind wieder da | ⚠️ | Effekt klingt, Master-FX-Leiste zeigt nur „+ Effekt…“ (Datei vermutlich mit 0.70.0 gespeichert) → mit neuem Projekt nochmals | 0.70.1 |
| 12.4b | `Demo-Song-4-Spuren-96BPM.mid` (von Claude geschickt) in ein leeres Studio ziehen | 4 MIDI-Spuren: Piano, Melody, Bass, Drums; Tempo 96 | ✅ |  | 0.70.1 |
| 12.5b | Rechtsklick auf den Melody-Clip → **Export as MIDI file (.mid)…**, die Datei wieder ins Studio ziehen (oder in einem anderen Programm öffnen) | Gleiche Noten | ✅ |  | 0.70.1 |
| 12.6b | Piano Roll, Werkzeug **Draw** (Fadenkreuz): auf leerer Fläche einen Rahmen um mehrere Noten ziehen; danach einmal klicken | Rahmen wählt die Noten aus (weiß umrandet); ein Klick setzt eine neue Note | ✅ |  | 0.70.1 |
| 12.7b | Piano Roll oben: **Velocity** und **Length** (grau, solange nichts gewählt); Noten wählen, Velocity 40, Length 1/16 | Felder immer da; ausgewählte Noten werden leiser und kurz; unten „Velocity/Anschlag“ gut lesbar | ⚠️ | Velocity heißt auf Deutsch „Anschlag“, Feld zu schmal → 0.70.2 | 0.70.1 |
| 12.7c | Hardware-Rack: oben am Effekt-Rack rechts **›** klicken, dann den schmalen Streifen anklicken | Rack klappt zu einem Streifen zusammen und wieder auf; bleibt nach Neustart so | ❌ | Rack rechts abgeschnitten, › nicht sichtbar → 0.70.2 | 0.70.1 |
| 12.11b | Erscheinungsbild **Swiss** | Tempo (BPM) ganz sichtbar | ✅ |  | 0.70.1 |
| 12.13 | Einstellungen → Erscheinungsbild | Nur noch Dunkel, Hell, Swiss, Hardware-Rack | ✅ |  | 0.70.1 |
| 12.3c | **Neues** Projekt in 0.70.2: Master FX → VST-Effekt, etwas einstellen, speichern, App ganz schließen, App starten, Projekt öffnen, **Master FX** anklicken | In der Leiste steht der Effekt (Name, Open, ⏻), mit der Einstellung | ✅ |  | 0.70.2 |
| 12.7d | Piano Roll oben: Feld **Anschlag** (= Velocity); Noten wählen, 40 eingeben, Enter | Feld breit genug, Noten werden leiser | ✅ |  | 0.70.2 |
| 12.7e | Hardware-Rack, Fenster etwas schmaler ziehen: **›** links oben am Effekt-Rack klicken, dann den Streifen klicken | Rack bleibt im Fenster, klappt zu und wieder auf | ✅ |  | 0.70.2 |

## 13. Neu in 0.71.0: Automation von Plugin-Reglern, Presets

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 13.1 | Spur mit einem VST-Effekt (z. B. ein Filter oder Hall): **A** an der Spur, im Auswahlfeld der Spur **Plugin parameter → <Plugin>: choose a parameter…** | Liste der Regler des Plugins mit Suchfeld | ⚠️ | „Plugin parameter“ nicht gefunden → 0.72.1: Knopf „Automatisieren…“ beim Plugin | 0.71.0 |
| 13.2 | Einen Regler wählen (z. B. Cutoff oder Mix), Punkte setzen: unten links, oben rechts | Neue Spur „<Plugin>: <Regler>“ mit der Kurve | | | 0.71.0 |
| 13.3 | Song abspielen, dabei das Plugin-Fenster offen (**Open**) | Der Regler im Plugin bewegt sich mit der Kurve, man hört es | ⚠️ | Eingebauter Filter: Ton folgt (13.4 ✅), Regler im Rack bewegten sich nicht → 0.73.3 | 0.71.0 |
| 13.3b | Spur mit eingebautem **Filter**, **Automate…** → Frequenz, Kurve zeichnen, abspielen (Rack-Look oder FX-Zeile offen) | Der Frequenz-Regler im Rack und der Schieber in der Effekt-Zeile drehen sich mit der Kurve | | | 0.73.3 |
| 13.4 | Exportieren | Der Export folgt der Kurve | ✅ | | 0.71.0 |
| 13.5 | Dasselbe mit einem Regler von **Dexed** oder **Surge XT** auf einer MIDI-Spur | Klang ändert sich mit der Kurve | ✅ | Mit Dexed (0.73.2) ✅ | 0.71.0 |
| 13.6 | Projekt speichern, schließen, öffnen | Die Plugin-Automation ist wieder da (Name der Spur, Punkte) | ✅ | | 0.71.0 |
| 13.7 | Bei einem Plugin **Presets… → Save current settings…**, Namen eingeben; im Plugin etwas ändern; **Presets… → <Name>** | Die gespeicherten Einstellungen sind wieder da | ⚠️ | Presets nicht gefunden → 0.72.1 sichtbarer (★ Presets…) | 0.71.0 |
| 13.8 | Neues Projekt, dasselbe Plugin einfügen, **Presets…** | Das Preset steht in der Liste und lädt | ✅ | | 0.71.0 |
| 13.9 | Zwei oder mehr Plugin-Fenster offen, eines minimieren, dann bei diesem Plugin **Open** | Das Fenster kommt wieder | ✅ |  | 0.71.0 |

## 14. Neu in 0.72.0: MIDI-Controller (Einstellungen → MIDI)

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 14.1 | MPK Mini einstecken, **Einstellungen → MIDI** | Das MPK Mini steht da, „Erkannt: Akai MPK Mini …“, Noten und Steuerung an, Zuordnung mit CC 70–77 | ✅ | MPK Mini erkannt; Launchpad war nicht richtig eingesteckt, geht | 0.72.0 |
| 14.2 | Studio: eine MIDI-Spur wählen, Tasten und Pads spielen | Man hört die Spur (auch mit Dexed / Surge) | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.3 | K1 und K2 drehen | Lautstärke und Pan der gewählten Spur bewegen sich | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.4 | Spur mit einem Effekt (z. B. EQ oder ein VST): K3–K5 drehen, dabei das Plugin-Fenster offen | Die ersten Regler des Effekts bewegen sich | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.5 | **Learn** bei „Abspielen / Pause“, dann ein Pad drücken; danach das Pad nochmal drücken | Die Zeile zeigt „Note …“; das Pad startet und stoppt den Song (spielt dann keine Note mehr) | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.6 | **Learn** bei „Nächste Spur“ mit einem anderen Pad; **Zuordnung zurücksetzen** | Pad wählt die nächste Spur; nach Zurücksetzen wieder die Standard-Zuordnung | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.7 | Haken **Noten** aus | Tasten spielen nichts mehr; Regler wirken weiter | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.8 | App neu starten | Zuordnungen und Haken sind gespeichert | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.9 | Ein anderes Gerät (Keyboard, Launchkey …) einstecken | Erscheint sofort; bekannt: mit Zuordnung; unbekannt: Hinweis „Learn“ | | Kann der Owner im Moment nicht testen (MPK Mini im Studio) | 0.72.0 |
| 14.10 | Launchpad (X / Mini MK3 / Pro MK3) einstecken, Projekt mit Spuren und Markern | Pads leuchten: oben Marker (orange), je Spur Stumm/Solo/Auswahl/Lautstärke; Drücken wirkt | ✅ | | 0.72.0 |
| 13.1b | Spur mit einem VST-Effekt oder VST-Instrument: neben **Open** auf **Automatisieren…** klicken | Liste der Regler des Plugins mit Suchfeld | ❌ | nur Suchfeld, Liste abgeschnitten → 0.73.0 | 0.72.1 |
| 13.2b | Einen Regler anklicken (z. B. „Cutoff“) | Unter der Spur öffnet sich eine Automationsspur „<Plugin>: <Regler>“ mit einem Punkt am Anfang | ⏳ | wegen 13.1b nicht testbar | 0.72.1 |
| 13.7b | Neben **Open** das Feld **★ Presets…** | Liste: Laden / Aktuelle Einstellungen speichern… / Löschen | ✅ |  | 0.72.1 |

## 15. Neu in 0.73.0: Automation der eingebauten Effekte, Dexed

| Nr. | Test | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 15.1 | Spur mit einem **eingebauten** Effekt (z. B. **Filter** über + Effekt… → Eingebaut): beim Effekt **Automatisieren…** → **Frequenz** | Unter der Spur öffnet sich „Filter: Frequenz“ | ✅ |  | 0.73.0 |
| 15.2 | In der neuen Spur Punkte setzen: links unten, rechts oben; abspielen | Der Klang geht von dumpf nach hell | ✅ |  | 0.73.0 |
| 15.3 | Dasselbe mit **EQ → Bässe** oder **Hall → Mix** | Man hört die Änderung; Export klingt genauso | ✅ |  | 0.73.0 |
| 15.4 | MIDI-Spur → Kanal → Instrument: ist **Dexed** in der Liste? Wenn nein: Einstellungen → Plugins → **Nach Plugins suchen**, dann nochmal | Dexed erscheint (oder ist unter „In Einstellungen → Plugins ausgeschaltet“ zu sehen) | ❌ | Dexed fehlt weiter in der Instrument-Auswahl → Bild von Einstellungen → Plugins angefragt | 0.73.0 |
| 13.1c | VST-Effekt oder Surge: **Automatisieren…** | Liste aller Regler unter dem Suchfeld, schwebend über allem | ✅ |  | 0.73.0 |
| 13.2c | Einen Regler anklicken, Punkte setzen, abspielen | Spur „<Plugin>: <Regler>“ erscheint; der Regler im Plugin bewegt sich mit | ✅ |  | 0.73.0 |
| 15.4b | MIDI-Spur → Kanal → Instrument | **Dexed** steht unter „VST-Instrumente“ und spielt; in Einstellungen → Plugins steht bei Dexed „Instrument“ | ❌ | Dexed steht in Einstellungen → Plugins als Instrument, fehlt aber unter Studio → MIDI-Spur → FX (+ Effect…) → 0.73.2 | 0.73.1 |
| 15.4c | MIDI-Spur → **FX** → **+ Effect…** (oder Kanal → Effekte → + Effect…) | Ganz oben steht „VST-Instrumente (spielen die Noten dieser Spur)“ mit **Dexed**; Dexed wählen → Fenster öffnet sich, die Spur spielt mit Dexed (unter Kanal → Instrument steht jetzt Dexed) | ✅ | | 0.73.2 |
| 15.4d | In der Spur neben **FX** den Knopf **KA** klicken | Rechts öffnet sich der Kanal dieser Spur mit Instrument, Effekten, Sends; KA ist grün, wenn die Spur ein VST-Instrument (z. B. Dexed) hat | ✅ | | 0.73.2 |

## 16. Neu in 0.80.0: KI-Instrumente

Vorbereitung: Ein Projekt mit einer MIDI-Spur, auf der eine Melodie mit Akkorden liegt (oder eine leere MIDI-Spur und die Akkorde eintippen).

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 16.1 | Menü **🎻 KI-Instrumente** | Die Seite öffnet sich (nicht mehr „Coming soon“) mit Virtuelle Band, KI-Orchester, Jedes Instrument per Text | ✅ |  | 0.80.0 |
| 16.2 | Virtuelle Band → Akkorde **Eingegeben**: `Am F C G`, 8 Takte | Unter „Wo“ steht `Am · F · C · G · Am · F · C · G` | ✅ |  | 0.80.0 |
| 16.3 | **Ganze Band einfügen**, dann im Studio abspielen | Drei neue MIDI-Spuren (Schlagzeuger, Bassist, Gitarrist) spielen im Takt; Bass und Gitarre folgen den Akkorden | ✅ |  | 0.80.0 |
| 16.4 | Schlagzeuger: Stil **Afro House**, dann **Trap**, **Funk** je **Ins Studio** | Jeder Stil klingt anders; alle 4 Takte ein Fill und danach ein Crash | ✅ |  | 0.80.0 |
| 16.5 | Akkorde **Aus dem Song** (Projekt mit MIDI-Akkorden) | Die erkannten Akkorde stehen unter „Wo“ und passen zum Song | ⚠️ | „Aus dem Song“ nicht gefunden → 0.81: Schalter „Aus dem Song / Eingeben“ oben in der Band, Hinweis wenn keine MIDI-Spur da ist | 0.80.0 |
| 16.6 | Eine Band-Spur im Studio: **KA** → Instrument → z. B. Dexed oder Surge | Die Noten spielen mit dem gewählten Instrument | ⚠️ | Wo? → Spur im Studio: Knopf KA neben FX → Instrument | 0.80.0 |
| 16.7 | Einstellungen → KI-Engines → **AI Instruments (MIDI-DDSP)** → Auswahl installieren | Installation läuft durch (etwa 1,5 GB), am Ende „AI Instruments are installed …“; bei Fehler bitte das Log schicken | ❌ | Windows: „No module named resource“ → 0.81 | 0.80.0 |
| 16.8 | KI-Orchester: MIDI-Spur mit Melodie, **Violine**, **Mit dem KI-Instrument spielen** | Fortschritt läuft (beim ersten Mal lädt es die Modelle, etwa 80 MB); danach eine neue Audiospur „Violin (AI)“ ab dem Takt der ersten Note, die MIDI-Spur ist stumm | ❌ | dito → 0.81 | 0.80.0 |
| 16.9 | Dasselbe mit **Cello**, Vibrato auf 200 % | Klingt wie ein Cello, mit deutlich mehr Vibrato | | | 0.80.0 |
| 16.10 | Spur mit Akkorden → **Trompete**, Musiker für Akkorde 3 | Ein kleiner Bläsersatz, die Akkordtöne klingen gleichzeitig | | | 0.80.0 |
| 16.11 | Jedes Instrument per Text: „electric guitar, overdrive“ (ohne NVIDIA: nur kurz starten und **Abbrechen**) | Gelber Hinweis „Keine NVIDIA-Grafikkarte …“; der Fortschritt läuft; Abbrechen stoppt es | ⚠️ | Textfeld nicht gefunden → 0.81: Feld „Instrument / Stil (hier eingeben)“ und Vorschläge zum Anklicken | 0.80.0 |
| 16.12 | Im Studio Kanal einer MIDI-Spur → **🎻 KI-Instrument…** | Die Seite KI-Instrumente öffnet sich mit dieser Spur gewählt | ✅ |  | 0.80.0 |
| 16.13 | Projekt speichern, schließen, öffnen | Band-Spuren behalten ihren Klang (Schlagzeug, Gitarre …), die KI-Audiospuren sind da | | | 0.80.0 |

## 17. Neu in 0.81.0: Song-Generator, neues Aussehen, Fixes

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 17.1 | KI-Instrumente öffnen, KI-Assistent schließen | Die Seite nutzt die ganze Breite; Geräte mit Drehknöpfen und LCD-Anzeigen | ✅ |  | 0.81.0 |
| 17.2 | Einen Drehknopf nach oben ziehen, Mausrad, Doppelklick | Wert ändert sich; Doppelklick setzt ihn zurück | ✅ |  | 0.81.0 |
| 17.3 | Song-Generator: Genre **Afro House**, Tonart A, Moll → **Song im Studio erstellen**, abspielen | 5 MIDI-Spuren (Melodie, Keys, Bass, Drums, Gitarre), Tempo 122, Marker Intro / Strophe / Bridge / Drop …; klingt nach einem Song | ❌ | Klingt im Studio total verzerrt → 0.82.1 (Backend-Waisen, sparsamere Klänge) | 0.81.0 |
| 17.4 | **🎲 Take** drücken, nochmal erstellen | Andere Akkorde / Melodie; neue Spuren hinter dem ersten Song | ✅ |  | 0.81.0 |
| 17.5 | Band → Akkorde **Aus dem Song** (nach 17.3) | Die Akkorde des Songs erscheinen als Kästchen; Band einfügen passt zum Song | ✅ |  | 0.81.0 |
| 17.6 | Einstellungen → KI-Engines → **AI Instruments (MIDI-DDSP)** → Auswahl installieren (nochmal) | Kein „resource“-Fehler mehr; „AI Instruments are installed“ | ✅ |  | 0.81.0 |
| 17.7 | KI-Orchester: Melodie-Spur des Songs, **Violine** → spielen | Audiospur „Violin (AI)“ (beim ersten Mal lädt es die Modelle) | ⚠️ | Wartet ohne Fortschritt, „none · CPU“, Ton verzerrt → 0.82.1 (Fortschritt pro Phrase) | 0.81.0 |
| 17.8 | Text-Instrument: Feld **Instrument / Stil (hier eingeben)** oder einen Vorschlag anklicken | Text steht im Feld | ⚠️ | Startete ACE-Step auf dem Prozessor, App geschlossen | 0.81.0 |
| 17.9 | Musik erstellen: ACE-Step 1.5, 2 Songs × 2 Varianten (wie gestern) | Alle 4 entstehen; falls der Speicher ausgeht: Hinweis „ACE-Step was started again for the rest“ und trotzdem 4 Songs |  | verschoben (dauert zu lange) | 0.81.0 |

## 18. Neu in 0.82.0: kostenlose Plugins, PyTorch für NVIDIA

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 18.1 | Einstellungen → Plugins → **Kostenlose Plugins** | 40 Einträge, Filter Alle / Effekte / Instrumente / MIDI; Dexed und Surge mit ✓ | | | 0.82.0 |
| 18.2 | Bei **Valhalla Supermassive** auf **Download-Seite ↗** | Die Valhalla-Seite öffnet sich im Browser | | | 0.82.0 |
| 18.3 | Supermassive dort herunterladen und installieren, dann **Nach Plugins suchen** | Supermassive bekommt ein ✓ und steht im Studio unter + Effekt… | | | 0.82.0 |
| 18.4 | **CHOW Kick** → **Installieren** | Lädt und installiert sich (oder öffnet die Release-Seite, falls es dort kein ZIP gibt); danach ✓ und unter Kanal → Instrument wählbar | | | 0.82.0 |
| 18.5 | (Wer eine NVIDIA-Karte hat, z. B. der YouTube-Nutzer mit GTX 1080) KI-Engines → PyTorch mit CUDA installieren | Das Log zeigt „compute capability 6.1: trying cu126 …“, die Installation läuft durch | | | 0.82.0 |

## 19. Neu in 0.82.1: Backend-Waisen, Grafikkarte, sparsamere Klänge

Vorher einmal: App schließen, im Task-Manager alle „python.exe“ beenden, App neu starten.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 19.1 | App starten, unten in der Statusleiste schauen | Dort steht wieder „AMD Radeon R9 200 Series · …“ (Laptop: die Intel-Grafik) | ✅ | | 0.82.1 |
| 19.2 | Bibliothek öffnen | Deine Tracks sind da, kein „Failed to fetch“ | ✅ | | 0.82.1 |
| 19.3 | Song-Generator-Song im Studio abspielen | Klingt sauber, nicht verzerrt | ❌ | Immer noch total verzerrt → 0.83.2 (Noten werden vorausgeplant) | 0.82.1 |
| 19.4 | KI-Orchester: Melodie mit Violine | Fortschritt „Phrase 1 von N … noch etwa X Min“; am Ende Audiospur | ⚠️ | Geht, Ton aber verzerrt → 0.83.2 | 0.82.1 |
| 19.5 | Während 19.4 läuft: App über das X schließen, Task-Manager öffnen | Nach wenigen Sekunden kein „python.exe“ von der App mehr | ✅ | | 0.82.1 |

## 20. Neu in 0.83.0: KI-Instrumente im Plugin-Look

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 20.1 | KI-Instrumente öffnen | Geräte mit farbigem Streifen, große Drehknöpfe mit Leuchtring und Wert in der Mitte, LED-Tasten, dunkle Anzeigen; keine Emojis, kein „Schulklassen“-Look | ✅ | Viel besser; so lassen | 0.83.0 |
| 20.2 | Schlagzeuger: Stil wechseln, Intensität drehen | Das Schritt-Raster ändert sich sofort | ✅ | Ton verzerrt → 0.83.2 | 0.83.0 |
| 20.3 | Bassist / Gitarrist: Stil wechseln | Die Mini-Notenansicht ändert sich | ✅ | Ton verzerrt → 0.83.2 | 0.83.0 |
| 20.4 | Song-Generator: Genre wechseln, Tempo-Knopf drehen, ERSTELLEN | Melodie-Vorschau und Akkorde ändern sich; Song im Studio | ⚠️ | Wegen Verzerrung nicht testbar → 0.83.2 | 0.83.0 |
| 20.5 | Orchester: Instrument in der Liste wählen, RENDERN | Der Pegel-Balken zeigt den Fortschritt | ✅ | Erstellt eine Violinen-Spur | 0.83.0 |

## 21. Neu in 0.83.1: Grafikkarte in der Statusleiste

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 21.1 | App starten, ca. 10 Sekunden warten, unten in die Statusleiste schauen | „AMD Radeon R9 200 Series · CPU“ statt „none · CPU“ (Laptop: Intel-Grafik) | ✅ | | 0.83.1 |
| 21.2 | Einstellungen → KI-Engines | Oben steht „GPU: amd“ statt „GPU: none“ | ✅ | | 0.83.1 |

## 22. Neu in 0.83.2: kein verzerrter Ton mehr

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 22.1 | Song-Generator: Afro House → Song im Studio erstellen, abspielen | Klingt sauber, kein Knistern, keine Verzerrung | ✅ | | 0.83.2 |
| 22.2 | Während der Song spielt: die Violinen-Spur aus 19.4 mit abspielen | Auch die Violine klingt sauber | ⚠️ | Neuer Song landete am Projektende (außer Sicht, Spuren wirkten leer) → beginnt jetzt bei Takt 1 | 0.83.2 |
| 22.3 | Mitten im Song auf Stopp, an eine andere Stelle springen, wieder abspielen | Spielt sofort an der neuen Stelle, keine hängenden Töne | ✅ | | 0.83.2 |
| 22.4 | Loop über 4 Takte setzen, ein paar Durchgänge laufen lassen | Jeder Durchgang klingt gleich, keine Lücken | ❓ | Wie setzt man einen Loop? | 0.83.2 |
| 22.5 | Song exportieren (WAV) | Geht in etwa einer halben Minute, die Datei klingt sauber | ✅ | | 0.83.2 |
| 22.6 | 20.2–20.4 nochmal anhören | Band und Song-Generator klingen sauber | ⚠️ | Klingt langweilig, wie 90er Synth-Pop: Klänge müssen viel besser werden | 0.83.2 |

## 23. Neu in 0.84.0: Klang-Paket (echte Instrumente)

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 23.1 | KI-Instrumente öffnen: oben „Klang-Paket: echte Instrumente“ → **Installieren (28 MB)** | Fortschrittsbalken, danach verschwindet die Karte | ✅ | | 0.84.0 |
| 23.2 | Song-Generator: **Funk** → Erstellen, im Studio abspielen | Startet bei Takt 1; Clavinet, Slap-Bass, Bläser und echtes Schlagzeug, kein Knistern | ✅ | | 0.84.0 |
| 23.3 | Dasselbe mit **Jazz**, **Ballade**, **Afro House** | Jedes Genre hat eigene Instrumente und klingt nicht mehr nach 90er-Synth | ✅ | | 0.84.0 |
| 23.4 | Eine Spur → **CH** → Instrument: unter „Klang-Paket: Orchester“ **Violine** wählen | Die Spur spielt Violine | ✅ | | 0.84.0 |
| 23.5 | Im Piano Roll Noten anklicken / mit MIDI-Keyboard spielen | Man hört das gewählte echte Instrument | ✅ | Mit Launchpad und Tastatur | 0.84.0 |
| 23.6 | Song exportieren (WAV) | Der Export klingt wie im Studio | ✅ | | 0.84.0 |
| 23.7 | Einstellungen → Audio → Klang-Paket | „Installiert“ mit **Entfernen**; nach Entfernen spielt wieder der Synthesizer | ✅ | | 0.84.0 |
| 23.8 | Song-Generator: alle fünf Spuren-Tasten aus | Kein Absturz, „Erstellen“ ist gesperrt | ✅ | Die Tasten wählen nur, welche Spuren erstellt werden | 0.84.0 |

## 24. Neu in 0.85.0: Mixer im Konsolen-Look

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 24.1 | Mixer öffnen (Song aus dem Song-Generator) | Dunkelblaugraue Kanalzüge wie dein Vorbild: Fader mit weißer Kappe und dB-Skala, zwei orange LED-Anzeigen, M/S-Tasten, Werte unten, Pan-Knopf | ⚠️ | Einen Tick zu breit → 0.85.1 schmaler | 0.85.0 |
| 24.2 | Abspielen | Die LEDs leuchten mit (orange, oben gelb/rot), unten steht der Spitzenwert in dB | ✅ | | 0.85.0 |
| 24.3 | Fader ziehen, mit Shift fein ziehen, Mausrad, Doppelklick | Lautstärke ändert sich; Doppelklick = 0 dB | ✅ | | 0.85.0 |
| 24.4 | Pan-Knopf ziehen, Doppelklick | Links/rechts, Doppelklick = Mitte | ❌ | Keine Veränderung → 0.85.1: Knopf dreht auch beim Ziehen nach links/rechts | 0.85.0 |
| 24.5 | Trennlinie zwischen Studio und Mixer verschieben | Die Fader werden länger/kürzer, nichts wird abgeschnitten | ✅ | Perfekt | 0.85.0 |

## 25. Neu in 0.85.1: Mixer schmaler, Pan seitlich

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 25.1 | Mixer öffnen | Die Kanalzüge sind etwas schmaler | ✅ | | 0.85.1 |
| 25.2 | Song abspielen, am Pan-Knopf einer Spur nach links und rechts ziehen | Der Knopf dreht sich, unten steht L.. / R.., die Spur wandert hörbar nach links / rechts | ✅ | | 0.85.1 |

## 26. Neu in 0.86.0: Russisch, lesbare Spurnamen, Clips nicht mehr über der Spur-Leiste

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 26.1 | Einstellungen → Allgemein → Sprache: **Русский** | Die ganze App ist russisch (Menü, Studio, Einstellungen, KI-Instrumente, Mixer) | ✅ | | 0.86.0 |
| 26.2 | Wieder **Deutsch** wählen | Alles wieder deutsch | ✅ | | 0.86.0 |
| 26.3 | Song-Generator: Afro House → Studio | Die Namen „Melodie (Afro House, Am)“ usw. sind ganz lesbar; M S FX KA A × stehen in der Zeile darunter | ✅ | | 0.86.0 |
| 26.4 | Im Studio nach rechts scrollen, einen MIDI- oder Audio-Clip anklicken | Der Clip beginnt rechts von der Spur-Leiste, nichts scheint durch die Leiste | ✅ | | 0.86.0 |
| 26.5 | KA (Kanal) einer Spur öffnen, Pan nach links und rechts ziehen | Der Regler bewegt sich, die Spur wandert hörbar; hat die Spur eine Pan-Automation, steht ein gelber Hinweis da | ✅ | | 0.86.0 |

## 27. Neu in 0.90.0: MIDI-Effekte (Arpeggiator, Sequencer)

Vorher: in Einstellungen → Plugins → Kostenlose Plugins → MIDI einen MIDI-Effekt installieren, z. B. **Stochas** (Installieren-Knopf) oder **BlueArp** (Download-Seite), dann **Nach Plugins suchen**.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 27.1 | Neue MIDI-Spur → **KA** → Instrument: **Surge XT** oder **Dexed** | Das Instrument spielt die Noten | ✅ | | 0.90.0 |
| 27.2 | Darunter **MIDI-Effekte → + MIDI-Effekt…** → BlueArp (oder Stochas) | Das Plugin-Fenster öffnet sich; es steht in der Liste mit ⏻ ▲ ▼ × | ✅ | Geht mit Dexed als Instrument und BlueArp/Stochas als MIDI-Effekt | 0.90.0 |
| 27.3 | Einen Akkord (3 Noten, 4 Takte) in die Spur schreiben, abspielen | Der Arpeggiator spielt die Akkordtöne nacheinander, im Takt des Songs | ✅ | | 0.90.0 |
| 27.4 | Tempo oben ändern (z. B. 90 → 140), wieder abspielen | Der Arpeggiator folgt dem neuen Tempo | ✅ | | 0.90.0 |
| 27.5 | Im Piano Roll Noten anklicken / am MIDI-Keyboard spielen | Man hört die Noten durch den MIDI-Effekt | ✅ | | 0.90.0 |
| 27.6 | ⏻ beim MIDI-Effekt aus | Das Instrument spielt die Noten wieder direkt | ✅ | | 0.90.0 |
| 27.7 | Song exportieren (WAV) | Im Export ist der Arpeggiator zu hören | ✅ | | 0.90.0 |
| 27.8 | Projekt speichern, App schließen, Projekt öffnen | Der MIDI-Effekt ist mit seinen Einstellungen wieder da | ✅ | | 0.90.0 |
| 27.9 | 15 oder mehr Spuren, Mixer öffnen; Mausrad über den Kanälen drehen | Die Kanäle scrollen nach rechts / links (unten eine sichtbare Leiste), MASTER bleibt rechts stehen | ✅ | | 0.90.0 |

## 28. Neu in 0.90.1: Anzeige der MIDI-Effekte

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 28.1 | Spur mit Dexed/Surge + BlueArp: lange Akkordnoten schreiben, **abspielen**, KA offen lassen | Unter den MIDI-Effekten steht „MIDI: X Ereignisse in die Effekte → Y ans Instrument · Song läuft bei … BPM“. Bitte X und Y notieren | ✅ | Geht mit Dexed als Instrument und BlueArp/Stochas als MIDI-Effekt | 0.90.1 |
| 28.2 | Dasselbe mit Stochas: im Stochas-Fenster ein paar Felder im Raster anklicken (das Muster ist am Anfang leer), abspielen | Stochas spielt sein Muster; Y wird größer | ✅ | Geht mit Dexed als Instrument und BlueArp/Stochas als MIDI-Effekt | 0.90.1 |

## 29. Neu in 0.91.0: MCP-Werkzeuge für das offene Projekt

Nur in einer Claude-Sitzung **auf diesem PC** (Claude-Desktop-App → Code → Ordner `ai-music-studio`). Einmal einrichten: `claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp`. AI Music Studio muss laufen.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 29.1 | Claude fragen: „Welche Plugins hat AI Music Studio gefunden?“ | Claude listet Dexed, Surge XT, BlueArp, Stochas … | | | 0.91.0 |
| 29.2 | „Mach eine MIDI-Spur mit Dexed, setz BlueArp davor und schreib einen A-Moll-Akkord über 4 Takte.“ | Die Spur erscheint im Studio mit Dexed und BlueArp, der Akkord liegt im Clip; Abspielen klingt arpeggiert | | | 0.91.0 |
| 29.3 | „Stell das Tempo auf 100 und spiel ab.“ / „Stopp.“ | Tempo 100, die App spielt / stoppt | | | 0.91.0 |
| 29.4 | Spur → KA: als Instrument BlueArp wählen | Gelber Hinweis: MIDI-Plugin, kein Ton | | | 0.91.0 |

## 30. Neu in 0.92.0: mehr Klang-Pakete

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 30.1 | Einstellungen → Audio → Klang-Pakete | 4 Pakete mit Größe; GeneralUser ist schon installiert (grüner Punkt) | ✅ | | 0.92.0 |
| 30.2 | **Salamander Grand Piano** installieren | Fortschritt, dann grüner Punkt | ✅ | | 0.92.0 |
| 30.3 | **MuseScore General** und **VSCO-2 Orchestra** installieren (Orchester: ca. 330 MB, dauert etwas) | Beide grün | ✅ | | 0.92.0 |
| 30.4 | Song-Generator: **Ballade** → Studio, abspielen | Flügel und Streicher klingen echt (Salamander, VSCO) | ✅ | | 0.92.0 |
| 30.5 | Spur → KA → Instrument-Liste | Hinter den Instrumenten steht, welches Paket spielt (z. B. „Flügel · Salamander“, „Streicher · VSCO-2“) | ✅ | | 0.92.0 |
| 30.6 | Ein Paket entfernen | Das nächste installierte Paket spielt dieses Instrument | ✅ | | 0.92.0 |

## 31. Neu in 0.93.0: alles im Studio per MCP

In einer Claude-Sitzung mit MCP-Verbindung zur App (oder im KI-Chat der App) eingeben:

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 31.1 | „Leg ein neues Projekt an und schreib einen Funk-Song in E-Moll mit 104 BPM.“ | Neues Projekt, 5 MIDI-Spuren mit Markern (Intro, Verse …), Tempo 104 | ✅ | wie 32.1 | 0.93.0 |
| 31.2 | „Setz einen Kompressor auf den Bass und einen Hall-Return, schick die Melodie mit 30 % hin.“ | Bass: Kompressor im FX-Bereich; Return „Hall“; Send der Melodie 0.3 | ✅ |  | 0.93.0 |
| 31.3 | „Lass die Melodie von Takt 1 bis 9 lauter werden.“ | Volume-Automation auf der Melodie-Spur, Linie steigt | ⏸ | Claude Code hat den Aufruf blockiert (Berechtigung), nicht die App; in 0.93.3 Berechtigungsregel im Wiki | 0.93.0 |
| 31.4 | „Transponiere die Melodie eine Oktave runter und quantisiere sie auf Achtel.“ | Noten im Piano Roll eine Oktave tiefer, auf dem Raster | ✅ |  | 0.93.0 |
| 31.5 | „Spiel die Bass-Spur mit Dexed und öffne sein Fenster.“ | Dexed als Instrument, Plugin-Fenster geht auf | ✅ |  | 0.93.0 |
| 31.6 | „Speichere das Projekt als Funk.ams in Musik und exportiere es als MP3 daneben.“ | Beide Dateien liegen im Ordner, MP3 klingt wie das Projekt | ❌ | Export lief ins Zeitlimit; behoben in 0.93.3 (Test 34.1) | 0.93.0 |
| 31.7 | KI-Chat der App: „Mach einen Schlagzeuger im Rock-Stil für 8 Takte.“ | Neue Spur „Drummer (Rock)“ im Studio | ❌ | KI-Chat startete die KI-Aufnahme; behoben in 0.93.3 (Test 34.2) | 0.93.0 |
| 31.8 | Song-Generator: Ballade, Tonart A-Moll | Akkorde klingen nach Moll (Am, C, Dm, E), nicht nach A-Dur | | | 0.93.0 |

## 32. Neu in 0.93.1: Fortschritt und richtige Werkzeugwahl

Nach dem Update: Claude-Sitzung neu starten (oder `/mcp` → neu verbinden), damit sie die neue Werkzeugliste lädt.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 32.1 | Claude: „Leg ein neues Projekt an und schreib einen Funk-Song in E-Moll mit 104 BPM.“ | Neues Projekt, nach wenigen Sekunden 5 MIDI-Spuren im Studio (kein KI-Audio-Job) | ✅ | | 0.93.1 |
| 32.2 | Claude: „Lass die Musik-KI einen kurzen Song mit Gesang aufnehmen (30 s).“ | Claude sagt, dass es dauert; unten in der Statusleiste erscheint „Generating music … %“ | ✅ | | 0.93.1 |
| 32.3 | Auf die Anzeige in der Statusleiste klicken | Seite „Create music“ mit Fortschritt; ✕ bricht ab | ✅ | | 0.93.1 |

## 33. Neu in 0.93.2: Eingabefelder nehmen wieder Text an

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 33.1 | Musik erstellen: in **Stil** klicken und tippen | Der Text erscheint | ✅ | | 0.93.2 |
| 33.2 | Studio: ein VST-Plugin-Fenster öffnen, wieder schließen, dann Musik erstellen → Stil tippen | Der Text erscheint | ✅ | | 0.93.2 |
| 33.3 | Datei → Öffnen bei ungespeicherten Änderungen (Rückfrage erscheint) → Abbrechen, dann in ein Textfeld tippen | Der Text erscheint | ✅ | | 0.93.2 |

## 34. Neu in 0.93.3: Export im Hintergrund, KI-Chat macht MIDI

Claude-Sitzung nach dem Update neu starten.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 34.1 | Funk.ams öffnen lassen, dann Claude: „Exportiere das Projekt als MP3 in meinen Musik-Ordner.“ | Claude sagt, der Export läuft, fragt nach und meldet dann die fertige Datei; Funk.mp3 liegt im Ordner | | | 0.93.3 |
| 34.2 | KI-Chat der App: „Mach einen Schlagzeuger im Rock-Stil für 8 Takte.“ | Nach Sekunden neue Spur „Drummer (Rock)“ im Studio, keine KI-Aufnahme | | | 0.93.3 |

## 35. Neu in 0.94.0: Audio → MIDI für ganze Songs

Voraussetzung: Einstellungen → KI-Engines → „Audio → MIDI (basic-pitch)“ und „Demucs“ installiert.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 35.1 | Bibliothek: bei einem KI-Song **→ MIDI** | Seite „Audio → MIDI“ öffnet sich mit dem Song | ✅ | | 0.94.0 |
| 35.2 | **In MIDI umwandeln** (Instrumente trennen an) | Fortschritt: Trennen, Tempo/Tonart, dann jedes Instrument; danach Tempo, Tonart, Akkorde und pro Instrument Noten, Sicherheit, Vorschau | ✅ | in 0.94.1 (in 0.94.0 hing die Anzeige bei 60 %) | 0.94.0 |
| 35.3 | Bei einer Spur ▶ drücken | Der getrennte Stem spielt | ✅ | | 0.94.0 |
| 35.4 | Instrumente wählen (z. B. Bass → Slap-Bass), **… Spuren ins Studio** | Im Studio: Original (stumm) + MIDI-Spuren, Tempo übernommen | ✅ | | 0.94.0 |
| 35.5 | Studio: abspielen, Original kurz einschalten | MIDI-Spuren laufen im Takt mit dem Original; Schlagzeug, Bass und Melodie erkennbar | ✅ | | 0.94.0 |
| 35.6 | Stem Splitter: Song trennen, **Alle Stems → MIDI** | Seite öffnet sich mit den Stems, Umwandeln geht ohne erneutes Trennen | ✅ | | 0.94.0 |
| 35.7 | Claude: „Wandle den Song … in MIDI um.“ | Claude startet app_audio_to_midi, fragt nach, meldet Spuren, Tempo, Tonart | ✅ | | 0.94.0 |
| 35.8 | Wie klingt das Ergebnis bei deinen eigenen KI-Songs? Was fehlt, was ist falsch? | (Rückmeldung für die nächste Verbesserung) | | | 0.94.0 |

## 36. Neu in 0.94.1: Audio → MIDI bleibt nicht mehr hängen

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 36.1 | Links im Menü: Symbole ansehen | Piano Roll 🎹, Audio → MIDI ♪ | ✅ | | 0.94.1 |
| 36.2 | Bibliothek → **→ MIDI** → **In MIDI umwandeln** | Text mit Sekunden zählt hoch, Prozent steigen bis zum Ergebnis (Trennen: einige Minuten) | ✅ | | 0.94.1 |
| 36.3 | Während es läuft: auf Studio wechseln und zurück | Fortschritt läuft weiter, Ergebnis erscheint | ✅ | | 0.94.1 |
| 36.4 | Falls es wieder stehen bleibt: Feedback → Log kopieren | Im Log stehen Zeilen „[audio-to-midi] …“ mit jedem Schritt: bitte schicken | | | 0.94.1 |

## 37. Neu in 0.95.0: Vocal Editor (Melodie wird gesungen)

Vorbereitung: eine DiffSinger-Stimme im OpenUtau-Format herunterladen, z. B. **Nishiren** (github.com/Gardanana/Nishiren-AI-Diffsinger → Releases; Bedingungen lesen). Englisch, Deutsch und Spanisch gehen damit.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 37.1 | Links **Vocal Editor** öffnen | Seite mit Sänger, Melodie, Text, Klang | | | 0.95.0 |
| 37.2 | **Stimme importieren…** → die heruntergeladene .zip | Stimme erscheint in der Liste, mit Sprachen und Modellen | | | 0.95.0 |
| 37.3 | Falls „braucht den Vocoder“: **Vocoder installieren** | Download läuft, danach verschwindet der Hinweis | | | 0.95.0 |
| 37.4 | Im Piano Roll eine kurze Melodie (8–16 Noten) schreiben, zurück zum Vocal Editor | Unter „Noten und Silben“ stehen die Noten | | | 0.95.0 |
| 37.5 | Sprache **Englisch**, Text „Hello world, tonight we sing“, **Text auf die Noten verteilen** | Wörter auf den Noten, „+“ für zweite Silben; im Piano Roll sichtbar | | | 0.95.0 |
| 37.6 | **Singen** | Nach Sekunden neue Spur „Gesang – …“ im Studio; singt genau die Melodie im Takt | | | 0.95.0 |
| 37.7 | Dasselbe auf **Deutsch** und **Spanisch** | Aussprache verständlich | | | 0.95.0 |
| 37.8 | Eine Silbe von Hand ändern, nochmal singen | Die neue Silbe wird gesungen | | | 0.95.0 |
| 37.9 | **KI-Sänger (ACE-Step)**, Text schreiben, Singen | Fortschritt (einige Minuten), dann Gesangs-Spur ab der ersten Note | | | 0.95.0 |

## 38. Neu in 0.95.1: eigener Gesang → MIDI-Melodie

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 38.1 | Studio: Audio-Spur, eine kurze Melodie einsingen (z. B. auf „la“), Clip anklicken | Clip ist gewählt | | | 0.95.1 |
| 38.2 | Vocal Editor → **Mein Gesang (Studio-Clip) → MIDI** | Nach Sekunden neue Spur „Meine Melodie (MIDI)“ ab der Stelle des Clips | | | 0.95.1 |
| 38.3 | Im Piano Roll ansehen / abspielen | Die Noten folgen deinem Gesang (einzelne Noten nachbessern) | | | 0.95.1 |

## 39. Neu in 0.96.0: eingebaute Stimmen, Stile und Rap

Vorbereitung: eine MIDI-Spur mit einer kurzen Melodie (8–16 Noten), Text „Hello world, tonight we sing“ mit **Text auf die Noten verteilen** daraufgelegt.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 39.1 | Vocal Editor → **Eingebaute Stimmen** → **Sänger installieren** | Fortschritt; nach einigen Minuten verschwindet der Hinweis | | | 0.96.0 |
| 39.2 | Stimmen ansehen: **Alle / Frauen / Männer**, Gruppen Klar / Mit Vibrato / Kraftvoll | 39 Stimmen, nach Gruppe sortiert | | | 0.96.0 |
| 39.3 | Eine Stimme wählen, **… anhören** | Kurze Hörprobe der Stimme | | | 0.96.0 |
| 39.4 | Stil **Pop**, **Singen** | Fortschritt mit Restzeit; neue Spur „Gesang – Sängerin … (Pop)“ mit Effekten (Filter, Kompressor, EQ, Delay, Hall) | | | 0.96.0 |
| 39.5 | Dieselbe Stimme mit **Rock**, **Ballade**, **Soul** | Hörbar anders: Rock hart und angezerrt, Ballade mit viel Vibrato und Hall, Soul mit Verzierungen | | | 0.96.0 |
| 39.6 | Haken **Effekte des Stils** aus, Singen | Neue Spur ohne Effekte | | | 0.96.0 |
| 39.7 | Stil **Rap** (eine Männerstimme), Singen | KI-Sänger rappt den Text im Tempo des Songs (einige Minuten), neue Spur „Gesang – Rap“ ab der ersten Note | | | 0.96.0 |
| 39.8 | Allgemein: Klingen die Stile typisch genug? | Eindruck notieren | | | 0.96.0 |


## 40. Neu in 0.96.1: Sänger-Installation mit Fortschritt

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 40.1 | Vocal Editor → Eingebaute Stimmen → **Sänger installieren** | Schritte 1/4 bis 4/4 mit steigendem Prozentwert; das KI-Backend bleibt online | | | 0.96.1 |
| 40.2 | Am Ende | Hinweis verschwindet, 39 Stimmen sichtbar; danach 39.2 bis 39.8 testen | | | 0.96.1 |

## 41. Neu in 0.96.2: Namen und Hörproben der Stimmen

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 41.1 | Vocal Editor → Eingebaute Stimmen | Stimmen mit Namen (Anna, Bella … Adam, Ben …) | | | 0.96.2 |
| 41.2 | Auf eine Stimme klicken | Sofort eine Hörprobe (etwa 16 s), ■ am Namen | | | 0.96.2 |
| 41.3 | Nochmal klicken / eine andere Stimme klicken | Stoppt / die andere spielt sofort | | | 0.96.2 |
| 41.4 | Neue Melodie ohne Silben, Text ins Feld schreiben | Nach einem Moment stehen die Silben unter „Noten und Silben“; einzelne Silbe ändern geht | | | 0.96.2 |
| 41.5 | Melodie ohne Silben, Text geschrieben, gleich **Singen** | Singt ohne Meldung „Verteile zuerst den Text“ | | | 0.96.2 |
| 41.6 | Bibliothek: Suche „Nur Name“ / „Nur Tags“, Tags in der Tag-Leiste anklicken | Treffer passen, Anzahl wird gezeigt | | | 0.96.2 |
| 41.7 | KI-Instrumente: auf ein Instrument klicken | Sofort kurze Melodie, ■ am Namen; nochmal klicken stoppt | | | 0.96.2 |
| 41.8 | Studio: zwei Audio-Spuren, ganz hineinzoomen (bis 16×), Clip ziehen | Rastet nur nahe einer Rasterlinie ein, dazwischen stufenlos; Wellenform scharf | | | 0.96.2 |
| 41.9 | 🧲 **Raster aus** (gelb), Clip anwählen, ← / → | Clip bewegt sich je Tastendruck um ein Pixel | | | 0.96.2 |
| 41.10 | App schließen, nach 10 s wieder starten (mehrmals) | Fenster öffnet jedes Mal; Task-Manager zeigt nach dem Schließen keine App mehr | | | 0.96.2 |
| 41.11 | Einstellungen → Plugins → **Plugins suchen** | Keine rote Meldung „null (reading 'name')“; gefundene VST erscheinen, auch im Studio | | | 0.96.2 |

## 42. Neu in 0.96.3: Werkzeuge im Studio, Vocal Editor beim Start

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 42.1 | Studio: oben rechts neben **Exportieren** der Kasten **Werkzeuge** | ↖ Zeiger, ✂ Schere, 🧲 Raster an/aus | | | 0.96.3 |
| 42.2 | ✂ wählen, auf einen Audio-Clip klicken | Clip wird an der Stelle geschnitten (im Raster); Mauszeiger ist ein Kreuz | | | 0.96.3 |
| 42.3 | Mit ✂ und **Alt** klicken | Schnitt genau an der Klickstelle | | | 0.96.3 |
| 42.4 | **Esc** | Zurück zum Zeiger ↖ | | | 0.96.3 |
| 42.5 | App neu starten, sofort den Vocal Editor öffnen | „Das KI-Backend startet …“, dann erscheinen die Stimmen; kein „Sänger installieren“ | | | 0.96.3 |
| 42.6 | Ohne Melodie in den Vocal Editor | Unter „Singen“ steht, warum es grau ist | | | 0.96.3 |
| 42.7 | Alle 39 Stimmen anklicken | Jede hat eine Hörprobe von etwa 16 s | | | 0.96.3 |

## 43. Neu in 0.96.4: Schere für Bereiche, Gesang → MIDI per Rechtsklick

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 43.1 | ✂ wählen, über einen Teil eines Audio-Clips ziehen, loslassen | Der Bereich ist ein eigener Clip und ausgewählt; der Zeiger ↖ ist wieder aktiv | | | 0.96.4 |
| 43.2 | ✂ über zwei Spuren hinweg ziehen | Auf beiden Spuren wird der Bereich herausgeschnitten | | | 0.96.4 |
| 43.3 | ✂ einmal klicken (ohne Ziehen) | Schnitt an der Stelle, danach wieder Zeiger | | | 0.96.4 |
| 43.4 | Rechtsklick auf eine Gesangsaufnahme → **Mein Gesang → MIDI-Melodie (Vocal Editor)** | Vocal Editor öffnet sich, nach Sekunden neue Spur „Meine Melodie (MIDI)“ | | | 0.96.4 |
| 43.5 | Stil **Rap**: die Rap-Beispiele anklicken | Jedes Beispiel spielt sofort | | | 0.96.4 |
| 43.6 | App schließen, gleich wieder per Doppelklick starten (Desktop und an die Taskleiste angeheftet), mehrmals | Ein Klick reicht, das Fenster erscheint jedes Mal | | | 0.96.4 |

## 44. Neu in 0.96.5: PyTorch / torchaudio passen zusammen

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 44.1 | Einstellungen → KI-Engines → „Stem separation (Demucs)“ ankreuzen → Ausgewählte installieren | Im Log steht am Ende „PyTorch check: …“ mit den Versionen | | | 0.96.5 |
| 44.2 | Stem Splitter: einen Song teilen | Stems kommen ohne Fehler | | | 0.96.5 |

## 45. Neu in 0.96.6: Schere deutlicher, ganzer Song beim Herauszoomen

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 45.1 | ✂ über einen Teil eines Audio-Clips ziehen | Beim Ziehen ein gelber Bereich über die ganze Spurhöhe, genau dort, wo geschnitten wird | | | 0.96.6 |
| 45.2 | Loslassen | Leiste „Herausgeschnitten … Löschen / Behalten“; **Löschen** entfernt genau den gelben Teil | | | 0.96.6 |
| 45.3 | Nochmal schneiden, dann **Entf** drücken | Der herausgeschnittene Teil wird gelöscht | | | 0.96.6 |
| 45.4 | Ganz herauszoomen (Regler ganz links) oder **⤢** | Der ganze Song ist zu sehen und ein paar Takte danach; Taktzahlen überlappen nicht | | | 0.96.6 |

## 46. Neu in 0.97.0: Album-Mastering

Vorbereitung: 3–4 Songs (WAV/MP3), am besten unterschiedlich laut (z. B. ein leiser, ein lauter).

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 46.1 | Mastering → oben **💿 Album** | Album-Ansicht mit Titel, Künstler, Ziel-Lautheit | | | 0.97.0 |
| 46.2 | **+ Songs hinzufügen…**, 3–4 Songs wählen, mit ▲ ▼ ordnen | Songs nummeriert 01, 02 …; Reihenfolge ändert sich | | | 0.97.0 |
| 46.3 | **Messen** | Je Song ein grauer (vorher) und ein farbiger Balken (nachher), Linie für das Ziel, LUFS und Länge | | | 0.97.0 |
| 46.4 | **Album angleichen** | Fortschritt; danach liegen alle Songs am Ziel (grün), ein leiser etwas darunter | | | 0.97.0 |
| 46.5 | Auf einen Songnamen klicken | Der Song öffnet sich einzeln mit seiner (angepassten) Kette | | | 0.97.0 |
| 46.6 | Pause auf 3 s, **▶ Übergang anhören** | Ende des Songs, 3 s Stille, Anfang des nächsten | | | 0.97.0 |
| 46.7 | **Album exportieren…**, Ordner wählen, „ganzes Album als eine Datei“ an | „01 - Titel“ usw. im Ordner, plus „… (ganzes Album)“; Tags mit Album und Tracknummer | | | 0.97.0 |

## 47. Neu in 0.97.1: Prompt und Text in der Bibliothek

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 47.1 | Bibliothek → bei einem erzeugten Song **📝 Prompt & Text** | Prompt (Stil) und Liedtext klappen auf, mit Modell, Seed, BPM | | | 0.97.1 |
| 47.2 | **Kopieren** beim Text, in einen Editor einfügen | Der ganze Text ist da | | | 0.97.1 |
| 47.3 | **In Create music wiederverwenden** | Create music öffnet sich, Prompt und Text sind eingetragen | | | 0.97.1 |

## 48. Neu in 0.97.2: Album anhören, Pause am Übergang

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 48.1 | Album: bei „↓ Pause“ zwischen zwei Songs 3 s wählen | Alle Übergänge zeigen 3 s | | | 0.97.2 |
| 48.2 | **▶ Übergang anhören** (auch bei langen Songs) | Startet nach wenigen Sekunden: Ende, 3 s Stille, Anfang des nächsten | | | 0.97.2 |
| 48.3 | **▶ Album anhören** | Song 1 spielt (mit seiner Kette), danach Pause, dann Song 2 …; am laufenden Song steht ♪ | | | 0.97.2 |
| 48.4 | Auf die Nummer eines Songs klicken (z. B. 03) | Album spielt ab diesem Song | | | 0.97.2 |
| 48.5 | **Messen** | Knopf ist bedienbar, Balken erscheinen; nach Wechsel zu „Ein Song“ und zurück sind sie noch da | | | 0.97.2 |

## 49. Neu in 0.97.3: Album-Player mit Zeitleiste

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 49.1 | Album: **▶ Album anhören** | Zeitleiste mit allen Songs und Pausen, weiße Abspiellinie läuft, Zeit läuft mit | | | 0.97.3 |
| 49.2 | In die Zeitleiste klicken (z. B. Mitte von Song 3) | Spielt sofort ab dort | | | 0.97.3 |
| 49.3 | Gelbes **⇄** zwischen zwei Songs klicken | Spielt ab 8 s vor dem Ende, durch die Pause in den nächsten Song | | | 0.97.3 |
| 49.4 | **⏮ / ⏭** | Springt zum vorherigen / nächsten Song | | | 0.97.3 |

## 50. Neu in 0.97.4: Stil-Vorschau je Stimme

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 50.1 | Vocal Editor → Eingebaute Stimmen → eine Stimme wählen | Unter den Stilen „{Name} in jedem Stil: ▶ Pop ▶ Rock ▶ Ballade ▶ Soul“ | | | 0.97.4 |
| 50.2 | Die vier nacheinander anklicken | Dieselbe Zeile, hörbar anders gesungen und mit anderem Klang | | | 0.97.4 |
| 50.3 | Mastering → **♪ Beispiel-Song** | Ein leiser, ungemasterter Song öffnet sich; Presets laden, Vorher / Nachher vergleichen | | | 0.97.4 |
| 50.4 | Album: neuer Player | Zeitlineal, Wellenform je Song, laufender Song farbig; Maus über eine Pause: „Übergang anhören“, Klick spielt ihn | | | 0.97.4 |
| 50.5 | Album-Player: ▶, dann gleich ■ | ▶ zeigt sofort einen drehenden Kreis und „Wird vorbereitet …“; ■ stoppt sofort; der Ton kommt nach wenigen Sekunden | | | 0.97.5 |
| 50.6 | App neu starten, Album öffnen, sofort ▶ | Ton nach wenigen Sekunden (nicht 20); Wellenformen erscheinen nach und nach, beim nächsten Öffnen sofort | | | 0.97.6 |

## 51. Neu in 0.97.7: Songs ins Album ziehen

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 51.1 | Album-Ansicht | Oben nur „Mastering · Ein Song / Album“, keine Song-Reiter mehr | | | 0.97.7 |
| 51.2 | Audiodateien aus dem Explorer auf die Album-Ansicht ziehen | „Loslassen, um die Songs zum Album hinzuzufügen“; danach am Ende der Liste | | | 0.97.7 |
| 51.3 | Einen Song an den ⋮⋮ fassen und an eine andere Stelle ziehen | Lila Linie zeigt die Stelle; Reihenfolge und Zeitleiste ändern sich | | | 0.97.7 |
| 51.4 | Unten „4 Songs · …“ | Zeigt die richtige Gesamtlänge (z. B. 24:53) | | | 0.97.7 |

## 52. Neu in 0.98.0: einfache Erstinstallation (Release Candidate)

Auf dem zweiten PC: den Installer 0.98.3 (oder neuer) von GitHub laden und von Hand ausführen (nicht über „Nach Updates suchen“). Ab 0.98.3 öffnet jede neue Installation, auch eine Installation über eine vorhandene Version und eine Installation „für alle Benutzer“, beim ersten Start den Einrichtungs-Assistenten, auch wenn noch alte KI-Engines auf dem PC sind. Ein Update in der App öffnet ihn nicht. Für einen ganz frischen Test vorher deinstallieren und bei der Frage „Auch die KI-Engines … entfernen?“ **Ja** wählen (der Deinstaller ab 0.98.1 fragt das).

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 52.1 | Installer ausführen, App starten | Statt Willkommensfenster: **Einrichtung** mit Schritten links (Dein Computer · Paket · Installation · Fertig) | ✅ | 0.98.3 | 0.98.0 |
| 52.2 | Schritt „Dein Computer“ | Grafikkarte, Prozessor, Arbeitsspeicher, freier Speicher und Python stimmen | ✅ | 0.98.3 | 0.98.0 |
| 52.3 | **Weiter** → Pakete | Drei Karten: Empfohlen (Bester Start), Alles, Nur Studio, je mit Größe | ✅ | 0.98.3 | 0.98.0 |
| 52.4 | **Empfohlen** → **Jetzt installieren** | Fortschritt in %, „Schritt x von y“, Zeit und Restzeit; bei fehlendem Python zuerst „Python (für die App)“ | ✅ | 0.98.3 | 0.98.0 |
| 52.5 | **Details anzeigen** | Das Log läuft mit | ✅ | 0.98.3 | 0.98.0 |
| 52.6 | Warten bis fertig | „Fertig“ mit Häkchen; danach unten „KI-Backend bereit“ | ✅ | 0.98.3 | 0.98.0 |
| 52.7 | Stem Splitter: einen Song teilen | Stems kommen (auf der NVIDIA-Karte schnell) | ✅ | 0.98.3 | 0.98.0 |
| 52.8 | Einstellungen → KI-Engines → **Einrichtungs-Assistent** | Der Assistent öffnet sich wieder | ✅ | 0.98.3 | 0.98.0 |
| 52.9 | Optional: Paket **Alles** | Musik-KI, Sänger, KI-Instrumente werden installiert (auch ohne Git) | ✅ | | 0.98.0 |
| 52.10 | Deinstallieren (Version 0.98.3 oder neuer; auch bei Installation „für alle Benutzer“) | Frage „Auch die KI-Engines … entfernen?“ (Englisch und Deutsch); „Ja“ entfernt sie, „Nein“ lässt sie | ✅ | 0.98.3 | 0.98.1 |

## 53. Neu in 0.98.4: Aufnahme im Studio (Feedback eines Users)

Mit Mikrofon oder Audio-Interface und MIDI-Keyboard.

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 53.1 | Studio: Audio-Spur, im Spurkopf den roten **●** klicken | Der Knopf wird rot gefüllt, die Spur bekommt einen roten Rahmen; nur eine Spur ist scharf | ✅ | „Permission denied by system“: Windows sperrt das Mikrofon; ab 0.98.6 öffnet die App die Windows-Einstellung | 0.98.4 |
| 53.2 | Eine andere Spur auswählen, Aufnahme (● oben oder Strg+R) | Aufgenommen wird auf der scharfen Spur, nicht auf der ausgewählten | ✅ | | 0.98.4 |
| 53.3 | Während der Aufnahme schauen | Auf der Spur wächst ein roter Clip „Aufnahme…“ mit der Wellenform des Eingangs | ✅ | | 0.98.4 |
| 53.4 | Neben dem Lautstärke-Regler **In 1** wählen (Mikro an Eingang 1), aufnehmen | Die Aufnahme ist mono und klingt in der Mitte, nicht nur links oder rechts | ✅ | | 0.98.4 |
| 53.5 | **In 2** (Mikro/Gitarre an Eingang 2) | Wie 53.4, mit Eingang 2 | ✅ | | 0.98.4 |
| 53.6 | **In 1+2** | Stereo wie bisher | ✅ | | 0.98.4 |
| 53.7 | MIDI-Spur scharf machen, mit dem MIDI-Keyboard aufnehmen (Puffer 256 oder 512) | Keine Aussetzer und kein Knacken beim Spielen; die Noten erscheinen im Clip | | User testet | 0.98.4 |
| 53.8 | MIDI-Aufnahme in einer Loop | Ab dem nächsten Durchlauf hört man die eben gespielten Noten | | User testet | 0.98.4 |
| 53.9 | Audio-Spur: die Eingangsliste neben dem Lautstärke-Regler öffnen | Oben „Settings → Audio (…)“, darunter jedes Eingangsgerät (Mikrofon, Line-In, Interface, USB) mit In 1+2 / In 1 / In 2; ein gewähltes Gerät hat einen farbigen Rahmen und gilt nur für diese Spur | ✅ | | 0.98.5 |
| 53.10 | Ein Gerät wählen, aufnehmen | Aufgenommen wird von diesem Gerät, auch wenn in Settings → Audio kein Eingang oder ein anderer gewählt ist | ✅ | | 0.98.5 |
| 53.11 | Windows: Datenschutz → Mikrofon → „Desktop-Apps Zugriff erlauben“ aus, dann aufnehmen | Meldung auf Deutsch, die Windows-Seite „Mikrofon“ öffnet sich; nach dem Einschalten klappt die Aufnahme | ✅ | | 0.98.6 |

## 54. Neu in 0.98.7: ältere NVIDIA-Karten (Feedback eines Users, GTX 980)

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 54.1 | Create: Musikmodell ACE-Step | Darunter die Auswahl **Genauigkeit**: automatisch / bf16 / fp32 | ✅ | | 0.98.7 |
| 54.2 | Auf deiner NVIDIA-Karte einen Song mit „automatisch“ erzeugen | Läuft wie bisher | | User testet (Owner hat keine NVIDIA-Karte) | 0.98.7 |
| 54.3 | Mit „fp32“ einen Song erzeugen | Läuft (braucht mehr Speicher, evtl. langsamer) | | User testet (Owner hat keine NVIDIA-Karte) | 0.98.7 |
| 54.4 | User mit GTX 980: einen Song erzeugen (Einfach und Studio) | Kein CUBLAS- oder „unable to find an engine“-Fehler mehr; der Song wird fertig | | User testet (Owner hat keine NVIDIA-Karte) | 0.98.7 |

## 55. Neu in 0.98.8: Sänger-Installation unter Windows (WinError 1314)

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 55.1 | PC mit schon installiertem Sänger: nach dem Update Vocal Editor öffnen | Der Sänger ist da, keine neue Installation nötig; Singen geht | ✅ | | 0.98.8 |
| 55.2 | Laptop, wo die Sänger-Installation mit „failed: singer“ endete: Einstellungen → KI-Engines → Sänger installieren | Läuft durch bis „models ready“; das 2,8-GB-Modell wird nicht nochmal geladen | ✅ | | 0.98.8 |
| 55.3 | Danach im Vocal Editor singen lassen | Die Stimme singt | ✅ | | 0.98.8 |

## 56. Neu in 0.98.9: Songs mit den Stimmen aus dem Vocal Editor

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 56.1 | Create (Studio-Modus), nicht instrumental | Eigene Auswahlliste **Sänger (Vocal Editor)** unter Männlich / Weiblich; ohne Installation: „Nicht installiert: Einstellungen → KI-Engines → Stimmumwandlung“ | ✅ | | 0.98.9 |
| 56.2 | Einstellungen → KI-Engines → **Stimmumwandlung** installieren | Läuft durch (Pakete, Seed-VC, Modelle etwa 2,4 GB); ist der Sänger nicht da, wird er zuerst installiert | ✅ | | 0.98.9 |
| 56.3 | Create neu öffnen, Liste aufklappen | „Keiner: das Musikmodell singt“, darunter Gruppen Frauen und Männer mit allen Stimmen | ✅ | | 0.98.9 |
| 56.4 | Eine Frau (z. B. Anna) wählen, Song mit Text erzeugen | Nach dem Rendern: „Anna sings: Separating the vocals … / Changing the voice …“; am Ende singt Anna, Text und Melodie wie vom Musikmodell | ✅ | | 0.98.9 |
| 56.5 | Einen Mann (z. B. Carlos) wählen, Song erzeugen | Das Musikmodell singt mit Männerstimme, danach klingt es nach Carlos (natürlich, nicht künstlich) | ✅ | | 0.98.9 |
| 56.6 | Instrumentaler Song mit gewählter Stimme | Kein Fehler: der Song bleibt instrumental | ✅ | | 0.98.9 |
| 56.7 | Setup-Assistent → Paket **Alles** | Zeigt „Songs, gesungen von den eingebauten Stimmen“, etwa 25 GB | ✅ | | 0.98.9 |

## 57. Neu in 0.99.0: Create im neuen Layout

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 57.1 | Create öffnen | Oben „Create“, Modell mit Statuspunkt, rechts Simple / Studio; links „Song“, rechts „Parameter“, unten „Takes“ und der Render-Balken mit dem großen Erstellen-Knopf | | | 0.99.0 |
| 57.2 | Text eingeben | Zeilennummern links, [Verse] / [Chorus] farbig; die Knöpfe unten fügen Abschnitte an der Cursorstelle ein | | | 0.99.0 |
| 57.3 | Mit Musik / Instrumental / A cappella umschalten | Instrumental blendet den Text aus; A cappella wie bisher | | | 0.99.0 |
| 57.4 | Parameter: Länge, Tempo, Tonart, Stimme, Sänger, Loop, Schritte, Takes, Seed | Alles kompakt rechts; „Erweitert ▾“ öffnet LoRA, Quelle/Referenz, Feineinstellungen, Ausgabe | | | 0.99.0 |
| 57.5 | Einen Song erzeugen | Oben in den Takes eine Zeile „Neuer Take“ mit Stufen, Prozent und Restzeit; unten der Fortschrittsbalken; der Knopf wird zu „Stopp“ | | | 0.99.0 |
| 57.6 | Fertigen Take anhören | Wellenform erscheint; Play / Pause; Klick in die Wellenform spielt ab dort; Name umbenennen geht | | | 0.99.0 |
| 57.7 | → Studio, Mastern, Stems, → MIDI, ⋯ | Funktionieren wie bisher (⋯ öffnet die Datei) | | | 0.99.0 |
| 57.8 | Simple-Modus | Nur Modell, Loop, Schritte; Text und Stil links bleiben | | | 0.99.0 |
| 57.9 | Alle Looks (Rack, Dunkel, Hell, Swiss, Konsole) | Sieht in jedem Look sauber aus | | | 0.99.0 |

## 58. Neu in 0.99.1: Loops als eigener Modus in Create

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 58.1 | Create: oben rechts **Einfach / Studio / ⟳ Loops** | Drei Modi; Loops ist sofort sichtbar | | | 0.99.1 |
| 58.2 | **⟳ Loops** wählen | Text steht auf Instrumental; rechts **Loop-Länge** 1/2/4/8/16 Takte, Tempo (120), Tonart, Takt, Schritte, Takes, Seed, Erweitert; der Knopf heißt „Loop erzeugen“ | | | 0.99.1 |
| 58.3 | Einen 4-Takt-Loop erzeugen und ins Studio legen, Strg+D | Genau 4 Takte, beginnt auf Schlag 1, wiederholt sich ohne Lücke | | | 0.99.1 |
| 58.4 | Zurück zu **Studio** | Normale Songs (kein Loop mehr); Länge statt Loop-Länge | | | 0.99.1 |

## 59. Neu in 0.99.2: alle Sprachen vollständig

| Nr. | Schritt | Erwartet | Ergebnis | Notiz | Version |
|---|---|---|---|---|---|
| 59.1 | Einstellungen → Allgemein → Sprache | Nur noch English, Deutsch, Français, Español, Italiano, Português, 中文, Русский (kein Japanisch, kein Koreanisch) | | | 0.99.2 |
| 59.2 | Sprache auf Español (oder Français) stellen, Create, Stem Splitter, Album, Vocal Editor, Setup-Assistent öffnen | Alles in der Sprache, kein Englisch mehr außer Namen und Einheiten | | | 0.99.2 |
| 59.3 | Zurück auf Deutsch | Alles wieder Deutsch | | | 0.99.2 |

