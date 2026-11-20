# MCP: let AI agents use the app

While the app runs with the AI backend installed, it offers an MCP server (Model Context Protocol) at `http://127.0.0.1:38765/mcp`. If the port is taken, the next free one is used; the current address is in the status bar and in `%APPDATA%\desktop\server.json`.

Add it to Claude Code once:

```
claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp
```

Check with `claude mcp list`. Other MCP clients that support HTTP use the same URL.

Tools: generate music, LoRAs, stems, Audio → MIDI, mastering, system info and more.

**Tools on the open project (0.91):** they work on the project you see in the app window (the window must be open):

| Tool | What it does |
|---|---|
| `app_get_project` | tempo and tracks (instrument, MIDI effects, sound, volume, pan, clips) |
| `app_list_plugins` | the plugins found on this PC (instrument, MIDI, effect) and the sound-pack instruments |
| `app_add_midi_track` | a new MIDI track (name, sound-pack program or built-in sound) |
| `app_set_instrument` | what plays a track: a VST instrument by name (for example `Dexed`), or a sound-pack program |
| `app_add_midi_effect` | an arpeggiator or sequencer (for example `BlueArp`, `Stochas`) in front of the VST instrument |
| `app_add_notes` | notes as a new clip (pitch, start and length in beats, velocity) |
| `app_set_track` | name, volume, pan, mute, solo |
| `app_set_bpm` | the tempo |
| `app_transport` | play, stop, back to the start |

Example for Claude: *"Make a MIDI track with Dexed, put BlueArp in front of it and write an A minor chord over 4 bars."* The server listens only on `127.0.0.1`; the tools read files you give them as paths, so use it only with agents you trust.
