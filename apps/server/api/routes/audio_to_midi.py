"""Audio-to-MIDI: basic-pitch (default) or MuScriptor (optional, CC BY-NC 4.0)."""
import glob
import os
import shutil
import subprocess
import tempfile
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.resource_profile import resources

router = APIRouter()

MUSCRIPTOR_LICENSE = (
    "MuScriptor weights are CC BY-NC 4.0 (non-commercial) and may only be used on "
    "music you have the rights to transcribe."
)


class AudioToMidiRequest(BaseModel):
    filePath: str
    engine: str = "auto"                # auto | basic-pitch | muscriptor
    onsetThreshold: float = 0.5         # basic-pitch: lower = more notes
    frameThreshold: float = 0.3
    minNoteMs: float = 127.7
    muscriptorModel: str | None = None  # small | medium | large


def _muscriptor_cli() -> str | None:
    return shutil.which("muscriptor")


def _run_muscriptor(path: str, out_dir: str, model: str) -> str:
    exe = _muscriptor_cli()
    if not exe:
        raise FileNotFoundError("muscriptor")
    out = os.path.join(out_dir, "muscriptor.mid")
    base = [exe, "transcribe", path, "-o", out]
    # The model-size flag name is not verified; fall back to the CLI default.
    for cmd in (base + ["--model", model], base):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(out):
            return out
    raise RuntimeError((r.stderr or r.stdout)[-300:])


def _run_basic_pitch(req: AudioToMidiRequest, out_dir: str) -> str:
    from basic_pitch.inference import predict_and_save
    from basic_pitch import ICASSP_2022_MODEL_PATH

    predict_and_save(
        [req.filePath], out_dir,
        save_midi=True, sonify_midi=False, save_model_outputs=False, save_notes=False,
        model_or_model_path=ICASSP_2022_MODEL_PATH,
        onset_threshold=req.onsetThreshold,
        frame_threshold=req.frameThreshold,
        minimum_note_length=req.minNoteMs,
    )
    files = glob.glob(os.path.join(out_dir, "*.mid"))
    if not files:
        raise RuntimeError("basic-pitch produced no MIDI file")
    return files[0]


def _read_notes(midi_path: str) -> list[dict]:
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(midi_path)
    return [
        {"pitch": n.pitch, "startTime": n.start, "duration": n.end - n.start, "velocity": n.velocity}
        for inst in pm.instruments if not inst.is_drum for n in inst.notes
    ]


@router.get("/engines")
async def engines():
    try:
        import basic_pitch  # noqa: F401
        bp = True
    except ImportError:
        bp = False
    return {
        "basic-pitch": bp,
        "muscriptor": _muscriptor_cli() is not None,
        "muscriptor_license": MUSCRIPTOR_LICENSE,
    }


@router.post("")
async def convert_audio_to_midi(req: AudioToMidiRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")
    if req.engine not in ("auto", "basic-pitch", "muscriptor"):
        raise HTTPException(400, "engine must be auto, basic-pitch or muscriptor")

    out_dir = os.path.join(tempfile.gettempdir(), f"a2m_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)

    engine = req.engine
    if engine == "auto":
        engine = "muscriptor" if _muscriptor_cli() else "basic-pitch"

    warnings: list[str] = []
    midi_path = ""
    used = engine

    if engine == "muscriptor":
        model = req.muscriptorModel or ("medium" if resources().low_memory else "large")
        try:
            midi_path = _run_muscriptor(req.filePath, out_dir, model)
            warnings.append(MUSCRIPTOR_LICENSE)
        except FileNotFoundError:
            if req.engine == "muscriptor":
                raise HTTPException(501, "MuScriptor is not installed. Run: pip install muscriptor")
            used = "basic-pitch"
        except Exception as e:
            if req.engine == "muscriptor":
                raise HTTPException(500, f"MuScriptor failed: {e}")
            warnings.append(f"MuScriptor failed, used basic-pitch instead: {e}")
            used = "basic-pitch"

    if used == "basic-pitch":
        try:
            midi_path = _run_basic_pitch(req, out_dir)
        except ImportError:
            import mido
            midi_path = os.path.join(out_dir, "output.mid")
            mid = mido.MidiFile()
            mid.tracks.append(mido.MidiTrack())
            mid.save(midi_path)
            used = "stub"
            warnings.append("No transcription engine installed (pip install basic-pitch). Wrote an empty MIDI file.")

    try:
        notes = _read_notes(midi_path)
    except Exception as e:
        raise HTTPException(500, f"Could not read MIDI result: {e}")

    return {"midiFile": midi_path, "notes": notes, "engine": used, "warnings": warnings}
