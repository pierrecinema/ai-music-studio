import numpy as np

from services.revoice import HOP, build_segments, word_notes


def _f0(seconds: float, midi: list[tuple[float, float, int]]) -> np.ndarray:
    f = np.zeros(int(seconds / HOP))
    for a, b, m in midi:
        f[int(a / HOP):int(b / HOP)] = 440 * 2 ** ((m - 69) / 12)
    return f


def test_word_notes_take_the_sung_pitch():
    f0 = _f0(4, [(0.5, 1.0, 64), (1.0, 1.6, 67)])
    words = [{"text": "hold", "start": 0.5, "end": 1.0}, {"text": "on", "start": 1.0, "end": 1.6},
             {"text": "me", "start": 2.0, "end": 2.4}]                 # unvoiced: takes the last pitch
    notes = word_notes(words, f0)
    assert [n["pitch"] for n in notes] == [64, 67, 67]
    assert [n["lyric"] for n in notes] == ["hold", "on", "me"]


def test_segments_follow_the_original_melody():
    f0 = _f0(4, [(0.5, 1.0, 64), (1.0, 1.6, 67)])
    words = [{"text": "hold", "start": 0.5, "end": 1.0}, {"text": "on", "start": 1.0, "end": 1.6}]
    segs, _ = build_segments(words, f0, "en")
    assert len(segs) == 1
    meta = segs[0]
    curve = [float(x) for x in meta["f0"].split()]
    assert len(curve) == round(sum(float(d) for d in meta["duration"].split()) / HOP)
    sung = [x for x in curve if x > 0]
    assert sung and abs(min(sung) - 329.6) < 2 and abs(max(sung) - 392.0) < 2      # E4 .. G4 of the source
