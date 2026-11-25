"""Voice exchange worker (Seed-VC, GPL-3): runs in the singer's Python environment and keeps the models loaded.

argv: <Seed-VC code dir> <models dir>. Requests on stdin, one JSON per line:
  {"source": vocals.wav, "target": the voice's prompt.wav, "out": result.wav, "steps": 25, "auto_f0": bool}
Answers on stdout: {"ready": true} once, then {"done": true, "file": ...} or {"error": ...} per request.

Seed-VC's own inference script is used as it is; only where it finds its files is changed: the models are plain files in
the models dir (no Hugging Face cache, whose symbolic links Windows refuses without admin rights).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import sys
import tempfile
import traceback
import types


def say(**kw) -> None:
    print(json.dumps(kw), flush=True)


def main() -> None:
    repo, models = sys.argv[1], sys.argv[2]
    try:
        sys.path.insert(0, repo)
        os.chdir(repo)
        # the descript-audio-codec quantizer is only used by models without pitch input: a stand-in, so that the
        # package (and its many dependencies) is not needed
        dac = types.ModuleType("dac"); nn = types.ModuleType("dac.nn"); q = types.ModuleType("dac.nn.quantize")
        q.VectorQuantize = object
        sys.modules.update({"dac": dac, "dac.nn": nn, "dac.nn.quantize": q})
        import torch
        import yaml
        from transformers import WhisperModel
        cuda = torch.cuda.is_available()
        if not cuda:                                      # the script loads whisper in float16, which the CPU cannot run
            orig = WhisperModel.from_pretrained.__func__

            def fp32(cls, *a, **k):
                k["torch_dtype"] = torch.float32
                return orig(cls, *a, **k)
            WhisperModel.from_pretrained = classmethod(fp32)
        import inference as inf

        files = {
            ("lj1995/VoiceConversionWebUI", "rmvpe.pt"): os.path.join(models, "rmvpe", "rmvpe.pt"),
            ("funasr/campplus", "campplus_cn_common.bin"): os.path.join(models, "campplus", "campplus_cn_common.bin"),
        }

        def local(repo_id, model_filename="pytorch_model.bin", config_filename=None):
            p = files[(repo_id, model_filename)]
            return p if config_filename is None else (p, None)
        inf.load_custom_model_from_hf = local

        dit = os.path.join(models, "dit", "DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth")
        cfg = yaml.safe_load(open(os.path.join(models, "dit", "config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"), encoding="utf-8"))
        cfg["model_params"]["vocoder"]["name"] = os.path.join(models, "bigvgan")
        cfg["model_params"]["speech_tokenizer"]["name"] = os.path.join(models, "whisper-small")
        cfg_path = os.path.join(models, "dit", "config-local.yml")
        with open(cfg_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(cfg, f)
        base = dict(f0_condition=True, checkpoint=dit, config=cfg_path, fp16=cuda, length_adjust=1.0,
                    inference_cfg_rate=0.7, semi_tone_shift=0)
        loaded = inf.load_models(argparse.Namespace(**base))
        inf.load_models = lambda _args: loaded              # main() loads the models each time: keep them
    except Exception as e:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        say(error=f"The voice exchange could not start: {type(e).__name__}: {e}")
        return
    say(ready=True)
    for line in sys.stdin:
        try:
            req = json.loads(line)
            with tempfile.TemporaryDirectory() as tmp:
                inf.main(argparse.Namespace(**base, source=req["source"], target=req["target"], output=tmp,
                                            diffusion_steps=int(req.get("steps", 25)), auto_f0_adjust=bool(req.get("auto_f0"))))
                made = glob.glob(os.path.join(tmp, "*.wav"))
                if not made:
                    raise RuntimeError("Seed-VC wrote no file")
                shutil.move(made[0], req["out"])
            say(done=True, file=req["out"])
        except Exception as e:  # noqa: BLE001
            traceback.print_exc(file=sys.stderr)
            say(error=f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
