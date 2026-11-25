# Studio ⊞

The arrangement view (DAW), with the shortcuts of Ableton Live 12 or Cubase ([[Keyboard Shortcuts]]).

## Toolbar
One row, the functions in groups (on a narrow window it wraps):

| Button | What it does |
|---|---|
| **+ Track ▾** | adds an **audio track**, a **MIDI track** or a **return track** (a shared reverb or delay; every track sends to it with its send knob) |
| **Import audio…** | wav, mp3, flac, ogg, m4a, aiff onto a track (dragging files from Explorer works too); MIDI files (.mid) become MIDI tracks |
| **↖ ✂ 🧲** | the tools: ↖ pointer (select, move, trim), ✂ scissors (click a clip to cut it there, or drag over a range, also over several tracks, to cut it out as its own clip; on the grid, Alt: exactly; afterwards the pointer is back), 🧲 grid on / off |
| **Grid, Quantize, ⚙** | grid from 1 bar to 1/64, triplets; the 🧲 button switches the grid off (yellow: everything moves freely, Ctrl+4); hold **Alt** to move freely once. Zoomed in far (up to 16×) the grid is magnetic: clips snap only near a grid line and move steplessly in between, for lining up beats. With the grid off, **← →** move the selected clip by one pixel |
| **⟳ Loop** | loop (cycle) on/off; drag the range in the strip under the markers |
| **Punch in / Punch out** | recording starts / stops at the loop range |
| **♩ (count-in)** | off, 1, 2 or 4 bars of clicks before recording |
| **+ Marker** | a marker at the playhead |
| **Tempo** | shows the tempo track (tempo changes during the song) |
| **Zoom − + ⤢** | zoom out, zoom in (also Ctrl + mouse wheel), the whole song |
| **Master FX** | shows the effects on the master (built in or VST plugins, after all tracks); see [[Mixer]] |
| **Export** | quick export of the whole song as WAV or MP3 |
| **⋯** | **Channel** (the channel tab of the selected track: colour, volume, pan, mute/solo, the **instrument** of a MIDI track, effects, sends, group, automation, meter), **Sync all to … BPM** / **Sync N selected** (brings all audio, or the selected clips together, in time with the master BPM: [[Beat Matching and Sync]]), **Beat match…** (measures the selected audio clip and offers to sync it) |

## Detail area
Under the tracks (when no Piano Roll or Mixer is open below): **Track** (instrument of a MIDI track, recording input of an audio track, output, colour), **Clip** (the notes of the selected MIDI clip on a small piano-roll grid, *Open in the Piano Roll*; for an audio clip its tools — gain, song tempo, SYNC, MASTER, fades, WARP — and its waveform) and **Effects (inserts)** of the track (on / off, × remove, *+ Effect…*, a VST plugin's name opens its window, *Settings* opens the effects lane). **▾** folds it away, **▴ Details** brings it back.

## Tracks and clips
- **Drag** clips to move them (also to another track), drag their edges to trim. **Drag a clip onto the dashed area under the last track** ("+ Drag a clip here for a new track"): a new track is made for it (audio or MIDI).
- **Select several clips:** Ctrl+click or Shift+click, drag a frame, or **Ctrl+A**. A bar shows *N clips selected* with **Sync together**, **Consolidate**, **Loop selection**, **Group tracks** and **Clear selection**.
- **Ctrl+C / Ctrl+X / Ctrl+V:** paste at the playhead; pressing again puts the next copy right behind. **Ctrl+D** duplicates right after the clip (loops line up without a gap).
- **Split at the playhead:** Ctrl+E (Cubase Alt+X). **Delete:** Del (Ctrl+Z brings it back).
- **Track height:** drag the lower edge of a track up or down; double-click the edge for the normal height.
- **Rename a track:** double-click its name. **Reorder:** drag the `⋮⋮` grip. **Zoom:** Ctrl+mouse wheel.
- **On the clip** (audio): the white squares at the top corners set the fade in and out (drag inwards), the line across the clip is its volume (drag up or down); double-click resets.
- **Clip tools** (selected audio clip; in the detail area, or above the tracks when it is folded away or a panel is open below): gain, fade in/out, **Song tempo** (the tempo the song itself was made at, not the project tempo; correct it only if the measurement is off), **SYNC**, **MASTER**.

## Right-click on a clip
**SYNC to the master BPM** (or **SYNC the N selected clips together**), **Make this the MASTER tempo**, **Split at the playhead**, **Duplicate clip**, **Quantize**, **Consolidate selection (Ctrl+J)**, **Export as MIDI file (.mid)…** (MIDI clips), **Crossfade with the clip before (X)**, **Loop this clip (Ctrl+L)**, **Edit warp markers**, **Split into stems (Demucs)** (progress at the top right, the stems arrive as new tracks in a group), **Delete clip**.

## Right-click on a track header
**Rename track**, **Duplicate track**, **Show automation**, **Put into a new group (Ctrl+G)** / **Take out of the group** / **Ungroup**, **Delete track**.

## Playhead
The blue line shows where the song plays. **Click or double-click** any empty place to move it there, **drag it** (the line or the small triangle on top) to any point, or **click or drag in the bar numbers** of the ruler. It snaps to the grid; hold **Alt** for a free position. While playing, playback jumps there when you let go. **Home** (Ableton) or **Num .** (Cubase) goes back to the start.

## Ruler, markers, tempo
- Click the ruler to set the playhead. **Right-click the ruler:** time signature from this bar on.
- **Markers:** double-click the marker row to add one, drag to move, click to jump, right-click to rename or delete. Double-click a cycle marker to loop that part.
- **Tempo track:** double-click to add a tempo change, drag to move it, right-click to set the BPM or delete.

## Automation
**A** on the track (Ableton: A; or right-click → *Show automation*) opens **volume and pan** as two lanes below the track. In each lane: click adds a point, drag moves it (Shift: only in time, Alt: off the grid), double-click deletes it, **Clear** removes all. **▾ / ▸** makes a lane small, the selector switches it to another value (pan, a send), **+** adds a lane, **×** closes it (the points stay). Playback and export follow the curves.

**Effect and plugin parameters:** **Automate…** next to a built-in effect (EQ, compressor, filter, delay / reverb mix) or a plugin's *Open* (effects lane, effect rack, Channel → Instrument) lists its knobs; pick one and its lane opens under the track. Or in the selector of a lane, *Plugin parameter → <plugin>: choose a parameter…* lists every automatable parameter of a VST effect or instrument on the track (with a search box). The lane starts at the plugin's current value; draw it like volume. Playback and export follow it exactly.

**Presets:** *Presets…* next to a plugin's *Open* saves its current settings under a name (*Save current settings…*) and loads them again in any project.

## Effects (FX)
**FX** on the track opens its effects lane: **+ Effect…** adds an **EQ** (low / mid / high), **compressor**, **delay** (in beats), **reverb**, **filter** (low-pass / high-pass), and the processors of [[Mastering]]: **dynamic EQ**, **saturation / exciter**, **stereo / mono bass** and the **true-peak limiter**. Every effect has its settings as sliders (double-click: default), ⏻ on / bypass, ◀ ▶ for the order and × to remove it. The sound goes through them in order, before the fader.

The **Channel** panel on the right (button *Channel*) shows the same effects of the selected track: ⏻ on / off, **Open** (plugin window) or **Edit** (built-in effect: its sliders in the effects lane), ▲ ▼ order, × remove, and **+ Effect…** to add one.

**VST plugins:** your own VST3 and VST2 effects are listed in **+ Effect…** under *VST plugins* (the ones ticked in [[Settings]] → *Plugins*). Adding one opens the plugin's own window; **Open** opens it again (it stays above the app). ⏻ bypasses it, ◀ ▶ and × work as with the built-in effects. The plugin's settings are saved with the project and the export includes the plugin. A plugin that cannot be loaded (for example after moving the project to another PC) is marked *not loaded* and the track plays without it; its settings stay in the project. 64-bit and 32-bit plugins work (32-bit ones are marked in the menu). On a MIDI track, **+ Effect…** also lists your VST instruments at the top (*VST instruments*): picking one makes it the instrument of the track, like *Channel → Instrument*. **Channel → Instrument** offers, once the **sound pack** is installed ([[Settings]] → *Audio*), about 50 real instruments in the groups *Sound pack: Drums / Keys / Guitar and bass / Orchestra / Solo and synth*; tracks with a built-in sound then play the matching real instrument by themselves. It also offers the **built-in sounds**: synth (soft, lead, bass), electric piano, clean and distorted guitar, 808 bass and a General MIDI **drum kit** (kick 36, snare 38, clap 39, hi-hats 42/46, toms, crash 49, ride 51 …). **🎻 AI instrument…** in the Channel tab opens [[AI Instruments]] with the track chosen. A built-in effect setting with an automation lane follows the lane on screen too: its knob in the effect rack and its slider in the effects lane show the value at the playhead. The **CH** button next to **FX** on each track opens the *Channel* panel for that track (instrument, effects, sends); it is green when the track plays a VST instrument.

## Track colour
Right-click a track header, or click the colour strip at its left: pick a colour from the palette or any colour.

## Recording
**MIDI:** select a MIDI track or a MIDI clip (or open the Piano Roll) and press ● (top bar), **Ctrl+R** or **● Rec** in the Piano Roll. The song plays; what you play on the Piano Roll's keyboard or on a MIDI keyboard becomes notes in the clip, as long as you hold the keys. Press again or Space to stop.
**Audio:** on an audio track the same buttons record from the microphone or audio interface. In a loop, every pass becomes a take in its own lane (**T** on the track shows them); click a take to use it.
**Arm a track:** the red **●** in a track header arms it (one track at a time): the recording goes to that track, audio or MIDI, whichever track is selected. While recording, the armed track has a red frame and the take grows on it as a red clip with the input's waveform.
**Input (audio tracks):** the small list next to the volume slider chooses the input device of the track (*Settings → Audio*, or any microphone, line input, audio interface or USB device) and which of its inputs: **In 1+2** (stereo), **In 1** or **In 2** (mono). A device chosen here applies to this track only. A microphone or guitar on one input of a stereo interface belongs on **In 1** / **In 2**: it is then recorded in the middle (pan it with the track's pan) instead of on one side.
**"Permission denied by system"**: Windows blocks the microphone for desktop apps. The app opens *Windows Settings → Privacy & security → Microphone*: switch on *Microphone access* and *Let desktop apps access your microphone*, then record again.
## Warp markers
Right-click → *Edit warp markers*: double-click the waveform to set a marker, drag it onto another beat (the audio between is stretched without changing the pitch), Alt+click deletes it.

## Track header
The colour strip on the left (click: colour), the whole track name (double-click to rename), the type (Audio, MIDI, group, or the VST instrument) and the buttons **●** (arm for recording), **M** (mute), **S** (solo), **FX** (only when the track has effects: the effects lane) and **⋯** (rename, effects, channel, automation lanes, take lanes, duplicate, group, delete; the same as a right-click). The third row has (on audio tracks) the recording input, the **volume** fader with its value in **dB** (double-click: −1.9 dB), the **pan** knob (drag up / down, double-click: middle) and one small send slider per return track. The level meter is the thin bar on the right edge.

## Clips and waveforms
A clip has a title bar in the track colour; below it the notes (MIDI) or the waveform (audio). The waveform is drawn from the samples themselves, like in Mastering: each column shows the lowest and highest sample of its time, so it stays detailed at every zoom, down to single waves.

## Studio and Mixer height
Drag the divider between the Studio and the [[Mixer]] to any height; double-click resets it.

**Groups:** a group track shows the clips of its tracks as bars with their name and waveform, one row per track (the group is as high as its tracks need). Double-click the group's lane (a bar or anywhere on it): the group's own row becomes large, every stem in it with a big waveform; another double-click, or the **⇕** button in the group's header, brings it back to its normal height (▶ / ▼ opens the group with its tracks below) (handy after *Split into stems*).

## Instruments (VST)

**MIDI effects:** on a MIDI track with a VST instrument, *Channel → MIDI effects → + MIDI effect…* puts an arpeggiator, sequencer or chord / pattern generator (BlueArp, Stochas, CodeFN42, HY plugins …) in front of the instrument. The instrument plays what the MIDI effect makes, in the Studio, the Piano Roll, from a MIDI keyboard and in the export. Several can be chained (▲ ▼), ⏻ bypasses one, *Open* shows its window. Plugins get the song's tempo and position, so arpeggiators and sequencers play in time.

A MIDI track plays its notes with the built-in synth, or with a **VST instrument**: *Channel → Instrument*, then pick one of your instrument plugins (Settings → Plugins; free ones: *Free instruments* there). Its window opens; **Open** opens it again, ⏻ switches back to the built-in synth. The instrument plays the clips, the notes you play in the Piano Roll and on a MIDI keyboard, MIDI recordings and the export. Its settings are saved with the project.

