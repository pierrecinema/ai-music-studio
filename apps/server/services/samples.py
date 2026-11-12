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
    """Measure tempo, first beat and first downbeat (beat 1 of a bar), like a DJ program builds a beat grid.

    1. Tempo: the beat tracker's beats are fitted with a straight line (beat k at a + k * interval, outliers
       dropped) over up to four minutes; near-whole tempos snap to the whole number (Mixxx does the same: most
       music is made at whole BPM, and a fitted 123.96 drifts audibly against a 124 grid within a minute).
    2. Phase: with the tempo fixed, the grid is laid over the strong onsets of the whole analysed part (a weighted
       circular mean of their positions within a beat), so one early or late hit cannot shift it. Onsets are
       taken at their peak, not backtracked to the quiet before them (that put the grid a few ms early).
    3. Downbeat: of the four beats of a bar, the one with the most low-end (kick, bass) attack is beat 1.
    """
    import numpy as np
    import librosa
    hop = 256
    y, sr = librosa.load(path, sr=22050, mono=True, duration=240)
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
    bpm = guess
    if len(times) >= 6:
        k = np.arange(len(times))
        slope, icpt = np.polyfit(k, times, 1)
        res = times - (icpt + slope * k)
        keep = np.abs(res) < max(0.03, 2 * float(np.std(res)))
        if keep.sum() >= 5:
            slope, icpt = np.polyfit(k[keep], times[keep], 1)
        if slope > 0 and abs(60.0 / slope - guess) / guess < 0.08:
            bpm = 60.0 / slope
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    # fine-tune: the tempo at which the onset energy lines up best on one phase (comb over the whole analysed
    # part). The tracker's beats are only good to about half a percent, which drifts by a beat within minutes.
    ft = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=hop)
    e = np.maximum(env - np.median(env), 0)
    best, best_r = bpm, -1.0
    for cand in np.arange(bpm * 0.985, bpm * 1.015, 0.01):
        r = abs(np.sum(e * np.exp(2j * np.pi * ft * cand / 60.0)))
        if r > best_r:
            best, best_r = float(cand), r
    bpm = best
    # the attacks (kick, bass) the grid has to hit: onset peaks of the low end, else of the whole signal
    try:
        low = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, fmax=160, n_mels=32)
    except Exception:  # noqa: BLE001
        low = env
    hits = librosa.frames_to_time(librosa.onset.onset_detect(onset_envelope=low, sr=sr, hop_length=hop, units="frames", backtrack=False), sr=sr, hop_length=hop)
    if len(hits) < 16:
        hits = librosa.frames_to_time(librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames", backtrack=False), sr=sr, hop_length=hop)

    def grid_error(b: float) -> float:
        """Median distance (s) of the attacks near a grid at tempo b, with the phase that fits them best."""
        iv = 60.0 / b
        if len(hits) < 8:
            return 0.0
        z = np.sum(np.exp(2j * np.pi * (hits % iv) / iv))
        ph = (np.angle(z) % (2 * np.pi)) / (2 * np.pi) * iv
        d = np.abs((hits - ph + iv / 2) % iv - iv / 2)
        near = d[d < iv / 6]                                      # off-beat hits (hats, snares on 2 and 4) left out
        return float(np.median(near)) if len(near) >= 8 else 0.0

    # round tempo (like Mixxx and opendj): most music is made at a whole or half BPM, and a fit a few hundredths off
    # drifts across a long song. But only when the attacks sit on the round grid as well as on the fitted one
    # (within 3 ms): a song really at 124.07 stays at 124.07 (rounded to 124 it was 50 ms off after 3 minutes).
    fitted_err = grid_error(bpm)
    for step in (1.0, 0.5):
        r = round(bpm / step) * step
        if abs(r - bpm) <= 0.1 and grid_error(r) <= fitted_err + 0.003:
            bpm = float(r)
            break
    interval = 60.0 / bpm

    # phase: where the tracker's beats sit within the beat (circular mean), so hi-hats on the off-beats cannot
    # pull the grid half a beat away; then refined by the strong onset peaks (not backtracked) near that phase
    def circ(t: np.ndarray, w: np.ndarray) -> float | None:
        z = np.sum(w * np.exp(2j * np.pi * (t % interval) / interval))
        return float((np.angle(z) % (2 * np.pi)) / (2 * np.pi) * interval) if abs(z) > 1e-9 else None
    phase = circ(times, np.ones(len(times))) or float(times[0] % interval)
    # beat trackers often lock onto loud off-beat hi-hats: the beat is where the low end (kick, bass) hits
    def low_at(ph: float) -> float:
        grid = ph + np.arange(int((len(y) / sr - ph) / interval)) * interval
        idx = np.clip(librosa.time_to_frames(grid, sr=sr, hop_length=hop), 0, len(low) - 1)
        return float(np.mean([low[max(0, j - 2):j + 3].max() for j in idx])) if len(idx) else 0.0

    if low_at((phase + interval / 2) % interval) > 1.25 * low_at(phase):
        phase = (phase + interval / 2) % interval
    peaks = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames", backtrack=False)
    if len(peaks) >= 4:
        pt = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        d = (pt - phase + interval / 2) % interval - interval / 2       # signed distance to the nearest grid line
        near = np.abs(d) < interval / 6
        if near.sum() >= 4:
            w = env[peaks][near]
            phase = (phase + float(np.sum(w * d[near]) / np.sum(w))) % interval
    # an onset-strength peak comes one analysis frame after the attack itself (measured on test tracks: 12.8 ms
    # late at hop 256): move the grid back by that frame
    phase = (phase - hop / sr) % interval
    first = phase                                                    # the first beat inside the file

    # downbeat: the beat of the bar with the most low-end attack
    downbeat = first
    try:
        n_beats = int((len(y) / sr - first) / interval)
        if n_beats >= 8:
            grid = first + np.arange(n_beats) * interval
            idx = np.clip(librosa.time_to_frames(grid, sr=sr, hop_length=hop), 0, len(low) - 1)
            strength = np.array([low[max(0, j - 2):j + 3].max() for j in idx])
            score = [strength[b::4].mean() for b in range(4)]
            downbeat = first + int(np.argmax(score)) * interval
    except Exception:  # noqa: BLE001 - no downbeat: beat 1 is the first beat
        downbeat = first

    # steady or not (opendj marks such grids "unsure"): live playing whose tempo moves cannot sit on one grid,
    # and a synced copy of it drifts in and out. Measured as the attacks' distance from the final grid.
    steady = True
    try:
        pk = librosa.onset.onset_detect(onset_envelope=low, sr=sr, hop_length=hop, units="frames", backtrack=False)
        if len(pk) >= 24:
            w = low[pk]
            ht = librosa.frames_to_time(pk, sr=sr, hop_length=hop)[w > np.percentile(w, 60)]   # the strong hits only
            sd = (ht - first + interval / 2) % interval - interval / 2                               # signed, seconds
            on = np.abs(sd) < 0.06
            # the grid drifts away from the beats somewhere (compare the thirds of the song), or most strong hits
            # are nowhere near it
            thirds = [sd[on & (ht >= a * ht.max()) & (ht < b * ht.max())] for a, b in ((0, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 1.01))]
            meds = [float(np.median(x)) for x in thirds if len(x) >= 6]
            if (len(meds) >= 2 and max(meds) - min(meds) > 0.02) or float(np.mean(np.abs(sd) < 0.03)) < 0.5:
                steady = False
    except Exception:  # noqa: BLE001 - no verdict: treat as steady
        steady = True

    bpm, first, downbeat = float(bpm), float(first), float(downbeat)
    return {
        "steady": steady,
        **({} if steady else {"note": "The tempo of this song is not steady (live playing?): one grid cannot follow it everywhere. Check by ear; warp markers can pin the beats that drift."}),
        "bpm": round(bpm, 2), "first_beat": round(max(0.0, first), 4), "downbeat": round(max(0.0, downbeat), 4),
        "beats": int(len(times)), "alternatives": [round(bpm / 2, 2), round(bpm * 2, 2)], "duration": total,
    }


def stretch(path: str, ratio: float) -> str:
    """The file made `ratio` times as long without changing its pitch (ratio = source BPM / project BPM), as a
    32-bit float WAV in a cache folder. For songs too long for the Studio's own stretcher (over 90 s): before,
    they played at their own tempo next to a synced grid and drifted. Same file and ratio: the cached copy."""
    import hashlib
    import tempfile
    import numpy as np
    import soundfile as sf
    import librosa
    if not (0.25 < ratio < 4):
        raise ValueError("The tempo difference is too large to sync.")
    st = os.stat(path)
    key = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_mtime_ns}|{st.st_size}|{ratio:.6f}".encode()).hexdigest()[:20]
    folder = os.path.join(tempfile.gettempdir(), "ams_stretch")
    os.makedirs(folder, exist_ok=True)
    out = os.path.join(folder, f"{key}.wav")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    data, sr = sf.read(path, dtype="float32", always_2d=True)          # (samples, channels)
    rate = 1.0 / ratio                                                 # librosa: >1 plays faster
    chans = [librosa.effects.time_stretch(np.ascontiguousarray(data[:, c]), rate=rate, n_fft=4096, hop_length=1024)
             for c in range(data.shape[1])]
    n = min(len(c) for c in chans)
    y = np.stack([c[:n] for c in chans], axis=1)
    target = int(round(len(data) * ratio))                             # exact length: the grid stays exact
    if n < target:
        y = np.pad(y, ((0, target - n), (0, 0)))
    tmp = out + ".part.wav"
    sf.write(tmp, y[:target], sr, subtype="FLOAT")
    os.replace(tmp, out)
    return out
