"""Sing a finished song again with a voice of the Vocal Editor (Create → "Singer from the Vocal Editor").

The music model sings with a voice of its own; it cannot take a given voice. So the finished song is taken apart and
the voice is exchanged:
  1. Demucs separates the vocals from the music,
  2. faster-whisper finds the words and when each one is sung,
  3. pYIN reads the melody of the vocals (20 ms frames, the singer's frame),
  4. the built-in singer (SoulX-Singer) sings the same words on the same melody with the chosen voice,
  5. the new vocals, at the level of the old ones, are mixed with the music again.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import numpy as np

from services import soulx

HOP = soulx.HOP                       # 0.02 s
SR_F0 = 16000                         # pYIN runs at 16 kHz: 320 samples = one 20 ms frame


def midi_of(hz: float) -> float:
    return 69 + 12 * np.log2(hz / 440.0)


def word_notes(words: list[dict], f0: np.ndarray) -> list[dict]:
    """words [{text, start, end}] + the vocals' pitch (Hz per 20 ms frame, 0 = unvoiced) -> notes for the singer:
    one note per word at the median pitch it is sung on. Words without any pitch take the last one."""
    notes, last = [], 60
    for w in words:
        text = str(w.get("text", "")).strip()
        a, b = int(w["start"] / HOP), max(int(w["start"] / HOP) + 1, int(w["end"] / HOP))
        seg = f0[a:b] if a < len(f0) else np.zeros(0)
        voiced = seg[seg > 0]
        pitch = int(round(float(np.median(midi_of(voiced))))) if len(voiced) >= 2 else last
        last = pitch
        if b - a < 2 or not text:
            continue
        notes.append({"pitch": pitch, "start": round(w["start"], 3), "end": round(w["end"], 3), "lyric": text})
    return notes


def real_f0(meta: dict, f0: np.ndarray) -> str:
    """the segment's pitch curve taken from the original vocals: their own slides and vibrato. Inside a sung note an
    unvoiced or octave-jumping frame is replaced by the note; between notes (breaths, <SP>) it is 0."""
    dur = [float(x) for x in meta["duration"].split()]
    pit = [int(x) for x in meta["note_pitch"].split()]
    n = int(round(sum(dur) / HOP))
    s0 = meta["time"][0] / 1000
    base = int(round(s0 / HOP))
    out = np.zeros(n)
    t = 0.0
    for d, p in zip(dur, pit):
        a, b = int(round(t / HOP)), int(round((t + d) / HOP))
        t += d
        if p <= 0 or b <= a:
            continue
        src = f0[base + a: base + b] if base + a < len(f0) else np.zeros(0)
        src = np.pad(src, (0, max(0, (b - a) - len(src))))
        note_hz = 440 * 2 ** ((p - 69) / 12)
        ok = (src > 0) & (np.abs(midi_of(np.maximum(src, 1e-3)) - p) < 7)
        out[a:b] = np.where(ok, src, note_hz)
    return " ".join(f"{x:.1f}" for x in out)


def build_segments(words: list[dict], f0: np.ndarray, lang: str) -> tuple[list[dict], list[str]]:
    """the singer's segments (phrases with phonemes, durations, notes) on the original timing and melody"""
    notes = word_notes(words, f0)
    segs, unknown = soulx.segments(notes, lang, style="ballad")   # ballad: holds notes as sung, fills short gaps
    for meta in segs:
        meta["f0"] = real_f0(meta, f0)
    return segs, unknown


# ── the steps on real audio ────────────────────────────────────────────────────────────────────────────────────

def separate(path: str) -> tuple[np.ndarray, np.ndarray, int]:
    """(vocals, music, sample rate) of a song, both (samples, 2)"""
    import soundfile as sf
    import torch
    import torchaudio
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    from services.resource_profile import resources
    model = get_model("htdemucs")
    data, sr = sf.read(path, dtype="float32", always_2d=True)
    wav = torch.from_numpy(data.T.copy())
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    wav = torchaudio.functional.resample(wav, sr, model.samplerate)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    res = resources()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    with torch.no_grad():
        try:
            out = apply_model(model, ((wav - mean) / std)[None], device=device, segment=res.demucs_segment_s,
                              num_workers=res.demucs_jobs)[0]
        except RuntimeError:                       # out of GPU memory: the processor
            out = apply_model(model, ((wav - mean) / std)[None], device="cpu", segment=res.demucs_segment_s,
                              num_workers=res.demucs_jobs)[0]
    out = out * std + mean
    vocals = out[model.sources.index("vocals")]
    music = out.sum(0) - vocals
    return vocals.T.numpy(), music.T.numpy(), model.samplerate


def find_words(vocals_path: str, lyrics: str = "") -> tuple[list[dict], str]:
    from faster_whisper import WhisperModel
    from services.resource_profile import resources
    import torch
    cuda = torch.cuda.is_available()
    model = WhisperModel("base" if resources().low_memory else "small", device="cuda" if cuda else "cpu",
                         compute_type="int8_float16" if cuda else "int8")
    # the lyrics as a hint: sung words are recognised better when the model knows them
    hint = " ".join(l for l in lyrics.splitlines() if l.strip() and not l.strip().startswith("["))[:800]
    segs, info = model.transcribe(vocals_path, word_timestamps=True, initial_prompt=hint or None)
    words = [{"text": w.word.strip(), "start": float(w.start), "end": float(w.end)}
             for s in segs for w in (s.words or []) if w.word.strip()]
    return words, info.language


def melody(vocals: np.ndarray, sr: int) -> np.ndarray:
    import librosa
    mono = librosa.resample(vocals.mean(1).astype(np.float32), orig_sr=sr, target_sr=SR_F0)
    f0, voiced, _ = librosa.pyin(mono, fmin=65, fmax=1000, sr=SR_F0, frame_length=1024, hop_length=int(SR_F0 * HOP))
    return np.where(voiced & np.isfinite(f0), f0, 0.0)


def _rms(x: np.ndarray) -> float:
    x = x.mean(1) if x.ndim > 1 else x
    win = 2048
    n = len(x) // win
    if n == 0:
        return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    e = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(1))
    loud = e[e > np.percentile(e, 60)]            # the sung parts, not the pauses
    return float(np.mean(loud) + 1e-9) if len(loud) else float(np.mean(e) + 1e-9)


def mix(music: np.ndarray, sr: int, new_vocals_path: str, old_vocals: np.ndarray) -> np.ndarray:
    import soundfile as sf
    import soxr
    v, vsr = sf.read(new_vocals_path, dtype="float32", always_2d=True)
    if vsr != sr:
        v = soxr.resample(v, vsr, sr)
    v = np.repeat(v[:, :1], 2, axis=1)
    v *= _rms(old_vocals) / _rms(v)                 # as loud as the voice it replaces
    n = len(music)
    out = music.copy()
    out[: min(n, len(v))] += v[: min(n, len(v))]
    peak = float(np.max(np.abs(out))) or 1.0
    return out * (0.98 / peak) if peak > 0.98 else out


LANGS = {"en": "en", "de": "de", "es": "es"}


def revoice(path: str, voice: str, lyrics: str = "", steps: int = 32, report=lambda p, t: None,
            cancelled=lambda: False) -> dict:
    """Sing the song at `path` again with the built-in voice `voice` (the file is replaced). Returns notes for the UI."""
    import soundfile as sf
    problem = soulx.worker.available()
    if problem:
        raise RuntimeError(problem)
    vdir = soulx.VOICES / voice
    if not (vdir / "prompt.json").exists():
        raise RuntimeError(f'There is no voice "{voice}" in the Vocal Editor.')
    report(2, "Separating the vocals from the music")
    vocals, music, sr = separate(path)
    with tempfile.TemporaryDirectory() as tmp:
        vpath = os.path.join(tmp, "vocals.wav")
        sf.write(vpath, vocals, sr)
        report(25, "Finding the words in the vocals")
        words, lang = find_words(vpath, lyrics)
        if len(words) < 3:
            raise RuntimeError("No sung words were found in the song, so the voice could not be exchanged.")
        report(40, "Reading the melody")
        f0 = melody(vocals, sr)
        segs, unknown = build_segments(words, f0, LANGS.get(lang, "en"))
        if not segs:
            raise RuntimeError("Nothing to sing was found in the song.")
        out = os.path.join(tmp, "sung.wav")
        meta = json.load(open(vdir / "prompt.json", encoding="utf-8"))[0]
        soulx.worker.render(str(vdir / "prompt.wav"), meta, segs, out, steps,
                            lambda p, t: report(45 + 50 * p / 100, t), cancelled)
        report(96, "Mixing the new voice with the music")
        sf.write(path, mix(music, sr, out, vocals), sr, subtype="PCM_16")
    return {"words": len(words), "language": lang, "unknown": sorted(set(unknown))}


def voice_name(voice: str) -> str:
    v = soulx.VOICES / voice / "voice.json"
    try:
        return json.load(open(v, encoding="utf-8")).get("singer") or voice
    except Exception:
        return voice


__all__ = ["revoice", "build_segments", "word_notes", "real_f0", "voice_name", "Path"]
