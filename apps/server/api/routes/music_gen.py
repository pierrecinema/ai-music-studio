"""Full-song generation (ACE-Step) with LoRA support, tuned for 8 GB VRAM / 12 GB RAM."""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
import time
import uuid
import wave
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.resource_profile import get_resources, resources

router = APIRouter()

HOME = Path(os.environ.get("AMS_HOME", Path.home() / ".ai-music-studio"))
LORA_DIR = HOME / "loras"
LORA_INDEX = LORA_DIR / "index.json"
MODEL_DIR = Path(os.environ.get("AMS_ACESTEP_DIR", HOME / "models" / "ace-step"))
LORA_EXTS = {".safetensors", ".pt", ".bin"}

_jobs: dict[str, dict] = {}
_gen_lock = threading.Lock()
_pipeline = None


# ─── LoRA registry ────────────────────────────────────────────────────────────

def _load_index() -> list[dict]:
    if LORA_INDEX.exists():
        try:
            return json.loads(LORA_INDEX.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_index(items: list[dict]) -> None:
    LORA_DIR.mkdir(parents=True, exist_ok=True)
    LORA_INDEX.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _scan_loras() -> list[dict]:
    """Merge the saved index with any LoRA files/folders dropped into LORA_DIR."""
    items = {i["id"]: i for i in _load_index() if Path(i["path"]).exists()}
    if LORA_DIR.exists():
        for p in LORA_DIR.iterdir():
            if p.name == "index.json":
                continue
            if p.is_dir() or p.suffix.lower() in LORA_EXTS:
                lid = p.stem if p.is_file() else p.name
                items.setdefault(lid, {
                    "id": lid, "name": lid, "kind": "style",
                    "path": str(p), "tags": [], "default_strength": 1.0,
                })
    return sorted(items.values(), key=lambda x: x["name"].lower())


class LoraImport(BaseModel):
    path: str
    name: str | None = None
    kind: str = "style"                 # style | artist | sound
    tags: list[str] = []
    copyFile: bool = True


@router.get("/loras")
async def list_loras():
    return {"dir": str(LORA_DIR), "loras": _scan_loras()}


@router.post("/loras/import")
async def import_lora(req: LoraImport):
    src = Path(req.path)
    if not src.exists():
        raise HTTPException(400, f"Not found: {req.path}")
    if src.is_file() and src.suffix.lower() not in LORA_EXTS:
        raise HTTPException(400, f"Unsupported LoRA file type: {src.suffix}")
    LORA_DIR.mkdir(parents=True, exist_ok=True)
    dest = LORA_DIR / src.name
    if req.copyFile and not dest.exists():
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)
    target = dest if req.copyFile else src
    lid = target.stem if target.is_file() else target.name
    items = [i for i in _load_index() if i["id"] != lid]
    entry = {
        "id": lid, "name": req.name or lid, "kind": req.kind,
        "path": str(target), "tags": req.tags, "default_strength": 1.0,
    }
    items.append(entry)
    _save_index(items)
    return entry


@router.delete("/loras/{lora_id}")
async def remove_lora(lora_id: str):
    items = _load_index()
    kept = [i for i in items if i["id"] != lora_id]
    if len(kept) == len(items):
        raise HTTPException(404, "LoRA not in index")
    _save_index(kept)
    return {"removed": lora_id}


# ─── Generation ───────────────────────────────────────────────────────────────

class LoraUse(BaseModel):
    id: str
    strength: float = Field(1.0, ge=0.0, le=2.0)


class GenerateMusicRequest(BaseModel):
    prompt: str = Field(..., description="Style/genre/mood tags or a description")
    lyrics: str = ""
    duration: int = Field(60, ge=5, le=600)
    steps: int = Field(40, ge=8, le=100)
    guidance: float = Field(15.0, ge=1.0, le=30.0)
    seed: int | None = None
    loras: list[LoraUse] = []
    instrumental: bool = False


def _silent_wav(path: str, seconds: int) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * 2 * 44100 * min(seconds, 30))


def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    from acestep.pipeline_ace_step import ACEStepPipeline  # type: ignore

    res = resources()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    _pipeline = ACEStepPipeline(
        checkpoint_dir=str(MODEL_DIR),
        dtype="bfloat16" if res.half_precision else "float32",
        torch_compile=False,
        cpu_offload=res.cpu_offload,
        overlapped_decode=res.low_memory,
    )
    return _pipeline


def _run_job(job_id: str, req: GenerateMusicRequest) -> None:
    job = _jobs[job_id]
    res = resources()
    warnings: list[str] = []
    duration = req.duration
    if duration > res.max_duration_s:
        warnings.append(
            f"Duration capped to {res.max_duration_s}s for this machine "
            f"({res.vram_gb} GB VRAM / {res.ram_gb} GB RAM)."
        )
        duration = res.max_duration_s

    known = {l["id"]: l for l in _scan_loras()}
    chosen = [(known[u.id], u.strength) for u in req.loras if u.id in known]
    for u in req.loras:
        if u.id not in known:
            warnings.append(f"LoRA '{u.id}' not found, skipped.")
    lora_path, lora_weight = "none", 1.0
    if chosen:
        # The engine loads one adapter at a time: use the strongest one.
        best, lora_weight = max(chosen, key=lambda c: c[1])
        lora_path = best["path"]
        if len(chosen) > 1:
            warnings.append(
                f"Engine applies one LoRA per render; using '{best['name']}'. "
                "Render separately and layer the stems to combine styles."
            )
    job["applied_loras"] = [lora_path] if chosen else []

    out_dir = Path(tempfile.gettempdir()) / "ams_music"
    out_dir.mkdir(exist_ok=True)
    out = str(out_dir / f"song_{job_id}.wav")

    with _gen_lock:
        job["status"] = "running"
        try:
            pipe = _get_pipeline()
            pipe(
                audio_duration=duration,
                prompt=req.prompt,
                lyrics="[instrumental]" if req.instrumental else req.lyrics,
                infer_step=req.steps,
                guidance_scale=req.guidance,
                manual_seeds=str(req.seed) if req.seed is not None else None,
                save_path=out,
                lora_name_or_path=lora_path,
                lora_weight=lora_weight,
            )
            job["engine"] = "ace-step"
        except ImportError:
            _silent_wav(out, duration)
            job["engine"] = "stub"
            warnings.append(
                "ACE-Step is not installed, wrote a silent placeholder. "
                "Run: pip install git+https://github.com/ace-step/ACE-Step.git"
            )
        except Exception as e:  # model/OOM errors
            job["status"] = "error"
            job["error"] = str(e)
            job["warnings"] = warnings
            return

    job.update(status="done", audio_file=out, duration=duration, warnings=warnings, finished=time.time())


@router.post("/generate")
async def generate_music(req: GenerateMusicRequest):
    job_id = uuid.uuid4().hex[:10]
    _jobs[job_id] = {"id": job_id, "status": "queued", "created": time.time(), "warnings": []}
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    return {"jobId": job_id}


@router.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return job


@router.get("/status")
async def status():
    try:
        import acestep  # type: ignore  # noqa: F401
        engine = True
    except ImportError:
        engine = False
    return {
        "engine_installed": engine,
        "model_dir": str(MODEL_DIR),
        "lora_dir": str(LORA_DIR),
        "resources": get_resources(),
    }
