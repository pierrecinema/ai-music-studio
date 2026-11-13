# Studio ⊞

The arrangement view (DAW), with the shortcuts of Ableton Live 12 or Cubase ([[Keyboard Shortcuts]]).

## Toolbar
| Button | What it does |
|---|---|
| **Import audio…** | wav, mp3, flac, ogg, m4a, aiff onto a track (dragging files from Explorer works too) |
| **+ Audio track / + MIDI track** | adds a track |
| **+ Return… (Reverb / Delay)** | a shared reverb or delay; every track sends to it with its send knob (effects for one track: **FX** on the track) |
| **Sync all to … BPM** / **Sync N selected** | brings all audio (or the selected clips, together) in time with the master BPM: [[Beat Matching and Sync]] |
| **Beat match…** | measures the selected audio clip and offers to sync it |
| **Grid / Snap** | grid from 1 bar to 1/64, triplets, *Off (free)*; hold **Alt** to move freely once |
| **Loop** | loop (cycle) on/off; drag the range in the strip under the markers |
| **Punch in / Punch out** | recording starts / stops at the loop range |
| **Count-in** | off, 1, 2 or 4 bars of clicks before recording |
| **+ Marker** | a marker at the playhead |
| **Tempo** | shows the tempo track (tempo changes during the song) |
| **Channel** | the channel tab of the selected track: colour, volume, pan, mute/solo, sends, group, automation, meter |

## Tracks and clips
- **Drag** clips to move them (also to another track), drag their edges to trim. **Drag a clip onto the dashed area under the last track** ("+ Drag a clip here for a new track"): a new track is made for it (audio or MIDI).
- **Select several clips:** Ctrl+click or Shift+click, drag a frame, or **Ctrl+A**. A bar shows *N clips selected* with **Sync together**, **Consolidate**, **Loop selection**, **Group tracks** and **Clear selection**.
- **Ctrl+C / Ctrl+X / Ctrl+V:** paste at the playhead; pressing again puts the next copy right behind. **Ctrl+D** duplicates right after the clip (loops line up without a gap).
- **Split at the playhead:** Ctrl+E (Cubase Alt+X). **Delete:** Del (Ctrl+Z brings it back).
- **Track height:** drag the lower edge of a track up or down; double-click the edge for the normal height.
- **Rename a track:** double-click its name. **Reorder:** drag the `⋮⋮` grip. **Zoom:** Ctrl+mouse wheel.
- **Clip bar** (selected audio clip): gain, fade in/out, **Song tempo** (the tempo the song itself was made at, not the project tempo; correct it only if the measurement is off), **SYNC**, **MASTER**.

## Right-click on a clip
**SYNC to the master BPM** (or **SYNC the N selected clips together**), **Make this the MASTER tempo**, **Split at the playhead**, **Duplicate clip**, **Quantize**, **Consolidate selection (Ctrl+J)**, **Crossfade with the clip before (X)**, **Loop this clip (Ctrl+L)**, **Edit warp markers**, **Split into stems (Demucs)** (progress at the top right, the stems arrive as new tracks in a group), **Delete clip**.

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

## Effects (FX)
**FX** on the track opens its effects lane: **+ Effect…** adds an **EQ** (low / mid / high), **compressor**, **delay** (in beats), **reverb** or **filter** (low-pass / high-pass). Every effect has its settings as sliders (double-click: default), ⏻ on / bypass, ◀ ▶ for the order and × to remove it. The sound goes through them in order, before the fader. VST3 plugins will appear here later.

## Track colour
Right-click a track header, or click the colour strip at its left: pick a colour from the palette or any colour.

## Recording
**MIDI:** select a MIDI track or a MIDI clip (or open the Piano Roll) and press ● (top bar), **Ctrl+R** or **● Rec** in the Piano Roll. The song plays; what you play on the Piano Roll's keyboard or on a MIDI keyboard becomes notes in the clip, as long as you hold the keys. Press again or Space to stop.
**Audio:** on an audio track the same buttons record from the microphone or audio interface. In a loop, every pass becomes a take in its own lane (**T** on the track shows them); click a take to use it.
## Warp markers
Right-click → *Edit warp markers*: double-click the waveform to set a marker, drag it onto another beat (the audio between is stretched without changing the pitch), Alt+click deletes it.

## Studio and Mixer height
Drag the divider between the Studio and the [[Mixer]] to any height; double-click resets it.
