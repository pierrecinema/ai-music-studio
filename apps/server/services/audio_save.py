"""Saving audio when torchaudio cannot.

torchaudio 2.9 and newer write files through TorchCodec. Without it every `torchaudio.save` fails with "TorchCodec is
required for save_with_torchcodec. Please install torchcodec to use this function." ACE-Step v1 saves its songs with
`torchaudio.save` inside its own code, so a PC without a matching TorchCodec made every song fail at the very end
(GitHub issue #171). `patch_torchaudio_save()` puts a fallback around it: if torchaudio fails with that error, the file is
written with soundfile (WAV, FLAC, OGG, MP3), which needs no TorchCodec. Everything else behaves as before.
"""
from __future__ import annotations

import os

_FORMATS = {".wav": "WAV", ".flac": "FLAC", ".ogg": "OGG", ".mp3": "MP3"}


def save_with_soundfile(uri, src, sample_rate: int, channels_first: bool = True, format: str | None = None) -> None:
    """Write a tensor / array (channels x samples when `channels_first`) with soundfile."""
    import soundfile as sf
    data = src.detach().cpu().numpy() if hasattr(src, "detach") else src
    if getattr(data, "ndim", 1) == 2 and channels_first:
        data = data.T                                             # soundfile wants samples x channels
    ext = os.path.splitext(str(uri))[1].lower()
    fmt = (format or "").upper() or _FORMATS.get(ext, "WAV")
    sf.write(str(uri), data, int(sample_rate), format=fmt)


def patch_torchaudio_save() -> bool:
    """Wrap `torchaudio.save` once; returns True when the fallback is in place."""
    try:
        import torchaudio
    except Exception:  # noqa: BLE001 - no torchaudio: nothing to patch
        return False
    original = torchaudio.save
    if getattr(original, "_ams_patched", False):
        return True

    def save(uri, src, sample_rate, channels_first=True, format=None, *args, **kwargs):
        try:
            return original(uri, src, sample_rate, channels_first=channels_first, format=format, *args, **kwargs)
        except Exception as e:  # noqa: BLE001
            if "torchcodec" not in str(e).lower():
                raise
            return save_with_soundfile(uri, src, sample_rate, channels_first, format)

    save._ams_patched = True  # type: ignore[attr-defined]
    torchaudio.save = save
    return True
