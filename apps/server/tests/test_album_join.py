"""the album as one file: songs one after the other with pauses"""
import numpy as np
import soundfile as sf
from services.master_export import join_album


def test_join_album_with_gaps(tmp_path):
    sr = 48000
    a, b = tmp_path / "a.wav", tmp_path / "b.wav"
    sf.write(a, np.full((sr, 2), 0.5, np.float32), sr, subtype="FLOAT")
    sf.write(b, np.full((sr // 2, 1), -0.25, np.float32), sr, subtype="FLOAT")      # mono: both sides
    out = join_album([str(a), str(b)], 2.0, str(tmp_path / "album.wav"))
    d, r = sf.read(out, dtype="float32", always_2d=True)
    assert r == sr and d.shape == (sr + 2 * sr + sr // 2, 2)
    assert np.allclose(d[:sr], 0.5) and np.allclose(d[sr:3 * sr], 0) and np.allclose(d[3 * sr:], -0.25)
