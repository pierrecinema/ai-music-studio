import sys
import types

import numpy as np
import soundfile as sf

from services import audio_save


class FakeTensor:
    """Just enough of a torch tensor: detach / cpu / numpy."""
    def __init__(self, a): self.a = a
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return self.a


def _fake_torchaudio(monkeypatch, fail_with):
    saved = []
    mod = types.ModuleType("torchaudio")
    def save(uri, src, sample_rate, channels_first=True, format=None, **kw):
        if fail_with:
            raise ImportError(fail_with)
        saved.append(uri)
    mod.save = save
    monkeypatch.setitem(sys.modules, "torchaudio", mod)
    return mod, saved


def test_fallback_writes_the_file_when_torchcodec_is_missing(tmp_path, monkeypatch):
    mod, _ = _fake_torchaudio(monkeypatch, "TorchCodec is required for save_with_torchcodec. Please install torchcodec to use this function.")
    assert audio_save.patch_torchaudio_save()
    out = tmp_path / "song.wav"
    wave = np.stack([np.sin(np.linspace(0, 200, 4800)), np.cos(np.linspace(0, 200, 4800))]).astype("float32")   # 2 x 4800
    mod.save(str(out), FakeTensor(wave), 48000, channels_first=True, backend="soundfile")
    data, rate = sf.read(str(out))
    assert rate == 48000 and data.shape == (4800, 2)


def test_other_errors_are_not_hidden(tmp_path, monkeypatch):
    mod, _ = _fake_torchaudio(monkeypatch, "disk full")
    audio_save.patch_torchaudio_save()
    try:
        mod.save(str(tmp_path / "x.wav"), FakeTensor(np.zeros((2, 10), "float32")), 48000)
    except ImportError as e:
        assert "disk full" in str(e)
    else:
        raise AssertionError("the original error must pass through")


def test_works_normally_and_patches_once(tmp_path, monkeypatch):
    mod, saved = _fake_torchaudio(monkeypatch, None)
    audio_save.patch_torchaudio_save()
    first = mod.save
    audio_save.patch_torchaudio_save()
    assert mod.save is first                                     # not wrapped twice
    mod.save(str(tmp_path / "a.wav"), FakeTensor(np.zeros((2, 10), "float32")), 48000)
    assert saved == [str(tmp_path / "a.wav")]
