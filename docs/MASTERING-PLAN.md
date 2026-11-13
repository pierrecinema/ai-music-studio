# Mastering: plan for the rebuild

Collected with the owner on 12.11.2026 (area 7 of the test plan is rebuilt first). Today the Mastering view only
matches a mix to a reference track (Matchering, `apps/server/api/routes/mastering.py`, 68 lines of UI). The goal is a
full mastering workspace like a professional mastering editor, with open-source processing that really works.

## Status

- **0.30.0 (13.11.2026): steps 1 to 3 done** (agreed with the owner: built together, one release): workspace, meters,
  built-in chain (EQ with curve, compressor, multiband, stereo / mono bass, true-peak limiter with "Louder" and loudness
  targets, presets), output menu (8 formats, sample rates, dither, metadata, cover, destination presets).
  How it works: `apps/desktop/src/renderer/src/audio/master/` (`dsp.ts` holds the processors and the BS.1770 meter as
  self-contained classes that run both in AudioWorklets and offline; `chain.ts` builds the graph; `player.ts` plays,
  A/B, meters), `components/mastering/`, backend `services/master_export.py` (`/mastering/export`).
- **Next, step by step:** 4 (assistant, editing), 5 (VST3 host, wishes 5, 7, 8), 6 (album).
  Not in 0.30.0: dynamic EQ and saturation (step 2 extras), the built-in effects as Studio inserts (wish 8 without VST).

## The owner's wishes

1. **Drag your track in:** from Explorer, the Library, Create music and the Studio (also "Send the song to
   Mastering" from the Studio's File menu). Like in professional editors: drop on the window, a file list, recent files.
2. **The basic functions of a mastering editor, all working** (see the list below).
3. **Output menu:** sound settings and every common format.
4. **Standard plugins built in:** EQ, compressor, loudness (limiter/maximizer), as open-source code.
5. **VST plugins** can be added to the chain.
6. **Display:** loudness (with a control to make it louder and the current loudness), waveform, stereo field, and every
   analysis that shows the master and what the processing changes (before / after). Record everything.
7. **Settings → Plugins:** the plugin search works and shows every plugin found, with a tick for the ones to use.
8. **Plugins in the Studio** (inserts on tracks and on the master).

## Open-source plugins the owner found (checked 12.11.2026)

| Plugin | License | What it brings | How we use it |
|---|---|---|---|
| **oXygen** (Wamphyre/oXygen) | BSD-3 | Mastering suite (JUCE, VST3): 15-band graphic EQ, 4-band dynamic EQ, 4-band multiband compressor, multiband stereo imager, gain, true-peak maximizer (4x oversampling, Transparent / Loud / Safe), *Master Assistant* (listens and proposes settings), *Reference Match*, spectrum before/after | Model for the chain and the assistant; can be shipped as VST3 once the host works; its DSP ideas can be ported |
| **master_me** (trummerschlunk/master_me) | GPL-3 | Automatic mastering chain in FAUST (`master_me.dsp`, `lufs_meter.dsp`): gate, EQ, leveler, multiband / knee compressor, limiter, brickwall, LUFS meter; CLAP/VST/VST3/LV2 | The FAUST code can be compiled to C++ or WebAssembly and run in our own engine; LUFS meter as reference |
| **ZL Limiter** (ZL-Audio/ZLLimiter) | AGPL-3 | Modern limiter (JUCE, SIMD), work in progress | VST3 later; AGPL-3 can be combined with our GPL-3 |

Freeware the owner named (not open source, cannot be built in; usable through the VST host once it exists, their
functions are a model for our own): a loudness maximizer, a spectrum analyzer with correlation meter, a dynamic EQ.

## Basic functions of a mastering editor (target list)

**File and editing:** open / drop, several files in tabs, cut / copy / paste / delete, trim, fade in/out with curve
types, crossfade, silence, normalize (peak and LUFS), gain, DC offset removal, reverse, undo history, markers and
regions, loop playback of a region, zoom, A/B of before and after at matched loudness.

**Album assembly (later):** several songs in order with gaps and crossfades, track markers, export each song and the
whole album, CD/DDP export.

**Processing chain (rack):** slots that can be reordered, bypassed and saved as presets; built in:
- parametric EQ (bands, shelves, high/low cut) with a spectrum behind it
- dynamic EQ
- compressor (single band, "glue") and multiband compressor
- stereo imager / M-S, mono below a frequency
- saturation / exciter (later)
- limiter / maximizer with true-peak ceiling and oversampling
- loudness target: one control "louder" plus presets (streaming, club, broadcast), shows the result before render
- dither on export
- VST3 plugins in any slot
- assistant: analyses the track (and a reference, Matchering stays) and proposes settings

**Meters and analysis, before and after:** integrated / short-term / momentary LUFS, loudness range, true peak,
sample peak, RMS, crest factor, loudness history graph, spectrum (before/after overlay), spectrogram, stereo
correlation, goniometer / vectorscope, phase per band, balance, clipping markers on the waveform, waveform before and
after. Every analysis can be shown for the whole file and live while playing.

**Output menu:** WAV 16 / 24 / 32-bit float, AIFF, FLAC, ALAC, MP3 (CBR / VBR, bitrates), AAC / M4A, OGG Vorbis,
Opus; sample rate conversion (44.1 / 48 / 88.2 / 96 kHz); bit depth with dither; loudness normalisation to a target;
metadata (title, artist, album, ISRC, cover); several formats in one go; presets per destination.

## Order of work (proposal)

1. **Workspace:** drop / open, waveform with seeking, play, A/B before/after at matched loudness, meters (LUFS,
   true peak, RMS, spectrum, correlation, goniometer, loudness history). Measurements on the backend (exact, for the
   whole file) and live meters in the app.
2. **Built-in chain:** EQ, compressor, multiband, imager, limiter/maximizer with "louder" control and LUFS presets,
   presets for the chain; rendering on the backend so preview and file sound the same.
3. **Output menu** with all formats, sample rates, dither, metadata, batch.
4. **Assistant** (analysis and proposals, reference match), editing functions.
5. **VST3 host:** finish `packages/vst-bridge` (today only two header files), real plugin scan with name, maker,
   category, Settings → Plugins list with ticks, plugin windows, plugins in the Mastering chain and in the Studio
   (track inserts, master). Ship oXygen and ZL Limiter as optional plugins.
6. **Album assembly** and DDP.

## What exists to build on

- `apps/server/api/routes/mastering.py` (Matchering), `apps/server/api/routes/vst.py` (file scan only: name from the
  file name, maker "Unknown"; Settings → General shows two fixed folders and a "Scan" button without function)
- the Studio's Web Audio engine (`audio/engine.ts`), the export dialog (`components/common/ExportDialog.tsx`, WAV /
  AIFF / FLAC / MP3), `WaveformSeek`, the stem mixer
