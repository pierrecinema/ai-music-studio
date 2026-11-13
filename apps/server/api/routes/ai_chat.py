"""AI chat route: Claude (Anthropic), ChatGPT (OpenAI), Grok (xAI) or a free local model through Ollama."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

router = APIRouter()

MUSIC_SYSTEM_PROMPT = """You are an expert AI music production assistant integrated into AI Music Studio,
an open-source DAW. You help composers, producers and musicians with:
- Chord progressions, melody, harmony, music theory
- Lyrics writing and creative direction
- Beat design and rhythm patterns
- Mixing and sound design advice
- DAW workflow tips

Keep answers concise and practical. When generating musical content, use standard notation where possible.

You can use the app's tools. When the user asks you to make a song, a track, a beat or a loop, call generate_music
(write a style description and, unless it is instrumental, lyrics with [Verse] / [Chorus] sections). It runs in the
background and takes minutes on a normal PC: tell the user it has started, that the progress shows in the app and that
the finished song appears in the Library. Use get_music_job when the user asks how far it is. Answer in the user's
language.
"""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    provider: Literal["claude", "openai", "grok", "gemini", "ollama", "local"]
    apiKey: str
    model: str
    messages: list[Message]
    systemContext: str = ""
    baseUrl: str = ""          # provider "local": an OpenAI-compatible server on this PC (LM Studio, KoboldCpp, llama.cpp)
    musicEngine: str = ""      # the music model chosen in Create music: used when the AI makes a song
    tools: bool = True         # let the AI use the app (make songs, ...)


@router.post("/chat")
async def chat(req: ChatRequest):
    if not req.apiKey and req.provider not in ("ollama", "local"):
        raise HTTPException(400, "API key required. Set it in Settings → AI.")

    system = MUSIC_SYSTEM_PROMPT
    if req.systemContext:
        system += f"\n\nProject context: {req.systemContext}"

    ctx = {"engine": req.musicEngine, "jobs": []}
    use_tools = req.tools
    try:
        if req.provider == "claude":
            text = await _claude_chat(req.apiKey, req.model, req.messages, system, ctx if use_tools else None)
        else:
            key, base = {
                "gemini": (req.apiKey, GEMINI_URL), "grok": (req.apiKey, XAI_URL),
                "local": ("local", (req.baseUrl or LOCAL_URL).rstrip("/")), "ollama": ("ollama", OLLAMA_URL),
            }.get(req.provider, (req.apiKey, None))
            model = req.model or ("local-model" if req.provider == "local" else req.model)
            try:
                text = await _openai_chat(key, model, req.messages, system, base_url=base, ctx=ctx if use_tools else None)
            except Exception as e:  # noqa: BLE001 - some local models cannot use tools: answer without them
                if use_tools and req.provider in ("local", "ollama") and "tool" in str(e).lower():
                    text = await _openai_chat(key, model, req.messages, system, base_url=base, ctx=None)
                else:
                    raise
        return {"reply": text, "jobs": ctx["jobs"]}
    except Exception as e:
        msg = _provider_error(e)
        if ctx["jobs"]:                      # a song was started before the error: the app still shows it
            return {"reply": f"The song has started (it shows below and lands in the Library). The AI could not finish its answer: {msg}",
                    "jobs": ctx["jobs"]}
        if req.provider == "local" and ("Connection" in type(e).__name__ or "connect" in msg.lower()):
            msg = (f"No server answers at {req.baseUrl or LOCAL_URL}. Start the server in LM Studio (Developer → Start "
                   "Server) or start KoboldCpp, load a model, and check the address in Settings → AI.")
        elif req.provider == "ollama" and ("Connection" in type(e).__name__ or "connect" in msg.lower()):
            msg = "Ollama is not running. Install it from ollama.com, start it, and run 'ollama pull " + req.model + "' once."
        elif req.provider == "ollama" and "not found" in msg.lower():
            msg = f"The model '{req.model}' is not on this PC yet. Open a command prompt and run: ollama pull {req.model}"
        raise HTTPException(500, msg)


def _provider_error(e: Exception) -> str:
    """The provider's own message (e.g. Google's reason for a 400) instead of only "Error code: 400"."""
    body = getattr(e, "body", None)
    detail = ""
    if isinstance(body, dict):
        err = body.get("error", body)
        detail = err.get("message") if isinstance(err, dict) else str(err)
    elif isinstance(body, list) and body and isinstance(body[0], dict):
        detail = str(body[0].get("error", {}).get("message", body[0]))
    base = str(e).split(" - ")[0]
    return f"{base}: {detail}" if detail and detail not in base else str(e)


XAI_URL = "https://api.x.ai/v1"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
OLLAMA_URL = "http://127.0.0.1:11434/v1"
LOCAL_URL = "http://127.0.0.1:1234/v1"


# ── the app's tools for the AI (the same ones the MCP server offers) ─────────

CHAT_TOOL_NAMES = ("get_music_job", "list_loras", "split_stems", "master_track", "generate_chord_progression", "system_info")

GENERATE_TOOL = {
    "name": "generate_music",
    "description": ("Make a song, track, beat or loop with the app's music AI. Runs in the background (minutes) and "
                    "returns a jobId; the finished song is saved in the Library."),
    "inputSchema": {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "Style: genre, mood, instruments, voice, e.g. 'deep house, warm pads, female vocals'"},
            "lyrics": {"type": "string", "description": "Lyrics with [Verse] / [Chorus] sections; empty for an instrumental"},
            "instrumental": {"type": "boolean"},
            "duration": {"type": "integer", "minimum": 10, "maximum": 600, "description": "Length in seconds (default 60)"},
            "bpm": {"type": "integer", "minimum": 40, "maximum": 220},
            "title": {"type": "string"},
            "voice": {"type": "string", "enum": ["any", "male", "female"]},
            "language": {"type": "string", "description": "Language of the lyrics, e.g. English, German"},
        },
        "required": ["prompt"],
    },
}


def _tool_list() -> list[dict]:
    from api.routes.mcp_server import MCP_TOOLS
    return [GENERATE_TOOL] + [t for t in MCP_TOOLS if t["name"] in CHAT_TOOL_NAMES]


async def _run_tool(name: str, args: dict, ctx: dict) -> str:
    """Run one tool for the AI; the result goes back to it as text."""
    import json
    try:
        if name == "generate_music":
            from api.routes.music_gen import generate_music, GenerateMusicRequest
            fields = {k: v for k, v in args.items() if k in ("prompt", "lyrics", "instrumental", "duration", "bpm", "title", "voice", "language") and v not in (None, "")}
            if ctx.get("engine"):
                fields["engine"] = ctx["engine"]
            if fields.get("lyrics") and "instrumental" not in fields:
                fields["instrumental"] = False
            r = await generate_music(GenerateMusicRequest(**fields))
            ctx["jobs"].append(r["jobId"])
            return json.dumps({"jobId": r["jobId"], "status": "started", "engine": fields.get("engine", "default"),
                               "note": "Runs in the background; the progress shows in the app, the song lands in the Library."})
        from api.routes.mcp_server import call_tool
        res = await call_tool({"name": name, "arguments": args})
        if isinstance(res, dict) and "content" in res:
            return "\n".join(c.get("text", "") for c in res["content"])[:6000]
        return json.dumps(res, default=str)[:6000]
    except Exception as e:  # noqa: BLE001 - the AI gets the error and can tell the user
        detail = getattr(e, "detail", None) or str(e)
        return f"Error: {detail}"


async def _claude_chat(api_key: str, model: str, messages: list[Message], system: str, ctx: dict | None = None) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    msgs: list[dict] = [{"role": m.role, "content": m.content} for m in messages]
    tools = [{"name": t["name"], "description": t["description"], "input_schema": t["inputSchema"]} for t in _tool_list()] if ctx is not None else None
    for _ in range(6):
        kw = {"model": model, "max_tokens": 1500, "system": system, "messages": msgs}
        if tools:
            kw["tools"] = tools
        response = await client.messages.create(**kw)
        uses = [b for b in response.content if getattr(b, "type", "") == "tool_use"]
        if not uses or ctx is None:
            return "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", "") == "text")
        msgs.append({"role": "assistant", "content": [b.model_dump() for b in response.content]})
        results = []
        for u in uses:
            results.append({"type": "tool_result", "tool_use_id": u.id, "content": await _run_tool(u.name, dict(u.input or {}), ctx)})
        msgs.append({"role": "user", "content": results})
    return "Done."


async def _openai_chat(api_key: str, model: str, messages: list[Message], system: str, base_url: str | None = None,
                       ctx: dict | None = None) -> str:
    import json
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url=base_url) if base_url else AsyncOpenAI(api_key=api_key)
    msgs: list[dict] = [{"role": "system", "content": system}]
    msgs.extend({"role": m.role, "content": m.content} for m in messages)
    tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["inputSchema"]}}
             for t in _tool_list()] if ctx is not None else None
    for _ in range(6):
        kw = {"model": model, "max_tokens": 1500, "messages": msgs}
        if tools:
            kw["tools"] = tools
        response = await client.chat.completions.create(**kw)
        msg = response.choices[0].message
        calls = getattr(msg, "tool_calls", None) or []
        if not calls or ctx is None:
            return msg.content or ""
        # the assistant turn goes back exactly as it came, extra fields included: Gemini 3 attaches a "thought
        # signature" to every tool call (extra_content.google.thought_signature) and answers 400 Bad Request when
        # it is missing in the next request
        turn = msg.model_dump(exclude_none=True)
        turn["role"] = "assistant"
        msgs.append(turn)
        for c in calls:
            try:
                args = json.loads(c.function.arguments or "{}")
            except ValueError:
                args = {}
            msgs.append({"role": "tool", "tool_call_id": c.id, "content": await _run_tool(c.function.name, args, ctx)})
    return "Done."


@router.post("/generate-chords")
async def generate_chords(req: dict):
    """Generate chord progressions using music theory rules."""
    key = req.get("key", "C")
    mode = req.get("mode", "major")
    bars = req.get("bars", 4)
    style = req.get("style", "pop")

    PROGRESSIONS = {
        "pop": ["I", "V", "vi", "IV"],
        "jazz": ["IIm7", "V7", "Imaj7", "VIm7"],
        "blues": ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
        "classical": ["I", "IV", "V", "I"],
    }

    prog = PROGRESSIONS.get(style, PROGRESSIONS["pop"])
    chords = (prog * ((bars // len(prog)) + 1))[:bars]
    return {"chords": chords, "notes": []}


@router.post("/generate-lyrics")
async def generate_lyrics(req: dict):
    return {"lyrics": "Lyrics generation requires an AI API key. Set it in Settings → AI."}
