"""Keep only the voice of a rendered song (Demucs), for "a cappella" songs.

A singing model asked for "a cappella" usually obeys, but often leaves a pad, a click track or a little
reverb tail of instruments. Demucs separates the voice from everything else, so the result is a clean,
dry vocal that can be used like a recorded a cappella. Without Demucs the song is kept as rendered.
"""
from __future__ import annotations


def isolate_vocals(path: str) -> tuple[bool, str]:
    """Replace the WAV at `path` by its vocal stem. Returns (done, note)."""
    try:
        import torch
        import torchaudio
        import soundfile as sf
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError:
        return False, ("Demucs is not installed, so the voice was not separated from what the model may have "
                       "added. Install it in Settings → AI Engines (Stem Splitter) for a completely clean a cappella.")
    try:
        model = get_model("htdemucs")
        data, sr = sf.read(path, dtype="float32", always_2d=True)
        wav = torch.from_numpy(data.T.copy())
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        from services.resource_profile import resources
        res = resources()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        with torch.no_grad():
            try:
                out = apply_model(model, ((wav - mean) / std)[None], device=device,
                                  segment=res.demucs_segment_s, num_workers=res.demucs_jobs)[0]
            except RuntimeError:                   # out of GPU memory next to the music model: use the CPU
                out = apply_model(model, ((wav - mean) / std)[None], device="cpu",
                                  segment=res.demucs_segment_s, num_workers=res.demucs_jobs)[0]
        vocals = out[model.sources.index("vocals")] * std + mean
        vocals = torchaudio.functional.resample(vocals.cpu(), model.samplerate, sr)
        sf.write(path, vocals.numpy().T, sr, subtype="PCM_16", format="WAV")
        return True, ""
    except Exception as e:  # noqa: BLE001 - never lose the song because of this step
        return False, f"The voice could not be separated ({e}); the song is kept as the model rendered it."
