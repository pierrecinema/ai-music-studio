"""Music generators the user can choose from, and how well each fits this computer.

Two are built in: ACE-Step (full songs with vocals) and Meta MusicGen (instrumental clips, small
and medium models also work on weak machines). The others are listed so people can see what
exists and what hardware they would need; they are marked as not yet built in.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass, asdict

from services.capabilities import Machine


@dataclass
class EngineInfo:
    id: str
    name: str
    kind: str                # "built-in" | "planned"
    description: str
    license: str
    vocals: bool
    max_seconds: int
    min_ram: float           # GB, below: unavailable
    vram: float              # GB, comfortable on a GPU
    cpu_speed: str           # what to expect without a fast GPU
    needs_cuda_for_comfort: bool = True
    hf_repo: str = ""
    note: str = ""


ENGINES: list[EngineInfo] = [
    EngineInfo("ace-step", "ACE-Step v1 (3.5B)", "built-in",
               "Full songs with vocals and lyrics, up to 10 minutes. LoRA styles supported.",
               "Apache-2.0", True, 600, 10, 8, "many hours per song on a CPU or AMD card (the 3.5B model is too big for a small PC)",
               note="Installed from Settings → AI Engines."),
    EngineInfo("musicgen-small", "MusicGen small (300M)", "built-in",
               "Instrumental tracks from a text description, light enough for old PCs. Up to 30 s in one go; longer tracks are built in 20 s steps and take proportionally longer.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 600, 6, 2,
               "measured on an i7-3930K: about 6 minutes for a 15 s clip, so around 12 minutes for 30 s", False, "facebook/musicgen-small"),
    EngineInfo("musicgen-medium", "MusicGen medium (1.5B)", "built-in",
               "Better quality instrumentals. Up to 30 s in one go, longer tracks in 20 s steps.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 600, 12, 8,
               "10 to 25 minutes for 30 s on a CPU", True, "facebook/musicgen-medium"),
    EngineInfo("musicgen-large", "MusicGen large (3.3B)", "built-in",
               "Best MusicGen quality. Needs a strong GPU.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 600, 16, 16,
               "not practical on a CPU", True, "facebook/musicgen-large"),
    EngineInfo("stable-audio-open", "Stable Audio Open (1.1B)", "planned",
               "Sound effects, loops and short music up to 47 s. Needs a free Hugging Face account to accept the licence.",
               "Stability AI Community licence", False, 47, 12, 8, "very slow on a CPU", True,
               "stabilityai/stable-audio-open-1.0", "Not built in yet."),
    EngineInfo("yue", "YuE (lyrics to full song)", "planned",
               "Full songs with vocals from lyrics, multi-minute. Very heavy.",
               "Apache-2.0", True, 300, 32, 24, "not practical on a CPU", True,
               "m-a-p/YuE-s1-7B-anneal-en-cot", "Not built in yet."),
    EngineInfo("diffrhythm", "DiffRhythm 1.2 (full songs, experimental)", "built-in",
               "Full songs with vocals from your lyrics: 95 s, or any length from 96 s up to 4 min 45 s in ONE go, "
               "style from a text description. Needs lyrics. Written from the project's code and not yet tested "
               "on real hardware by the developer: feedback welcome.",
               "Apache-2.0 (code and DiT weights)", True, 285, 16, 8, "not supported on a CPU by the authors", True,
               "ASLP-lab/DiffRhythm-1_2-full", "Needs an NVIDIA graphics card with 8 GB or more."),
    EngineInfo("audioldm2-music", "AudioLDM 2 (music)", "built-in",
               "Music clips of about 10 s from a text description (latent diffusion). Takes LoRA training well, "
               "see the AudioLDM LoRA paper in the manual.",
               "Research model, CC-BY-NC 4.0 (non-commercial only)", False, 10, 8, 4,
               "roughly 3 to 10 minutes for 10 s on a CPU", False, "cvssp/audioldm2-music"),
    EngineInfo("musicldm", "MusicLDM", "built-in",
               "Music clips of about 10 s, trained on music only (latent diffusion).",
               "Research model, check the model card (assume non-commercial)", False, 10, 8, 4,
               "roughly 3 to 10 minutes for 10 s on a CPU", False, "ucsd-reach/musicldm"),
    EngineInfo("ace-step-1.5", "ACE-Step 1.5", "planned",
               "Newer ACE-Step with very fast generation and native LoRA training.",
               "Apache-2.0", True, 600, 12, 8, "slow on a CPU", True, "ACE-Step/Ace-Step1.5", "Not built in yet."),
]


def rate(e: EngineInfo, m: Machine) -> dict:
    v = m.vram_gb if m.cuda else 0.0
    r = m.ram_gb * 1.05
    if r < e.min_ram:
        status, why = "unavailable", f"Needs at least {e.min_ram:g} GB RAM; this PC has {m.ram_gb:g} GB."
    elif e.needs_cuda_for_comfort and not m.cuda:
        status, why = "slow", e.cpu_speed + "."
    elif e.needs_cuda_for_comfort and m.cuda and v < e.vram:
        status, why = "slow", f"{e.vram:g} GB GPU memory is comfortable; this GPU has {v:g} GB."
    elif not m.cuda:
        status, why = "slow", e.cpu_speed + "."
    else:
        status, why = "ready", ""
    if e.id == "diffrhythm":
        if not m.cuda:
            status = "unavailable"
            why = ("Needs an NVIDIA graphics card with CUDA (the authors name nothing for CPU or AMD). "
                   + (f"This PC has {m.best_gpu.name}." if m.best_gpu else "No dedicated graphics card found."))
        elif m.vram_gb < 8:
            status, why = "unavailable", f"Needs at least 8 GB graphics memory; this GPU has {m.vram_gb:g} GB."
        else:
            status = "ready" if m.vram_gb >= 12 else "slow"
            why = "" if m.vram_gb >= 12 else "8 GB is the stated minimum (with chunked decoding)."
            if dr_python() is None:
                why = (why + " Not installed yet: Settings → AI Engines → DiffRhythm.").strip()
    gpu_note = ""
    if e.id == "musicgen-small" and dml_python() is not None and status != "unavailable":
        status, why = "ready", "Runs on your graphics card through DirectML: about 2.5 minutes per 15 s clip (measured on an AMD Radeon R9 290)."
        gpu_note = "gpu"
    d = asdict(e)
    d.update(status=status, reason=why, usable=(e.kind == "built-in" and status != "unavailable"), accel=gpu_note)
    return d


def recommend(m: Machine) -> str:
    """The engine that gives a track in reasonable time on this computer."""
    if m.cuda and m.vram_gb >= 8 and m.ram_gb * 1.05 >= 16:
        return "ace-step"
    if m.cuda and m.vram_gb >= 8:
        return "musicgen-medium"
    return "musicgen-small"


def catalog(m: Machine) -> list[dict]:
    rec = recommend(m)
    out = []
    for e in ENGINES:
        d = rate(e, m)
        d["recommended"] = e.id == rec
        out.append(d)
    return out


LONG_MAX_SECONDS = 600      # tracks above 30 s are built in steps (services/musicgen_long.py)


# ── MusicGen ──────────────────────────────────────────────────────────────────

_mg: dict = {"id": None, "model": None, "processor": None, "device": "cpu"}
_mg_lock = threading.Lock()


def musicgen_ready() -> tuple[bool, str]:
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        import scipy  # noqa: F401
        return True, ""
    except Exception as e:  # pragma: no cover - depends on the install
        return False, f"{type(e).__name__}: {e}"


def generate_musicgen(engine_id: str, prompt: str, seconds: int, seed: int, wav_path: str,
                      guidance: float = 3.0, on_step=None) -> float:
    """Render one clip to a WAV file; returns its length in seconds."""
    import numpy as np
    import torch
    from scipy.io import wavfile
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    info = next((e for e in ENGINES if e.id == engine_id), None)
    if info is None or not info.hf_repo or info.kind != "built-in":
        raise ValueError(f"Unknown music engine: {engine_id}")

    with _mg_lock:
        if _mg["id"] != engine_id:
            _mg.update(id=None, model=None, processor=None)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            _mg["processor"] = AutoProcessor.from_pretrained(info.hf_repo)
            _mg["model"] = MusicgenForConditionalGeneration.from_pretrained(info.hf_repo, torch_dtype=dtype).to(device)
            _mg["device"] = device
            _mg["id"] = engine_id
        model, processor, device = _mg["model"], _mg["processor"], _mg["device"]

    from services.musicgen_long import generate_long
    from transformers import StoppingCriteria, StoppingCriteriaList

    seconds = max(1, min(seconds, LONG_MAX_SECONDS))
    rate = model.config.audio_encoder.sampling_rate

    def make_stop(tick):
        class _Tick(StoppingCriteria):          # called once per generated token: gives a real progress bar
            def __call__(self, input_ids, scores, **kw):
                tick(int(input_ids.shape[-1]))
                return False
        return StoppingCriteriaList([_Tick()])

    data = generate_long(model, processor, device, prompt, seconds, seed, guidance, rate, on_step=on_step,
                         to_device=lambda v: v.to(device), make_stop=make_stop)
    wavfile.write(wav_path, rate, (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16))
    return len(data) / float(rate)


# ── AudioLDM 2 / MusicLDM (diffusers) ─────────────────────────────────────────

_df: dict = {"id": None, "pipe": None, "device": "cpu"}
_df_lock = threading.Lock()


def generate_diffusers(engine_id: str, prompt: str, seconds: int, seed: int, wav_path: str,
                       guidance: float = 3.5, on_step=None, steps: int = 40) -> float:
    import numpy as np
    import torch
    from scipy.io import wavfile

    info = next((e for e in ENGINES if e.id == engine_id), None)
    if info is None or not info.hf_repo or info.kind != "built-in":
        raise ValueError(f"Unknown music engine: {engine_id}")
    with _df_lock:
        if _df["id"] != engine_id:
            _df.update(id=None, pipe=None)
            if engine_id == "musicldm":
                from diffusers import MusicLDMPipeline as Pipe
            else:
                from diffusers import AudioLDM2Pipeline as Pipe
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            _df["pipe"] = Pipe.from_pretrained(info.hf_repo, torch_dtype=dtype).to(device)
            _df["device"] = device
            _df["id"] = engine_id
        pipe, device = _df["pipe"], _df["device"]
    seconds = max(2, min(seconds, info.max_seconds))
    gen = torch.Generator(device=device).manual_seed(seed % (2**31))
    if on_step:
        on_step(0, steps)
    out = pipe(prompt, negative_prompt="low quality, average quality", num_inference_steps=steps,
               audio_length_in_s=float(seconds), guidance_scale=guidance, generator=gen,
               callback=(lambda i, t, latents: on_step(i + 1, steps)) if on_step else None, callback_steps=1)
    audio = np.asarray(out.audios[0], dtype=np.float32).reshape(-1)
    audio = np.clip(audio, -1.0, 1.0)
    rate = 16000                                    # both pipelines output 16 kHz mono
    wavfile.write(wav_path, rate, (audio * 32767).astype(np.int16))
    return len(audio) / float(rate)


# ── graphics card path (AMD / Intel through DirectML) ────────────────────────

def dml_python() -> str | None:
    """Python of the separate DirectML environment, if the user installed it."""
    p = os.environ.get("AMS_DML_PYTHON")
    return p if p and os.path.exists(p) else None


DML_ENGINES = {"musicgen-small"}      # measured to work; larger models do not fit 4 GB cards in fp32


def can_use_dml(engine_id: str) -> bool:
    return dml_python() is not None and engine_id in DML_ENGINES


def generate_dml(engine_id: str, prompt: str, seconds: int, seed: int, wav_path: str,
                 guidance: float = 3.0, on_step=None, on_stage=None, on_proc=None) -> float:
    """Run MusicGen in the DirectML environment (a separate process) and stream its progress."""
    import json
    import subprocess
    import tempfile

    info = next(e for e in ENGINES if e.id == engine_id)
    req = {"repo": info.hf_repo, "prompt": prompt, "seconds": max(1, min(seconds, LONG_MAX_SECONDS)),
           "seed": seed, "guidance": guidance, "out": wav_path}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(req, f)
        req_path = f.name
    worker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dml_worker.py")
    proc = subprocess.Popen([dml_python(), worker, req_path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace",
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if on_proc:
        on_proc(proc)                             # lets the caller stop it (Cancel button)
    seconds_out, error = None, None
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line.startswith("{"):
                continue                              # library warnings
            try:
                m = json.loads(line)
            except ValueError:
                continue
            if "error" in m:
                error = m["error"]
            elif m.get("done"):
                seconds_out = float(m["seconds"])
            elif m.get("stage") == "load" and on_stage:
                on_stage("load", m.get("text", "Loading the model onto the graphics card"))
            elif m.get("step") is not None and on_step:
                if m.get("text") and on_stage:
                    on_stage("render", m["text"])
                on_step(m["step"], m["total"])
    except BaseException:
        proc.kill()          # Cancel button or an error: never leave the worker running
        raise
    code = proc.wait()
    try:
        os.unlink(req_path)
    except OSError:
        pass
    if seconds_out is None:
        raise RuntimeError(error or f"The graphics card worker stopped (exit code {code}).")
    return seconds_out


# ── DiffRhythm (own environment, cloned repository, subprocess) ──────────────

def dr_python() -> str | None:
    p = os.environ.get("AMS_DR_PYTHON")
    return p if p and os.path.exists(p) else None


def dr_repo() -> str | None:
    p = os.environ.get("AMS_DR_REPO")
    return p if p and os.path.exists(os.path.join(p, "infer", "infer.py")) else None


def lyrics_to_lrc(lyrics: str, seconds: int) -> str:
    """DiffRhythm reads lyrics as '[mm:ss.xx]text' lines (fixed column slices). Spread plain lines over the song."""
    import re
    lines = [l.strip() for l in lyrics.splitlines()]
    lines = [l for l in lines if l and not re.fullmatch(r"\[[^\]]*\]", l)]     # drop [Verse] / [Chorus] tags
    if not lines:
        return ""
    start, end = 4.0, max(8.0, seconds - 14.0)          # leave room for an intro and an outro
    out = []
    for i, text in enumerate(lines):
        t = start if len(lines) == 1 else start + i * (end - start) / (len(lines) - 1)
        out.append(f"[{int(t // 60):02d}:{t % 60:05.2f}]{text}")
    return "\n".join(out) + "\n"


def generate_diffrhythm(prompt: str, lyrics: str, seconds: int, wav_path: str, on_stage=None, on_step=None,
                        log=print, on_proc=None) -> float:
    """Run DiffRhythm's infer.py. Returns the length of the written song in seconds."""
    import re
    import shutil
    import subprocess
    import tempfile
    import wave

    py, repo = dr_python(), dr_repo()
    if not py or not repo:
        raise RuntimeError("DiffRhythm is not installed. Open Settings → AI Engines, tick DiffRhythm and press Install selected.")
    lrc = lyrics_to_lrc(lyrics, seconds)
    if not lrc:
        raise RuntimeError("DiffRhythm sings your lyrics: please enter lyrics (one line per sung line).")
    seconds = 95 if seconds <= 95 else min(seconds, 285)          # the model takes exactly 95 or 96 to 285 s
    work = tempfile.mkdtemp(prefix="ams_dr_")
    lrc_path = os.path.join(work, "lyrics.lrc")
    with open(lrc_path, "w", encoding="utf-8") as f:
        f.write(lrc)
    out_dir = os.path.join(work, "out")
    env = dict(os.environ, PYTHONPATH=repo, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    # on Windows the phonemizer needs the eSpeak NG library; its installer puts it here
    esp = r"C:\Program Files\eSpeak NG"
    if os.path.isdir(esp):
        env.setdefault("PHONEMIZER_ESPEAK_LIBRARY", os.path.join(esp, "libespeak-ng.dll"))
        env.setdefault("PHONEMIZER_ESPEAK_PATH", esp)
    elif os.name == "nt" and not env.get("PHONEMIZER_ESPEAK_LIBRARY"):
        raise RuntimeError("DiffRhythm needs eSpeak NG. Install it from https://github.com/espeak-ng/espeak-ng/releases "
                           "(the .msi), then try again.")
    cmd = [py, os.path.join("infer", "infer.py"), "--lrc-path", lrc_path, "--ref-prompt", prompt or "pop",
           "--audio-length", str(seconds), "--output-dir", out_dir, "--chunked"]
    if on_stage:
        on_stage("load", "Loading DiffRhythm. The first time it downloads the models (several GB).")
    proc = subprocess.Popen(cmd, cwd=repo, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if on_proc:
        on_proc(proc)                               # lets the caller stop it (Cancel button)
    tail: list[str] = []
    bar = re.compile(r"(\d+)/(\d+)\s*\[")
    assert proc.stdout is not None
    buf = ""
    try:
        while True:                                     # tqdm redraws its line with \r
            ch = proc.stdout.read(1)
            if ch == "":
                break
            if ch in ("\r", "\n"):
                line = buf.strip()
                buf = ""
                if not line:
                    continue
                tail.append(line[-300:])
                del tail[:-30]
                log("[DiffRhythm] " + line[:300])
                m = bar.search(line)
                if m and on_step:
                    if on_stage:
                        on_stage("render", "Composing the song")
                    on_step(int(m.group(1)), int(m.group(2)))
            else:
                buf += ch
    except BaseException:
        proc.kill()          # Cancel button or an error: never leave the worker running
        raise
    code = proc.wait()
    produced = os.path.join(out_dir, "output.wav")
    if code != 0 or not os.path.exists(produced):
        raise RuntimeError("DiffRhythm failed: " + " | ".join(tail[-3:]))
    shutil.copyfile(produced, wav_path)
    shutil.rmtree(work, ignore_errors=True)
    with wave.open(wav_path, "rb") as w:
        return w.getnframes() / float(w.getframerate())
