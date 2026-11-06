"""Reference-track mastering via Matchering."""
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
