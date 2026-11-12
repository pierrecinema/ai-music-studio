"""Full-song generation (ACE-Step) with LoRA support, tuned for 8 GB VRAM / 12 GB RAM."""
from __future__ import annotations

import inspect
import json
import os
import random
import re
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
            if p.name == "index.json" or p.name.startswith("."):   # ".engine" holds staged adapters
                continue
            if p.is_dir() or p.suffix.lower() in LORA_EXTS:
                lid = p.stem if p.is_file() else p.name
                items.setdefault(lid, {
                    "id": lid, "name": lid, "kind": "style",
                    "path": str(p), "tags": [], "default_strength": 1.0,
                })
    return sorted(items.values(), key=lambda x: x["name"].lower())


def _engine_lora_dir(entry: dict) -> str:
    """ACE-Step loads a LoRA from a FOLDER that holds pytorch_lora_weights.safetensors (or a
    Hugging Face repo id), never from a single file. Stage single files into such a folder."""
    p = Path(entry["path"])
    wanted = "pytorch_lora_weights.safetensors"
    if p.is_dir():
        if (p / wanted).exists():
            return str(p)
        candidates = sorted(p.glob("*.safetensors"))
        if not candidates:
            raise RuntimeError(f"The LoRA folder '{p.name}' has no .safetensors file.")
        src = candidates[0]
    else:
        src = p
    stage = LORA_DIR / ".engine" / re.sub(r"[^\w.-]+", "_", entry["id"])
    target = stage / wanted
    stage.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.stat().st_size != src.stat().st_size:
        if target.exists():
            target.unlink()
        try:
            os.link(src, target)            # no extra disk space on the same volume
        except OSError:
            shutil.copy2(src, target)
    return str(stage)


def lora_compat(entry: dict) -> tuple[bool, str]:
    """Is this LoRA made for ACE-Step v1? Its transformer names the attention layers to_q / to_k / to_v /
    linear_q ...; LoRAs for language models (LLaMA, MusicGen, Qwen) target q_proj / k_proj / v_proj and cannot load."""
    p = Path(entry["path"])
    files = [p] if p.is_file() else sorted(p.glob("*.safetensors"))
    if not files:
        return True, ""                         # nothing to inspect: let the engine decide
    try:
        from safetensors import safe_open
        with safe_open(str(files[0]), framework="pt") as f:
            keys = list(f.keys())
    except Exception:
        return True, ""
    text = " ".join(keys)
    ace = any(t in text for t in ("to_q", "to_k", "to_v", "linear_q", "linear_k", "to_out", "speaker_embedder"))
    llm = any(t in text for t in ("q_proj", "k_proj", "v_proj", "o_proj"))
    if llm and not ace:
        return False, (f"The LoRA '{entry.get('name', p.name)}' was made for a language-model architecture "
                       "(layers q_proj, k_proj, v_proj, o_proj), not for ACE-Step. It cannot be used here, so it was skipped.")
    if not ace:
        return False, (f"The LoRA '{entry.get('name', p.name)}' does not contain ACE-Step layers, so it was skipped. "
                       "Only LoRAs trained for ACE-Step v1 work with this engine.")
    return True, ""


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
    compute: str = "auto"                   # auto | gpu | cpu
    engine: str = "ace-step"                # ace-step | musicgen-small | musicgen-medium | musicgen-large
    # song
    title: str = ""
    prompt: str = ""
    lyrics: str = ""
    tags: list[str] = []                    # saved with every song and loop in the library (searchable)
    instrumental: bool = False
    acapella: bool = False                  # only the voice: sung lyrics without any instruments
    loop: bool = False                      # a loop of exactly loop_bars bars that repeats seamlessly
    loop_bars: int = Field(4, ge=1, le=32)
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
    import acestep.pipeline_ace_step as _mod  # type: ignore
    from acestep.pipeline_ace_step import ACEStepPipeline  # type: ignore

    _mod.tqdm = _tracked          # live step counter for the UI

    res = resources()
    import torch
    on_gpu = torch.cuda.is_available()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    _pipeline = ACEStepPipeline(
        checkpoint_dir=str(MODEL_DIR),
        # On a CPU the 3.5B model needs 14 GB in float32 but only 7 GB in bfloat16: small PCs must use bfloat16.
        dtype="bfloat16" if (res.half_precision if on_gpu else res.ram_gb < 16) else "float32",
        torch_compile=False,
        cpu_offload=res.cpu_offload and on_gpu,      # offloading means GPU <-> RAM; pointless on a CPU
        overlapped_decode=res.low_memory,
    )
    return _pipeline


ACAPELLA_TAGS = "a cappella, solo vocals only, unaccompanied voice, no instruments, no drums, no music, dry studio vocal"
ACAPELLA_NEGATIVE = "instruments, drums, percussion, bass, guitar, piano, synth, strings, beat, accompaniment"


_VOCAL_WORDS = re.compile(r"\b(vocals?|voices?|sing(s|er|ers|ing)?|choir|rap|rapping|a ?cappella|acapella)\b", re.I)
_SECTION_TAG = re.compile(r"^\s*\[[^\]]+\]\s*$", re.M)


def _ace_lyrics(req: GenerateMusicRequest) -> str:
    """Lyrics as ACE-Step reads them best: with at least one structure tag ([verse], [chorus])."""
    if req.instrumental:
        return "[instrumental]"
    text = req.lyrics.strip()
    if text and not _SECTION_TAG.search(text):
        text = "[verse]\n" + text
    return text


LOOP_TAGS = "loop, steady tempo, consistent groove, no intro, no outro"
LOOP_DEFAULT_BPM = 120


def beats_per_bar(sig: str | None) -> int:
    try:
        n = int(str(sig or "4/4").split("/")[0])
        return n if 1 <= n <= 16 else 4
    except ValueError:
        return 4


def _prepare_loop(req: GenerateMusicRequest, warnings: list[str]) -> None:
    """A loop needs a tempo, a bit more music than its length, and a format that loops without a gap."""
    from services.loopmake import needed_seconds
    if not req.loop:
        return
    if not req.bpm:
        req.bpm = LOOP_DEFAULT_BPM
        warnings.append(f"No BPM given: the loop is made at {LOOP_DEFAULT_BPM} BPM.")
    req.duration = max(10, needed_seconds(req.loop_bars, beats_per_bar(req.time_signature), req.bpm))
    if req.output_format == "mp3":
        req.output_format = "flac"
        warnings.append("Loops are saved as FLAC: MP3 adds a short silence at the start and would not loop seamlessly.")
    if req.fade_in or req.fade_out:
        req.fade_in = req.fade_out = 0.0
        warnings.append("Fades were switched off: a loop must play at full level at its ends.")


def _compose_prompt(req: GenerateMusicRequest) -> str:
    parts = [req.prompt.strip()] if req.prompt.strip() else []
    if req.acapella:
        parts.insert(0, ACAPELLA_TAGS)
    if req.loop:
        parts.append(LOOP_TAGS)
    if req.bpm:
        parts.append(f"{req.bpm} bpm")
    if req.key:
        parts.append(f"key of {req.key}")
    if req.time_signature:
        parts.append(f"{req.time_signature} time")
    if not req.instrumental:
        if req.voice in ("male", "female"):
            parts.append(f"{req.voice} vocals")
        elif req.lyrics.strip() and not _VOCAL_WORDS.search(", ".join(parts)):
            # Without a vocal tag ACE-Step often renders lyrics as an instrumental: ask for the voice explicitly.
            parts.append("vocals")
        if req.language and req.language.lower() not in ("", "auto"):
            parts.append(f"{req.language} lyrics")
    return ", ".join(parts) or "music"


def _wav_seconds(path: str) -> float | None:
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return None


_start_info: dict[str, dict] = {}      # final file -> what the start alignment found (tempo, first beat)


def _finalize(wav_path: str, req: GenerateMusicRequest, warnings: list[str]) -> str:
    """Cut the track to start on its first beat, convert to the wanted format and apply fades (ffmpeg)."""
    info: dict = {}
    if req.acapella:
        from services.vocal_isolate import isolate_vocals
        done, note = isolate_vocals(wav_path)
        if note:
            warnings.append(note)
    if req.loop:
        from services.loopmake import make_loop
        info = make_loop(wav_path, req.loop_bars, beats_per_bar(req.time_signature), float(req.bpm or LOOP_DEFAULT_BPM))
        if info.get("note"):
            warnings.append(info["note"])
        if req.bpm and abs(info["bpm"] - req.bpm) > 0.5:
            warnings.append(f"The model played at {info['bpm']:.1f} BPM instead of {req.bpm}: the loop keeps its real tempo, "
                            "the Studio stretches it to the project tempo.")
        final = _finalize_file(wav_path, req, warnings)
        _start_info[final] = info
        return final
    try:
        from services.startalign import align_start
        info = align_start(wav_path)
        if info.get("trimmed"):
            warnings.append(f"The track started {info['trimmed']} s before its first beat: that was cut off, it starts on beat 1.")
    except Exception as e:  # noqa: BLE001 - never lose a track because of this step
        print(f"[start-align] skipped: {e}", flush=True)
    final = _finalize_file(wav_path, req, warnings)
    _start_info[final] = info
    return final


def _finalize_file(wav_path: str, req: GenerateMusicRequest, warnings: list[str]) -> str:
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
        "lyrics": _ace_lyrics(req),
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



# ── live progress: what the engine is doing right now ─────────────────────────
_cur: dict = {"job": None}


def loop_title(base: str, bpm: float | None, bars: int) -> str:
    """'Deep house – Loop 124 BPM 4 bars': a loop says what it is, its tempo and its length."""
    tempo = f"{bpm:.1f}".rstrip("0").rstrip(".") + " BPM" if bpm else ""
    tag = " ".join(x for x in ("Loop", tempo, f"{bars} bar" + ("" if bars == 1 else "s")) if x)
    return f"{base} – {tag}" if base else tag


def _keep(path: str, req: "GenerateMusicRequest", seed: int, seconds: float, engine: str) -> dict:
    """Put a finished track into the library for good. Returns what the UI needs: permanent path, id and title."""
    try:
        from services import library
        info = _start_info.pop(path, {})
        title = req.title
        if info.get("bars"):
            title = loop_title(req.title or (req.prompt or "").split(",")[0].strip()[:50], info.get("bpm"), info["bars"])
        entry = library.add_track(path, {
            "title": title, "prompt": req.prompt or "", "lyrics": req.lyrics, "seed": seed,
            "duration": round(seconds, 1), "engine": engine, "source": "generated",
            "bpm": info.get("bpm"), "first_beat": info.get("first_beat"), "loop_bars": info.get("bars"),
            "tags": req.tags})
        out = {"audio_file": entry["path"], "library_id": entry["id"], "title": entry["title"],
               "bpm": info.get("bpm"), "first_beat": info.get("first_beat"), "loop_bars": info.get("bars")}
        if entry.get("duration"):
            out["duration"] = entry["duration"]          # the real length, after the start was cut
        return out
    except Exception as e:  # noqa: BLE001 - the track is still usable from the temporary folder
        print(f"[library] could not save the track: {e}", flush=True)
        return {"audio_file": path, "library_id": None, "title": req.title or ""}


def _device_text() -> str:
    """Plain words: what the computer is using for this job, and why not the graphics card."""
    try:
        import torch
        from services.capabilities import get_report
        m = get_report()["machine"]
        if torch.cuda.is_available():
            g = next((g for g in m["gpus"] if g.get("cuda")), None)
            return f"Using the graphics card: {g['name'] if g else 'NVIDIA GPU'} (CUDA)."
        gpu = next((g for g in m["gpus"] if g["vendor"] in ("amd", "nvidia")), None)
        ai = os.environ.get("AMS_AI_THREADS")
        cpu = f"{m['cpu'] or 'the processor'} ({m['threads']} threads{f', the AI computes on {ai}' if ai else ''})"
        if gpu and gpu["vendor"] == "amd":
            why = (f"Your {gpu['name']} is not used: PyTorch cannot use AMD cards on Windows without a special "
                   "build, and cards of this age are not supported by it.")
        elif gpu:
            why = f"{gpu['name']} was found but CUDA is not available in the AI environment."
        else:
            why = "No usable graphics card was found."
        return f"Using the CPU only: {cpu}. {why}"
    except Exception:
        return "Using the CPU."


class Cancelled(Exception):
    """The user pressed Cancel: raised at the next progress report and stops the job."""


_procs: dict[str, object] = {}         # job id -> running worker process (DiffRhythm, DirectML), killed on Cancel


def _stage(job: dict, stage: str, text: str, step: int | None = None, total: int | None = None) -> None:
    """Tell the UI what is happening. `step`/`total` give a real progress bar when known.
    Every engine reports here often, so this is also where a Cancel takes effect."""
    if job.get("cancel"):
        raise Cancelled()
    now = time.time()
    if job.get("stage") != stage:
        job["stage_started"] = now
    job.update(stage=stage, stage_text=text, step=step, step_total=total, updated=now)


def _tracked(iterable=None, total=None, **_kw):
    """Stand-in for tqdm inside ACE-Step: reports each diffusion step to the running job."""
    job = _cur["job"]
    items = list(iterable) if iterable is not None else []
    n = total or len(items)
    for i, x in enumerate(items):
        if job is not None and n >= 8:                 # the render loop, not the tiny helper loops
            _stage(job, "render", job.get("render_text", "Rendering audio"), i, n)
        yield x
    if job is not None and n >= 8:
        _stage(job, "render", job.get("render_text", "Rendering audio"), n, n)


def _dir_mb(path: str) -> float:
    total = 0
    for root, _d, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total / 1024**2


def _watch_downloads(job: dict, stop: threading.Event) -> None:
    """While a model loads for the first time, report how many MB arrived on disk."""
    dirs = [d for d in (str(MODEL_DIR), os.environ.get("HF_HOME") or os.path.expanduser("~/.cache/huggingface")) if d]
    start = sum(_dir_mb(d) for d in dirs if os.path.isdir(d))
    while not stop.wait(2.0):
        if job.get("cancel"):
            return
        now_mb = sum(_dir_mb(d) for d in dirs if os.path.isdir(d))
        job["downloaded_mb"] = round(max(0.0, now_mb - start), 1)
        job["updated"] = time.time()



def _run_musicgen_batches(job: dict, job_id: str, req: GenerateMusicRequest, info, total: int, base_seed: int,
                          duration: int, out_dir: Path, results: list[dict], warnings: list[str]) -> bool:
    """Several MusicGen clips on the CPU: make them side by side, a few at a time.

    One clip keeps the processor busy only in short bursts (MusicGen writes one token after the other); clips
    in one batch share every step, so the cores are used and N clips take far less than N times as long.
    Returns False when this does not apply (one clip, another model, or the graphics card path is used)."""
    from services.music_engines import can_use_dml, generate_musicgen_batch, musicgen_batch_size
    if total <= 1 or not req.engine.startswith("musicgen") or (req.compute != "cpu" and can_use_dml(req.engine)):
        return False
    size = musicgen_batch_size(req.engine, total)
    if size <= 1:
        return False
    warnings.append(f"The {total} clips are made {size} at a time, side by side: that keeps all processor cores "
                    "busy and is much faster than one after the other.")
    guidance = max(1.0, min(req.cfg_scale + 1.0, 10.0))
    i = 0
    while i < total:
        n = min(size, total - i)
        seed = random.randint(0, 2**31 - 1) if req.randomize_seed else base_seed + i
        wavs = [str(out_dir / f"song_{job_id}_{i + k + 1}.wav") for k in range(n)]
        label = f"Clips {i + 1}–{i + n} of {total} (together): " if n > 1 else f"Clip {i + 1} of {total}: "
        _stage(job, "load", f"{label}loading {info.name}. The first time the model is downloaded.")
        try:
            secs = generate_musicgen_batch(req.engine, _compose_prompt(req), duration, seed, wavs, guidance=guidance,
                                           on_step=lambda d, t, _l=label: _stage(job, "render", f"{_l}composing", d, t))
            finals = []
            for k, w in enumerate(wavs):
                _stage(job, "finish", f"{label}saving and converting")
                finals.append(_finalize(w, req, warnings if i + k == 0 else []))
        except Exception as e:  # noqa: BLE001 - Cancel lands here too; _run_job turns it into "cancelled"
            job.update(status="error", error=_short(e), warnings=warnings, results=results)
            return True
        for k, (final, sec) in enumerate(zip(finals, secs)):
            results.append({"seed": seed, "batch_index": k, "duration": round(sec, 1),
                            **_keep(final, req, seed, sec, req.engine)})
        i += n
        job["progress"] = {"done": i, "total": total}
        job["results"] = list(results)
    job.update(status="done", engine=req.engine, audio_file=results[0]["audio_file"], results=results,
               duration=results[0]["duration"], warnings=warnings, finished=time.time(),
               stage="done", stage_text="Done", step=None, step_total=None)
    return True


def _run_clip_job(job_id: str, req: GenerateMusicRequest) -> None:
    """MusicGen: instrumental clips of up to 30 s, works on small machines."""
    from services.music_engines import ENGINES, generate_musicgen, musicgen_ready
    job = _jobs[job_id]
    warnings: list[str] = []
    info = next((e for e in ENGINES if e.id == req.engine and e.kind == "built-in"), None)
    if info is None:
        job.update(status="error", error=f"Unknown or not yet available music engine: {req.engine}")
        return
    ok, why = musicgen_ready()
    if not ok:
        job.update(status="error", error="MusicGen needs the AI engines installed: open Settings → AI Engines, "
                                         f"tick 'MusicGen' and press Install selected. ({why})")
        return
    duration = min(req.duration or 15, info.max_seconds)
    if (req.duration or 15) > info.max_seconds:
        warnings.append(f"{info.name} makes up to {info.max_seconds} s; the length was shortened.")
    if info.id.startswith("musicgen") and duration > 30:
        from services.musicgen_long import plan
        n = len(plan(duration))
        warnings.append(f"A {duration} s track is made in {n} steps (30 s first, then 20 s each, joined with a short crossfade). "
                        "It takes about as many times longer as there are steps; the progress bar shows the real pace. "
                        "The style can drift a little between steps.")
    if req.lyrics.strip() and not req.instrumental:
        warnings.append(f"{info.name} cannot sing: the lyrics are ignored. Use ACE-Step for vocals.")
    if req.loras:
        warnings.append(f"{info.name} does not use LoRA styles; they were ignored.")
    if req.source_track:
        warnings.append(f"{info.name} cannot work from a source track; it was ignored.")

    total = req.songs * req.variations * req.queue
    base_seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    out_dir = Path(tempfile.gettempdir()) / "ams_music"
    out_dir.mkdir(exist_ok=True)
    results: list[dict] = []
    job["progress"] = {"done": 0, "total": total}
    with _gen_lock:
        job["status"] = "running"
        job["started"] = time.time()
        job["device"] = _device_text()
        stop_watch = threading.Event()
        threading.Thread(target=_watch_downloads, args=(job, stop_watch), daemon=True).start()
        if _run_musicgen_batches(job, job_id, req, info, total, base_seed, duration, out_dir, results, warnings):
            stop_watch.set()
            return
        for i in range(total):
            seed = random.randint(0, 2**31 - 1) if req.randomize_seed else base_seed + i
            wav = str(out_dir / f"song_{job_id}_{i + 1}.wav")
            label = f"Clip {i + 1} of {total}: " if total > 1 else ""
            _stage(job, "load", f"{label}loading {info.name}. The first time the model is downloaded.")

            def on_step(done: int, of: int, _label: str = label) -> None:
                _stage(job, "render", f"{_label}composing", done, of)

            try:
                from services.music_engines import can_use_dml, generate_dml
                use_gpu = req.compute != "cpu" and can_use_dml(req.engine)
                if req.compute == "gpu" and not can_use_dml(req.engine):
                    warnings.append("The graphics card path is not installed for this model; using the processor. "
                                    "Install it in Settings → AI Engines.")
                if use_gpu:
                    job["device"] = "Using the graphics card through DirectML. Slower parts run on the processor."
                    try:
                        seconds = generate_dml(req.engine, _compose_prompt(req), duration, seed, wav,
                                               guidance=max(1.0, min(req.cfg_scale + 1.0, 10.0)), on_step=on_step,
                                               on_stage=lambda st, tx: _stage(job, st, f"{label}{tx}"),
                                               on_proc=lambda pr: _procs.__setitem__(job_id, pr))
                    except Exception as e:  # fall back: a track on the CPU beats an error
                        if job.get("cancel"):
                            raise Cancelled() from e
                        warnings.append(f"The graphics card failed ({_short(e)}); continuing on the processor.")
                        job["device"] = _device_text()
                        use_gpu = False
                if use_gpu:
                    pass
                elif req.engine.startswith("musicgen"):
                    seconds = generate_musicgen(req.engine, _compose_prompt(req), duration, seed, wav,
                                                guidance=max(1.0, min(req.cfg_scale + 1.0, 10.0)), on_step=on_step)
                else:
                    from services.music_engines import generate_diffusers
                    seconds = generate_diffusers(req.engine, _compose_prompt(req), duration, seed, wav,
                                                 on_step=on_step, steps=min(max(req.steps, 10), 100))
                _stage(job, "finish", f"{label}saving and converting")
                final = _finalize(wav, req, warnings if i == 0 else [])
            except Exception as e:
                stop_watch.set()
                job.update(status="error", error=_short(e), warnings=warnings, results=results)
                return
            results.append({"seed": seed, "duration": round(seconds, 1), **_keep(final, req, seed, seconds, req.engine)})
            job["progress"] = {"done": i + 1, "total": total}
            job["results"] = list(results)
        stop_watch.set()
    job.update(status="done", engine=req.engine, audio_file=results[0]["audio_file"], results=results,
               duration=results[0]["duration"], warnings=warnings, finished=time.time(),
               stage="done", stage_text="Done", step=None, step_total=None)


def _run_dr_job(job_id: str, req: GenerateMusicRequest) -> None:
    """DiffRhythm: a whole song with vocals from lyrics, in one go (needs an NVIDIA card)."""
    from services.music_engines import generate_diffrhythm
    job = _jobs[job_id]
    warnings: list[str] = []
    wanted = req.duration or 95
    if wanted < 95:
        warnings.append("DiffRhythm makes songs of at least 95 s; the length was raised to 95 s.")
    if wanted > 285:
        warnings.append("DiffRhythm makes songs of up to 4 min 45 s; the length was shortened.")
    if req.loras:
        warnings.append("DiffRhythm does not use LoRA styles; they were ignored.")
    if req.source_track:
        warnings.append("DiffRhythm cannot work from a source track here; it was ignored.")
    total = req.songs * req.variations * req.queue
    out_dir = Path(tempfile.gettempdir()) / "ams_music"
    out_dir.mkdir(exist_ok=True)
    results: list[dict] = []
    job["progress"] = {"done": 0, "total": total}
    with _gen_lock:
        job["status"] = "running"
        job["started"] = time.time()
        job["device"] = _device_text()
        stop_watch = threading.Event()
        threading.Thread(target=_watch_downloads, args=(job, stop_watch), daemon=True).start()
        try:
            for i in range(total):
                wav = str(out_dir / f"song_{job_id}_{i + 1}.wav")
                label = f"Song {i + 1} of {total}: " if total > 1 else ""
                _stage(job, "load", f"{label}starting DiffRhythm")
                try:
                    secs = generate_diffrhythm(
                        _compose_prompt(req), req.lyrics, wanted, wav,
                        on_stage=lambda st, tx: _stage(job, st, f"{label}{tx}"),
                        on_step=lambda d, t: _stage(job, "render", f"{label}composing the song", d, t),
                        on_proc=lambda pr: _procs.__setitem__(job_id, pr))
                    _stage(job, "finish", f"{label}saving and converting")
                    final = _finalize(wav, req, warnings if i == 0 else [])
                except Exception as e:
                    job.update(status="error", error=_short(e), warnings=warnings, results=results)
                    return
                results.append({"seed": 0, "duration": round(secs, 1), **_keep(final, req, 0, secs, "diffrhythm")})
                job["progress"] = {"done": i + 1, "total": total}
                job["results"] = list(results)
        finally:
            stop_watch.set()
    job.update(status="done", engine="diffrhythm", audio_file=results[0]["audio_file"], results=results,
               duration=results[0]["duration"], warnings=warnings, finished=time.time(),
               stage="done", stage_text="Done", step=None, step_total=None)


def _run_job(job_id: str, req: GenerateMusicRequest) -> None:
    job = _jobs[job_id]
    if job.get("cancel"):
        return
    try:
        _run_engine_job(job_id, req)
    except Cancelled:
        pass
    except Exception as e:  # noqa: BLE001 - a job must never stay "running" forever
        job.update(status="error", error=_short(e))
    finally:
        _procs.pop(job_id, None)
        pre = job.get("pre_warnings") or []
        job["warnings"] = pre + [w for w in (job.get("warnings") or []) if w not in pre]
        _cur["job"] = None if _cur["job"] is job else _cur["job"]
    if job.get("cancel") and job.get("status") != "done":
        done = len(job.get("results") or [])
        job.update(status="cancelled", error=None, stage="done", step=None, step_total=None, finished=time.time(),
                   stage_text="Cancelled" + (f": {done} finished song(s) kept in the library" if done else ""))


ACE15_TAIL = 5.0     # seconds rendered beyond the wanted length, so the song does not stop in the middle of the music
ACE15_FADE = 3.0     # the last seconds are faded out (unless a fade-out is set in Advanced)


def _fade_end(path: str, seconds: float) -> None:
    """Cut the silence at the end, then fade out the last `seconds` of a WAV in place (any subtype, also float).
    The silence first: when ACE-Step ends the song by itself before the length asked for, the extra seconds were
    an empty bar at the end of the clip."""
    try:
        import numpy as np
        import soundfile as sf
        info = sf.info(path)
        data, sr = sf.read(path, dtype="float32", always_2d=True)
        level = np.abs(data).max(axis=1)
        loud = np.nonzero(level > 10 ** (-48 / 20))[0]                  # louder than -48 dBFS
        if len(loud):
            end = min(len(data), int(loud[-1]) + int(0.25 * sr))        # keep a quarter second of the decay
            if end < len(data) - int(0.5 * sr):
                data = data[:end]
        n = min(len(data), int(seconds * sr))
        if n > 1:
            data[-n:] *= (np.linspace(1.0, 0.0, n, dtype=np.float32) ** 2)[:, None]
            sf.write(path, data, sr, subtype=info.subtype)
    except Exception as e:  # noqa: BLE001 - never lose a song because of the fade
        print(f"[ace15] fade-out skipped: {e}", flush=True)


def _run_ace15_job(job_id: str, req: GenerateMusicRequest) -> None:
    """ACE-Step 1.5 turbo: songs with vocals, also on the CPU, in its own environment."""
    from services.music_engines import generate_ace15
    job = _jobs[job_id]
    warnings: list[str] = []
    duration = max(10, min(req.duration or 60, 600))
    if req.duration is None:
        warnings.append("Length 'Auto' uses 60 s with this engine (plus a few seconds for a clean ending).")
    if req.loras:
        warnings.append("ACE-Step 1.5 does not use the LoRA styles of ACE-Step v1 yet; they were ignored.")
    if req.source_track:
        warnings.append("ACE-Step 1.5 cannot work from a source track here yet; it was ignored.")
    total = req.songs * req.variations * req.queue
    base_seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    out_dir = Path(tempfile.gettempdir()) / "ams_music"
    out_dir.mkdir(exist_ok=True)
    results: list[dict] = []
    job["progress"] = {"done": 0, "total": total}
    with _gen_lock:
        job["status"] = "running"
        job["started"] = time.time()
        job["device"] = _device_text()
        stop_watch = threading.Event()
        threading.Thread(target=_watch_downloads, args=(job, stop_watch), daemon=True).start()
        try:
            for i in range(total):
                seed = random.randint(0, 2**31 - 1) if req.randomize_seed else base_seed + i
                wav = str(out_dir / f"song_{job_id}_{i + 1}.wav")
                label = f"Song {i + 1} of {total}: " if total > 1 else ""
                _stage(job, "load", f"{label}starting ACE-Step 1.5")
                # ACE-Step 1.5 renders exactly the length asked for and then simply stops, often in the middle of the
                # music ("the last few seconds are missing"): it gets a few seconds more, and the end is faded below
                song = {"caption": _compose_prompt(req), "lyrics": _ace_lyrics(req) if not req.instrumental else "",
                        "instrumental": req.instrumental, "seconds": min(600, duration + ACE15_TAIL), "bpm": req.bpm, "key": req.key,
                        "time_signature": (req.time_signature or "").split("/")[0], "language": req.language,
                        "seed": seed, "steps": 8}
                try:
                    secs = generate_ace15(
                        song, wav,
                        on_stage=lambda st, tx: _stage(job, st, f"{label}{tx}"),
                        on_step=lambda d, t: _stage(job, "render", job.get("stage_text") or f"{label}composing the song", d, t),
                        on_proc=lambda pr: _procs.__setitem__(job_id, pr))
                    _stage(job, "finish", f"{label}saving and converting")
                    if not req.fade_out:
                        _fade_end(wav, ACE15_FADE)
                    final = _finalize(wav, req, warnings if i == 0 else [])
                except Exception as e:
                    job.update(status="error", error=_short(e), warnings=warnings, results=results)
                    return
                results.append({"seed": seed, "duration": round(secs, 1), **_keep(final, req, seed, secs, "ace-step-1.5")})
                job["progress"] = {"done": i + 1, "total": total}
                job["results"] = list(results)
        finally:
            stop_watch.set()
    job.update(status="done", engine="ace-step-1.5", audio_file=results[0]["audio_file"], results=results,
               duration=results[0]["duration"], warnings=warnings, finished=time.time(),
               stage="done", stage_text="Done", step=None, step_total=None)


def _run_engine_job(job_id: str, req: GenerateMusicRequest) -> None:
    if req.engine == "ace-step-1.5":
        return _run_ace15_job(job_id, req)
    if req.engine == "diffrhythm":
        return _run_dr_job(job_id, req)
    if req.engine != "ace-step":
        return _run_clip_job(job_id, req)
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
    usable = []
    for entry, strength in chosen:
        ok, why = lora_compat(entry)
        if ok:
            usable.append((entry, strength))
        else:
            warnings.append(why)
    chosen = usable
    if chosen:
        # The engine loads one adapter at a time: use the strongest one.
        best, lora_weight = max(chosen, key=lambda c: c[1])
        try:
            lora_path = _engine_lora_dir(best)
        except (RuntimeError, OSError) as e:
            job.update(status="error", warnings=warnings, error=f"Cannot prepare the LoRA '{best['name']}': {e}")
            return
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
        job["started"] = time.time()
        job["device"] = _device_text()
        engine_kind = "ace-step"
        _cur["job"] = job
        stop_watch = threading.Event()
        threading.Thread(target=_watch_downloads, args=(job, stop_watch), daemon=True).start()
        try:
            _stage(job, "load", "Loading the music model. The first time it is downloaded (several GB), "
                                "this can take many minutes.")
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
                label = f"Song {i + 1} of {total}: " if total > 1 else ""
                job["render_text"] = f"{label}rendering audio"
                _stage(job, "prepare", f"{label}preparing (loading weights into memory, the first step can take a while)")
                try:
                    if pipe is None:
                        _silent_wav(wav, duration)
                    else:
                        kwargs = _engine_kwargs(pipe, req, duration, seed, lora_path, lora_weight, wav,
                                                warnings if i == 0 else [])
                        pipe(**kwargs)
                    _stage(job, "finish", f"{label}saving and converting")
                    final = _finalize(wav, req, warnings if i == 0 else [])
                except Exception as e:  # model / out-of-memory errors
                    job.update(status="error", error=str(e), warnings=warnings, results=results)
                    return
                results.append({"seed": seed, "duration": duration, **(({"audio_file": final, "library_id": None, "title": req.title or ""}) if engine_kind == "stub" else _keep(final, req, seed, duration, "ace-step"))})
                job["progress"] = {"done": i + 1, "total": total}
                job["results"] = list(results)
        finally:
            stop_watch.set()
            _cur["job"] = None

    job.update(
        status="done", engine=engine_kind, audio_file=results[0]["audio_file"], results=results,
        duration=duration, warnings=warnings, finished=time.time(),
        stage="done", stage_text="Done", step=None, step_total=None,
    )


@router.post("/generate")
async def generate_music(req: GenerateMusicRequest):
    if not req.prompt.strip() and not req.lyrics.strip() and not req.source_track:
        raise HTTPException(400, "Describe the music (style) or provide lyrics.")
    if req.acapella:
        if not req.lyrics.strip():
            raise HTTPException(400, "A cappella needs lyrics: write the text that should be sung.")
        if req.engine not in ("ace-step", "ace-step-1.5", "diffrhythm"):
            raise HTTPException(400, "A cappella needs a model that can sing: choose ACE-Step, ACE-Step 1.5 or DiffRhythm.")
        req.instrumental = False
        req.negative_prompt = ", ".join(p for p in (req.negative_prompt.strip(), ACAPELLA_NEGATIVE) if p)
    pre: list[str] = []
    _prepare_loop(req, pre)
    job_id = uuid.uuid4().hex[:10]
    _jobs[job_id] = {"id": job_id, "status": "queued", "created": time.time(), "warnings": list(pre), "results": [],
                     "pre_warnings": pre}
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    return {"jobId": job_id}


HARD_CANCEL_AFTER = 8.0


def _hard_cancel(job: dict) -> None:
    """A model that runs inside this process (ACE-Step v1 on the CPU) only notices Cancel between two steps,
    and one step can take minutes. If the job is still running after a few seconds, end the whole backend:
    the desktop app starts it again at once (the model is loaded again on the next song)."""
    time.sleep(HARD_CANCEL_AFTER)
    if job.get("status") == "running" and job.get("cancel"):
        print("[cancel] the model did not stop in time: restarting the backend", flush=True)
        os._exit(3)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Stop a queued or running job. Songs that are already finished stay in the library."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    if job["status"] not in ("queued", "running"):
        return {"cancelled": False, "status": job["status"]}
    job["cancel"] = True
    if job["status"] == "queued":       # still waiting for another job: it will not start at all
        job.update(status="cancelled", stage="done", stage_text="Cancelled", finished=time.time())
        return {"cancelled": True, "status": "cancelled"}
    job["stage_text"] = "Cancelling: stops at the next step"
    threading.Thread(target=_hard_cancel, args=(job,), daemon=True).start()
    proc = _procs.get(job_id)
    if proc is not None:
        try:
            proc.kill()  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 - already gone
            pass
    return {"cancelled": True, "status": job["status"]}


@router.get("/engines")
async def engines():
    """Every music generator with a verdict for this computer."""
    from services.capabilities import get_report, detect_machine
    from services.music_engines import catalog
    import asyncio
    m = await asyncio.to_thread(detect_machine, os.environ.get("AMS_ACESTEP_DIR"))
    from services.music_engines import recommend
    from services.music_engines import dml_engines, dml_python
    return {"engines": catalog(m), "recommended": recommend(m), "gpu_path": dml_python() is not None,
            "gpu_models": sorted(dml_engines())}


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
