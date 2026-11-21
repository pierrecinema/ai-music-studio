"""Audio -> MIDI helpers (services/transcribe.py): one-voice lines, fragments, chords cleanup, grid, key, drums."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import transcribe as tr  # noqa: E402


def n(p, s, e, v=100, c=0.9):
    return {"pitch": p, "start": s, "end": e, "velocity": v, "confidence": c}


def test_bass_line_keeps_the_low_note_and_drops_overtones_and_blips():
    notes = [n(33, 0.0, 0.9), n(45, 0.01, 0.5, 70),            # the octave above starts with it: an overtone
             n(40, 0.3, 0.4, 60),                               # a short blip inside the ringing note
             n(28, 1.0, 1.9), n(40, 1.2, 1.5, 80)]              # a twelfth that starts while E1 rings
    line = tr.monophonic(notes, "bass")
    assert [x["pitch"] for x in line] == [33, 28]
    assert line[0]["end"] <= line[1]["start"]


def test_melody_takes_the_strongest_of_notes_starting_together():
    line = tr.monophonic([n(64, 0.0, 0.5, 60), n(67, 0.01, 0.5, 110), n(69, 0.5, 1.0)], "melody")
    assert [x["pitch"] for x in line] == [67, 69]


def test_fragments_of_one_held_note_are_joined_but_a_new_attack_stays():
    notes = [n(60, 0.0, 0.5, 100), n(60, 0.51, 1.0, 70),          # quieter piece right after: same note
             n(60, 1.2, 1.6, 110)]                                  # louder after a gap: struck again
    out = tr.merge_fragments(notes)
    assert [(x["start"], x["end"]) for x in out] == [(0.0, 1.0), (1.2, 1.6)]


def test_chords_cleanup_removes_octave_echo_and_ghost_notes():
    notes = [n(60, 0.0, 1.0, 110), n(64, 0.0, 1.0, 100), n(72, 0.01, 1.0, 40), n(50, 0.5, 0.6, 10)]
    assert sorted(x["pitch"] for x in tr.clean_poly(notes)) == [60, 64]


def test_seconds_to_beats_with_quantize():
    out = tr.to_beats([n(60, 0.52, 1.0)], bpm=120, first_beat=0.0, quantize=0.25, strength=1.0)
    assert out[0]["startTime"] == 1.0 and out[0]["duration"] == 1.0
    half = tr.to_beats([n(60, 0.52, 1.0)], bpm=120, first_beat=0.0, quantize=0.25, strength=0.5)
    assert 1.0 < half[0]["startTime"] < 1.04
    before = tr.to_beats([n(60, 0.0, 0.2)], bpm=120, first_beat=0.5)        # ends before the first bar
    assert before == []


def test_key_of_a_major_and_a_minor_profile():
    assert tr.key_of(np.roll(tr._MAJ, 7))[:2] == (7, "major")             # G major
    assert tr.key_of(np.roll(tr._MIN, 9))[:2] == (9, "minor")             # A minor


def test_drums_on_a_synthetic_beat():
    pytest.importorskip("librosa")
    sr = 44100
    y = np.zeros(sr * 4, dtype=np.float32)
    t = np.arange(int(0.15 * sr)) / sr
    kick = (np.sin(2 * np.pi * 55 * t) * np.exp(-t * 25)).astype(np.float32)
    rng = np.random.default_rng(1)
    snare = (rng.standard_normal(len(t)) * np.exp(-t * 30) * 0.5 + np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.5).astype(np.float32)
    hat = np.diff(rng.standard_normal(len(t) + 1)).astype(np.float32) * np.exp(-t * 80).astype(np.float32) * 0.3
    beat = 0.5
    for k in range(8):
        i = int(k * beat * sr)
        y[i: i + len(t)] += kick if k % 2 == 0 else snare
        j = int((k * beat + beat / 2) * sr)
        y[j: j + len(t)] += hat
    notes = tr.drum_notes((y, sr))
    got = {p: sorted(round(x["start"] * 2) / 2 for x in notes if x["pitch"] == p) for p in (36, 38)}
    assert got[36][:4] == [0.0, 1.0, 2.0, 3.0]
    assert got[38][:4] == [0.5, 1.5, 2.5, 3.5]
    assert sum(1 for x in notes if x["pitch"] in (42, 46)) >= 6
