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
- Python 3.13 oder neuer ist riskant: Für PyTorch, basic-pitch und Whisper gibt es dort oft noch keine fertigen Pakete, die Installation kann scheitern.
- Beim Installieren **„Add python.exe to PATH“** anhaken.

```
winget install Python.Python.3.11
```

Sind mehrere Versionen installiert, nimmt die App bevorzugt 3.11, dann 3.12, 3.10, 3.13.

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
- **AMD / DirectML**: für AMD-Karten unter Windows. Bei sehr alten Karten (z. B. Radeon R9 290) ist unsicher, ob DirectML funktioniert. Starte mit CPU und probiere DirectML danach.

### Schritt 3: API-Schlüssel für den KI-Chat

**Einstellungen → AI**: Anbieter wählen (Claude oder ChatGPT), Schlüssel eintragen, Modell wählen. Der Schlüssel wird lokal im App-Datenordner gespeichert (nicht verschlüsselt). Ohne Schlüssel funktionieren alle lokalen Funktionen, nur der KI-Chat nicht.

### Schritt 4: Optionale Programme

- **Git** (für ACE-Step): `winget install Git.Git`
- **ffmpeg** (für Karaoke-Video): `winget install Gyan.FFmpeg`
- **FluidSynth** und eine SoundFont (für die KI-Instrumente als Notlösung): optional

Nach der Installation die App neu starten, damit sie die neuen Programme im PATH findet.

### Schritt 5: Weiteres

- **Einstellungen → Allgemein**: Sprache (9 Sprachen), VST-Suchpfade.
- **Einstellungen → Darstellung**: dunkles oder helles Design.

## 3. Funktionen

- **Music Generator** (Seitenleiste ♫): Beschreibung und optional Text eingeben, Länge wählen, **Generate song**. Die Generierung läuft im Hintergrund, es läuft immer nur ein Auftrag.
- **LoRA** (im Music Generator): Stil-, Künstler- oder Sound-Erweiterungen. `.safetensors`-Datei oder Ordner importieren, anhaken, Stärke einstellen. Die Engine nutzt pro Durchgang **eine** LoRA; bei mehreren wird die stärkste verwendet und die App weist darauf hin.
- **Stem Splitter** (✂): Vocals, Drums, Bass, Piano, Gitarre, Rest. Modell „6 Stems“ liefert Piano und Gitarre getrennt.
- **Mastering** (◎): eigenen Track und einen Referenztrack wählen, Ausgabe 16 oder 24 Bit.
- **Karaoke Export** (🎙): erkennt Wörter und Zeiten, erzeugt eine erweiterte `.lrc` und ein MP4 mit hervorgehobenem Text (16:9, 9:16, 1:1). Am besten mit einer isolierten Gesangsspur.
- **Winamp-Modus**: **Strg+M** oder unten rechts „Winamp (Ctrl+M)“. Audiodateien hinzufügen. Die Musik läuft weiter, wenn du zurück ins Studio wechselst.
- **Audio → MIDI**: Standard ist basic-pitch. Ist MuScriptor installiert, wird es automatisch bevorzugt.

## 4. Speicherorte

| Was | Wo |
|---|---|
| Einstellungen, API-Schlüssel, Logs der App | `%APPDATA%\desktop` |
| Python-Umgebung der Engines | `%APPDATA%\desktop\engines\venv` |
| LoRAs | `%USERPROFILE%\.ai-music-studio\loras` |
| ACE-Step-Modelle | `%USERPROFILE%\.ai-music-studio\models\ace-step` |
| Ergebnisse (Songs, Stems, Mastering, Karaoke) | `%TEMP%` (Ordner `ams_music`, `ams_master`, `ams_karaoke`, …) |

Ergebnisse liegen im Temp-Ordner und können von Windows aufgeräumt werden: Wichtiges bitte über **Open file** an einen festen Ort kopieren.

## 5. Wenig Speicher: 8 GB VRAM / 12 GB RAM

Das Backend misst VRAM und RAM beim Start und schaltet bei kleinen Rechnern selbst in den sparsamen Modus:

- Teile des Modells werden in den Arbeitsspeicher ausgelagert, halbe Genauigkeit (fp16)
- kürzere maximale Songlänge (der Music Generator zeigt sie an)
- kleinere Demucs-Abschnitte, kleineres Whisper-Modell
- immer nur ein schwerer Auftrag gleichzeitig

Die Statusleiste unten zeigt GPU und Modus. Erkennung übersteuern (z. B. falsche VRAM-Erkennung): Umgebungsvariable `AMS_VRAM_GB=8` setzen.

## 6. MCP (KI-Agenten steuern die App)

Solange die App läuft, lauscht sie auf `http://127.0.0.1:8765/mcp` (JSON-RPC: `initialize`, `tools/list`, `tools/call`). Die Werkzeugliste ohne Protokoll: `http://127.0.0.1:8765/mcp/tools`. Es gibt 16 Werkzeuge, u. a. Musik generieren, LoRAs, Stems, Audio → MIDI, Mastering, Karaoke, Systeminfo. Die Anbindung an einen konkreten MCP-Client habe ich noch nicht getestet.

## 7. Fehlerbehebung

| Problem | Lösung |
|---|---|
| Statusleiste: „AI backend offline“ | Einstellungen → AI Engines: Python vorhanden? „Install selected“ ausführen. |
| Installation eines Pakets schlägt fehl | Python-Version prüfen (3.11 empfohlen), Log in AI Engines lesen, Paket einzeln erneut versuchen. |
| ACE-Step liefert nur Stille | ACE-Step ist nicht installiert (Hinweis erscheint im Panel) oder Git fehlt. |
| Karaoke-Video: „ffmpeg not found“ | ffmpeg installieren, App neu starten. |
| Port 8765 belegt | Anderes Programm beenden, App neu starten. |
| Update-Hinweis fehlt | Einstellungen → Updates → „Jetzt suchen“. |

## 8. Bekannte Einschränkungen (Alpha)

- **Gesangssynthese und KI-Instrumente** (Vocal Editor, Instruments) sind noch Platzhalter: Ohne angebundene Modelle erzeugen sie Stille bzw. eine einfache FluidSynth-Notlösung. Echte DiffSinger-/DDSP-Anbindung fehlt noch.
- Die Engines (ACE-Step, Matchering, Whisper, MuScriptor) sind eingebunden, aber noch nicht auf allen Hardware-Kombinationen erprobt.
- Eine LoRA pro Durchgang.
- MCP steuert nur Erzeugen und Analysieren, noch nicht das offene Projekt (Spuren, Noten, Transport).
- Die neuen Panels (Generator, Mastering, Karaoke, Engines, Updates) sind noch nicht in alle 9 Sprachen übersetzt.
- Der Installer ist nicht signiert (SmartScreen-Hinweis).
