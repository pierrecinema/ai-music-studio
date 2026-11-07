"""Music generators the user can choose from, and how well each fits this computer.

Two are built in: ACE-Step (full songs with vocals) and Meta MusicGen (instrumental clips, small
and medium models also work on weak machines). The others are listed so people can see what
exists and what hardware they would need; they are marked as not yet built in.
"""
from __future__ import annotations

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
               "Apache-2.0", True, 600, 10, 8, "30 to 90 minutes per minute of music on a CPU or AMD card",
               note="Installed from Settings → AI Engines."),
    EngineInfo("musicgen-small", "MusicGen small (300M)", "built-in",
               "Instrumental clips up to 30 s from a text description. Light enough for old PCs.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 30, 6, 2,
               "about 2 to 5 minutes for 30 s on a CPU", False, "facebook/musicgen-small"),
    EngineInfo("musicgen-medium", "MusicGen medium (1.5B)", "built-in",
               "Better quality instrumentals, up to 30 s.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 30, 12, 8,
               "10 to 25 minutes for 30 s on a CPU", True, "facebook/musicgen-medium"),
    EngineInfo("musicgen-large", "MusicGen large (3.3B)", "built-in",
               "Best MusicGen quality, up to 30 s. Needs a strong GPU.",
               "Weights CC-BY-NC 4.0 (non-commercial only)", False, 30, 16, 16,
               "not practical on a CPU", True, "facebook/musicgen-large"),
    EngineInfo("stable-audio-open", "Stable Audio Open (1.1B)", "planned",
               "Sound effects, loops and short music up to 47 s. Needs a free Hugging Face account to accept the licence.",
               "Stability AI Community licence", False, 47, 12, 8, "very slow on a CPU", True,
               "stabilityai/stable-audio-open-1.0", "Not built in yet."),
    EngineInfo("yue", "YuE (lyrics to full song)", "planned",
               "Full songs with vocals from lyrics, multi-minute. Very heavy.",
               "Apache-2.0", True, 300, 32, 24, "not practical on a CPU", True,
               "m-a-p/YuE-s1-7B-anneal-en-cot", "Not built in yet."),
    EngineInfo("diffrhythm", "DiffRhythm", "planned",
               "Fast full-length songs with vocals (up to about 4 minutes).",
               "Apache-2.0", True, 285, 16, 8, "slow on a CPU", True, "ASLP-lab/DiffRhythm-base", "Not built in yet."),
    EngineInfo("audioldm2", "AudioLDM 2", "planned",
               "Music and sound from text; supports LoRA for genre and timbre control.",
               "CC-BY-NC 4.0", False, 10, 12, 8, "slow on a CPU", True, "cvssp/audioldm2-music", "Not built in yet."),
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
    d = asdict(e)
    d.update(status=status, reason=why, usable=(e.kind == "built-in" and status != "unavailable"))
    return d


def catalog(m: Machine) -> list[dict]:
    return [rate(e, m) for e in ENGINES]


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

    seconds = max(1, min(seconds, info.max_seconds))
    torch.manual_seed(seed % (2**31))
    inputs = processor(text=[prompt], padding=True, return_tensors="pt").to(device)
    from transformers import StoppingCriteria, StoppingCriteriaList
    wanted = int(seconds * 50)

    class _Tick(StoppingCriteria):          # called once per generated token: gives a real progress bar
        def __call__(self, input_ids, scores, **kw):
            if on_step:
                on_step(min(int(input_ids.shape[-1]), wanted), wanted)
            return False

    if on_step:
        on_step(0, wanted)
    with torch.no_grad():
        audio = model.generate(**inputs, do_sample=True, guidance_scale=guidance,
                               max_new_tokens=wanted, stopping_criteria=StoppingCriteriaList([_Tick()]))
    rate = model.config.audio_encoder.sampling_rate
    data = audio[0].detach().float().cpu().numpy()      # (channels, samples)
    data = data.T if data.ndim == 2 else data
    data = np.clip(data, -1.0, 1.0)
    wavfile.write(wav_path, rate, (data * 32767).astype(np.int16))
    return len(data) / float(rate)
