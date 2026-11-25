import numpy as np

from services.revoice import _has_vocals, mix, voice_gender, voice_name


def test_voices_known():
    assert voice_name("f1-clear") == "Anna"
    assert voice_gender("f1-clear") == "female"
    assert voice_gender("m3-clear") == "male"
    assert voice_gender("nope") == ""


def test_mix_puts_the_new_voice_at_the_old_level():
    sr = 44100
    t = np.arange(sr * 2) / sr
    music = np.stack([0.1 * np.sin(2 * np.pi * 110 * t)] * 2, 1).astype(np.float32)
    old = np.stack([0.3 * np.sin(2 * np.pi * 440 * t)] * 2, 1).astype(np.float32)
    new = (0.05 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)[:, None]
    out = mix(music, sr, new, sr, old)
    v = out - music
    assert out.shape == music.shape
    assert abs(np.sqrt(np.mean(v[:, 0] ** 2)) - np.sqrt(np.mean(old[:, 0] ** 2))) < 0.02
    assert np.allclose(v[:, 0], v[:, 1])                      # in the middle


def test_vocals_detected():
    music = np.full((44100, 2), 0.1, np.float32)
    assert _has_vocals(np.full((44100, 2), 0.1, np.float32), music)
    assert not _has_vocals(np.full((44100, 2), 0.0005, np.float32), music)
