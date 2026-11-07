"""Hardware check and feature gating.

The app is meant for hobby users on old PCs as well as for professionals with big GPUs.
Instead of letting a feature fail half way, every feature declares what it needs and this
module answers, for the machine it runs on:

    ready        runs comfortably
    slow         runs, but takes long (the message says roughly how long)
    unavailable  cannot run here (the message says why and what would be needed)

The numbers are conservative estimates, not benchmarks.
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import dataclass, asdict, field

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


# ── detection ──────────────────────────────────────────────────────────────────

@dataclass
class Gpu:
    name: str
    vendor: str          # nvidia | amd | intel | other
    vram_gb: float       # 0 = unknown
    cuda: bool = False   # usable with CUDA (NVIDIA + torch.cuda)


@dataclass
class Machine:
    gpus: list[Gpu] = field(default_factory=list)
    cpu_name: str = ""
    cpu_threads: int = 2
    ram_gb: float = 8.0
    disk_free_gb: float = 0.0
    cuda: bool = False
    directml: bool = False
    system: str = ""

    @property
    def best_gpu(self) -> Gpu | None:
        if not self.gpus:
            return None
        rank = {"nvidia": 3, "amd": 2, "intel": 1, "other": 0}
        return max(self.gpus, key=lambda g: (rank.get(g.vendor, 0), g.vram_gb))

    @property
    def vram_gb(self) -> float:
        g = self.best_gpu
        return g.vram_gb if g else 0.0


def _run(cmd: list[str], timeout: int = 8) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                           creationflags=CREATE_NO_WINDOW)
        return r.stdout or ""
    except Exception:
        return ""


def _vendor(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("nvidia", "geforce", "rtx", "gtx", "quadro", "tesla")):
        return "nvidia"
    if "radeon" in n or "amd" in n:
        return "amd"
    if "intel" in n:
        return "intel"
    return "other"


def _gpus_nvidia_smi() -> list[Gpu]:
    """Exact numbers straight from the NVIDIA driver."""
    if not shutil.which("nvidia-smi"):
        return []
    out = _run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    gpus = []
    for line in out.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) == 2 and parts[1].replace(".", "").isdigit():
            gpus.append(Gpu(parts[0], "nvidia", round(float(parts[1]) / 1024, 1)))
    return gpus


def _gpus_windows_registry() -> list[Gpu]:
    """Win32_VideoController.AdapterRAM is capped at 4 GB; the registry holds the real value."""
    script = (
        "$k='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*';"
        "Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DriverDesc } | "
        "ForEach-Object { \"$($_.DriverDesc)|$($_.'HardwareInformation.qwMemorySize')\" }"
    )
    out = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], 12)
    gpus = []
    for line in out.splitlines():
        name, _, mem = line.partition("|")
        name = name.strip()
        if not name:
            continue
        gb = 0.0
        if mem.strip().isdigit():
            gb = round(int(mem.strip()) / 1024**3, 1)
        gpus.append(Gpu(name, _vendor(name), gb))
    return gpus


def _gpus_names_only() -> list[Gpu]:
    out = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                "(Get-CimInstance Win32_VideoController).Name"])
    return [Gpu(l.strip(), _vendor(l), 0.0) for l in out.splitlines() if l.strip()]


def _cpu_name() -> str:
    if platform.system() == "Windows":
        out = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                    "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"])
        if out.strip():
            return out.strip()
    return platform.processor() or ""


def detect_machine(models_dir: str | None = None) -> Machine:
    m = Machine(system=platform.system(), cpu_threads=os.cpu_count() or 2)
    try:
        import psutil
        m.ram_gb = round(psutil.virtual_memory().total / 1024**3, 1)
    except Exception:
        pass
    try:
        m.disk_free_gb = round(shutil.disk_usage(models_dir or os.path.expanduser("~")).free / 1024**3, 1)
    except Exception:
        pass
    m.cpu_name = _cpu_name()

    gpus = _gpus_nvidia_smi()
    if platform.system() == "Windows":
        reg = _gpus_windows_registry() or _gpus_names_only()
        have = {g.name.lower() for g in gpus}
        gpus += [g for g in reg if g.name.lower() not in have and not (g.vendor == "nvidia" and gpus)]
    m.gpus = gpus

    try:
        import torch
        m.cuda = bool(torch.cuda.is_available()) and "rocm" not in torch.__version__.lower()
        if m.cuda:
            props = torch.cuda.get_device_properties(0)
            for g in m.gpus:
                if g.vendor == "nvidia":
                    g.cuda = True
                    g.vram_gb = g.vram_gb or round(props.total_memory / 1024**3, 1)
            if not any(g.cuda for g in m.gpus):
                m.gpus.append(Gpu(props.name, "nvidia", round(props.total_memory / 1024**3, 1), True))
    except Exception:
        pass
    try:
        import torch_directml  # type: ignore  # noqa: F401
        m.directml = True
    except Exception:
        pass
    return m


# ── tiers ──────────────────────────────────────────────────────────────────────

def tier_of(m: Machine) -> tuple[str, str]:
    """(id, plain-language label)."""
    v, r = m.vram_gb, m.ram_gb
    nvidia = m.cuda
    if nvidia and v >= 24 and r >= 32:
        return "studio", "Studio: very powerful machine, everything runs fast"
    if nvidia and v >= 12 and r >= 16:
        return "pro", "Pro: strong NVIDIA GPU, all features including training"
    if nvidia and v >= 6:
        return "standard", "Standard: good NVIDIA GPU, most features run well"
    if r >= 24:
        return "capable", "Capable CPU machine: works, but AI music is slow without an NVIDIA GPU"
    return "entry", "Entry: older or small machine, features run but AI music takes long"


# ── features ───────────────────────────────────────────────────────────────────

@dataclass
class Feature:
    id: str
    name: str
    group: str
    need: str                     # short human requirement text
    cuda: bool = False            # needs an NVIDIA GPU with CUDA to be usable at all
    vram: float = 0.0             # GB of GPU memory for comfortable use
    ram: float = 0.0              # GB of system memory for comfortable use
    min_ram: float = 0.0          # below this the feature is unavailable
    min_vram_cuda: float = 0.0    # below this (with CUDA) unavailable
    cpu_ok: bool = True           # may run on the CPU, slowly
    cpu_hint: str = ""            # what "slowly" means


FEATURES: list[Feature] = [
    Feature("daw", "Timeline, piano roll, mixer", "DAW", "any computer", ram=4),
    Feature("mastering", "Mastering (reference matching)", "Audio", "any computer, takes seconds to a minute", ram=4,
            cpu_hint="about a minute for a song"),
    Feature("stems", "Stem separation (Demucs, 6 stems)", "Audio", "NVIDIA GPU is fast; CPU works", vram=4, ram=8, min_ram=6,
            cpu_hint="5 to 15 minutes for a 4-minute song on the CPU"),
    Feature("audio_to_midi", "Audio to MIDI", "Audio", "any computer; GPU makes MuScriptor faster", ram=8, min_ram=6,
            cpu_hint="1 to 5 minutes per song"),
    Feature("karaoke", "Karaoke / word timing (Whisper)", "Audio", "any computer; GPU is faster", vram=4, ram=8, min_ram=6,
            cpu_hint="roughly the length of the song on the CPU"),
    Feature("music_gen", "Create music (ACE-Step)", "AI music", "NVIDIA GPU with 8 GB+ for minutes-fast songs",
            cuda=True, vram=8, ram=16, min_ram=10,
            cpu_hint="on the CPU or an old AMD card expect many hours per song (the 3.5B model is too big for a small PC)"),
    Feature("music_light", "Light music (MusicGen small, 15 to 30 s clips)", "AI music", "any computer; AMD and Intel graphics cards via DirectML",
            ram=8, min_ram=6, cpu_hint="about 7 minutes for a 15 s clip on a fast older CPU"),
    Feature("songs_oneshot", "Full songs of 95 s to 4:45 in one go (DiffRhythm, experimental)", "AI music",
            "NVIDIA GPU with 8 GB or more", cuda=True, vram=8, ram=16, min_ram=10, min_vram_cuda=8, cpu_ok=False),
    Feature("music_long", "Songs longer than 4 minutes", "AI music", "12 GB+ GPU memory", cuda=True, vram=12, ram=24, min_ram=12,
            cpu_hint="possible, but very slow"),
    Feature("lora_use", "Use LoRA styles", "AI music", "same as Create music", cuda=True, vram=10, ram=16, min_ram=10,
            cpu_hint="adds a few minutes to loading"),
    Feature("lora_train", "Train your own LoRA", "AI music", "NVIDIA GPU with 12 GB+ (8 GB with small settings)",
            cuda=True, vram=12, ram=24, min_ram=16, min_vram_cuda=8, cpu_ok=False),
    Feature("video", "Video to music", "Video", "any computer; GPU helps", ram=8, min_ram=6,
            cpu_hint="several minutes per clip"),
]


def evaluate(f: Feature, m: Machine) -> dict:
    v = m.vram_gb
    r = m.ram_gb * 1.05          # Windows reports slightly less than the installed memory (12 GB shows as 11.9)
    status, why = "ready", ""

    if f.min_ram and r < f.min_ram:
        status, why = "unavailable", f"Needs at least {f.min_ram:g} GB RAM; this PC has {m.ram_gb:g} GB."
    elif f.min_vram_cuda and not m.cuda:
        status = "unavailable"
        why = "Needs an NVIDIA GPU with CUDA. " + (
            f"This PC has {m.best_gpu.name}." if m.best_gpu else "No dedicated GPU found.")
        if not f.cpu_ok:
            why += " Training on a CPU or AMD card is not practical."
    elif f.min_vram_cuda and m.cuda and v < f.min_vram_cuda:
        status, why = "unavailable", f"Needs {f.min_vram_cuda:g} GB GPU memory; this GPU has {v:g} GB."
    else:
        short_gpu = f.cuda and not m.cuda
        short_vram = f.vram and m.cuda and v < f.vram
        short_ram = f.ram and r < f.ram
        if short_gpu:
            status = "slow"
            why = f.cpu_hint or "Runs on the CPU and takes long."
            if m.best_gpu and m.best_gpu.vendor == "amd":
                why += (" ACE-Step cannot use an AMD card (it needs more video memory than old cards have). "
                        "MusicGen small can: see 'Light music' below.")
        elif short_vram:
            status = "slow"
            why = f"This GPU has {v:g} GB; {f.vram:g} GB is comfortable. It will swap to system memory and be slower."
        elif short_ram:
            status = "slow"
            why = f"{f.ram:g} GB RAM is comfortable, this PC has {m.ram_gb:g} GB. Expect swapping and longer waits."
        elif not f.cuda and f.vram and not m.cuda:
            status = "slow" if f.cpu_hint and f.id in ("stems", "karaoke") else "ready"
            why = f.cpu_hint if status == "slow" else ""

    if f.id == "music_light" and os.environ.get("AMS_DML_PYTHON") and os.path.exists(os.environ["AMS_DML_PYTHON"])             and status != "unavailable":
        status, why = "ready", "Runs on your graphics card through DirectML: about 2.5 minutes for a 15 s clip (measured on an AMD Radeon R9 290)."
    elif f.id == "music_light" and status != "unavailable" and m.best_gpu and m.best_gpu.vendor in ("amd", "intel") and not m.cuda:
        status = "slow"
        why = (why + " Install 'Graphics card support' in Settings → AI Engines to use your " + m.best_gpu.name +
               " (about 3 times faster).").strip()
    d = asdict(f)
    d.update(status=status, reason=why)
    return d


def report(models_dir: str | None = None) -> dict:
    m = detect_machine(models_dir)
    tier, label = tier_of(m)
    return {
        "tier": tier,
        "label": label,
        "machine": {
            "cpu": m.cpu_name,
            "threads": m.cpu_threads,
            "ram_gb": m.ram_gb,
            "disk_free_gb": m.disk_free_gb,
            "gpus": [asdict(g) for g in m.gpus],
            "cuda": m.cuda,
            "directml": m.directml,
            "system": m.system,
        },
        "features": [evaluate(f, m) for f in FEATURES],
    }


_cache: dict | None = None


def get_report(refresh: bool = False, models_dir: str | None = None) -> dict:
    global _cache
    if _cache is None or refresh:
        _cache = report(models_dir)
    return _cache
