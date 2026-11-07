"""The library: every generated (or imported) track is kept here for good.

Generated files used to live in the temporary folder and disappeared. Now each track is copied into the
library folder and described in library.json (title, prompt, engine, seed, length, date, favourite ...).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

_lock = threading.Lock()


def library_dir() -> Path:
    env = os.environ.get("AMS_LIBRARY_DIR")
    base = Path(env) if env else Path.home() / "Music" / "AI Music Studio"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _index_path() -> Path:
    return library_dir() / "library.json"


def _read() -> list[dict]:
    p = _index_path()
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        # a damaged index must not lose the tracks: keep a copy and start from the files on disk
        try:
            shutil.copyfile(p, p.with_suffix(f".broken-{int(time.time())}.json"))
        except OSError:
            pass
        return []


def _write(items: list[dict]) -> None:
    p = _index_path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def _slug(s: str, fallback: str = "track") -> str:
    s = re.sub(r"[^\w\- ]+", "", s, flags=re.UNICODE).strip().replace(" ", "-")
    return (s[:48] or fallback).strip("-") or fallback


def _duration(path: Path) -> float | None:
    try:
        import soundfile as sf
        i = sf.info(str(path))
        return round(i.frames / float(i.samplerate), 2)
    except Exception:
        pass
    try:
        from mutagen import File
        f = File(str(path))
        return round(float(f.info.length), 2) if f and f.info else None
    except Exception:
        return None


def add_track(src: str, meta: dict) -> dict:
    """Copy `src` into the library and record it. Returns the entry (with an absolute `path`)."""
    srcp = Path(src)
    if not srcp.exists():
        raise FileNotFoundError(src)
    tid = uuid.uuid4().hex[:10]
    month = time.strftime("%Y-%m")
    title = (meta.get("title") or "").strip() or (meta.get("prompt") or "").split(",")[0].strip()[:60] or "Untitled"
    folder = library_dir() / month
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{_slug(title)}-{tid}{srcp.suffix.lower()}"
    shutil.copy2(srcp, dest)
    entry = {
        "id": tid,
        "title": title,
        "file": str(dest.relative_to(library_dir())).replace("\\", "/"),
        "created": time.time(),
        "duration": _duration(dest) or meta.get("duration"),
        "engine": meta.get("engine", ""),
        "source": meta.get("source", "generated"),      # generated | import | stem | master
        "prompt": meta.get("prompt", ""),
        "lyrics": meta.get("lyrics", ""),
        "seed": meta.get("seed"),
        "favorite": False,
        "notes": "",
    }
    with _lock:
        items = _read()
        items.append(entry)
        _write(items)
    return _public(entry)


def _public(e: dict) -> dict:
    d = dict(e)
    d["path"] = str(library_dir() / e["file"])
    d["exists"] = os.path.exists(d["path"])
    return d


def list_tracks() -> list[dict]:
    with _lock:
        items = _read()
    return [_public(e) for e in sorted(items, key=lambda e: e.get("created", 0), reverse=True)]


def update_track(tid: str, patch: dict) -> dict | None:
    allowed = {k: v for k, v in patch.items() if k in ("title", "favorite", "notes")}
    with _lock:
        items = _read()
        for e in items:
            if e["id"] == tid:
                e.update(allowed)
                _write(items)
                return _public(e)
    return None


def remove_track(tid: str, delete_file: bool = True) -> bool:
    with _lock:
        items = _read()
        keep = [e for e in items if e["id"] != tid]
        if len(keep) == len(items):
            return False
        if delete_file:
            gone = next(e for e in items if e["id"] == tid)
            try:
                (library_dir() / gone["file"]).unlink()
            except OSError:
                pass
        _write(keep)
    return True
