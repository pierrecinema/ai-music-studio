"""
AI Music Studio MCP Server
Exposes the studio as an MCP server so Claude and other AI agents
can directly control tracks, generate vocals, split stems etc.
"""
import json
from fastapi import APIRouter, HTTPException
from typing import Any

from services import app_bridge

router = APIRouter()

# MCP tool definitions — exposed to any MCP client
MCP_TOOLS = [
    {
        "name": "add_vocal_track",
        "description": "Add an AI vocal track to the current project with MIDI notes and lyrics",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "voiceId": {"type": "string", "description": "Voice ID from /vocal/voices"},
                "lyrics": {"type": "string"},
                "bpm": {"type": "number"},
            },
            "required": ["name", "voiceId", "lyrics"]
        }
    },
    {
        "name": "split_stems",
        "description": "Separate an audio file into stems (vocals, drums, bass, other)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string"},
                "model": {"type": "string", "enum": ["htdemucs", "htdemucs_ft", "mdx_extra"]}
            },
            "required": ["filePath"]
        }
    },
    {
        "name": "generate_chord_progression",
        "description": "Generate a chord progression and return MIDI notes",
        "inputSchema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "mode": {"type": "string", "enum": ["major", "minor", "dorian", "mixolydian"]},
                "bars": {"type": "integer"},
                "style": {"type": "string", "enum": ["pop", "jazz", "blues", "classical"]}
            },
            "required": ["key", "mode", "bars"]
        }
    },
    {
        "name": "audio_to_midi",
        "description": "Convert an audio file to MIDI notes (basic-pitch, or MuScriptor when installed; MuScriptor is non-commercial)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string"},
                "engine": {"type": "string", "enum": ["auto", "basic-pitch", "muscriptor"]}
            },
            "required": ["filePath"]
        }
    },
    {
        "name": "get_project_info",
        "description": "Get current project BPM, tracks and structure",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "set_bpm",
        "description": "Set the project BPM",
        "inputSchema": {
            "type": "object",
            "properties": {"bpm": {"type": "number", "minimum": 20, "maximum": 300}},
            "required": ["bpm"]
        }
    },
    {
        "name": "list_voices",
        "description": "List all available AI singing voices",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "generate_instrument",
        "description": "Generate AI instrument audio from MIDI notes",
        "inputSchema": {
            "type": "object",
            "properties": {
                "instrumentId": {"type": "string"},
                "notes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "pitch": {"type": "integer"},
                            "startTime": {"type": "number"},
                            "duration": {"type": "number"},
                            "velocity": {"type": "integer"}
                        }
                    }
                }
            },
            "required": ["instrumentId", "notes"]
        }
    },
    {
        "name": "generate_music",
        "description": ("Generate a song as AUDIO with the music AI (ACE-Step, optionally with LoRA styles; vocals from lyrics). Slow: "
                        "minutes with an NVIDIA GPU, often 10-30 minutes or more on a CPU, the first time also a model download. Returns a "
                        "jobId; poll get_music_job; the song lands in the Library. For a song made of editable MIDI tracks in the Studio "
                        "(seconds) use app_generate_song instead. Use this only when the user asks for an AI-generated recording or vocals."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string"},
                "lyrics": {"type": "string"},
                "duration": {"type": "integer", "minimum": 5, "maximum": 600},
                "instrumental": {"type": "boolean"},
                "loras": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"id": {"type": "string"}, "strength": {"type": "number"}},
                        "required": ["id"]
                    }
                }
            },
            "required": ["prompt"]
        }
    },
    {
        "name": "get_music_job",
        "description": "Get the status/result of a generate_music job",
        "inputSchema": {
            "type": "object",
            "properties": {"jobId": {"type": "string"}},
            "required": ["jobId"]
        }
    },
    {
        "name": "list_loras",
        "description": "List installed LoRA styles/artists/sounds",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "import_lora",
        "description": "Register a LoRA file or folder from disk",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "name": {"type": "string"},
                "kind": {"type": "string", "enum": ["style", "artist", "sound"]}
            },
            "required": ["path"]
        }
    },
    {
        "name": "master_track",
        "description": "Master a track so it matches a reference track (Matchering)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "targetPath": {"type": "string"},
                "referencePath": {"type": "string"},
                "bitDepth": {"type": "integer", "enum": [16, 24]}
            },
            "required": ["targetPath", "referencePath"]
        }
    },
    {
        "name": "align_lyrics",
        "description": "Transcribe audio with word-level timestamps",
        "inputSchema": {
            "type": "object",
            "properties": {"audioPath": {"type": "string"}, "language": {"type": "string"}},
            "required": ["audioPath"]
        }
    },
    {
        "name": "export_karaoke",
        "description": "Align lyrics and export an enhanced .lrc and optionally an MP4 karaoke video",
        "inputSchema": {
            "type": "object",
            "properties": {
                "audioPath": {"type": "string"},
                "video": {"type": "boolean"},
                "aspect": {"type": "string", "enum": ["16:9", "9:16", "1:1"]}
            },
            "required": ["audioPath"]
        }
    },
    {
        "name": "system_info",
        "description": "Hardware and memory profile (GPU backend, VRAM/RAM, low-memory mode)",
        "inputSchema": {"type": "object", "properties": {}}
    }
]


# Tools that work on the project open in the app window (through services/app_bridge.py): everything the user can do
# in the Studio. Bars count from 1, beats are quarter notes; a track is its name, id or number (see app_get_project).
_TRACK = {"type": "string", "description": "Track name, id or number (see app_get_project)"}
_CLIP = {"type": "string", "description": "Clip number (1 = first in time), id, name, 'last' (default) or 'bar:N' (the clip at bar N)"}
_S = {"type": "string"}
_N = {"type": "number"}
_I = {"type": "integer"}
_B = {"type": "boolean"}
_NOTES = {"type": "array", "items": {"type": "object", "properties": {"pitch": {"type": "integer", "description": "MIDI 0-127, 60 = middle C"}, "start": {"type": "number", "description": "beats from the clip start"}, "length": {"type": "number", "description": "beats"}, "velocity": {"type": "integer"}, "lyric": _S}, "required": ["pitch", "start", "length"]}}
_CHAIN = {"type": "string", "enum": ["insert", "midi"], "description": "insert effects (default) or the MIDI effects before the VST instrument"}
_TRACK_OR_MASTER = {"type": "string", "description": "Track name, id or number, or 'master'"}
_EFFECT = {"type": "string", "description": "Effect number in the chain (1 = first), id, type or plugin name"}


def _tool(name: str, description: str, props: dict | None = None, required: list | None = None) -> dict:
    schema: dict = {"type": "object", "properties": props or {}}
    if required:
        schema["required"] = required
    return {"name": name, "description": description, "inputSchema": schema}


APP_TOOLS = [
    # project and files
    _tool("app_get_project", "The project open in the app: name, file, tempo, time signature, length, play position, loop, markers, return tracks, master effects, and every track (number, name, type, instrument, MIDI effects, effects, sends, automation, volume, pan, mute, solo, clips with start bar, length and note count)"),
    _tool("app_set_project", "Change the project: name, bpm, timeSignature [beats, note value], countInBars (recording), masterVolume (0-1)",
          {"name": _S, "bpm": _N, "timeSignature": {"type": "array", "items": _I}, "countInBars": _I, "masterVolume": _N}),
    _tool("app_new_project", "Start a new empty project. Refuses when there are unsaved changes unless discardChanges is true", {"name": _S, "discardChanges": _B}),
    _tool("app_open_project", "Open an .ams project file. Refuses when there are unsaved changes unless discardChanges is true", {"path": _S, "discardChanges": _B}, ["path"]),
    _tool("app_save_project", "Save the project (to its file, or to path: an .ams file)", {"path": _S}),
    _tool("app_undo", "Undo (or with redo: true, redo) the last changes", {"steps": _I, "redo": _B}),
    _tool("app_export_audio", "Mix the whole project into a .wav or .mp3 file (as it sounds: mute, solo, effects, automation, plugins). bits 16/24, normalize to -1 dBFS, kbps for MP3. Starts the mix in the background and answers at once; with VST plugins it takes about as long as the song: ask app_export_status every 20-30 s until done",
          {"path": _S, "bits": _I, "normalize": _B, "kbps": _I}, ["path"]),
    _tool("app_export_status", "How the last app_export_audio is doing: running (seconds so far, song length), done (file, length, peak) or error"),
    _tool("app_export_midi", "Write the MIDI tracks (or one track) into a .mid file", {"path": _S, "track": _TRACK}, ["path"]),
    _tool("app_import_file", "Put audio files (wav, mp3, flac, ogg …) or a .mid file into the project at startBar: a new track, or onto an audio track. loopBpm: the file is a loop at this tempo and follows the project tempo",
          {"path": _S, "paths": {"type": "array", "items": _S}, "track": _TRACK, "startBar": _N, "loopBpm": _N}),
    _tool("app_show", "Show a page of the app (studio, piano-roll, mixer, mastering, instruments, create, library, vocal-editor, stem-splitter, karaoke, video-composer, ai-chat, settings) and/or select a track and clip",
          {"page": _S, "track": _TRACK, "clip": _CLIP}),
    # plugins, instruments, styles
    _tool("app_list_plugins", "Plugins found on this PC (Settings -> Plugins), built-in sounds, sound-pack instruments (General MIDI programs) and built-in effects. kind: instrument, midi, effect or all",
          {"kind": {"type": "string", "enum": ["instrument", "midi", "effect", "all"]}}),
    _tool("app_list_effect_types", "The built-in effects (eq, compressor, delay, reverb, filter, limiter, saturation, stereo, dyneq) and their settings with ranges"),
    _tool("app_list_styles", "Genres of the song generator, drum / bass / guitar styles of the band, key names"),
    _tool("app_sound_packs", "The sound packs (recorded instruments) and whether they are installed; install: a pack id to download it (salamander, vsco, musescore, generaluser)", {"install": _S}),
    # tracks
    _tool("app_add_track", "Add a track. type: midi (default), audio, vocal, instrument or group. Optional: name, color (#hex), program (sound-pack General MIDI 0-127, 128+ drum kits), sound (soft, bass, lead, drums, guitar, eguitar, keys, 808), volume, position (1 = top)",
          {"type": _S, "name": _S, "color": _S, "program": _I, "sound": _S, "volume": _N, "position": _I}),
    _tool("app_add_midi_track", "Add a MIDI track. Optional: name, program (General MIDI 0-127 of the sound pack, 128+ drum kits) or sound (soft, bass, lead, drums, guitar, eguitar, keys, 808)",
          {"name": _S, "program": _I, "sound": _S}),
    _tool("app_remove_track", "Delete a track", {"track": _TRACK}, ["track"]),
    _tool("app_duplicate_track", "Copy a track with its clips, instrument and effects (placed below it)", {"track": _TRACK, "name": _S}, ["track"]),
    _tool("app_move_track", "Move a track to position (1 = top)", {"track": _TRACK, "position": _I}, ["track", "position"]),
    _tool("app_set_track", "Change a track: name, volume (0-1), pan (-1 left .. 1 right), muted, soloed, color (#hex), reverb (sound-pack room 0-1), collapsed (group)",
          {"track": _TRACK, "name": _S, "volume": _N, "pan": _N, "muted": _B, "soloed": _B, "color": _S, "reverb": _N, "collapsed": _B}, ["track"]),
    _tool("app_group_tracks", "Put tracks into a new group track (their sound goes through the group)", {"tracks": {"type": "array", "items": _S}, "name": _S}, ["tracks"]),
    _tool("app_ungroup", "Dissolve a group track (its tracks stay)", {"track": _TRACK}, ["track"]),
    _tool("app_set_instrument", "What plays a MIDI track: a VST instrument by (part of) its name, e.g. 'Dexed' or 'Surge XT', or a sound-pack program / built-in sound",
          {"track": _TRACK, "plugin": _S, "program": _I, "sound": _S}, ["track"]),
    _tool("app_add_midi_effect", "Put a MIDI effect (arpeggiator, sequencer, e.g. 'BlueArp', 'Stochas') in front of the VST instrument of a MIDI track",
          {"track": _TRACK, "plugin": _S}, ["track", "plugin"]),
    # effects
    _tool("app_add_effect", "Add an effect to a track or the master: a built-in type (see app_list_effect_types) with settings {key: value}, or a VST effect by plugin name. position: 1 = first",
          {"track": _TRACK_OR_MASTER, "type": _S, "plugin": _S, "settings": {"type": "object"}, "position": _I, "chain": _CHAIN}, ["track"]),
    _tool("app_set_effect", "Change an effect: on (true/false), settings {key: value} (built-in: see app_list_effect_types; VST: parameter name or index -> 0..1)",
          {"track": _TRACK_OR_MASTER, "effect": _EFFECT, "on": _B, "settings": {"type": "object"}, "chain": _CHAIN}, ["track", "effect"]),
    _tool("app_remove_effect", "Remove an effect from a track or the master", {"track": _TRACK_OR_MASTER, "effect": _EFFECT, "chain": _CHAIN}, ["track", "effect"]),
    _tool("app_plugin_params", "The parameters of a VST plugin (the track's instrument, or an effect): index, name, value 0..1, shown text. search filters by name",
          {"track": _TRACK, "effect": {"type": "string", "description": "'instrument' (default) or the effect number / name"}, "search": _S, "chain": _CHAIN}, ["track"]),
    _tool("app_set_plugin_param", "Set parameters of a VST plugin: params {name or index: value 0..1}",
          {"track": _TRACK, "effect": {"type": "string", "description": "'instrument' (default) or the effect number / name"}, "params": {"type": "object"}, "chain": _CHAIN}, ["track", "params"]),
    _tool("app_open_plugin", "Open the window of a VST plugin on the user's screen", {"track": _TRACK, "effect": _S, "chain": _CHAIN}, ["track"]),
    # sends and returns
    _tool("app_add_return", "Add a return track (shared reverb or delay). Optional: name, volume, pan, decay (reverb s), delayBeats, feedback",
          {"effect": {"type": "string", "enum": ["reverb", "delay"]}, "name": _S, "volume": _N, "pan": _N, "decay": _N, "delayBeats": _N, "feedback": _N}),
    _tool("app_set_return", "Change a return track: name, volume, pan, muted, decay, delayBeats, feedback",
          {"return": _S, "name": _S, "volume": _N, "pan": _N, "muted": _B, "decay": _N, "delayBeats": _N, "feedback": _N}, ["return"]),
    _tool("app_remove_return", "Delete a return track", {"return": _S}, ["return"]),
    _tool("app_set_send", "How much of a track goes to a return track (level 0-1)", {"track": _TRACK, "return": _S, "level": _N}, ["track", "return", "level"]),
    # automation
    _tool("app_set_automation", "Draw an automation lane (replaces it; empty points clear it). param: volume (0-1), pan (-1..1), send:<return name> (0-1), effect:<effect number or name>:<setting key or VST parameter index> (0-1). points: [{bar or beat, value}], the value moves in a line between points",
          {"track": _TRACK, "param": _S, "points": {"type": "array", "items": {"type": "object", "properties": {"bar": _N, "beat": _N, "value": _N}, "required": ["value"]}}}, ["track", "param", "points"]),
    # clips and notes
    _tool("app_add_notes", "Write notes into a MIDI track as a new clip from bar startBar (1 = first bar). Each note: pitch (MIDI 0-127), start and length in beats (quarter notes, from the clip start), velocity 1-127, lyric (vocal tracks). bars: clip length",
          {"track": _TRACK, "startBar": _N, "bars": _N, "name": _S, "notes": _NOTES}, ["track", "notes"]),
    _tool("app_get_notes", "The notes of a MIDI clip (pitch, start and length in beats from the clip start, velocity)", {"track": _TRACK, "clip": _CLIP}, ["track"]),
    _tool("app_set_notes", "Replace all notes of a MIDI clip", {"track": _TRACK, "clip": _CLIP, "notes": _NOTES}, ["track", "notes"]),
    _tool("app_edit_notes", "Change notes of a MIDI clip (all, or those within fromBeat..toBeat and lowestPitch..highestPitch): transpose (semitones), quantize (grid in beats, e.g. 0.25 = 16ths; strength 0-1; quantizeLength), velocity (set) or velocityScale, length or lengthScale, shift (beats), delete: true",
          {"track": _TRACK, "clip": _CLIP, "fromBeat": _N, "toBeat": _N, "lowestPitch": _I, "highestPitch": _I, "transpose": _I, "quantize": _N, "strength": _N, "quantizeLength": _B,
           "velocity": _I, "velocityScale": _N, "length": _N, "lengthScale": _N, "shift": _N, "delete": _B}, ["track"]),
    _tool("app_edit_clip", "Change a clip: name, color, bars or lengthBeats (length), startBar (move), toTrack (move to another track), audio clips: gain (0-2), fadeIn / fadeOut (beats)",
          {"track": _TRACK, "clip": _CLIP, "name": _S, "color": _S, "bars": _N, "lengthBeats": _N, "startBar": _N, "toTrack": _S, "gain": _N, "fadeIn": _N, "fadeOut": _N}, ["track"]),
    _tool("app_remove_clip", "Delete a clip", {"track": _TRACK, "clip": _CLIP}, ["track"]),
    _tool("app_split_clip", "Cut a clip in two at bar atBar", {"track": _TRACK, "clip": _CLIP, "atBar": _N}, ["track", "atBar"]),
    _tool("app_duplicate_clip", "Repeat a clip right after itself (times: how often)", {"track": _TRACK, "clip": _CLIP, "times": _I}, ["track"]),
    # markers and loop
    _tool("app_add_marker", "Add a marker at bar (name; endBar makes it a cycle marker)", {"bar": _N, "name": _S, "endBar": _N}, ["bar"]),
    _tool("app_remove_marker", "Delete a marker (by name or bar)", {"marker": _S}, ["marker"]),
    _tool("app_set_loop", "Set the loop range (startBar, endBar) and switch it on or off (enabled)", {"startBar": _N, "endBar": _N, "enabled": _B}),
    # song generator and band
    _tool("app_generate_song", "Write a whole song as MIDI tracks (melody, chords, bass, drums, guitar; intro, verse, chorus, bridge …) with the song generator. genre (see app_list_styles), key (e.g. 'Am', 'F#', 'Bb major'), mode, bpm, seed (another take), parts {melody, chords, bass, drums, guitar: true/false}, startBar, setTempo, markers",
          {"genre": _S, "key": _S, "mode": {"type": "string", "enum": ["major", "minor"]}, "bpm": _N, "seed": _I, "parts": {"type": "object"}, "startBar": _N, "setTempo": _B, "markers": _B}),
    _tool("app_band_part", "A band member plays a new MIDI track: part drums, bass or guitar; style (see app_list_styles); chords as text ('Am F C G', beatsPerChord) or, without chords, the chords found in the song at these bars; bars, startBar, intensity, humanize, swing (0-1), fills (0/4/8), seed, program, distorted",
          {"part": {"type": "string", "enum": ["drums", "bass", "guitar"]}, "style": _S, "chords": _S, "beatsPerChord": _N, "bars": _I, "startBar": _N, "intensity": _N, "humanize": _N, "swing": _N, "fills": _I, "seed": _I, "program": _I, "distorted": _B, "name": _S}, ["part"]),
    # transport
    _tool("app_set_bpm", "Set the tempo of the project open in the app", {"bpm": {"type": "number", "minimum": 20, "maximum": 300}}, ["bpm"]),
    _tool("app_transport", "Play, stop, pause, go to the start, or go to bar (seek)", {"action": {"type": "string", "enum": ["play", "stop", "pause", "start", "seek"]}, "bar": _N}, ["action"]),
]
# commands that take longer than the default 30 s
APP_TIMEOUTS = {"app_export_audio": 60.0, "app_sound_packs": 1800.0, "app_open_project": 120.0, "app_save_project": 120.0, "app_import_file": 300.0,
                "app_plugin_params": 60.0, "app_set_plugin_param": 60.0, "app_set_effect": 60.0, "app_open_plugin": 60.0}
MCP_TOOLS += APP_TOOLS

# Simple in-memory project state for MCP
_project_state: dict[str, Any] = {
    "name": "Untitled",
    "bpm": 120,
    "tracks": []
}


@router.get("/tools")
async def list_tools():
    """MCP tools listing endpoint."""
    return {"tools": MCP_TOOLS}


@router.post("/call")
async def call_tool(body: dict):
    """Execute an MCP tool call."""
    tool_name = body.get("name")
    args = body.get("arguments", {})

    # tools on the project open in the app window
    if tool_name.startswith("app_") or (tool_name in ("get_project_info", "set_bpm") and app_bridge.connected()):
        name = {"get_project_info": "app_get_project", "set_bpm": "app_set_bpm"}.get(tool_name, tool_name)
        try:
            result = await app_bridge.request(name[4:], args, APP_TIMEOUTS.get(name, 30.0))
        except RuntimeError as e:
            return {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}
        return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}

    if tool_name == "get_project_info":
        return {"content": [{"type": "text", "text": str(_project_state)}]}

    if tool_name == "set_bpm":
        _project_state["bpm"] = args["bpm"]
        return {"content": [{"type": "text", "text": f"BPM set to {args['bpm']}"}]}

    if tool_name == "list_voices":
        from api.routes.vocal import VOICES
        return {"content": [{"type": "text", "text": str(VOICES)}]}

    if tool_name == "generate_chord_progression":
        from api.routes.ai_chat import generate_chords
        result = await generate_chords(args)
        return {"content": [{"type": "text", "text": str(result)}]}

    if tool_name == "split_stems":
        from api.routes.stems import split_stems, StemSplitRequest
        req = StemSplitRequest(**args)
        result = await split_stems(req)
        return {"content": [{"type": "text", "text": str(result)}]}

    if tool_name == "audio_to_midi":
        from api.routes.audio_to_midi import convert_audio_to_midi, AudioToMidiRequest
        req = AudioToMidiRequest(**args)
        result = await convert_audio_to_midi(req)
        return {"content": [{"type": "text", "text": str(result)}]}

    if tool_name == "add_vocal_track":
        track = {"id": f"t{len(_project_state['tracks'])+1}", "type": "vocal", **args}
        _project_state["tracks"].append(track)
        return {"content": [{"type": "text", "text": f"Vocal track '{args['name']}' added"}]}

    if tool_name == "generate_instrument":
        from api.routes.instruments import generate_instrument, GenerateInstrumentRequest, NoteIn
        req = GenerateInstrumentRequest(
            instrumentId=args["instrumentId"],
            notes=[NoteIn(**n) for n in args["notes"]]
        )
        result = await generate_instrument(req)
        return {"content": [{"type": "text", "text": str(result)}]}

    try:
        extra = await _call_extra(tool_name, args)
    except HTTPException as e:
        return {"content": [{"type": "text", "text": f"Error: {e.detail}"}], "isError": True}
    if extra is not None:
        return {"content": [{"type": "text", "text": json.dumps(extra, default=str)}]}

    return {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}], "isError": True}


async def _call_extra(name: str, args: dict):
    if name == "generate_music":
        from api.routes.music_gen import generate_music, GenerateMusicRequest
        return await generate_music(GenerateMusicRequest(**args))
    if name == "get_music_job":
        import time
        from api.routes.music_gen import job_status
        job = dict(await job_status(args["jobId"]))
        start = job.get("started") or job.get("created") or time.time()
        pct = round(100 * (job.get("step") or 0) / job["step_total"]) if job.get("step_total") else None
        job["summary"] = (f"{job.get('status')}: {job.get('stage_text') or job.get('stage') or ''}"
                          + (f", {pct} %" if pct is not None else "") + f", {int(time.time() - start)} s so far."
                          + (" The app shows the progress in its status bar (bottom) and on the Create music page." if job.get("status") in ("queued", "running") else ""))
        return job
    if name == "list_loras":
        from api.routes.music_gen import list_loras
        return await list_loras()
    if name == "import_lora":
        from api.routes.music_gen import import_lora, LoraImport
        return await import_lora(LoraImport(**args))
    if name == "master_track":
        from api.routes.mastering import master, MasterRequest
        return await master(MasterRequest(**args))
    if name == "align_lyrics":
        from api.routes.karaoke import align, AlignRequest
        return await align(AlignRequest(**args))
    if name == "export_karaoke":
        from api.routes.karaoke import align, lrc, video, AlignRequest, LrcRequest, VideoRequest, Word
        aligned = await align(AlignRequest(audioPath=args["audioPath"]))
        words = [Word(**w) for w in aligned["words"]]
        result = await lrc(LrcRequest(words=words))
        if args.get("video"):
            result["videoFile"] = (await video(VideoRequest(
                audioPath=args["audioPath"], words=words, aspect=args.get("aspect", "16:9")
            )))["videoFile"]
        return result
    if name == "system_info":
        from services.hardware_detect import get_profile
        from services.resource_profile import get_resources
        from dataclasses import asdict
        return {"hardware": asdict(get_profile()), "resources": get_resources()}
    return None


@router.get("/app/next")
async def app_next():
    """The app window asks for work (long poll)."""
    return await app_bridge.next_command()


@router.post("/app/result")
async def app_result(body: dict):
    """The app window's answer to a command."""
    return {"ok": app_bridge.deliver(int(body.get("id", 0)), bool(body.get("ok")), body.get("result"), body.get("error"))}


@router.get("/manifest")
async def mcp_manifest():
    """MCP server manifest for discovery."""
    return {
        "name": "ai-music-studio",
        "version": "0.1.0",
        "description": "AI Music Studio — vocals, instruments, stems, MIDI, video",
        "tools": MCP_TOOLS
    }
