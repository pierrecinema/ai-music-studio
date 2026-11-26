# Audio → MIDI

Turns a whole song (for example one made with [[Create Music]]) into MIDI tracks you can edit in the [[Piano Roll]] and play with any instrument: the sound packs or a VST instrument.

## The page

First choose what should become MIDI: **Whole song** (all parts, chords and tempo; recommended), **Melody** (only the voice line), **Bassline**, **Drum pattern**, or **Choose parts** (tick the instruments yourself). Then press **Convert: …**; a progress bar shows the steps and **✕ Cancel** stops at any time. *Quantize to* and *Strength* sit next to the button, *More options* holds the tempo hint and *Split into instruments first*. The result is a table: one row per part with the number of notes, a note preview, the instrument, how sure the detection is, ▶ / ■ to listen and a tick for the Studio.

## How it works

1. **Split into instruments:** the song is split into vocals, bass, drums, piano, guitar and the rest (Demucs, 6 stems). Stems already split in the [[Stem Splitter]] can be used directly: *All stems → MIDI* there.
2. **Each stem with the method that suits it:**
   - **Vocals and bass** become one-voice lines. Of notes that start together only the main one stays (for bass the lowest), overtones and short blips inside a ringing note are left out, and a held note that the detection split is joined again.
   - **Piano, guitar and keys** become chords (basic-pitch), cleaned of ghost notes and octave echoes.
   - **Drums** become kick, snare and hi-hat hits (NMF drum transcription: templates for kick, snare and hats that adapt to the kit of the song), with the loudness of each hit as velocity.
3. **Tempo, bars, key and chords** are found in the song. The notes are put on the bars and beats, and can be pulled to a grid (*Quantize to*, *Strength*).
4. The result is shown before anything changes: the tempo, the key (and its relative key, since major and minor share their notes), the chords, and for every part the number of notes, the method, how sure the detection is (faint notes in the preview are less sure), a preview and a ▶ to hear the stem.

## Into the Studio

Tick the parts you want and choose the instrument for each one, then *Put … tracks into the Studio*:
- **Set the project tempo** to the song's tempo.
- **The original song too:** added muted and lined up with the bars, to compare (un-mute it, or solo a MIDI track against it).
- **A chord track:** the detected chords as a MIDI track (bass note and chord).
- **Chord names as markers.**
- **From bar:** where the tracks start.

Open it from the sidebar (*Audio → MIDI*), with **→ MIDI** on a song in the [[Library]] or on a result in [[Create Music]], with *All stems → MIDI* in the [[Stem Splitter]], or with *Selected Studio clip* for an audio clip in the [[Studio]]. Without *Split into instruments first* the file is taken as one instrument (say which).

## Needs

*Audio → MIDI (basic-pitch)* and, to split songs, *Demucs* in [[Settings]] → *AI Engines*. Everything runs on the processor: about half a minute per song after splitting; splitting takes a few minutes on a CPU.

## How good is it

Measured on songs of the app's song generator, rendered with the sound packs, each instrument alone (note F-measure, onsets within 50 ms; 1.0 = every note right):

| Part | Before (basic-pitch on the stem) | Now |
|---|---|---|
| Bass | 0.66 | 0.77 |
| Drums (kick, snare, hats) | not possible | 0.69 |
| Melody / vocals | 0.56 | 0.55 |
| Piano / keys chords | 0.65 | 0.64 |
| Guitar | 0.48 | 0.46 |
| Tempo and first bar | | right in 6 of 6 songs |

Notes of slow instruments (strings, pads, brass) sound a little after their beat: *Quantize* puts them on it. Real AI songs are harder than these clean renders; please tell us how it does on yours.

AI agents can do the same with the MCP tool `app_audio_to_midi` (see [[MCP]]).
