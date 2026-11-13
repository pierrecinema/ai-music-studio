"""Writes a mastered song in the formats the user picks: WAV / AIFF / FLAC / ALAC (16, 24 or 32-bit float), MP3, AAC,
OGG Vorbis and Opus, at the chosen sample rate, with TPDF dither when the bit depth is reduced, and with metadata
(title, artist, album, year, ISRC, comment, cover picture).

The source is the float WAV the app renders through the mastering chain. PCM formats are written with soundfile,
the compressed ones with ffmpeg (from PATH, or the copy that comes with the imageio-ffmpeg package, which is
installed on first use). Tags are written with mutagen afterwards, the same way for every format."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from services.library import resample

# id -> (extension, label)
FORMATS = {
    "wav": ("wav", "WAV"), "aiff": ("aiff", "AIFF"), "flac": ("flac", "FLAC"), "alac": ("m4a", "ALAC (Apple Lossless)"),
    "mp3": ("mp3", "MP3"), "aac": ("m4a", "AAC"), "ogg": ("ogg", "OGG Vorbis"), "opus": ("opus", "Opus"),
}
LOSSY = {"mp3", "aac", "ogg", "opus"}


def ffmpeg_exe(install: bool = True) -> str | None:
    """ffmpeg from PATH, else the one of imageio-ffmpeg (installed once into the backend's Python if missing)."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        pass
    if not install:
        return None
    r = subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "imageio-ffmpeg"],
                       capture_output=True, text=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0:
        return None
    try:
        import importlib
        importlib.invalidate_caches()
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def safe_name(name: str) -> str:
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", name or "master")
    return re.sub(r"\s+", " ", base).strip(" .")[:120] or "master"


def unique(path: Path) -> Path:
    n, p = 2, path
    while p.exists():
        p = path.with_name(f"{path.stem} ({n}){path.suffix}")
        n += 1
    return p


def quantize(data: np.ndarray, bits: int, dither: bool) -> np.ndarray:
    """Float audio for a bit depth: TPDF dither of 1 LSB (when asked), then rounded to the grid of that depth."""
    if bits >= 32:
        return data.astype(np.float32)
    lsb = 1.0 / (2 ** (bits - 1))
    out = data.astype(np.float64)
    if dither:
        rng = np.random.default_rng()
        out = out + (rng.random(out.shape) - rng.random(out.shape)) * lsb
    out = np.round(out / lsb) * lsb
    return np.clip(out, -1.0, 1.0 - lsb).astype(np.float32)


def write_one(data: np.ndarray, sr: int, out: dict, dest: Path, dither: bool) -> None:
    import soundfile as sf
    fmt = out["format"]
    rate = int(out.get("sampleRate") or sr)
    if fmt == "opus":
        rate = 48000                                      # Opus always runs at 48 kHz
    bits = int(out.get("bits") or 24)
    audio = resample(data, sr, rate) if rate != sr else data
    if fmt in ("wav", "aiff", "flac"):
        if fmt == "flac" and bits > 24:
            bits = 24
        subtype = {16: "PCM_16", 24: "PCM_24", 32: "FLOAT"}[bits if bits in (16, 24, 32) else 24]
        sf.write(str(dest), quantize(audio, bits, dither), rate, format={"wav": "WAV", "aiff": "AIFF", "flac": "FLAC"}[fmt],
                 subtype=subtype)
        return
    ff = ffmpeg_exe()
    if not ff:
        raise RuntimeError("This format needs ffmpeg, which could not be found or installed. Choose WAV, AIFF or FLAC, "
                           "or install ffmpeg.")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.wav"
        if fmt == "alac":
            b = 16 if bits == 16 else 24
            sf.write(str(src), quantize(audio, b, dither), rate, subtype="PCM_16" if b == 16 else "PCM_24")
            codec = ["-c:a", "alac", "-sample_fmt", "s16p" if b == 16 else "s32p"]
        else:
            sf.write(str(src), audio.astype(np.float32), rate, subtype="FLOAT")   # the encoder gets full resolution
            kbps = int(out.get("kbps") or 320)
            vbr = bool(out.get("vbr"))
            if fmt == "mp3":
                codec = ["-c:a", "libmp3lame"] + (["-q:a", "0"] if vbr else ["-b:a", f"{kbps}k"])
            elif fmt == "aac":
                codec = ["-c:a", "aac", "-b:a", f"{min(kbps, 320)}k"]
            elif fmt == "ogg":
                codec = ["-c:a", "libvorbis"] + (["-q:a", "8"] if vbr else ["-b:a", f"{kbps}k"])
            else:
                codec = ["-c:a", "libopus", "-b:a", f"{min(kbps, 256)}k"]
        r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(src), "-vn", *codec, str(dest)],
                           capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {(r.stderr or '')[-240:]}")


def tag(path: Path, fmt: str, meta: dict, cover: str | None) -> None:
    """Title, artist, album, year, ISRC, comment and the cover picture, in each format's own way."""
    meta = {k: str(v).strip() for k, v in (meta or {}).items() if v is not None and str(v).strip()}
    pic = Path(cover).read_bytes() if cover and Path(cover).exists() else None
    mime = "image/png" if cover and cover.lower().endswith(".png") else "image/jpeg"
    if not meta and not pic:
        return
    if fmt in ("mp3", "wav", "aiff"):
        from mutagen.id3 import APIC, COMM, ID3, TALB, TDRC, TIT2, TPE1, TSRC
        if fmt == "mp3":
            try:
                tags = ID3(str(path))
            except Exception:  # noqa: BLE001
                tags = ID3()
        else:
            from mutagen.aiff import AIFF
            from mutagen.wave import WAVE
            f = (WAVE if fmt == "wav" else AIFF)(str(path))
            if f.tags is None:
                f.add_tags()
            tags = f.tags
        for key, frame in (("title", TIT2), ("artist", TPE1), ("album", TALB), ("year", TDRC), ("isrc", TSRC)):
            if key in meta:
                tags.add(frame(encoding=3, text=meta[key]))
        if "comment" in meta:
            tags.add(COMM(encoding=3, lang="eng", desc="", text=meta["comment"]))
        if pic:
            tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover", data=pic))
        if fmt == "mp3":
            tags.save(str(path))
        else:
            f.save()
    elif fmt == "flac" or fmt in ("ogg", "opus"):
        from mutagen.flac import FLAC, Picture
        if fmt == "flac":
            f = FLAC(str(path))
        elif fmt == "ogg":
            from mutagen.oggvorbis import OggVorbis
            f = OggVorbis(str(path))
        else:
            from mutagen.oggopus import OggOpus
            f = OggOpus(str(path))
        names = {"title": "TITLE", "artist": "ARTIST", "album": "ALBUM", "year": "DATE", "isrc": "ISRC", "comment": "COMMENT"}
        for k, v in meta.items():
            if k in names:
                f[names[k]] = v
        if pic:
            p = Picture()
            p.type, p.mime, p.desc, p.data = 3, mime, "Cover", pic
            if fmt == "flac":
                f.add_picture(p)
            else:
                import base64
                f["METADATA_BLOCK_PICTURE"] = [base64.b64encode(p.write()).decode("ascii")]
        f.save()
    elif fmt in ("aac", "alac"):
        from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm
        f = MP4(str(path))
        names = {"title": "\xa9nam", "artist": "\xa9ART", "album": "\xa9alb", "year": "\xa9day", "comment": "\xa9cmt"}
        for k, v in meta.items():
            if k in names:
                f[names[k]] = [v]
        if "isrc" in meta:
            f["----:com.apple.iTunes:ISRC"] = [MP4FreeForm(meta["isrc"].encode("utf-8"))]
        if pic:
            f["covr"] = [MP4Cover(pic, imageformat=MP4Cover.FORMAT_PNG if mime == "image/png" else MP4Cover.FORMAT_JPEG)]
        f.save()


def export(source: str, folder: str, name: str, outputs: list[dict], dither: bool = True,
           meta: dict | None = None, cover: str | None = None) -> list[dict]:
    """Writes every requested output; returns [{format, path}] or [{format, error}] per output."""
    import soundfile as sf
    data, sr = sf.read(source, dtype="float32", always_2d=True)
    dest_dir = Path(folder)
    dest_dir.mkdir(parents=True, exist_ok=True)
    results = []
    exts = [FORMATS[o["format"]][0] for o in outputs if o.get("format") in FORMATS]
    for out in outputs:
        fmt = out.get("format")
        if fmt not in FORMATS:
            results.append({"format": fmt, "error": f"Unknown format: {fmt}"})
            continue
        ext = FORMATS[fmt][0]
        suffix = ""
        if exts.count(ext) > 1 or out.get("suffix"):        # two files would get the same name
            suffix = " " + (out.get("suffix") or (f"{fmt.upper()} {out.get('bits') or ''}".strip()))
        dest = unique(dest_dir / f"{safe_name(name)}{suffix}.{ext}")
        try:
            write_one(data, sr, out, dest, dither)
            try:
                tag(dest, fmt, meta or {}, cover)
            except Exception as e:  # noqa: BLE001 - the audio is fine; say that the tags are missing
                results.append({"format": fmt, "path": str(dest), "warning": f"tags not written: {e}"})
                continue
            results.append({"format": fmt, "path": str(dest)})
        except Exception as e:  # noqa: BLE001
            if dest.exists() and dest.stat().st_size == 0:
                os.unlink(dest)
            results.append({"format": fmt, "error": str(e)})
    return results
