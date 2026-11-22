"""The singer's worker: runs in the singer's own environment (PyTorch on the processor) with vendor/ on the path.
Loads SoulX-Singer once, then reads one request per line on stdin and answers with JSON lines on stdout:
  {"prompt_wav", "prompt_meta", "segments": [meta, ...], "out", "steps"} -> {"progress": [done, total]} ... {"done": true, "file"}
Each segment is one phrase with its place in the song ("time" in ms); the result is one WAV of the whole song.
"""
import copy
import json
import os
import sys
import traceback


def say(**kw) -> None:
    sys.stdout.write(json.dumps(kw) + "\n"); sys.stdout.flush()


def main() -> None:
    models = sys.argv[1]
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from soulxsinger.utils.file_utils import load_config
        from soulxsinger.models.soulxsinger import SoulXSinger
        from soulxsinger.utils.data_processor import DataProcessor
        torch.set_num_threads(max(1, os.cpu_count() or 1))
        pkg = os.path.dirname(sys.modules["soulxsinger"].__file__)
        cfg = load_config(os.path.join(pkg, "config", "soulxsinger.yaml"))
        model = SoulXSinger(cfg)
        ck = torch.load(os.path.join(models, "SoulX-Singer", "model.pt"), weights_only=False, map_location="cpu")
        model.load_state_dict(ck["state_dict"], strict=True)
        model.eval()
        dp = DataProcessor(hop_size=cfg.audio.hop_size, sample_rate=cfg.audio.sample_rate,
                           phoneset_path=os.path.join(pkg, "utils", "phoneme", "phone_set.json"), device="cpu")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        say(error=f"The singer could not start: {type(e).__name__}: {e}")
        return
    say(ready=True)
    sr = cfg.audio.sample_rate
    for line in sys.stdin:
        try:
            req = json.loads(line)
            prompt = dp.process(copy.deepcopy(req["prompt_meta"]), req["prompt_wav"])
            segs = req["segments"]
            end = max(s["time"][1] for s in segs) / 1000 + 0.5
            song = np.zeros(int(end * sr) + sr, np.float32)
            for k, meta in enumerate(segs):
                say(progress=[k, len(segs)])
                target = dp.process(copy.deepcopy(meta), None)
                with torch.no_grad():
                    wav = model.infer({"prompt": prompt, "target": target}, auto_shift=True, pitch_shift=0,
                                      n_steps=int(req.get("steps", 32)), cfg=cfg.infer.cfg, control="melody")
                wav = wav.squeeze().cpu().numpy().astype(np.float32)
                a = int(meta["time"][0] / 1000 * sr)
                n = min(len(wav), len(song) - a)
                # a short fade at both ends, so phrases join without clicks
                f = min(240, n // 4)
                if f > 0:
                    wav[:f] *= np.linspace(0, 1, f); wav[n - f:n] *= np.linspace(1, 0, f)
                song[a:a + n] += wav[:n]
            say(progress=[len(segs), len(segs)])
            peak = float(np.max(np.abs(song))) or 1.0
            if peak > 0.98:
                song *= 0.98 / peak
            sf.write(req["out"], song, sr, subtype="PCM_24")
            say(done=True, file=req["out"])
        except Exception as e:  # noqa: BLE001
            traceback.print_exc(file=sys.stderr)
            say(error=f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
