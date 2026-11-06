"""VST plugin scanning and management."""
from fastapi import APIRouter
from pydantic import BaseModel
import os, glob

router = APIRouter()

DEFAULT_VST_PATHS = [
    r"C:\Program Files\VSTPlugins",
    r"C:\Program Files\Common Files\VST3",
    r"C:\Program Files\Steinberg\VSTPlugins",
    r"C:\Users\{}\AppData\Local\Programs\VSTPlugins".format(os.environ.get("USERNAME", "")),
]

_scanned_plugins: list[dict] = []


class ScanRequest(BaseModel):
    paths: list[str] = []


@router.post("/scan")
async def scan_vst(req: ScanRequest):
    global _scanned_plugins
    paths = req.paths or DEFAULT_VST_PATHS
    plugins = []

    for base in paths:
        for ext in ("*.vst3", "*.dll"):
            for path in glob.glob(os.path.join(base, "**", ext), recursive=True):
                name = os.path.splitext(os.path.basename(path))[0]
                plugins.append({
                    "id": path,
                    "path": path,
                    "name": name,
                    "vendor": "Unknown",
                    "category": "Effect" if "fx" in name.lower() or "reverb" in name.lower() else "Instrument",
                    "format": "VST3" if path.endswith(".vst3") else "VST2"
                })

    _scanned_plugins = plugins
    return plugins


@router.get("/list")
async def list_vst():
    return _scanned_plugins
