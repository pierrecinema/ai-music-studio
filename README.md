# AI Music Studio

[![Downloads](https://img.shields.io/github/downloads/pierrecinema/ai-music-studio/total?label=downloads&color=7c3aed)](https://github.com/pierrecinema/ai-music-studio/releases) [![Latest release](https://img.shields.io/github/v/release/pierrecinema/ai-music-studio?label=latest&color=7c3aed)](https://github.com/pierrecinema/ai-music-studio/releases/latest) [![License](https://img.shields.io/github/license/pierrecinema/ai-music-studio)](LICENSE)

[![AI Music Studio – watch the 0.60 tour on YouTube (2 minutes)](https://img.youtube.com/vi/FTNmsRxWuy4/hqdefault.jpg)](https://youtu.be/FTNmsRxWuy4)

**🎬 [Watch the 0.60 tour on YouTube (2 minutes)](https://youtu.be/FTNmsRxWuy4)**

**Free, open-source AI music studio for Windows:** make songs, seamless loops and stems with AI on your own PC, split songs into stems, turn audio into MIDI, sing your melodies with AI voices, play AI instruments, mix and master, and arrange it all in a full studio (DAW) with piano roll, mixer, automation and VST plugins. No account, no subscription. The AI assistant works with Claude, ChatGPT, Gemini, Grok or completely free and local with Ollama.

## Easy Windows installation

No programming, no command line: just the installer.

1. **Download** `AIMusicStudio-Setup-<version>.exe` from the **[latest release](https://github.com/pierrecinema/ai-music-studio/releases/latest)**.
2. **Run it.** The first time, Windows shows a blue window *"Windows protected your PC"* (Microsoft Defender SmartScreen), because the installer is not code-signed yet and Windows does not know the publisher. It is not a virus warning: click **More info**, then **Run anyway**. Some antivirus programs ask as well.
3. **Start AI Music Studio.** The Studio, piano roll, mixer and library work right away.
4. **For the AI features** (songs, loops, stems, mastering): on the first start the **setup assistant** checks your computer and installs a package with one click (*Recommended*, *Everything* or *Studio only*). Nothing to install by hand: if there is no fitting Python on the PC, the app sets up its own. The models download once (several GB).

**Updates come automatically:** the app checks for new versions and installs them with one click (Settings → Updates). The SmartScreen warning only comes with the installer downloaded in the browser.

**[📖 Wiki: every menu and function explained](https://github.com/pierrecinema/ai-music-studio/wiki)** · Manual (German, incl. first-time setup): [docs/MANUAL.md](docs/MANUAL.md) · Testing and reporting problems: [docs/TESTING.md](docs/TESTING.md) · Test plan: [docs/TESTPLAN.md](docs/TESTPLAN.md)

### ☕ Buy me a coffee

AI Music Studio is free and stays free, made in my spare time. If it saves you time or makes you a track you love, you can buy me a coffee. It keeps the project going: new features, more AI models and code signing for the installer. A ⭐ on GitHub helps too!

[![Buy me a coffee with PayPal](https://img.shields.io/badge/%E2%98%95%20Buy%20me%20a%20coffee-PayPal-0070ba?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/djpedroflores)

## What's new

### New in 1.0: the first stable version

- **Every page has a new look** since 0.99: the Studio with the Piano Roll under the tracks, Create, the Vocal Editor with 39 built-in voices, AI Instruments on a stage, a Mixer with a mix assistant, the Stem Splitter with a lane per stem, and Audio → MIDI with goal cards and a result table.
- **Everything works together:** a song from Create goes to the Stem Splitter, Audio → MIDI, Mastering or the Studio with one click; the stems become tracks, the melody is sung by an AI voice, the mix is checked by the assistant and mastered.
- **Easy start:** the setup assistant installs the AI engines with one click, the app updates itself, and it speaks eight languages.
- Still coming: Karaoke Export, Video Composer and Cloud Rendering (Pro).
- Full history: [CHANGELOG.md](CHANGELOG.md).

## What is in the app

Everything below works today, on your own PC, without an account. The menu on the left of the app, from top to bottom:

| Menu | What you can do |
|---|---|
| **✨ Create Music** | Songs from a style description and lyrics (with vocals, instrumental or a cappella), seamless loops of 1–16 bars that start on beat 1, in *Simple*, *Studio* or *Loops* mode. Lyrics editor with section buttons, auto structure and AI lyrics; the built-in singers of the Vocal Editor can sing your song; three 10-second voice previews; LoRA styles (import, search on Hugging Face, train your own); a source or reference song by drag and drop; several takes with waveforms, seeds and a queue. Every take goes to the Studio, Mastering, the Stem Splitter or Audio → MIDI with one click. |
| **🎵 Library** | Every song, loop, stem and sample with tempo, tags and its prompt; search by name, tag or BPM (`120-130`); favourites; your Ableton library and other sample folders; export as WAV 16/24/32 bit, AIFF, FLAC or MP3; *Start on beat 1*; to the Studio, Mastering, Stem Splitter or MIDI. |
| **⊞ Studio** | The arrangement (DAW): audio and MIDI tracks, drag and drop from the Library or Explorer, loop range, markers, tempo and time-signature track, snap grid with a magnet, scissors tool, warp markers, AUTO SYNC of everything to the project tempo, multi-select, copy / paste / duplicate, clip fades and gain, volume / pan / plugin automation lanes, return tracks with sends, group tracks, track colours, undo / redo, save and open projects. Recording: arm tracks, count-in, punch in / out, loop recording with comping, audio input choice, MIDI keyboard recording. The **Piano Roll sits right under the tracks**; the effects of the selected track are rack modules with knobs at the right. VST3 / VST2 effects (64-bit and 32-bit) and instruments on tracks and the master, ASIO output. Shortcuts of Ableton Live 12 or Cubase. |
| **🎹 Piano Roll** | Draw, select, move, quantize (strength, swing) and erase notes, velocity lane, note length, **keys on the left or a keyboard below with the notes coming down**, record from the screen keys or a MIDI keyboard, import and export MIDI files. |
| **🎤 Vocal Editor** | Your MIDI melody sung with your lyrics: **39 built-in voices of 20 singers with names**, in the styles Pop, Rock, Ballad, Soul and Rap; hear every voice and every style first; the syllables sit right on the notes; DiffSinger voices for exact notes; the finished vocal lands on a new track with the style's effects. |
| **🎻 AI Instruments** | A stage with six musicians: **Composer** (writes a MIDI song), **Drummer**, **Bass player** and **Guitarist** (a virtual band that follows your chords), **Orchestra** (13 AI-played instruments) and **AI soloist**. Preview before it goes into the song, *3 ideas*, *Add the whole band*, and *AI render* for a real-sounding recording. Sound packs with recorded instruments (Band, GeneralUser GS, MuseScore General, Salamander piano, VSCO-2 orchestra). |
| **🎚 Mixer** | A card per track (name in the track colour, M / S, fader with LED meter, pan, sends, effects, output), the master and its loudness against a target (streaming −14, podcast −16, loud −9, broadcast −23 LUFS), returns, and the **mix assistant**: it measures every track and the whole mix and suggests levels, panning and low-end fixes, each with its reason and a *Do it* button, or *Balance the whole mix* in one click (Ctrl+Z takes it back). |
| **✂ Stem Splitter** | Splits a song into vocals, drums, bass, piano, guitar and the rest (Demucs; fast vocals-plus-instrumental and 4-stem modes on AMD, Intel and NVIDIA graphics cards). The song as a waveform on top, **every stem in its own lane** with M, S, volume, *hear only this stem* and → MIDI / Studio / Mastering; remix export (karaoke without vocals, a version without drums); save to the Library or export every stem for any DAW. |
| **♪ Audio → MIDI** | A whole song, or just its melody, bassline or drums, becomes editable MIDI: each part with the method that suits it (one-voice lines for vocals and bass, chords for piano and guitar, kick / snare / hi-hat for drums), on the bars and beats of the song, with its tempo, key and chords. A table shows every part with note preview, instrument and how sure the detection is; into the Studio with an optional chord track and chord markers. |
| **◎ Mastering** | A full mastering workspace: an AI assistant that measures the song against the genre and suggests settings with reasons; EQ, dynamic EQ, compressor, multiband, saturation / exciter, stereo, true-peak limiter to a loudness target, master gain; cut, fade, normalise; LUFS / true peak / spectrum / goniometer before and after with same-loudness A/B; reference match; **album mastering** (several songs on one timeline, even loudness, transitions); export in 8 formats with metadata. |
| **💬 AI Chat** | A music assistant for chords, lyrics and ideas that can also use the app (make a track, add notes, change the tempo). Claude, ChatGPT, Gemini, Grok, Ollama or a local server (LM Studio, KoboldCpp, llama.cpp). |
| **⚙ Settings** | Language (English, German, French, Spanish, Italian, Portuguese, Russian, Chinese), VST plugins, AI keys, **AI Engines** (install the local models with one click), hardware rating of your PC, models folder and disk space, shortcuts, audio (devices, ASIO, sample rate, buffer, test tone, CPU load, sound packs), MIDI devices with ready mappings and MIDI learn, four looks, updates. |

**Also:** the top bar with File menu, transport, BPM, AUTO SYNC, metronome and time signature; a **setup assistant** that installs the AI engines for you on the first start; automatic updates; and an **MCP server** so AI agents can use the whole app (`http://127.0.0.1:38765/mcp`). It runs on the CPU and is faster on NVIDIA (CUDA) and AMD / Intel graphics cards (DirectML), also on 8 GB VRAM / 12 GB RAM PCs. [Every menu and function in detail: the wiki.](https://github.com/pierrecinema/ai-music-studio/wiki)

### Technology

| Part | Technology |
|---|---|
| Songs, loops | ACE-Step 1.5 / v1, MusicGen, DiffRhythm; own loop cutter on the beat grid |
| Stems | Meta Demucs (htdemucs_ft), fast vocal separation on the graphics card |
| Audio → MIDI | Spotify basic-pitch, NMF drum transcription, own tempo, key and chord detection |
| Singing | SoulX-Singer and VocalSet voices, DiffSinger, ACE-Step 1.5 for rap |
| AI instruments | MIDI-DDSP, ACE-Step cover, recorded sound packs |
| Mastering | own DSP (Web Audio worklets), Matchering, ffmpeg |
| Plugins | JUCE plugin host for VST3 / VST2 |

### Coming soon

These menu items are dimmed in the app and open a *Coming soon* page.

| Feature | What it will do |
|---|---|
| **Karaoke Export** | Word timing, .lrc files and lyric videos |
| **Video Composer** | Music that follows the cuts of your video |
| **Cloud Rendering (Pro)** | Optional: render on fast NVIDIA cards in the cloud. Everything above stays free and local. |

## Screenshots

*Shown with demo content: example songs and a demo project, in the Hardware rack look (the first picture in the standard Dark look).*

<img src="docs/screenshots/studio-pianoroll.png" alt="Studio with the Piano Roll under the tracks" width="100%">
**Studio** – tracks with waveforms and MIDI clips, loop and markers, volume automation, the Piano Roll right under the tracks, the track's instrument and effects at the right.

<img src="docs/screenshots/studio.png" alt="Studio in the Hardware rack look" width="100%">
**Studio, effects** – the selected track's effects (EQ, compressor, reverb) as rack modules with knobs.

<img src="docs/screenshots/create-studio.png" alt="Create music" width="100%">
**Create music** – describe the style, write lyrics, pick a model and make a song or a seamless loop (1–16 bars). Simple, Studio and Loops mode.

<img src="docs/screenshots/library.png" alt="Library" width="100%">
**Library** – every created song and loop is kept with its tempo, tags and prompt; stems and sample folders have their own tabs.

<img src="docs/screenshots/piano-roll.png" alt="Piano Roll" width="100%">
**Piano Roll** – draw, move and quantize notes; the keys on the left or a keyboard below with the notes coming down.

<img src="docs/screenshots/vocal-editor.png" alt="Vocal Editor" width="100%">
**Vocal Editor** – 39 built-in voices with names sing your MIDI melody and lyrics; hear a voice and every style (Pop, Rock, Ballad, Soul, Rap) before you sing.

<img src="docs/screenshots/instruments.png" alt="AI Instruments" width="100%">
**AI Instruments** – a stage with a composer, drummer, bass player, guitarist, orchestra and AI soloist; click a musician, hear it, get three ideas, add it to the song or render it as a real recording.

<img src="docs/screenshots/mixer.png" alt="Mixer" width="100%">
**Mixer** – a card per track, the master with its loudness against a target, returns and the mix assistant with one-click suggestions.

<img src="docs/screenshots/stem-splitter.png" alt="Stem Splitter" width="100%">
**Stem Splitter** – the song on top, every stem in its own lane with M, S, volume, hear-only and → MIDI / Studio / Mastering.

<img src="docs/screenshots/audio-to-midi.png" alt="Audio to MIDI" width="100%">
**Audio → MIDI** – say what should become MIDI (whole song, melody, bassline, drums); every part with note preview, instrument and how sure the detection is.

<img src="docs/screenshots/mastering.png" alt="Mastering" width="100%">
**Mastering** – waveform before and after with a marked region to cut, fade or change the volume; meters before and after (loudness, true peak, spectrum, goniometer), same-loudness A/B and export in every format.

<img src="docs/screenshots/mastering-assistant.png" alt="Mastering assistant" width="100%">
**Mastering assistant** – measures tone balance per octave, dynamics, stereo and loudness against the genre and suggests settings, each with its reason; apply all with one click and compare.

<img src="docs/screenshots/album-mastering.png" alt="Album mastering" width="100%">
**Album mastering** – the songs of an album on one timeline: measure, even out loudness and tone, hear the transitions and export everything at once.

<img src="docs/screenshots/setup-assistant.png" alt="Setup assistant" width="100%">
**Setup assistant** – on the first start: checks the computer, offers *Recommended*, *Everything* or *Studio only*, and installs with one click (it sets up its own Python if needed).

<img src="docs/screenshots/ai-chat.png" alt="AI Chat" width="100%">
**AI Chat** – Claude, ChatGPT, Gemini, Grok or a local model as a music assistant that can also make songs and tracks.

### Looks

*Settings → Appearance* has four looks. Here is the same Studio project in each of them:

<img src="docs/screenshots/looks-all.png" alt="The Studio in all four looks" width="100%">

<img src="docs/screenshots/layout-dark.png" alt="Look: Dark" width="100%">
**Dark** – the standard look.

<img src="docs/screenshots/layout-light.png" alt="Look: Light" width="100%">
**Light** – the same layout on a light background.

<img src="docs/screenshots/layout-swiss.png" alt="Look: Swiss" width="100%">
**Swiss** – white and black, big heavy numbers for position and tempo, the transport as big black blocks, large capital track names, no rounded corners, orange as the only colour, the menu as a bar along the bottom.

<img src="docs/screenshots/layout-rack.png" alt="Look: Hardware rack" width="100%">
**Hardware rack** – grey device fronts with screws, a wide green LCD for position and tempo, the menu at the side as rack keys, the selected track's effects as rack modules with knobs at the right.

### Settings

| | |
|---|---|
| <img src="docs/screenshots/settings-ai-engines.png" alt="Settings → AI Engines" width="100%"><br>**AI Engines** – install the local AI models with one click | <img src="docs/screenshots/settings-hardware.png" alt="Settings → Hardware" width="100%"><br>**Hardware** – what this PC can run, and how fast |
| <img src="docs/screenshots/settings-audio.png" alt="Settings → Audio" width="100%"><br>**Audio** – devices, export sample rate, buffer size and sound packs | <img src="docs/screenshots/settings-plugins.png" alt="Settings → Plugins" width="100%"><br>**Plugins** – your VST3 and VST2 plugins, found automatically |
| <img src="docs/screenshots/settings-models.png" alt="Settings → Models" width="100%"><br>**Models** – downloaded models, sizes and the models folder | <img src="docs/screenshots/settings-ai.png" alt="Settings → AI" width="100%"><br>**AI** – Claude, ChatGPT, Gemini, Grok, Ollama or a local server for the AI chat |
| <img src="docs/screenshots/settings-shortcuts.png" alt="Settings → Shortcuts" width="100%"><br>**Shortcuts** – Ableton Live 12 or Cubase key layout | <img src="docs/screenshots/settings-general.png" alt="Settings → General" width="100%"><br>**General** – language |
| <img src="docs/screenshots/settings-appearance.png" alt="Settings → Appearance" width="100%"><br>**Appearance** – Dark, Light, Swiss or Hardware rack | <img src="docs/screenshots/settings-updates.png" alt="Settings → Updates" width="100%"><br>**Updates** – automatic updates from GitHub releases |

**Found a problem?** ([guide, German](docs/TESTING.md)) Reports are very welcome, especially from PCs with **NVIDIA cards**: open *Feedback → Record a detailed log*, reproduce the problem, then attach the saved log to a GitHub issue. Nothing is sent automatically.

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
│   ├── plugin-host/  # JUCE C++ host for VST3 / VST2 plugins
│   └── vst-bridge/   # VST3 Bridge Plugin (JUCE C++)
```

## Optional: build from source (developers only)

*Not needed to use the app: the [Windows installer](#easy-windows-installation) is all you need.* This is for people who want to change the code.

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+
- CMake 3.22+ (for the JUCE plugin host / VST bridge)
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

Switch language in **Settings → General → Language**:
- Fully translated: English, Deutsch, Français, Español, Italiano, Português, Русский, 中文
- How to add or improve a translation: [docs/TRANSLATING.md](docs/TRANSLATING.md)

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
