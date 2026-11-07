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

    wanted = int(req["seconds"] * 50)
    say(stage="render", text=f"Composing on {name}", step=0, total=wanted)

    class Tick(StoppingCriteria):
        def __call__(self, input_ids, scores, **kw):
            say(stage="render", step=min(int(input_ids.shape[-1]), wanted), total=wanted)
            return False

    inputs = processor(text=[req["prompt"]], padding=True, return_tensors="pt")
    inputs = {k: v.to(dml) for k, v in inputs.items()}
    torch.manual_seed(int(req["seed"]) % (2**31))
    with torch.no_grad():
        audio = model.generate(**inputs, do_sample=True, guidance_scale=float(req.get("guidance", 3.0)),
                               max_new_tokens=wanted, stopping_criteria=StoppingCriteriaList([Tick()]))
    rate = model.config.audio_encoder.sampling_rate
    data = audio[0].detach().float().cpu().numpy()
    data = data.T if data.ndim == 2 else data
    data = np.clip(data, -1.0, 1.0)
    wavfile.write(req["out"], rate, (data * 32767).astype(np.int16))
    say(done=True, seconds=len(data) / float(rate), device=name)


if __name__ == "__main__":
    t0 = time.time()
    try:
        main(sys.argv[1])
    except Exception as e:  # noqa: BLE001 - reported to the app
        say(error=f"{type(e).__name__}: {str(e)[:300]}")
        sys.exit(1)
