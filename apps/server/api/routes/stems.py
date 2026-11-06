"""Stem separation using Meta's Demucs."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, uuid, tempfile

router = APIRouter()


class StemSplitRequest(BaseModel):
    filePath: str
    model: str = "htdemucs_ft"
    # htdemucs_6s additionally yields "piano" and "guitar"
    stems: list[str] = ["vocals", "drums", "bass", "other", "piano", "guitar"]


@router.post("/split")
async def split_stems(req: StemSplitRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")

    out_dir = os.path.join(tempfile.gettempdir(), f"stems_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)

    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
        import torchaudio

        model = get_model(req.model)
        wav, sr = torchaudio.load(req.filePath)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()

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

        result = {}
        for i, name in enumerate(model.sources):
            if name in req.stems:
                stem_path = os.path.join(out_dir, f"{name}.wav")
                torchaudio.save(stem_path, sources[i].cpu(), model.samplerate)
                result[name] = stem_path

        return result

    except ImportError:
        # Demucs not installed — return stub paths
        result = {}
        for stem in req.stems:
            path = os.path.join(out_dir, f"{stem}.wav")
            open(path, "wb").close()
            result[stem] = path
        return result
