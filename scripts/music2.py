"""Modern afro / deep house, 120 BPM, A minor with an Arabic (Hijaz) colour. 66 bars = 132 s.
Synthesised (no samples), mixed with buses, sidechain, convolution reverb, delay, glue compression and a limiter."""
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfilt_zi, fftconvolve, lfilter

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
BARS = 66
N = int(BARS * BAR * SR) + 4 * SR
rng = np.random.default_rng(11)
SWING = 0.10 * STEP                                    # late 2nd and 4th 16ths: the afro house shuffle


def bus():
    return np.zeros((N, 2))


KICK, DRUM, PERC, BASS, PAD, LEAD, VOX = (bus() for _ in range(7))
SIDE = np.zeros(N)


def t16(bar, step):
    return bar * BAR + step * STEP + (SWING if step % 2 == 1 else 0) + rng.normal(0, 0.0025)


def put(b, sig, t, pan=0.0, gain=1.0):
    i = int(round(t * SR))
    if i < 0 or i >= N:
        return
    s = sig[:N - i] * gain
    if s.ndim == 1:
        b[i:i + len(s), 0] += s * np.cos((pan + 1) * np.pi / 4)
        b[i:i + len(s), 1] += s * np.sin((pan + 1) * np.pi / 4)
    else:
        b[i:i + len(s)] += s


def env(n, a, d):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na) ** 0.7
    return e


def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=0)


def noise(n):
    return rng.standard_normal(n)


# ── drums ────────────────────────────────────────────────────────────────
def make_kick():
    n = int(0.55 * SR); t = np.arange(n) / SR
    f = 52 + 110 * np.exp(-t / 0.028) + 20 * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.0008, 0.32)
    click = filt(noise(n), 'bandpass', [1800, 6000]) * env(n, 0.0002, 0.004) * 0.5
    return np.tanh((body + click) * 1.8) * 0.9


def make_clap():
    n = int(0.4 * SR); s = np.zeros(n)
    for off, d in ((0, 0.006), (0.009, 0.006), (0.019, 0.007), (0.027, 0.11)):
        i = int(off * SR); s[i:] += noise(n - i) * env(n - i, 0.0003, d)
    return filt(s, 'bandpass', [900, 5200]) * 0.6


HAT_PARTIALS = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.73


def make_hat(dur, d):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6)) for f in HAT_PARTIALS)
    s = filt(s, 'highpass', 7000, 4) + filt(noise(n), 'highpass', 9000) * 0.6
    return s * env(n, 0.0004, d) * 0.12


def make_shaker(acc):
    n = int(0.09 * SR)
    s = filt(noise(n), 'bandpass', [5000, 11000])
    return s * env(n, 0.009, 0.022) * (0.20 if acc else 0.11)


def make_drum(f0, slap=False, dur=0.5):
    """membrane: a few inharmonic modes plus a slap"""
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for r, a, d in ((1, 1, 0.20), (1.59, 0.45, 0.09), (2.14, 0.3, 0.06), (2.30, 0.22, 0.05), (2.65, 0.16, 0.04)):
        f = f0 * r * (1 + 0.06 * np.exp(-t / 0.012))
        s += a * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / d)
    s *= np.minimum(1, t / 0.0015)
    s += filt(noise(n), 'bandpass', [1500, 5000]) * env(n, 0.0005, 0.012 if slap else 0.006) * (0.9 if slap else 0.35)
    return s * 0.45


KICK_S = make_kick(); CLAP_S = make_clap()
HAT_C = [make_hat(0.08, 0.016) for _ in range(4)]
HAT_O = make_hat(0.35, 0.11)
CONGA_LO, CONGA_HI, CONGA_SLAP, BONGO = make_drum(172), make_drum(248), make_drum(250, True), make_drum(430, dur=0.25)
SHAKERS = [make_shaker(a) for a in (True, False, False, False)]

# ── harmony: A minor with an E major (Hijaz colour) ───────────────────────
PROG = ['Am', 'Dm', 'F', 'E']
CH = {'Am': [57, 60, 64, 69], 'Dm': [57, 62, 65, 69], 'F': [57, 60, 65, 69], 'E': [56, 59, 64, 68]}
ROOT = {'Am': 33, 'Dm': 38, 'F': 41, 'E': 40}
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def saw(f, n, phase=0.0):
    ph = (phase + f * np.arange(n) / SR) % 1.0
    return 2 * ph - 1


def make_bass(midi, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(midi)
    sub = np.sin(2 * np.pi * f * t)
    mid = saw(f, n) + saw(f * 1.004, n)
    # filter envelope: block-wise low pass from 900 Hz down to 220 Hz
    out = np.zeros(n); blk = 256; zi = None
    for i in range(0, n, blk):
        fc = 220 + 680 * np.exp(-(i / SR) / 0.09)
        sos = butter(2, fc, fs=SR, output='sos')
        if zi is None:
            zi = sosfilt_zi(sos) * 0
        out[i:i + blk], zi = sosfilt(sos, mid[i:i + blk], zi=zi)
    a = np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.02).clip(0, 1)
    return np.tanh((sub * 0.9 + out * 0.35) * 1.3) * a * 0.55


BASS_PAT = [(0, 0, 3), (3, 0, 1), (6, 12, 1), (8, 0, 2), (10, 7, 1), (11, 0, 2), (14, 10, 1), (15, 12, 1)]  # step, interval, length


def make_pad(notes, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros((n, 2))
    for m in notes:
        for k, det in enumerate((-0.011, -0.006, -0.002, 0.0, 0.003, 0.007, 0.012)):
            v = saw(hz(m) * (1 + det), n, rng.random())
            pan = (k - 3) / 3.5
            s[:, 0] += v * np.cos((pan + 1) * np.pi / 4); s[:, 1] += v * np.sin((pan + 1) * np.pi / 4)
    a = (np.minimum(1, t / 0.9) * np.minimum(1, (dur - t) / 0.6).clip(0, 1))[:, None]
    return filt(s, 'lowpass', 2600) * a * 0.022


def karplus(f, dur):
    n = int(dur * SR); p = int(SR / f)
    buf = filt(noise(p), 'lowpass', 5000) * 0.8
    out = np.empty(n)
    for i in range(n):
        j = i % p
        out[i] = buf[j]
        buf[j] = 0.4992 * (buf[j] + buf[(j + 1) % p])
    out = filt(out, 'bandpass', [180, 4500]) + filt(out, 'bandpass', [250, 420]) * 0.6   # wooden body
    return out * np.minimum(1, np.arange(n) / (0.002 * SR)) * 0.55


def make_ney(midi, dur, slide_from=None):
    n = int(dur * SR); t = np.arange(n) / SR
    f0 = hz(midi)
    f = np.full(n, f0)
    if slide_from is not None:
        f = f0 + (hz(slide_from) - f0) * np.exp(-t / 0.05)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.18) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = filt(noise(n), 'bandpass', [f0 * 0.8, f0 * 3.5]) * 0.35
    a = np.minimum(1, t / 0.09) * np.minimum(1, (dur - t) / 0.12).clip(0, 1)
    return (tone + breath) * a * 0.16


FORMANTS = {'a': (730, 1090, 2440), 'o': (570, 840, 2410), 'e': (390, 2000, 2700), 'u': (300, 870, 2240)}


def make_vox(midi, vowel, dur, slide=0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(midi) * (1 + slide * np.exp(-t / 0.04))
    f = f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))
    ph = np.cumsum(f) / SR % 1.0
    src = (2 * ph - 1) + 0.15 * filt(noise(n), 'highpass', 3000)
    out = np.zeros(n)
    for k, F in enumerate(FORMANTS[vowel]):
        bw = 80 + 40 * k
        out += filt(src, 'bandpass', [F - bw, F + bw]) * (1.0, 0.6, 0.3)[k]
    a = np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.06).clip(0, 1)
    return out * a * 0.5


# melodies (A Hijaz over A minor: A Bb C# D E F G), MIDI numbers
OUD_MOTIF = [(0, 76, 2), (2, 77, 1), (3, 76, 1), (4, 73, 2), (6, 74, 2), (8, 76, 3), (11, 74, 1), (12, 73, 1), (13, 70, 1), (14, 69, 2),
             (16, 81, 2), (18, 82, 1), (19, 81, 1), (20, 79, 2), (22, 77, 2), (24, 76, 2), (26, 77, 1), (27, 76, 1), (28, 73, 2), (30, 74, 1), (31, 73, 1)]
NEY_PHRASE = [(0, 76, 6, None), (6, 77, 2, 76), (8, 76, 4, None), (12, 74, 2, None), (14, 73, 2, 74),
              (16, 69, 8, None), (24, 70, 3, 69), (27, 69, 5, None)]
VOX_PAT = [(2, 69, 'a', 2, 0.0), (7, 72, 'o', 2, 0.04), (10, 76, 'e', 1, 0.0), (14, 74, 'a', 3, -0.05)]

OUD = {m: karplus(hz(m), 1.0) for m in sorted({m for _, m, _ in OUD_MOTIF})}
PADS = {c: make_pad(CH[c], BAR) for c in PROG}


def section(b):
    for end, name in ((8, 'intro'), (16, 'groove'), (24, 'melody'), (28, 'break'), (44, 'drop'),
                      (52, 'groove2'), (56, 'break'), (62, 'drop'), (BARS, 'outro')):
        if b < end:
            return name


CONGA_PAT = [(3, 'hi'), (6, 'lo'), (7, 'slap'), (10, 'hi'), (11, 'lo'), (14, 'slap')]
for b in range(BARS):
    sec = section(b); chord = PROG[b % 4]; t0 = b * BAR
    drums_on = sec in ('groove', 'melody', 'drop', 'groove2') or (sec == 'intro' and b >= 4) or (sec == 'outro' and b < BARS - 2)
    if drums_on:
        for q in range(4):
            put(KICK, KICK_S, t0 + q * BEAT, 0, 1.0)
            i = int((t0 + q * BEAT) * SR); e = np.exp(-np.arange(int(0.35 * SR)) / SR / 0.11)
            SIDE[i:i + len(e)] = np.maximum(SIDE[i:i + len(e)], e[:N - i])
    if sec in ('groove', 'melody', 'drop', 'groove2') or (sec == 'outro' and b < BARS - 4):
        put(DRUM, CLAP_S, t16(b, 4), 0.05, 0.75); put(DRUM, CLAP_S, t16(b, 12), 0.05, 0.75)
        for q in range(4):
            put(DRUM, HAT_O, t0 + q * BEAT + BEAT / 2, 0.2, 0.9)
        for s in range(16):
            if s % 4 != 2:
                put(DRUM, HAT_C[s % 4], t16(b, s), -0.25, 0.35 + 0.25 * rng.random())
    if b < BARS - 2:
        for s in range(16):
            put(PERC, SHAKERS[s % 4], t16(b, s), 0.45, 0.8 + 0.4 * rng.random())
    if sec != 'break' and b < BARS - 2:
        for s, k in CONGA_PAT:
            sig = {'hi': CONGA_HI, 'lo': CONGA_LO, 'slap': CONGA_SLAP}[k]
            put(PERC, sig, t16(b, s), 0.35 if k != 'lo' else -0.3, 0.75 + 0.3 * rng.random())
        if b % 2 == 1:
            for s in (13, 15):
                put(PERC, BONGO, t16(b, s), 0.6, 0.6 + 0.3 * rng.random())
    if sec in ('groove', 'melody', 'drop', 'groove2') or (sec == 'outro' and b < BARS - 4) or (sec == 'intro' and b >= 6):
        for s, iv, ln in BASS_PAT:
            put(BASS, make_bass(ROOT[chord] + iv, ln * STEP * 0.92), t16(b, s), 0, 1.0)
    put(PAD, PADS[chord], t0, 0, 1.0 if sec in ('intro', 'break', 'outro', 'groove2') else 0.7)
    if sec in ('melody', 'drop') and b % 2 == 0:
        for s, m, ln in OUD_MOTIF:
            seg = OUD[m][:int(min(1.0, ln * STEP * 2.5) * SR)]
            put(LEAD, seg, t16(b, s), 0.25 if s < 16 else -0.25, 0.9)
    if (sec == 'break' or (sec == 'drop' and b % 4 == 2)) and b % 2 == 0:
        for s, m, ln, sl in NEY_PHRASE:
            put(LEAD, make_ney(m, ln * STEP), t16(b, s), -0.1, 1.0 if sec == 'break' else 0.7)
    if sec in ('groove', 'groove2', 'break', 'drop') and b % 2 == 1:
        for s, m, v, ln, sl in VOX_PAT:
            put(VOX, make_vox(m - 12 if sec == 'drop' else m, v, ln * STEP * 1.6, sl), t16(b, s), 0.3 * (1 if s % 4 else -1), 0.8)

# risers into the drops
for b0 in (26, 54):
    i0, i1 = int(b0 * BAR * SR), int((b0 + 2) * BAR * SR)
    n = i1 - i0; u = np.linspace(0, 1, n)
    nz = noise(n); out = np.zeros(n)
    for i in range(0, n, 2048):
        out[i:i + 2048] = filt(nz[i:i + 2048], 'bandpass', [400 + 6000 * u[i] ** 2, 1200 + 9000 * u[i] ** 2])
    out *= u ** 2 * 0.25
    PAD[i0:i1, 0] += out; PAD[i0:i1, 1] += np.roll(out, 300)

# ── mix ──────────────────────────────────────────────────────────────────
def reverb_ir(seconds, damp):
    n = int(seconds * SR); t = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)], 1)
    hi = filt(ir, 'highpass', 3000); lo = ir - hi
    ir = lo * np.exp(-t / (seconds / 4.5))[:, None] + hi * np.exp(-t / (seconds / damp))[:, None]
    ir[:int(0.012 * SR)] = 0                             # pre-delay
    return ir / np.sqrt((ir ** 2).sum() / 2)


IR = reverb_ir(2.8, 14)


def conv_stereo(x, ir):
    return np.stack([fftconvolve(x[:, 0], ir[:, 0])[:N], fftconvolve(x[:, 1], ir[:, 1])[:N]], 1)


def delay(x, t, fb, wet):
    d = int(t * SR)
    out = np.zeros_like(x)
    l, r = x[:, 0].copy(), x[:, 1].copy()
    for k in range(1, 6):
        g = fb ** k
        src = (l + r) * 0.5
        ch = k % 2
        out[d * k:, ch] += filt(src, 'lowpass', 4000)[:-d * k] * g
    return x + out * wet


duck = (1 - 0.65 * SIDE)[:, None]
duck_soft = (1 - 0.35 * SIDE)[:, None]
BASS = filt(BASS, 'lowpass', 1800) * duck
PAD = filt(PAD, 'highpass', 180) * duck_soft
LEAD = delay(filt(LEAD, 'highpass', 160), 3 * STEP, 0.38, 0.45) * duck_soft
VOX = delay(filt(VOX, 'highpass', 200), 3 * STEP, 0.42, 0.6) * duck_soft
PERC = filt(PERC, 'highpass', 120) * (1 - 0.15 * SIDE)[:, None]
DRUM = filt(DRUM, 'highpass', 200)

# intro filter sweep on the music (bars 0-8): low pass opening up
sweep_end = int(8 * BAR * SR)
for X in (PAD, PERC):
    out = X.copy(); zi = None
    for i in range(0, sweep_end, 1024):
        fc = 400 * (16 ** (i / sweep_end))
        sos = butter(2, min(fc, 15000), fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        for c in range(2):
            out[i:i + 1024, c], zi[:, c] = sosfilt(sos, X[i:i + 1024, c], zi=zi[:, c])
    X[:sweep_end] = out[:sweep_end]

send = PAD * 0.45 + LEAD * 0.35 + VOX * 0.55 + PERC * 0.18 + DRUM * 0.22
REV = conv_stereo(send, IR)

mix = KICK * 0.9 + DRUM * 1.6 + PERC * 1.7 + BASS * 0.75 + PAD * 1.1 + LEAD * 1.3 + VOX * 0.9 + REV * 0.38
# master tone: a little air and presence (modern, open top end), sub kept tight
mix = mix + filt(mix, 'highpass', 6000) * 0.9 + filt(mix, 'bandpass', [1500, 5000]) * 0.35 - filt(mix, 'lowpass', 35) * 0.5

# glue compressor (RMS, 2:1 above -14 dB) and a soft limiter
lvl = np.sqrt(lfilter([0.002], [1, -0.998], (mix ** 2).mean(1)) + 1e-9)
db = 20 * np.log10(lvl)
gr = np.where(db > -14, (db + 14) * (1 - 1 / 2), 0)
mix *= (10 ** (-gr / 20))[:, None]
mix = mix / np.max(np.abs(mix)) * 1.4
mix = np.tanh(mix) / np.tanh(1.4)

end = int(BARS * BAR * SR)
fi = int(2.0 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(8 * SR); mix[end - fo:end] *= np.linspace(1, 0, fo)[:, None] ** 1.6
mix = mix[:end]
mix *= 0.89 / np.max(np.abs(mix))
sf.write('/tmp/claude-0/vid/track2.wav', mix.astype(np.float32), SR, subtype='PCM_24')
print('done', len(mix) / SR)
