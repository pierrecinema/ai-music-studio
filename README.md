# AI Music Studio

**Open-source AI-powered music studio** — an alternative to ACE Studio built with open-source tools and configurable AI backends (Claude by Anthropic or ChatGPT by OpenAI).

## Features

| Feature | Technology |
|---|---|
| **Studio (DAW)** | Arrangement with loop/locators, markers, tempo and time-signature track, automation, return tracks with sends, group tracks, take lanes and comping, warp markers, crossfades, count-in and punch, Ableton Live 12 or Cubase shortcuts |
| **Song generator** | ACE-Step (songs with vocals), DiffRhythm, MusicGen; a cappella mode (voice only, cleaned with Demucs); every track starts on beat 1 |
| **Piano Roll** | Electron + React (custom built) |
| **AI Vocal Synthesis** | DiffSinger / VITS (local GPU) + cloud fallback |
| **AI Instruments** | DDSP neural synthesis + FluidSynth fallback |
| **Voice Cloning** | OpenVoice / Coqui TTS |
| **Stem Separation** | Meta's Demucs (htdemucs_ft) |
| **Audio → MIDI** | Spotify basic-pitch |
| **Video Composer** | OpenCV scene analysis + AI score generation |
| **VST3 Plugin Bridge** | JUCE C++ (AMS Bridge) |
| **AI Chat** | Claude (Anthropic) or ChatGPT (OpenAI) — your choice |
| **Multilingual** | 🇩🇪 🇬🇧 🇫🇷 🇪🇸 🇮🇹 🇵🇹 🇨🇳 🇯🇵 🇰🇷 |

**Manual (German, incl. first-time setup):** [docs/MANUAL.md](docs/MANUAL.md)
**Beta testing (German):** [docs/BETA.md](docs/BETA.md). We are looking for testers, especially with **NVIDIA cards**: open *Feedback → Record a detailed log*, reproduce the problem, then attach the saved log to a GitHub issue. Nothing is sent automatically.

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

## Getting Started

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

## Installing Optional AI Models

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

## License

GPL-3.0 — see [LICENSE](LICENSE)

## Contributing

PRs welcome. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details.
