# MCP: let AI agents use the app

While the app runs with the AI backend installed, it offers an MCP server (Model Context Protocol) at `http://127.0.0.1:38765/mcp`. If the port is taken, the next free one is used; the current address is in the status bar and in `%APPDATA%\desktop\server.json`.

Add it to Claude Code once:

```
claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp
```

Check with `claude mcp list`. Other MCP clients that support HTTP use the same URL.

Tools: generate music, LoRAs, stems, Audio → MIDI, mastering, system info and more. The server listens only on `127.0.0.1`; the tools read files you give them as paths, so use it only with agents you trust.
