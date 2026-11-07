"""Train your own LoRA: dataset, plan, bundle for another PC, and a runner for this PC."""
import asyncio
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import lora_training as lt
from services.capabilities import FEATURES, detect_machine, evaluate

router = APIRouter()


def _verdict() -> dict:
    import os
    m = detect_machine(os.environ.get("AMS_ACESTEP_DIR"))
    f = next(x for x in FEATURES if x.id == "lora_train")
    return evaluate(f, m)


class ScanReq(BaseModel):
    folder: str


@router.post("/scan")
async def scan(req: ScanReq):
    try:
        items = await asyncio.to_thread(lt.scan_folder, req.folder)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not items:
        raise HTTPException(400, "No audio files found in that folder.")
    return {"items": items}


class Item(BaseModel):
    path: str
    caption: str = ""
    lyrics: str = ""
    seconds: float | None = None


class DatasetReq(BaseModel):
    name: str = "my_lora"
    items: list[Item]
    shared_tags: str = ""


@router.post("/dataset")
async def dataset(req: DatasetReq):
    try:
        return await asyncio.to_thread(lt.build_dataset, req.name, [i.model_dump() for i in req.items], req.shared_tags)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e))


@router.get("/options")
async def options(songs: int = 10):
    verdict = await asyncio.to_thread(_verdict)
    return {
        "verdict": verdict,
        "presets": {k: {"steps": v[0], "text": v[1]} for k, v in lt.PRESETS.items()},
        "ranks": lt.RANKS,
        "plan": lt.make_plan(songs),
    }


class PlanReq(BaseModel):
    name: str
    dataset_dir: str
    songs: int = Field(1, ge=1)
    preset: str = "normal"
    rank: int = 256


@router.post("/export")
async def export(req: PlanReq):
    if not Path(req.dataset_dir).is_dir():
        raise HTTPException(400, "Build the dataset first.")
    plan = lt.make_plan(req.songs, req.preset, req.rank, bf16=True)
    return {**await asyncio.to_thread(lt.export_bundle, req.name, req.dataset_dir, plan), "plan": plan}


def _register(folder: str, name: str) -> dict:
    from api.routes.music_gen import LORA_DIR, _load_index, _save_index
    LORA_DIR.mkdir(parents=True, exist_ok=True)
    dest = LORA_DIR / name
    if dest.exists():
        dest = LORA_DIR / f"{name}_{int(time.time())}"
    shutil.copytree(folder, dest)
    lid = dest.name
    entry = {"id": lid, "name": lid, "kind": "style", "path": str(dest), "tags": [], "default_strength": 1.0,
             "source": "trained here"}
    _save_index([i for i in _load_index() if i["id"] != lid] + [entry])
    return entry


@router.post("/start")
async def start(req: PlanReq):
    import os
    verdict = await asyncio.to_thread(_verdict)
    if verdict["status"] == "unavailable" and not os.environ.get("AMS_TRAIN_SKIP_GATE"):
        raise HTTPException(400, verdict["reason"] + " You can still build a training bundle and train on another computer.")
    if not Path(req.dataset_dir).is_dir():
        raise HTTPException(400, "Build the dataset first.")
    if any(j["status"] == "running" for j in lt.jobs().values()):
        raise HTTPException(400, "A training is already running.")
    plan = lt.make_plan(req.songs, req.preset, req.rank)
    job_id = uuid.uuid4().hex[:10]
    lt.jobs()[job_id] = {"id": job_id, "status": "queued", "created": time.time(), "plan": plan,
                         "stage": "repo", "stage_text": "Starting", "log": [], "slow": verdict["status"] == "slow",
                         "warning": verdict["reason"] if verdict["status"] == "slow" else ""}
    threading.Thread(target=lt.start, args=(job_id, req.name, req.dataset_dir, plan, req.songs, _register), daemon=True).start()
    return {"jobId": job_id}


@router.get("/jobs/{job_id}")
async def job(job_id: str):
    j = lt.get_job(job_id)
    if not j:
        raise HTTPException(404, "Unknown job")
    return j


@router.post("/jobs/{job_id}/stop")
async def stop(job_id: str):
    return {"stopped": lt.stop_job(job_id)}
