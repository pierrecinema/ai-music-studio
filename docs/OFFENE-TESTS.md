# Offene Tests (Stand 25.11.2026, Version 0.99.7)

Schreib mir wie bisher die Nummer und *geht* oder *geht nicht*. Das Ergebnis trage ich in `docs/TESTPLAN.md` ein.

## A. Neu (0.99.x) (1 Punkte)

### 61. Neu in 0.99.4: Studio im neuen Layout

- [ ] **61.1** Studio öffnen → *Eine Werkzeugleiste in Gruppen: + Spur ▾, Audio importieren, ↖ ✂ 🧲, Raster/Quantisieren, ⟳ Loop, Punch-in/-out, ♩ Einzähler, + Marker, Tempo, Zoom − + ⤢, Master-FX, Exportieren, ⋯*

## B. Muss ein anderer User testen (Mikro, MIDI-Aufnahme, ältere NVIDIA) (5 Punkte)

### 53. Neu in 0.98.4: Aufnahme im Studio (Feedback eines Users)

- [ ] **53.7** MIDI-Spur scharf machen, mit dem MIDI-Keyboard aufnehmen (Puffer 256 oder 512) → *Keine Aussetzer und kein Knacken beim Spielen; die Noten erscheinen im Clip* (User testet)
- [ ] **53.8** MIDI-Aufnahme in einer Loop → *Ab dem nächsten Durchlauf hört man die eben gespielten Noten* (User testet)

### 54. Neu in 0.98.7: ältere NVIDIA-Karten (Feedback eines Users, GTX 980)

- [ ] **54.2** Auf deiner NVIDIA-Karte einen Song mit „automatisch“ erzeugen → *Läuft wie bisher* (User testet (Owner hat keine NVIDIA-Karte))
- [ ] **54.3** Mit „fp32“ einen Song erzeugen → *Läuft (braucht mehr Speicher, evtl. langsamer)* (User testet (Owner hat keine NVIDIA-Karte))
- [ ] **54.4** User mit GTX 980: einen Song erzeugen (Einfach und Studio) → *Kein CUBLAS- oder „unable to find an engine“-Fehler mehr; der Song wird fertig* (User testet (Owner hat keine NVIDIA-Karte))

## C. Ältere Punkte ohne eingetragenes Ergebnis – vor RC 1.0 einmal durchgehen (108 Punkte)

### 13. Neu in 0.71.0: Automation von Plugin-Reglern, Presets

- [ ] **13.2** Einen Regler wählen (z. B. Cutoff oder Mix), Punkte setzen: unten links, oben rechts → *Neue Spur „<Plugin>: <Regler>“ mit der Kurve*

### 14. Neu in 0.72.0: MIDI-Controller (Einstellungen → MIDI)

- [ ] **14.2** Studio: eine MIDI-Spur wählen, Tasten und Pads spielen → *Man hört die Spur (auch mit Dexed / Surge)* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.3** K1 und K2 drehen → *Lautstärke und Pan der gewählten Spur bewegen sich* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.4** Spur mit einem Effekt (z. B. EQ oder ein VST): K3–K5 drehen, dabei das Plugin-Fenster offen → *Die ersten Regler des Effekts bewegen sich* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.5** **Learn** bei „Abspielen / Pause“, dann ein Pad drücken; danach das Pad nochmal drücken → *Die Zeile zeigt „Note …“; das Pad startet und stoppt den Song (spielt dann keine Note mehr)* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.6** **Learn** bei „Nächste Spur“ mit einem anderen Pad; **Zuordnung zurücksetzen** → *Pad wählt die nächste Spur; nach Zurücksetzen wieder die Standard-Zuordnung* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.7** Haken **Noten** aus → *Tasten spielen nichts mehr; Regler wirken weiter* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.8** App neu starten → *Zuordnungen und Haken sind gespeichert* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))
- [ ] **14.9** Ein anderes Gerät (Keyboard, Launchkey …) einstecken → *Erscheint sofort; bekannt: mit Zuordnung; unbekannt: Hinweis „Learn“* (Kann der Owner im Moment nicht testen (MPK Mini im Studio))

### 16. Neu in 0.80.0: KI-Instrumente

- [ ] **16.9** Dasselbe mit **Cello**, Vibrato auf 200 % → *Klingt wie ein Cello, mit deutlich mehr Vibrato*
- [ ] **16.10** Spur mit Akkorden → **Trompete**, Musiker für Akkorde 3 → *Ein kleiner Bläsersatz, die Akkordtöne klingen gleichzeitig*
- [ ] **16.13** Projekt speichern, schließen, öffnen → *Band-Spuren behalten ihren Klang (Schlagzeug, Gitarre …), die KI-Audiospuren sind da*

### 17. Neu in 0.81.0: Song-Generator, neues Aussehen, Fixes

- [ ] **17.9** Musik erstellen: ACE-Step 1.5, 2 Songs × 2 Varianten (wie gestern) → *Alle 4 entstehen; falls der Speicher ausgeht: Hinweis „ACE-Step was started again for the rest“ und trotzdem 4 Songs* (verschoben (dauert zu lange))

### 18. Neu in 0.82.0: kostenlose Plugins, PyTorch für NVIDIA

- [ ] **18.1** Einstellungen → Plugins → **Kostenlose Plugins** → *40 Einträge, Filter Alle / Effekte / Instrumente / MIDI; Dexed und Surge mit ✓*
- [ ] **18.2** Bei **Valhalla Supermassive** auf **Download-Seite ↗** → *Die Valhalla-Seite öffnet sich im Browser*
- [ ] **18.3** Supermassive dort herunterladen und installieren, dann **Nach Plugins suchen** → *Supermassive bekommt ein ✓ und steht im Studio unter + Effekt…*
- [ ] **18.4** **CHOW Kick** → **Installieren** → *Lädt und installiert sich (oder öffnet die Release-Seite, falls es dort kein ZIP gibt); danach ✓ und unter Kanal → Instrument wählbar*
- [ ] **18.5** (Wer eine NVIDIA-Karte hat, z. B. der YouTube-Nutzer mit GTX 1080) KI-Engines → PyTorch mit CUDA installieren → *Das Log zeigt „compute capability 6.1: trying cu126 …“, die Installation läuft durch*

### 29. Neu in 0.91.0: MCP-Werkzeuge für das offene Projekt

- [ ] **29.1** Claude fragen: „Welche Plugins hat AI Music Studio gefunden?“ → *Claude listet Dexed, Surge XT, BlueArp, Stochas …*
- [ ] **29.2** „Mach eine MIDI-Spur mit Dexed, setz BlueArp davor und schreib einen A-Moll-Akkord über 4 Takte.“ → *Die Spur erscheint im Studio mit Dexed und BlueArp, der Akkord liegt im Clip; Abspielen klingt arpeggiert*
- [ ] **29.3** „Stell das Tempo auf 100 und spiel ab.“ / „Stopp.“ → *Tempo 100, die App spielt / stoppt*
- [ ] **29.4** Spur → KA: als Instrument BlueArp wählen → *Gelber Hinweis: MIDI-Plugin, kein Ton*

### 31. Neu in 0.93.0: alles im Studio per MCP

- [ ] **31.8** Song-Generator: Ballade, Tonart A-Moll → *Akkorde klingen nach Moll (Am, C, Dm, E), nicht nach A-Dur*

### 34. Neu in 0.93.3: Export im Hintergrund, KI-Chat macht MIDI

- [ ] **34.1** Funk.ams öffnen lassen, dann Claude: „Exportiere das Projekt als MP3 in meinen Musik-Ordner.“ → *Claude sagt, der Export läuft, fragt nach und meldet dann die fertige Datei; Funk.mp3 liegt im Ordner*
- [ ] **34.2** KI-Chat der App: „Mach einen Schlagzeuger im Rock-Stil für 8 Takte.“ → *Nach Sekunden neue Spur „Drummer (Rock)“ im Studio, keine KI-Aufnahme*

### 35. Neu in 0.94.0: Audio → MIDI für ganze Songs

- [ ] **35.8** Wie klingt das Ergebnis bei deinen eigenen KI-Songs? Was fehlt, was ist falsch? → *(Rückmeldung für die nächste Verbesserung)*

### 36. Neu in 0.94.1: Audio → MIDI bleibt nicht mehr hängen

- [ ] **36.4** Falls es wieder stehen bleibt: Feedback → Log kopieren → *Im Log stehen Zeilen „[audio-to-midi] …“ mit jedem Schritt: bitte schicken*

### 37. Neu in 0.95.0: Vocal Editor (Melodie wird gesungen)

- [ ] **37.1** Links **Vocal Editor** öffnen → *Seite mit Sänger, Melodie, Text, Klang*
- [ ] **37.2** **Stimme importieren…** → die heruntergeladene .zip → *Stimme erscheint in der Liste, mit Sprachen und Modellen*
- [ ] **37.3** Falls „braucht den Vocoder“: **Vocoder installieren** → *Download läuft, danach verschwindet der Hinweis*
- [ ] **37.4** Im Piano Roll eine kurze Melodie (8–16 Noten) schreiben, zurück zum Vocal Editor → *Unter „Noten und Silben“ stehen die Noten*
- [ ] **37.5** Sprache **Englisch**, Text „Hello world, tonight we sing“, **Text auf die Noten verteilen** → *Wörter auf den Noten, „+“ für zweite Silben; im Piano Roll sichtbar*
- [ ] **37.6** **Singen** → *Nach Sekunden neue Spur „Gesang – …“ im Studio; singt genau die Melodie im Takt*
- [ ] **37.7** Dasselbe auf **Deutsch** und **Spanisch** → *Aussprache verständlich*
- [ ] **37.8** Eine Silbe von Hand ändern, nochmal singen → *Die neue Silbe wird gesungen*
- [ ] **37.9** **KI-Sänger (ACE-Step)**, Text schreiben, Singen → *Fortschritt (einige Minuten), dann Gesangs-Spur ab der ersten Note*

### 38. Neu in 0.95.1: eigener Gesang → MIDI-Melodie

- [ ] **38.1** Studio: Audio-Spur, eine kurze Melodie einsingen (z. B. auf „la“), Clip anklicken → *Clip ist gewählt*
- [ ] **38.2** Vocal Editor → **Mein Gesang (Studio-Clip) → MIDI** → *Nach Sekunden neue Spur „Meine Melodie (MIDI)“ ab der Stelle des Clips*
- [ ] **38.3** Im Piano Roll ansehen / abspielen → *Die Noten folgen deinem Gesang (einzelne Noten nachbessern)*

### 39. Neu in 0.96.0: eingebaute Stimmen, Stile und Rap

- [ ] **39.1** Vocal Editor → **Eingebaute Stimmen** → **Sänger installieren** → *Fortschritt; nach einigen Minuten verschwindet der Hinweis*
- [ ] **39.2** Stimmen ansehen: **Alle / Frauen / Männer**, Gruppen Klar / Mit Vibrato / Kraftvoll → *39 Stimmen, nach Gruppe sortiert*
- [ ] **39.3** Eine Stimme wählen, **… anhören** → *Kurze Hörprobe der Stimme*
- [ ] **39.4** Stil **Pop**, **Singen** → *Fortschritt mit Restzeit; neue Spur „Gesang – Sängerin … (Pop)“ mit Effekten (Filter, Kompressor, EQ, Delay, Hall)*
- [ ] **39.5** Dieselbe Stimme mit **Rock**, **Ballade**, **Soul** → *Hörbar anders: Rock hart und angezerrt, Ballade mit viel Vibrato und Hall, Soul mit Verzierungen*
- [ ] **39.6** Haken **Effekte des Stils** aus, Singen → *Neue Spur ohne Effekte*
- [ ] **39.7** Stil **Rap** (eine Männerstimme), Singen → *KI-Sänger rappt den Text im Tempo des Songs (einige Minuten), neue Spur „Gesang – Rap“ ab der ersten Note*
- [ ] **39.8** Allgemein: Klingen die Stile typisch genug? → *Eindruck notieren*

### 40. Neu in 0.96.1: Sänger-Installation mit Fortschritt

- [ ] **40.1** Vocal Editor → Eingebaute Stimmen → **Sänger installieren** → *Schritte 1/4 bis 4/4 mit steigendem Prozentwert; das KI-Backend bleibt online*
- [ ] **40.2** Am Ende → *Hinweis verschwindet, 39 Stimmen sichtbar; danach 39.2 bis 39.8 testen*

### 41. Neu in 0.96.2: Namen und Hörproben der Stimmen

- [ ] **41.1** Vocal Editor → Eingebaute Stimmen → *Stimmen mit Namen (Anna, Bella … Adam, Ben …)*
- [ ] **41.2** Auf eine Stimme klicken → *Sofort eine Hörprobe (etwa 16 s), ■ am Namen*
- [ ] **41.3** Nochmal klicken / eine andere Stimme klicken → *Stoppt / die andere spielt sofort*
- [ ] **41.4** Neue Melodie ohne Silben, Text ins Feld schreiben → *Nach einem Moment stehen die Silben unter „Noten und Silben“; einzelne Silbe ändern geht*
- [ ] **41.5** Melodie ohne Silben, Text geschrieben, gleich **Singen** → *Singt ohne Meldung „Verteile zuerst den Text“*
- [ ] **41.6** Bibliothek: Suche „Nur Name“ / „Nur Tags“, Tags in der Tag-Leiste anklicken → *Treffer passen, Anzahl wird gezeigt*
- [ ] **41.7** KI-Instrumente: auf ein Instrument klicken → *Sofort kurze Melodie, ■ am Namen; nochmal klicken stoppt*
- [ ] **41.8** Studio: zwei Audio-Spuren, ganz hineinzoomen (bis 16×), Clip ziehen → *Rastet nur nahe einer Rasterlinie ein, dazwischen stufenlos; Wellenform scharf*
- [ ] **41.9** 🧲 **Raster aus** (gelb), Clip anwählen, ← / → → *Clip bewegt sich je Tastendruck um ein Pixel*
- [ ] **41.10** App schließen, nach 10 s wieder starten (mehrmals) → *Fenster öffnet jedes Mal; Task-Manager zeigt nach dem Schließen keine App mehr*
- [ ] **41.11** Einstellungen → Plugins → **Plugins suchen** → *Keine rote Meldung „null (reading 'name')“; gefundene VST erscheinen, auch im Studio*

### 42. Neu in 0.96.3: Werkzeuge im Studio, Vocal Editor beim Start

- [ ] **42.1** Studio: oben rechts neben **Exportieren** der Kasten **Werkzeuge** → *↖ Zeiger, ✂ Schere, 🧲 Raster an/aus*
- [ ] **42.2** ✂ wählen, auf einen Audio-Clip klicken → *Clip wird an der Stelle geschnitten (im Raster); Mauszeiger ist ein Kreuz*
- [ ] **42.3** Mit ✂ und **Alt** klicken → *Schnitt genau an der Klickstelle*
- [ ] **42.4** **Esc** → *Zurück zum Zeiger ↖*
- [ ] **42.5** App neu starten, sofort den Vocal Editor öffnen → *„Das KI-Backend startet …“, dann erscheinen die Stimmen; kein „Sänger installieren“*
- [ ] **42.6** Ohne Melodie in den Vocal Editor → *Unter „Singen“ steht, warum es grau ist*
- [ ] **42.7** Alle 39 Stimmen anklicken → *Jede hat eine Hörprobe von etwa 16 s*

### 43. Neu in 0.96.4: Schere für Bereiche, Gesang → MIDI per Rechtsklick

- [ ] **43.1** ✂ wählen, über einen Teil eines Audio-Clips ziehen, loslassen → *Der Bereich ist ein eigener Clip und ausgewählt; der Zeiger ↖ ist wieder aktiv*
- [ ] **43.2** ✂ über zwei Spuren hinweg ziehen → *Auf beiden Spuren wird der Bereich herausgeschnitten*
- [ ] **43.3** ✂ einmal klicken (ohne Ziehen) → *Schnitt an der Stelle, danach wieder Zeiger*
- [ ] **43.4** Rechtsklick auf eine Gesangsaufnahme → **Mein Gesang → MIDI-Melodie (Vocal Editor)** → *Vocal Editor öffnet sich, nach Sekunden neue Spur „Meine Melodie (MIDI)“*
- [ ] **43.5** Stil **Rap**: die Rap-Beispiele anklicken → *Jedes Beispiel spielt sofort*
- [ ] **43.6** App schließen, gleich wieder per Doppelklick starten (Desktop und an die Taskleiste angeheftet), mehrmals → *Ein Klick reicht, das Fenster erscheint jedes Mal*

### 44. Neu in 0.96.5: PyTorch / torchaudio passen zusammen

- [ ] **44.1** Einstellungen → KI-Engines → „Stem separation (Demucs)“ ankreuzen → Ausgewählte installieren → *Im Log steht am Ende „PyTorch check: …“ mit den Versionen*
- [ ] **44.2** Stem Splitter: einen Song teilen → *Stems kommen ohne Fehler*

### 45. Neu in 0.96.6: Schere deutlicher, ganzer Song beim Herauszoomen

- [ ] **45.1** ✂ über einen Teil eines Audio-Clips ziehen → *Beim Ziehen ein gelber Bereich über die ganze Spurhöhe, genau dort, wo geschnitten wird*
- [ ] **45.2** Loslassen → *Leiste „Herausgeschnitten … Löschen / Behalten“; **Löschen** entfernt genau den gelben Teil*
- [ ] **45.3** Nochmal schneiden, dann **Entf** drücken → *Der herausgeschnittene Teil wird gelöscht*
- [ ] **45.4** Ganz herauszoomen (Regler ganz links) oder **⤢** → *Der ganze Song ist zu sehen und ein paar Takte danach; Taktzahlen überlappen nicht*

### 46. Neu in 0.97.0: Album-Mastering

- [ ] **46.1** Mastering → oben **💿 Album** → *Album-Ansicht mit Titel, Künstler, Ziel-Lautheit*
- [ ] **46.2** **+ Songs hinzufügen…**, 3–4 Songs wählen, mit ▲ ▼ ordnen → *Songs nummeriert 01, 02 …; Reihenfolge ändert sich*
- [ ] **46.3** **Messen** → *Je Song ein grauer (vorher) und ein farbiger Balken (nachher), Linie für das Ziel, LUFS und Länge*
- [ ] **46.4** **Album angleichen** → *Fortschritt; danach liegen alle Songs am Ziel (grün), ein leiser etwas darunter*
- [ ] **46.5** Auf einen Songnamen klicken → *Der Song öffnet sich einzeln mit seiner (angepassten) Kette*
- [ ] **46.6** Pause auf 3 s, **▶ Übergang anhören** → *Ende des Songs, 3 s Stille, Anfang des nächsten*
- [ ] **46.7** **Album exportieren…**, Ordner wählen, „ganzes Album als eine Datei“ an → *„01 - Titel“ usw. im Ordner, plus „… (ganzes Album)“; Tags mit Album und Tracknummer*

### 47. Neu in 0.97.1: Prompt und Text in der Bibliothek

- [ ] **47.1** Bibliothek → bei einem erzeugten Song **📝 Prompt & Text** → *Prompt (Stil) und Liedtext klappen auf, mit Modell, Seed, BPM*
- [ ] **47.2** **Kopieren** beim Text, in einen Editor einfügen → *Der ganze Text ist da*
- [ ] **47.3** **In Create music wiederverwenden** → *Create music öffnet sich, Prompt und Text sind eingetragen*

### 48. Neu in 0.97.2: Album anhören, Pause am Übergang

- [ ] **48.1** Album: bei „↓ Pause“ zwischen zwei Songs 3 s wählen → *Alle Übergänge zeigen 3 s*
- [ ] **48.2** **▶ Übergang anhören** (auch bei langen Songs) → *Startet nach wenigen Sekunden: Ende, 3 s Stille, Anfang des nächsten*
- [ ] **48.3** **▶ Album anhören** → *Song 1 spielt (mit seiner Kette), danach Pause, dann Song 2 …; am laufenden Song steht ♪*
- [ ] **48.4** Auf die Nummer eines Songs klicken (z. B. 03) → *Album spielt ab diesem Song*
- [ ] **48.5** **Messen** → *Knopf ist bedienbar, Balken erscheinen; nach Wechsel zu „Ein Song“ und zurück sind sie noch da*

### 49. Neu in 0.97.3: Album-Player mit Zeitleiste

- [ ] **49.1** Album: **▶ Album anhören** → *Zeitleiste mit allen Songs und Pausen, weiße Abspiellinie läuft, Zeit läuft mit*
- [ ] **49.2** In die Zeitleiste klicken (z. B. Mitte von Song 3) → *Spielt sofort ab dort*
- [ ] **49.3** Gelbes **⇄** zwischen zwei Songs klicken → *Spielt ab 8 s vor dem Ende, durch die Pause in den nächsten Song*
- [ ] **49.4** **⏮ / ⏭** → *Springt zum vorherigen / nächsten Song*

### 50. Neu in 0.97.4: Stil-Vorschau je Stimme

- [ ] **50.1** Vocal Editor → Eingebaute Stimmen → eine Stimme wählen → *Unter den Stilen „{Name} in jedem Stil: ▶ Pop ▶ Rock ▶ Ballade ▶ Soul“*
- [ ] **50.2** Die vier nacheinander anklicken → *Dieselbe Zeile, hörbar anders gesungen und mit anderem Klang*
- [ ] **50.3** Mastering → **♪ Beispiel-Song** → *Ein leiser, ungemasterter Song öffnet sich; Presets laden, Vorher / Nachher vergleichen*
- [ ] **50.4** Album: neuer Player → *Zeitlineal, Wellenform je Song, laufender Song farbig; Maus über eine Pause: „Übergang anhören“, Klick spielt ihn*
- [ ] **50.5** Album-Player: ▶, dann gleich ■ → *▶ zeigt sofort einen drehenden Kreis und „Wird vorbereitet …“; ■ stoppt sofort; der Ton kommt nach wenigen Sekunden*
- [ ] **50.6** App neu starten, Album öffnen, sofort ▶ → *Ton nach wenigen Sekunden (nicht 20); Wellenformen erscheinen nach und nach, beim nächsten Öffnen sofort*

### 51. Neu in 0.97.7: Songs ins Album ziehen

- [ ] **51.1** Album-Ansicht → *Oben nur „Mastering · Ein Song / Album“, keine Song-Reiter mehr*
- [ ] **51.2** Audiodateien aus dem Explorer auf die Album-Ansicht ziehen → *„Loslassen, um die Songs zum Album hinzuzufügen“; danach am Ende der Liste*
- [ ] **51.3** Einen Song an den ⋮⋮ fassen und an eine andere Stelle ziehen → *Lila Linie zeigt die Stelle; Reihenfolge und Zeitleiste ändern sich*
- [ ] **51.4** Unten „4 Songs · …“ → *Zeigt die richtige Gesamtlänge (z. B. 24:53)*
