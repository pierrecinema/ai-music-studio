"""MusicGen on a DirectX 12 graphics card (AMD, Intel) through torch-directml.

Runs as its own process inside the separate "DirectML" Python environment, because torch-directml
needs an old PyTorch (2.4.1) that must not replace the one the other engines use.

    python dml_worker.py request.json

Progress goes to stdout as one JSON object per line: {"stage": "...", "step": n, "total": m}.
The last line is {"done": true, "seconds": s} or {"error": "..."}.

DirectML has three gaps that MusicGen runs into; each has a workaround here:
  1. bool * long gives a bool, which breaks the delay-pattern mask  -> build that mask on the CPU
  2. the EnCodec decoder uses an LSTM cell DirectML does not have    -> decode on the CPU (cheap)
  3. weight-norm falls back to the CPU by itself (a warning, harmless)
The heavy part, the 300M-parameter transformer that predicts the audio tokens, runs on the GPU.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import time
import warnings

os.environ.setdefault("USE_TF", "0")
warnings.filterwarnings("ignore")


def say(**kw) -> None:
    print(json.dumps(kw), flush=True)


def main(req_path: str) -> None:
    req = json.load(open(req_path, encoding="utf-8"))
    say(stage="load", text="Loading the model onto the graphics card")
    import numpy as np
    import torch
    import torch_directml
    from scipy.io import wavfile
    from transformers import AutoProcessor, MusicgenForConditionalGeneration, StoppingCriteria, StoppingCriteriaList
    from transformers.models.musicgen import modeling_musicgen as mm

    orig_mask = mm.MusicgenForCausalLM.build_delay_pattern_mask

    def cpu_mask(self, input_ids, pad_token_id, max_length=None):
        pad = pad_token_id.cpu() if torch.is_tensor(pad_token_id) else pad_token_id
        a, b = orig_mask(self, input_ids.cpu(), pad, max_length)
        return a.to(input_ids.device), b.to(input_ids.device)

    mm.MusicgenForCausalLM.build_delay_pattern_mask = cpu_mask

    dml = torch_directml.device()
    name = torch_directml.device_name(0).strip("\x00") if torch_directml.device_count() else "graphics card"
    repo = req["repo"]
    processor = AutoProcessor.from_pretrained(repo)
    model = MusicgenForConditionalGeneration.from_pretrained(repo).to(dml)
    encoder = model.audio_encoder.to("cpu")
    plain_decode = encoder.decode
    encoder.decode = lambda codes, *a, **k: plain_decode(codes.cpu(), *a, **k)

    plain_encode = encoder.encode

    def cpu_encode(*a, **k):
        to_cpu = lambda v: v.cpu() if torch.is_tensor(v) else v    # noqa: E731 - the prompt audio arrives on the GPU
        out = plain_encode(*[to_cpu(v) for v in a], **{kk: to_cpu(vv) for kk, vv in k.items()})
        to_gpu = lambda v: v.to(dml) if torch.is_tensor(v) else ([to_gpu(i) for i in v] if isinstance(v, list) else v)  # noqa: E731
        if isinstance(out, tuple):
            return tuple(to_gpu(v) for v in out)
        for key in list(out.keys()):                                  # the model lives on the GPU: hand the codes back
            out[key] = to_gpu(out[key])
        return out

    encoder.encode = cpu_encode
    from musicgen_long import generate_long, total_tokens
    total = total_tokens(int(req["seconds"]))
    say(stage="render", text=f"Composing on {name}", step=0, total=total)

    def make_stop(tick):
        class Tick(StoppingCriteria):
            def __call__(self, input_ids, scores, **kw):
                tick(int(input_ids.shape[-1]))
                return False
        return StoppingCriteriaList([Tick()])

    rate = model.config.audio_encoder.sampling_rate
    data = generate_long(model, processor, dml, req["prompt"], int(req["seconds"]), int(req["seed"]),
                         float(req.get("guidance", 3.0)), rate,
                         on_step=lambda d, t: say(stage="render", step=d, total=t),
                         to_device=lambda v: v.to(dml), make_stop=make_stop)
    wavfile.write(req["out"], rate, (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16))
    say(done=True, seconds=len(data) / float(rate), device=name)


if __name__ == "__main__":
    t0 = time.time()
    try:
        main(sys.argv[1])
    except Exception as e:  # noqa: BLE001 - reported to the app
        say(error=f"{type(e).__name__}: {str(e)[:300]}")
        sys.exit(1)
