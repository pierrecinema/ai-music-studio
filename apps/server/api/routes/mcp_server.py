"""
AI Music Studio MCP Server
Exposes the studio as an MCP server so Claude and other AI agents
can directly control tracks, generate vocals, split stems etc.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

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
        "description": "Convert an audio file to MIDI notes using basic-pitch",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string"}
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
    }
]

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

    return {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}], "isError": True}


@router.get("/manifest")
async def mcp_manifest():
    """MCP server manifest for discovery."""
    return {
        "name": "ai-music-studio",
        "version": "0.1.0",
        "description": "AI Music Studio — vocals, instruments, stems, MIDI, video",
        "tools": MCP_TOOLS
    }
