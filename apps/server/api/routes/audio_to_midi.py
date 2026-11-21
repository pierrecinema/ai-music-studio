"""Audio-to-MIDI: basic-pitch (default) or MuScriptor (optional, CC BY-NC 4.0)."""
import asyncio
import glob
import os
import shutil
import subprocess
import sys
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
    # the backend runs from the app's own venv: its Scripts folder is not on PATH
    scripts = os.path.dirname(sys.executable)
    for name in ("muscriptor.exe", "muscriptor"):
        candidate = os.path.join(scripts, name)
        if os.path.exists(candidate):
            return candidate
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
    # basic-pitch and MuScriptor take a while: in a thread, so the server keeps answering meanwhile
    return await asyncio.to_thread(_convert, req)


def _convert(req: AudioToMidiRequest):
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
        except ModuleNotFoundError as e:
            if (e.name or "").split(".")[0] != "basic_pitch":
                raise HTTPException(500, f"basic-pitch is installed but a dependency is missing: {e.name}. "
                                         "Press Install selected in Settings → AI Engines again.")
            import mido
            midi_path = os.path.join(out_dir, "output.mid")
            mid = mido.MidiFile()
            mid.tracks.append(mido.MidiTrack())
            mid.save(midi_path)
            used = "stub"
            warnings.append("No transcription engine installed (pip install basic-pitch). Wrote an empty MIDI file.")
        except Exception as e:
            hint = ""
            if "numpy" in str(e).lower() or "ml_dtypes" in str(e).lower():
                hint = " TensorFlow (used by basic-pitch) does not work with NumPy 2: use MuScriptor instead."
            raise HTTPException(500, f"basic-pitch failed: {str(e).strip().splitlines()[-1][:300]}.{hint}")

    try:
        notes = _read_notes(midi_path)
    except Exception as e:
        raise HTTPException(500, f"Could not read MIDI result: {e}")

    return {"midiFile": midi_path, "notes": notes, "engine": used, "warnings": warnings}


# ── a whole song -> MIDI tracks: stems, the right method per instrument, tempo, key and chords ──────────────

import threading  # noqa: E402
import time  # noqa: E402

_song_jobs: dict[str, dict] = {}

# the sound-pack instrument (General MIDI program) each stem gets in the Studio; 128 = drum kit
STEM_PROGRAM = {"vocals": 73, "melody": 73, "bass": 33, "drums": 128, "piano": 0, "guitar": 27, "other": 4}
STEM_NAME = {"vocals": "Vocals (melody)", "bass": "Bass", "drums": "Drums", "piano": "Piano", "guitar": "Guitar", "other": "Keys / synths"}


class SongToMidiRequest(BaseModel):
    filePath: str
    separate: bool = True                     # split into stems first (Demucs 6 stems); off: the file is one stem
    stem: str = "other"                       # without separating: what the file is (vocals, bass, drums, piano, guitar, other)
    stems: dict[str, str] | None = None       # stems that are already split (name -> wav): no new separation
    want: list[str] = ["vocals", "bass", "drums", "piano", "guitar", "other"]
    bpm: float | None = None                  # the project tempo as a hint (a song at 72 is not taken for 144)
    quantize: float = 0.25                    # grid in beats (0 = off)
    strength: float = 0.6                     # 0..1: how far notes move to the grid (1 = exactly on it)


def _rms_db(path: str) -> float:
    import soundfile as sf
    import numpy as np
    x, _ = sf.read(path, dtype="float32", always_2d=True)
    return float(20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9))


def _song_job(job: dict, req: SongToMidiRequest) -> None:
    from services import transcribe as tr

    def say(pct: float, text: str) -> None:
        job["progress"] = round(pct, 1); job["text"] = text; job["updated"] = time.time()
        if job.get("cancel"):
            raise RuntimeError("Cancelled")

    try:
        say(1, "Reading the song")
        if req.stems:
            stems = {k: v for k, v in req.stems.items() if k in req.want and os.path.exists(v)}
        elif req.separate:
            from api.routes.stems import StemSplitRequest, run_split
            say(2, "Splitting the song into stems (Demucs, 6 stems)")
            stems = run_split(StemSplitRequest(filePath=req.filePath, model="htdemucs_6s", stems=req.want),
                              lambda pct, text=None: say(2 + 0.55 * float(pct), f"Splitting into stems: {text or ''} {round(float(pct))} %".strip()), job)
        else:
            stems = {req.stem: req.filePath}
        say(58, "Finding tempo, bars, key and chords")
        if os.path.exists(req.filePath):
            mix = req.filePath
        elif len(stems) > 1:
            from api.routes.stems import mix_stems                       # only stems came: tempo and chords from their sum
            mix = mix_stems(stems, {})
        else:
            mix = next(iter(stems.values()))
        song = tr.analyze_song(mix, req.bpm)
        mix_db = _rms_db(mix)
        parts, skipped = [], []
        names = [s for s in ("drums", "bass", "vocals", "piano", "guitar", "other") if s in stems] + [s for s in stems if s not in STEM_PROGRAM]
        for i, name in enumerate(names):
            path = stems[name]
            say(60 + 38 * i / max(1, len(names)), f"Turning {name} into MIDI")
            # a stem the separator left nearly empty (no piano in the song …) is skipped
            if len(stems) > 1 and _rms_db(path) < mix_db - 30:
                skipped.append(name); continue
            r = tr.transcribe_stem(path, name)
            if len(r["notes"]) < 4:
                skipped.append(name); continue
            notes = tr.to_beats(r["notes"], song["bpm"], song["firstBeat"], req.quantize if name != "vocals" else min(req.quantize, 0.25) * 0.5, req.strength)
            conf = [n["confidence"] for n in notes]
            parts.append({"stem": name, "name": STEM_NAME.get(name, name.capitalize()), "kind": r["kind"], "method": r["method"],
                          "program": STEM_PROGRAM.get(name, 0), "notes": notes, "confidence": round(sum(conf) / len(conf), 2),
                          "audio": path})
        job["result"] = {**song, "parts": parts, "skipped": skipped, "stems": stems}
        job["status"] = "done"; say(100, "Done")
    except Exception as e:  # noqa: BLE001 - the app shows the reason
        msg = "Cancelled" if type(e).__name__ == "Cancelled" else str(getattr(e, "detail", "") or e)
        job["status"] = "cancelled" if msg == "Cancelled" else "error"
        job["error"] = msg
        if "No module named 'basic_pitch'" in msg or "No module named 'librosa'" in msg:
            job["error"] = "Audio → MIDI needs the engine \"Audio → MIDI (basic-pitch)\": Settings → AI Engines."


@router.post("/song")
async def start_song(req: SongToMidiRequest):
    """Start turning a song into MIDI tracks in the background; poll GET /audio-to-midi/song/{id}."""
    if not os.path.exists(req.filePath) and not req.stems:
        raise HTTPException(400, f"File not found: {req.filePath}")
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "text": "Starting", "result": None, "error": None, "started": time.time()}
    _song_jobs[jid] = job
    threading.Thread(target=_song_job, args=(job, req), daemon=True).start()
    return {"jobId": jid}


@router.get("/song/{jid}")
async def song_status(jid: str):
    job = _song_jobs.get(jid)
    if not job:
        raise HTTPException(404, "Unknown job")
    return {k: v for k, v in job.items() if k != "cancel"} | {"elapsed": round(time.time() - job["started"], 1)}


@router.post("/song/{jid}/cancel")
async def cancel_song(jid: str):
    job = _song_jobs.get(jid)
    if not job:
        raise HTTPException(404, "Unknown job")
    job["cancel"] = True
    return {"ok": True}
