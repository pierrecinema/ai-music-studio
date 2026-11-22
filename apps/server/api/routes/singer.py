"""The singer: DiffSinger voicebanks (OpenUtau format) sing a melody with lyrics (services/diffsinger.py).

Voicebanks are not shipped with the app: their authors set the terms. The user downloads one, agrees to its terms
and imports the .zip or folder here. The vocoder they need (NSF-HiFiGAN by OpenVPI, CC BY-NC-SA 4.0, a
non-commercial component) is downloaded once on request.
"""
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

HOME = Path(os.environ.get("AMS_HOME", Path.home() / ".ai-music-studio"))
VOICES = Path(os.environ.get("AMS_VOICEBANKS", HOME / "voicebanks"))
VOCODERS = Path(os.environ.get("AMS_VOCODERS", HOME / "vocoders"))
OUT = HOME / "vocals"

# vocoders the app can download (OpenVPI's DiffSinger community vocoders, as packed for OpenUtau)
VOCODER_SOURCES = {
    "nsf_hifigan_44.1k_hop512_128bin_2024.02": {
        "base": "https://huggingface.co/DanielMarius/dms-nsf-hifigan-44-1k-hop512-128bin-2024-02/resolve/main/",
        "files": {"openutau/nsf_hifigan_44.1k_hop512_128bin_2024.02.onnx": "nsf_hifigan_44.1k_hop512_128bin_2024.02.onnx",
                  "openutau/vocoder.yaml": "vocoder.yaml", "NOTICE.txt": "NOTICE.txt"},
        "aliases": ["nsf_hifigan"],
    },
    "pc_nsf_hifigan_44.1k_hop512_128bin_2025.02": {
        "base": "https://huggingface.co/AEmotionStudio/openvpi-pc-nsf-hifigan-2025-02/resolve/main/",
        "files": {"pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx": "pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx",
                  "vocoder.yaml": "vocoder.yaml", "LICENSE.txt": "LICENSE.txt", "NOTICE.txt": "NOTICE.txt"},
        "aliases": ["pc_nsf_hifigan"],
    },
}
VOCODER_LICENCE = ("NSF-HiFiGAN vocoders by OpenVPI (DiffSinger community), CC BY-NC-SA 4.0: a non-commercial component. "
                   "https://openvpi.github.io/vocoders/")

_jobs: dict[str, dict] = {}
_banks: dict[str, object] = {}
_lock = threading.Lock()


def _env() -> None:
    os.environ["AMS_VOCODERS"] = str(VOCODERS)


def _bank_dirs() -> list[Path]:
    if not VOICES.exists():
        return []
    return sorted(p for p in VOICES.iterdir() if p.is_dir() and (p / "dsconfig.yaml").exists())


def _bank(voice_id: str):
    from services.diffsinger import Voicebank
    p = VOICES / voice_id
    if not (p / "dsconfig.yaml").exists():
        raise HTTPException(404, f"No voice \"{voice_id}\". Import one first.")
    with _lock:
        if voice_id not in _banks:
            _banks[voice_id] = Voicebank(str(p))
        return _banks[voice_id]


def _readme(p: Path) -> str:
    for n in ("readme.txt", "README.txt", "README.md", "readme.md", "terms-of-service.md", "TERMS.txt", "license.txt", "LICENSE.txt"):
        f = p / n
        if f.exists():
            try:
                return f.read_text(encoding="utf-8", errors="ignore")[:4000]
            except OSError:
                pass
    return ""


@router.get("/voices")
async def voices():
    _env()
    from services.diffsinger import find_vocoder
    out = []
    for p in _bank_dirs():
        try:
            b = _bank(p.name)
            d = b.describe()
            voc = find_vocoder(str(d["vocoder"] or "nsf_hifigan"), str(p))
            out.append({"id": p.name, **d, "vocoderInstalled": bool(voc), "readme": _readme(p)})
        except Exception as e:  # noqa: BLE001 - a broken voicebank is listed with its problem
            out.append({"id": p.name, "name": p.name, "error": str(e)})
    OUT.mkdir(parents=True, exist_ok=True)
    return {"voices": out, "folder": str(VOICES), "vocalsFolder": str(OUT), "vocoders": [v for v in VOCODER_SOURCES], "vocoderLicence": VOCODER_LICENCE}


class ImportRequest(BaseModel):
    path: str


@router.post("/voices/import")
async def import_voice(req: ImportRequest):
    """a voicebank (.zip or folder with dsconfig.yaml) or a vocoder (.oudep / .zip / folder with vocoder.yaml)"""
    src = Path(req.path)
    if not src.exists():
        raise HTTPException(400, f"Not found: {src}")
    tmp = Path(tempfile.mkdtemp(prefix="vb_"))
    try:
        if src.is_file():
            if not zipfile.is_zipfile(src):
                raise HTTPException(400, "Give a .zip / .oudep file or a folder of a DiffSinger voicebank.")
            with zipfile.ZipFile(src) as z:
                for m in z.infolist():
                    name = m.filename
                    try:
                        name = m.filename.encode("cp437").decode("utf-8") if not (m.flag_bits & 0x800) else m.filename
                    except (UnicodeEncodeError, UnicodeDecodeError):
                        pass
                    target = (tmp / name).resolve()
                    if not str(target).startswith(str(tmp.resolve())):
                        continue                                   # no paths outside the folder
                    if m.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with z.open(m) as fi, open(target, "wb") as fo:
                            shutil.copyfileobj(fi, fo)
            root = tmp
        else:
            root = src
        def is_bank(r: str, f: list[str]) -> bool:
            if "dsconfig.yaml" not in f:
                return False
            try:
                import yaml
                return bool((yaml.safe_load(open(os.path.join(r, "dsconfig.yaml"), encoding="utf-8-sig")) or {}).get("acoustic"))
            except Exception:  # noqa: BLE001
                return False
        banks = [Path(r) for r, _d, f in os.walk(root) if is_bank(r, f)]
        vocs = [Path(r) for r, _d, f in os.walk(root) if "vocoder.yaml" in f]
        made = []
        for v in vocs:
            dst = VOCODERS / v.name
            VOCODERS.mkdir(parents=True, exist_ok=True)
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(v, dst)
            made.append({"kind": "vocoder", "name": v.name})
        for b in banks:
            name = b.name if b != tmp else src.stem
            dst = VOICES / name
            VOICES.mkdir(parents=True, exist_ok=True)
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(b, dst)
            _banks.pop(name, None)
            made.append({"kind": "voice", "id": name})
        if not made:
            raise HTTPException(400, "No DiffSinger voicebank (dsconfig.yaml + acoustic model) or vocoder found in it.")
        return {"imported": made}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    p = VOICES / voice_id
    if not p.exists() or p.resolve().parent != VOICES.resolve():
        raise HTTPException(404, "No such voice")
    shutil.rmtree(p)
    _banks.pop(voice_id, None)
    return {"deleted": voice_id}


def _download(url: str, dst: Path, job: dict, part: str) -> None:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Music-Studio"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total = int(r.headers.get("Content-Length") or 0)
        got = 0
        tmp = dst.with_suffix(dst.suffix + ".part")
        with open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 16)
                if not b:
                    break
                f.write(b); got += len(b)
                if total:
                    job["progress"] = round(100 * got / total, 1)
                job["text"] = f"Downloading {part}: {got / 1e6:.1f} MB"
        tmp.replace(dst)


class VocoderRequest(BaseModel):
    name: str = "nsf_hifigan_44.1k_hop512_128bin_2024.02"


@router.post("/vocoder/install")
async def install_vocoder(req: VocoderRequest):
    key = next((k for k, v in VOCODER_SOURCES.items() if req.name == k or req.name in v["aliases"]), None)
    if not key:
        raise HTTPException(400, f"Unknown vocoder {req.name}. Known: {', '.join(VOCODER_SOURCES)}")
    src = VOCODER_SOURCES[key]
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0, "text": "Starting", "error": None, "started": time.time()}
    _jobs[jid] = job

    def work():
        try:
            d = VOCODERS / key
            d.mkdir(parents=True, exist_ok=True)
            for remote, local in src["files"].items():
                _download(src["base"] + remote, d / local, job, local)
            job.update(status="done", progress=100, text="Installed")
        except Exception as e:  # noqa: BLE001
            job.update(status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=work, daemon=True).start()
    return {"jobId": jid, "licence": VOCODER_LICENCE}


class LyricsRequest(BaseModel):
    text: str
    count: int
    lang: str = "en"


@router.post("/lyrics")
async def lyrics(req: LyricsRequest):
    """lyrics text -> one entry per note (a word on its first note, '+' on its further syllables)"""
    from services.diffsinger import assign_lyrics
    return {"lyrics": assign_lyrics(req.text, max(0, req.count), req.lang)}


class SingNote(BaseModel):
    pitch: int
    start: float          # seconds
    end: float
    lyric: str = ""


class SingRequest(BaseModel):
    voice: str
    notes: list[SingNote]
    lang: str | None = None
    steps: int = 20
    vibrato: float = 0.25
    speaker: str | None = None
    name: str = "vocals"


@router.post("/render")
async def sing(req: SingRequest):
    _env()
    if not req.notes:
        raise HTTPException(400, "No notes to sing.")
    bank = _bank(req.voice)
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0, "text": "Starting", "error": None, "result": None, "started": time.time()}
    _jobs[jid] = job

    def work():
        import numpy as np
        import soundfile as sf
        from services.diffsinger import render
        try:
            unknown: list[str] = []
            wav, sr = render(bank, [n.model_dump() for n in req.notes], lang=req.lang, steps=max(2, min(100, req.steps)),
                             vibrato=max(0.0, min(1.0, req.vibrato)), speaker=req.speaker, unknown=unknown,
                             report=lambda p, t: job.update(progress=round(p, 1), text=t))
            OUT.mkdir(parents=True, exist_ok=True)
            safe = "".join(c for c in req.name if c.isalnum() or c in " _-").strip() or "vocals"
            path = OUT / f"{safe}-{time.strftime('%Y%m%d-%H%M%S')}.wav"
            sf.write(str(path), wav.astype(np.float32), sr, subtype="PCM_24")
            job.update(status="done", progress=100, text="Done",
                       result={"file": str(path), "seconds": round(len(wav) / sr, 2), "unknown": sorted(set(unknown))})
        except Exception as e:  # noqa: BLE001
            import traceback
            print("[singer] failed: " + traceback.format_exc()[-1500:], flush=True)
            job.update(status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=work, daemon=True).start()
    return {"jobId": jid}


@router.get("/jobs/{jid}")
async def job_status(jid: str):
    job = _jobs.get(jid)
    if not job:
        raise HTTPException(404, "Unknown job")
    return job | {"elapsed": round(time.time() - job["started"], 1)}


# ── the built-in singer (SoulX-Singer with the app's own voices, services/soulx.py) ──────────────────────────────

@router.get("/builtin")
async def builtin():
    from services import soulx
    return {"voices": soulx.voices(), "problem": soulx.worker.available()}


class BuiltinRequest(BaseModel):
    voice: str
    notes: list[SingNote]
    lang: str = "en"
    rap: bool = False
    steps: int = 32
    name: str = "vocals"


@router.post("/builtin/render")
async def builtin_render(req: BuiltinRequest):
    from services import soulx
    problem = soulx.worker.available()
    if problem:
        raise HTTPException(503, problem)
    vdir = soulx.VOICES / req.voice
    if not (vdir / "prompt.json").exists():
        raise HTTPException(404, f"No built-in voice \"{req.voice}\".")
    if not req.notes:
        raise HTTPException(400, "No notes to sing.")
    segs, unknown = soulx.segments([n.model_dump() for n in req.notes], req.lang, rap=req.rap)
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0, "text": "Starting", "error": None, "result": None, "started": time.time()}
    _jobs[jid] = job

    def work():
        try:
            OUT.mkdir(parents=True, exist_ok=True)
            safe = "".join(c for c in req.name if c.isalnum() or c in " _-").strip() or "vocals"
            path = OUT / f"{safe}-{time.strftime('%Y%m%d-%H%M%S')}.wav"
            meta = json.load(open(vdir / "prompt.json", encoding="utf-8"))[0]
            soulx.worker.render(str(vdir / "prompt.wav"), meta, segs, str(path), max(4, min(64, req.steps)),
                                lambda p, t: job.update(progress=round(p, 1), text=t), lambda: bool(job.get("cancel")))
            import soundfile as sf
            secs = sf.info(str(path)).duration
            job.update(status="done", progress=100, text="Done", result={"file": str(path), "seconds": round(secs, 2), "unknown": sorted(set(unknown))})
        except Exception as e:  # noqa: BLE001
            job.update(status="cancelled" if str(e) == "Cancelled" else "error", error=str(e))

    threading.Thread(target=work, daemon=True).start()
    return {"jobId": jid}


@router.post("/jobs/{jid}/cancel")
async def cancel_job(jid: str):
    job = _jobs.get(jid)
    if not job:
        raise HTTPException(404, "Unknown job")
    job["cancel"] = True
    return {"ok": True}
