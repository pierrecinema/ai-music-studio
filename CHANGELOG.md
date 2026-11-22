# Changelog

What changed in each version of AI Music Studio. The release workflow puts the section of the released version
on its GitHub release page, so every version needs a `## <version>` section here before it is released.

## 0.96.2

### New

- **The built-in voices have names** (Anna, Bella, Clara … Adam, Ben, Carlos …) instead of numbers.
- **Click a voice to hear it at once**: each voice sings a 16-second song line in its typical style (clear: pop, with vibrato: ballad, powerful: rock), with the style's effects. The demos are finished recordings in the app, so listening needs no computing; a second click stops it.

## 0.96.1

### Fixed

- **Installing the singer showed 0 % the whole time** and the AI backend went offline meanwhile. The installation now shows its four steps (Python environment, PyTorch, packages, singing model) with a real percentage from the downloads, and the AI backend keeps running while the singer installs; it restarts once at the end.

## 0.96.0

### New

- **Built-in voices: singing without importing anything.** In the Vocal Editor, *Built-in voices* sing your MIDI melody and lyrics note for note, with 39 voices from 20 singers (female and male), grouped as *clear* (pop), *with vibrato* (ballads, soul) and *powerful* (belt, good for rock). Each voice has a demo to listen to. The singing model (SoulX-Singer, Apache 2.0) is installed once with *Install the singer* (about 4 GB) and runs on the processor, faster with an NVIDIA graphics card.
- **Styles: Pop, Rock, Ballad, Soul** for every voice. Each style changes how the line is sung (rock: hard attacks, sliding up into the notes, short notes and a fall at the end of a phrase; ballad: lots of vibrato, legato; soul: turns and slides; pop: light vibrato) and puts matching effects on the new vocal track (rock: saturation, strong compressor, EQ; ballad: long reverb and delay; pop: compressor and reverb). The effects can be switched off.
- **Rap with a real flow**: the style *Rap* has the AI singer (ACE-Step 1.5) rap your lyrics in the song's tempo, with a male or female voice and punchy vocal effects. It follows the rhythm and the words, not every single note.
- The voices are short recordings from VocalSet (Wilkins et al. 2018, CC BY 4.0), named with each voice.

## 0.95.1

### New

- **Your singing becomes a MIDI melody**: in the Vocal Editor, *My singing (Studio clip) → MIDI* (or *A recording file → MIDI*) turns a recorded vocal line into a MIDI track, in the project tempo from where the clip starts. Put lyrics on it and press *Sing*, or edit it in the Piano Roll.

## 0.95.0

### New

- **Vocal Editor: your melody, sung.** A MIDI melody is sung with your lyrics, on a new track in the Studio, in time with the song.
  - **DiffSinger voices sing every note exactly** (pitch, timing, length) and in seconds on a CPU. Import a DiffSinger voicebank in the OpenUtau format (for example Nishiren or Tiger: English, German, Spanish …); the app downloads the vocoder it needs once. Voices with their own timing, pitch and expression models sing more naturally; simple ones get vibrato from the app.
  - **Lyrics on the notes with one click** for English, German and Spanish: each word on its note, further syllables held with `+` (pronunciation dictionaries and models from OpenUtau, MIT). Correct any syllable by hand; lyrics are saved with the project.
  - **AI singer (ACE-Step 1.5)**: sings your lyrics a cappella in the tempo, key and length of the melody, in many languages, without following every note.
- Voices are not included in the app: each belongs to its author, whose terms are shown with the voice.

## 0.94.1

### Fixed

- **Audio → MIDI stayed at 60 %**: the page no longer stacks status requests while the AI backend is busy, says so when the backend was restarted or does not answer for a minute (instead of waiting forever), and shows the seconds so far. The result is always sent as valid data, and every step is written to the log with its time.
- A conversion keeps running when you open another page, and the page follows it again when you come back.
- **Icons**: the Piano Roll has a keyboard 🎹, Audio → MIDI the note ♪.

## 0.94.0

### New

- **Audio → MIDI, a new page**: a whole song (for example one made by the music AI) becomes MIDI tracks you can edit and play with any instrument.
  - The song is split into vocals, bass, drums, piano, guitar and the rest, and each part is turned into notes with the method that suits it: one-voice lines for vocals and bass (no doubled or overtone notes), chords for piano, guitar and keys, and **drums as kick, snare and hi-hat hits** (new: drums could not be converted before).
  - **Tempo, the first bar, key and chords** are found in the song; the notes land on the bars and beats, with quantize and strength.
  - Before anything changes you see the tempo, key, chords and, for every part, the notes, how sure the detection is, a preview and the stem to listen to; choose the parts and the instrument of each.
  - Into the Studio with one click: the project tempo, the original song (muted, lined up to compare), a chord track and chord markers if you like.
  - Open it from the sidebar, with **→ MIDI** in the Library and on Create music results, with **All stems → MIDI** in the Stem Splitter, or for a clip selected in the Studio.
  - Measured: bass 0.66 → 0.77 (note F-measure), drums 0.69, tempo and first bar right in 6 of 6 test songs (details on the wiki page).
- **MCP**: `app_audio_to_midi` and `app_audio_to_midi_status` let AI agents do the same.

## 0.93.3

### Fixed

- **Export through MCP timed out** on longer songs with VST plugins: `app_export_audio` now mixes in the background and answers at once; the new `app_export_status` tells the agent when the file is ready.
- **The AI Chat started the slow music AI for a drummer**: it now makes band parts (drummer, bass player, guitarist) and Studio songs as MIDI in seconds, and uses the music AI only when you ask for an AI recording with vocals.

## 0.93.2

### Fixed

- **Text fields took no typing** (for example the style and lyrics on Create music) after a message box or a plugin window had been open: the app now gives the keyboard back to its page by itself.

## 0.93.1

### Fixed

- **A song started by an AI agent or the AI Chat now shows its progress in the app**: in the status bar at the bottom (percent and step, click it for the Create music page, ✕ cancels) and on the Create music page. The song lands in the Library.
- **AI agents pick the right tool for "write a song"**: the MCP server now tells them that a song for the Studio is made with the song generator (MIDI tracks, seconds), and that the music AI (an audio recording with vocals) is slow, often 10–30 minutes or more on a PC without NVIDIA graphics. The progress check gives them a short line (step, percent, time so far).

## 0.93.0

### New

- **AI agents can now do everything in the Studio over MCP**: 50 tools work on the project open in the app (Claude and other MCP clients, and the AI Chat in the app):
  - **Files**: new project, open, save, undo / redo, import audio or MIDI files, export the mix (WAV / MP3) and MIDI.
  - **Tracks**: add (MIDI, audio, vocal, group), copy, move, delete, group; name, color, volume, pan, mute, solo.
  - **Clips and notes**: read, write and replace notes; transpose, quantize, velocity, length; move, cut, repeat and delete clips; clip gain and fades.
  - **Sound**: instrument (VST or sound pack), MIDI effects, built-in effects and VST effects on tracks and the master with their settings, VST plugin parameters, open plugin windows, return tracks and sends, automation lanes (volume, pan, sends, effect settings).
  - **Song**: the song generator (genre, key, tempo, parts) and the band (drummer, bass player, guitarist) from the AI Instruments page, markers, loop, transport, tempo and time signature, pages of the app.
- **The AI Chat in the app uses the same tools**: ask it to build or change the song in the Studio.

### Fixed

- **Song generator**: a genre in its other key (for example a ballad in A minor) now plays the chords of that key (Am, C, Dm, E) instead of a mix of major and minor chords.

## 0.92.0

### New

- **More sound packs, all free, each installed with one click** in *Settings → Audio → Sound packs* (with download and disk size):
  - **Salamander Grand Piano**: a concert grand recorded at 4 velocities (22 MB, CC BY 3.0).
  - **VSCO-2 Orchestra**: violin section, cello section, French horn and trombone played by real musicians (about 330 MB download, CC0).
  - **MuseScore General**: every General MIDI instrument in a newer, fuller recording than GeneralUser GS (48 MB, MIT).
  - **GeneralUser GS** as before (28 MB).
- **The best installed pack plays each instrument by itself**: the grand piano from Salamander, strings and brass from VSCO-2, everything else from MuseScore General, then GeneralUser GS. The instrument list in the Studio shows which pack plays each instrument. The song generator, the band and existing projects use them at once.

## 0.91.0

### New

- **AI agents can work on the open project (MCP):** new tools for Claude and other MCP clients: add MIDI tracks, choose the instrument (a VST like Dexed or Surge XT, or a sound-pack instrument), put MIDI effects (BlueArp, Stochas …) in front of it, write notes, set volume / pan / mute / solo and the tempo, start and stop playback, list the plugins and read the project. They change the project shown in the app window. Set up once: `claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp` (see the wiki page MCP).
- Channel: a note when a MIDI plugin (BlueArp …) is chosen as the instrument: it makes no sound, a synthesizer belongs there and the MIDI plugin under MIDI effects.

## 0.90.1

### New

- Channel → MIDI effects shows while the song plays how many MIDI events went into the MIDI effects and how many came out to the instrument, and the song's tempo the plugins see. It shows at once where notes get lost (for example an arpeggiator whose pattern is still empty).
- *+ MIDI effect…* lists every plugin (MIDI plugins first): many MIDI plugins, BlueArp among them, call themselves instruments and were missing from the list.

## 0.90.0

### New

- **MIDI effects** (arpeggiators, sequencers, chord and pattern generators such as BlueArp, Stochas, CodeFN42 or HY plugins) work on MIDI tracks: *Channel → MIDI effects → + MIDI effect…*. They sit in front of the track's VST instrument: what they play is what the instrument plays, in the Studio, in the Piano Roll, from a MIDI keyboard and in the export. Several can be chained (▲ ▼ change the order), each can be bypassed (⏻) and opened in its own window; their settings are saved with the project.
- **Mixer with many tracks**: the track strips scroll sideways (a clearly visible scroll bar, and the mouse wheel over the strips scrolls left / right); the MASTER strip stays on the right. Before, the mixer was cut off and could not be scrolled.
- **Plugins follow the song's tempo and position**: instruments, effects and MIDI effects now get the tempo, the position in the song and whether it is playing. Arpeggiators and sequencers play in time, tempo-synced delays and LFOs lock to the song, tempo changes included.

## 0.86.0

### New

- **Russian** (Русский) as a new language: the whole app, in *Settings → General → Language*.

### Fixed

- Studio: long track names are readable. The name has the whole first row of the track header; the type and the M, S, FX, CH, A buttons moved to the row below (a full name also shows when you point at it).
- Studio: a clicked clip no longer shows through the track header. The header of the selected track was see-through, so clips scrolled under it looked as if they started on the header; now they always start right of it.
- Channel tab: when volume or pan has an automation lane, the slider follows the lane and cannot be moved; a note now says so (change the points in the lane, or delete the lane).

## 0.85.1

### Fixed

- Mixer: the pan knob also turns when dragged sideways (left / right), not only up and down; before, a sideways drag did nothing.
- Mixer: the channel strips are a little narrower, so more tracks fit side by side.

## 0.85.0

### New

- **The Mixer looks like a studio console**: dark blue-grey channel strips with a white-cap fader and a dB scale, two orange LED meters with a red / yellow / white scale, lit mute and solo keys, the fader value and the held peak in dB under each strip, and a black pan knob. The faders use the height there is (the Mixer as a panel under the Studio, or on its own). Fine moves with Shift, mouse wheel, double-click for 0 dB.

## 0.84.0

### New

- **Sound pack: real instruments.** Recorded grand piano, electric pianos, organ, acoustic and electric guitars, basses, seven drum kits (standard, room, power, electronic, 808/909, jazz, brushes), strings, choir, brass, saxophones, flutes and pads for every MIDI track. Install it once in *Settings → Audio → Sound pack* or on the *AI Instruments* page (GeneralUser GS by S. Christian Collins, about 28 MB, free for use in software). Without it the built-in synthesizer plays as before.
- MIDI tracks with a built-in sound (drums, bass, keys, guitar, lead) play the matching real instrument automatically. Any of about 50 instruments can be picked per track in *Channel → Instrument* (groups *Sound pack: Drums / Keys / Guitar and bass / Orchestra / Solo and synth*).
- **The song generator picks a band per genre**: funk with clavinet, slap bass and brass; jazz with alto sax, acoustic bass, piano and jazz kit; ballad with piano, strings and brushes; afro house with marimba, Rhodes and an electronic kit; rock and metal with overdrive and distortion guitars; and more.
- **A first mix**: each part gets a starting level (drums and bass in front, keys and guitar behind the melody) and a little room reverb that fits the instrument (none on the bass, more on strings and pads).

### Fixed

- A new song from the song generator starts at bar 1 instead of after the end of the project, where it was out of sight and the new tracks looked empty.
- The song generator page no longer crashes when every part (melody, keys, bass, drums, guitar) is switched off; *Create* is disabled then.

## 0.83.2

### Fixed

- **Generated songs no longer sound distorted.** The built-in sounds (drums, bass, keys, guitar, lead) are now prepared a few seconds ahead while the song plays, instead of all notes of the song at once. A song from the song generator has up to 5000 notes; preparing them all at the start overloaded the audio processing (measured: 10 s of song needed 83 s of computing), so everything crackled, including audio tracks playing at the same time. Now 10 s need about 1 s.
- Exporting a song with the built-in sounds is much faster for the same reason (a 3-minute generated song: about 30 s instead of over 20 minutes).

## 0.83.1

### Fixed

- **The graphics card shows in the status bar again** on PCs where Windows' hardware query (WMI) does not answer: the app now reads the card's name from the Windows registry first (instant), then asks PowerShell. Seen on an AMD Radeon R9 290, which showed as "none · CPU".
- The backend's status check no longer holds up other requests while the hardware is being checked.

## 0.83.0

- **AI Instruments redesigned after classic plugin front panels, each device in its own style:**
  - **Song Generator** like a light vocal plugin: silver front, a big tempo knob with a dark face and a cyan ring, the chorus melody as a curve, LED buttons in the lower strip.
  - **Drummer** like a dark synth: a green pattern display (crash, hats, percussion, toms, snare, kick) and operator panels (groove, feel, fills, part) with small knobs; the chords and the whole band sit in its top bar.
  - **Bass player** and **Guitarist** like light rack effects with an orange and a blue edge: black knurled knobs with their value in a white box, a dark side block with the name, a screen (notes) or a VU meter, and a silver intensity knob.
  - **Orchestra** like a navy multi-voice harmonizer: sections with title bars, an instrument browser in three columns, vertical faders for vibrato, dynamics, brightness and attack.
  - **Text Instrument** like the vocal plugin in dark: a big knob for "follow the notes".
- The previews change at once with the style and the knobs.

## 0.82.1

- **Fixed: the AI backend kept running after the app crashed or was ended hard** (for example while an update installed). Its AI workers (ACE-Step, MIDI-DDSP) went on using the processor and memory: playback in the Studio crackled and sounded distorted, the next start needed several tries ("Failed to fetch" in Hardware and the Library) and the graphics card or processor name was not found. The backend now ends itself and its workers when the app is gone, and a backend left over from an earlier run is ended when the app starts.
- **Fixed:** the status bar showed "none · CPU" instead of the graphics card (e.g. Radeon R9 290, Intel graphics on a laptop) when the PC was busy at the start; the card is now looked for again.
- **Lighter built-in sounds:** the guitars and the electric piano need about half the processor time, so songs from the song generator play smoothly on older PCs.
- **AI orchestra:** long parts are played phrase by phrase with progress after each phrase and an estimate of the time left (a long melody stood at 0 % for minutes and looked stuck).

## 0.82.0

- **Free plugins catalog** (Settings → Plugins): the 40 plugins of the LANDR list "Best Free VST Plugins (2026)": 15 effects (Valhalla Supermassive, TDR Nova, Deelay, …), 15 instruments (Surge XT, Dexed, Vital, TAL-NoiseMaker, TyrellN6, Spitfire LABS, BBC Symphony Orchestra Discover, …) and 10 MIDI plugins. Each shows whether it is installed. Open-source ones install with one click (Surge XT, Dexed, CHOW Kick, Stochas); for the others the maker's page opens (some ask for a free account), and *Search for plugins* then finds them. MIDI plugins are listed; playing their notes through an instrument comes in a later version.
- **Fixed:** installing PyTorch for NVIDIA cards failed on some PCs ("Installing 'torch' failed", reported with a GTX 1080). The app now picks the CUDA build that fits the card (CUDA 12.6 for GTX 9xx to RTX 40xx, 12.8 for RTX 50xx), tries the next one if it fails, and falls back to the processor build instead of stopping.

## 0.81.0

- **MIDI song generator** (AI Instruments): a whole song as MIDI from a genre (pop, rock, ballad, house, tech house, afro house, trap / rap, funk, reggaeton, jazz, reggae, metal), a key, major or minor and a tempo. It writes the chords of each part (intro, verse, pre-chorus, chorus, bridge or drop, outro) from typical progressions of the genre, a melody that follows them (higher in the chorus), and lets the band play keys, bass, drums and guitar, louder in the chorus. Each part becomes a MIDI track; markers name the parts; *Take* makes another version.
- **AI Instruments look like studio devices:** rotary knobs, LCD displays for styles, lit pads for the orchestra instruments, the page uses the whole width when the AI assistant is closed. The fields to type chords and the instrument for the text instrument are marked "type here".
- **Fixed:** installing the AI Instruments (MIDI-DDSP) failed on Windows with "No module named 'resource'" (a Unix module that tensorflow-datasets loads); press *Install selected* again.
- **Fixed:** ACE-Step 1.5 with several takes ran out of memory on a PC with 12 GB RAM after three of four takes ("not enough memory"). The memory is now given back after each take, and if it still runs out, the finished takes are kept and ACE-Step starts again for the rest.

## 0.80.0

**AI Instruments** (menu 🎻 AI Instruments, until now "coming soon"):

- **Virtual band:** a **drummer** (rock, pop, hip-hop, trap, house, tech house, afro house, funk, reggaeton, drum & bass, ballad, jazz, bossa nova, metal, disco; intensity, feel, swing, fills), a **bass player** (10 styles: long notes, rock eighths, root and fifth, octaves, walking bass, funk, house, 808, reggae, afro) and a **guitarist** (strumming, ballad, fingerpicking, power chords, funk, reggae, afro, jazz; clean or distorted). They follow the chords of your song, read from its MIDI tracks bar by bar or typed in (`Am F C G`, `C | G Am | F -`), and each becomes a MIDI track you can edit. *Take* plays the part a little differently; *Add the whole band* adds all three. Works on every PC, nothing to install.
- **AI orchestra (MIDI-DDSP by Google Magenta):** a MIDI track played like a real musician on violin, viola, cello, double bass, flute, oboe, clarinet, saxophone, bassoon, trumpet, French horn, trombone or tuba, with vibrato, dynamics, brightness and attack controls; chords are spread over several players. Runs on the processor. Install once in Settings → AI Engines → *AI Instruments (MIDI-DDSP)* (about 1.5 GB, Python 3.10 or 3.11). The result is an audio track in the Studio and in the Library.
- **Any instrument by text (ACE-Step cover):** describe an instrument or style and ACE-Step plays your MIDI track in it, with *Follow the notes* from free to close. Needs ACE-Step; fast with an NVIDIA card.
- **New built-in sounds** for MIDI tracks (Channel → Instrument): General MIDI drum kit, clean and distorted guitar, electric piano, 808 bass, besides the synths.
- **Channel → 🎻 AI instrument…** opens the AI Instruments page with the track chosen.

## 0.73.3

- **Automated effect knobs move:** when a built-in effect (EQ, compressor, filter, delay, reverb) has an automation lane, its knobs in the effect rack and its sliders in the effects lane now follow the lane while the song plays (and show the lane's value at the playhead). Before, only the sound followed it.

## 0.73.2

- **VST instruments in *+ Effect…* on MIDI tracks:** the effect list of a MIDI track (effects lane, Channel panel, effect rack) now lists the VST instruments (Dexed, Surge XT …) at the top. Picking one makes it the instrument that plays the track's notes, as in *Channel → Instrument*.
- **CH button on every track** (next to FX): opens the Channel panel of that track, with the instrument (VST instruments such as Dexed), the effects and the sends. It turns green when the track plays a VST instrument.

## 0.73.1

- **Dexed missing from the instrument selector:** some plugins (newer Dexed builds, for one) do not mark themselves as instruments, so the selector left them out although Settings → Plugins listed them. An instrument is now also recognised by its category, by having no audio input, or as a known synth. Any other plugin can be tried as an instrument too (*Other plugins* in the selector), and Settings → Plugins shows the type the app uses.

## 0.73.0

- **Automation of the built-in effects:** *Automate…* next to EQ (low, mid, high), compressor (threshold, ratio, attack, release, gain), filter (frequency, resonance), delay and reverb (mix), in the effects lane and the effect rack. The lane opens under the track; playback and export follow it.
- **Automate… showed only the search box:** the list of parameters was cut off by the effects lane and the effect rack; it now floats over everything (also in the selector of an automation lane).
- **VST instruments that disappeared:** a new plugin search no longer drops a plugin that worked before but did not answer this time (it stays in the list), and the folder of the free instruments (Dexed, Surge XT) is always searched. The instrument selector also shows instruments that are switched off in Settings → Plugins.

## 0.72.1

- **Automate… next to every plugin** (effects lane, effect rack, Channel → Instrument): choose a knob of the plugin and its automation lane opens under the track, ready to draw. Before, the parameter was only in the selector of an automation lane.
- **Presets** stand out more (★ Presets…).
- **Launchpads:** recognised by their short Windows port names (LPX MIDI, LPMiniMK3 MIDI, LPProMK3 MIDI); older models now work too: Launchpad MK2, Launchpad Pro (MK2), and the original Launchpad, S and Mini MK1/MK2.

## 0.72.0

- **Settings → MIDI:** every connected MIDI device (keyboards, pad controllers, Launchpads) is listed as soon as it is plugged in. Per device, like in Ableton: **Notes** (keys and pads play the selected track and are recorded) and **Control** (knobs, faders and buttons drive the app).
- **Known devices with a ready mapping:** Akai MPK Mini (MK3, Play, Plus, MK2), Arturia MiniLab 3 / MK II, KeyStep, Novation Launchkey and Launchkey Mini. On the MPK Mini, K1 is the volume and K2 the pan of the selected track, K3–K8 turn the first knobs of its effect or instrument (built-in or VST).
- **MIDI Learn:** *Learn* next to a function (play, stop, record, loop, metronome, markers, volume, pan, mute, solo, send, plugin knobs 1–8, previous / next track, master volume, tempo), then move a control on the device. Saved per device; *Reset mapping* goes back to the known one.
- **Launchpad (X, Mini MK3, Pro MK3):** the grid drives the Studio and lights up: top row jumps to markers 1–8, the rows below are tracks 1–7 with mute, solo, select and volume in five steps.

## 0.71.0

- **Automation of plugin parameters:** in an automation lane of a track (**A**), the selector now offers *Plugin parameter → <plugin>: choose a parameter…*: pick any parameter of a VST effect or instrument on the track (search box), then draw its curve like volume or pan. Playback and export follow it to the sample (the plugin host cuts its blocks at each change).
- **Presets for plugins:** *Presets…* next to *Open* (effects lane, effect rack, Channel → Instrument): *Save current settings…* under a name, load them again in any project, delete them. They are kept per plugin in the app's data folder.
- **Plugin windows:** a minimised plugin window comes back when you press *Open* again.

## 0.70.2

- **Narrow windows:** the Studio no longer pushes the effect rack (Hardware rack look) and the AI panel out of the window; its toolbar wraps instead. The fold key › of the effect rack is now at its left, always in view.
- **Piano Roll:** the *Velocity* field (German: *Anschlag*) is wider and sits next to its label.

## 0.70.1

- **Projects:** effects on the master were lost when a project was opened again, and so were markers, the loop range, tempo and time-signature changes and return tracks. Everything in the project file is now opened again.
- **Piano Roll:** with the draw tool (crosshair) a drag on empty space draws a frame that selects several notes; a click still places a note. *Velocity* and *Length* are always in the toolbar (greyed out until notes are selected), and the toolbar wraps on narrow windows. The velocity lane is taller with a readable label.
- **Hardware rack look:** the effect rack at the right can be folded to a narrow strip (› at its top, click the strip to open it again).
- **Swiss look:** the tempo is fully visible.
- **Looks:** the Analog console look was removed; who used it gets Dark. Four looks remain: Dark, Light, Swiss and Hardware rack.

## 0.70.0

- **Effects on the master:** built-in effects and VST plugins on the master of the Studio, after all tracks and return tracks. *Master FX* in the Studio toolbar and at the bottom of the Mixer. Saved with the project and in the export; plugin delay is made up for.
- **MIDI files (.mid):** drop a .mid file into the Studio, or use *Import audio…* / *Import .mid…* in the Piano Roll. Every track (and channel) of the file becomes a MIDI track; in an empty project the file's tempo is taken. Export a MIDI clip with right-click → *Export as MIDI file (.mid)…* or *Export .mid* in the Piano Roll.
- **Piano Roll:** a velocity lane under the notes (drag a bar up or down; selected notes move together), and *Velocity* and *Length* fields for the selected notes.
- **Fades and volume right on the clip:** audio clips have a square at each top corner for the fade in and out (drag inwards) and a line for the clip volume (drag up or down). Double-click resets.
- **Analog console look:** a mixing desk along the bottom of the Studio and Piano Roll with VU needles, pan knobs, faders and mute / solo for every track and the master; serif type for titles and track names.
- **Swiss look:** big title, position and tempo numbers, transport as big black blocks, track names large in capitals, marker labels readable.
- **Menu icons:** Library in the same colour as the other menu icons; the Create music star in the colour of the AI assistant key.

## 0.60.5

- **Light and Swiss looks:** clip names in the Studio are now dark and readable; before they were white on the light clip colours.
- **New screenshots** on the GitHub page: Studio, Piano Roll, Mixer, Mastering and Settings in the Hardware rack look, and the same Studio project in all five looks.

## 0.60.4

- **ASIO: no sound.** The app stopped the plugin host when no plugin was in use, and with it the opened ASIO device; the Studio then started a new host without the device and stayed silent while Settings still showed it open. The host now keeps running while ASIO is chosen, and if it has to start again the device is reopened and the sound reconnected by itself.

## 0.60.3

- **VST instruments:** the first note no longer waits until every plugin of the project is loaded (with big plugins that took up to a minute, and again after switching the audio driver): only the instrument is loaded, and it is made ready as soon as it is chosen.
- **ASIO:** on a PC without an ASIO driver the app now says so ("No ASIO driver is installed…") instead of "the device could not be opened", and points to ASIO4ALL / FlexASIO.

## 0.60.2

- **VST instruments:** right after choosing an instrument, the notes of the Piano Roll sometimes stayed silent until it was switched off and on: opening its window and the first note each loaded their own copy of the plugin, and the notes went to the copy nobody heard. Now only one copy is loaded, and the notes always go to it.
- **ASIO:** after the **ASIO control panel** the device is no longer opened a second time (with ASIO4ALL that failed with "could not be opened"); the driver's changed settings are just read. Closing the device (back to *Windows*) releases the ASIO driver fully, so the Windows sound works again without restarting the app.

## 0.60.1

- **Hardware rack look:** the menu is back at the side (as rack keys), which leaves more room for the pages; the effect rack at the right only shows in the Studio, Piano Roll and Mixer.

## 0.60.0

- **VST instruments on MIDI tracks:** a MIDI track can now be played by an instrument plugin (VST3 / VST2, 64- and 32-bit) instead of the built-in synth: *Channel → Instrument*. The plugin plays the notes of the clips, the notes you play in the Piano Roll and on a MIDI keyboard (held keys sound until you let go), MIDI recordings, and the export. **Open** shows the plugin's window; its settings are saved with the project.
- **Free instruments:** *Settings → Plugins → Free instruments* installs **Dexed** (FM synth like the DX7) and **Surge XT** (big all-round synth), both open source (GPL-3), with one click from their official releases.
- **ASIO:** *Settings → Audio → Driver type* now has **ASIO / other drivers**: the sound of the Studio and Mastering plays through the plugin host on an ASIO device (or Windows Audio, DirectSound), with the device's sample rates and buffer sizes, the outputs to use and the **ASIO control panel**. For the sound of the mainboard, install ASIO4ALL or FlexASIO.
- **Hardware rack look, rebuilt:** a wide green LCD for position and tempo, the menu as rack keys, the selected track's effects as rack modules with knobs and lamps at the right, and the Studio framed like a device screen.
- With plugins, the first notes and clips at the start of the song are no longer late (live and in the export).
- **Mastering:** the three meters next to the master gain fader no longer shift sideways while a song plays.

## 0.51.7

- **Own shortcuts with Ctrl+Alt (again):** with Ctrl+Alt held, Windows does not always send the letter of the key (it depends on the keyboard layout), so a key like Ctrl+Alt+K could be set but did nothing. The letter or digit is now taken from the key itself, the same on every keyboard layout. Ctrl+Alt keys are written to the diagnostics log, so a key that still does nothing can be traced.

## 0.51.6

- **Studio groups:** the second double-click now really brings a large group back to its normal height (the view no longer scrolls away under the mouse after the first one). A new **⇕** button in the group's header does the same.
- **Own shortcuts with Ctrl+Alt:** Windows reports Ctrl+Alt as AltGr, so keys like Ctrl+Alt+K could not be set or used. They work now; AltGr characters (@, €, …) are still left to typing.

## 0.51.5

- **Studio groups:** a double-click on a group now makes the group's own row large, with every stem in it shown with a big waveform, instead of opening the tracks below it; another double-click brings it back to the normal height.
- **Your own shortcuts:** *Settings → Shortcuts* has a new column **Yours**: press **+ Key** next to an action and then the keys. Only free keys are accepted (a taken key shows which action uses it); they work in addition to the Ableton or Cubase layout and are kept.

## 0.51.4

- **Three new looks** in *Settings → Appearance*, next to Dark and Light. They change more than the colours:
  - **Analog console:** warm wood at the sides, amber and brown, round transport keys and a glowing amber position display.
  - **Swiss:** white and black, heavy type, no rounded corners, orange as the only colour, and the menu as a bar along the bottom of the window.
  - **Hardware rack:** grey device fronts with screws, a green LCD for position and tempo, keys with a light, amber.
- The waveform, spectrum and EQ curve in Mastering, the mastering knobs and the highlights all over the app take the colour of the chosen look.

## 0.51.3

- **Mastering: round knobs.** Every control of the chain (EQ, compressor, multiband, dynamic EQ, saturation, stereo) and of the loudness limiter is now a round knob with a ring of lights, like on a mastering unit, instead of a slider. Drag up or down to turn it (hold **Shift** for fine steps), or use the mouse wheel or the arrow keys; a **double-click** sets it back to its starting value.
- **Studio groups:** a double-click on a group (on a bar or anywhere on its lane) opens it and makes all its tracks twice as high, with big waveforms; another double-click brings them back to the normal height.

## 0.51.2

- **Studio groups:** a group is now as high as its tracks need, and every bar in it shows the track's name and its waveform, so the stems are easy to tell apart even with the group closed.
- **Mastering:** the plugin menu sits on the left, in front of **+ Add…**, with a **VST** label.

## 0.51.1

- **Mastering:** the VST plugins have their own menu **+ VST plugin…** next to **+ Add…**, so they are easy to find.
- **Studio groups:** the bars of a group fill its lane (one row per track), and a double-click anywhere on the group's lane opens it with every track at normal height and its waveform, then scrolls them into view.

## 0.51.0

- **VST plugins in Mastering:** **+ Add…** in the mastering chain now lists your VST plugins (VST3 / VST2, 64- and 32-bit) next to the built-in modules. The plugin sits anywhere in the chain, its window opens with **Open the plugin window**, ⏻ switches it on and off (the timing stays the same), and its settings are kept with the song and used in the export.
- **Stem Splitter → Studio:** **All stems into the Studio** puts every stem on its own track in the Studio, in one group, with the levels and mutes of the stem mixer; **→ Studio** on a stem puts only that one.
- **Studio groups:** a group shows the clips of its tracks as bars; double-click a bar and the group opens and shows that track with its waveform.
- Exports with plugins use the plugins' current settings, also ones not saved yet.
- **Settings → Audio, new:** laid out like the audio preferences of other DAWs: **audio output device** (used everywhere in the app) and **audio input device** for recording, **sample rate** of playback, **buffer size** with the real input, output and overall latency, **driver error compensation** for recordings, a **test tone** (on / off, volume, frequency) to check the right card plays, and a **simulated CPU load** to find a buffer that does not crackle. ASIO follows in 0.61.

## 0.50.1

- **Effects in the channel tab:** the *Channel* panel on the right of the Studio now lists the effects of the selected track (built-in and VST plugins) with on / off, **Open** for a plugin's window, the order and remove, and **+ Effect…** to add one. Before, effects were only reachable through the small **FX** button on the track.
- A plugin window that is opened again is built fresh, and pressing **Open** while a project's plugins are still loading no longer loads the plugin a second time.

## 0.50.0

- **VST plugins:** your own VST3 and VST2 effects in the Studio. *Settings → Plugins* searches your plugin folders (by itself on the first start, afterwards when you press **Search for plugins**), lists every plugin with vendor, type and format, and a tick decides which ones appear in the app. In the Studio, **+ Effect…** on a track lists them under the built-in effects; adding one opens the plugin's own window, **Open** opens it again. Plugin settings are saved with the project, and the export (WAV / MP3) includes the plugins.
- Plugins run in their own small program (the plugin host). If a plugin crashes, the app keeps running and loads it again with its last saved settings. The host only runs while a plugin is in use.
- Tracks with plugins stay in time with the others (the plugins' delay is made up for).
- **64-bit and 32-bit plugins:** a 32-bit plugin runs in its own 32-bit plugin host (the app finds out by itself which one a plugin needs). The search also covers the usual folders under *Program Files (x86)*, and **Add folder…** adds your own. Plugins on the master and in Mastering, and instrument plugins on MIDI tracks, come in the next versions.
- The small **✦ AI** tab at the right edge of the window is gone: the **✦ AI assistant** button in the top bar opens the AI panel. The top bar shows the default project name in your language.

## 0.40.1

- **AI Music Studio is no longer labelled beta:** the welcome window, the Feedback dialog, the release notes and the documentation no longer call it a test version. Feedback stays as welcome as before (Feedback button at the bottom right).

## 0.40.0

- **The app speaks your language:** every screen is now translated: Studio, Mastering, Library, Create music, Stem Splitter, Settings, the dialogs and the messages. Fully translated: **German, French, Spanish, Italian, Portuguese and Chinese** (Settings → General → Language). Japanese and Korean show the menu in their language and the rest in English for now.
- **Save before closing:** closing the app with unsaved changes asks whether to save the project first (Save / Don't save / Cancel). Without changes the app closes as before.
- **Library:** with the AI assistant closed the list uses the whole width, and every song shows its full name (the buttons moved to their own row).
- **Update messages** in the app are now English like the rest of the app (and translated with it); before they were always German.

## 0.31.6

- **Mastering waveform: move through the song with the mouse,** like in the Studio: drag the white play line (its ▼ grip) or along the time ruler to go back and forth, also while the song plays; a click still jumps there and dragging elsewhere marks a region. Zoomed in, the wheel scrolls and the view follows the play position.
- **Fix: the empty room after the end of the song was not shown** (the waveform was stretched over the whole width), so zooming out showed nothing new. Now the end of the song is followed by empty room.

## 0.31.5

- **Fix: the "✦ AI assistant" button in the top bar could not be clicked** in the installed app (the top bar is the area for moving the window). It works now, sits further left, and a **✦ AI** tab at the right edge opens the panel as well.
- **Mastering waveform:** zoom out further than the whole song (more empty room after the end), **⤢** for the whole song; Ctrl + wheel no longer scrolls the page at the same time.

## 0.31.4

- **AI assistant button at the top:** with the AI panel closed, a **✦ AI assistant** button at the top right opens it again (instead of the small tab at the side).
- **Mastering, new order on the right:** goniometer and spectrum, loudness over time, whole song, live meters, and the master gain fader at the bottom.

## 0.31.3

- **Mastering layout:** with the AI panel closed, the master fader and all meters move to the right edge of the window, in their own column that is always in view (no scrolling down to see them). With the AI panel open the layout stays as before. The app remembers whether the AI panel is open.

## 0.31.2

- **Master gain fader:** a big fader like on a mixing desk makes the master louder or quieter, through the limiter (no clipping), with live true peak, loudness and limiter meters next to it.
- **Assistant easier to use:** every proposal has its own **Apply** button; **✓ Apply all ticked** and **↶ Undo** are at the top. After applying, the bars show the **master** (the original as a grey outline), so you see what changed. **Analyse the master again** makes a second round on the master; its EQ proposals add to the settings.
- **Edit bar in German** (with the app in German); the volume change is now a clear "Volume … dB · Apply".
- **Waveform:** the view reaches a little past the end of the song, so the end is easy to see and to mark; the zoom stays after an edit.

## 0.31.1

- **Mastering assistant in your language:** its proposals, bands and buttons are in German when the app is set to German.
- **You see what the assistant changed:** after *Apply* a green box lists what was applied, the app switches to "After" so you hear the result, and it shows when the loudness target is being set. It says what the song is compared with; a new style or reference song measures again at once.
- **Fix: after a cut the waveform disappeared for a few seconds;** it now stays while the song is measured again.
- **The edit bar shows the song's values** (length, loudness, peak, RMS) and the last step, so you see what Gain, Normalise or Trim did.

## 0.31.0

**Mastering: assistant, cutting and new effects.**

- **✨ Analyse & suggest:** measures tone balance (eight bands), dynamics, stereo, clipping and silence, compares the song with a style (Techno / House, Afro House, Trance / EDM, Pop, Hip-hop, Rock, Soul / R&B, Funk, Acoustic, Podcast) or with a reference song, and proposes settings for the chain, each with its reason. Tick what you want, *Apply*, and the loudness target is reached; *Undo* brings the chain back. Runs on your PC in seconds, no internet.
- **Cut and edit:** mark a region in the waveform, then **Cut**, **Copy**, **Paste**, **Delete**, **Crop**, **Silence**, **Fade in / out** (S-curve, linear, logarithmic), **Gain**, **Normalise** (peak or LUFS), **Trim silence**, **DC offset**; Ctrl+X / C / V, Del, Ctrl+Z / Y; markers with names. The original file is never changed: the steps are applied on export.
- **New effects in the chain:** **Dynamic EQ** (turns a frequency down only while it is too loud) and **Saturation / exciter** (warmth and air).
- **Mastering effects in the Studio:** dynamic EQ, saturation, stereo / mono bass and the true-peak limiter can be added to any track (FX → + Effect…).
- Each song keeps its own chain; stems open in Mastering from the Stem Splitter.
- **New project asks for its name.**

## 0.30.9

- **ACE-Step 1.5 says whether it downloads or only loads its model.** The model (about 10 GB) is downloaded only once and kept; every song then loads it from the disk, which takes a minute or two. The progress text used to say "the first time it downloads the model" on every song, which looked like a new download each time. Now it says "Loading … from the disk (already downloaded)", or, if a part of the model is really missing, "Downloading … missing: <part>" (also in the backend log).

## 0.30.8

- **Fix: ACE-Step 1.5 LoRAs from 0.30.6 failed to load** ("module name can't contain '.'"): the adapter now gets a fixed name.
- **Fix: "not enough memory" with a LoRA on PCs with 12–16 GB:** before loading a LoRA, ACE-Step kept a full copy of the model (several GB) so the LoRA could be removed again later. The app makes each song in its own run and never removes a LoRA, so this copy is no longer made.

## 0.30.7

- **Finished songs go to the Stem Splitter with one click:** next to *Add to project* and *Mastering*, the results in Create music and every song in the Library now have a **Stem Splitter** button. The song opens there with its name, ready to split.

## 0.30.6

- **Fix: ACE-Step 1.5 LoRAs from Hugging Face were left out** ("not an ACE-Step 1.5 LoRA (no adapter_config.json)"). The app's Hugging Face download saved only the weights of such a LoRA, not the small `adapter_config.json` that ACE-Step 1.5 needs. New downloads keep both in one folder; LoRAs downloaded before are recognised by their weights, and the first time one is used the app fetches its `adapter_config.json` from Hugging Face (or writes one from the weights if that is not possible).

## 0.30.5

- **Removed: the built-in retro music player** (Ctrl+M and the button in the bottom bar). It had nothing to do with making music; the app is a little smaller, and Ctrl+M is free.

## 0.30.4

- **Fix: long songs with ACE-Step 1.5 stopped after 10 minutes** ("Music generation timed out after 600 seconds … GPU ran out of VRAM"). ACE-Step has its own 10-minute limit per song, which a processor reaches with songs of about 2 minutes and more. The app now allows 6 hours; *Cancel* still stops a song at any time.

## 0.30.3

- **Mastering, Before / After also switches the controls:** in "Before" every control of the chain jumps to its starting value (read-only, grey) and the EQ curve goes flat; in "After" your settings come back and every control you moved is marked purple with a dot. So you see at a glance what you changed.

## 0.30.2

- **Mastering, Before / After shows the side you hear:** the waveform, the numbers (large and bright), the spectrum and the loudness curve switch to the original or the master, so you see what the chain changed.
- **"Same loudness" can be switched off:** with it on (default) the louder side is turned down while comparing, so you judge only the sound; off, you hear how much louder the master really is.
- **Fix:** for the comparison the original was turned *up* and could distort; now the louder side is turned down instead. The live meters always show the real level.

## 0.30.1

- **Fix: in the Studio the "Drag a clip here for a new track" area covered the first return track** (e.g. Reverb). It now sits between the last track and the return tracks.
- **Mastering:** the equalizer's controls are grouped per filter (low and high cut, low shelf, each band, high shelf), so frequency, gain and width of a band stay together.
- The screenshots on the project page show the current version.

## 0.30.0

**Mastering, rebuilt.** The Mastering page is now a full mastering workspace:

- **Open a song** by dragging it in from the Explorer, with *Open…*, or with one click from the Library, Create music
  and the Studio (*File → Send song to Mastering*). Several songs as tabs, recent files.
- **Listen and compare:** play, click in the waveform to jump, drag to loop a region, zoom. **A/B** switches between
  the master and the original, played at the same loudness so you judge the sound, not the volume.
- **Built-in chain:** equalizer (with its curve over the live spectrum), compressor, three-band multiband compressor,
  stereo width and mono bass, and a **true-peak limiter** (4x oversampled, look-ahead) with a **Louder** control.
  Slots can be switched off, moved, added and removed; built-in and your own presets.
- **Loudness targets:** Streaming −14, Apple −16, Loud −9, Broadcast −23, Podcast −16 LUFS: *Reach* sets the song to it.
- **Meters, before → after:** integrated loudness (ITU-R BS.1770 / EBU R128), true peak, sample peak, loudness range,
  RMS, crest factor, clipping; live momentary / short-term loudness, true peak, gain reduction, stereo correlation,
  goniometer, spectrum and loudness over time.
- **Export:** WAV, AIFF, FLAC, ALAC, MP3, AAC, OGG and Opus, several at once; 44.1 to 96 kHz, 16 / 24 / 32-bit with
  dither; title, artist, album, year, ISRC, comment and cover picture; presets for streaming, CD, Bandcamp, hi-res,
  YouTube and more. What you hear while playing is exactly what is written to the file.
- The reference match (Matchering) is still there and opens its result as a new tab.

## 0.20.7

- **Voice previews take about half the time:** *Preview voices* now makes three takes of 10 seconds (before 20) with your first two lines. On the processor most of the time goes into turning each take into audio (the bar stands at 80 %), and that time halves with the length.

## 0.20.6

- **Fix: Ctrl+R did nothing in the installed app** (Record in the Ableton and Cubase layouts; Ctrl+Shift+R, Export in the Ableton layout, too). A helper meant to stop the page from reloading swallowed the keys before the app saw them; it is now only used during development.

## 0.20.5

- **Create music: the newest song on top.** When a run makes several songs or versions, the newest is now shown at the top of the results and the first at the bottom (each keeps its take number).

## 0.20.4

- **Voice previews: the voice alone, and faster.** *Preview voices* now makes three takes of the voice without music (a cappella), all singing your first lines, so the voices are easy to compare (before, a take could be only an instrumental intro). ACE-Step 1.5 loads the model once for all three takes instead of once per take; the same goes for several songs made in one run.
- **Fix: LoRAs greyed out with ACE-Step 1.5 turbo.** The Create page now asks the backend which model a LoRA fits, with the same check used to load it (PEFT folders, LoKr files, packs); only LoRAs made for ACE-Step v1 or the XL model are greyed out.
- **Fix: Ctrl+R records MIDI** also when a MIDI clip is selected or the Piano Roll was clicked last (before, it could start a microphone recording instead).

## 0.20.3

- **Fix: the AI chat with Gemini stopped with "Error code: 400" when it made a song.** Gemini 3 attaches a signature to every tool call and needs it back in the next step; the app dropped it. The tool call now goes back exactly as Gemini sent it. If a song has already started when an error comes, the chat still shows it with its progress, and errors show the provider's own reason instead of only the code.

## 0.20.2

- **Updates:** new versions are published by themselves as soon as they are ready. The app looks for one when it starts and then once a day (before: every 4 hours), so testers are not asked too often; Settings → Updates → *Check for updates* finds a new version at once.

## 0.20.1

- **The AI chat can use the app:** with every provider (Claude, ChatGPT, Gemini, Grok, Ollama and local servers that support tools) the assistant can now **make a song itself** ("make me an afro house track with female vocals"), check how far it is, list LoRAs, split stems, master a track, suggest chords and read the system info: the same tools the app offers over MCP. A song it starts shows its progress in the chat and, when ready, can go to the Studio with one click; it is saved in the Library. It uses the music model chosen in Create music.
- **Gemini 3.5:** the model list now offers Gemini 3.5 Flash and Pro; the older models Google switched off are replaced on start. **Fix:** the Gemini key and the local server address were not saved and were gone after a restart.
- **Fix: exports at 44.1 kHz.** ACE-Step 1.5 makes songs at 48 kHz, and *Export…* in the Library and the Stem Splitter kept that rate, so a platform rejected the file. Exports now use the rate from **Settings → Audio** (44.1 kHz unless changed; the setting did nothing before), converted in high quality; the export dialog shows the rate and can keep the file's own. File → Export audio uses the same setting.

## 0.20.0

- **Studio: automation in its own lanes.** The A button (or right-click → Show automation) opens **volume and pan as two lanes** below the track; each lane can be made small (▸ / ▾), switched to another value or closed, and more lanes (sends) can be added with +.
- **Studio: effects in every track (FX).** The FX button opens an effects lane: **EQ, compressor, delay, reverb, filter**, each with its settings, on / bypass and order. They are heard in playback and in the export. VST3 plugins will appear in the same place later.
- **Track colour:** right-click a track header (or click the colour strip at its left) and pick a colour.
- **MIDI recording:** the record button, **Ctrl+R** and the new **● Rec** in the Piano Roll record MIDI when a MIDI track is selected or the Piano Roll is open. What you play on the Piano Roll's keyboard or on a **MIDI keyboard** appears as notes right away, as long as you held the keys.
- **Create music – lyrics:** buttons insert **[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro]** at the cursor; **Auto structure** turns stanzas into verses and choruses (a stanza that comes back is the chorus); lyrics without sections are structured automatically.
- **Create music – preview voices:** three short takes of your first lines with different voices (ACE-Step); **Use this voice** makes the whole song with that voice (its seed). Previews are not saved in the Library.
- **Create music – LoRAs per model:** the LoRA list shows the LoRAs that fit the chosen model; the others are greyed out with the reason (made for XL, made for ACE-Step v1).
- **AI chat: Google Gemini** (with your own key, free tier) and **Local server** (LM Studio, KoboldCpp, llama.cpp; on older AMD cards through Vulkan).
- **Top bar:** the position display shows bar . beat . sixteenth (1.1.1 = the start) and switches to minutes:seconds with a click. **Channel tab:** pan shows L / R and "Center".

## 0.18.13

- **ACE-Step 1.5 songs end where the music ends:** the end is now found relative to the song's own loudness (quiet reverb tails and hiss no longer leave about a second of "nothing"), and a song that already dies away is no longer faded out a second time; only a song that stops abruptly is faded.

## 0.18.12

- **LoRAs work with ACE-Step 1.5 turbo:** a LoRA made for ACE-Step 1.5 (a folder with adapter_config.json, or a LoKr file) is now loaded with its strength. Packs with several LoRAs in one folder (like "...-5-LoRAs") show each LoRA on its own. LoRAs for the larger XL model ("xl" in the name) and LoRAs of ACE-Step v1 do not fit the 2B turbo model: they are left out with a note, and a LoRA that fails to load never stops the song. One LoRA per song (the strongest).

## 0.18.11

- **ACE-Step 1.5: no empty bar at the end:** when the model ends the song by itself before the length asked for, the extra seconds were silence. The silence at the end is now cut (a quarter second of the decay is kept) before the fade-out. The backend log also shows what the model got (style, number of lyric lines, language), to find out why a song came without vocals.
- **Changing the tempo while the song plays keeps it playing:** pressing Enter in the BPM field stopped the music for the moment every synced song was stretched to the new tempo. The old sound now keeps playing until the new one is ready, then it switches over at the same place in the song, in time with the metronome (measured: every kick within 1 ms of its click before and after the change). The position is also counted in the old tempo up to the switch, so the song no longer jumps.
- **ACE-Step 1.5: a clear message when Windows runs out of virtual memory** ("the paging file is too small", error 1455). On the processor the model needs about 12 to 14 GB; with 16 GB RAM Windows covers the rest with its paging file, which is often set too small. The message now says how to fix it once in Windows (let Windows manage the paging file size, or set 16–32 GB).

## 0.18.10

- **The project tempo can be typed again:** the BPM field at the top took every key on its own, so typing "1" on the way to 128 was refused and the field jumped back. Now type the tempo and press Enter (or leave the field); decimals work (95.5), arrow keys and the mouse wheel change it by 1 (Shift: 0.1). The field is wider, so the whole tempo is visible.
- **Click or double-click anywhere in the Studio to move the playhead there** (snapped to the grid, Alt: free). A double-click on an empty audio track no longer opens the file dialog (use *Import audio…*); on a MIDI track it still makes a clip.
- **SYNC keeps a song tempo you corrected by hand:** the clip bar field is now called *Song tempo* (the tempo the song itself was made at) and shows the project tempo it plays at; SYNC used to measure again and put the measured tempo back.

## 0.18.9

- **Track height:** every audio and MIDI track in the Studio can be made higher or lower by dragging its lower edge with the mouse (36 to 320 pixels); a double-click on the edge sets the normal height again. The height is saved with the project.
- **ACE-Step 1.5 songs end cleanly:** the model renders exactly the length asked for and then simply stops, often in the middle of the music, so the end of a song seemed cut off. It now renders 5 seconds more and fades out over the last 3 seconds (a fade-out set under Advanced is used instead).
- **ACE-Step 1.5 shows its phase:** at 80 % it decodes the song into audio, which takes a few minutes on the processor without further progress. The progress now says so ("Decoding audio…"), so a standing bar is not taken for a hang.

## 0.18.8

- **Synced songs hit the beat exactly, from the first kick on:**
  - **Stretched beat by beat**, like the "Beats" warp mode of DAWs: a synced clip is cut at every beat of its grid and each piece is stretched on its own, starting exactly at its place. Every kick now lands within 1 ms of its beat. Before, whole songs over 90 s went through a phase vocoder that smeared every kick over about 60 ms and moved single beats by up to 40 ms ("it does not start exactly on the beat"); loops could be up to 15 ms off.
  - The metronome no longer misses the click on the first beat when the computer is busy at the start.
  - A clip that starts right on a kick keeps its full attack (the fade against clicks at the clip start is 2 ms instead of 6 ms).

## 0.18.7

- **Move the playhead by hand:** drag the blue playhead line (or the small triangle on top of it) to any point in the Studio, or click and drag in the bar numbers of the ruler. It snaps to the grid (Alt: free). While the song plays, playback jumps there when you let go. No more pressing Stop to get back.
- **Fix: "'charmap' codec can't encode characters" when making a song** (seen with ACE-Step 1.5): the AI backend wrote its log in the old Windows code page, and a single character outside it (a progress bar of block characters, an arrow, lyrics in Japanese) stopped the song. The backend and its helpers now write UTF-8 and never fail on a character.

## 0.18.6

- **Beat grid, checked against Mixxx and opendj:** a tempo is rounded to a whole (or half) BPM only when the song's kicks really sit on the rounded grid, as in those programs. Before, a song at 124.07 BPM was rounded to 124 and was 50 ms off after three minutes; now it stays at 124.07 (on test tracks within 1–2 ms over three minutes).
- **Warning for songs with an unsteady tempo** (live playing, a drummer without a click): Sync now says which clips should be checked by ear, instead of syncing them silently with a grid that drifts in and out.
- **ACE-Step 1.5 install, third fix:** ACE-Step asks for an old setuptools (<72) while current PyTorch needs a new one (≥77), so pip could find no solution once PyTorch was held. That requirement is now skipped (both versions work). If torchvision still does not match PyTorch ("operator torchvision::nms does not exist"), it is removed: it is only used by training tools, not for making music.
- **Sync several clips together:** select songs, loops or stems in the Studio (Ctrl/Shift+click, drag a frame or Ctrl+A), then click **Sync together** in the selection bar, **AUTO SYNC**, the toolbar's *Sync … selected* or *SYNC the selected clips together* in the right-click menu. Every clip is stretched to the master BPM and beat 1 of each one is put on the same bar line, so they all start together and stay in time. If a song has an intro before its beat 1, all clips move to a later bar so no intro is cut off.

## 0.18.5

- **ACE-Step 1.5 install, second fix:** one of its packages made pip replace the installed PyTorch with an older one that no longer matched torchvision ("operator torchvision::nms does not exist"). PyTorch is now held at its installed version while the packages are installed, a broken PyTorch is repaired by *Install selected*, and torchao / torchcodec are left out if no version of them fits.
- **Beat matching and AUTO SYNC rebuilt like DJ software builds a beat grid:**
  - **Whole songs are synced too.** The Studio stretched only files up to 90 seconds; longer songs kept their own tempo next to the synced grid and drifted away from the metronome ("every song a little different"). Long files are now stretched on the AI backend to the project tempo, exactly to the length the grid expects.
  - **Exact tempo:** after the beat tracker, the tempo is fine-tuned over up to four minutes of the song (the tempo at which its attacks line up best), so 124 is 124 and not 123.6, and real in-between tempos such as 127.3 stay as they are.
  - **Exact phase:** the grid sits on the kick, not on loud off-beat hi-hats (beat trackers often lock half a beat off), and on the attack itself, not a few milliseconds before or after. On test tracks within 1–7 ms (before: up to half a beat).
  - **Bar sync:** the downbeat (beat 1 of a bar, found by its low-end attack) is put on a bar line of the project, not just on any beat.
  - Songs saved earlier are measured again when they are synced (only loops keep their stored tempo).

## 0.18.4

- **ACE-Step 1.5 installs on Windows:** its package list asks for *nano-vllm* (its language model runtime, not on PyPI) and a CUDA build of PyTorch pinned to its own server, so pip stopped with "No matching distribution found for nano-vllm". The install now takes the list without these (the music part used here does not need them), installs PyTorch for your PC, and checks that ACE-Step 1.5 starts.

## 0.18.3

- **Resizable Studio and panel:** drag the line between the Studio and the panel below it (mixer, piano roll, ...) up or down; double-click resets it. The Studio now takes all the height the panel leaves.
- **New-track zone in the Studio:** under the last track there is always a dashed "+ Drag a clip or an audio file here for a new track" area; it lights up while you drag a clip there.
- **Split into stems in the Studio** shows its progress next to the toolbar and uses the graphics-card models when *Fast vocal separation* is installed (else Demucs Fast); the message says where the stems are (new tracks at the bottom, in a group).
- **Piano Roll: select several notes:** draw a frame with the *Select* tool (or Shift+drag with any tool), Shift/Ctrl+click adds or removes a note, **Ctrl+A** selects all notes (after a click in the Piano Roll). Selected notes move and get deleted together, and *Quantize* acts on all of them.
- **Only one app at a time:** starting AI Music Studio again now brings the open window to the front. Before, every start ran its own AI backend (the logs showed three at once), so stem splits and songs waited on each other.
- **ACE-Step 1.5 repair:** its environment lacked NumPy, so it never started. *Install selected* now installs NumPy and checks that ACE-Step 1.5 really starts; the error message says how to repair it.
- **No more hard distortion:** a safety limiter at the end of the master stops many notes or loud clips together from clipping.

## 0.18.2

- **Every new clip gets its own track:** *Studio: synced* / *as is* in the Samples tab no longer put every sample onto the selected track; like *Add to project* in the Library, each one now gets a new audio track.
- **Stem Splitter can be cancelled:** *✕ Cancel* next to the progress bar stops a split (the fast modes at once, Demucs after its current chunk). A split that waits for an earlier one still running now says "Waiting for the previous split to finish…" instead of sitting at 0 %.
- **Drag a clip below the last track** in the Studio: a dashed frame shows "Release here: new audio track" (or MIDI track), and on release the clip moves onto a new track of its kind.
- **Test plan** for systematic testing: [docs/TESTPLAN.md](docs/TESTPLAN.md) (German).

## 0.18.1

- **Stem Splitter: "4 Stems on the graphics card":** vocals, drums, bass and other with four small MDX-Net models that run on the graphics card like *Vocals + Instrumental* (AMD / Intel through DirectML, also the R9 290, and NVIDIA). Much faster than Demucs *Fast* on these cards, a little less clean than *Balanced*. Uses the same *Fast vocal separation* engine; the models download on the first split.
- Release pages show the changelog and the install notes; the donation link is only on the project page ("Buy me a coffee").

## 0.18.0

- **Stem Splitter: "Vocals + Instrumental (fastest)":** a new mode with an MDX-Net model (through audio-separator) that is much faster than Demucs, ideal for karaoke and acapellas. It uses the graphics card on AMD and Intel (DirectX 12 through DirectML, also older cards like the R9 290) and on NVIDIA (CUDA), and falls back to the processor. Install it once in Settings → AI Engines → *Fast vocal separation*; it has its own environment and does not touch the others.
- **Waveform previews:** in the Library (My tracks, Stems, Samples) the real waveform appears under what is playing, and the stem mixer shows the waveform of all stems; click or drag in it to jump anywhere, with the time so far and the length.
- **Demucs "Fast" is quicker:** fewer overlapping chunks (10 % instead of 25 %), with hardly any audible difference.

## 0.17.0

- **Stem mixer in the Stem Splitter:** after splitting, play all stems together and set **Solo**, **Mute** and the **volume** of each stem while listening (double-click a slider: 100 %).
- **Export remix:** mixes the stems you hear at these levels into one file (WAV, AIFF, FLAC or MP3). Mute *Vocals* for a karaoke version, *Drums* for a version without drums; the file is named after what was left out.
- **Audio → MIDI:** *→ MIDI* on a stem (vocals, bass, piano, guitar, other) turns its melody into notes on a new MIDI track and opens it in the Piano Roll. Needs *Audio → MIDI (basic-pitch)* in Settings → AI Engines.

## 0.16.3

- **Stem Splitter with a progress bar:** percent, what it is doing, the time so far and about how long is left. The split runs in the background, so the app stays responsive (also the Studio's *split clip*).
- A hint explains the speed: *Balanced* runs 4 models one after the other; on the processor (also with AMD / Intel graphics, which Demucs cannot use) *Fast* is about 4 times quicker.

## 0.16.2

- **Stem Splitter fixed:** with current PyTorch versions every stem came out as an empty file (shown as "Ready to export"), so *Save to library* said "There were no stem files to save". Audio is now read and written without torchaudio's file functions, the stems keep the song's own level, and a missing Demucs or a failed split shows its reason instead of empty stems.
- **Export:** an empty file now says so instead of "Format not recognised".
- **Library → Stems:** *Open Library → Stems* in the Stem Splitter now opens the Stems tab, and *My tracks* points to the Stems tab when stems are saved.

## 0.16.1

- **Support the project:** Settings → About has a *Donate with PayPal* button, next to the GitHub star. Everything stays free.
- **Cloud Rendering (Pro)** appears in the menu as *Coming soon*: an optional paid extra that renders on fast NVIDIA graphics cards in the cloud. Everything you have now stays free and local.

## 0.16.0

- **Stems are kept and exported properly:** after splitting, *Save to library* puts the stems into their own folder in the Library (tab *Stems*, grouped by song, with tags and tempo). *Export…* writes every stem as its own file in the format your DAW wants: WAV 16/24/32-bit, AIFF, FLAC or MP3.
- **Library with tabs and search:** *My tracks* (songs and loops from Create music, imports), *Stems* and *Samples*. Search by name, tag or BPM (`124`, `120-130`). Tags can be set when creating (Create music → Tags), when saving stems, and later on every item. Every item can be exported. Samples can be copied into the Library (*+ Library*).
- **Loops stay in sync:** loops go into the Studio with their exact tempo and beat 1 at the file start, so AUTO SYNC and *Sync all* no longer measure them again and nudge them off the grid.
- **Cancel stops within seconds:** a model that cannot stop in time (ACE-Step on the CPU) makes the AI engine restart itself.
- **Updates no longer ask you to close the app:** the AI engine and its workers are ended before installing.
- **More graphics cards:** MusicGen medium and large run on AMD / Intel cards with 8 / 16 GB through DirectML (small on any DirectX 12 card).
- **AI assistant: Grok (xAI) and Ollama.** Ollama runs a model on your own PC: free, no account, no key.
- **Settings → About:** project, links, and a request for a GitHub ⭐. Vocal Editor, AI Instruments, Karaoke Export and Video Composer show "Coming soon" until they are finished.
- Windows *Settings → Apps* shows the description, project page and help link.

## 0.15.1

- **Copying text works again:** since 0.14.2 Ctrl+C, Ctrl+A, Ctrl+V and Ctrl+X were taken by the Studio everywhere, so log texts could not be copied. They now copy clips only in the Studio, piano roll and mixer, and never while text is selected or a dialog is open.
- **Right-click menu for text:** Copy / Cut / Paste / Select all on selected text and in text fields.

## 0.15.0

- **ACE-Step 1.5 turbo (experimental): songs with vocals also without a suitable graphics card.** The 2B turbo model needs only 8 steps and runs "DiT only" (without its language model), the mode the project recommends for small machines. On the processor it is slow but works with 16 GB RAM; with an NVIDIA card choose the CUDA variant of PyTorch. Install: *Settings → AI Engines → ACE-Step 1.5* (needs Python 3.11 or 3.12 and Git; the model, about 10 GB, downloads on the first song). Written from the project documentation and not yet tested on real hardware.
- **Code signing prepared** (SignPath Foundation): the release workflow signs the installer as soon as the project is approved.

## 0.14.4

- **MusicGen makes several clips side by side on the CPU:** with more than one song or variation, up to 4 clips are rendered together in one pass (as many as the free memory allows). One clip alone keeps the processor busy only in short bursts, because MusicGen writes one token after the other; clips side by side share every step, so all cores have work and several clips take far less than that many times as long. The graphics card path (DirectML) still makes them one after the other.
- Install notes explain the Windows SmartScreen warning of the unsigned installer.

## 0.14.3

- **The CPU is used fully** when a model runs on the processor: the AI now computes on all CPU threads (hyper-threads included) instead of one per core, and the AI backend runs at below-normal priority so the app and Windows stay responsive. `AMS_CPU_THREADS` still sets another number.
- **Loop titles** say what they are: "Deep house – Loop 124 BPM 4 bars" (in the library and as the track name in the Studio).

## 0.14.2

- **Copy, cut and paste in the Studio** (Ctrl+C, Ctrl+X, Ctrl+V, in the Ableton and the Cubase layout): pasting puts the clips at the playhead and moves the playhead behind them, so pressing Ctrl+V again lines up copies without a gap (ideal for loops). Clips from one track go onto the selected track. Ctrl+D with several clips duplicates all of them.
- **Shortcuts no longer go dead** after choosing a value in a drop-down list (Grid, Count-in, ...) or clicking a button: Space, Ctrl+C and the rest work at once. Space also plays and pauses while a number field (BPM) has the focus.
- Undo no longer leaves a deleted clip selected (Ctrl+X or Delete did nothing afterwards).

## 0.14.1

- **Faster on the CPU:** the AI used at most 4 CPU threads (a 6-core/12-thread CPU sat at about 25 %). It now computes on one thread per physical core (all cores of CPUs without hyper-threading, minus one on CPUs with up to 4 threads). Set the environment variable `AMS_CPU_THREADS` to choose another number.

## 0.14.0

- **Create loop** in Create music: a loop of exactly 1, 2, 4, 8 or 16 bars that starts on beat 1 and repeats seamlessly. The generator renders a little more music than needed; the loop is cut on the beat grid of the tempo the model really played, and the music after the loop end is crossfaded into its start, so copies placed one after the other (Ctrl+D in the Studio) play endlessly without a gap or a click. Loops go into the Studio synced to the project tempo and are saved as FLAC/WAV without fades.

## 0.13.1

- **Cancel button in Create music** (and a ✕ next to the progress in the status bar): stops a running or waiting generation at the next step. External workers (DiffRhythm, the DirectML graphics-card worker) are stopped at once. Songs that were already finished stay in the library.

## 0.13.0

- **Studio works like Ableton and Cubase:** drag a loop in the ruler (seamless wrap), markers and cycle markers, tempo and time-signature changes, multi-select and consolidate, crossfades, volume/pan automation lanes, reverb/delay return tracks with per-track sends, group tracks, loop recording into take lanes with comping, warp markers, count-in, punch in/out, a channel tab, split a clip into stems from the right-click menu, quick export.
- **Shortcuts** for all of the above in both the Ableton Live 12 and the Cubase layout (Settings → Shortcuts).
- **Create music** is translated into German and warns *before* rendering when the chosen model cannot sing.
- **Vocals fix:** lyrics sent to ACE-Step now always carry a vocal tag and a structure tag, which should stop typed lyrics from coming out as an instrumental (still to be confirmed with the real model on an NVIDIA PC).
- **Detailed log for beta testers** in the Feedback dialog (on/off, copy, save as file).
- AI engines are no longer shown as "not installed" when they are.
