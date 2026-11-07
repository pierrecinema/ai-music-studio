"""The library of generated and imported tracks (see services/library.py)."""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import library

router = APIRouter()


@router.get("")
async def list_tracks():
    tracks = await asyncio.to_thread(library.list_tracks)
    return {"dir": str(library.library_dir()), "tracks": tracks}


class Patch(BaseModel):
    title: str | None = None
    favorite: bool | None = None
    notes: str | None = None


@router.patch("/{track_id}")
async def patch_track(track_id: str, body: Patch):
    entry = library.update_track(track_id, {k: v for k, v in body.model_dump().items() if v is not None})
    if not entry:
        raise HTTPException(404, "Unknown track")
    return entry


@router.delete("/{track_id}")
async def delete_track(track_id: str, delete_file: bool = True):
    if not library.remove_track(track_id, delete_file):
        raise HTTPException(404, "Unknown track")
    return {"removed": track_id}


class ImportReq(BaseModel):
    path: str
    title: str = ""
    source: str = "import"          # import | stem | master
    prompt: str = ""


@router.post("/import")
async def import_track(req: ImportReq):
    try:
        return await asyncio.to_thread(
            library.add_track, req.path, {"title": req.title, "source": req.source, "prompt": req.prompt}
        )
    except FileNotFoundError:
        raise HTTPException(400, f"File not found: {req.path}")
