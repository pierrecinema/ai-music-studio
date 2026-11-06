"""Audio-to-MIDI conversion using Spotify basic-pitch."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, tempfile, uuid

router = APIRouter()


class AudioToMidiRequest(BaseModel):
    filePath: str


@router.post("")
async def convert_audio_to_midi(req: AudioToMidiRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")

    out_dir = os.path.join(tempfile.gettempdir(), f"a2m_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)
    midi_path = os.path.join(out_dir, "output.mid")

    try:
        from basic_pitch.inference import predict_and_save
        from basic_pitch import ICASSP_2022_MODEL_PATH

        predict_and_save(
            [req.filePath],
            out_dir,
            save_midi=True,
            sonify_midi=False,
            save_model_outputs=False,
            save_notes=True,
            model_or_model_path=ICASSP_2022_MODEL_PATH,
        )
        # basic-pitch saves to <outdir>/<input_stem>_basic_pitch.mid
        import glob
        midi_files = glob.glob(os.path.join(out_dir, "*.mid"))
        if midi_files:
            midi_path = midi_files[0]

    except ImportError:
        # Stub
        import mido
        mid = mido.MidiFile()
        track = mido.MidiTrack()
        mid.tracks.append(track)
        mid.save(midi_path)

    # Parse MIDI to note list
    notes = []
    try:
        import pretty_midi
        pm = pretty_midi.PrettyMIDI(midi_path)
        for inst in pm.instruments:
            for note in inst.notes:
                notes.append({
                    "pitch": note.pitch,
                    "startTime": note.start,
                    "duration": note.end - note.start,
                    "velocity": note.velocity
                })
    except Exception:
        pass

    return {"midiFile": midi_path, "notes": notes}
