"""Sample folders (Ableton library and others): list, search, tempo."""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import samples

router = APIRouter()


@router.get("/folders")
async def get_folders():
    return {"folders": samples.folders(), "ableton": await asyncio.to_thread(samples.ableton_candidates)}


class FolderReq(BaseModel):
    path: str


@router.post("/folders")
async def add_folder(req: FolderReq):
    try:
        return {"folders": await asyncio.to_thread(samples.add_folder, req.path)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/folders")
async def remove_folder(path: str):
    return {"folders": samples.remove_folder(path)}


@router.get("")
async def search(q: str = "", root: str | None = None, bpm: float | None = None, limit: int = 300):
    return await asyncio.to_thread(samples.search, q, root, bpm, min(max(limit, 1), 1000))


@router.post("/analyze")
async def analyze(req: FolderReq):
    try:
        return await asyncio.to_thread(samples.analyze, req.path)
    except ImportError:
        raise HTTPException(400, "Tempo detection needs the librosa package (Settings → AI Engines → Video analysis).")
    except Exception as e:
        raise HTTPException(400, f"Could not analyse this file: {e}")
