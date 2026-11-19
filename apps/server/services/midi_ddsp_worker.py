"""AI Instruments: MIDI notes played by MIDI-DDSP (Google Magenta, Apache 2.0).

MIDI-DDSP was trained on real recordings of 13 orchestral instruments (URMP). An expression model decides for each
note how it is played (volume, swell, vibrato, brightness, attack), a synthesis model turns that into the sound of
the instrument. It runs on the processor: no graphics card needed.

Runs as its own process inside the separate "AI Instruments" Python environment (TensorFlow, which must not meet the
PyTorch of the other engines):

    python midi_ddsp_worker.py request.json

Request: {"notes": [{"pitch": 60, "start": 0.0, "end": 0.5, "velocity": 100}], "instrument": "violin",
          "out": "C:/.../x.wav", "transpose": 0, "voices": 4,
          "expression": {"vibrato": 1.0, "dynamics": 1.0, "brightness": 1.0, "attack": 1.0, "velocity": 0.5}}
Times are seconds. Progress goes to stdout as one JSON object per line; the last line is {"done": true, ...} or
{"error": "..."}.

AMS_DDSP_FAKE=1 builds the models without their trained weights (for tests on machines without the download).
"""
import json
import os
import sys
import warnings

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
warnings.filterwarnings("ignore")

SAMPLE_RATE = 16000          # MIDI-DDSP's own rate
OUT_RATE = 44100
FRAME_RATE = 250

# app instrument id -> MIDI-DDSP instrument name
INSTRUMENTS = {
    "violin": "violin", "viola": "viola", "cello": "cello", "double-bass": "double bass",
    "flute": "flute", "oboe": "oboe", "clarinet": "clarinet", "saxophone": "saxophone", "bassoon": "bassoon",
    "trumpet": "trumpet", "horn": "horn", "trombone": "trombone", "tuba": "tuba",
}
# the range each instrument plays well (MIDI notes); notes outside are moved by octaves
RANGES = {
    "violin": (55, 103), "viola": (48, 91), "cello": (36, 76), "double bass": (28, 67), "flute": (60, 98),
    "oboe": (58, 91), "clarinet": (50, 94), "saxophone": (49, 81), "bassoon": (34, 75), "trumpet": (54, 86),
    "horn": (34, 77), "trombone": (34, 72), "tuba": (26, 65),
}


def say(**kw) -> None:
    print(json.dumps(kw), flush=True)


def split_voices(notes: list[dict], max_voices: int) -> list[list[dict]]:
    """MIDI-DDSP plays one note at a time: chords are spread over several players (like a section).
    A note goes to the first player who is free; the highest note of a chord to the first player."""
    voices: list[list[dict]] = []
    ends: list[float] = []
    for n in sorted(notes, key=lambda x: (x["start"], -x["pitch"])):
        for i, end in enumerate(ends):
            if n["start"] >= end - 1e-4:
                voices[i].append(n)
                ends[i] = n["end"]
                break
        else:
            if len(voices) < max_voices:
                voices.append([n])
                ends.append(n["end"])
            else:
                # more notes at once than players: the player who finishes first cuts its note short
                i = min(range(len(ends)), key=lambda k: ends[k])
                last = voices[i][-1]
                last["end"] = max(last["start"] + 0.02, n["start"])
                voices[i].append(n)
                ends[i] = n["end"]
    return voices


def fit_range(pitch: int, inst: str) -> int:
    lo, hi = RANGES.get(inst, (0, 127))
    while pitch < lo:
        pitch += 12
    while pitch > hi:
        pitch -= 12
    return pitch


def load_models(fake: bool):
    import tensorflow as tf
    from midi_ddsp.hparams_synthesis_generator import hparams as hp
    from midi_ddsp.modules.get_synthesis_generator import get_synthesis_generator, get_fake_data_synthesis_generator
    from midi_ddsp.modules.expression_generator import ExpressionGenerator, get_fake_data_expression_generator
    if not fake:
        from midi_ddsp.midi_ddsp_synthesize import load_pretrained_model
        return load_pretrained_model()
    tf.random.set_seed(0)
    synthesis_generator = get_synthesis_generator(hp)
    synthesis_generator._build(get_fake_data_synthesis_generator(hp))
    expression_generator = ExpressionGenerator(n_out=6, nhid=128)
    fake_data = get_fake_data_expression_generator(6)
    _ = expression_generator(fake_data["cond"], out=fake_data["target"], training=True)
    return synthesis_generator, expression_generator


def weights_present() -> bool:
    import midi_ddsp
    return os.path.isdir(os.path.join(os.path.dirname(midi_ddsp.__file__), "midi_ddsp_model_weights_urmp_9_10"))


def download_weights() -> None:
    """The trained models (about 80 MB) come from the MIDI-DDSP repository on GitHub, once."""
    from midi_ddsp import download_model_weights
    download_model_weights.main()


def main(req_path: str) -> None:
    req = json.load(open(req_path, encoding="utf-8"))
    fake = os.environ.get("AMS_DDSP_FAKE") == "1"
    inst_id = req.get("instrument", "violin")
    inst = INSTRUMENTS.get(inst_id)
    if inst is None:
        raise ValueError(f"Unknown instrument: {inst_id}")
    notes = [dict(n) for n in req.get("notes", []) if n["end"] > n["start"]]
    if not notes:
        raise ValueError("No notes to play")

    if not fake and not weights_present():
        say(stage="download", text="Downloading the MIDI-DDSP models (about 80 MB, only once)")
        download_weights()

    say(stage="load", text="Loading the AI instrument")
    import numpy as np
    import pretty_midi
    import tensorflow as tf
    from scipy.io import wavfile
    from scipy.signal import resample_poly
    from midi_ddsp.data_handling.instrument_name_utils import INST_NAME_TO_ID_DICT
    from midi_ddsp.utils.midi_synthesis_utils import note_list_to_sequence
    from midi_ddsp.utils.inference_utils import (conditioning_df_to_audio,
                                                 expression_generator_output_to_conditioning_df)
    synthesis_generator, expression_generator = load_models(fake)

    ex = {"vibrato": 1.0, "dynamics": 1.0, "brightness": 1.0, "attack": 1.0, "velocity": 0.5, **(req.get("expression") or {})}
    transpose = int(req.get("transpose", 0))
    voices = split_voices(notes, max(1, min(8, int(req.get("voices", 4)))))
    instrument_id = tf.constant([INST_NAME_TO_ID_DICT[inst]])
    total = len(voices)
    stems = []
    for k, voice in enumerate(voices):
        say(stage="play", text=f"Playing voice {k + 1} of {total}", step=k, total=total)
        pm_notes = [pretty_midi.Note(velocity=int(n.get("velocity", 100)), pitch=fit_range(int(n["pitch"]) + transpose, inst),
                                     start=float(n["start"]), end=float(n["end"])) for n in voice]
        seq = note_list_to_sequence(pm_notes, fs=FRAME_RATE)
        seq["instrument_id"] = instrument_id
        out = expression_generator(seq, out=None, training=False)
        df = expression_generator_output_to_conditioning_df(out["output"], seq)
        # the player's style: scale what the expression model chose (each column is 0..1)
        played = df["pitch"] > 0
        vel = np.zeros(len(df))
        vel[played.values] = [n.velocity / 127.0 for n in pm_notes][: int(played.sum())]
        df.loc[played, "volume"] = np.clip(df.loc[played, "volume"] * ex["dynamics"] * ((1 - ex["velocity"]) + ex["velocity"] * 1.6 * vel[played.values]), 0, 1)
        df.loc[played, "vol_fluc"] = np.clip(df.loc[played, "vol_fluc"] * ex["dynamics"], 0, 1)
        df.loc[played, "vibrato"] = np.clip(df.loc[played, "vibrato"] * ex["vibrato"], 0, 1)
        df.loc[played, "brightness"] = np.clip(df.loc[played, "brightness"] * ex["brightness"], 0, 1)
        df.loc[played, "attack"] = np.clip(df.loc[played, "attack"] * ex["attack"], 0, 1)
        audio, _, _ = conditioning_df_to_audio(synthesis_generator, df, instrument_id)
        stems.append(np.asarray(audio[0], dtype=np.float64))

    say(stage="mix", text="Mixing the voices", step=total, total=total)
    length = max(len(s) for s in stems)
    mix = np.zeros(length)
    for s in stems:
        mix[: len(s)] += s
    # MIDI-DDSP plays at 16 kHz; the app works at 44.1 kHz
    mix = resample_poly(mix, OUT_RATE // 100, SAMPLE_RATE // 100)
    # the rest of one second MIDI-DDSP adds at the end: keep a short tail for the release, cut the silence after it
    last_end = max(n["end"] for n in notes)
    mix = mix[: int((last_end + 0.6) * OUT_RATE)]
    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > 0:
        mix *= 0.89 / peak                                   # -1 dBFS
    fade = min(len(mix), int(0.02 * OUT_RATE))
    if fade:
        mix[-fade:] *= np.linspace(1, 0, fade)
    os.makedirs(os.path.dirname(os.path.abspath(req["out"])), exist_ok=True)
    wavfile.write(req["out"], OUT_RATE, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    say(done=True, seconds=len(mix) / OUT_RATE, voices=total, file=req["out"])


def check() -> None:
    """Install check: everything imports (the models themselves come with the first song)."""
    import tensorflow  # noqa: F401
    import ddsp  # noqa: F401
    from midi_ddsp.utils.inference_utils import conditioning_df_to_audio  # noqa: F401
    say(ok=True, weights=weights_present())


if __name__ == "__main__":
    try:
        if sys.argv[1] == "--check":
            check()
        elif sys.argv[1] == "--download":
            if not weights_present():
                download_weights()
            say(ok=True, weights=weights_present())
        else:
            main(sys.argv[1])
    except Exception as e:  # noqa: BLE001 - reported to the app as one line
        import traceback
        traceback.print_exc(file=sys.stderr)
        say(error=f"{type(e).__name__}: {e}")
        sys.exit(1)
