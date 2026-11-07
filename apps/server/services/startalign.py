"""Make every created track start exactly on its first beat.

Generators often begin with a little silence, a fade-in or a half beat of lead-in. Placed on a timeline,
such a track is off the grid. So before a track is saved, the part in front of the first beat is cut off:
the saved file starts on beat 1 (bar 1). Tempo and the (now zero) first-beat time are returned so that the
library can remember them and the app does not have to measure the file again.

Only a lead-in of up to MAX_TRIM seconds is cut. A longer lead-in is an intentional intro: the track is left
alone and the real first-beat time is returned instead.
"""
from __future__ import annotations

MAX_TRIM = 6.0          # seconds of lead-in that may be removed
MIN_TRIM = 0.012        # smaller than this is already "on the beat"
FADE = 0.004            # seconds of fade-in after cutting, so that there is no click


def _silence_start(data, sr: int, limit: float = 3.0) -> float:
    """Seconds of digital silence at the start (below about -46 dBFS), up to `limit`."""
    import numpy as np
    mono = np.abs(data if data.ndim == 1 else data.mean(axis=1))
    n = min(len(mono), int(limit * sr))
    above = np.nonzero(mono[:n] > 0.005)[0]
    if len(above) == 0:
        return 0.0                       # all quiet in the first seconds: do not guess
    return max(0.0, above[0] / sr - 0.005)


def align_start(path: str) -> dict:
    """Cut the file (a WAV) so that it starts on its first beat. Returns {bpm, first_beat, trimmed}."""
    import numpy as np
    import soundfile as sf

    info: dict = {"bpm": None, "first_beat": None, "trimmed": 0.0}
    try:
        from services.samples import analyze
        r = analyze(path)
    except Exception as e:  # noqa: BLE001 - librosa missing or an odd file: keep the track as it is
        print(f"[start-align] no measurement: {e}", flush=True)
        r = {}
    bpm, first = r.get("bpm"), r.get("first_beat")
    try:
        data, sr = sf.read(path, dtype="float32", always_2d=False)
    except Exception as e:  # noqa: BLE001
        print(f"[start-align] cannot read {path}: {e}", flush=True)
        return info

    cut = 0.0
    if bpm and first is not None and MIN_TRIM <= first <= MAX_TRIM:
        beat = 60.0 / float(bpm)
        # cut only a lead-in: less than about one beat, or silence. Music that already plays before the "first
        # beat" found by the tracker (a pickup, or the tracker caught beat 2) must not lose its first notes.
        silent_until = _silence_start(data, sr, limit=float(first) + 0.05)
        if float(first) < 0.75 * beat or silent_until >= float(first) - 0.03:
            cut = float(first)
    elif not bpm:
        cut = _silence_start(data, sr)   # no beat to follow (ambient): at least remove the silence in front
        cut = cut if MIN_TRIM <= cut <= MAX_TRIM else 0.0

    if cut > 0:
        i = int(round(cut * sr))
        if i < len(data) - sr:           # never cut away (nearly) everything
            data = data[i:]
            fade = int(FADE * sr)
            if fade > 1:
                ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
                data[:fade] = data[:fade] * (ramp if data.ndim == 1 else ramp[:, None])
            sf.write(path, data, sr, subtype="PCM_16", format="WAV")
            info["trimmed"] = round(float(cut), 3)
            first = 0.0 if bpm else None
    info["bpm"] = bpm
    info["first_beat"] = round(float(first), 3) if first is not None else None
    return info
