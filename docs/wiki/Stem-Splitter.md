# Stem Splitter ✂

Split a song into its parts (stems): vocals, drums, bass, piano, guitar, other.

Drop a file on the page or choose one, or send a song here with the **Stem Splitter** button in [[Create Music]] (results) or the [[Library]].

## Modes
| Mode | Stems | Runs on | Needs |
|---|---|---|---|
| **Vocals + Instrumental (fastest)** | vocals, instrumental | graphics card (AMD, Intel, NVIDIA), else processor | *Fast vocal separation* |
| **4 Stems on the graphics card** | vocals, drums, bass, other | graphics card, else processor | *Fast vocal separation* |
| **Fast** | 4 stems | processor / NVIDIA | *Stem separation (Demucs)* |
| **Balanced** | 4 stems, cleaner (4 models in a row) | processor / NVIDIA | Demucs |
| **Quality** | 4 stems | processor / NVIDIA | Demucs |
| **6 Stems** | adds piano and guitar | processor / NVIDIA | Demucs |

Install the packages in [[Settings]] → AI Engines. A progress bar shows the percent and the device ("Done (DirectML)" = graphics card). **✕ Cancel** stops; one split runs at a time.

## Stem mixer
After splitting: **▶ Play** all stems together, waveform with seeking, per stem **S** (solo), **M** (mute) and volume.
- **Export remix…:** mixes the stems you hear at these levels, e.g. mute Vocals for a karaoke version ("… – no vocals").
- **→ MIDI:** turns a stem (bass, vocals, piano…) into notes on a new MIDI track, opened in the [[Piano Roll]].

## Saving
- **Save to library** with a name and tags: the stems go to the [[Library]] → *Stems*. **Open Library → Stems** jumps there.
- **Export Stems…:** every stem as its own file (WAV, AIFF, FLAC, MP3) for any DAW.

In the [[Studio]], right-click a song clip → **Split into stems (Demucs)** splits it right there; the stems arrive as new tracks.
