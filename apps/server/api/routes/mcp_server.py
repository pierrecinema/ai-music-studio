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
        "description": "Generate a full song with ACE-Step (optionally with LoRA styles). Returns a jobId; poll get_music_job.",
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


# Tools that work on the project open in the app window (through services/app_bridge.py)
_TRACK = {"type": "string", "description": "Track id or name (see app_get_project)"}
APP_TOOLS = [
    {"name": "app_get_project", "description": "The project open in the app: tempo, tracks (id, name, type, instrument, MIDI effects, sound, volume, pan, mute), clips and their notes count",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "app_list_plugins", "description": "Plugins found on this PC (Settings -> Plugins) and the built-in / sound-pack instruments. kind: instrument, midi, effect or all",
     "inputSchema": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["instrument", "midi", "effect", "all"]}}}},
    {"name": "app_add_midi_track", "description": "Add a MIDI track. Optional: name, program (General MIDI 0-127 of the sound pack, 128+ drum kits) or sound (soft, bass, lead, drums, guitar, eguitar, keys, 808)",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "program": {"type": "integer"}, "sound": {"type": "string"}}}},
    {"name": "app_set_instrument", "description": "What plays a MIDI track: a VST instrument by (part of) its name, e.g. 'Dexed' or 'Surge XT', or a sound-pack program / built-in sound",
     "inputSchema": {"type": "object", "properties": {"track": _TRACK, "plugin": {"type": "string"}, "program": {"type": "integer"}, "sound": {"type": "string"}}, "required": ["track"]}},
    {"name": "app_add_midi_effect", "description": "Put a MIDI effect (arpeggiator, sequencer, e.g. 'BlueArp', 'Stochas') in front of the VST instrument of a MIDI track",
     "inputSchema": {"type": "object", "properties": {"track": _TRACK, "plugin": {"type": "string"}}, "required": ["track", "plugin"]}},
    {"name": "app_add_notes", "description": "Write notes into a MIDI track as a new clip from bar startBar (1 = first bar). Each note: pitch (MIDI 0-127), start and length in beats (quarter notes, from the clip start), velocity 1-127",
     "inputSchema": {"type": "object", "properties": {"track": _TRACK, "startBar": {"type": "number"}, "name": {"type": "string"},
                     "notes": {"type": "array", "items": {"type": "object", "properties": {"pitch": {"type": "integer"}, "start": {"type": "number"}, "length": {"type": "number"}, "velocity": {"type": "integer"}}, "required": ["pitch", "start", "length"]}}},
                     "required": ["track", "notes"]}},
    {"name": "app_set_track", "description": "Change a track: name, volume (0-1), pan (-1 left .. 1 right), muted, soloed",
     "inputSchema": {"type": "object", "properties": {"track": _TRACK, "name": {"type": "string"}, "volume": {"type": "number"}, "pan": {"type": "number"}, "muted": {"type": "boolean"}, "soloed": {"type": "boolean"}}, "required": ["track"]}},
    {"name": "app_set_bpm", "description": "Set the tempo of the project open in the app",
     "inputSchema": {"type": "object", "properties": {"bpm": {"type": "number", "minimum": 20, "maximum": 300}}, "required": ["bpm"]}},
    {"name": "app_transport", "description": "Play, stop or go back to the start in the app",
     "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["play", "stop", "start"]}}, "required": ["action"]}},
]
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
            result = await app_bridge.request(name[4:], args)
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
        from api.routes.music_gen import job_status
        return await job_status(args["jobId"])
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
