"""Stem separation using Meta's Demucs."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, uuid, tempfile

import numpy as np

router = APIRouter()


class StemSplitRequest(BaseModel):
    filePath: str
    model: str = "htdemucs_ft"
    # htdemucs_6s additionally yields "piano" and "guitar"
    stems: list[str] = ["vocals", "drums", "bass", "other", "piano", "guitar"]


def read_audio(path: str) -> tuple[np.ndarray, int]:
    """(channels, samples) float32 and the sample rate. soundfile reads WAV, FLAC, AIFF, OGG and MP3; anything else
    goes through librosa (ffmpeg). torchaudio.load is not used: since torchaudio 2.9 it needs the separate
    TorchCodec package and fails without it, which left every stem empty."""
    try:
        import soundfile as sf
        data, sr = sf.read(path, dtype="float32", always_2d=True)       # (samples, channels)
        return np.ascontiguousarray(data.T), int(sr)
    except Exception:  # noqa: BLE001 - format soundfile cannot read: try librosa
        import librosa
        data, sr = librosa.load(path, sr=None, mono=False)
        data = np.atleast_2d(data).astype(np.float32)
        return data, int(sr)


def write_stem(path: str, audio: np.ndarray, sr: int) -> None:
    """(channels, samples) -> 32-bit float WAV (no clipping; every DAW reads it)."""
    import soundfile as sf
    sf.write(path, np.ascontiguousarray(audio.T), sr, subtype="FLOAT")


@router.post("/split")
async def split_stems(req: StemSplitRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")

    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError as e:
        raise HTTPException(
            503, f"Demucs is not installed ({e}). Install it in Settings → AI Engines → Demucs (stem separation).")

    out_dir = os.path.join(tempfile.gettempdir(), f"stems_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)

    try:
        model = get_model(req.model)
        data, sr = read_audio(req.filePath)
        if data.shape[0] == 1:
            data = np.repeat(data, 2, axis=0)
        data = data[:2]
        wav = torch.from_numpy(data)
        if sr != model.samplerate:
            import torchaudio.functional as AF                          # plain tensor maths, no TorchCodec needed
            wav = AF.resample(wav, sr, model.samplerate)
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        wav = (wav - mean) / std

        from services.hardware_detect import get_profile
        hw = get_profile()
        device = hw.torch_device
        # DirectML (AMD on Windows) needs CPU for Demucs inference — DML not fully supported by torchaudio ops
        if device == "privateuseone":
            device = "cpu"
        from services.resource_profile import resources
        res = resources()
        with torch.no_grad():
            sources = apply_model(
                model, wav[None], device=device,
                segment=res.demucs_segment_s, num_workers=res.demucs_jobs,
            )[0]
        sources = sources * std + mean                                  # back to the song's own level

        result = {}
        for i, name in enumerate(model.sources):
            if name in req.stems:
                stem_path = os.path.join(out_dir, f"{name}.wav")
                write_stem(stem_path, sources[i].cpu().numpy(), model.samplerate)
                result[name] = stem_path
        if not result:
            raise HTTPException(500, "Demucs returned no stems.")
        return result
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 - show the reason instead of empty "ready" stems
        raise HTTPException(500, f"Stem separation failed: {type(e).__name__}: {e}")
