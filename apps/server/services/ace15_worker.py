"""Runs ACE-Step 1.5 in its own environment (started by services.music_engines.generate_ace15).

Usage: python ace15_worker.py request.json
The request holds the song (caption, lyrics, length, tempo, ...) and the output WAV path. Progress and the result
are printed as one JSON object per line: {"stage": ...}, {"step": n, "total": m}, {"done": true, "seconds": s} or
{"error": "..."}. Anything else on stdout is library chatter and is ignored by the backend.

Written from the ACE-Step 1.5 documentation (docs/en/INFERENCE.md): AceStepHandler + generate_music with the 2B
turbo model and without the language model ("DiT only"), the mode the project recommends for small machines.
Parameters a given ACE-Step version does not know are left out instead of failing.
"""
from __future__ import annotations

import dataclasses
import json
import os
import shutil
import sys
import wave


def say(**kw) -> None:
    print(json.dumps(kw), flush=True)


def only_known(cls, values: dict) -> dict:
    """Keep the fields the dataclass (or class) accepts."""
    try:
        names = {f.name for f in dataclasses.fields(cls)}
    except TypeError:
        import inspect
        names = set(inspect.signature(cls).parameters)
    return {k: v for k, v in values.items() if k in names and v is not None}


def main() -> int:
    req = json.load(open(sys.argv[1], encoding="utf-8"))
    os.environ.setdefault("ACESTEP_INIT_LLM", "false")          # DiT only: no language model, less memory
    if req.get("checkpoints"):
        os.environ.setdefault("ACESTEP_CHECKPOINTS_DIR", req["checkpoints"])
    say(stage="load", text="Loading ACE-Step 1.5. The first time it downloads the model (about 10 GB).")
    try:
        import torch
        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
        from acestep.inference import GenerationConfig, GenerationParams, generate_music
    except Exception as e:  # noqa: BLE001
        say(error=f"ACE-Step 1.5 cannot start: {type(e).__name__}: {e}. Repair it: Settings → AI Engines → "
                  "tick ACE-Step 1.5 → Install selected.")
        return 1

    device = "cuda" if torch.cuda.is_available() else "cpu"
    say(stage="load", text=f"Loading ACE-Step 1.5 on the {'graphics card' if device == 'cuda' else 'processor'}.")
    dit = AceStepHandler()
    init = {"project_root": req["repo"], "config_path": req.get("model", "acestep-v15-turbo"), "device": device}
    try:
        import inspect
        accepted = set(inspect.signature(dit.initialize_service).parameters)
        if "offload_to_cpu" in accepted and device == "cuda":
            init["offload_to_cpu"] = True
        out = dit.initialize_service(**{k: v for k, v in init.items() if k in accepted or not accepted})
        if isinstance(out, tuple) and len(out) == 2 and out[1] is False:
            say(error=f"ACE-Step 1.5 could not load the model: {out[0]}")
            return 1
    except Exception as e:  # noqa: BLE001
        say(error=f"ACE-Step 1.5 could not load the model: {type(e).__name__}: {e}")
        return 1
    llm = LLMHandler()                                             # not initialised: no language model

    params = GenerationParams(**only_known(GenerationParams, {
        "caption": req.get("caption", "")[:512],
        "lyrics": (req.get("lyrics") or "")[:4096] or ("[Instrumental]" if req.get("instrumental") else ""),
        "instrumental": bool(req.get("instrumental")),
        "bpm": req.get("bpm"),
        "keyscale": req.get("key") or "",
        "timesignature": req.get("time_signature") or "",
        "vocal_language": req.get("language") or "unknown",
        "duration": float(req["seconds"]),
        "inference_steps": int(req.get("steps", 8)),
        "seed": int(req.get("seed", -1)),
        "shift": 3.0,                                              # recommended for the turbo model
        "thinking": False,
        "use_cot_metas": False,
        "use_cot_caption": False,
        "use_cot_language": False,
    }))
    config = GenerationConfig(**only_known(GenerationConfig, {
        "batch_size": 1,
        "use_random_seed": False,
        "seeds": [int(req.get("seed", 0))],
        "audio_format": "wav",
    }))
    out_dir = os.path.dirname(os.path.abspath(req["out"]))

    def progress(value=None, desc=None, *a, **kw):                 # gradio-style progress(value, desc=...)
        try:
            frac = float(value[0] / value[1]) if isinstance(value, tuple) else float(value)
        except (TypeError, ValueError, ZeroDivisionError):
            return
        say(step=int(max(0.0, min(1.0, frac)) * 100), total=100, text=str(desc or "Composing the song"))

    say(stage="render", text="Composing the song")
    try:
        try:
            result = generate_music(dit, llm, params, config, save_dir=out_dir, progress=progress)
        except TypeError:
            result = generate_music(dit, llm, params, config, save_dir=out_dir)
    except Exception as e:  # noqa: BLE001
        say(error=f"ACE-Step 1.5 failed: {type(e).__name__}: {e}")
        return 1
    if not getattr(result, "success", False) or not getattr(result, "audios", None):
        say(error=f"ACE-Step 1.5 failed: {getattr(result, 'error', 'no audio returned')}")
        return 1
    src = result.audios[0].get("path")
    if not src or not os.path.exists(src):
        say(error="ACE-Step 1.5 returned no audio file.")
        return 1
    if os.path.abspath(src) != os.path.abspath(req["out"]):
        shutil.move(src, req["out"])
    try:
        with wave.open(req["out"], "rb") as w:
            seconds = w.getnframes() / float(w.getframerate())
    except wave.Error:                                             # e.g. 32-bit float WAV
        import soundfile as sf
        info = sf.info(req["out"])
        seconds = info.frames / float(info.samplerate)
    say(done=True, seconds=round(seconds, 2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
