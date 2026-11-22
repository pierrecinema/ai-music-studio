# Studio ⊞

The arrangement view (DAW), with the shortcuts of Ableton Live 12 or Cubase ([[Keyboard Shortcuts]]).

## Toolbar
| Button | What it does |
|---|---|
| **Import audio…** | wav, mp3, flac, ogg, m4a, aiff onto a track (dragging files from Explorer works too); MIDI files (.mid) become MIDI tracks |
| **Master FX** | shows the effects on the master (built in or VST plugins, after all tracks); see [[Mixer]] |
| **+ Audio track / + MIDI track** | adds a track |
| **+ Return… (Reverb / Delay)** | a shared reverb or delay; every track sends to it with its send knob (effects for one track: **FX** on the track) |
| **Sync all to … BPM** / **Sync N selected** | brings all audio (or the selected clips, together) in time with the master BPM: [[Beat Matching and Sync]] |
| **Beat match…** | measures the selected audio clip and offers to sync it |
| **Grid / 🧲 Grid on/off** | grid from 1 bar to 1/64, triplets; the 🧲 button switches the grid off (yellow: everything moves freely, Ctrl+4); hold **Alt** to move freely once. Zoomed in far (up to 16×) the grid is magnetic: clips snap only near a grid line and move steplessly in between, for lining up beats. With the grid off, **← →** move the selected clip by one pixel |
| **Loop** | loop (cycle) on/off; drag the range in the strip under the markers |
| **Punch in / Punch out** | recording starts / stops at the loop range |
| **Count-in** | off, 1, 2 or 4 bars of clicks before recording |
| **+ Marker** | a marker at the playhead |
| **Tempo** | shows the tempo track (tempo changes during the song) |
| **Channel** | the channel tab of the selected track: colour, volume, pan, mute/solo, the **instrument** of a MIDI track, effects, sends, group, automation, meter |

## Tracks and clips
- **Drag** clips to move them (also to another track), drag their edges to trim. **Drag a clip onto the dashed area under the last track** ("+ Drag a clip here for a new track"): a new track is made for it (audio or MIDI).
- **Select several clips:** Ctrl+click or Shift+click, drag a frame, or **Ctrl+A**. A bar shows *N clips selected* with **Sync together**, **Consolidate**, **Loop selection**, **Group tracks** and **Clear selection**.
- **Ctrl+C / Ctrl+X / Ctrl+V:** paste at the playhead; pressing again puts the next copy right behind. **Ctrl+D** duplicates right after the clip (loops line up without a gap).
- **Split at the playhead:** Ctrl+E (Cubase Alt+X). **Delete:** Del (Ctrl+Z brings it back).
- **Track height:** drag the lower edge of a track up or down; double-click the edge for the normal height.
- **Rename a track:** double-click its name. **Reorder:** drag the `⋮⋮` grip. **Zoom:** Ctrl+mouse wheel.
- **On the clip** (audio): the white squares at the top corners set the fade in and out (drag inwards), the line across the clip is its volume (drag up or down); double-click resets.
- **Clip bar** (selected audio clip): gain, fade in/out, **Song tempo** (the tempo the song itself was made at, not the project tempo; correct it only if the measurement is off), **SYNC**, **MASTER**.

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
## Warp markers
Right-click → *Edit warp markers*: double-click the waveform to set a marker, drag it onto another beat (the audio between is stretched without changing the pitch), Alt+click deletes it.

## Track header
The first row shows the whole track name (double-click to rename). The row below shows the type (audio, midi, group, or the VST instrument) and the buttons **M** (mute), **S** (solo), **FX** (effects lane), **CH** (channel), **A** (automation lanes), **T** (take lanes, after loop recording) and **×** (delete). The third row has the volume slider and one small send slider per return track.

## Studio and Mixer height
Drag the divider between the Studio and the [[Mixer]] to any height; double-click resets it.

**Groups:** a group track shows the clips of its tracks as bars with their name and waveform, one row per track (the group is as high as its tracks need). Double-click the group's lane (a bar or anywhere on it): the group's own row becomes large, every stem in it with a big waveform; another double-click, or the **⇕** button in the group's header, brings it back to its normal height (▶ / ▼ opens the group with its tracks below) (handy after *Split into stems*).

## Instruments (VST)

**MIDI effects:** on a MIDI track with a VST instrument, *Channel → MIDI effects → + MIDI effect…* puts an arpeggiator, sequencer or chord / pattern generator (BlueArp, Stochas, CodeFN42, HY plugins …) in front of the instrument. The instrument plays what the MIDI effect makes, in the Studio, the Piano Roll, from a MIDI keyboard and in the export. Several can be chained (▲ ▼), ⏻ bypasses one, *Open* shows its window. Plugins get the song's tempo and position, so arpeggiators and sequencers play in time.

A MIDI track plays its notes with the built-in synth, or with a **VST instrument**: *Channel → Instrument*, then pick one of your instrument plugins (Settings → Plugins; free ones: *Free instruments* there). Its window opens; **Open** opens it again, ⏻ switches back to the built-in synth. The instrument plays the clips, the notes you play in the Piano Roll and on a MIDI keyboard, MIDI recordings and the export. Its settings are saved with the project.

