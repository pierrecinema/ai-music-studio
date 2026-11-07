"""Hardware check: what this computer can do (see services/capabilities.py)."""
import asyncio
import os

from fastapi import APIRouter

from services.capabilities import get_report

router = APIRouter()


@router.get("/capabilities")
async def capabilities(refresh: bool = False):
    # detection calls PowerShell / nvidia-smi: keep it off the event loop
    return await asyncio.to_thread(get_report, refresh, os.environ.get("AMS_ACESTEP_DIR"))


_proc = None


@router.get("/usage")
async def usage():
    """Live load of this computer, for the progress panel."""
    import psutil
    global _proc
    if _proc is None:
        _proc = psutil.Process()
        _proc.cpu_percent(None)
        psutil.cpu_percent(None)
        await asyncio.sleep(0.2)
    vm = psutil.virtual_memory()
    return {
        "cpu_percent": psutil.cpu_percent(None),
        "engine_cpu_percent": round(_proc.cpu_percent(None) / (psutil.cpu_count() or 1), 1),
        "ram_percent": vm.percent,
        "ram_used_gb": round(vm.used / 1024**3, 1),
        "ram_total_gb": round(vm.total / 1024**3, 1),
        "engine_ram_gb": round(_proc.memory_info().rss / 1024**3, 1),
        "swap_percent": psutil.swap_memory().percent,
    }
