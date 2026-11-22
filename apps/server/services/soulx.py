"""The built-in singer: SoulX-Singer (Apache 2.0, vendor/soulxsinger) sings a melody with lyrics in one of the
app's own voices (data/voices: short recordings of singers from VocalSet, CC BY 4.0) or a voice the user records.

The model runs in its own Python environment (AMS_SINGER_PYTHON, PyTorch on the processor) as a worker process
(services/soulx_worker.py) that loads it once and then renders phrase after phrase. This module turns notes and
lyrics into the model's input: words -> ARPAbet phonemes (English; German and Spanish mapped to the nearest English
sounds), one entry per note (a word on its first note, type 2; held syllables, type 3; rests, type 1), and a sung
pitch curve (glides, a scoop into each word, vibrato on long notes) or, for rap, a speech-like one.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

import numpy as np

SERVER = Path(__file__).resolve().parent.parent
VOICES = SERVER / "data" / "voices"
G2P_DIR = SERVER / "data" / "g2p"
HOP = 0.02                          # the model's frame (480 samples at 24 kHz)

# ── phonemes ─────────────────────────────────────────────────────────────────────────────────────────────────

_EN: dict[str, list[str]] | None = None
VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}

# German (OpenUtau "marzipan" phonemes) and Spanish -> the nearest English sounds
DE = {"a": "AA", "er": "ER", "eh": "EH", "e": "EY", "ih": "IH", "i": "IY", "uh": "UH", "u": "UW", "oh": "AO", "o": "OW",
      "ueh": "UH", "ue": "UW", "oeh": "ER", "oe": "ER", "ex": "AH", "ei": "AY", "au": "AW", "eu": "OY",
      "w": "V", "j": "Y", "p": "P", "t": "T", "k": "K", "f": "F", "s": "S", "sh": "SH", "ch": "HH", "xh": "HH", "h": "HH",
      "pf": "P F", "ts": "T S", "tsh": "CH", "th": "TH", "m": "M", "n": "N", "ng": "NG", "b": "B", "d": "D", "g": "G",
      "v": "V", "z": "Z", "l": "L", "r": "R", "rh": "R", "rr": "R", "rx": "R", "dsh": "JH", "zh": "ZH", "dh": "DH"}
ES = {"a": "AA", "e": "EH", "i": "IY", "o": "OW", "u": "UW", "b": "B", "B": "B", "ch": "CH", "d": "D", "D": "DH",
      "f": "F", "g": "G", "G": "G", "gn": "N Y", "I": "Y", "k": "K", "l": "L", "ll": "Y", "m": "M", "n": "N", "p": "P",
      "r": "R", "rr": "R", "s": "S", "t": "T", "U": "W", "w": "W", "x": "HH", "y": "Y", "Y": "JH", "z": "S"}


def _en_dict() -> dict[str, list[str]]:
    global _EN
    if _EN is None:
        _EN = {}
        for line in open(G2P_DIR / "en" / "dict.txt", encoding="utf-8", errors="ignore"):
            if line.startswith(";;;"):
                continue
            p = line.strip().split("  ")
            if len(p) == 2:
                _EN.setdefault(p[0].lower(), p[1].split())
    return _EN


def _stress(phs: list[str]) -> list[str]:
    """vowels without a stress mark: the first gets 1, the others 0"""
    out, first = [], True
    for p in phs:
        if p in VOWELS:
            out.append(p + ("1" if first else "0")); first = False
        else:
            out.append(p)
    return out


def word_phonemes(word: str, lang: str) -> list[str] | None:
    """a word -> ARPAbet with stress (for the model: en_<PH>)"""
    w = re.sub(r"[^\w'’-]", "", word).replace("’", "'")
    if not w:
        return None
    if lang == "en":
        d = _en_dict()
        if w.lower() in d:
            return d[w.lower()]
    from services.diffsinger import g2p
    g = g2p(lang if lang in ("en", "de", "es") else "en")
    q = g.query(w) if g else None
    if not q:
        return None
    if lang == "de":
        q = sum((DE.get(p, "").split() for p in q), [])
    elif lang == "es":
        q = sum((ES.get(p, "").split() for p in q), [])
    else:
        q = [p.upper() for p in q]
    return _stress([p for p in q if p]) or None


def vowel_count(phs: list[str]) -> int:
    return sum(1 for p in phs if re.sub(r"\d", "", p) in VOWELS)

# ── notes -> the model's input ───────────────────────────────────────────────────────────────────────────────

def segments(notes: list[dict], lang: str, rap: bool = False, max_len: float = 18.0, gap: float = 0.6) -> tuple[list[dict], list[str]]:
    """notes [{pitch, start, end (s), lyric}] -> the model's segments (each a phrase, at most ~max_len seconds),
    and the lyrics it cannot pronounce"""
    notes = sorted(notes, key=lambda n: n["start"])
    phrases: list[list[dict]] = []
    for n in notes:
        if phrases and n["start"] - phrases[-1][-1]["end"] < gap and n["end"] - phrases[-1][0]["start"] < max_len:
            phrases[-1].append(n)
        else:
            phrases.append([n])
    unknown: list[str] = []
    out = []
    for ph in phrases:
        s0 = max(0.0, ph[0]["start"] - 0.3)
        s1 = ph[-1]["end"] + 0.3
        dur, phs, pit, typ, txt = [], [], [], [], []
        t, last = s0, None
        for n in ph:
            lyr = str(n.get("lyric") or "").strip()
            if n["start"] - t > 0.08:
                dur.append(n["start"] - t); phs.append("<SP>"); pit.append(0); typ.append(1); txt.append("<SP>")
            elif dur:
                dur[-1] += max(0.0, n["start"] - t)
            elif n["start"] > t:
                dur.append(n["start"] - t); phs.append("<SP>"); pit.append(0); typ.append(1); txt.append("<SP>")
            if (lyr.startswith("+") or lyr == "-") and last:
                phs.append(last); typ.append(3); txt.append(txt[-1])
            else:
                q = word_phonemes(lyr or "ah", lang) if lyr not in ("+", "-") else None
                if not q:
                    if lyr:
                        unknown.append(lyr)
                    q = ["AA1"]
                last = "en_" + "-".join(q)
                phs.append(last); typ.append(2); txt.append(lyr or "ah")
            dur.append(max(0.05, n["end"] - max(n["start"], t))); pit.append(int(n["pitch"])); t = n["end"]
        if s1 - t > 0.01:
            dur.append(s1 - t); phs.append("<SP>"); pit.append(0); typ.append(1); txt.append("<SP>")
        meta = {"index": f"{s0:.2f}", "language": "English", "time": [int(round(s0 * 1000)), int(round(s1 * 1000))],
                "duration": " ".join(f"{d:.3f}" for d in dur), "text": " ".join(txt), "phoneme": " ".join(phs),
                "note_pitch": " ".join(map(str, pit)), "note_type": " ".join(map(str, typ))}
        meta["f0"] = rap_f0(meta) if rap else sung_f0(meta)
        out.append(meta)
    return out, unknown


def sung_f0(meta: dict) -> str:
    """a sung pitch curve: ~80 ms glides between notes, a small scoop into each word, vibrato (5.5 Hz, +-0.35
    semitone) growing over the second half of long notes"""
    dur = [float(x) for x in meta["duration"].split()]; pit = [int(x) for x in meta["note_pitch"].split()]
    typ = [int(x) for x in meta["note_type"].split()]
    n = int(round(sum(dur) / HOP)); m = np.zeros(n); voiced = np.zeros(n, bool); t = 0.0
    for d, p, ty in zip(dur, pit, typ):
        a, b = int(round(t / HOP)), int(round((t + d) / HOP)); t += d
        if p <= 0 or b <= a:
            continue
        m[a:b] = p; voiced[a:b] = True
        L = b - a
        if ty == 2 and L > 6:
            m[a:a + 5] += np.linspace(-0.6, 0, 5)
        if L * HOP > 0.45:
            k = np.arange(L); start = int(L * 0.45)
            m[a:b] += 0.35 * np.clip((k - start) / max(1, L * 0.25), 0, 1) * np.sin(2 * np.pi * 5.5 * k * HOP)
    k = 4
    sm = np.convolve(np.pad(m, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), "valid")
    f0 = np.where(voiced, 440 * 2 ** ((sm - 69) / 12), 0.0)
    return " ".join(f"{x:.1f}" for x in f0)


def rap_f0(meta: dict) -> str:
    """rap: speech-like, each word falls a little from just above its note, every third word accented"""
    dur = [float(x) for x in meta["duration"].split()]; pit = [int(x) for x in meta["note_pitch"].split()]
    n = int(round(sum(dur) / HOP)); f = np.zeros(n); t = 0.0; k = 0
    for d, p in zip(dur, pit):
        a, b = int(round(t / HOP)), int(round((t + d) / HOP)); t += d
        if p > 0 and b > a:
            x = np.linspace(0, 1, b - a)
            f[a:b] = 440 * 2 ** ((p + 1.5 - 2.5 * x + (0.8 if k % 3 == 0 else 0) - 69) / 12); k += 1
    return " ".join(f"{x:.1f}" for x in f)

# ── voices ───────────────────────────────────────────────────────────────────────────────────────────────────

def voices() -> list[dict]:
    out = []
    if VOICES.exists():
        for d in sorted(VOICES.iterdir()):
            v = d / "voice.json"
            if v.exists():
                info = json.load(open(v, encoding="utf-8"))
                out.append({"id": d.name, **info, "demo": str(d / "demo.wav") if (d / "demo.wav").exists() else None})
    return out

# ── the worker ───────────────────────────────────────────────────────────────────────────────────────────────

class Worker:
    """one long-running process with the model loaded; requests one at a time"""

    def __init__(self):
        self.proc: subprocess.Popen | None = None
        self.lock = threading.Lock()

    def available(self) -> str | None:
        py = os.environ.get("AMS_SINGER_PYTHON")
        model = os.environ.get("AMS_SINGER_MODELS")
        if not py or not os.path.exists(py):
            return "The singer is not installed yet (Vocal Editor → Install the singer)."
        if not model or not os.path.exists(os.path.join(model, "SoulX-Singer", "model.pt")):
            return "The singer's model is missing: install the singer again."
        return None

    def _start(self, report) -> None:
        if self.proc and self.proc.poll() is None:
            return
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONPATH": str(SERVER / "vendor"),
               "HF_HOME": os.path.join(os.environ["AMS_SINGER_MODELS"], "hf"), "HF_HUB_OFFLINE": "1"}
        report(1, "Loading the singer (once, up to a few minutes)")
        self.proc = subprocess.Popen([os.environ["AMS_SINGER_PYTHON"], "-u", str(Path(__file__).with_name("soulx_worker.py")),
                                      os.environ["AMS_SINGER_MODELS"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=None, text=True, encoding="utf-8", env=env, cwd=str(SERVER))
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("The singer stopped while loading (see the log).")
            msg = _json(line)
            if msg.get("ready"):
                return
            if msg.get("error"):
                raise RuntimeError(msg["error"])

    def render(self, prompt_wav: str, prompt_meta: dict, segs: list[dict], out: str, steps: int, report, cancelled) -> str:
        with self.lock:
            self._start(report)
            req = {"prompt_wav": prompt_wav, "prompt_meta": prompt_meta, "segments": segs, "out": out, "steps": steps}
            self.proc.stdin.write(json.dumps(req) + "\n"); self.proc.stdin.flush()
            t0 = time.time()
            while True:
                if cancelled():
                    self.stop()
                    raise RuntimeError("Cancelled")
                line = self.proc.stdout.readline()
                if not line:
                    self.proc = None
                    raise RuntimeError("The singer stopped (see the log).")
                msg = _json(line)
                if "progress" in msg:
                    done, total = msg["progress"]
                    eta = (time.time() - t0) / max(1, done) * (total - done) if done else None
                    report(5 + 95 * done / max(1, total), f"Singing phrase {min(done + 1, total)} of {total}" + (f", about {int(eta // 60)}:{int(eta % 60):02d} left" if eta else ""))
                elif msg.get("done"):
                    return msg["file"]
                elif msg.get("error"):
                    raise RuntimeError(msg["error"])

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.kill()
        self.proc = None


def _json(line: str) -> dict:
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return {}


worker = Worker()
