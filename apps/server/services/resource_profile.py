"""Memory budget for heavy models. Target: 8 GB VRAM / 12 GB RAM machines."""
from __future__ import annotations

import os
from dataclasses import dataclass, asdict

from services.hardware_detect import get_profile


@dataclass
class ResourceProfile:
    vram_gb: float
    ram_gb: float
    low_memory: bool          # True when VRAM <= 8 GB or RAM <= 12 GB
    cpu_offload: bool         # keep idle model parts in system RAM
    half_precision: bool
    max_duration_s: int       # longest song the generator will attempt
    quant: str                # preferred GGUF/weights quantisation
    demucs_segment_s: int     # demucs chunk size; smaller = less memory
    demucs_jobs: int


def _ram_gb() -> float:
    try:
        import psutil
        return psutil.virtual_memory().total / 1024**3
    except Exception:
        return 12.0


def _vram_gb() -> float:
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / 1024**3
    except Exception:
        pass
    override = os.environ.get("AMS_VRAM_GB")
    return float(override) if override else 0.0


def detect_resources() -> ResourceProfile:
    hw = get_profile()
    vram = _vram_gb()
    if vram == 0.0:
        # no CUDA: ask the hardware check for the real memory of the card (registry), not a guess
        try:
            from services.capabilities import get_report
            gpus = get_report()["machine"]["gpus"]
            vram = max((g["vram_gb"] for g in gpus), default=0.0)
        except Exception:
            pass
    ram = _ram_gb()
    low = (0 < vram <= 8.5) or vram == 0.0 or ram <= 12.5

    if vram >= 16 and ram >= 24:
        quant = "bf16"
    elif vram >= 12:
        quant = "q8_0"
    else:
        quant = "q4_k_m"
    # Small machines are not capped to short songs: offloading and chunked decoding keep memory
    # in check, a long song just takes longer. 7 minutes everywhere, 10 on big machines.
    max_dur = 600 if (vram >= 16 and ram >= 24) else 420

    return ResourceProfile(
        vram_gb=round(vram, 1),
        ram_gb=round(ram, 1),
        low_memory=low,
        cpu_offload=low,
        half_precision=hw.half_precision or low,
        max_duration_s=max_dur,
        quant=quant,
        demucs_segment_s=7 if low else 15,
        demucs_jobs=1 if low else max(1, hw.cpu_cores // 2),
    )


_cached: ResourceProfile | None = None


def get_resources() -> dict:
    global _cached
    if _cached is None:
        _cached = detect_resources()
    return asdict(_cached)


def resources() -> ResourceProfile:
    global _cached
    if _cached is None:
        _cached = detect_resources()
    return _cached
