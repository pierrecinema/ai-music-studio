"""AI Music Studio — local backend server."""
import os
import logging

# Hardware-aware thread tuning for older CPUs (e.g. dual-core)
# Must happen before any torch/numpy imports
def _tune_threads() -> None:
    try:
        cpu_count = os.cpu_count() or 2
        # On old CPUs cap PyTorch/OMP threads to avoid thrashing
        threads = max(1, min(cpu_count - 1, 4))
        os.environ.setdefault("OMP_NUM_THREADS", str(threads))
        os.environ.setdefault("MKL_NUM_THREADS", str(threads))
        os.environ.setdefault("OPENBLAS_NUM_THREADS", str(threads))
    except Exception:
        pass

_tune_threads()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import vocal, instruments, stems, audio_to_midi, video, ai_chat, vst, mcp_server

app = FastAPI(title="AI Music Studio Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vocal.router, prefix="/vocal", tags=["vocal"])
app.include_router(instruments.router, prefix="/instruments", tags=["instruments"])
app.include_router(stems.router, prefix="/stems", tags=["stems"])
app.include_router(audio_to_midi.router, prefix="/audio-to-midi", tags=["audio-to-midi"])
app.include_router(video.router, prefix="/video", tags=["video"])
app.include_router(ai_chat.router, prefix="/ai", tags=["ai"])
app.include_router(vst.router, prefix="/vst", tags=["vst"])
app.include_router(mcp_server.router, prefix="/mcp", tags=["mcp"])


@app.get("/health")
async def health():
    try:
        from services.hardware_detect import get_profile
        hw = get_profile()
        hw_info = {
            "gpu": hw.gpu_name or "none",
            "backend": hw.gpu_backend,
            "cores": hw.cpu_cores,
            "low_cpu": hw.low_cpu_mode,
            "fp16": hw.half_precision,
        }
    except Exception:
        hw_info = {"gpu": "unknown", "backend": "cpu"}
    return {"status": "ok", "version": "0.1.0", "hardware": hw_info}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AMS_PORT", 8765))
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info")
