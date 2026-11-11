# AI Music Studio

**Free, open-source AI music studio for Windows:** make songs, seamless loops and stems with AI on your own PC, and arrange them in a full studio (DAW) with mixer, piano roll and automation. No account, no subscription. The AI assistant works with Claude, ChatGPT, Grok or completely free and local with Ollama.

## Easy Windows installation

No programming, no command line: just the installer.

1. **Download** `AIMusicStudio-Setup-<version>.exe` from the **[latest release](https://github.com/pierrecinema/ai-music-studio/releases/latest)**.
2. **Run it.** The first time, Windows shows a blue window *"Windows protected your PC"* (Microsoft Defender SmartScreen), because the installer is not code-signed yet and Windows does not know the publisher. It is not a virus warning: click **More info**, then **Run anyway**. Some antivirus programs ask as well.
3. **Start AI Music Studio.** The Studio, piano roll, mixer and library work right away.
4. **For the AI features** (songs, loops, stems, mastering): install [Python](https://www.python.org/downloads/) 3.11 or 3.12 once (tick *"Add python.exe to PATH"*), then in the app open **Settings → AI Engines** and click **Install selected**. The app sets everything up by itself and downloads the models (several GB, once).

**Updates come automatically:** the app checks for new versions and installs them with one click (Settings → Updates). The SmartScreen warning only comes with the installer downloaded in the browser.

Manual (German, incl. first-time setup): [docs/MANUAL.md](docs/MANUAL.md) · Beta testing: [docs/BETA.md](docs/BETA.md)

**Support the project:** AI Music Studio is free and stays free. A ⭐ on GitHub or a small donation via [PayPal](https://paypal.me/djpedroflores) helps to keep it going.

## Features

### Studio (DAW): available now

A full arrangement studio in the app, with the shortcuts of **Ableton Live 12** or **Cubase** (Settings → Shortcuts).

- **Arrangement:** audio and MIDI tracks, drag and drop from the Library or Explorer, multi-select, copy / cut / paste, duplicate (Ctrl+D lines up loops without a gap), split, consolidate, crossfades
- **Timing:** loop range in the ruler, markers and cycle markers, tempo and time-signature track, snap to grid, warp markers, AUTO SYNC of imported audio to the project tempo
- **Recording:** count-in, punch in / out, loop recording into take lanes with comping
- **Mixing:** mixer with faders, pan, mute, solo and live level meters, volume and pan automation lanes, reverb and delay return tracks with sends, group tracks, a channel tab per track
- **Piano Roll:** draw, move and quantize MIDI notes
- **Right in the Studio:** split a clip into stems from the right-click menu, quick export of the song
- **Projects:** save and open, undo / redo

### AI: available now

| Feature | What it does | Technology |
|---|---|---|
| **Create music** | Songs from a style description and lyrics; vocals with ACE-Step, instrumentals with MusicGen; a cappella mode; every track starts on beat 1 | ACE-Step 1.5 / v1, MusicGen, DiffRhythm |
| **Create loop** | Exactly 1–16 bars, starts on beat 1, repeats seamlessly, named with tempo and bars | own loop cutter on the beat grid |
| **Stem Splitter** | Vocals, drums, bass, piano, guitar and more, saved to the Library and exported for any DAW | Meta Demucs (htdemucs_ft) |
| **Mastering** | Matches your mix to a reference track | Matchering |
| **Library** | Songs, loops, stems and samples with tempo and tags; search by name, tag or BPM; export as WAV, AIFF, FLAC or MP3 | |
| **AI Chat** | Music assistant for chords, lyrics and ideas | Claude, ChatGPT, Grok, or free and local with Ollama |
| **Hardware** | Runs on the CPU; faster on NVIDIA (CUDA) and AMD / Intel graphics cards (DirectML) | PyTorch |
| **Languages** | 🇩🇪 🇬🇧 🇫🇷 🇪🇸 🇮🇹 🇵🇹 🇨🇳 🇯🇵 🇰🇷 | |

### Coming soon

| Feature | What it will do |
|---|---|
| **VST3 plugins** | Your own instruments and effects in the Studio (bridge in JUCE C++, in development) |
| **Audio → MIDI** | Turn a recorded melody or chord part into MIDI notes (Spotify basic-pitch) |
| **Vocal Editor** | AI singing from notes and lyrics, voice cloning |
| **AI Instruments** | AI-played instruments for your MIDI tracks |
| **Karaoke Export** | Word timing, .lrc files and lyric videos |
| **Video Composer** | Music that follows the cuts of your video |
| **Cloud Rendering (Pro)** | Optional: render on fast NVIDIA cards in the cloud. Everything above stays free and local. |

## Screenshots

*Shown with demo content: example songs, a demo project and a PC without AI engines installed yet.*

<img src="docs/screenshots/studio.png" alt="Studio" width="100%">
**Studio** – arrangement with loop and markers, automation lane, tempo-synced loops pasted one after the other, MIDI clip, reverb return track.

<img src="docs/screenshots/create-studio.png" alt="Create music" width="100%">
**Create music** – describe the style, write lyrics, pick a model and make a song or a seamless loop (1–16 bars). Simple and Studio mode.

<img src="docs/screenshots/library.png" alt="Library" width="100%">
**Library** – every created song and loop is kept with its tempo; loops are named like "Deep house – Loop 124 BPM 4 bars".

| | |
|---|---|
| <img src="docs/screenshots/piano-roll.png" alt="Piano Roll" width="100%"><br>**Piano Roll** – draw, move and quantize MIDI notes | <img src="docs/screenshots/mixer.png" alt="Mixer" width="100%"><br>**Mixer** – faders, pan, mute/solo, level meters, master |
| <img src="docs/screenshots/vocal-editor.png" alt="Vocal Editor" width="100%"><br>**Vocal Editor** – voices and lyrics for AI singing (in development) | <img src="docs/screenshots/instruments.png" alt="AI Instruments" width="100%"><br>**AI Instruments** – instruments for MIDI tracks (in development) |
| <img src="docs/screenshots/stem-splitter.png" alt="Stem Splitter" width="100%"><br>**Stem Splitter** – vocals, drums, bass and more with Demucs | <img src="docs/screenshots/mastering.png" alt="Mastering" width="100%"><br>**Mastering** – match a mix to a reference track |
| <img src="docs/screenshots/karaoke.png" alt="Karaoke Export" width="100%"><br>**Karaoke Export** – word timing, .lrc and lyric videos | <img src="docs/screenshots/video-composer.png" alt="Video Composer" width="100%"><br>**Video Composer** – music that follows the cuts of a video |
| <img src="docs/screenshots/ai-chat.png" alt="AI Chat" width="100%"><br>**AI Chat** – Claude or ChatGPT as a music assistant (your own API key) | <img src="docs/screenshots/settings-ai-engines.png" alt="Settings → AI Engines" width="100%"><br>**Settings → AI Engines** – install the local AI models with one click |
| <img src="docs/screenshots/settings-hardware.png" alt="Settings → Hardware" width="100%"><br>**Settings → Hardware** – what this PC can run, and how fast | <img src="docs/screenshots/settings-models.png" alt="Settings → Models" width="100%"><br>**Settings → Models** – downloaded models, sizes and the models folder |
| <img src="docs/screenshots/settings-shortcuts.png" alt="Settings → Shortcuts" width="100%"><br>**Settings → Shortcuts** – Ableton Live 12 or Cubase key layout | <img src="docs/screenshots/settings-ai.png" alt="Settings → AI" width="100%"><br>**Settings → AI** – Claude or ChatGPT for the AI chat |
| <img src="docs/screenshots/settings-general.png" alt="Settings → General" width="100%"><br>**Settings → General** – language and VST plugin folders | <img src="docs/screenshots/settings-audio.png" alt="Settings → Audio" width="100%"><br>**Settings → Audio** – sample rate and buffer size |
| <img src="docs/screenshots/settings-appearance.png" alt="Settings → Appearance" width="100%"><br>**Settings → Appearance** – dark or light theme | <img src="docs/screenshots/settings-updates.png" alt="Settings → Updates" width="100%"><br>**Settings → Updates** – automatic updates from GitHub releases |

**Beta testers wanted** ([guide, German](docs/BETA.md)): we are looking for testers, especially with **NVIDIA cards**: open *Feedback → Record a detailed log*, reproduce the problem, then attach the saved log to a GitHub issue. Nothing is sent automatically.

All changes of every version: [CHANGELOG.md](CHANGELOG.md)

### New in 0.16.1

- **Support the project:** Settings → About has a *Donate with PayPal* button, next to the GitHub star. Everything stays free.
- **Cloud Rendering (Pro)** appears in the menu as *Coming soon*: an optional paid extra that renders on fast NVIDIA graphics cards in the cloud. Everything you have now stays free and local.

### New in 0.16

- **Stems are kept and exported properly:** after splitting, *Save to library* puts the stems into their own folder in the Library (tab *Stems*, grouped by song, with tags and tempo). *Export…* writes every stem as its own file in the format your DAW wants: WAV 16/24/32-bit, AIFF, FLAC or MP3.
- **Library with tabs and search:** *My tracks* (songs and loops from Create music, imports), *Stems* and *Samples*. Search by name, tag or BPM (`124`, `120-130`). Tags can be set when creating (Create music → Tags), when saving stems, and later on every item. Every item can be exported. Samples can be copied into the Library (*+ Library*).
- **Loops stay in sync:** loops go into the Studio with their exact tempo and beat 1 at the file start, so AUTO SYNC and *Sync all* no longer measure them again and nudge them off the grid.
- **Cancel stops within seconds:** a model that cannot stop in time (ACE-Step on the CPU) makes the AI engine restart itself.
- **Updates no longer ask you to close the app:** the AI engine and its workers are ended before installing.
- **More graphics cards:** MusicGen medium and large run on AMD / Intel cards with 8 / 16 GB through DirectML (small on any DirectX 12 card).
- **AI assistant: Grok (xAI) and Ollama.** Ollama runs a model on your own PC: free, no account, no key.
- **Settings → About:** project, links, and a request for a GitHub ⭐. Vocal Editor, AI Instruments, Karaoke Export and Video Composer show "Coming soon" until they are finished.
- Windows *Settings → Apps* shows the description, project page and help link.

### New in 0.15.1

- **Copying text works again:** since 0.14.2 Ctrl+C, Ctrl+A, Ctrl+V and Ctrl+X were taken by the Studio everywhere, so log texts could not be copied. They now copy clips only in the Studio, piano roll and mixer, and never while text is selected or a dialog is open.
- **Right-click menu for text:** Copy / Cut / Paste / Select all on selected text and in text fields.

### New in 0.15

- **ACE-Step 1.5 turbo (experimental): songs with vocals also without a suitable graphics card.** The 2B turbo model needs only 8 steps and runs "DiT only" (without its language model), the mode the project recommends for small machines. On the processor it is slow but works with 16 GB RAM; with an NVIDIA card choose the CUDA variant of PyTorch. Install: *Settings → AI Engines → ACE-Step 1.5* (needs Python 3.11 or 3.12 and Git; the model, about 10 GB, downloads on the first song). Written from the project documentation and not yet tested on real hardware.
- **Code signing prepared** (SignPath Foundation): the release workflow signs the installer as soon as the project is approved.

### New in 0.14.4

- **MusicGen makes several clips side by side on the CPU:** with more than one song or variation, up to 4 clips are rendered together in one pass (as many as the free memory allows). One clip alone keeps the processor busy only in short bursts, because MusicGen writes one token after the other; clips side by side share every step, so all cores have work and several clips take far less than that many times as long. The graphics card path (DirectML) still makes them one after the other.
- Install notes explain the Windows SmartScreen warning of the unsigned installer.

### New in 0.14.3

- **The CPU is used fully** when a model runs on the processor: the AI now computes on all CPU threads (hyper-threads included) instead of one per core, and the AI backend runs at below-normal priority so the app and Windows stay responsive. `AMS_CPU_THREADS` still sets another number.
- **Loop titles** say what they are: "Deep house – Loop 124 BPM 4 bars" (in the library and as the track name in the Studio).

### New in 0.14.2

- **Copy, cut and paste in the Studio** (Ctrl+C, Ctrl+X, Ctrl+V, in the Ableton and the Cubase layout): pasting puts the clips at the playhead and moves the playhead behind them, so pressing Ctrl+V again lines up copies without a gap (ideal for loops). Clips from one track go onto the selected track. Ctrl+D with several clips duplicates all of them.
- **Shortcuts no longer go dead** after choosing a value in a drop-down list (Grid, Count-in, ...) or clicking a button: Space, Ctrl+C and the rest work at once. Space also plays and pauses while a number field (BPM) has the focus.
- Undo no longer leaves a deleted clip selected (Ctrl+X or Delete did nothing afterwards).

### New in 0.14.1

- **Faster on the CPU:** the AI used at most 4 CPU threads (a 6-core/12-thread CPU sat at about 25 %). It now computes on one thread per physical core (all cores of CPUs without hyper-threading, minus one on CPUs with up to 4 threads). Set the environment variable `AMS_CPU_THREADS` to choose another number.

### New in 0.14

- **Create loop** in Create music: a loop of exactly 1, 2, 4, 8 or 16 bars that starts on beat 1 and repeats seamlessly. The generator renders a little more music than needed; the loop is cut on the beat grid of the tempo the model really played, and the music after the loop end is crossfaded into its start, so copies placed one after the other (Ctrl+D in the Studio) play endlessly without a gap or a click. Loops go into the Studio synced to the project tempo and are saved as FLAC/WAV without fades.

### New in 0.13.1

- **Cancel button in Create music** (and a ✕ next to the progress in the status bar): stops a running or waiting generation at the next step. External workers (DiffRhythm, the DirectML graphics-card worker) are stopped at once. Songs that were already finished stay in the library.

### New in 0.13

- **Studio works like Ableton and Cubase:** drag a loop in the ruler (seamless wrap), markers and cycle markers, tempo and time-signature changes, multi-select and consolidate, crossfades, volume/pan automation lanes, reverb/delay return tracks with per-track sends, group tracks, loop recording into take lanes with comping, warp markers, count-in, punch in/out, a channel tab, split a clip into stems from the right-click menu, quick export.
- **Shortcuts** for all of the above in both the Ableton Live 12 and the Cubase layout (Settings → Shortcuts).
- **Create music** is translated into German and warns *before* rendering when the chosen model cannot sing.
- **Vocals fix:** lyrics sent to ACE-Step now always carry a vocal tag and a structure tag, which should stop typed lyrics from coming out as an instrumental (still to be confirmed with the real model on an NVIDIA PC).
- **Detailed log for beta testers** in the Feedback dialog (on/off, copy, save as file).
- AI engines are no longer shown as "not installed" when they are.

## Low-resource mode (8 GB VRAM / 12 GB RAM)

The backend measures VRAM/RAM at startup (`GET /health` → `hardware.resources`) and switches to
low-memory mode on small machines: CPU offload for idle model parts, fp16, shorter max song length,
small Demucs segments, and a smaller Whisper model. Only one heavy generation runs at a time.
Override detection with `AMS_VRAM_GB=8`.

Extra engines are optional and installed separately:

```bash
pip install git+https://github.com/ace-step/ACE-Step.git   # full-song generation + LoRA
pip install matchering faster-whisper                        # mastering, lyric timing
# ffmpeg on PATH for karaoke video export
```

LoRAs: drop `.safetensors` files/folders into `~/.ai-music-studio/loras` or import them in the Music Generator panel.

## Architecture

```
ai-music-studio/
├── apps/
│   ├── desktop/      # Electron app (TypeScript + React)
│   └── server/       # FastAPI backend (Python)
├── packages/
│   ├── audio-engine/ # JUCE C++ audio engine
│   └── vst-bridge/   # VST3 Bridge Plugin (JUCE C++)
```

## Optional: build from source (developers only)

*Not needed to use the app: the [Windows installer](#easy-windows-installation) is all you need.* This is for people who want to change the code.

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+
- CMake 3.22+ (for JUCE audio engine / VST bridge)
- JUCE 7.x (auto-downloaded via CMake)

### Install & Run

```bash
# 1. Install Node dependencies
pnpm install

# 2. Set up Python environment
cd apps/server
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt

# 3. Start the Python backend
python main.py

# 4. In another terminal — start the Electron app
cd ../..
pnpm dev
```

### Build the VST3 Bridge Plugin

```bash
cd packages/vst-bridge
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# Plugin installs to C:\Program Files\Common Files\VST3\AMS Bridge.vst3
```

## AI Configuration

Open **Settings → AI** in the app:

1. Choose **Claude (Anthropic)** or **ChatGPT (OpenAI)**
2. Paste your API key
3. Select the model

The AI assistant helps with chord progressions, lyrics, music theory, and generation tasks.

## Optional: installing AI models by hand (developers only)

Users install everything with **Settings → AI Engines → Install selected** in the app. The commands below are only for a development setup:

```bash
# Stem separation (Meta Demucs) — requires ~2 GB
pip install demucs

# Audio → MIDI (Spotify basic-pitch)
pip install basic-pitch

# GPU acceleration
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

## Languages

Switch language in **Settings → Appearance → Language**:
- English, Deutsch, Français, Español, Italiano, Português, 中文, 日本語, 한국어

## Code signing policy

The Windows installer is **not code-signed yet**, so Windows SmartScreen warns on the first install (see *Easy Windows installation*). We applied to the [SignPath Foundation](https://signpath.org) for free code signing for open-source projects; they asked us to come back once the project is better known, and we will reapply. You can help: a ⭐ on GitHub, a post or a video about the app all count. When signing is in place, these rules apply:

- Only installers built by the GitHub Actions workflow `.github/workflows/release.yml` from this repository are signed; nothing built elsewhere.
- Committers and reviewers: [pierrecinema](https://github.com/pierrecinema) (owner; changes are made with the help of AI coding tools and merged by the owner's instruction)
- Approvers (sign each release): [pierrecinema](https://github.com/pierrecinema)

### Privacy

This program does not send any data on its own except where the user turns a feature on:
- **Update check:** asks GitHub for the latest release (no personal data).
- **AI engines and models:** downloads packages from PyPI and model files from Hugging Face when you install them in *Settings → AI Engines / Models*.
- **AI chat:** sends your chat messages to Anthropic (Claude), OpenAI (ChatGPT) or xAI (Grok) only if you enter your own API key in *Settings → AI*. With Ollama the chat stays on your PC.
- **Feedback / logs:** reports and detailed logs are only copied or saved on your PC; nothing is uploaded automatically.

Music generation itself runs locally on your computer.

## License

GPL-3.0 — see [LICENSE](LICENSE)

## Contributing

PRs welcome. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details.
