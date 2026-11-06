# AI Music Studio

**Open-source AI-powered music studio** — an alternative to ACE Studio built with open-source tools and configurable AI backends (Claude by Anthropic or ChatGPT by OpenAI).

## Features

| Feature | Technology |
|---|---|
| **Piano Roll + Timeline** | Electron + React (custom built) |
| **AI Vocal Synthesis** | DiffSinger / VITS (local GPU) + cloud fallback |
| **AI Instruments** | DDSP neural synthesis + FluidSynth fallback |
| **Voice Cloning** | OpenVoice / Coqui TTS |
| **Stem Separation** | Meta's Demucs (htdemucs_ft) |
| **Audio → MIDI** | Spotify basic-pitch |
| **Video Composer** | OpenCV scene analysis + AI score generation |
| **VST3 Plugin Bridge** | JUCE C++ (AMS Bridge) |
| **AI Chat** | Claude (Anthropic) or ChatGPT (OpenAI) — your choice |
| **Multilingual** | 🇩🇪 🇬🇧 🇫🇷 🇪🇸 🇮🇹 🇵🇹 🇨🇳 🇯🇵 🇰🇷 |

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
