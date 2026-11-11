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
3. **Studio** (früher Zeitleiste): Audiodateien hineinziehen. Clips verschieben, am Rand kürzen, mit **Ctrl+E** am Abspielkopf teilen, mit **Entf** löschen. Space spielt ab.
4. **Mixer:** Lautstärke, Pan, Mute (M) und Solo (S). Bewegen sich die Pegelanzeigen?
5. **MIDI:** „+ MIDI track“, Doppelklick auf die Spur, im Klaviatur-Editor Noten setzen (hörbar), verschieben, Länge ziehen.
6. **Speichern:** Ctrl+S, Programm schließen, wieder öffnen (File → Open). Ist alles da?
7. **Export:** File → Export audio. Passt die Datei zu dem, was du hörst?
8. **Rückgängig:** Ctrl+Z / Ctrl+Y nach verschiedenen Aktionen.
9. **Samples:** Library → Samples → eine Ableton-Bibliothek verwenden, ein Loop mit „Add synced“ in ein Projekt mit anderem Tempo legen. Passt der Rhythmus, klingt es sauber?
10. **Beat-Matching:** Ein Lied oder Loop importieren. Erscheint die Karte unten rechts, stimmt das gemessene Tempo (nach Gehör: nicht halb oder doppelt)? Klingt „Sync to“ sauber, passt „Set project to“?
11. **Raster und Quantize:** Clips mit Snap verschieben, dann mit Alt stufenlos. Ctrl+U auf einem MIDI-Clip mit krumm gesetzten Noten. Spuren am Griff umsortieren, mit Entf löschen und mit Ctrl+Z zurückholen.
12. **Auto Sync:** Oben „AUTO SYNC“ einschalten, Master-BPM auf z. B. 100 stellen, Loops mit anderem Tempo importieren. Werden sie ohne Rückfrage gestreckt? „Sync all“ auf einem Projekt mit mehreren Loops probieren.
13. **DJ-Sync:** Zwei Loops mit unterschiedlichem Tempo laden, AUTO SYNC einschalten. Liegen die weißen Beat-Linien beider Spuren untereinander? Hört man beim Abspielen keinen Kick, der „schleppt“? Tempo-Feld im Clip: Korrektur um 0,2 BPM, driftet es danach weniger?
14. **Aufnahme (Mikrofon):** Rote Taste. Wird die Aufnahme als Clip abgelegt? (Wenig getestet, besonders interessant.)
15. **Gesang:** In Create music mit ACE-Step einen Text unter *Lyrics* eingeben (gerne mit `[Verse]`/`[Chorus]`). Hört man im fertigen Song Gesang? Ist der Text verständlich? Bitte Modell, Sprache und Stimme im Bericht nennen.
16. **A cappella:** Den Schalter *A cappella (voice only)* einschalten und einen Text eingeben. Kommt eine reine Gesangsspur ohne Instrumente heraus?
17. **Studio wie Ableton/Cubase (neu in 0.13):** Loop im Lineal aufziehen (läuft der Übergang ohne Knackser?), Marker setzen und anspringen, Automation für die Lautstärke zeichnen, eine Return-Spur mit Hall anlegen und per Send nutzen, zwei Spuren gruppieren (Strg+G), im Loop mehrmals aufnehmen und einen Take auswählen, im Clip-Fenster einen Warp-Marker setzen und ziehen. Die Kürzel stellst du unter Einstellungen → Shortcuts auf Ableton oder Cubase.
18. **Bibliothek: auf Schlag 1 schneiden:** Einen älteren Song schneiden lassen, danach *Restore original*. Ist das Original wieder da?

## So meldest du ein Problem
1. Unten rechts auf **Feedback** klicken.
2. Beschreiben, was du getan hast und was passiert ist.
3. **Copy report** drücken: Das kopiert deine Systemdaten, den Engine-Status und die letzten Log-Zeilen in die Zwischenablage. Es wird **nichts automatisch gesendet**.
4. **Open GitHub issues** drücken, „New issue“, den Bericht einfügen (Strg+V).

**Detailliertes Log (sehr hilfreich):** Im Feedback-Fenster *Record a detailed log* einschalten, den Fehler noch einmal auslösen, dann *Copy log* oder *Save log as file…* und die Datei an das Issue hängen. Das Log enthält deine Klicks, Warnungen und Fehler der App und das Log des KI-Backends, aber kein Audio und keine Passwörter. Es bleibt an, bis du es wieder ausschaltest.

Falls das Programm abstürzt oder ein weißes Fenster zeigt: Beim nächsten Start bietet die App an, den automatisch gesicherten Stand
wiederherzustellen. Die Fehlerdatei findest du über Feedback → **Show error log**.

## Was bekannt ist
- Auf Rechnern ohne NVIDIA-Karte dauert KI-Musik lange (Minuten bis Stunden, je nach Modell). Der Fortschrittsbalken zeigt das echte Tempo.
- MusicGen macht nur Instrumentals, DiffRhythm braucht NVIDIA, Stimmen- und Instrumenten-KI sind teilweise noch Platzhalter.
- Aufnahme hat keine Latenzkorrektur. Bei Tempowechseln folgen nur synchronisierte Audio-Clips (mit eigenem Tempo) dem neuen Tempo, anderes Audio bleibt zeitlich an seiner Stelle.
- Gesang mit ACE-Step: Ohne Hinweis auf Gesang im Stil hat ACE-Step Texte oft instrumental gerendert. Seit 0.13 ergänzt die App dann automatisch „vocals“ und einen `[verse]`-Tag. Wenn trotzdem kein Gesang kommt, bitte melden (mit Log).
- Die Studio-Funktionen aus 0.13 (Loop, Automation, Returns, Gruppen, Takes, Warp-Marker) sind neu und bisher nur ohne echte Audio-Hardware-Last getestet.
- Der Installer ist nicht signiert: Windows SmartScreen kann warnen („Weitere Informationen“ → „Trotzdem ausführen“).
