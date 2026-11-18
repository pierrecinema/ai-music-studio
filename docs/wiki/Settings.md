# Settings ⚙

Open with the gear at the bottom of the left menu (Ableton layout: Ctrl+,). Close with ✕, **Esc** or the gear again.

| Tab | What is there |
|---|---|
| **General** | Language: the whole app in English, Deutsch, Français, Español, Italiano, Português and 中文; the menu in 日本語 and 한국어 (the rest in English for now) |
| **Plugins** | Your VST3 and VST2 plugins, 64-bit and 32-bit (a 32-bit plugin runs in its own 32-bit plugin host): the folders that are searched (the usual ones, also under *Program Files (x86)*, plus **Add folder…** for your own), **Search for plugins** (also runs by itself on the first start), the list with name, vendor, type, format and bits, and a tick per plugin for the ones shown in the [[Studio]]. Files that could not be used (for example a plugin that crashed while being checked) are listed below. **Free instruments (open source):** **Install** downloads Dexed (FM synth) or Surge XT (all-round synth) from their official release into the app's plugin folder and searches it |
| **AI** | Provider for the [[AI Chat]] (Claude, ChatGPT, Grok, Ollama), API key, model |
| **AI Engines** | Tick packages and **Install selected**: see [[Installation and Setup]]. PyTorch variant (CPU or NVIDIA CUDA). The log can be selected and copied (Ctrl+C or right-click) |
| **Hardware** | What your PC can run and how fast: rating (*Entry* to *Studio*), per feature *Runs well* / *Slow here* / *Not possible* with reasons; *Show backend log file* |
| **Models** | Downloaded models with size and state; **Change folder…** (move the models to another drive), **Delete to free space**, **Free up space** (download caches), LoRAs |
| **Shortcuts** | Key layout **Ableton Live 12** or **Cubase**, plus your own keys for free combinations (column *Yours*), with the full list: [[Keyboard Shortcuts]] |
| **Audio** | Like the audio preferences of other DAWs. *Audio device:* driver type: **Windows** (standard) or **ASIO / other drivers** (through the plugin host: driver ASIO, Windows Audio or DirectSound, the device, its outputs, sample rate and buffer size, and **Driver settings (ASIO control panel)**; for the mainboard sound install ASIO4ALL or FlexASIO; the Library and Create previews stay on the Windows device), **audio input device** (recording, or *No input*), **audio output device** (used everywhere in the app; *Refresh* after plugging something in). *Sample rate:* playback rate (automatic or 44.1–96 kHz) and the **export sample rate**. *Latency:* **buffer size** with the real input, output and overall latency, **driver error compensation** (ms, moves recordings earlier). *Test:* **test tone** on / off with volume and frequency (to hear whether the right card plays) and **simulated CPU load** (turn it up while a song plays: if it crackles early, use a larger buffer) |
| **Appearance** | The look of the app: **Dark**, **Light**, **Analog console** (wood, amber, glowing display), **Swiss** (white and black, big type, menu as a bar at the bottom) or **Hardware rack** (grey device fronts, green LCD, amber) |
| **Updates** | Current version, **Check for updates**, install with one click |
| **About** | Version, project page on GitHub, report a problem, *Donate with PayPal* |
