"""Long tracks with MusicGen.

MusicGen's context holds about 40 seconds, and the model was trained on 30 second clips. A longer track is
built in steps: the first 30 seconds are made from the text alone; every following step takes the last 10
seconds of what exists as an audio prompt and continues for 20 new seconds. The seams are crossfaded.

This module has no imports of its own beyond numpy/torch so that both the normal backend and the
DirectML worker (a separate environment) can use it.
"""
from __future__ import annotations

FIRST_S = 30        # first clip, from text only
PROMPT_S = 10       # seconds of audio carried into the next step
STEP_S = 20         # new seconds per following step
XFADE_S = 0.25      # crossfade length at the seams
FRAME_RATE = 50     # audio tokens per second


def plan(seconds: int) -> list[tuple[int, int]]:
    """[(prompt_seconds, new_seconds), ...] for a track of `seconds`."""
    seconds = max(1, int(seconds))
    steps = [(0, min(seconds, FIRST_S))]
    made = steps[0][1]
    while made < seconds:
        new = min(STEP_S, seconds - made)
        steps.append((PROMPT_S, new))
        made += new
    return steps


def total_tokens(seconds: int) -> int:
    return sum(new * FRAME_RATE for _p, new in plan(seconds))


def generate_long(model, processor, device, prompt: str, seconds: int, seed: int, guidance: float, rate: int,
                  on_step=None, to_device=lambda x: x, make_stop=None):
    """Returns mono float32 audio of about `seconds` seconds.

    `to_device` moves the processor output to the device. `make_stop(callback)` returns a StoppingCriteriaList
    that calls callback(tokens_done_in_this_step) once per generated token.
    """
    import numpy as np
    import torch

    steps = plan(seconds)
    total = sum(n * FRAME_RATE for _p, n in steps)
    done_before = 0
    audio = np.zeros(0, dtype=np.float32)
    xf = int(XFADE_S * rate)
    for i, (prompt_s, new_s) in enumerate(steps):
        new_tokens = new_s * FRAME_RATE
        torch.manual_seed((seed + i) % (2**31))
        if prompt_s == 0:
            inputs = processor(text=[prompt], padding=True, return_tensors="pt")
            carried = 0
        else:
            carried = int(prompt_s * rate)
            tail = audio[-carried:]
            carried = len(tail)
            inputs = processor(text=[prompt], audio=tail, sampling_rate=rate, padding=True, return_tensors="pt")
        inputs = {k: to_device(v) for k, v in inputs.items()}
        prompt_tokens = int(carried / rate * FRAME_RATE)

        def tick(n_in_step: int, _b=done_before, _nt=new_tokens, _pt=prompt_tokens) -> None:
            if on_step:
                on_step(_b + min(max(n_in_step - _pt, 0), _nt), total)

        stop = make_stop(tick) if make_stop else None
        kwargs = {"stopping_criteria": stop} if stop is not None else {}
        with torch.no_grad():
            out = model.generate(**inputs, do_sample=True, guidance_scale=guidance,
                                 max_new_tokens=new_tokens, **kwargs)
        piece = out[0].detach().float().cpu().numpy()
        piece = piece[0] if piece.ndim == 2 else piece                   # mono: (channels, samples)
        piece = np.clip(piece.astype(np.float32).reshape(-1), -1.0, 1.0)
        if i == 0:
            audio = piece
        else:
            # the output starts with the re-encoded prompt: keep only the new part, crossfaded at the seam
            p = min(carried, len(piece))
            new_part = piece[max(p - xf, 0):]
            if len(new_part) > xf and len(audio) >= xf:
                fade = np.linspace(0.0, 1.0, xf, dtype=np.float32)
                audio[-xf:] = audio[-xf:] * (1.0 - fade) + new_part[:xf] * fade
                audio = np.concatenate([audio, new_part[xf:]])
            else:
                audio = np.concatenate([audio, new_part])
        done_before += new_tokens
        if on_step:
            on_step(done_before, total)
    return audio
