"""Mastering: reference match (Matchering) and the export of a mastered song in many formats."""
import os
import tempfile
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class MasterRequest(BaseModel):
    targetPath: str
    referencePath: str
    bitDepth: int = 16          # 16 or 24
    format: str = "wav"


@router.post("/master")
async def master(req: MasterRequest):
    for p in (req.targetPath, req.referencePath):
        if not os.path.exists(p):
            raise HTTPException(400, f"File not found: {p}")
    if req.bitDepth not in (16, 24):
        raise HTTPException(400, "bitDepth must be 16 or 24")

    try:
        import matchering as mg
    except ImportError:
        raise HTTPException(501, "Matchering is not installed. Run: pip install matchering")

    out_dir = os.path.join(tempfile.gettempdir(), "ams_master")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"mastered_{uuid.uuid4().hex[:8]}.wav")
    result = mg.pcm16(out) if req.bitDepth == 16 else mg.pcm24(out)
    try:
        mg.process(target=req.targetPath, reference=req.referencePath, results=[result])
    except Exception as e:
        raise HTTPException(500, f"Mastering failed: {e}")
    return {"audioFile": out}


class ExportOut(BaseModel):
    format: str                     # wav aiff flac alac mp3 aac ogg opus
    bits: int | None = 24           # 16 24 32 (PCM formats)
    sampleRate: int | None = None   # None: the rate of the source
    kbps: int | None = 320
    vbr: bool = False
    suffix: str | None = None


class ExportRequest(BaseModel):
    source: str                     # the float WAV rendered through the chain
    folder: str
    name: str
    outputs: list[ExportOut]
    dither: bool = True
    meta: dict = {}
    cover: str | None = None


@router.post("/export")
async def export_master(req: ExportRequest):
    if not os.path.exists(req.source):
        raise HTTPException(400, f"File not found: {req.source}")
    if not req.outputs:
        raise HTTPException(400, "Choose at least one format.")
    import asyncio
    from services.master_export import export
    results = await asyncio.to_thread(export, req.source, req.folder, req.name, [o.model_dump() for o in req.outputs],
                                      req.dither, req.meta, req.cover)
    return {"results": results}


@router.get("/formats")
async def formats():
    from services.master_export import FORMATS, ffmpeg_exe
    return {"formats": {k: v[1] for k, v in FORMATS.items()}, "ffmpeg": ffmpeg_exe(install=False) is not None}
