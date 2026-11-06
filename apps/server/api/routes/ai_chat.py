"""AI chat route — Claude (Anthropic) or ChatGPT (OpenAI)."""
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
"""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    provider: Literal["claude", "openai"]
    apiKey: str
    model: str
    messages: list[Message]
    systemContext: str = ""


@router.post("/chat")
async def chat(req: ChatRequest):
    if not req.apiKey:
        raise HTTPException(400, "API key required. Set it in Settings → AI.")

    system = MUSIC_SYSTEM_PROMPT
    if req.systemContext:
        system += f"\n\nProject context: {req.systemContext}"

    try:
        if req.provider == "claude":
            return await _claude_chat(req.apiKey, req.model, req.messages, system)
        else:
            return await _openai_chat(req.apiKey, req.model, req.messages, system)
    except Exception as e:
        raise HTTPException(500, str(e))


async def _claude_chat(api_key: str, model: str, messages: list[Message], system: str) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in messages]
    )
    return response.content[0].text


async def _openai_chat(api_key: str, model: str, messages: list[Message], system: str) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    msgs = [{"role": "system", "content": system}]
    msgs.extend({"role": m.role, "content": m.content} for m in messages)
    response = await client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=msgs
    )
    return response.choices[0].message.content


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
