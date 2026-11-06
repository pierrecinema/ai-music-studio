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
- **Alle Downloads an einem Ort:** Auch Whisper, MuScriptor (über Hugging Face) und Demucs (über PyTorch) laden in den gewählten Modelle-Ordner.
- **Modellwahl:** Mit der aktuellen Engine ist ACE-Step v1 (3.5B) das einzige Musikmodell. Die Varianten aus ACE-Step Studio (XL, Turbo, quantisiert) brauchen eine andere Engine.
- LoRAs bleiben im eigenen LoRA-Ordner (`%USERPROFILE%\.ai-music-studio\loras`), der Modelle-Ordner verschiebt sie nicht.

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
