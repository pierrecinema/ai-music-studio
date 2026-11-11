"""Mix of the two tracks for promo video v3 (132 s, 120 BPM, bar = 2 s).

0-16 s MusicGen clip (stretched 118 -> 120 BPM), 16-80 s groove of "modern afro house",
80-108 s its strongest part, 108-132 s that part again with the clip on top, fade out.
Then: ffmpeg -i mix_raw.wav -af "loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.89" -c:a pcm_s24le mix.wav
"""
import librosa, numpy as np, soundfile as sf
SR = 44100
A, _ = librosa.load('../music/sources/modern afro house.wav', sr=SR)
B, _ = librosa.load('../music/sources/MusicGen clip 03 01 (rescued).wav', sr=SR)
B = librosa.effects.time_stretch(B, rate=120 / 117.98336)
a0 = 0.44409; b0 = 0.55825 / (120 / 117.98336) + 1.0   # first downbeats
rms = lambda x: np.sqrt(np.mean(x ** 2))
B *= rms(A[:int(48 * SR)]) / rms(B[:int(20 * SR)]) * 0.95
def seg(x, start, dur): i = int(round(start * SR)); return x[i:i + int(round(dur * SR))]
X = int(0.25 * SR)
def join(out, piece):
    if out is None: return piece.copy()
    t = np.linspace(0, np.pi / 2, X); o = out.copy()
    o[-X:] = o[-X:] * np.cos(t) + piece[:X] * np.sin(t)
    return np.concatenate([o, piece[X:]])
P = lambda x, s, d: seg(x, s - 0.125, d + 0.25)
out = join(None, seg(B, b0, 16.125))
out = join(out, P(A, a0, 64))
out = join(out, P(A, a0 + 68, 28))
last = P(A, a0 + 72, 24); ov = seg(B, b0, 20)
last[int(0.125 * SR):int(0.125 * SR) + len(ov)] += ov * 0.55
out = join(out, last)[:int(132 * SR)]
t = np.arange(len(out)) / SR
out *= np.minimum(1, t / 1.0); fo = t > 126; out[fo] *= ((132 - t[fo]) / 6) ** 1.5
sf.write('mix_raw.wav', np.stack([out, out], 1).astype(np.float32), SR, subtype='FLOAT')
