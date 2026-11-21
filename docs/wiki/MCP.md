# MCP: let AI agents use the app

While the app runs with the AI backend installed, it offers an MCP server (Model Context Protocol) at `http://127.0.0.1:38765/mcp`. If the port is taken, the next free one is used; the current address is in the status bar and in `%APPDATA%\desktop\server.json`.

Add it to Claude Code once:

```
claude mcp add --transport http --scope user ai-music-studio http://127.0.0.1:38765/mcp
```

Check with `claude mcp list`. Other MCP clients that support HTTP use the same URL.

Tools: generate music, LoRAs, stems, Audio → MIDI, mastering, system info and more.

**Tools on the open project (0.93):** they work on the project you see in the app window (the window must be open), like you would. The AI Chat in the app uses them too. Bars count from 1, beats are quarter notes; a track is named by its name, id or number.

| Area | Tools |
|---|---|
| Project and files | `app_get_project` (everything about the project), `app_set_project` (name, tempo, time signature, count-in, master volume), `app_new_project`, `app_open_project`, `app_save_project`, `app_undo`, `app_import_file` (audio or MIDI), `app_export_audio` (WAV / MP3, in the background) and `app_export_status`, `app_export_midi` |
| Pages | `app_show` (a page of the app, select a track or clip) |
| Lists | `app_list_plugins`, `app_list_effect_types`, `app_list_styles` (genres, drum / bass / guitar styles), `app_sound_packs` (status, install) |
| Tracks | `app_add_track`, `app_add_midi_track`, `app_duplicate_track`, `app_move_track`, `app_remove_track`, `app_set_track` (name, color, volume, pan, mute, solo, room), `app_group_tracks`, `app_ungroup` |
| Instruments | `app_set_instrument` (VST instrument such as `Dexed`, or a sound-pack program), `app_add_midi_effect` (for example `BlueArp`) |
| Effects | `app_add_effect`, `app_set_effect`, `app_remove_effect` (built-in or VST, on a track or `master`), `app_plugin_params`, `app_set_plugin_param`, `app_open_plugin` |
| Sends | `app_add_return`, `app_set_return`, `app_remove_return`, `app_set_send` |
| Automation | `app_set_automation` (volume, pan, `send:<return>`, `effect:<effect>:<setting>`) |
| Clips and notes | `app_add_notes`, `app_get_notes`, `app_set_notes`, `app_edit_notes` (transpose, quantize, velocity, length, delete), `app_edit_clip` (move, length, gain, fades), `app_split_clip`, `app_duplicate_clip`, `app_remove_clip` |
| Audio → MIDI | `app_audio_to_midi` (a song into MIDI tracks, in the background), `app_audio_to_midi_status` |
| Song | `app_generate_song` (song generator), `app_band_part` (drummer, bass player, guitarist), `app_add_marker`, `app_remove_marker`, `app_set_loop` |
| Transport | `app_transport` (play, stop, pause, start, go to bar), `app_set_bpm` |

In Claude Code, `/permissions` → *Allow* → `mcp__ai-music-studio` lets Claude use all tools of the app without asking each time (Claude Code may still stop a call it finds risky; then confirm it).

After an app update, start a new Claude session (or reconnect the MCP server) so it loads the new tool list.

**A song as MIDI or as audio:** *write a song* in the Studio uses `app_generate_song` (MIDI tracks in seconds). `generate_music` records a song with the music AI (audio, with vocals); it takes minutes with an NVIDIA graphics card and often 10–30 minutes or more on a CPU. Its progress shows in the status bar at the bottom of the app and on *Create music*.

Examples for Claude: *"Make a MIDI track with Dexed, put BlueArp in front of it and write an A minor chord over 4 bars."* *"Write a funk song in E minor at 104 BPM, put a compressor on the bass and a hall reverb on the melody, then export it to my desktop as MP3."* The server listens only on `127.0.0.1`; the tools read files you give them as paths, so use it only with agents you trust.
