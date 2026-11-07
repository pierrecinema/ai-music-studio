# AI Music Studio: Beta-Test

Danke, dass du testest! Das ist eine **Beta-Version**: Vieles funktioniert, aber nicht alles ist rund.
Deine Rückmeldungen entscheiden, was als Nächstes besser wird.

## Was du brauchst
- Windows 10 oder 11. Ein Computer mit NVIDIA-Karte ist am schnellsten; AMD, Intel und reine CPU-Rechner funktionieren langsamer
  (Einstellungen → Hardware zeigt, was dein Rechner schafft).
- Etwa 10 bis 20 GB freien Platz für die KI-Modelle.
- Beim ersten Start: **Einstellungen → AI Engines → Install selected**. Das lädt mehrere GB. Danach geht es offline.

## Bitte probiere das aus (jeweils kurz)
1. **Create music:** Beschreibe einen Song, drücke Create. Beobachte den Fortschritt. Ist der Track so lang wie eingegeben?
2. **Bibliothek:** Taucht der Song in der Bibliothek auf? Abspielen, Umbenennen, Favorit, „Add to project“.
3. **Zeitleiste:** Audiodateien hineinziehen. Clips verschieben, am Rand kürzen, mit **Ctrl+E** am Abspielkopf teilen, mit **Entf** löschen. Space spielt ab.
4. **Mixer:** Lautstärke, Pan, Mute (M) und Solo (S). Bewegen sich die Pegelanzeigen?
5. **MIDI:** „+ MIDI track“, Doppelklick auf die Spur, im Klaviatur-Editor Noten setzen (hörbar), verschieben, Länge ziehen.
6. **Speichern:** Ctrl+S, Programm schließen, wieder öffnen (File → Open). Ist alles da?
7. **Export:** File → Export audio. Passt die Datei zu dem, was du hörst?
8. **Rückgängig:** Ctrl+Z / Ctrl+Y nach verschiedenen Aktionen.
9. **Samples:** Library → Samples → eine Ableton-Bibliothek verwenden, ein Loop mit „Add synced“ in ein Projekt mit anderem Tempo legen. Passt der Rhythmus, klingt es sauber?
10. **Beat-Matching:** Ein Lied oder Loop importieren. Erscheint die Karte unten rechts, stimmt das gemessene Tempo (nach Gehör: nicht halb oder doppelt)? Klingt „Sync to“ sauber, passt „Set project to“?
11. **Raster und Quantize:** Clips mit Snap verschieben, dann mit Alt stufenlos. Ctrl+U auf einem MIDI-Clip mit krumm gesetzten Noten. Spuren am Griff umsortieren, mit Entf löschen und mit Ctrl+Z zurückholen.
12. **Aufnahme (Mikrofon):** Rote Taste. Wird die Aufnahme als Clip abgelegt? (Wenig getestet, besonders interessant.)

## So meldest du ein Problem
1. Unten rechts auf **Feedback** klicken.
2. Beschreiben, was du getan hast und was passiert ist.
3. **Copy report** drücken: Das kopiert deine Systemdaten, den Engine-Status und die letzten Log-Zeilen in die Zwischenablage. Es wird **nichts automatisch gesendet**.
4. **Open GitHub issues** drücken, „New issue“, den Bericht einfügen (Strg+V).

Falls das Programm abstürzt oder ein weißes Fenster zeigt: Beim nächsten Start bietet die App an, den automatisch gesicherten Stand
wiederherzustellen. Die Fehlerdatei findest du über Feedback → **Show error log**.

## Was bekannt ist
- Auf Rechnern ohne NVIDIA-Karte dauert KI-Musik lange (Minuten bis Stunden, je nach Modell). Der Fortschrittsbalken zeigt das echte Tempo.
- MusicGen macht nur Instrumentals, DiffRhythm braucht NVIDIA, Stimmen- und Instrumenten-KI sind teilweise noch Platzhalter.
- Aufnahme hat keine Latenzkorrektur; Audio wird beim Tempowechsel nicht gestreckt (es bleibt zeitlich an seiner Stelle).
- Der Installer ist nicht signiert: Windows SmartScreen kann warnen („Weitere Informationen“ → „Trotzdem ausführen“).
