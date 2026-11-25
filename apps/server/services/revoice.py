"""Sing a finished song with a voice of the Vocal Editor (Create → "Singer (Vocal Editor)").

The music model sings with a voice of its own and cannot take a given voice. So the finished song is taken apart and its
vocals are turned into the chosen voice:
  1. Demucs separates the vocals from the music,
  2. Seed-VC (singing voice conversion, GPL-3; services/seedvc_worker.py) turns them into the chosen voice: words,
     melody and timing stay exactly as sung, only the voice changes,
  3. the new vocals, at the level of the old ones, are mixed with the music again.
The music model is asked for a singer of the same sex as the chosen voice (music_gen), so the conversion stays within
one voice range: a woman's vocals turned into a man sounded artificial (owner, 25.11.2026).
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import numpy as np

from services import soulx

SERVER = Path(__file__).resolve().parents[1]


def voice_info(voice: str) -> dict:
    try:
        return json.load(open(soulx.VOICES / voice / "voice.json", encoding="utf-8"))
    except Exception:
        return {}


def voice_name(voice: str) -> str:
    return voice_info(voice).get("singer") or voice


def voice_gender(voice: str) -> str:
    """'male' / 'female' / '' of a built-in voice"""
    return voice_info(voice).get("gender", "")


# ── the steps ──────────────────────────────────────────────────────────────────────────────────────────────────

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


def _rms(x: np.ndarray) -> float:
    """the level of the sung parts (not the pauses)"""
    x = x.mean(1) if x.ndim > 1 else x
    win = 2048
    n = len(x) // win
    if n == 0:
        return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    e = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(1))
    loud = e[e > np.percentile(e, 60)]
    return float(np.mean(loud) + 1e-9) if len(loud) else float(np.mean(e) + 1e-9)


def mix(music: np.ndarray, sr: int, new_vocals: np.ndarray, vsr: int, old_vocals: np.ndarray) -> np.ndarray:
    """the new vocals (as loud as the ones they replace, in the middle) on the music"""
    if vsr != sr:
        import soxr
        new_vocals = soxr.resample(new_vocals, vsr, sr)
    v = new_vocals if new_vocals.ndim > 1 else new_vocals[:, None]
    v = np.repeat(v[:, :1], 2, axis=1) * (_rms(old_vocals) / _rms(v))
    out = music.copy()
    n = min(len(out), len(v))
    out[:n] += v[:n]
    peak = float(np.max(np.abs(out))) or 1.0
    return out * (0.98 / peak) if peak > 0.98 else out


def _has_vocals(vocals: np.ndarray, music: np.ndarray) -> bool:
    return _rms(vocals) > 0.01 and _rms(vocals) > 0.05 * _rms(music)


# ── the Seed-VC worker ─────────────────────────────────────────────────────────────────────────────────────────

class Converter:
    """one long-running Seed-VC process (models loaded once); requests one at a time"""

    def __init__(self):
        self.proc: subprocess.Popen | None = None
        self.lock = threading.Lock()

    @staticmethod
    def available() -> str | None:
        if not os.environ.get("AMS_SINGER_PYTHON") or not os.path.exists(os.environ["AMS_SINGER_PYTHON"]):
            return "The singer is not installed yet (Settings → AI Engines → Singer)."
        d = os.environ.get("AMS_SEEDVC_DIR")
        if not d or not os.path.exists(os.path.join(d, "repo", "inference.py")):
            return "The voice exchange is not installed yet (Settings → AI Engines → Voice exchange)."
        return None

    def _start(self, report) -> None:
        if self.proc and self.proc.poll() is None:
            return
        d = os.environ["AMS_SEEDVC_DIR"]
        report("Loading the voice exchange (once, up to a few minutes)")
        env = {**os.environ, "PYTHONUTF8": "1", "HF_HUB_OFFLINE": "1", "HF_HOME": os.path.join(d, "hf")}
        self.proc = subprocess.Popen([os.environ["AMS_SINGER_PYTHON"], "-u", str(Path(__file__).with_name("seedvc_worker.py")),
                                      os.path.join(d, "repo"), os.path.join(d, "models")], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=None, text=True, encoding="utf-8", env=env, cwd=str(SERVER))
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("The voice exchange stopped while loading (see the log).")
            msg = _json(line)
            if msg.get("ready"):
                return
            if msg.get("error"):
                raise RuntimeError(msg["error"])

    def convert(self, source: str, target: str, out: str, steps: int, auto_f0: bool, report, cancelled) -> str:
        with self.lock:
            self._start(report)
            report("Changing the voice")
            self.proc.stdin.write(json.dumps({"source": source, "target": target, "out": out, "steps": steps, "auto_f0": auto_f0}) + "\n")
            self.proc.stdin.flush()
            while True:
                if cancelled():
                    self.stop()
                    raise RuntimeError("Cancelled")
                line = self.proc.stdout.readline()
                if not line:
                    self.proc = None
                    raise RuntimeError("The voice exchange stopped (see the log).")
                msg = _json(line)
                if msg.get("done"):
                    return msg["file"]
                if msg.get("error"):
                    raise RuntimeError(msg["error"])

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.kill()
        self.proc = None


def _json(line: str) -> dict:
    try:
        return json.loads(line)
    except Exception:
        return {}


converter = Converter()


def revoice(path: str, voice: str, steps: int = 25, report=lambda p, t: None, cancelled=lambda: False) -> None:
    """Turn the vocals of the song at `path` into the built-in voice `voice` (the file is replaced)."""
    import soundfile as sf
    problem = Converter.available()
    if problem:
        raise RuntimeError(problem)
    target = soulx.VOICES / voice / "prompt.wav"
    if not target.exists():
        raise RuntimeError(f'There is no voice "{voice}" in the Vocal Editor.')
    report(5, "Separating the vocals from the music")
    vocals, music, sr = separate(path)
    if not _has_vocals(vocals, music):
        raise RuntimeError("The song has no vocals to sing with another voice.")
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "vocals.wav"), os.path.join(tmp, "new.wav")
        sf.write(src, vocals, sr)
        report(30, "Changing the voice (a few minutes)")
        converter.convert(src, str(target), out, steps, False, lambda t: report(30, t), cancelled)
        new, vsr = sf.read(out, dtype="float32", always_2d=True)
        report(95, "Mixing the new voice with the music")
        sf.write(path, mix(music, sr, new, vsr, vocals), sr, subtype="PCM_16")
    print(f"[revoice] {voice}: {time.time() - t0:.0f} s", flush=True)
