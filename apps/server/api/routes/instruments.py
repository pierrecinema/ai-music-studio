"""AI Instrument synthesis — DDSP / FluidSynth fallback."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, uuid, tempfile

router = APIRouter()


class NoteIn(BaseModel):
    pitch: int
    startTime: float
    duration: float
    velocity: int


class GenerateInstrumentRequest(BaseModel):
    instrumentId: str
    notes: list[NoteIn]
    ensemble: bool = False


INSTRUMENTS = [
    {"id": "strings-violin", "name": "Violin", "category": "Strings"},
    {"id": "strings-viola", "name": "Viola", "category": "Strings"},
    {"id": "strings-cello", "name": "Cello", "category": "Strings"},
    {"id": "strings-section", "name": "String Section", "category": "Strings"},
    {"id": "brass-trumpet", "name": "Trumpet", "category": "Brass"},
    {"id": "brass-trombone", "name": "Trombone", "category": "Brass"},
    {"id": "brass-horn", "name": "French Horn", "category": "Brass"},
    {"id": "woodwind-sax-alto", "name": "Alto Saxophone", "category": "Woodwind"},
    {"id": "woodwind-clarinet", "name": "Clarinet", "category": "Woodwind"},
    {"id": "woodwind-flute", "name": "Flute", "category": "Woodwind"},
    {"id": "ethnic-duduk", "name": "Duduk", "category": "Ethnic"},
    {"id": "ethnic-dizi", "name": "Dizi", "category": "Ethnic"},
]


@router.get("/list")
async def list_instruments():
    return INSTRUMENTS


@router.post("/generate")
async def generate_instrument(req: GenerateInstrumentRequest):
    if not req.notes:
        raise HTTPException(400, "No notes provided")

    out_dir = tempfile.gettempdir()
    out_file = os.path.join(out_dir, f"inst_{uuid.uuid4().hex[:8]}.wav")

    try:
        from services.ddsp_service import synthesize_instrument
        duration = await synthesize_instrument(
            instrument_id=req.instrumentId,
            notes=[(n.pitch, n.startTime, n.duration, n.velocity) for n in req.notes],
            out_path=out_file
        )
    except ImportError:
        duration = _fluidsynth_fallback(req.instrumentId, req.notes, out_file)

    return {"audioFile": out_file, "duration": duration}


def _fluidsynth_fallback(instrument_id: str, notes, out_path: str) -> float:
    """MIDI → WAV via FluidSynth as fallback."""
    import struct

    # Map instrument to GM program number
    GM_MAP = {
        "strings-violin": 40, "strings-viola": 41, "strings-cello": 42,
        "strings-section": 48, "brass-trumpet": 56, "brass-trombone": 57,
        "brass-horn": 60, "woodwind-sax-alto": 65, "woodwind-clarinet": 71,
        "woodwind-flute": 73, "ethnic-duduk": 111, "ethnic-dizi": 84,
    }
    program = GM_MAP.get(instrument_id, 40)

    try:
        import mido
        mid = mido.MidiFile(type=0, ticks_per_beat=480)
        track = mido.MidiTrack()
        mid.tracks.append(track)
        track.append(mido.Message("program_change", program=program, time=0))

        events: list[tuple[float, str, int]] = []
        for n in notes:
            events.append((n.startTime, "note_on", n.pitch))
            events.append((n.startTime + n.duration, "note_off", n.pitch))
        events.sort()

        last_tick = 0
        for t, kind, pitch in events:
            tick = int(t * 480)
            delta = tick - last_tick
            last_tick = tick
            vel = 100 if kind == "note_on" else 0
            track.append(mido.Message(kind, note=pitch, velocity=vel, time=delta))

        midi_path = out_path.replace(".wav", ".mid")
        mid.save(midi_path)

        # Try FluidSynth
        import subprocess
        sf2 = _find_sf2()
        if sf2:
            subprocess.run(["fluidsynth", "-ni", sf2, midi_path, "-F", out_path, "-r", "44100"], capture_output=True)
        else:
            _write_silence(out_path, max(n.startTime + n.duration for n in notes))

    except Exception:
        total = max(n.startTime + n.duration for n in notes)
        _write_silence(out_path, total)
        total_duration = total

    return max(n.startTime + n.duration for n in notes)


def _find_sf2():
    candidates = [
        r"C:\Windows\System32\drivers\gm.dls",
        r"C:\Program Files\Common Files\SoundFonts\default.sf2",
        "/usr/share/sounds/sf2/FluidR3_GM.sf2",
        "/usr/share/soundfonts/GeneralUser_GS.sf2"
    ]
    return next((p for p in candidates if os.path.exists(p)), None)


def _write_silence(path: str, duration: float):
    import struct
    sample_rate, num_samples = 44100, int(duration * 44100)
    data_size = num_samples * 2
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(b"\x00" * data_size)
