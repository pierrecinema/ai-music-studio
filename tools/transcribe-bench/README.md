# Audio → MIDI benchmark

Measures `apps/server/services/transcribe.py` on songs whose notes are known.

1. `make-set.cjs <out dir>`: with the browser preview running (`pnpm preview:browser`, port 5199) and the sound packs in
   `$PACKS`, renders six songs of the song generator (pop, funk, ballad, rock, jazz, house): every part alone, the mix,
   and the true notes as JSON. Run with Playwright (`node make-set.cjs /tmp/a2m-set`).
2. `bench.py auto [parts]` (with `A2M_SET=/tmp/a2m-set`, in an environment with librosa, basic-pitch, mir_eval):
   note F-measure per part (onsets within 50 and 100 ms), drums per class. `bench.py bp` is plain basic-pitch.

Results of 0.94.0 are on the wiki page Audio to MIDI.
