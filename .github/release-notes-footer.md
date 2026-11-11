### Install
Download `AIMusicStudio-Setup-*.exe` below and run it. Unsigned alpha: Windows SmartScreen may warn, choose "More info" then "Run anyway".

### First start: AI engines
The AI backend needs Python 3.10+ (python.org, tick "Add to PATH"). Then open **Settings → AI Engines** and click **Install selected**. The app sets up its own environment, no manual pip needed.

### Hardware
- Windows 10/11 (64-bit)
- Runs on 8 GB VRAM / 12 GB RAM (automatic low-memory mode) and older CPUs; AMD cards via DirectML (very old cards may need the CPU variant)
- NVIDIA: pick the CUDA variant in AI Engines

### AI chat
Claude (Anthropic), ChatGPT (OpenAI) or Grok (xAI) with an API key, or free and local with Ollama: Settings → AI.

### MCP
MCP clients connect to `http://127.0.0.1:38765/mcp` while the app is running.

### Support the project
Free and open source. A ⭐ on GitHub or a donation via [PayPal](https://paypal.me/djpedroflores) helps to keep it going.
