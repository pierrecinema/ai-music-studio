"""Turn a generated track into a loop that repeats seamlessly: exactly N bars, starting on beat 1.

The generator is asked for a little more music than the loop needs. Then:

1. Tempo and first beat are measured (services.samples.analyze). The tempo is the one the music really has,
   folded towards the requested one (a tracker often finds half or double tempo).
2. The loop starts on a beat about one bar into the track (the very first bar is often a fade-in or an intro)
   and is exactly `bars` bars long at that tempo, so its length in beats is a whole number of bars.
3. Seam: the music that follows the loop end is blended into the loop start (equal-power crossfade). When the
   loop is played again and again, the end flows into the start just as the original music flowed on, so there
   is no click and no gap. Both sides of the blend are beat-aligned: hits fall on the same spot.

The file keeps its own tempo; the Studio stretches it to the project tempo (warpBpm), so copies placed one
after the other fill whole bars and stay on the grid.
"""
from __future__ import annotations

import math

SEAM_MAX = 0.25          # seconds of crossfade at the seam at most
SEAM_BEATS = 0.5         # ... or half a beat, whichever is shorter


def fold_tempo(measured: float | None, wanted: float) -> float:
    """The measured tempo, halved or doubled to lie closest to the wanted one; the wanted one if none."""
    if not measured or measured <= 0:
        return float(wanted)
    best = measured
    for f in (0.5, 2.0):                 # only octave errors: other factors would cut across the real bars
        if abs(math.log(measured * f / wanted)) < abs(math.log(best / wanted)):
            best = measured * f
    # far away from what was asked (the model ignored the tempo): trust the music, it is what will be heard
    return float(best)


def loop_seconds(bars: int, beats_per_bar: int, bpm: float) -> float:
    return bars * beats_per_bar * 60.0 / bpm


def needed_seconds(bars: int, beats_per_bar: int, bpm: float) -> int:
    """How much music to ask the generator for: one bar of lead-in, the loop, one bar after it, and slack."""
    bar = beats_per_bar * 60.0 / bpm
    return int(math.ceil(loop_seconds(bars, beats_per_bar, bpm) + 2 * bar + 3.0))


def seamless(data, sr: int, start: int, length: int, seam: int):
    """data[start:start+length] with the following `seam` samples blended into its start (numpy array)."""
    import numpy as np
    loop = data[start:start + length].astype(np.float32, copy=True)
    tail = data[start + length:start + length + seam]
    n = min(seam, len(tail))
    if n > 1:
        t = np.linspace(0.0, 1.0, n, dtype=np.float32)
        fin, fout = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)        # equal power: no dip in loudness
        if loop.ndim > 1:
            fin, fout = fin[:, None], fout[:, None]
        loop[:n] = loop[:n] * fin + tail[:n] * fout
    return loop


def make_loop(path: str, bars: int, beats_per_bar: int, wanted_bpm: float) -> dict:
    """Rewrite the WAV at `path` as a seamless loop. Returns {bpm, first_beat, bars, seconds, note}."""
    import soundfile as sf

    try:
        from services.samples import analyze
        r = analyze(path)
    except Exception as e:  # noqa: BLE001 - librosa missing: cut by the requested tempo from the start
        print(f"[loop] no measurement: {e}", flush=True)
        r = {}
    data, sr = sf.read(path, dtype="float32", always_2d=False)
    bpm = fold_tempo(r.get("bpm"), wanted_bpm)
    beat = 60.0 / bpm
    first = float(r.get("first_beat") or 0.0)
    loop_len = loop_seconds(bars, beats_per_bar, bpm)
    seam_s = min(SEAM_MAX, SEAM_BEATS * beat)
    total = len(data) / float(sr)

    # start one bar in (skips a fade-in or a short intro) if the file is long enough, else on the first beat
    bar = beats_per_bar * beat
    start_s = first
    for k in (beats_per_bar, 0):
        cand = first + k * beat
        if cand + loop_len + seam_s <= total:
            start_s = cand
            break
    note = ""
    if start_s + loop_len > total:
        # not enough music: shorten to the whole bars that fit
        fit = int((total - start_s - seam_s) // bar)
        if fit < 1:
            raise RuntimeError("The generated audio is too short for a loop. Try fewer bars or a slower tempo.")
        note = f"Only {fit} of {bars} bars fitted into the generated audio: the loop is {fit} bars long."
        bars = fit
        loop_len = loop_seconds(bars, beats_per_bar, bpm)

    start = int(round(start_s * sr))
    length = int(round(loop_len * sr))
    out = seamless(data, sr, start, length, int(round(seam_s * sr)))
    sf.write(path, out, sr, subtype="PCM_16", format="WAV")
    # the tempo the file has exactly, from its length in samples (what the Studio will stretch from)
    exact = bars * beats_per_bar * 60.0 / (length / float(sr))
    return {"bpm": round(exact, 3), "first_beat": 0.0, "bars": bars, "seconds": round(length / float(sr), 3),
            "note": note}
