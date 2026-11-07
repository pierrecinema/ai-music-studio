"""Sample folders (for example the Ableton Live library) and a quick search over their audio files.

Nothing is copied: the folders stay where they are; the app only remembers them and lists what is inside.
The tempo of a loop is guessed from its name ("Drums 128 bpm.wav", a folder called "120 BPM") and can be
measured on demand with a beat tracker.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path

from services.library import library_dir

AUDIO_EXTS = {".wav", ".aif", ".aiff", ".flac", ".mp3", ".ogg", ".m4a", ".opus"}
_lock = threading.Lock()
_cache: dict[str, tuple[float, list[dict]]] = {}
CACHE_SECONDS = 60


def _config_path() -> Path:
    return library_dir() / "samples.json"


def folders() -> list[str]:
    p = _config_path()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return [f for f in data.get("folders", []) if isinstance(f, str)]
    except Exception:
        return []


def _save(items: list[str]) -> None:
    p = _config_path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"folders": items}, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def add_folder(path: str) -> list[str]:
    p = Path(path)
    if not p.is_dir():
        raise ValueError(f"Not a folder: {path}")
    with _lock:
        items = folders()
        norm = str(p.resolve())
        if norm not in items:
            items.append(norm)
            _save(items)
        _cache.pop(norm, None)
    return folders()


def remove_folder(path: str) -> list[str]:
    with _lock:
        items = [f for f in folders() if f != path]
        _save(items)
        _cache.pop(path, None)
    return items


def ableton_candidates() -> list[str]:
    """Places where Ableton Live keeps samples on Windows. Only folders that really exist are returned."""
    pd = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    home = Path.home()
    local = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
    roots = []
    ab = Path(pd) / "Ableton"
    if ab.is_dir():
        for live in sorted(ab.iterdir()):                          # e.g. "Live 12 Suite"
            roots.append(live / "Resources" / "Core Library" / "Samples")
    roots += [
        home / "Documents" / "Ableton" / "User Library" / "Samples",
        home / "Documents" / "Ableton" / "Factory Packs",
        home / "Music" / "Ableton" / "User Library" / "Samples",
        Path(local) / "Ableton" / "Live Reports",                  # not samples, filtered out below
    ]
    out: list[str] = []
    for r in roots:
        if r.is_dir() and "Reports" not in r.name and str(r) not in out:
            out.append(str(r))
    return out


_BPM_PATTERNS = [
    re.compile(r"(?<!\d)(\d{2,3})(?:[.,]\d+)?\s*[-_ ]?bpm", re.I),
    re.compile(r"bpm\s*[-_ ]?(\d{2,3})(?!\d)", re.I),
]


def guess_bpm(path: str) -> float | None:
    """Tempo from the file name or from the names of the folders above it."""
    parts = [Path(path).stem] + [p for p in Path(path).parent.parts[-3:][::-1]]
    for text in parts:
        for rx in _BPM_PATTERNS:
            m = rx.search(text)
            if m:
                bpm = float(m.group(1))
                if 50 <= bpm <= 220:
                    return bpm
    return None


def _scan(folder: str) -> list[dict]:
    now = time.time()
    hit = _cache.get(folder)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    items: list[dict] = []
    root = Path(folder)
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if Path(f).suffix.lower() in AUDIO_EXTS and not f.startswith("."):
                full = os.path.join(dirpath, f)
                try:
                    size = os.path.getsize(full)
                except OSError:
                    continue
                items.append({
                    "path": full,
                    "name": Path(f).stem,
                    "folder": str(Path(dirpath).relative_to(root)).replace("\\", "/") if dirpath != str(root) else "",
                    "root": folder,
                    "size": size,
                    "bpm": guess_bpm(full),
                })
    items.sort(key=lambda e: (e["folder"].lower(), e["name"].lower()))
    _cache[folder] = (now, items)
    return items


def search(query: str = "", root: str | None = None, bpm: float | None = None, limit: int = 300) -> dict:
    roots = [root] if root else folders()
    total, found = 0, []
    words = [w for w in query.lower().split() if w]
    for r in roots:
        if not os.path.isdir(r):
            continue
        for e in _scan(r):
            total += 1
            hay = f"{e['folder']} {e['name']}".lower()
            if words and not all(w in hay for w in words):
                continue
            if bpm and (not e["bpm"] or abs(e["bpm"] - bpm) > 3):
                continue
            found.append(e)
    return {"total": total, "count": len(found), "items": found[:limit]}


def analyze(path: str) -> dict:
    """Measure tempo and the time of the first beat (first 90 seconds).

    A beat tracker alone is only good to a few percent, which is audible when a loop is stretched. So the
    beat times are fitted with a straight line (beat k happens at a + k * interval); outliers are dropped,
    the slope gives the tempo and the intercept the phase. Near-whole tempos snap to the whole number,
    because loops and songs are almost always made at those.
    """
    import numpy as np
    import librosa
    hop = 256
    y, sr = librosa.load(path, sr=22050, mono=True, duration=90)
    total = None
    try:
        import soundfile as sf
        i = sf.info(path)
        total = round(i.frames / float(i.samplerate), 2)
    except Exception:
        pass
    if len(y) < sr:                                                  # under a second: a one-shot, no tempo
        return {"bpm": None, "first_beat": None, "duration": round(len(y) / sr, 2), "note": "Too short to have a tempo (a one-shot)."}
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units="frames")
    times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    guess = float(np.atleast_1d(tempo)[0])
    if len(times) < 3 or guess <= 0:
        return {"bpm": None, "first_beat": None, "duration": total, "note": "No clear beat found (no steady rhythm)."}
    bpm, phase, interval = guess, float(times[0]), 60.0 / guess
    if len(times) >= 6:
        k = np.arange(len(times))
        slope, icpt = np.polyfit(k, times, 1)
        res = times - (icpt + slope * k)
        keep = np.abs(res) < max(0.03, 2 * float(np.std(res)))
        if keep.sum() >= 5:
            slope, icpt = np.polyfit(k[keep], times[keep], 1)
        if slope > 0 and abs(60.0 / slope - guess) / guess < 0.08:
            bpm, interval, phase = 60.0 / slope, float(slope), float(icpt)
    while bpm < 70:
        bpm, interval = bpm * 2, interval / 2
    while bpm > 180:
        bpm, interval = bpm / 2, interval * 2
    if abs(bpm - round(bpm)) < 0.35:
        bpm = float(round(bpm))
        interval = 60.0 / bpm
    first = phase % interval if phase < 0 or phase > interval else phase      # the first beat inside the file
    # snap the phase to the nearest real onset (within 60 ms): the line fit is smoother, the onset is exact
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", backtrack=True)
    if len(onsets):
        near = onsets[np.argmin(np.abs(onsets - first))]
        if abs(near - first) < 0.06:
            first = float(near)
    return {
        "bpm": round(bpm, 2), "first_beat": round(max(0.0, first), 3), "beats": int(len(times)),
        "alternatives": [round(bpm / 2, 2), round(bpm * 2, 2)], "duration": total,
    }
