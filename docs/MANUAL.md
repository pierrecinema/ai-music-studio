# AI Music Studio – Handbuch

Stand: Version 0.1.5 (Alpha). Windows 10/11, 64 Bit.

## 1. Installation

1. `AIMusicStudio-Setup-<Version>.exe` von der [Releases-Seite](https://github.com/pierrecinema/ai-music-studio/releases) laden und starten.
2. Der Installer ist nicht signiert. Wenn Windows SmartScreen warnt: **Weitere Informationen → Trotzdem ausführen**.
3. Die App startet auch ohne weitere Einrichtung (Oberfläche, Timeline, Piano Roll, Winamp-Modus). Die KI-Funktionen brauchen das Backend, siehe Abschnitt 2.

Updates: Die App sucht beim Start und alle 4 Stunden nach neuen Versionen und zeigt unten rechts einen Hinweis. Manuell: **Einstellungen → Updates**.

## 2. Einrichtung (einmalig)

### Schritt 1: Python

Das KI-Backend läuft in einer eigenen Python-Umgebung, die die App selbst anlegt. Dafür muss Python auf dem Rechner sein.

- **Empfohlen: Python 3.11** (3.10 bis 3.12 funktionieren am zuverlässigsten).
- Python 3.13 oder neuer ist riskant. Nachgeprüft mit Python 3.14: **basic-pitch und ACE-Step lassen sich dort nicht installieren** (ACE-Step schreibt `spacy==3.8.4` vor, das es nur bis Python 3.12 gibt). Demucs, Matchering, Whisper, OpenCV und MuScriptor gehen.
- Beim Installieren **„Add python.exe to PATH“** anhaken.

```
winget install Python.Python.3.11
```

Sind mehrere Versionen installiert, nimmt die App bevorzugt 3.11, dann 3.12, 3.10, 3.13.

**Schon eine Umgebung mit zu neuem Python angelegt?** Installierst du danach Python 3.11 und klickst **Install selected**, baut die App ihre Umgebung automatisch mit 3.11 neu auf (die alte wird gelöscht, die Pakete werden neu geladen). Von Hand geht es auch: den Ordner `%APPDATA%\desktop\engines\venv` löschen und neu installieren.

Einzelne optionale Pakete, die nicht installierbar sind, brechen die restliche Installation nicht mehr ab: Die App meldet am Ende, welche fehlen, und installiert den Rest.

### Schritt 2: KI-Engines installieren

**Einstellungen → AI Engines**, Pakete ankreuzen, **Install selected** klicken. Der Fortschritt steht im Log darunter. Danach startet das Backend automatisch neu.

| Paket | Wofür | Hinweis |
|---|---|---|
| Core backend | API-Server, KI-Chat, MIDI-Werkzeuge | immer dabei |
| PyTorch | Grundlage für Demucs und lokale Modelle | großer Download, Variante siehe unten |
| Demucs | Stems trennen (6 Stems) | braucht PyTorch |
| basic-pitch | Audio → MIDI (Standard) | |
| Matchering | Mastering gegen Referenztrack | |
| faster-whisper | Wort-Timing für Karaoke | |
| Video-Analyse | OpenCV, librosa | optional |
| ACE-Step | ganze Songs generieren, LoRA | braucht **Git**; Modellgewichte (mehrere GB) laden beim ersten Gebrauch |
| MuScriptor | genauere Audio → MIDI | **nur nicht kommerziell** (CC BY-NC 4.0) und nur für Musik, deren Rechte du hast |

**PyTorch-Variante:**
- **CPU**: läuft überall, ist der sichere Startpunkt.
- **NVIDIA CUDA**: für GeForce/RTX-Karten.
- **AMD / DirectML**: optionales Zusatzpaket (`torch-directml`) für AMD-Karten unter Windows. Es gibt es nur für ältere Python-Versionen (bis 3.12). Fehlt es, behält die App PyTorch in der CPU-Version und macht weiter. Bei sehr alten Karten (z. B. Radeon R9 290) ist unsicher, ob DirectML funktioniert.

Standard ist **CPU** (bei NVIDIA-Karten CUDA). Die Karte wird beim Start erkannt, auch auf Laptops mit zwei Grafikchips: Eine NVIDIA-Karte wird dem integrierten Chip vorgezogen.

### Schritt 3: API-Schlüssel für den KI-Chat

**Einstellungen → AI**: Anbieter wählen (Claude oder ChatGPT), Schlüssel eintragen, Modell wählen (aktuelle Claude-Modelle sind in der Liste, jede andere Modell-ID geht über „Other model ID…“). Jeder Anbieter merkt sich sein eigenes Modell. Der Schlüssel wird lokal im App-Datenordner gespeichert (nicht verschlüsselt). Ohne Schlüssel funktionieren alle lokalen Funktionen, nur der KI-Chat nicht.

### Schritt 4: Optionale Programme

- **Git** (für ACE-Step): `winget install Git.Git`
- **ffmpeg** (für Karaoke-Video): `winget install Gyan.FFmpeg`
- **FluidSynth** und eine SoundFont (für die KI-Instrumente als Notlösung): optional

Nach der Installation die App neu starten, damit sie die neuen Programme im PATH findet.

### Schritt 5: Weiteres

- **Einstellungen → Allgemein**: Sprache (9 Sprachen), VST-Suchpfade.
- **Einstellungen → Darstellung**: dunkles oder helles Design.

## 3. Funktionen

- **Menü links:** Mit **«** / **»** oben klappst du es ein (nur Icons) oder aus (mit Beschriftung). Die Wahl wird gespeichert.
- **Create music** (ganz oben im Menü, ✨): Der Song-Generator mit **Simple** (Stil, Text, Create) und **Studio** (alle Einstellungen):
  - **Song:** Titel, Stil (mit Genre-Vorschlägen, ✨ lässt die KI den Stil verbessern)
  - **Lyrics:** Instrumental, Sprache, Stimme (Any/Male/Female), Text mit Abschnitts-Tags wie `[Verse]`, `[Chorus]` (✨ lässt die KI Text schreiben)
  - **Song parameters:** Länge, BPM, Tonart, Takt; „Auto“ überlässt es dem Modell, „Complete the metadata“ füllt per KI aus
  - **Source and reference:** Quell-Track (Cover/Remix) und Klang-Referenz
  - **LoRA**, **Quality** (Schritte, Songs × Variationen × Queue, Seed) und **Advanced** (Sprachmodell-Stufe, Rendering, LoRA je Schicht, Ausgabe: FLAC/MP3/WAV, Fades)
  - **Into project:** legt die fertigen Songs als Audiospuren auf der Timeline an
  
  Die Generierung läuft im Hintergrund, immer nur ein Auftrag. Nicht jede Einstellung kennt jede Engine-Version: Was die installierte Engine nicht unterstützt, wird nicht verschwiegen, sondern unter „Results“ als „ignored“ gemeldet. Format-Umwandlung und Fades übernimmt die App selbst mit ffmpeg.
- **LoRA** (in Create music): Stil-, Künstler- oder Sound-Erweiterungen. **Import LoRA file…** oder **folder…** wählt `.safetensors`/`.pt`/`.bin` bzw. einen Ordner und kopiert ihn in den LoRA-Ordner. Das geht auch ohne eingerichtetes Backend. Dann „+ Add LoRA“, Stärke einstellen. Die Engine nutzt pro Durchgang **eine** LoRA; bei mehreren wird die stärkste verwendet und die App weist darauf hin.
- **LoRA direkt von Hugging Face laden:** **Find LoRA on Hugging Face…** im LoRA-Bereich. Die Quelle ist [huggingface.co](https://huggingface.co) (dort liegen auch die Kataloge anderer ACE-Step-Programme). Die Liste ist nach Likes sortiert und zeigt Downloads und Lizenz. Du kannst auch einen Link oder `owner/name` einfügen. Ein Klick auf ein LoRA zeigt seine Gewichtsdateien mit Größe, **Download** lädt sie mit Fortschrittsanzeige in den LoRA-Ordner, wählt sie aus und merkt sich Quelle und Lizenz. Abbrechen ist jederzeit möglich.
  - **Passt das LoRA zur Engine?** Jedes LoRA gehört zu einer Modellversion. Diese App nutzt ACE-Step **v1**. Die App rät aus Namen und Tags: „made for ACE-Step v1: fits this app“ (grün) oder „1.5 / XL: may not load“ (orange). Das ist eine Schätzung, die Modellkarte (Knopf „Open model card“) hat die Wahrheit.
  - **Lizenz:** Die Lizenz steht bei jedem LoRA. Prüfe sie, bevor du die Musik kommerziell nutzt.
  - Heruntergeladene Dateien werden geprüft (richtige Größe, gültiger `safetensors`-Kopf). Geschützte („gated“) Repos mit Zustimmungspflicht gehen noch nicht.
- **Stem Splitter** (✂): Vocals, Drums, Bass, Piano, Gitarre, Rest. Modell „6 Stems“ liefert Piano und Gitarre getrennt.
- **Mastering** (◎): eigenen Track und einen Referenztrack wählen, Ausgabe 16 oder 24 Bit.
- **Karaoke Export** (🎙): erkennt Wörter und Zeiten, erzeugt eine erweiterte `.lrc` und ein MP4 mit hervorgehobenem Text (16:9, 9:16, 1:1). Am besten mit einer isolierten Gesangsspur.
- **Winamp-Modus**: **Strg+M** oder unten rechts „Winamp (Ctrl+M)“. Audiodateien hinzufügen. Die Musik läuft weiter, wenn du zurück ins Studio wechselst.
- **Audio → MIDI**: Standard ist basic-pitch. Ist MuScriptor installiert, wird es automatisch bevorzugt.

## Tastenkürzel (Ableton Live 12 oder Cubase)

**Einstellungen → Shortcuts**: Dort wählst du per Klick die Belegung **Ableton Live 12** oder **Cubase**. Die Tabelle zeigt alle Kürzel beider DAWs nebeneinander, die gewählte ist hervorgehoben. Viele Tasten sind gleich (Leertaste, Strg+Z, Strg+D, Strg+N), andere unterscheiden sich:

| Aktion | Ableton Live 12 | Cubase |
|---|---|---|
| Play / Pause | Leertaste | Leertaste |
| Aufnahme | F9 | Num * |
| Metronom | O | C |
| Wiederherstellen (Redo) | Strg+Y | Strg+Umschalt+Z |
| Audiospur hinzufügen | Strg+T | T |
| MIDI-Spur hinzufügen | Strg+Umschalt+T | – |
| Spur stumm / Solo | 0 / S | M / S |
| Spur löschen | Entf | Umschalt+Entf |
| Piano-Roll-Werkzeug | B (Zeichnen an/aus) | 1 Auswahl, 5 Radierer, 8 Zeichnen |
| Zoom | + / − | H / G |
| Piano Roll / Mixer | Umschalt+Tab / Strg+Alt+M | Strg+E / F3 |

Dazu gehören Stopp, Zurück zum Anfang, Spur duplizieren (Strg+D), neues Projekt (Strg+N), Einstellungen (Strg+, bei Ableton), Vollbild (F11) und der Winamp-Modus (Strg+M in beiden). Die Liste in den Einstellungen ist vollständig.

- **Rückgängig / Wiederholen** gilt für Änderungen am Projekt (Spuren, Clips, Noten, Tempo). Ein Schieberegler-Zug zählt als ein Schritt.
- In Textfeldern tippst du normal, die Kürzel greifen dort nicht (Funktionstasten ausgenommen).
- Aufgenommen sind nur Kürzel für Funktionen, die die App hat. Loop, Quantisieren, Comping u. Ä. folgen, wenn es die Funktionen gibt.
- Quellen: Ableton-Kürzel aus dem Live-12-Handbuch (Windows). Cubase-Kürzel sind die Standard-Tastenbefehle laut Steinberg-Forenliste (Stand Cubase 11), bei neueren Versionen können einzelne abweichen.

## Modelle und Speicherplatz (Einstellungen → Models)

Die KI-Modelle sind groß (ACE-Step allein rund 8 GB). Der Tab **Models** zeigt, was auf der Platte liegt, und lässt dich den Ort ändern:

- **Anzeige:** Für jedes Modell Größe, Zustand (*Downloaded*, *Downloading…* mit Geschwindigkeit, *Incomplete*, *Not downloaded yet*) und seine Bestandteile (bei ACE-Step: Transformer, Autoencoder, Vocoder, Text-Encoder). Dazu freier Platz auf dem Laufwerk, die LoRAs und die Python-Umgebung. Die Ansicht aktualisiert sich alle paar Sekunden, du siehst einen laufenden Download also wachsen.
- **Speicherort ändern:** **Change folder…** öffnet die Ordnerauswahl. Du entscheidest, ob die vorhandenen Modelle **verschoben** werden (empfohlen, nichts wird neu geladen) oder ob nur der neue Ordner benutzt wird (Modelle werden bei Bedarf neu geladen, die alten Dateien bleiben liegen). Beim Verschieben prüft die App den freien Platz, zeigt Fortschritt, erhält die Verknüpfungen des Hugging-Face-Aufbaus und löscht die alten Dateien erst nach vollständigem Erfolg. **Cancel** bricht ab, ohne etwas zu verändern. Das Backend startet danach automatisch neu. **Back to the default folder** stellt den Standard wieder her.
- **Löschen:** **Delete to free space** entfernt ein Modell nach Rückfrage. Es wird beim nächsten Gebrauch neu geladen. LoRAs lassen sich einzeln löschen (die Datei wird wirklich entfernt).
- **Platz freigeben (Free up space):** Zeigt Zwischenspeicher, die sich gefahrlos leeren lassen: den **pip-Download-Cache** (Python-Pakete, auch von anderen Python-Programmen genutzt, oft mehrere GB), **Installer-Reste** und **heruntergeladene App-Updates**. Leeren kostet nur Downloadzeit, falls etwas wieder gebraucht wird. Modelle, LoRAs und Songs werden dabei nie angefasst, und es lassen sich nur diese festen Ordner löschen. Die Engine-Installation legt ihre Pakete seit 0.1.12 in einen eigenen Cache und räumt ihn nach erfolgreicher Installation selbst auf, damit nichts mehr anwächst.
- **Alle Downloads an einem Ort:** Auch Whisper, MuScriptor (über Hugging Face) und Demucs (über PyTorch) laden in den gewählten Modelle-Ordner.
- **Modellwahl:** Mit der aktuellen Engine ist ACE-Step v1 (3.5B) das einzige Musikmodell. Die Varianten aus ACE-Step Studio (XL, Turbo, quantisiert) brauchen eine andere Engine.
- LoRAs bleiben im eigenen LoRA-Ordner (`%USERPROFILE%\.ai-music-studio\loras`), der Modelle-Ordner verschiebt sie nicht.

## Hardware-Check und Musikmodelle (Einstellungen → Hardware)

Die App prüft beim Start deinen Computer (Prozessor, RAM, Grafikkarte mit Speicher, freier Platz) und stuft ihn ein: *Entry*, *Capable*, *Standard*, *Pro* oder *Studio*. Unter **Einstellungen → Hardware** siehst du für jede Funktion:

- **Runs well**: läuft angenehm.
- **Slow here**: läuft, dauert aber lange. Der Grund und eine grobe Zeitangabe stehen dabei (zum Beispiel "30 bis 90 Minuten pro Minute Musik auf der CPU").
- **Not possible**: der Computer kann es wirklich nicht, mit Begründung (zum Beispiel zu wenig RAM).

Die Zeiten sind Schätzungen, keine Messungen. Eine NVIDIA-Karte mit CUDA macht die KI-Musik um ein Vielfaches schneller. AMD-Karten und reine CPU-Rechner funktionieren, sind aber langsam.

**Music model** (in *Create music* oben im Kasten *Song*): Du wählst das Modell, jeweils mit Bewertung für deinen PC.

| Modell | Kann | Hinweis |
|---|---|---|
| ACE-Step v1 | ganze Songs mit Gesang, bis 10 Minuten, LoRA | Apache-2.0 |
| MusicGen small / medium / large | Instrumental-Clips bis 30 Sekunden, kein Gesang, kein LoRA | Modellgewichte CC-BY-NC 4.0: nur nicht-kommerziell. Das kleine Modell läuft auch auf alten PCs. Installation: Einstellungen → AI Engines → *Music generator (MusicGen, light)* |
| AudioLDM 2 (music), MusicLDM | Instrumental-Clips um 10 Sekunden, kein Gesang | Forschungsmodelle, nur nicht-kommerziell. Laufen auf der CPU (Minuten pro Clip). AudioLDM 2 ist das Modell aus der LoRA-Arbeit im Abschnitt zu eigenen LoRAs |
| DiffRhythm 1.2 (experimentell) | ganze Songs mit Gesang aus deinen Lyrics, 95 s bis 4:45 in **einem** Schritt, Stil per Text | Nur mit **NVIDIA-Karte ab 8 GB** (laut den Autoren; für CPU und AMD gibt es keine Angabe). Eigene Umgebung, Git und unter Windows eSpeak NG (.msi) nötig. Lyrics werden gleichmäßig über den Song verteilt. Vom Entwickler nach dem Projektcode gebaut, auf echter Hardware **noch nicht getestet**: bitte Rückmeldung geben. Lizenz Apache-2.0 |
| Stable Audio Open, YuE, ACE-Step 1.5 | | Stehen in der Liste mit Anforderungen, sind aber noch nicht eingebaut ("soon") |

**Grafikkarte von AMD oder Intel nutzen (DirectML).** Unter Einstellungen → AI Engines gibt es *Graphics card support (AMD / Intel, DirectX 12)*. Das legt eine zweite, getrennte Python-Umgebung an (etwa 1,5 GB) mit `torch-directml`. Damit rechnet **MusicGen small** auf der Grafikkarte. Gemessen auf einer Radeon R9 290 (4 GB) mit einem i7-3930K: ein 15-Sekunden-Clip in etwa 2,5 Minuten statt 7 Minuten auf der CPU. Der Teil, der die Audio-Tokens vorhersagt, läuft auf der Grafikkarte; die Umwandlung in Klang (EnCodec) läuft auf der CPU, weil DirectML dafür eine Operation nicht hat. Unter *Music model* kannst du *Compute* auf automatisch, Grafikkarte oder Prozessor stellen; schlägt die Grafikkarte fehl, rechnet die App auf der CPU weiter. Grenzen: DirectML ist eine Vorschau von 2024, ACE-Step (3,5 Milliarden Parameter) passt nicht in 4 GB Grafikspeicher, und ein Stück von 5 Minuten in 5 Minuten ist mit dieser Karte nicht erreichbar. Mit Premiere ist das nicht vergleichbar: Videorendern nutzt feste Hardware-Bausteine der Karte, ein KI-Modell muss für jede Sekunde Musik Milliarden Rechenschritte ausführen.

**Länge der Tracks mit MusicGen.** Ein MusicGen-Clip kann technisch nur etwa 30 Sekunden. Gibst du in Create music mehr ein (zum Beispiel 300 s), baut die App den Track in Schritten: die ersten 30 Sekunden aus dem Text, danach jeweils 20 neue Sekunden, die an die letzten 10 Sekunden des bisherigen Tracks anschließen; die Nahtstellen werden übergeblendet. Das dauert entsprechend länger (300 s sind 15 Schritte) und der Stil kann zwischen den Schritten leicht wandern. Der Fortschrittsbalken zeigt das echte Tempo. Gemessen auf dem i7-3930K: etwa 2 Tokens pro Sekunde auf der CPU (25 Sekunden Rechenzeit pro Sekunde Musik), auf der Radeon R9 290 etwa 5 bis 6.

**Welche Grafikkarte wird benutzt?** KI-Musik rechnet in PyTorch. Das nutzt Grafikkarten nur von NVIDIA (CUDA). Eine Radeon R9 290 (2013) wird von PyTorch unter Windows nicht unterstützt; der Weg über DirectML ist für diese Modelle ungetestet und würde eine ältere PyTorch-Version erzwingen. Deshalb rechnet die App auf Ihrem PC mit der CPU. Während des Erzeugens zeigt das Fortschrittsfeld in Klartext, was benutzt wird, dazu die Auslastung von CPU und RAM. Der Fortschritt bleibt in der Fußzeile sichtbar, auch wenn du die Ansicht wechselst; ein Klick bringt dich zurück. Die Ausgabe des KI-Hintergrunddienstes steht in `backend.log` (Einstellungen → Hardware → *Show backend log file*).

**Fortschritt beim Erzeugen:** Während ein Song entsteht, zeigt die App die Phase (Modell laden, vorbereiten, rendern, speichern), einen Balken mit Prozent und geschätzter Restzeit, die laufende Zeit und beim ersten Start, wie viel vom Modell schon heruntergeladen ist. Wenn der Balken sich nicht bewegt, aber die Zeit läuft, arbeitet die App weiter.

## Eigene LoRAs trainieren (Create music → LoRA → "Train your own LoRA…")

Du kannst ACE-Step einen eigenen Stil beibringen. Du brauchst Songs, an denen du die Rechte hast.

1. **Ordner mit Songs wählen.** Textdateien neben einem Song werden erkannt: `song_prompt.txt` (Stil-Tags), `song_lyrics.txt` oder `song.txt` (Text).
2. **Jeden Song beschreiben.** Stil-Tags, durch Komma getrennt: Genre, Stimmung, Instrumente, Tempo, Gesang. Leerer Text bedeutet Instrumental. Für einen Stil sind mindestens 8 bis 10 Songs, besser 30 Minuten Musik sinnvoll; die App warnt bei weniger.
3. **Länge und Stärke wählen** (test / normal / thorough, Rank 64 / 128 / 256).
4. **Training.** Die App prüft deinen Computer:
   - *Train here*: nur mit NVIDIA-Grafikkarte (CUDA). Ab 8 GB Grafikspeicher möglich, 12 GB oder mehr empfohlen. Die Zahlen sind Schätzungen und ungetestet. Einmalig wird der ACE-Step-Trainer (35 MB) per Git geholt. Dafür vorher unter Einstellungen → AI Engines *LoRA training* installieren.
   - *Build bundle for another computer*: packt die umgewandelten Songs, die Einstellungen und eine Anleitung (README.txt) in eine ZIP-Datei. Damit trainierst du auf einem stärkeren PC und importierst das Ergebnis mit *Import LoRA folder*.

**Rank und Überanpassung.** Eine wissenschaftliche Arbeit (Applied Sciences 2025, 15(15), 8646; AudioLDM mit LoRA auf nur 193 Beispielen) fand: Mit höherem Rank und Alpha passt das Ergebnis besser zum Text, entfernt sich aber vom echten Klang, die Überanpassung steigt. Die besten Werte für die Ähnlichkeit zu echter Musik hatten kleine Ränge (1 bis 8) und frühe Zwischenstände. Das gilt für ein anderes Modell und lässt sich nicht eins zu eins auf ACE-Step übertragen. Als Faustregel für uns: Bei wenigen Songs lieber Rank 16 oder 32 und die Länge *test* oder *normal* wählen, statt *thorough* mit Rank 256.

Das fertige LoRA erscheint automatisch in deiner Liste. Hinweis: Das Training selbst wurde in dieser Version nur mit einem Ersatz-Trainer getestet, nicht mit einer echten NVIDIA-Karte.

## Zeitleiste, Mixer, Klaviatur-Editor, Projekte (Grundfunktionen)

**Abspielen.** Space startet und pausiert, die Stopp-Taste springt an den Anfang. Der Abspielkopf wandert über alle Spuren und die Ansicht folgt ihm. Ein Klick in das Lineal setzt den Abspielkopf. Das Metronom (♩) klickt auf jeden Schlag, auf die Eins eines Taktes höher.

**Audio importieren.** *Import audio…* oder Dateien (wav, mp3, flac, ogg, m4a, aiff) aus dem Explorer auf die Zeitleiste ziehen. Ein Doppelklick auf eine leere Audiospur öffnet den Dateidialog an dieser Stelle. Jeder Clip zeigt seine Wellenform.

**Clips bearbeiten.** Ziehen verschiebt (auch auf andere passende Spuren), an den Rändern ziehen kürzt (links und rechts; Audio bleibt dabei an derselben Stelle der Datei). Alles rastet auf Viertelschläge ein, **Alt** hebt das auf. **Ctrl+E** (Cubase: **Alt+X**) teilt den gewählten Clip am Abspielkopf, **Ctrl+D** dupliziert ihn, **Entf** löscht ihn (ohne gewählten Clip die gewählte Spur). Mit **Strg+Mausrad** zoomst du. Spuren benennst du mit Doppelklick auf den Namen um.

**Mixer.** Lautstärke, Pan, Mute und Solo wirken beim Abspielen sofort. Die Pegelanzeigen sind echte Spitzenwerte (mit kurzer Haltemarke), auch am Master. Ein Doppelklick auf einen Regler setzt ihn zurück.

**MIDI und Klaviatur-Editor.** Doppelklick auf eine leere MIDI-Spur legt einen Clip an, Doppelklick auf den Clip öffnet den Editor. Zeichnen-Werkzeug: Klick setzt eine Note (mit Klang), ziehen verschiebt, am rechten Rand ziehen ändert die Länge, **Entf** löscht. Ein Klick auf die Klaviatur links spielt den Ton. Der eingebaute Klang ist ein einfacher Synthesizer (zwei Oszillatoren mit Filter), kein Instrumentenpaket.

**Aufnahme.** Die rote Taste nimmt vom Mikrofon oder Audio-Interface auf, während das Projekt läuft, und legt die Aufnahme als Clip ab. Es gibt keine Latenzkorrektur.

**Tempo.** Ändert man das Tempo, bleibt Audio zeitlich an seiner Stelle (es wird nicht gestreckt); MIDI folgt dem Tempo.

**Projekte.** *File → Save* (Ctrl+S) schreibt eine `.ams`-Datei. Die Audiodateien bleiben, wo sie sind (Bibliothek oder Importordner); fehlt beim Öffnen eine, meldet die App es und der Clip bleibt stumm und rot. Alle 30 Sekunden sichert die App ungespeicherte Arbeit; nach einem Absturz bietet sie beim Start an, sie wiederherzustellen. Ein Punkt im Fenstertitel zeigt ungespeicherte Änderungen. Rückgängig/Wiederholen (Ctrl+Z / Ctrl+Y) gelten für alle Änderungen am Projekt.

**Export.** *File → Export audio* mischt das ganze Projekt (Mute, Solo, Lautstärke und Pan wie gehört) zu WAV (16 oder 24 Bit) oder MP3 (braucht ffmpeg; fehlt es, wird stattdessen eine WAV-Datei gespeichert). Optional normalisiert die App auf −1 dBFS und warnt, wenn der Mix übersteuert.

## Bibliothek

Jeder erzeugte Song wird sofort dauerhaft gespeichert, standardmäßig unter `Musik\AI Music Studio` (nach Monaten sortiert, mit `library.json` für Titel, Stil, Modell, Seed und Länge). Unter **Library** kannst du Songs abspielen, umbenennen (Doppelklick), als Favorit markieren, suchen, in den Explorer zeigen, löschen und mit **Add to project** auf die Zeitleiste legen. Auch eigene Dateien lassen sich hinzufügen. Früher erzeugte Songs lagen nur im temporären Ordner und sind eventuell weg.

### Raster, stufenloses Verschieben, Quantisierung

- **Grid** (Leiste der Zeitleiste und des Klaviatur-Editors): Rastergröße von *1 Bar* bis *1/64*, dazu Triolen (1/8 und 1/16) und *Off (free)*. **Snap** schaltet das Einrasten an oder aus (Ctrl+4). **Stufenlos** verschiebst du immer, wenn Snap aus ist, oder für einen einzelnen Zug mit gedrückter **Alt**-Taste. Das Raster gilt für Verschieben, Kürzen und Teilen von Clips sowie für Noten (zeichnen, verschieben, Länge).
- **Tastatur:** Ctrl+1 engeres, Ctrl+2 weiteres Raster, Ctrl+3 Triole an/aus. **Pfeil links/rechts** schiebt den gewählten Clip (oder die gewählte Note) um einen Rasterschritt, bei ausgeschaltetem Snap um eine feine Stufe (1/64 Schlag). Im Klaviatur-Editor verschieben **Pfeil hoch/runter** die gewählte Note um einen Halbton.
- **Quantize** (Ctrl+U; Einstellungen mit dem Zahnrad oder Ctrl+Shift+U): Bei MIDI rücken die Noten des gewählten Clips (oder die gewählte Note) zum Raster. *Strength* bestimmt, wie weit (100 % = genau aufs Raster, 50 % = halber Weg), *Swing* verzögert jeden zweiten Rasterschritt, und mit *Quantize note ends* ändern sich auch die Notenlängen. Bei **Audio** gibt es keine Noten: Quantize rastet den Clipanfang ein (die Rhythmik innerhalb der Aufnahme bleibt unverändert; dafür gibt es das Beat-Matching). Warp-Marker wie in Ableton gibt es noch nicht.
- **Spuren umsortieren:** am Griff `⋮⋮` links im Spurkopf ziehen.
- **Spuren löschen:** der ×-Knopf im Spurkopf oder die Entf-Taste (nach einem Klick auf den Spurkopf). Es kommt keine Rückfrage mehr, **Ctrl+Z bringt die Spur zurück**. Entf löscht einen gewählten Clip; der Klick auf einen Spurkopf hebt die Auswahl eines Clips einer anderen Spur auf, damit Entf nicht den falschen Clip trifft.
- **Clip-Leiste** (erscheint, sobald ein Audio-Clip gewählt ist): *Gain* (Doppelklick setzt auf 0 dB zurück) sowie *Fade in* und *Fade out* in Sekunden.

### Beat-Matching: neues Audio in den Takt bringen

Sobald Audio auf die Zeitleiste kommt (Import, Drag-and-drop, aus der Bibliothek oder als Sample), misst die App **Tempo und ersten Schlag** und zeigt unten rechts die Karte *Beat matching*:

- **Sync to … BPM:** dehnt oder staucht das Audio auf das Projekttempo, ohne die Tonhöhe zu ändern. Das Audio merkt sich sein eigenes Tempo (`warpBpm`) und folgt später auch Tempoänderungen des Projekts.
- **Set project to … BPM:** setzt das Projekttempo auf das Tempo des Audios (die beste Wahl für das erste Audio eines Projekts; die Karte hebt sie dann hervor). Anderes Audio bleibt zeitlich an seiner Stelle.
- **Put the first beat on the grid:** schneidet Stille oder Vorspann vor dem ersten Schlag weg (nicht zerstörend: den linken Rand kannst du zurückziehen) und rastet den Clip auf einen Schlag ein.
- **÷2 / ×2:** Beat-Tracker finden manchmal die halbe oder doppelte Geschwindigkeit; hier korrigierst du das, bevor du übernimmst. Du kannst das Tempo auch von Hand eintippen, falls nichts gefunden wurde (Ambient, freier Rhythmus).
- **Keep as is** lässt alles unverändert. Unten wählst du, ob die App *jedes Mal fragt*, **automatisch angleicht** (erstes Audio setzt das Projekttempo, weiteres wird gestreckt) oder *nie anbietet*.
- Später kannst du jeden Audio-Clip über **Beat match…** in der Zeitleisten-Leiste neu messen und angleichen. Alles ist mit Strg+Z rückgängig zu machen.

Gemessen am Beispiel: Ein 90-BPM-Loop in einem 120-BPM-Projekt wird 18 Schläge lang und seine Kicks liegen im Abstand von 0,497 s (Soll 0,5 s). Das Tempo wird aus den Schlagzeiten per Ausgleichsgerade bestimmt und rastet auf ganze BPM ein, wenn es nahe daran liegt; bei sehr unregelmäßiger Musik (Live-Aufnahmen mit Temposchwankung) bleibt die Genauigkeit begrenzt, dort hilft nur Anpassen von Hand.

### Samples (Ableton und andere), tempo-synchron einfügen

Unter **Library → Samples** legst du Sample-Ordner fest. Die App erkennt installierte **Ableton-Live-Bibliotheken** (Core Library, User Library, Factory Packs) und bietet sie mit *Use this library* an; jeder andere Ordner geht über *Add folder…*. Es wird nichts kopiert: die Dateien bleiben, wo sie sind, die App merkt sich nur die Ordner. Die Suche läuft über Dateiname und Ordnername und findet auch in großen Bibliotheken sofort (die Core Library von Live 11 mit rund 2500 Dateien wird in unter 2 Sekunden eingelesen).

- **Tempo:** Es wird aus dem Namen gelesen („Dark Garage 130 bpm“, Ordner „120 BPM“). Fehlt es, misst *BPM?* das Tempo mit einem Beat-Tracker (kann halb oder doppelt so schnell liegen: nach Gehör prüfen).
- **Add synced:** legt das Sample auf die gewählte Audiospur (sonst auf eine neue) an die Position des Abspielkopfs und **dehnt oder staucht es auf das Projekttempo, ohne die Tonhöhe zu ändern** (WSOLA-Zeitstreckung). Ein Loop behält seine Länge in Schlägen: ein 2-Takt-Loop bleibt bei jedem Tempo 8 Schläge lang. Ändert man später das Projekttempo, folgt er. Beispiel: ein 120-BPM-Loop in einem 150-BPM-Projekt spielt Kicks im Abstand von 0,4 statt 0,5 Sekunden, Tonhöhe und Pegel bleiben gleich.
- **Add as is:** fügt das Sample unverändert ein. **One-Shots** (unter 1 Sekunde) werden nie gestreckt.
- **Vorhören:** Mit „Preview at project tempo“ hörst du den Loop schon im Projekttempo.
- Grenzen: Gestreckt wird bis 90 Sekunden Länge und bei Faktoren zwischen etwa 0,6 und 1,7 klingt es gut, bei Extremen hörbar „gläsern“. Die Ableton-Analysedateien (`.asd`, Warp-Marker) werden nicht gelesen. Ableton-Packs im proprietären Format (`.alp`, `.adg`, `.adv`) sind keine Audiodateien und erscheinen nicht; nur die enthaltenen WAV/AIFF-Dateien.

## Beta-Test

Wie du testest und Probleme meldest, steht in `docs/BETA.md`. Unten rechts gibt es den Knopf **Feedback**: Er sammelt Systemdaten, Engine-Status und die letzten Log-Zeilen, sendet aber nichts automatisch.

## 4. Speicherorte

| Was | Wo |
|---|---|
| Einstellungen, API-Schlüssel, Logs der App | `%APPDATA%\desktop` |
| Python-Umgebung der Engines | `%APPDATA%\desktop\engines\venv` |
| LoRAs | `%USERPROFILE%\.ai-music-studio\loras` |
| Modelle (ACE-Step, Whisper, Demucs) | Standard `%USERPROFILE%\.ai-music-studio\models`, **wählbar** unter Einstellungen → Models |
| Ergebnisse (Songs, Stems, Mastering, Karaoke) | `%TEMP%` (Ordner `ams_music`, `ams_master`, `ams_karaoke`, …) |

Ergebnisse liegen im Temp-Ordner und können von Windows aufgeräumt werden: Wichtiges bitte über **Open file** an einen festen Ort kopieren.

## 5. Wenig Speicher: 8 GB VRAM / 12 GB RAM

Das Backend misst VRAM und RAM beim Start und schaltet bei kleinen Rechnern selbst in den sparsamen Modus:

- Teile des Modells werden in den Arbeitsspeicher ausgelagert, halbe Genauigkeit (fp16)
- Songs bis **7 Minuten** gehen auch hier (auf großen Rechnern bis 10): Lange Songs dauern einfach länger und brauchen mehr Speicher. Läuft der Speicher aus, meldet der Auftrag einen Fehler.
- kleinere Demucs-Abschnitte, kleineres Whisper-Modell
- immer nur ein schwerer Auftrag gleichzeitig

Die Statusleiste unten zeigt GPU und Modus. Erkennung übersteuern (z. B. falsche VRAM-Erkennung): Umgebungsvariable `AMS_VRAM_GB=8` setzen.

## 6. MCP (KI-Agenten steuern die App)

Solange die App läuft **und das Backend eingerichtet ist** (Abschnitt 2), bietet sie einen MCP-Server per HTTP an: `http://127.0.0.1:38765/mcp`. Er nutzt das offizielle MCP-SDK (Streamable HTTP) und liefert 16 Werkzeuge: Musik generieren, LoRAs, Stems, Audio → MIDI, Mastering, Karaoke, Systeminfo u. a.

**Port:** Standard ist 38765. Ist er belegt (z. B. durch einen Webserver), nimmt die App den nächsten freien Port. Die aktuelle Adresse steht in der Statusleiste unten rechts und in `%APPDATA%\desktop\server.json`.

**In Claude Code eintragen** (einmalig, danach in jedem Projekt verfügbar):

```
claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp
```

Prüfen mit `claude mcp list`: Der Eintrag steht auf „Connected“, sobald die App mit eingerichtetem Backend läuft. Andere MCP-Clients, die HTTP-Server unterstützen, tragen dieselbe URL ein.

Getestet ist die Verbindung mit dem offiziellen MCP-Python-Client (Verbindung, Werkzeugliste, Aufrufe, Fehlerfall).

**Sicherheit:** Der Server lauscht nur auf `127.0.0.1`. Browser-Anfragen fremder Webseiten werden per CORS abgewiesen. Die MCP-Werkzeuge greifen auf Dateien zu, die du ihnen als Pfad nennst, nutze sie deshalb nur mit Agenten, denen du vertraust.

## 7. Fehlerbehebung

| Problem | Lösung |
|---|---|
| Statusleiste: „AI backend offline“ | Einstellungen → AI Engines: Python vorhanden? „Install selected“ ausführen. |
| Installation eines Pakets schlägt fehl | Python-Version prüfen (3.11 empfohlen), Log in AI Engines lesen, Paket einzeln erneut versuchen. |
| ACE-Step liefert nur Stille | ACE-Step ist nicht installiert (Hinweis erscheint im Panel) oder Git fehlt. |
| Fehler `Repo id must use alphanumeric chars …` mit einem LoRA | Behoben in 0.1.11: ACE-Step erwartet für ein LoRA einen Ordner mit `pytorch_lora_weights.safetensors`, die App legt ihn jetzt selbst an (`loras\.engine`). |
| „Engine error“ / `numpy.core.umath failed to import` | TensorFlow (kommt mit basic-pitch) verträgt sich nicht mit NumPy 2 und stört `transformers`. Ab 0.1.8 schaltet das Backend die TensorFlow-Erkennung ab. Das Panel zeigt jetzt den echten Fehlertext statt „nicht installiert“. |
| Einstellungen lassen sich nicht schließen | Knopf ✕ oben rechts, **Esc**, oder ein zweiter Klick auf das Zahnrad im Menü. |
| basic-pitch meldet einen Fehler | TensorFlow läuft nicht mit NumPy 2. Nimm MuScriptor für Audio → MIDI (nur nicht kommerziell). |
| Karaoke-Video: „ffmpeg not found“ | ffmpeg installieren, App neu starten. |
| Standard-Port belegt | Nichts zu tun: Die App sucht selbst einen freien Port (ab 38765), siehe Statusleiste. |
| „Python 3.14 is very new …“ | Python 3.11 daneben installieren (`winget install Python.Python.3.11`), den Tab „AI Engines“ neu öffnen. |
| Claude-Modell fehlt in der Liste | Einstellungen → AI → Modell: „Other model ID…“ wählen und die exakte ID eintragen. |
| Update-Hinweis fehlt | Einstellungen → Updates → „Jetzt suchen“. |

## 8. Bekannte Einschränkungen (Alpha)

- **Gesangssynthese und KI-Instrumente** (Vocal Editor, Instruments) sind noch Platzhalter: Ohne angebundene Modelle erzeugen sie Stille bzw. eine einfache FluidSynth-Notlösung. Echte DiffSinger-/DDSP-Anbindung fehlt noch.
- Die Engines (ACE-Step, Matchering, Whisper, MuScriptor) sind eingebunden, aber noch nicht auf allen Hardware-Kombinationen erprobt.
- Eine LoRA pro Durchgang.
- MCP steuert nur Erzeugen und Analysieren, noch nicht das offene Projekt (Spuren, Noten, Transport).
- Die neuen Panels (Generator, Mastering, Karaoke, Engines, Updates) sind noch nicht in alle 9 Sprachen übersetzt.
- Der Installer ist nicht signiert (SmartScreen-Hinweis).
