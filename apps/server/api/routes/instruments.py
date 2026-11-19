"""AI Instruments: MIDI notes played by an AI instrument.

MIDI-DDSP (Google Magenta) plays 13 orchestral instruments on the processor, in its own Python environment
(services/midi_ddsp_worker.py). The other engine, ACE-Step "cover" for any instrument by text, runs through
/music/generate with the rendered MIDI track as its source.
"""
import json
import os
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

WORKER = Path(__file__).resolve().parents[2] / "services" / "midi_ddsp_worker.py"

INSTRUMENTS = [
    {"id": "violin", "name": "Violin", "category": "Strings", "low": 55, "high": 103},
    {"id": "viola", "name": "Viola", "category": "Strings", "low": 48, "high": 91},
    {"id": "cello", "name": "Cello", "category": "Strings", "low": 36, "high": 76},
    {"id": "double-bass", "name": "Double bass", "category": "Strings", "low": 28, "high": 67},
    {"id": "flute", "name": "Flute", "category": "Woodwinds", "low": 60, "high": 98},
    {"id": "oboe", "name": "Oboe", "category": "Woodwinds", "low": 58, "high": 91},
    {"id": "clarinet", "name": "Clarinet", "category": "Woodwinds", "low": 50, "high": 94},
    {"id": "saxophone", "name": "Saxophone", "category": "Woodwinds", "low": 49, "high": 81},
    {"id": "bassoon", "name": "Bassoon", "category": "Woodwinds", "low": 34, "high": 75},
    {"id": "trumpet", "name": "Trumpet", "category": "Brass", "low": 54, "high": 86},
    {"id": "horn", "name": "French horn", "category": "Brass", "low": 34, "high": 77},
    {"id": "trombone", "name": "Trombone", "category": "Brass", "low": 34, "high": 72},
    {"id": "tuba", "name": "Tuba", "category": "Brass", "low": 26, "high": 65},
]
_IDS = {i["id"] for i in INSTRUMENTS}

_jobs: dict[str, dict] = {}
_procs: dict[str, subprocess.Popen] = {}
_lock = threading.Lock()                     # one AI instrument at a time: TensorFlow takes the whole processor


def ddsp_python() -> str | None:
    p = os.environ.get("AMS_DDSP_PYTHON")
    return p if p and os.path.exists(p) else None


class NoteIn(BaseModel):
    pitch: int = Field(ge=0, le=127)
    start: float = Field(ge=0)                # seconds from the start of the part
    end: float = Field(ge=0)
    velocity: int = Field(100, ge=1, le=127)


class Expression(BaseModel):
    vibrato: float = Field(1.0, ge=0, le=3)
    dynamics: float = Field(1.0, ge=0, le=3)
    brightness: float = Field(1.0, ge=0, le=3)
    attack: float = Field(1.0, ge=0, le=3)
    velocity: float = Field(0.5, ge=0, le=1)  # how much the note velocities count (0: not at all)


class PlayRequest(BaseModel):
    instrument: str
    notes: list[NoteIn]
    expression: Expression = Expression()
    transpose: int = Field(0, ge=-24, le=24)
    voices: int = Field(4, ge=1, le=8)        # players for chords (a section)
    title: str = ""
    save: bool = True                         # also keep it in the Library


@router.get("/list")
async def list_instruments():
    return INSTRUMENTS


@router.get("/status")
async def status():
    """What can play here: MIDI-DDSP (installed?) and ACE-Step cover (installed? graphics card?)."""
    import importlib.util
    ace = importlib.util.find_spec("acestep") is not None
    try:
        import torch  # noqa: F401
        cuda = bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001 - no PyTorch: no CUDA
        cuda = False
    return {"ddsp": ddsp_python() is not None, "ace": ace, "cuda": cuda}


def _say(job: dict, **kw) -> None:
    job.update(kw)


def _run(job_id: str, req: PlayRequest) -> None:
    job = _jobs[job_id]
    py = ddsp_python()
    work = Path(tempfile.gettempdir()) / "ams_instruments"
    work.mkdir(exist_ok=True)
    out = work / f"{req.instrument}-{job_id}.wav"
    req_file = work / f"{job_id}.json"
    req_file.write_text(json.dumps({
        "instrument": req.instrument, "notes": [n.model_dump() for n in req.notes], "out": str(out),
        "transpose": req.transpose, "voices": req.voices, "expression": req.expression.model_dump(),
    }), encoding="utf-8")
    with _lock:
        if job.get("cancel"):
            _say(job, status="cancelled", text="Cancelled")
            return
        _say(job, status="running", started=time.time(), text="Starting the AI instrument")
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "TF_CPP_MIN_LOG_LEVEL": "2"}
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        proc = subprocess.Popen([py, str(WORKER), str(req_file)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace", env=env, creationflags=flags)
        _procs[job_id] = proc
        err_tail: list[str] = []

        def read_err() -> None:
            for line in proc.stderr:  # type: ignore[union-attr]
                err_tail.append(line.rstrip())
                del err_tail[:-30]
        threading.Thread(target=read_err, daemon=True).start()
        result: dict = {}
        for line in proc.stdout:  # type: ignore[union-attr]
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if "error" in msg:
                result = msg
            elif msg.get("done"):
                result = msg
            else:
                total = msg.get("total") or 0
                _say(job, stage=msg.get("stage"), text=msg.get("text", ""),
                     progress=(msg.get("step", 0) / total) if total else job.get("progress", 0))
        proc.wait()
        _procs.pop(job_id, None)
    req_file.unlink(missing_ok=True)
    if job.get("cancel"):
        _say(job, status="cancelled", text="Cancelled")
        return
    if not result.get("done") or not out.exists():
        msg = result.get("error") or (err_tail[-1] if err_tail else "The AI instrument stopped without a result.")
        print("[instruments] " + "\n".join(err_tail[-15:]), flush=True)
        _say(job, status="error", error=msg, text="Failed")
        return
    path, library_id = str(out), None
    if req.save:
        try:
            from services import library
            name = next((i["name"] for i in INSTRUMENTS if i["id"] == req.instrument), req.instrument)
            entry = library.add_track(str(out), {
                "title": req.title or f"{name} (AI)", "engine": "midi-ddsp", "source": "generated",
                "folder": "AI Instruments", "tags": ["ai instrument", name.lower()], "duration": result.get("seconds")})
            path, library_id = entry["path"], entry["id"]
        except Exception as e:  # noqa: BLE001 - the file is still usable from the temporary folder
            print(f"[instruments] could not save to the library: {e}", flush=True)
    _say(job, status="done", progress=1, text="Done", audio_file=path, library_id=library_id,
         duration=result.get("seconds"), voices=result.get("voices"), finished=time.time())


@router.post("/play")
async def play(req: PlayRequest):
    if req.instrument not in _IDS:
        raise HTTPException(400, f"Unknown instrument: {req.instrument}")
    notes = [n for n in req.notes if n.end > n.start]
    if not notes:
        raise HTTPException(400, "The part has no notes.")
    if ddsp_python() is None:
        raise HTTPException(409, "The AI Instruments are not installed: Settings → AI Engines → AI Instruments (MIDI-DDSP).")
    req.notes = notes
    job_id = uuid.uuid4().hex[:10]
    _jobs[job_id] = {"id": job_id, "status": "queued", "progress": 0, "text": "Waiting", "created": time.time()}
    threading.Thread(target=_run, args=(job_id, req), daemon=True).start()
    return {"jobId": job_id}


@router.get("/jobs/{job_id}")
async def job(job_id: str):
    j = _jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Unknown job")
    return {**j, "elapsed": round(time.time() - (j.get("started") or j["created"]), 1)}


@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: str):
    j = _jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Unknown job")
    j["cancel"] = True
    if j["status"] == "queued":
        j.update(status="cancelled", text="Cancelled")
    p = _procs.get(job_id)
    if p is not None:
        try:
            p.kill()
        except Exception:  # noqa: BLE001 - already gone
            pass
    return {"ok": True}

