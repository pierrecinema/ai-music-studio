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

# transformers auto-detects TensorFlow (installed by basic-pitch). TensorFlow needs an old NumPy,
# so importing it crashes ACE-Step ("numpy.core.umath failed to import"). We only use PyTorch.
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("USE_TORCH", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import vocal, instruments, stems, audio_to_midi, video, ai_chat, vst, mcp_server, music_gen, mastering, karaoke, system, train, library
try:
    from services.mcp_app import build_server
    mcp_sdk_server = build_server()
    mcp_asgi_app = mcp_sdk_server.streamable_http_app(json_response=True, stateless_http=True)
except ImportError:
    # Backend installed before MCP support: keep running, re-run "Install selected" to add it
    logging.getLogger(__name__).warning("mcp package missing, MCP endpoint disabled")
    mcp_sdk_server = None
    mcp_asgi_app = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if mcp_sdk_server is None:
        yield
        return
    async with mcp_sdk_server.session_manager.run():
        yield


app = FastAPI(title="AI Music Studio Server", version="0.1.0", lifespan=lifespan)

# Only the desktop app (file:// sends Origin "null") and local dev servers may call this API
# from a browser context; random websites must not be able to drive a local server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
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
app.include_router(music_gen.router, prefix="/music", tags=["music"])
app.include_router(mastering.router, prefix="/mastering", tags=["mastering"])
app.include_router(karaoke.router, prefix="/karaoke", tags=["karaoke"])
app.include_router(system.router, prefix="/system", tags=["system"])
app.include_router(train.router, prefix="/train", tags=["train"])
app.include_router(library.router, prefix="/library", tags=["library"])


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
    try:
        from services.resource_profile import get_resources
        hw_info["resources"] = get_resources()
    except Exception:
        pass
    return {"status": "ok", "version": "0.2.0", "hardware": hw_info}


# Must stay last: the MCP endpoint lives at /mcp, all other routes are matched first.
if mcp_asgi_app is not None:
    app.mount("/", mcp_asgi_app)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AMS_PORT", 38765))
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info", access_log=False)  # polling would fill the log
