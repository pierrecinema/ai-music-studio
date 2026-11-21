"""DiffSinger singing (services/diffsinger.py): words on notes, phonemes on notes, phrases, lyrics, G2P."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
yaml = pytest.importorskip("yaml")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import diffsinger as ds  # noqa: E402


def n(p, s, e, l):
    return {"pitch": p, "start": s, "end": e, "lyric": l}


def test_words_and_phrases():
    notes = [n(60, 0, 0.5, "hel"), n(62, 0.5, 1, "+"), n(64, 1, 1.5, "world"), n(60, 3, 3.5, "again")]
    assert ds.words_of(notes) == [[0, 1], [2], [3]]
    assert [len(p) for p in ds.split_phrases(notes)] == [3, 1]


def _dict(tmp_path):
    (tmp_path / "dsdict.yaml").write_text(
        "symbols:\n  - {symbol: a, type: vowel}\n  - {symbol: o, type: vowel}\n  - {symbol: l, type: liquid}\n  - {symbol: m, type: nasal}\n  - {symbol: t, type: stop}\n"
        "entries:\n  - {grapheme: lamo, phonemes: [l, a, m, o]}\n  - {grapheme: mat, phonemes: [m, a, t]}\n", encoding="utf-8")
    tokens = {p: i for i, p in enumerate(["<PAD>", "SP", "AP", "a", "o", "l", "m", "t"])}
    return ds.Dictionary(str(tmp_path), None, tokens), tokens


def test_consonants_before_the_note_vowels_on_it(tmp_path):
    d, tokens = _dict(tmp_path)
    notes = [n(60, 1.0, 1.5, "lamo"), n(62, 1.5, 2.0, "+")]
    ph = ds.place_phonemes(notes, d, tokens)
    assert [p.ph for p in ph] == ["l", "a", "m", "o"]
    assert ph[0].end == pytest.approx(1.0) and ph[0].start < 1.0          # "l" sounds just before the first note
    assert ph[1].start == pytest.approx(1.0)                              # "a" starts on the note
    assert ph[3].start == pytest.approx(1.5) and ph[3].end == pytest.approx(2.0)   # "o" on the second note


def test_melisma_and_closing_consonant(tmp_path):
    d, tokens = _dict(tmp_path)
    notes = [n(60, 0.0, 0.5, "mat"), n(64, 0.5, 1.0, "+")]
    ph = ds.place_phonemes(notes, d, tokens)
    assert [p.ph for p in ph] == ["m", "a", "t"]
    a, t = ph[1], ph[2]
    assert a.start == pytest.approx(0.0) and t.end == pytest.approx(1.0) and a.end < t.start + 1e-9   # held over both notes


def test_unknown_lyrics_are_reported(tmp_path):
    d, tokens = _dict(tmp_path)
    unknown = []
    ds.place_phonemes([n(60, 0, 1, "xyz")], d, tokens, unknown=unknown)
    assert unknown == ["xyz"]


def test_lyrics_on_notes_and_g2p():
    pytest.importorskip("onnxruntime")
    assert ds.g2p("en").query("hello") == ["hh", "ah", "l", "ow"]
    assert ds.syllable_count("Schmetterling", "de") == 3
    assert ds.syllable_count("corazón", "es") == 3
    assert ds.assign_lyrics("hello world", 4, "en") == ["hello", "+", "world", ""]
    assert ds.assign_lyrics("ma ma ma", 2, "en") == ["ma", "ma"]
