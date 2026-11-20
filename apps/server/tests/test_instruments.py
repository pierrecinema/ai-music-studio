"""AI Instruments: voice splitting, instrument ranges and the request checks of the /instruments routes."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.midi_ddsp_worker import INSTRUMENTS, RANGES, fit_range, split_voices  # noqa: E402


def n(pitch, start, end):
    return {"pitch": pitch, "start": start, "end": end, "velocity": 100}


def test_melody_stays_one_voice():
    voices = split_voices([n(60, 0, 1), n(62, 1, 2), n(64, 2, 3)], 4)
    assert len(voices) == 1 and [x["pitch"] for x in voices[0]] == [60, 62, 64]


def test_chord_goes_to_several_players_highest_first():
    voices = split_voices([n(60, 0, 2), n(64, 0, 2), n(67, 0, 2)], 4)
    assert len(voices) == 3 and voices[0][0]["pitch"] == 67


def test_more_notes_than_players_cuts_the_earliest_short():
    voices = split_voices([n(60, 0, 4), n(64, 1, 2)], 1)
    assert len(voices) == 1 and voices[0][0]["end"] == 1 and voices[0][1]["pitch"] == 64


def test_every_instrument_has_a_range_and_notes_are_moved_into_it():
    for inst in INSTRUMENTS.values():
        assert inst in RANGES
    assert fit_range(40, "violin") == 64 and fit_range(100, "tuba") == 64 and fit_range(60, "flute") == 60


def test_routes_check_the_request():
    try:
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
    except ImportError:  # pragma: no cover - CI installs fastapi
        return
    from api.routes import instruments
    app = FastAPI()
    app.include_router(instruments.router, prefix="/instruments")
    c = TestClient(app)
    assert len(c.get("/instruments/list").json()) == 13
    assert c.post("/instruments/play", json={"instrument": "kazoo", "notes": [n(60, 0, 1)]}).status_code == 400
    assert c.post("/instruments/play", json={"instrument": "violin", "notes": []}).status_code == 400
    os.environ.pop("AMS_DDSP_PYTHON", None)
    assert c.post("/instruments/play", json={"instrument": "violin", "notes": [n(60, 0, 1)]}).status_code == 409


def test_long_melodies_are_split_into_phrases():
    from services.midi_ddsp_worker import split_phrases
    notes = [n(60, 0, 1), n(62, 1, 2), n(64, 3, 4)] + [n(60 + k % 5, 4 + k * 0.5, 4.5 + k * 0.5) for k in range(60)]
    ph = split_phrases(notes)
    assert len(ph) >= 3 and ph[0][-1]["pitch"] == 62 and all(p[-1]["start"] - p[0]["start"] <= 20 for p in ph)
    assert sum(len(p) for p in ph) == len(notes)
