### Install
Download `AIMusicStudio-Setup-*.exe` below and run it. The installer is not code-signed yet: Windows SmartScreen may warn, choose "More info" then "Run anyway".

### First start: setup assistant
On the first start a setup assistant checks the computer (graphics card, memory, free space) and installs the chosen package with one click: *Recommended*, *Everything* or *Studio only*. Nothing to do by hand: if the PC has no fitting Python, the app sets up its own Python 3.11. Later changes: **Settings → AI Engines**.

### Hardware
- Windows 10/11 (64-bit)
- Runs on 8 GB VRAM / 12 GB RAM (automatic low-memory mode) and older CPUs; AMD cards via DirectML (very old cards may need the CPU variant)
- NVIDIA graphics cards are used automatically

### AI chat
Claude (Anthropic), ChatGPT (OpenAI) or Grok (xAI) with an API key, or free and local with Ollama: Settings → AI.

### MCP
MCP clients connect to `http://127.0.0.1:38765/mcp` while the app is running.
