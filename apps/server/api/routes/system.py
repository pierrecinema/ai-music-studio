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
