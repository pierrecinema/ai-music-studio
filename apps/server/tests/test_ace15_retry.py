"""ACE-Step 1.5 with several takes: when memory runs out part way, the rest is made by a fresh worker."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import music_engines  # noqa: E402


def test_memory_error_restarts_for_the_remaining_takes(monkeypatch):
    calls = []

    def fake_run(song, wav, on_stage, on_step, on_proc, log, on_warning, more, on_done):
        outs = [wav] + [m["out"] for m in more]
        calls.append(outs)
        # first run: 3 takes finish, then the 4th runs out of memory
        n = 3 if len(calls) == 1 else len(outs)
        for k in range(n):
            on_done(k, 60.0 + k)
        if n < len(outs):
            raise RuntimeError("ACE-Step 1.5 failed: RuntimeError: [enforce fail at alloc_cpu.cpp:117] DefaultCPUAllocator: not enough memory")
        return 60.0

    monkeypatch.setattr(music_engines, "_run_ace15", fake_run)
    got, warnings = [], []
    secs = music_engines.generate_ace15({"seed": 1}, "a.wav", more=[{"seed": 2, "out": "b.wav"}, {"seed": 3, "out": "c.wav"}, {"seed": 4, "out": "d.wav"}],
                                        on_done=lambda i, s: got.append(i), on_warning=warnings.append, log=lambda *_: None)
    assert secs == 60.0
    assert got == [0, 1, 2, 3]
    assert calls[1] == ["d.wav"] and warnings


def test_other_errors_are_not_retried(monkeypatch):
    def fake_run(song, wav, *a):
        raise RuntimeError("ACE-Step 1.5 failed: bad lyrics")
    monkeypatch.setattr(music_engines, "_run_ace15", fake_run)
    try:
        music_engines.generate_ace15({"seed": 1}, "a.wav", log=lambda *_: None)
    except RuntimeError as e:
        assert "bad lyrics" in str(e)
    else:
        raise AssertionError("should fail")
