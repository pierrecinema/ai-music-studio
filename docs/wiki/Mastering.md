# Mastering ◎

A mastering workspace: drop a song in, hear it through a mastering chain, compare it with the original at the same
loudness, see every measurement before and after, and export it in any format. Everything runs in the app (no
plugin needed); what you hear while playing is exactly what is written to the file.

## Open a song
- **Drag** audio files (WAV, MP3, FLAC, OGG, M4A, AIFF) from the Explorer onto the page, or press **Open…**.
- **Library:** the **Mastering** button on a song. **Create music:** **Mastering** under a result.
  **Studio:** **File → Send song to Mastering** (renders the mix and opens it here).
- Open songs are tabs at the top (× closes one); **Recent…** lists the last 12.

## Listen and compare
- **▶ Play / ❚❚ Pause** (or **Space** on this page), **⏮** back to the start.
- **After / Before (A/B):** "Before" is the original, played **at the loudness of the master**, so you judge the sound,
  not the volume.
- **Waveform:** before (grey) and after (purple), clipping in red. Click to play from there, **drag to mark a region**,
  **⟲ Loop** plays it again and again. **Ctrl + wheel** or the slider zooms.

## The chain
Slots are processed from top to bottom: **⏻** switches one off (bypass), **↑ ↓** moves it, **↺** resets it, **×** removes
it, **+ Add…** adds one (also a second EQ or compressor). Click a name to open its controls.

| Slot | What it does |
|---|---|
| **Equalizer** | low cut, low shelf, three bands (frequency, gain, width), high shelf, high cut; the curve is drawn over the live spectrum |
| **Compressor (glue)** | threshold, ratio, attack, release, knee, make-up |
| **Multiband compressor** | three bands (two split frequencies), each with its own compressor and level |
| **Stereo / mono bass** | width (0 % mono … 200 %), bass below a frequency in mono, balance |
| **Limiter / maximizer** (always last) | **Louder** drives the song into it; **Ceiling** is the highest true peak allowed (4x oversampled, look-ahead), **Release** |

**Target** (Streaming −14 LUFS, Apple −16, Loud −9, Broadcast −23, Podcast −16) and **Reach … LUFS** set *Louder* and
the ceiling so the song reaches that loudness. **Load preset…** offers built-in starting points; **Save** keeps your
own chain under a name.

## Meters
- **Whole song, before → after:** integrated loudness (LUFS, ITU-R BS.1770 / EBU R128), true peak, sample peak,
  loudness range, RMS, crest factor, short-term maximum, clipping; how far the song is from the target.
- **Live:** momentary and short-term loudness, true peak (with maximum), RMS, integrated since play, gain reduction of
  the limiter, the compressor and each multiband band, stereo correlation.
- **Goniometer**, **spectrum** (before grey, after purple) and **loudness over time** (before, after, target).

## Export…
- **Formats, several at once:** WAV, AIFF (16 / 24 / 32-bit float), FLAC, ALAC (16 / 24-bit), MP3 (128–320 kbps or
  VBR), AAC, OGG Vorbis, Opus.
- **Sample rate** 44.1 / 48 / 88.2 / 96 kHz (converted in high quality), **dither** (TPDF) when the bit depth is reduced.
- **Metadata:** title, artist, album, year, ISRC, comment and a **cover picture** (JPG / PNG), written into every format.
- **Preset for…** streaming, CD, Bandcamp, hi-res, YouTube, Apple, web. Choose a **folder** and a **file name**.
  Compressed formats use ffmpeg; if it is not on the computer, the app downloads it once.

## Reference match
**Reference match (sound like another song)** matches loudness, tone balance and stereo width to a song you like
(Matchering, needs *Mastering* in [[Settings]] → AI Engines). The result opens as a new tab and can go through the chain.
