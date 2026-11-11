"""Stem separation using Meta's Demucs."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio, os, threading, time, uuid, tempfile

import numpy as np

router = APIRouter()


class StemSplitRequest(BaseModel):
    filePath: str
    model: str = "htdemucs_ft"
    # htdemucs_6s additionally yields "piano" and "guitar"
    stems: list[str] = ["vocals", "drums", "bass", "other", "piano", "guitar"]


def read_audio(path: str) -> tuple[np.ndarray, int]:
    """(channels, samples) float32 and the sample rate. soundfile reads WAV, FLAC, AIFF, OGG and MP3; anything else
    goes through librosa (ffmpeg). torchaudio.load is not used: since torchaudio 2.9 it needs the separate
    TorchCodec package and fails without it, which left every stem empty."""
    try:
        import soundfile as sf
        data, sr = sf.read(path, dtype="float32", always_2d=True)       # (samples, channels)
        return np.ascontiguousarray(data.T), int(sr)
    except Exception:  # noqa: BLE001 - format soundfile cannot read: try librosa
        import librosa
        data, sr = librosa.load(path, sr=None, mono=False)
        data = np.atleast_2d(data).astype(np.float32)
        return data, int(sr)


def write_stem(path: str, audio: np.ndarray, sr: int) -> None:
    """(channels, samples) -> 32-bit float WAV (no clipping; every DAW reads it)."""
    import soundfile as sf
    sf.write(path, np.ascontiguousarray(audio.T), sr, subtype="FLOAT")


# ── the split itself, with progress ──────────────────────────────────────────

_split_lock = threading.Lock()          # one split at a time (Demucs uses all cores; progress hook is global)
_jobs: dict[str, dict] = {}


class _Progress:
    """Stands in for the `tqdm` module inside demucs.apply: Demucs wraps its chunk loop in tqdm.tqdm(...) when
    progress=True, once per model of a bag. Counting the chunks gives the share done of the whole split."""

    def __init__(self, n_models: int, report):
        self.n_models, self.report, self.model_i = max(1, n_models), report, -1

    def tqdm(self, iterable, *args, **kwargs):
        self.model_i += 1
        items = list(iterable)
        total = max(1, len(items))
        for k, it in enumerate(items):
            yield it
            done = (min(self.model_i, self.n_models - 1) + (k + 1) / total) / self.n_models
            self.report(5 + done * 90)


def run_mdx(req: StemSplitRequest, report) -> dict:
    """Vocals + instrumental with an MDX-Net ONNX model in the separator environment (services/separator_worker.py):
    much faster than Demucs and on AMD / Intel it can use the graphics card through DirectML."""
    import json, subprocess, sys
    py = os.environ.get("AMS_SEP_PYTHON")
    if not py or not os.path.exists(py):
        raise HTTPException(503, "Fast vocal separation is not installed: Settings → AI Engines → "
                                 "Fast vocal separation (vocals + instrumental), then Install selected.")
    out_dir = os.path.join(tempfile.gettempdir(), f"stems_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)
    model_dir = os.environ.get("AMS_SEP_MODELS") or os.path.join(os.path.expanduser("~"), ".ai-music-studio", "separator")
    reqfile = os.path.join(out_dir, "request.json")
    with open(reqfile, "w", encoding="utf-8") as f:
        json.dump({"input": req.filePath, "out_dir": out_dir, "model_dir": model_dir, "fast": True,
                   "mode": "4stems" if req.model == "mdx_4stems" else "vocals"}, f)
    worker = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                          "services", "separator_worker.py")
    report(3, "Starting fast vocal separation")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.Popen([py, worker, reqfile], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", creationflags=flags)
    started, result, error, tail = time.time(), None, None, []
    base, span = 10.0, 84.0                                         # where the current model's share of the bar is
    for line in proc.stdout:                                       # type: ignore[union-attr]
        line = line.strip()
        if not line:
            continue
        tail = (tail + [line])[-8:]
        try:
            msg = json.loads(line)
        except ValueError:
            # no per-chunk progress from the library: creep forward so the bar shows it is working
            report(base + min(span * 0.95, (time.time() - started) / 3))
            continue
        if not isinstance(msg, dict):
            continue
        if "stage" in msg:
            if "part" in msg:                                       # 4 stems: one model after the other
                parts = max(1, msg.get("parts", 4))
                started, span = time.time(), 90.0 / parts
                base = 5 + span * msg["part"]
                report(base, msg["stage"])
            else:
                report(10 if "Separating" in msg["stage"] else 5, msg["stage"])
        elif msg.get("done"):
            result = msg.get("files") or {}
            report(98, f"Done ({msg.get('device', 'processor')})")
        elif "error" in msg:
            error = msg["error"]
    proc.wait()
    if error or not result:
        raise HTTPException(500, error or ("Fast vocal separation failed: " + " | ".join(tail)[-400:]))
    report(100, "Done")
    return result


def run_split(req: StemSplitRequest, report=lambda pct, text=None: None) -> dict:
    """Separate the song; report(percent, text) is called along the way. Returns {stem: wav path}."""
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")
    if req.model in ("mdx_vocals", "mdx_4stems"):
        with _split_lock:
            return run_mdx(req, report)
    try:
        import torch
        import demucs.apply as demucs_apply
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError as e:
        raise HTTPException(
            503, f"Demucs is not installed ({e}). Install it in Settings → AI Engines → Demucs (stem separation).")

    out_dir = os.path.join(tempfile.gettempdir(), f"stems_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)
    with _split_lock:
        try:
            report(1, "Loading the Demucs model")
            model = get_model(req.model)
            report(3, "Reading the song")
            data, sr = read_audio(req.filePath)
            if data.shape[0] == 1:
                data = np.repeat(data, 2, axis=0)
            data = data[:2]
            wav = torch.from_numpy(data)
            if sr != model.samplerate:
                import torchaudio.functional as AF                      # plain tensor maths, no TorchCodec needed
                wav = AF.resample(wav, sr, model.samplerate)
            ref = wav.mean(0)
            mean, std = ref.mean(), ref.std() + 1e-8
            wav = (wav - mean) / std

            from services.hardware_detect import get_profile
            device = get_profile().torch_device
            # DirectML (AMD / Intel on Windows) lacks operations Demucs needs (complex STFT): it runs on the CPU there
            if device == "privateuseone":
                device = "cpu"
            from services.resource_profile import resources
            res = resources()
            n_models = len(getattr(model, "models", [])) or 1
            where = "graphics card" if device == "cuda" else "processor"
            report(5, f"Separating on the {where}" + (f" ({n_models} models)" if n_models > 1 else ""))
            hook = _Progress(n_models, lambda pct: report(pct))
            saved_tqdm = getattr(demucs_apply, "tqdm", None)
            demucs_apply.tqdm = hook
            try:
                with torch.no_grad():
                    sources = apply_model(
                        model, wav[None], device=device, progress=True,
                        segment=res.demucs_segment_s, num_workers=res.demucs_jobs,
                        overlap=0.1 if req.model == "htdemucs" else 0.25,      # Fast: fewer overlapping chunks
                    )[0]
            finally:
                if saved_tqdm is not None:
                    demucs_apply.tqdm = saved_tqdm
            sources = sources * std + mean                              # back to the song's own level

            report(96, "Saving the stems")
            result = {}
            for i, name in enumerate(model.sources):
                if name in req.stems:
                    stem_path = os.path.join(out_dir, f"{name}.wav")
                    write_stem(stem_path, sources[i].cpu().numpy(), model.samplerate)
                    result[name] = stem_path
            if not result:
                raise HTTPException(500, "Demucs returned no stems.")
            report(100, "Done")
            return result
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001 - show the reason instead of empty "ready" stems
            raise HTTPException(500, f"Stem separation failed: {type(e).__name__}: {e}")


@router.post("/split")
async def split_stems(req: StemSplitRequest):
    """Blocking variant (the Studio's "split clip"): runs in a thread so the server stays responsive."""
    return await asyncio.to_thread(run_split, req)


@router.post("/jobs")
async def start_split(req: StemSplitRequest):
    """Start a split in the background; poll GET /stems/jobs/{id} for progress and the result."""
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "text": "Starting", "result": None, "error": None,
           "started": time.time()}
    _jobs[jid] = job

    def report(pct, text=None):
        job["progress"] = round(max(job["progress"], min(100.0, float(pct))), 1)
        if text:
            job["text"] = text

    def work():
        try:
            job["result"] = run_split(req, report)
            job["status"] = "done"
        except HTTPException as e:
            job["status"], job["error"] = "error", str(e.detail)
        except Exception as e:  # noqa: BLE001
            job["status"], job["error"] = "error", f"{type(e).__name__}: {e}"

    threading.Thread(target=work, daemon=True).start()
    return {"job_id": jid}


@router.get("/jobs/{jid}")
async def split_status(jid: str):
    job = _jobs.get(jid)
    if not job:
        raise HTTPException(404, "Unknown job")
    return {**job, "elapsed": round(time.time() - job["started"], 1)}


# ── remix: the stems mixed again with their own levels (karaoke, no drums, ...) ──────────────

class RemixRequest(BaseModel):
    stems: dict[str, str]                 # stem name -> wav file
    gains: dict[str, float] = {}          # stem name -> 0..2 (missing: 1, 0 = left out)


def mix_stems(stems: dict[str, str], gains: dict[str, float]) -> str:
    import soundfile as sf
    parts, sr = [], None
    for name, path in stems.items():
        g = float(gains.get(name, 1.0))
        if g <= 0 or not path or not os.path.exists(path) or os.path.getsize(path) == 0:
            continue
        data, s = sf.read(path, dtype="float32", always_2d=True)
        if sr is None:
            sr = s
        elif s != sr:
            raise HTTPException(400, f"{name} has another sample rate ({s} Hz instead of {sr} Hz).")
        parts.append(data * min(g, 2.0))
    if not parts:
        raise HTTPException(400, "Every stem is muted: nothing to mix.")
    n = max(len(p) for p in parts)
    ch = max(p.shape[1] for p in parts)
    mix = np.zeros((n, ch), dtype=np.float32)
    for p in parts:
        mix[:len(p), :p.shape[1]] += p if p.shape[1] == ch else np.repeat(p, ch, axis=1)
    peak = float(np.max(np.abs(mix))) or 1.0
    if peak > 0.99:                                   # no clipping when exported as 16 / 24 bit
        mix *= 0.99 / peak
    out = os.path.join(tempfile.gettempdir(), f"remix_{uuid.uuid4().hex[:8]}.wav")
    sf.write(out, mix, sr, subtype="FLOAT")
    return out


@router.post("/remix")
async def remix(req: RemixRequest):
    path = await asyncio.to_thread(mix_stems, req.stems, req.gains)
    return {"path": path}
