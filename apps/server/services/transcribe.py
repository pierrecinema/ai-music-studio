"""Audio -> MIDI, one stem at a time, with the method that suits the instrument:

- melody, vocals, bass (one note at a time): basic-pitch, then made one voice: of notes starting together the
  strongest (bass: the lowest) stays, overtones and short blips inside a ringing note go, split notes are joined;
- drums: semi-adaptive NMF (kick, snare and hi-hat templates that adapt to the kit), hits where each activation
  peaks, the loudness of each hit as velocity;
- piano, guitar, keys, the rest (chords): basic-pitch (Spotify, Apache 2.0), then cleaned up (ghost notes, octave
  echoes and repeated fragments removed);
- the song: tempo, the beat grid, key and chords from the mix, so the notes can be placed on bars and beats.

Every function takes a file path or (samples, rate) and returns notes as dicts in seconds:
{pitch, start, end, velocity, confidence}. Nothing here needs a GPU.
"""
from __future__ import annotations

import math
from typing import Callable

import numpy as np

SR = 22050
Report = Callable[[float, str], None]


def _load(path: str, sr: int = SR) -> tuple[np.ndarray, int]:
    import librosa
    y, sr = librosa.load(path, sr=sr, mono=True)
    return y.astype(np.float32), sr


def merge_fragments(notes: list[dict], gap: float = 0.03, ratio: float = 0.85) -> list[dict]:
    """a pitch tracker splits long notes where the sound wobbles: a note that starts while (or right after) the same
    pitch still sounds, without a stronger attack, belongs to that note"""
    out: list[dict] = []
    last: dict[int, dict] = {}
    for n in sorted(notes, key=lambda n: n["start"]):
        p = last.get(n["pitch"])
        if p is not None and n["start"] <= p["end"] + gap and n["velocity"] < ratio * p["velocity"] + 8:
            p["end"] = max(p["end"], n["end"])
            continue
        m = dict(n)
        out.append(m)
        last[n["pitch"]] = m
    return out


def monophonic(notes: list[dict], kind: str = "melody") -> list[dict]:
    """a one-voice line from a pitch tracker's notes: of notes that start together keep the strongest (for bass the
    lowest unless a higher one is much louder: upper octaves are overtones), drop octave and fifth overtones that ring
    with a louder note, and end each note where the next one starts"""
    lo, hi = (24, 67) if kind == "bass" else (36, 96)
    ns = sorted((n for n in merge_fragments(notes) if lo <= n["pitch"] <= hi), key=lambda n: (n["start"], -n["velocity"]))
    groups: list[list[dict]] = []
    for n in ns:
        if groups and n["start"] - groups[-1][0]["start"] < 0.05:
            groups[-1].append(n)
        else:
            groups.append([n])
    line: list[dict] = []
    for g in groups:
        if kind == "bass":
            low = min(g, key=lambda n: n["pitch"])
            loud = max(g, key=lambda n: n["velocity"])
            pick = low if low["velocity"] >= 0.5 * loud["velocity"] else loud
        else:
            pick = max(g, key=lambda n: (n["velocity"], -n["pitch"]))
        p = line[-1] if line else None
        if p and pick["start"] < p["end"] - 0.03:
            # an overtone that starts while a louder note an octave / twelfth below still rings
            if (pick["pitch"] - p["pitch"]) in (12, 19, 24) and pick["velocity"] < 1.2 * p["velocity"]:
                continue
            # a short blip inside a ringing note (string noise, a wobble of the pitch): not a new note
            if kind == "bass" and pick["start"] - p["start"] > 0.06 and pick["end"] - pick["start"] < 0.2 and pick["velocity"] < 1.1 * p["velocity"]:
                continue
        line.append(dict(pick))
    for a, b in zip(line, line[1:]):
        if a["end"] > b["start"]:
            a["end"] = max(a["start"] + 0.03, b["start"])
    return line


# ── drums ─────────────────────────────────────────────────────────────────────

NMF_K = [4.0, 5.0, 2.0]          # kick, snare, hats: measured on rendered songs (see tests)


def drum_notes(path_or_audio, sr: int = 44100, iters: int = 60) -> list[dict]:
    """semi-adaptive NMF (Dittmar & Gaertner 2014): three spectral templates (kick, snare, hats) start from typical
    shapes and adapt to the song's kit; the activation of each template peaks at its hits"""
    import librosa
    y, sr = _load(path_or_audio, sr) if isinstance(path_or_audio, str) else path_or_audio
    hop = 256
    M = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=2048, hop_length=hop, n_mels=64, fmin=20, fmax=16000, power=1.0)
    fr = librosa.mel_frequencies(n_mels=64, fmin=20, fmax=16000)
    W0 = np.stack([
        np.exp(-((np.log2(fr / 60.0)) ** 2) / 0.8),                                   # kick: around 60 Hz
        np.exp(-((np.log2(fr / 220.0)) ** 2) / 1.2) + 0.5 * np.exp(-((np.log2(fr / 3000.0)) ** 2) / 2.0),   # snare: body + noise
        np.exp(-((np.log2(fr / 10000.0)) ** 2) / 1.0),                                # hats: high
    ], axis=1) + 1e-3
    W0 /= W0.sum(axis=0, keepdims=True)
    W = W0.copy(); V = M + 1e-9
    H = np.full((3, V.shape[1]), float(V.mean()))
    for it in range(iters):
        WH = W @ H + 1e-9
        H *= (W.T @ (V / WH)) / (W.sum(axis=0)[:, None] + 1e-9)
        WH = W @ H + 1e-9
        Wn = W * ((V / WH) @ H.T) / (H.sum(axis=1)[None, :] + 1e-9)
        a = min(1.0, it / iters)                                                       # adapt slowly, keep the shapes apart
        W = (1 - 0.5 * a) * W0 + 0.5 * a * (Wn / (Wn.sum(axis=0, keepdims=True) + 1e-9))
    out = []
    wait = int(0.035 * sr / hop)
    for row, pitch in ((0, 36), (1, 38), (2, 42)):
        h = np.log1p(H[row] / (np.percentile(H[row], 99) + 1e-9) * 100)
        d = np.maximum(0, h - np.concatenate([[0.0, 0.0], h[:-2]]))           # a hit at the very start counts too
        th = max(0.25, float(d.mean() + NMF_K[row] * d.std()))
        for i in librosa.util.peak_pick(d, pre_max=2, post_max=2, pre_avg=10, post_avg=3, delta=th * 0.3, wait=wait):
            if d[i] >= th:
                out.append({"pitch": pitch, "start": float(i * hop / sr), "level": float(h[min(len(h) - 1, i + 1)])})
    res = []
    for p in (36, 38, 42):
        hs = [x for x in out if x["pitch"] == p]
        if not hs:
            continue
        lv = np.array([x["level"] for x in hs]); lo, hi = float(np.percentile(lv, 5)), float(lv.max())
        for x in hs:
            res.append({"pitch": p, "start": round(x["start"], 4), "end": round(x["start"] + 0.1, 4),
                        "velocity": int(np.clip(round(45 + 82 * (x["level"] - lo) / max(1e-6, hi - lo)), 1, 127)), "confidence": 1.0})
    # a snare's body also moves the kick template a little: a weak kick at the same moment as a snare is not a kick
    snares = [x["start"] for x in res if x["pitch"] == 38]
    res = [x for x in res if not (x["pitch"] == 36 and x["velocity"] < 70 and any(abs(x["start"] - t) < 0.03 for t in snares))]
    return sorted(res, key=lambda n: (n["start"], n["pitch"]))


# ── chords: piano, guitar, keys, the rest ─────────────────────────────────────

def basic_pitch_notes(path: str, onset: float = 0.5, frame: float = 0.3, min_ms: float = 80, lo: int = 21, hi: int = 108) -> list[dict]:
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    _, _, events = predict(path, ICASSP_2022_MODEL_PATH, onset_threshold=onset, frame_threshold=frame,
                           minimum_note_length=min_ms, minimum_frequency=None, maximum_frequency=None, multiple_pitch_bends=False,
                           melodia_trick=True)
    notes = [{"pitch": int(p), "start": float(s), "end": float(e), "amp": float(a)} for s, e, p, a, *_ in events if lo <= p <= hi]
    if not notes:
        return []
    amps = np.array([n["amp"] for n in notes]); top = float(np.percentile(amps, 95))
    return [{"pitch": n["pitch"], "start": round(n["start"], 4), "end": round(n["end"], 4),
             "velocity": int(np.clip(round(127 * math.sqrt(min(1.0, n["amp"] / max(top, 1e-6)))), 1, 127)),
             "confidence": round(min(1.0, n["amp"] / max(top, 1e-6)), 2)} for n in notes]


def clean_poly(notes: list[dict], min_len: float = 0.05) -> list[dict]:
    """removes what a pitch tracker adds around real chords: very short and very quiet notes, an octave echo that
    starts with a louder note an octave below/above, and a note that restarts while the same note still sounds"""
    notes = sorted((dict(n) for n in merge_fragments(notes) if n["end"] - n["start"] >= min_len), key=lambda n: n["start"])
    if not notes:
        return []
    vmax = max(n["velocity"] for n in notes)
    keep = []
    for i, n in enumerate(notes):
        if n["velocity"] < 0.15 * vmax:
            continue
        echo = any(abs(m["start"] - n["start"]) < 0.04 and abs(m["pitch"] - n["pitch"]) in (12, 19, 24) and m["velocity"] > 1.6 * n["velocity"]
                   for m in notes[max(0, i - 12): i + 12] if m is not n)
        if echo:
            continue
        keep.append(n)
    return keep


# ── the song: tempo, beats, key, chords ───────────────────────────────────────

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def key_of(chroma_sum: np.ndarray) -> tuple[int, str, float]:
    """Krumhansl-Schmuckler: (root 0..11, 'major' | 'minor', correlation)"""
    best = (0, "major", -2.0)
    for r in range(12):
        for prof, mode in ((_MAJ, "major"), (_MIN, "minor")):
            c = float(np.corrcoef(np.roll(prof, r), chroma_sum)[0, 1])
            if c > best[2]:
                best = (r, mode, c)
    return best


def analyze_song(path: str, bpm_hint: float | None = None) -> dict:
    """tempo, beat times, downbeat (first bar), key and the chord of each beat of the mix"""
    import librosa
    y, sr = _load(path, SR)
    hop = 512
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, start_bpm=bpm_hint or 120, units="frames")
    tempo = float(np.atleast_1d(tempo)[0])
    beat_t = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    # a steady grid through the found beats (least squares), so notes can be put on bars and beats
    if len(beat_t) >= 8:
        idx = np.arange(len(beat_t)); a, b = np.polyfit(idx, beat_t, 1)
        period, first = float(a), float(b)
        while first - period > -0.02:
            first -= period
        first += period if first < -0.02 else 0
        bpm = 60.0 / period
    else:
        bpm, first = tempo, float(beat_t[0]) if len(beat_t) else 0.0
    if bpm_hint and abs(bpm - bpm_hint) / bpm_hint < 0.04:
        bpm = bpm_hint
    # chords per beat from a harmonic chroma
    y_h = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=y_h, sr=sr, hop_length=hop)
    root, mode, kc = key_of(chroma.sum(axis=1))
    # downbeat: the beat phase (of 4) whose beats carry the most bass onsets
    spb = 60.0 / bpm
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)); fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = np.log1p(S[fr < 150].sum(axis=0)); lf = np.maximum(0, np.diff(low, prepend=low[:1]))
    times = librosa.frames_to_time(np.arange(len(lf)), sr=sr, hop_length=hop)
    n_beats = int((times[-1] - first) / spb)
    phase_score = np.zeros(4)
    for k in range(n_beats):
        tb = first + k * spb; i = int(np.searchsorted(times, tb))
        phase_score[k % 4] += lf[max(0, i - 2): i + 3].max(initial=0)
    # chords change on the first beat of a bar: the harmonic change at each beat, summed per phase
    ct = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=hop)
    change = np.zeros(4)
    prev = None
    for k in range(n_beats):
        sel = (ct >= first + k * spb) & (ct < first + (k + 1) * spb)
        if not sel.any():
            continue
        c = chroma[:, sel].mean(axis=1); c = c / (np.linalg.norm(c) + 1e-9)
        if prev is not None:
            change[k % 4] += 1 - float(np.dot(c, prev))
        prev = c
    score = phase_score / (phase_score.sum() + 1e-9) + change / (change.sum() + 1e-9)
    down = int(np.argmax(score))
    first_bar = first + down * spb
    chords = chords_of(chroma, sr, hop, first_bar, spb, n_beats - down)
    rel = KEY_NAMES[(root + 9) % 12] + "m" if mode == "major" else KEY_NAMES[(root + 3) % 12]
    return {"bpm": round(bpm, 2), "firstBeat": round(first_bar, 4), "key": KEY_NAMES[root] + ("m" if mode == "minor" else ""), "relativeKey": rel,
            "keyRoot": root, "mode": mode, "keyConfidence": round(kc, 2), "chords": chords}


_QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "dim": [0, 3, 6], "sus4": [0, 5, 7]}


def chords_of(chroma: np.ndarray, sr: int, hop: int, first_bar: float, spb: float, beats: int) -> list[dict]:
    """the chord of each half bar (template matching on chroma), merged while it stays the same"""
    import librosa
    times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=hop)
    temps = []
    for r in range(12):
        for q, iv in _QUAL.items():
            v = np.zeros(12); v[[(r + i) % 12 for i in iv]] = 1
            v[r] += 0.3                                                           # the root counts a bit more
            temps.append((KEY_NAMES[r] + q, r, q, v / np.linalg.norm(v)))
    out: list[dict] = []
    for k in range(0, max(0, beats), 2):
        a, b = first_bar + k * spb, first_bar + (k + 2) * spb
        sel = (times >= a) & (times < b)
        if not sel.any():
            break
        c = chroma[:, sel].mean(axis=1)
        if c.max() < 1e-3:
            continue
        c = c / (np.linalg.norm(c) + 1e-9)
        scores = [(float(np.dot(c, v)) - (0.03 if q not in ("", "m") else 0), n, r, q) for n, r, q, v in temps]
        s, name, r, q = max(scores)
        if out and out[-1]["name"] == name:
            out[-1]["beats"] += 2
        else:
            out.append({"beat": k, "beats": 2, "name": name, "root": r, "quality": q, "confidence": round(s, 2)})
    return out


# ── putting it together ───────────────────────────────────────────────────────

STEM_KIND = {"vocals": "mono", "melody": "mono", "lead": "mono", "bass": "bass", "drums": "drums",
             "piano": "poly", "guitar": "poly", "other": "poly", "chords": "poly", "keys": "poly"}


def transcribe_stem(path: str, stem: str, kind: str | None = None) -> dict:
    """one stem -> notes with the method for its kind (mono, bass, drums, poly)"""
    kind = kind or STEM_KIND.get(stem, "poly")
    if kind == "drums":
        notes, method = drum_notes(path), "NMF drum transcription (kick, snare, hats)"
    elif kind in ("mono", "bass"):
        lo, hi = (24, 67) if kind == "bass" else (36, 96)
        notes = monophonic(basic_pitch_notes(path, onset=0.45, frame=0.3, min_ms=60, lo=lo, hi=hi), "bass" if kind == "bass" else "melody")
        method = "basic-pitch, one voice"
    else:
        notes, method = clean_poly(basic_pitch_notes(path)), "basic-pitch + cleanup"
    return {"stem": stem, "kind": kind, "method": method, "notes": notes}


def to_beats(notes: list[dict], bpm: float, first_beat: float, quantize: float = 0.0, strength: float = 1.0) -> list[dict]:
    """seconds -> beats from the first bar; quantize: grid in beats (0.25 = 16ths), strength 0..1"""
    spb = 60.0 / bpm
    out = []
    for n in notes:
        s = (n["start"] - first_beat) / spb
        e = (n["end"] - first_beat) / spb
        if quantize > 0:
            qs = round(s / quantize) * quantize
            s = s + (qs - s) * strength
            qe = max(qs + quantize, round(e / quantize) * quantize)
            e = e + (qe - e) * strength
        if e <= 0:
            continue
        out.append({"pitch": n["pitch"], "startTime": round(max(0.0, s), 4), "duration": round(max(0.02, e - max(0.0, s)), 4),
                    "velocity": n["velocity"], "confidence": n.get("confidence", 1.0)})
    return out
