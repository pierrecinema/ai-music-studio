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
    folder = library_dir() / (meta.get("folder") or month)     # stems: "Stems/<song>", everything else by month
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
        "bpm": meta.get("bpm"),                       # measured tempo (None: no steady beat)
        "first_beat": meta.get("first_beat"),         # seconds into the file; 0 = starts on beat 1
        "favorite": False,
        "notes": "",
    }
    tags = clean_tags(meta.get("tags"))
    if tags:                                          # genre, mood or anything the user wants to search for
        entry["tags"] = tags
    for k in ("stem", "stem_set", "song"):            # stems: which part, which split, which song they come from
        if meta.get(k):
            entry[k] = meta[k]
    if meta.get("loop_bars"):                         # a seamless loop of this many bars (Create music → Loop)
        entry["loop_bars"] = meta["loop_bars"]
    if "first_beat" in meta:                          # made since 0.11.0: already cut to beat 1 before saving
        entry["aligned"] = True
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


def clean_tags(tags) -> list[str]:
    """'House, deep , house' -> ['house', 'deep']: lower case, trimmed, no duplicates, at most 20."""
    if isinstance(tags, str):
        tags = tags.split(",")
    out: list[str] = []
    for t in tags or []:
        t = str(t).strip().lower()[:40]
        if t and t not in out:
            out.append(t)
    return out[:20]


def update_track(tid: str, patch: dict) -> dict | None:
    allowed = {k: v for k, v in patch.items() if k in ("title", "favorite", "notes", "tags")}
    if "tags" in allowed:
        allowed["tags"] = clean_tags(allowed["tags"])
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
            for rel in (gone["file"], gone.get("original")):
                if not rel:
                    continue
                try:
                    (library_dir() / rel).unlink()
                except OSError:
                    pass
        _write(keep)
    return True


# ── start on beat 1, afterwards (songs made before 0.11.0) ────────────────────
#
# Songs created since 0.11.0 are cut to their first beat before they are saved. Older songs can be cut here.
# Cutting changes the file, so the untouched original is copied to `originals/` first: "Restore original"
# brings it back. A song whose lead-in is longer than a few seconds (a real intro) is left as it is.

def _originals_dir() -> Path:
    d = library_dir() / "originals"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _decode_to_wav(src: Path, dest: Path) -> None:
    """Write `src` as a WAV file (soundfile first, ffmpeg for formats it cannot read)."""
    try:
        import soundfile as sf
        data, sr = sf.read(str(src), dtype="float32", always_2d=False)
        sf.write(str(dest), data, sr, subtype="PCM_16", format="WAV")
        return
    except Exception:
        pass
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError(f"Cannot read {src.suffix} files without ffmpeg.")
    import subprocess
    r = subprocess.run([ff, "-y", "-v", "error", "-i", str(src), "-c:a", "pcm_s16le", str(dest)], capture_output=True, text=True)
    if r.returncode != 0 or not dest.exists():
        raise RuntimeError((r.stderr or "ffmpeg failed").strip()[:200])


def align_track(tid: str) -> dict:
    """Cut one library song so that it starts on its first beat. Returns {track, trimmed, message}."""
    from services.startalign import align_start
    with _lock:
        entry = next((e for e in _read() if e["id"] == tid), None)
    if not entry:
        raise KeyError(tid)
    src = library_dir() / entry["file"]
    if not src.exists():
        raise FileNotFoundError(str(src))
    if entry.get("aligned"):
        return {"track": _public(entry), "trimmed": 0.0, "message": "Already starts on beat 1."}

    tmp = src.with_name(f".{src.stem}.align.wav")
    _decode_to_wav(src, tmp)
    try:
        info = align_start(str(tmp))
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    cut = float(info.get("trimmed") or 0.0)
    patch: dict = {"bpm": info.get("bpm"), "first_beat": info.get("first_beat"), "aligned": True}
    if cut > 0:
        backup = _originals_dir() / entry["file"]
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(src, backup)                         # the untouched file, for "Restore original"
        target = src if src.suffix.lower() == ".wav" else src.with_suffix(".wav")
        os.replace(tmp, target)
        if target != src:
            src.unlink(missing_ok=True)                       # the original format is kept in originals/
        patch.update({
            "file": str(target.relative_to(library_dir())).replace("\\", "/"),
            "original": str(backup.relative_to(library_dir())).replace("\\", "/"),
            "trimmed": round(cut, 3),
            "duration": _duration(target) or entry.get("duration"),
        })
        message = f"Cut {cut:.2f} s before the first beat. The original is kept and can be restored."
    else:
        tmp.unlink(missing_ok=True)
        first = info.get("first_beat")
        if not info.get("bpm"):
            message = "No steady beat found: the song was left as it is."
        elif first and first > 0:
            message = f"The first beat is at {first:.2f} s (an intro): the song was left as it is."
        else:
            message = "Already starts on beat 1."
    with _lock:
        items = _read()
        for e in items:
            if e["id"] == tid:
                e.update(patch)
                entry = e
        _write(items)
    return {"track": _public(entry), "trimmed": round(cut, 3), "message": message}


def restore_original(tid: str) -> dict:
    """Undo align_track: put the untouched file back."""
    with _lock:
        items = _read()
        entry = next((e for e in items if e["id"] == tid), None)
        if not entry:
            raise KeyError(tid)
        if not entry.get("original"):
            raise ValueError("This song has no saved original.")
        backup = library_dir() / entry["original"]
        if not backup.exists():
            raise FileNotFoundError(str(backup))
        current = library_dir() / entry["file"]
        rel = Path(entry["original"]).relative_to("originals")
        dest = library_dir() / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if current.exists() and current != dest:
            current.unlink()
        os.replace(backup, dest)
        entry["file"] = str(rel).replace("\\", "/")
        entry["duration"] = _duration(dest) or entry.get("duration")
        for k in ("original", "trimmed", "aligned", "first_beat"):
            entry.pop(k, None)
        _write(items)
        return _public(entry)


def align_all() -> dict:
    """Cut every generated song that was not checked yet. Stems and imports are left alone (stems of one song
    must stay in time with each other)."""
    with _lock:
        todo = [e["id"] for e in _read() if e.get("source", "generated") == "generated" and not e.get("aligned")
                and (library_dir() / e["file"]).exists()]
    done, cut, failed = 0, 0, []
    for tid in todo:
        try:
            r = align_track(tid)
            done += 1
            cut += 1 if r["trimmed"] else 0
        except Exception as e:  # noqa: BLE001 - one bad file must not stop the others
            failed.append(f"{tid}: {e}")
    return {"checked": done, "trimmed": cut, "failed": failed}


# ── stems: saved together, in their own folder ────────────────────────────────

def add_stems(stems: dict[str, str], title: str, tags=None, source_path: str | None = None) -> list[dict]:
    """Put the stems of one split into the library (folder "Stems/<title>"), with the song's tempo and tags."""
    set_id = uuid.uuid4().hex[:8]
    title = (title or "").strip() or "Stems"
    bpm = None
    if source_path and os.path.exists(source_path):
        try:
            from services.samples import analyze
            bpm = analyze(source_path).get("bpm")
        except Exception:  # noqa: BLE001 - librosa missing or an odd file: no tempo
            bpm = None
    folder = f"Stems/{_slug(title)}-{set_id}"
    out = []
    for name, path in stems.items():
        if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
            continue
        out.append(add_track(path, {"title": f"{title} – {name}", "source": "stem", "stem": name, "stem_set": set_id,
                                    "song": title, "tags": tags, "bpm": bpm, "folder": folder}))
    return out


# ── export: copies in the format a DAW wants ──────────────────────────────────

EXPORT_FORMATS = {
    "wav16": ("wav", "WAV", "PCM_16"), "wav24": ("wav", "WAV", "PCM_24"), "wav32": ("wav", "WAV", "FLOAT"),
    "aiff": ("aiff", "AIFF", "PCM_24"), "flac": ("flac", "FLAC", "PCM_24"), "mp3": ("mp3", None, None),
}


def export_files(items: list[dict], folder: str, fmt: str) -> list[str]:
    """Write each {path, name} into `folder` as its own file in the chosen format. Returns the written paths."""
    import soundfile as sf
    if fmt not in EXPORT_FORMATS:
        raise ValueError(f"Unknown format: {fmt}")
    ext, sf_format, subtype = EXPORT_FORMATS[fmt]
    dest_dir = Path(folder)
    dest_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for it in items:
        src = Path(it["path"])
        if not src.exists():
            raise FileNotFoundError(str(src))
        if src.stat().st_size == 0:
            raise ValueError(f"{src.name} is empty: the audio was not created. Split or generate it again.")
        base = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", it.get("name") or src.stem)       # Windows file name rules
        base = re.sub(r"\s+", " ", base).strip(" .")[:120] or "audio"
        dest = dest_dir / f"{base}.{ext}"
        n = 2
        while dest.exists():
            dest = dest_dir / f"{base} ({n}).{ext}"
            n += 1
        if fmt == "mp3":
            ffmpeg = shutil.which("ffmpeg")
            if not ffmpeg:
                raise RuntimeError("MP3 needs ffmpeg, which was not found. Choose WAV, AIFF or FLAC, or install ffmpeg.")
            import subprocess
            r = subprocess.run([ffmpeg, "-y", "-i", str(src), "-c:a", "libmp3lame", "-b:a", "320k", str(dest)],
                               capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError(f"ffmpeg failed: {(r.stderr or '')[-200:]}")
        else:
            data, sr = sf.read(str(src), dtype="float32", always_2d=True)
            sf.write(str(dest), data, sr, format=sf_format, subtype=subtype)
        written.append(str(dest))
    return written
