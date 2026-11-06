"""
Hardware detection — GPU and CPU capability check.
Supports AMD (ROCm/DirectML), NVIDIA (CUDA) and CPU-only fallback.
Optimized for older hardware: AMD Radeon R9 290 series and dual-core CPUs.
"""
import os
import platform
import subprocess
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class HardwareProfile:
    gpu_vendor: str        # "nvidia" | "amd" | "none"
    gpu_name: str
    gpu_backend: str       # "cuda" | "rocm" | "directml" | "cpu"
    cpu_cores: int
    low_cpu_mode: bool     # True if < 4 cores or old generation
    torch_device: str      # "cuda" | "privateuseone" (DirectML) | "cpu"
    half_precision: bool   # Use fp16 to save VRAM


def _detect_amd_directml() -> bool:
    """Check if torch-directml is installed (Windows AMD GPU path)."""
    try:
        import torch_directml  # type: ignore
        return True
    except ImportError:
        return False


def _detect_rocm() -> bool:
    """Check if ROCm PyTorch is available (Linux AMD GPU path)."""
    try:
        import torch
        return torch.cuda.is_available() and "rocm" in torch.__version__.lower()
    except Exception:
        return False


def _detect_cuda() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def _gpu_name_from_wmi() -> str:
    """Read GPU name on Windows via WMIC (no extra deps)."""
    if platform.system() != "Windows":
        return ""
    try:
        result = subprocess.run(
            ["wmic", "path", "win32_VideoController", "get", "name"],
            capture_output=True, text=True, timeout=5
        )
        lines = [l.strip() for l in result.stdout.splitlines() if l.strip() and l.strip() != "Name"]
        return lines[0] if lines else ""
    except Exception:
        return ""


def detect() -> HardwareProfile:
    import os
    cpu_cores = os.cpu_count() or 2
    low_cpu = cpu_cores < 4

    gpu_name = _gpu_name_from_wmi()
    gpu_vendor = "none"
    if gpu_name:
        name_lower = gpu_name.lower()
        if "radeon" in name_lower or "amd" in name_lower:
            gpu_vendor = "amd"
        elif "nvidia" in name_lower or "geforce" in name_lower or "rtx" in name_lower or "gtx" in name_lower:
            gpu_vendor = "nvidia"

    # Determine best backend
    if gpu_vendor == "nvidia" and _detect_cuda():
        try:
            import torch
            vram_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
            half = vram_mb < 6000
        except Exception:
            half = True
        return HardwareProfile(
            gpu_vendor="nvidia", gpu_name=gpu_name, gpu_backend="cuda",
            cpu_cores=cpu_cores, low_cpu_mode=low_cpu,
            torch_device="cuda", half_precision=half
        )

    if gpu_vendor == "amd":
        # Windows: DirectML is the most compatible path for Radeon R290/R9 series
        if platform.system() == "Windows" and _detect_amd_directml():
            return HardwareProfile(
                gpu_vendor="amd", gpu_name=gpu_name, gpu_backend="directml",
                cpu_cores=cpu_cores, low_cpu_mode=low_cpu,
                torch_device="privateuseone",  # torch-directml device
                half_precision=True  # R290 has 4 GB VRAM
            )
        # Linux with ROCm
        if _detect_rocm():
            return HardwareProfile(
                gpu_vendor="amd", gpu_name=gpu_name, gpu_backend="rocm",
                cpu_cores=cpu_cores, low_cpu_mode=low_cpu,
                torch_device="cuda",  # ROCm exposes as "cuda"
                half_precision=True
            )

    # CPU-only fallback — optimized for older hardware
    return HardwareProfile(
        gpu_vendor=gpu_vendor, gpu_name=gpu_name, gpu_backend="cpu",
        cpu_cores=cpu_cores, low_cpu_mode=low_cpu,
        torch_device="cpu", half_precision=False
    )


# Singleton — detect once at startup
_profile: HardwareProfile | None = None


def get_profile() -> HardwareProfile:
    global _profile
    if _profile is None:
        _profile = detect()
        logger.info(
            "Hardware: GPU=%s (%s) backend=%s device=%s cores=%d low_cpu=%s fp16=%s",
            _profile.gpu_name or "none", _profile.gpu_vendor,
            _profile.gpu_backend, _profile.torch_device,
            _profile.cpu_cores, _profile.low_cpu_mode, _profile.half_precision
        )
    return _profile
