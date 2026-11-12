# Installation and Setup

## Install the app

1. Download `AIMusicStudio-Setup-<version>.exe` from the [latest release](https://github.com/pierrecinema/ai-music-studio/releases/latest).
2. Run it. Windows shows a blue window **"Windows protected your PC"** (SmartScreen) because the installer is not code-signed yet. It is not a virus warning: click **More info → Run anyway**.
3. Start AI Music Studio. The [[Studio]], [[Piano Roll]], [[Mixer]] and [[Library]] work right away.

Only one window runs at a time: starting the app again brings the open window to the front.

## Install the AI engines (once)

The AI features (songs, loops, stems, mastering, Audio → MIDI) run in a Python environment that the app sets up by itself.

1. Install **Python 3.11** (3.12 works too) from [python.org](https://www.python.org/downloads/) and tick **"Add python.exe to PATH"**, or run `winget install Python.Python.3.11`.
2. In the app: **[[Settings]] → AI Engines**, tick the packages and click **Install selected**. The log below shows the progress; when it ends green, the AI backend restarts by itself.

| Package (as named in the app) | What for |
|---|---|
| Core backend | the AI server, AI Chat, MIDI tools (always installed) |
| PyTorch | base of most local models (CPU, or CUDA for NVIDIA cards) |
| Stem separation (Demucs) | [[Stem Splitter]]: vocals, drums, bass, piano, guitar |
| Fast vocal separation (vocals + instrumental, 4 stems) | the fast Stem Splitter modes, on the graphics card (AMD, Intel, NVIDIA) |
| Audio → MIDI (basic-pitch) | notes from a stem into the [[Piano Roll]] |
| Mastering (Matchering) | [[Mastering]] |
| Lyric timing (faster-whisper) | word timing for the coming karaoke export |
| Video analysis | for the coming video composer |
| Music generator (ACE-Step) | full songs and LoRA (needs Git) |
| Light music generators (MusicGen, AudioLDM 2, MusicLDM) | instrumental clips and loops; run on old PCs (model weights: non-commercial use) |
| Graphics card support (AMD / Intel, DirectX 12) | MusicGen small on AMD and Intel graphics cards |
| ACE-Step 1.5: songs with vocals, also without a graphics card | songs with vocals from your lyrics, the turbo model also on the processor (experimental) |
| DiffRhythm: full songs in one go | songs with vocals, NVIDIA only (experimental) |
| LoRA training (ACE-Step) | train your own style (NVIDIA), or build a bundle for another PC |
| Audio → MIDI (MuScriptor) | more accurate transcription (non-commercial only) |

Models are downloaded on first use (several GB, once). Where they are stored: [[Settings]] → Models.

## Updates

The app checks for new versions at start and every few hours and installs them with one click (bottom right, or [[Settings]] → Updates). The app closes, installs and starts again by itself.

## Where things are stored

| What | Where |
|---|---|
| Settings, logs | `%APPDATA%\desktop` |
| AI environments | `%APPDATA%\desktop\engines` |
| Models | `%USERPROFILE%\.ai-music-studio\models` (changeable in Settings → Models) |
| LoRAs | `%USERPROFILE%\.ai-music-studio\loras` |
| Your songs and stems | `Music\AI Music Studio` |
