"""the built-in singer's styles: note shaping and pitch curves (no model needed)"""
import numpy as np
from services import soulx

NOTES = [{"pitch": 64, "start": 0.3, "end": 0.9, "lyric": "hello"}, {"pitch": 67, "start": 1.0, "end": 2.2, "lyric": "world"}]


def _f0(style):
    segs, unknown = soulx.segments(NOTES, "en", style=style)
    assert not unknown and len(segs) == 1
    return np.array([float(x) for x in segs[0]["f0"].split()])


def test_every_style_follows_the_notes():
    for st in soulx.STYLES:
        f = _f0(st)
        midi = 69 + 12 * np.log2(f[f > 0] / 440)
        assert abs(np.median(midi) - 67) < 1.6, st


def test_legato_and_short_notes():
    assert soulx.shape_notes(NOTES, "ballad")[0]["end"] == 1.0          # the gap is filled
    assert soulx.shape_notes(NOTES, "rock")[1]["end"] < 2.2             # rock cuts long notes short


def test_ballad_has_more_vibrato_than_rock():
    def wobble(st):
        f = _f0(st); seg = f[int(1.5 / soulx.HOP):int(1.85 / soulx.HOP)]   # inside the long note, before any fall-off
        return np.std(69 + 12 * np.log2(seg / 440))
    assert wobble("ballad") > wobble("rock")


def test_voices_are_packaged():
    vs = soulx.voices()
    assert len(vs) >= 39 and all(v["kind"] in ("clear", "vibrato", "power") for v in vs)
    assert all((soulx.VOICES / v["id"] / "prompt.wav").exists() for v in vs)
