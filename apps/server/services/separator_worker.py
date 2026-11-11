"""Fast vocal / instrumental separation with an MDX-Net ONNX model (audio-separator), in its own environment.

Usage: python separator_worker.py request.json
Request: {"input": path, "out_dir": dir, "model_dir": dir, "mode": "vocals" | "4stems", "fast": bool}
  vocals: one MDX-Net model, vocals + instrumental.
  4stems: the four MDX-Net models of the KUIELab (Music Demixing Challenge), one per stem: vocals, drums, bass, other.
Prints one JSON object per line: {"stage": text}, {"done": true, "files": {"vocals": path, "instrumental": path},
"device": "..."} or {"error": "..."}. Anything else on stdout is library chatter and is ignored.

On Windows with AMD / Intel graphics the DirectML build is installed: the model then runs on the graphics card
(DirectX 12). If that fails (old driver, too little memory), it runs again on the processor.
"""
from __future__ import annotations

import glob
import inspect
import json
import logging
import os
import sys


def say(**kw) -> None:
    print(json.dumps(kw), flush=True)


def providers() -> list[str]:
    try:
        import onnxruntime as ort
        return list(ort.get_available_providers())
    except Exception:  # noqa: BLE001
        return []


FOUR = ["vocals", "drums", "bass", "other"]


def make_separator(req: dict, directml: bool):
    from audio_separator.separator import Separator
    kw = {
        "log_level": logging.WARNING,
        "model_file_dir": req["model_dir"],
        "output_dir": req["out_dir"],
        "output_format": "WAV",
        "use_directml": directml,
        # smaller overlap = fewer passes; 0.25 is the library default
        "mdx_params": {"hop_length": 1024, "segment_size": 256, "overlap": 0.1 if req.get("fast") else 0.25,
                       "batch_size": 1, "enable_denoise": False},
    }
    accepted = set(inspect.signature(Separator.__init__).parameters)
    return Separator(**{k: v for k, v in kw.items() if k in accepted})


def absolute(req: dict, out: list[str]) -> list[str]:
    return [o if os.path.isabs(o) else os.path.join(req["out_dir"], o) for o in out]


def separate(req: dict, directml: bool) -> list[str]:
    sep = make_separator(req, directml)
    where = " on the graphics card" if directml else ""
    if req.get("mode") == "4stems":
        keep = []
        for i, stem in enumerate(FOUR):
            say(stage=f"Separating {stem} ({i + 1}/4){where}", part=i, parts=4)
            sep.load_model(model_filename=f"kuielab_a_{stem}.onnx")
            for f in absolute(req, sep.separate(req["input"])):
                if f"({stem})" in os.path.basename(f).lower():
                    keep.append(f)
                else:
                    try:
                        os.remove(f)                     # the rest of the song: not needed
                    except OSError:
                        pass
        return keep
    say(stage="Loading the model (downloads about 60 MB the first time)")
    sep.load_model(model_filename=req.get("model") or "UVR-MDX-NET-Inst_HQ_3.onnx")
    say(stage="Separating vocals and instrumental" + where)
    return absolute(req, sep.separate(req["input"]))


def main() -> int:
    req = json.load(open(sys.argv[1], encoding="utf-8"))
    os.makedirs(req["out_dir"], exist_ok=True)
    os.makedirs(req["model_dir"], exist_ok=True)
    try:
        import audio_separator  # noqa: F401
    except Exception as e:  # noqa: BLE001
        say(error=f"audio-separator cannot start: {type(e).__name__}: {e}")
        return 1
    prov = providers()
    want_dml = "DmlExecutionProvider" in prov
    device = "CUDA" if "CUDAExecutionProvider" in prov else "DirectML" if want_dml else "processor"
    try:
        files = separate(req, want_dml)
    except Exception as e:  # noqa: BLE001
        if not want_dml:
            say(error=f"Separation failed: {type(e).__name__}: {e}")
            return 1
        say(stage=f"The graphics card did not work ({type(e).__name__}); separating on the processor")
        device = "processor"
        try:
            files = separate(req, False)
        except Exception as e2:  # noqa: BLE001
            say(error=f"Separation failed: {type(e2).__name__}: {e2}")
            return 1
    if not files:
        files = glob.glob(os.path.join(req["out_dir"], "*.wav"))
    result = {}
    for f in files:
        name = os.path.basename(f).lower()
        if req.get("mode") == "4stems":
            for stem in FOUR:
                if f"({stem})" in name:
                    result[stem] = f
        elif "(vocals)" in name or ("vocals" in name and "instrumental" not in name):
            result["vocals"] = f
        elif "(instrumental)" in name or "instrumental" in name:
            result["instrumental"] = f
    if not result:
        say(error=f"No output files were found ({files}).")
        return 1
    say(done=True, files=result, device=device)
    return 0


if __name__ == "__main__":
    sys.exit(main())
