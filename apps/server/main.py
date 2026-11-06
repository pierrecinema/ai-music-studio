"""AI Music Studio — local backend server."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import vocal, instruments, stems, audio_to_midi, video, ai_chat, vst

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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AMS_PORT", 8765))
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info")
