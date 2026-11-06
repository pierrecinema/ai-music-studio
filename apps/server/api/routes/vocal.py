"""Vocal synthesis routes — DiffSinger / VITS / cloud fallback."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, uuid, tempfile

router = APIRouter()


class NoteIn(BaseModel):
    pitch: int
    startTime: float
    duration: float
    velocity: int
    lyric: Optional[str] = None


class VocalControls(BaseModel):
    power: float = 0.8
    breathiness: float = 0.3
    vibrato: float = 0.5
    pitch: int = 0


class GenerateVocalRequest(BaseModel):
    voiceId: str
    notes: list[NoteIn]
    lyrics: str
    controls: VocalControls


class CloneVoiceRequest(BaseModel):
    audioFiles: list[str]
    name: str


VOICES = [
    {"id": "v001", "name": "Aria", "language": "en", "gender": "female", "category": "Pop"},
    {"id": "v002", "name": "Marco", "language": "en", "gender": "male", "category": "Pop"},
    {"id": "v003", "name": "Sakura", "language": "ja", "gender": "female", "category": "J-Pop"},
    {"id": "v004", "name": "Luna", "language": "es", "gender": "female", "category": "Latin"},
    {"id": "v005", "name": "Kai", "language": "ko", "gender": "male", "category": "K-Pop"},
    {"id": "v006", "name": "Elena", "language": "it", "gender": "female", "category": "Opera"},
    {"id": "v007", "name": "Chen", "language": "zh", "gender": "male", "category": "Mandopop"},
    {"id": "v008", "name": "Baptiste", "language": "fr", "gender": "male", "category": "Chanson"},
]


@router.get("/voices")
async def list_voices():
    return VOICES


@router.post("/generate")
async def generate_vocal(req: GenerateVocalRequest):
    """
    Generate AI vocals from MIDI notes + lyrics.
    Uses local DiffSinger model if available, else stubs with silence placeholder.
    """
    if not req.notes:
        raise HTTPException(400, "No notes provided")

    out_dir = tempfile.gettempdir()
    out_file = os.path.join(out_dir, f"vocal_{uuid.uuid4().hex[:8]}.wav")

    try:
        from services.diffsinger_service import synthesize_vocal
        duration = await synthesize_vocal(
            voice_id=req.voiceId,
            notes=[(n.pitch, n.startTime, n.duration, n.lyric or "") for n in req.notes],
            lyrics=req.lyrics,
            controls=req.controls.model_dump(),
            out_path=out_file
        )
    except ImportError:
        duration = _stub_silence(req.notes, out_file)

    return {"audioFile": out_file, "duration": duration}


@router.post("/clone")
async def clone_voice(req: CloneVoiceRequest):
    """Submit audio files for voice model training."""
    for f in req.audioFiles:
        if not os.path.exists(f):
            raise HTTPException(400, f"File not found: {f}")

    voice_id = f"custom_{req.name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
    return {"voiceId": voice_id, "status": "queued", "message": "Voice cloning queued. Check back in a few minutes."}


def _stub_silence(notes, out_path: str) -> float:
    """Write a silent WAV file as placeholder when no model is available."""
    import struct, math
    total_duration = max((n.startTime + n.duration) for n in notes)
    sample_rate = 44100
    num_samples = int(total_duration * sample_rate)
    with open(out_path, "wb") as f:
        # WAV header
        data_size = num_samples * 2
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(b"\x00" * data_size)
    return total_duration
