"""Prepare datasets and run LoRA training for ACE-Step v1.

The training itself is the official trainer of the ACE-Step project (trainer.py in
https://github.com/ace-step/ACE-Step). This module does what the trainer expects around it:

  * data in the format of its TRAIN_INSTRUCTION.md: name.mp3, name_prompt.txt (comma separated
    tags), name_lyrics.txt
  * a LoRA config, a plan with sensible numbers for this computer, and the command line
  * a bundle you can take to a stronger PC, and a runner with progress for this PC

The trainer saves the adapter as pytorch_lora_weights.safetensors, which is exactly the file the
generator loads, so a finished run is registered as a normal LoRA.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

AUDIO_EXTS = {".mp3", ".wav", ".flac", ".ogg", ".opus", ".m4a", ".aiff", ".aif"}
HOME = Path(os.environ.get("AMS_HOME", Path.home() / ".ai-music-studio"))
TRAIN = HOME / "training"
REPO_URL = "https://github.com/ace-step/ACE-Step.git"
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

PRESETS = {
    # name: (max_steps, text). Steps, not epochs: the trainer counts optimiser steps.
    "test": (300, "Test run: checks that everything works. The result is only a weak hint of the style."),
    "normal": (2000, "Normal: a good starting point for 10 to 30 songs."),
    "thorough": (6000, "Thorough: more songs or a stronger effect. Takes about three times as long."),
}
RANKS = {64: "Small file, subtle style", 128: "Balanced", 256: "Strong, the setting of the ACE-Step example"}


def repo_dir() -> Path:
    return Path(os.environ.get("AMS_TRAIN_REPO", TRAIN / "ACE-Step"))


def safe_name(s: str, fallback: str = "my_lora") -> str:
    s = re.sub(r"[^\w\-]+", "_", s.strip(), flags=re.UNICODE).strip("_")
    return s[:60] or fallback


# ── dataset ───────────────────────────────────────────────────────────────────

def _duration(path: Path) -> float | None:
    try:
        import soundfile as sf
        i = sf.info(str(path))
        return round(i.frames / float(i.samplerate), 1)
    except Exception:
        pass
    try:
        from mutagen import File
        f = File(str(path))
        return round(float(f.info.length), 1) if f and f.info else None
    except Exception:
        return None


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def _guess_caption(path: Path) -> str:
    stem = re.sub(r"[_\-.]+", " ", path.stem).strip()
    stem = re.sub(r"\s+", " ", stem)
    return stem


def scan_folder(folder: str) -> list[dict]:
    """Audio files below `folder` with captions and lyrics found next to them.

    Understood next to song.mp3: song_prompt.txt (caption), song_lyrics.txt (lyrics),
    song.txt (lyrics, the layout of other training tools).
    """
    root = Path(folder)
    if not root.is_dir():
        raise ValueError(f"Not a folder: {folder}")
    items = []
    for p in sorted(root.rglob("*")):
        if p.suffix.lower() not in AUDIO_EXTS or not p.is_file():
            continue
        prompt = _read(p.with_name(p.stem + "_prompt.txt"))
        lyrics = _read(p.with_name(p.stem + "_lyrics.txt")) or _read(p.with_suffix(".txt"))
        items.append({
            "path": str(p), "name": p.name, "seconds": _duration(p),
            "caption": prompt, "lyrics": lyrics, "caption_found": bool(prompt),
            "guess": _guess_caption(p),
        })
    return items


def build_dataset(name: str, items: list[dict], shared_tags: str = "") -> dict:
    """Write the dataset in the trainer's layout (mp3 + _prompt.txt + _lyrics.txt)."""
    name = safe_name(name)
    if not items:
        raise ValueError("The dataset has no songs.")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg was not found. Install it (it converts your songs to mp3 for training).")
    out = TRAIN / "datasets" / name
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    shared = [t.strip() for t in shared_tags.split(",") if t.strip()]
    used, total, warnings = set(), 0.0, []
    for idx, it in enumerate(items, 1):
        src = Path(it["path"])
        if not src.is_file():
            raise ValueError(f"File not found: {src}")
        stem = safe_name(src.stem, f"song{idx}")
        while stem in used:
            stem += f"_{idx}"
        used.add(stem)
        r = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ar", "44100", "-ac", "2",
                            "-b:a", "192k", str(out / f"{stem}.mp3")],
                           capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg could not convert {src.name}: {r.stderr.strip()[-200:]}")
        tags = shared + [t.strip() for t in (it.get("caption") or _guess_caption(src)).split(",") if t.strip()]
        (out / f"{stem}_prompt.txt").write_text(", ".join(tags), encoding="utf-8")
        lyrics = (it.get("lyrics") or "").strip()
        (out / f"{stem}_lyrics.txt").write_text(lyrics or "[instrumental]", encoding="utf-8")
        total += float(it.get("seconds") or 0)
    if len(items) < 8:
        warnings.append(f"Only {len(items)} songs. A style LoRA usually needs at least 8 to 10 to work well; "
                        "fewer songs make it copy those songs instead of learning the style.")
    if total and total < 20 * 60:
        warnings.append(f"Only {round(total / 60)} minutes of audio in total. 30 minutes or more is a better base.")
    return {"name": name, "dir": str(out), "songs": len(items), "minutes": round(total / 60, 1), "warnings": warnings}


# ── plan ──────────────────────────────────────────────────────────────────────

def _bf16_ok() -> bool:
    try:
        import torch
        return torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8
    except Exception:
        return False


def make_plan(songs: int, preset: str = "normal", rank: int = 256, bf16: bool | None = None) -> dict:
    steps, text = PRESETS.get(preset, PRESETS["normal"])
    rank = rank if rank in RANKS else 256
    bf16 = _bf16_ok() if bf16 is None else bf16
    return {
        "preset": preset, "preset_text": text, "rank": rank, "rank_text": RANKS[rank],
        "max_steps": steps,
        "save_every": max(100, steps // 4),
        "repeat_count": max(1, math.ceil(steps / max(1, songs))),
        "precision": "bf16-mixed" if bf16 else "16-mixed",
        "learning_rate": 1e-4,
        "workers": 2,
    }


def lora_config(rank: int) -> dict:
    # the target modules of the ACE-Step example configuration (config/zh_rap_lora_config.json)
    return {
        "r": rank, "lora_alpha": 32, "use_rslora": True,
        "target_modules": ["speaker_embedder", "linear_q", "linear_k", "linear_v", "to_q", "to_k", "to_v", "to_out.0"],
    }


def commands(dataset_dir: str, plan: dict, run_dir: Path, python: str, checkpoint_dir: str, repo: str) -> list[list[str]]:
    ds_out = str(run_dir / "hf_dataset")
    return [
        [python, "convert2hf_dataset.py", "--data_dir", dataset_dir, "--repeat_count", str(plan["repeat_count"]),
         "--output_name", ds_out],
        [python, "trainer.py", "--dataset_path", ds_out, "--exp_name", run_dir.name,
         "--learning_rate", str(plan["learning_rate"]), "--max_steps", str(plan["max_steps"]),
         "--every_n_train_steps", str(plan["save_every"]), "--precision", plan["precision"],
         "--devices", "1", "--num_workers", str(plan["workers"]), "--logger_dir", str(run_dir / "logs"),
         "--checkpoint_dir", checkpoint_dir, "--lora_config_path", str(run_dir / "lora_config.json")],
    ]


# ── bundle for another computer ───────────────────────────────────────────────

def export_bundle(name: str, dataset_dir: str, plan: dict) -> dict:
    name = safe_name(name)
    out = TRAIN / "exports" / name
    if out.exists():
        shutil.rmtree(out)
    (out / "dataset").mkdir(parents=True)
    for f in Path(dataset_dir).iterdir():
        shutil.copy2(f, out / "dataset" / f.name)
    (out / "lora_config.json").write_text(json.dumps(lora_config(plan["rank"]), indent=2), encoding="utf-8")
    steps = f"""\
LoRA training bundle "{name}"

For a computer with an NVIDIA graphics card (12 GB or more is recommended) and Python 3.10 to 3.12.

1. Get the trainer:
     git clone {REPO_URL}
     cd ACE-Step
2. Install it (in a virtual environment):
     python -m venv venv
     venv\\Scripts\\activate          (Linux/Mac: source venv/bin/activate)
     pip install -r requirements.txt
     pip install -e .
   If PyTorch was installed without CUDA, install the CUDA build from https://pytorch.org first.
3. Copy the folder "dataset" and the file "lora_config.json" from this bundle next to the ACE-Step folder, then:
     python convert2hf_dataset.py --data_dir ../dataset --repeat_count {plan['repeat_count']} --output_name ../hf_dataset
     python trainer.py --dataset_path ../hf_dataset --exp_name {name} --learning_rate {plan['learning_rate']} --max_steps {plan['max_steps']} --every_n_train_steps {plan['save_every']} --precision {plan['precision']} --devices 1 --num_workers {plan['workers']} --logger_dir ../logs --lora_config_path ../lora_config.json
4. The result is in logs/{name}/<date>{name}/checkpoints/ in folders ending in _lora.
   Take the newest folder (it contains pytorch_lora_weights.safetensors) and import it in
   AI Music Studio: Create music -> LoRA -> Import -> Folder.
"""
    (out / "README.txt").write_text(steps, encoding="utf-8")
    zpath = TRAIN / "exports" / f"{name}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_STORED) as z:
        for f in out.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(out))
    return {"folder": str(out), "zip": str(zpath)}


# ── run on this computer ──────────────────────────────────────────────────────

_jobs: dict[str, dict] = {}
_procs: dict[str, subprocess.Popen] = {}
_run_lock = threading.Lock()

_BAR = re.compile(r"(\d+)/(\d+)\s*\[")
_LOSS = re.compile(r"loss[=:]\s*([0-9.]+)")


def jobs() -> dict[str, dict]:
    return _jobs


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def stop_job(job_id: str) -> bool:
    p = _procs.get(job_id)
    if p and p.poll() is None:
        p.terminate()
        _jobs[job_id]["stopped"] = True
        return True
    return False


def _upd(job: dict, **kw) -> None:
    job.update(kw)
    job["updated"] = time.time()


def _log(job: dict, line: str) -> None:
    tail = job.setdefault("log", [])
    tail.append(line[-300:])
    del tail[:-60]


def _ensure_repo(job: dict) -> Path:
    repo = repo_dir()
    if (repo / "trainer.py").exists():
        return repo
    git = shutil.which("git")
    if not git:
        raise RuntimeError("Git is needed once to fetch the ACE-Step trainer. Install Git and try again.")
    _upd(job, stage="repo", stage_text="Fetching the ACE-Step trainer (about 35 MB)", step=None, step_total=None)
    repo.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([git, "clone", "--depth", "1", REPO_URL, str(repo)], capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError(f"git clone failed: {r.stderr.strip()[-300:]}")
    return repo


def _stream(job: dict, job_id: str, cmd: list[str], cwd: Path, env: dict, on_line) -> int:
    p = subprocess.Popen(cmd, cwd=str(cwd), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace", creationflags=CREATE_NO_WINDOW)
    _procs[job_id] = p
    buf = ""
    assert p.stdout is not None
    while True:                        # tqdm rewrites a line with \r: split on both
        ch = p.stdout.read(1)
        if ch == "":                  # end of output
            break
        if ch in ("\r", "\n"):
            if buf.strip():
                on_line(buf.strip())
            buf = ""
        else:
            buf += ch
    if buf.strip():
        on_line(buf.strip())
    return p.wait()


def start(job_id: str, name: str, dataset_dir: str, plan: dict, songs: int, register) -> None:
    """Run conversion + training; `register(folder, name)` adds the result to the LoRA list."""
    job = _jobs[job_id]
    run_dir = TRAIN / "runs" / safe_name(name)
    try:
        with _run_lock:
            _upd(job, status="running", started=time.time())
            repo = _ensure_repo(job)
            if run_dir.exists():
                shutil.rmtree(run_dir)
            run_dir.mkdir(parents=True)
            (run_dir / "lora_config.json").write_text(json.dumps(lora_config(plan["rank"]), indent=2), encoding="utf-8")
            ckpt = os.environ.get("AMS_ACESTEP_DIR", str(HOME / "models" / "ace-step"))
            conv, train = commands(dataset_dir, plan, run_dir, sys.executable, ckpt, str(repo))
            env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1", "USE_TF": "0"}

            _upd(job, stage="convert", stage_text="Preparing the dataset", step=None, step_total=None)
            if _stream(job, job_id, conv, repo, env, lambda l: _log(job, l)) != 0:
                raise RuntimeError("Preparing the dataset failed: " + " | ".join(job.get("log", [])[-3:]))

            _upd(job, stage="train", stage_text="Loading the base model, then training. The first start downloads "
                                                "the model and can take a long time.", step=0, step_total=plan["max_steps"])

            def on_line(l: str) -> None:
                _log(job, l)
                m = _BAR.search(l)
                if m and "Epoch" in l:
                    cur, tot = int(m.group(1)), int(m.group(2))
                    ep = re.search(r"Epoch (\d+)", l)
                    done = (int(ep.group(1)) if ep else 0) * tot + cur
                    _upd(job, stage_text="Training", step=min(done, plan["max_steps"]), step_total=plan["max_steps"])
                lm = _LOSS.search(l)
                if lm:
                    job["loss"] = float(lm.group(1))

            code = _stream(job, job_id, train, repo, env, on_line)
            if job.get("stopped"):
                _upd(job, status="stopped", stage="done", stage_text="Stopped")
                return
            if code != 0:
                raise RuntimeError("Training stopped with an error: " + " | ".join(job.get("log", [])[-4:]))

            _upd(job, stage="finish", stage_text="Saving the LoRA")
            found = sorted((run_dir / "logs").rglob("*_lora"), key=lambda p: p.stat().st_mtime)
            found = [f for f in found if (f / "pytorch_lora_weights.safetensors").exists()]
            if not found:
                raise RuntimeError("Training ended but no LoRA file was written.")
            entry = register(str(found[-1]), safe_name(name))
            _upd(job, status="done", stage="done", stage_text="Done", lora=entry, finished=time.time())
    except Exception as e:  # noqa: BLE001 - shown to the user
        _upd(job, status="error", error=str(e))
