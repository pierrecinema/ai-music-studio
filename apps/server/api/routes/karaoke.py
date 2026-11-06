"""Word-level lyric timing, enhanced LRC and karaoke video export."""
import os
import shutil
import subprocess
import tempfile
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.hardware_detect import get_profile
from services.resource_profile import resources

router = APIRouter()

ASPECTS = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (1080, 1080)}


class Word(BaseModel):
    text: str
    start: float
    end: float


class AlignRequest(BaseModel):
    audioPath: str
    language: str | None = None
    model: str | None = None


class LrcRequest(BaseModel):
    words: list[Word]
    title: str = ""


class VideoRequest(BaseModel):
    audioPath: str
    words: list[Word]
    aspect: str = "16:9"
    title: str = ""
    background: str = "#0f0f0f"
    highlight: str = "#a855f7"


def _ts(sec: float) -> str:
    m, s = divmod(max(sec, 0.0), 60)
    return f"{int(m):02d}:{s:05.2f}"


def _lines(words: list[Word], gap: float = 1.2, max_words: int = 8) -> list[list[Word]]:
    lines: list[list[Word]] = []
    cur: list[Word] = []
    for w in words:
        if cur and (w.start - cur[-1].end > gap or len(cur) >= max_words):
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def build_enhanced_lrc(words: list[Word], title: str = "") -> str:
    out = [f"[ti:{title}]"] if title else []
    for line in _lines(words):
        body = " ".join(f"<{_ts(w.start)}>{w.text}" for w in line)
        out.append(f"[{_ts(line[0].start)}]{body} <{_ts(line[-1].end)}>")
    return "\n".join(out) + "\n"


def _ass_time(sec: float) -> str:
    h, rem = divmod(max(sec, 0.0), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _ass_color(hex_rgb: str) -> str:
    h = hex_rgb.lstrip("#")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}"


def build_ass(words: list[Word], w: int, h: int, highlight: str) -> str:
    size = max(36, h // 14)
    head = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {w}\nPlayResY: {h}\n\n"
        "[V4+ Styles]\n"
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding\n"
        f"Style: K,Arial,{size},{_ass_color(highlight)},&H00FFFFFF,&H00000000,&H64000000,"
        "1,0,0,0,100,100,0,0,1,2,1,2,40,40,{mv},1\n\n"
        "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n"
    ).replace("{mv}", str(h // 8))
    events = []
    for line in _lines(words):
        start, end = line[0].start, line[-1].end + 0.4
        parts = []
        for i, wd in enumerate(line):
            nxt = line[i + 1].start if i + 1 < len(line) else wd.end
            cs = max(1, int(round((nxt - wd.start) * 100)))
            parts.append(f"{{\\k{cs}}}{wd.text} ")
        events.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},K,,0,0,0,,{''.join(parts)}")
    return head + "\n".join(events) + "\n"


@router.post("/align")
async def align(req: AlignRequest):
    if not os.path.exists(req.audioPath):
        raise HTTPException(400, f"File not found: {req.audioPath}")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise HTTPException(501, "faster-whisper is not installed. Run: pip install faster-whisper")

    res = resources()
    hw = get_profile()
    size = req.model or ("small" if res.low_memory else "medium")
    use_cuda = hw.torch_device == "cuda"
    model = WhisperModel(
        size,
        device="cuda" if use_cuda else "cpu",
        compute_type="int8_float16" if use_cuda else "int8",
    )
    segments, info = model.transcribe(req.audioPath, word_timestamps=True, language=req.language)
    words = [
        {"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for seg in segments for w in (seg.words or []) if w.word.strip()
    ]
    return {"language": info.language, "words": words}


@router.post("/lrc")
async def lrc(req: LrcRequest):
    if not req.words:
        raise HTTPException(400, "No words given")
    out_dir = os.path.join(tempfile.gettempdir(), "ams_karaoke")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"lyrics_{uuid.uuid4().hex[:8]}.lrc")
    text = build_enhanced_lrc(req.words, req.title)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return {"lrcFile": path, "lrc": text}


@router.post("/video")
async def video(req: VideoRequest):
    if req.aspect not in ASPECTS:
        raise HTTPException(400, f"aspect must be one of {list(ASPECTS)}")
    if not os.path.exists(req.audioPath):
        raise HTTPException(400, f"File not found: {req.audioPath}")
    if not req.words:
        raise HTTPException(400, "No words given")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise HTTPException(501, "ffmpeg not found on PATH. Install it from ffmpeg.org")

    w, h = ASPECTS[req.aspect]
    work = tempfile.mkdtemp(prefix="ams_kvid_")
    with open(os.path.join(work, "k.ass"), "w", encoding="utf-8") as f:
        f.write(build_ass(req.words, w, h, req.highlight))
    out = os.path.join(work, "karaoke.mp4")
    duration = max(wd.end for wd in req.words) + 2.0
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", f"color=c={req.background}:s={w}x{h}:r=25:d={duration}",
        "-i", req.audioPath,
        "-vf", "ass=k.ass", "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "karaoke.mp4",
    ]
    r = subprocess.run(cmd, cwd=work, capture_output=True, text=True)
    if r.returncode != 0:
        raise HTTPException(500, f"ffmpeg failed: {r.stderr[-400:]}")
    return {"videoFile": out}
