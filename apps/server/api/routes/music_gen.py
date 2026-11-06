"""Full-song generation (ACE-Step) with LoRA support, tuned for 8 GB VRAM / 12 GB RAM."""
from __future__ import annotations

import inspect
import json
import os
import random
import shutil
import subprocess
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


class LoraLayers(BaseModel):
    self_attention: float = 1.0
    cross_attention: float = 1.0
    mlp: float = 1.0
    condition: float = 1.0
    time: float = 1.0
    input: float = 1.0


class Dcw(BaseModel):
    mode: str = "off"
    strength: float = 0.1
    high_band: float = 0.0


class GenerateMusicRequest(BaseModel):
    # song
    title: str = ""
    prompt: str = ""
    lyrics: str = ""
    instrumental: bool = False
    language: str | None = None
    voice: str = "any"                      # any | male | female
    # song parameters (None = let the engine decide)
    duration: int | None = Field(None, ge=5, le=600)
    bpm: int | None = Field(None, ge=30, le=300)
    key: str | None = None
    time_signature: str | None = None
    # source and reference
    source_track: str | None = None
    source_task: str = "cover"              # cover | repaint | extend
    source_strength: float = Field(0.7, ge=0.0, le=1.0)
    timbre_reference: str | None = None
    # LoRA
    loras: list[LoraUse] = []
    lora_layers: LoraLayers = LoraLayers()
    # quality
    think: bool = False
    steps: int = Field(40, ge=1, le=200)
    songs: int = Field(1, ge=1, le=8)
    variations: int = Field(1, ge=1, le=8)
    queue: int = Field(1, ge=1, le=16)
    randomize_seed: bool = True
    seed: int | None = None
    # language-model stage
    rewrite_style: bool = False
    temperature: float = 0.85
    cfg_scale: float = 2.0
    top_p: float = 0.9
    top_k: int = 0
    melodic_variation: float = 1.0
    negative_prompt: str = ""
    lm_seed: int | None = None
    audio_codes: str = ""
    # rendering
    guidance: float = 15.0
    shift: float = 3.0
    solver: str = "euler"                   # euler | heun | ...
    schedule: str = "linear-quadratic"
    dcw: Dcw = Dcw()
    custom_timesteps: str = ""
    retake: float = Field(0.0, ge=0.0, le=1.0)
    latent_shift: float = 0.0
    latent_scale: float = 1.0
    # output
    output_format: str = "flac"             # flac | mp3 | wav
    mp3_bitrate: int = 320
    fade_in: float = Field(0.0, ge=0.0)
    fade_out: float = Field(0.0, ge=0.0)


DEFAULT_REQUEST = GenerateMusicRequest().model_dump()
# Advanced fields that a given engine build may or may not understand
ADVANCED_FIELDS = [
    "think", "rewrite_style", "temperature", "cfg_scale", "top_p", "top_k", "melodic_variation",
    "negative_prompt", "lm_seed", "audio_codes", "shift", "schedule", "custom_timesteps",
    "latent_shift", "latent_scale", "lora_layers", "dcw",
]


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


def _compose_prompt(req: GenerateMusicRequest) -> str:
    parts = [req.prompt.strip()] if req.prompt.strip() else []
    if req.bpm:
        parts.append(f"{req.bpm} bpm")
    if req.key:
        parts.append(f"key of {req.key}")
    if req.time_signature:
        parts.append(f"{req.time_signature} time")
    if not req.instrumental:
        if req.voice in ("male", "female"):
            parts.append(f"{req.voice} vocals")
        if req.language and req.language.lower() not in ("", "auto"):
            parts.append(f"{req.language} lyrics")
    return ", ".join(parts) or "music"


def _wav_seconds(path: str) -> float | None:
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return None


def _finalize(wav_path: str, req: GenerateMusicRequest, warnings: list[str]) -> str:
    """Convert to the wanted format and apply fades with ffmpeg (if available)."""
    wants_convert = req.output_format != "wav"
    wants_fade = req.fade_in > 0 or req.fade_out > 0
    if not wants_convert and not wants_fade:
        return wav_path
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        warnings.append("ffmpeg not found: kept the raw WAV (no format conversion or fades).")
        return wav_path

    filters = []
    if req.fade_in > 0:
        filters.append(f"afade=t=in:st=0:d={req.fade_in}")
    if req.fade_out > 0:
        total = _wav_seconds(wav_path)
        if total:
            filters.append(f"afade=t=out:st={max(total - req.fade_out, 0):.3f}:d={req.fade_out}")
        else:
            warnings.append("Could not read the track length: fade-out skipped.")
    ext = {"flac": "flac", "mp3": "mp3", "wav": "wav"}.get(req.output_format, "flac")
    out = str(Path(wav_path).with_suffix(f".{ext}"))
    if out == wav_path:
        out = str(Path(wav_path).with_name(Path(wav_path).stem + "_out.wav"))
    cmd = [ffmpeg, "-y", "-i", wav_path]
    if filters:
        cmd += ["-af", ",".join(filters)]
    if ext == "mp3":
        cmd += ["-c:a", "libmp3lame", "-b:a", f"{req.mp3_bitrate}k"]
    elif ext == "flac":
        cmd += ["-c:a", "flac"]
    cmd.append(out)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        warnings.append(f"ffmpeg failed, kept the raw WAV: {(r.stderr or '')[-200:]}")
        return wav_path
    return out


def _engine_kwargs(pipe, req: GenerateMusicRequest, duration: int, seed: int,
                   lora_path: str, lora_weight: float, save_path: str,
                   warnings: list[str]) -> dict:
    """Build the call arguments; only pass what the installed engine accepts."""
    try:
        params = inspect.signature(pipe.__call__).parameters
    except (TypeError, ValueError):
        params = {}
    accepted = set(params)
    takes_var_kwargs = any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values())

    kwargs: dict = {
        "audio_duration": duration,
        "prompt": _compose_prompt(req),
        "lyrics": "[instrumental]" if req.instrumental else req.lyrics,
        "infer_step": req.steps,
        "guidance_scale": req.guidance,
        "manual_seeds": str(seed),
        "save_path": save_path,
        "lora_name_or_path": lora_path,
        "lora_weight": lora_weight,
    }
    if req.solver in ("euler", "heun", "pingpong"):
        kwargs["scheduler_type"] = req.solver
    elif req.solver != DEFAULT_REQUEST["solver"]:
        warnings.append(f"Solver '{req.solver}' is not supported by this engine build, using the default.")

    ref = req.source_track or req.timbre_reference
    if ref:
        if req.source_track and req.source_task != "cover":
            warnings.append(
                f"Source task '{req.source_task}' is not supported by this engine build (cover/remix only)."
            )
        else:
            kwargs.update(audio2audio_enable=True, ref_audio_input=ref, ref_audio_strength=req.source_strength)
    if req.retake > 0:
        kwargs.update(retake_variance=req.retake, retake_seeds=str(seed + 1))

    dump = req.model_dump()
    ignored = []
    for field in ADVANCED_FIELDS:
        if dump[field] == DEFAULT_REQUEST[field]:
            continue
        if field in accepted:
            kwargs[field] = dump[field]
        else:
            ignored.append(field)
    if ignored:
        warnings.append("Not supported by the installed engine, ignored: " + ", ".join(ignored))

    if accepted and not takes_var_kwargs:
        dropped = [k for k in kwargs if k not in accepted]
        for k in dropped:
            kwargs.pop(k)
        optional_dropped = [k for k in dropped if k not in ("manual_seeds", "save_path")]
        if optional_dropped:
            warnings.append("Engine does not accept: " + ", ".join(optional_dropped))
    return kwargs


def _run_job(job_id: str, req: GenerateMusicRequest) -> None:
    job = _jobs[job_id]
    res = resources()
    warnings: list[str] = []

    duration = req.duration or 60
    if req.duration is None:
        warnings.append("Length 'Auto' uses 60 s with this engine.")
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

    total = req.songs * req.variations * req.queue
    base_seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    out_dir = Path(tempfile.gettempdir()) / "ams_music"
    out_dir.mkdir(exist_ok=True)
    results: list[dict] = []
    job["progress"] = {"done": 0, "total": total}

    with _gen_lock:
        job["status"] = "running"
        engine_kind = "ace-step"
        try:
            pipe = _get_pipeline()
        except ModuleNotFoundError as e:
            if (e.name or "").split(".")[0] != "acestep":
                job.update(status="error", warnings=warnings,
                           error=f"ACE-Step is installed but a dependency is missing: {e.name}. "
                                 "Open Settings → AI Engines and press Install selected again.")
                return
            pipe = None
            engine_kind = "stub"
            warnings.append(
                "ACE-Step is not installed, wrote silent placeholders. "
                "Install it in Settings → AI Engines."
            )
        except Exception as e:
            job.update(status="error", warnings=warnings,
                       error=f"ACE-Step is installed but cannot start: {_short(e)}")
            return

        for i in range(total):
            seed = random.randint(0, 2**31 - 1) if req.randomize_seed else base_seed + i
            wav = str(out_dir / f"song_{job_id}_{i + 1}.wav")
            try:
                if pipe is None:
                    _silent_wav(wav, duration)
                else:
                    kwargs = _engine_kwargs(pipe, req, duration, seed, lora_path, lora_weight, wav,
                                            warnings if i == 0 else [])
                    pipe(**kwargs)
                final = _finalize(wav, req, warnings if i == 0 else [])
            except Exception as e:  # model / out-of-memory errors
                job.update(status="error", error=str(e), warnings=warnings, results=results)
                return
            results.append({"audio_file": final, "seed": seed, "duration": duration})
            job["progress"] = {"done": i + 1, "total": total}
            job["results"] = list(results)

    job.update(
        status="done", engine=engine_kind, audio_file=results[0]["audio_file"], results=results,
        duration=duration, warnings=warnings, finished=time.time(),
    )


@router.post("/generate")
async def generate_music(req: GenerateMusicRequest):
    if not req.prompt.strip() and not req.lyrics.strip() and not req.source_track:
        raise HTTPException(400, "Describe the music (style) or provide lyrics.")
    job_id = uuid.uuid4().hex[:10]
    _jobs[job_id] = {"id": job_id, "status": "queued", "created": time.time(), "warnings": [], "results": []}
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    return {"jobId": job_id}


@router.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return job


_engine: dict = {"state": "unknown", "error": ""}
_engine_lock = threading.Lock()


def _short(e: BaseException) -> str:
    """The root cause of a (possibly wrapped) import error, in one readable line."""
    lines = [l.strip() for l in str(e).splitlines() if l.strip()]
    msg = lines[-1] if lines else type(e).__name__
    if "numpy.core.umath" in msg or "_ARRAY_API" in msg:
        msg += (" (a package was built for NumPy 1.x, usually TensorFlow from basic-pitch; "
                "restart the app, and if it persists press Install selected again)")
    return msg[:400]


def _probe_engine() -> None:
    """Really import the pipeline once: 'installed' must mean 'usable'."""
    try:
        import acestep.pipeline_ace_step  # type: ignore  # noqa: F401
        _engine.update(state="ready", error="")
    except ModuleNotFoundError as e:
        if (e.name or "").split(".")[0] == "acestep":
            _engine.update(state="missing", error="")
        else:
            _engine.update(state="broken", error=f"a dependency is missing: {e.name}")
    except Exception as e:
        _engine.update(state="broken", error=_short(e))


@router.get("/status")
async def status():
    with _engine_lock:
        if _engine["state"] == "unknown":
            _engine["state"] = "checking"   # the first import takes ~30 s: do it in the background
            threading.Thread(target=_probe_engine, daemon=True).start()
    state = _engine["state"]
    return {
        "engine_state": state,                       # checking | ready | missing | broken
        "engine_error": _engine["error"],
        "engine_installed": state in ("checking", "ready", "broken"),
        "model_dir": str(MODEL_DIR),
        "lora_dir": str(LORA_DIR),
        "resources": get_resources(),
    }
