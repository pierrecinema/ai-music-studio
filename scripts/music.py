"""Afro house / deep house track, 120 BPM, A Hijaz (Phrygian dominant) for the AI Music Studio promo video.
Everything is synthesised here (no samples): 42 bars = 84 s."""
import numpy as np
import soundfile as sf

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
BARS = 66
N = int(BARS * BAR * SR) + SR * 3
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)
side = np.zeros(N)                         # kick envelope for sidechain ducking


def put(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[:N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def hp(x, times=1):
    for _ in range(times):
        x = np.diff(x, prepend=0.0)
    return x


def lp(x, a):                              # one-pole low pass, a in (0,1]: smaller = darker
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s += a * (x[i] - s); y[i] = s
    return y


def lp_fast(x, cutoff):
    # FFT brick-ish low pass (fast for long signals)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


# ── drums ────────────────────────────────────────────────────────────────
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, 0.001, 0.28)
    s[:200] += rng.standard_normal(200) * 0.25 * np.linspace(1, 0, 200)
    return s


def clap():
    n = int(0.25 * SR)
    s = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.022)):
        i = int(off * SR)
        m = n - i
        s[i:] += rng.standard_normal(m) * env(m, 0.0005, 0.012 if k < 2 else 0.09)
    return hp(s) * 0.9


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    return hp(rng.standard_normal(n), 2) * env(n, 0.0005, 0.07 if open_ else 0.014) * 0.25


def shaker(acc):
    n = int(0.07 * SR)
    return hp(rng.standard_normal(n), 1) * env(n, 0.006, 0.02) * (0.16 if acc else 0.08)


def conga(freq):
    n = int(0.3 * SR); t = np.arange(n) / SR
    f = freq * (1 + 0.4 * np.exp(-t / 0.01))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.12)
    s[:120] += rng.standard_normal(120) * 0.15
    return s * 0.5


K = kick(); C = clap()

# ── bass: rolling deep house line, A Hijaz ───────────────────────────────
NOTE = {'A1': 55.0, 'Bb1': 58.27, 'C#2': 69.30, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G1': 49.0, 'A2': 110.0}


def bass_note(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * h * t) / h ** 1.6 for h in range(1, 7))
    return s * env(n, 0.004, dur * 0.7) * 0.42


# per bar: list of (step, note, length in steps); chord root follows A – Bb – G – A
BASS_BARS = {
    'A': [(0, 'A1', 3), (3, 'A1', 2), (6, 'A2', 1), (8, 'A1', 3), (11, 'E2', 2), (14, 'G1', 2)],
    'Bb': [(0, 'Bb1', 3), (3, 'Bb1', 2), (6, 'F2', 1), (8, 'Bb1', 3), (11, 'D2', 2), (14, 'A1', 2)],
    'G': [(0, 'G1', 3), (3, 'G1', 2), (6, 'D2', 1), (8, 'G1', 3), (11, 'Bb1', 2), (14, 'C#2', 2)],
}
PROG = ['A', 'Bb', 'G', 'A']

# ── pad chords ───────────────────────────────────────────────────────────
CHORD = {'A': [220.0, 277.18, 329.63, 440.0], 'Bb': [233.08, 293.66, 349.23, 466.16], 'G': [196.0, 233.08, 293.66, 392.0]}


def pad(chord, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in chord:
        for det in (-0.004, 0.0, 0.005):
            ff = f * (1 + det)
            s += sum(np.sin(2 * np.pi * ff * h * t + rng.random() * 6) / h for h in range(1, 5))
    a = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.5)
    return lp_fast(s * a, 1800) * 0.035


# ── oud-like pluck (Karplus-Strong) for the Arabic melody ────────────────
def pluck(freq, dur):
    n = int(dur * SR); p = int(SR / freq)
    buf = rng.standard_normal(p) * 0.6
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.4985 * (buf[i % p] + buf[(i + 1) % p])
    return hp(out) * 0.9 + out * 0.4


HZ = {'A3': 220, 'Bb3': 233.08, 'C#4': 277.18, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.0, 'A4': 440.0, 'Bb4': 466.16, 'C#5': 554.37, 'D5': 587.33}
# two-bar motif (steps of 1/16): a Hijaz phrase with a little turn
MOTIF = [(0, 'E4', 2), (2, 'F4', 1), (3, 'E4', 1), (4, 'C#4', 2), (6, 'D4', 2), (8, 'E4', 3), (11, 'D4', 1), (12, 'C#4', 1), (13, 'Bb3', 1), (14, 'A3', 2),
         (16, 'A4', 2), (18, 'Bb4', 1), (19, 'A4', 1), (20, 'G4', 2), (22, 'F4', 2), (24, 'E4', 2), (26, 'F4', 1), (27, 'E4', 1), (28, 'C#4', 2), (30, 'D4', 1), (31, 'C#4', 1)]
PLUCKS = {k: pluck(v, 0.9) for k, v in HZ.items()}

lead = np.zeros(N)
stab = np.zeros(N)


def section(b):
    if b < 4: return 'intro'
    if b < 12: return 'groove'
    if b < 20: return 'melody'
    if b < 24: return 'break'
    if b < 40: return 'drop'
    if b < 48: return 'melody'
    if b < 52: return 'break'
    if b < 60: return 'drop'
    return 'outro'


CONGA_PAT = [(3, 260), (6, 330), (10, 260), (11, 200), (14, 330)]
for b in range(BARS):
    sec = section(b)
    t0 = b * BAR
    chord = PROG[b % 4]
    full = sec in ('groove', 'melody', 'drop')
    # kick
    if full or (sec == 'intro' and b >= 2) or (sec == 'outro' and b < BARS - 2):
        for q in range(4):
            put(K, t0 + q * BEAT, 0, 0.95)
            i = int((t0 + q * BEAT) * SR)
            e = np.exp(-np.arange(int(0.3 * SR)) / SR / 0.09)
            side[i:i + len(e)] = np.maximum(side[i:i + len(e)], e[:N - i])
    # clap on 2 and 4
    if full or (sec == 'outro' and b < BARS - 4):
        put(C, t0 + BEAT, 0.05, 0.55); put(C, t0 + 3 * BEAT, 0.05, 0.55)
    # open hat on the off-beats
    if full or sec == 'outro':
        for q in range(4):
            put(hat(True), t0 + q * BEAT + BEAT / 2, 0.25, 0.9)
    # shaker 16ths (everywhere but the last bars)
    if b < BARS - 2:
        for s in range(16):
            put(shaker(s % 4 == 2), t0 + s * STEP + 0.006 * (s % 2), -0.3, 1.0)
    # congas: the afro part
    if sec != 'break' and b < BARS - 2:
        for s, f in CONGA_PAT:
            put(conga(f), t0 + s * STEP, 0.4 if f > 250 else -0.4, 0.85)
        if b % 2 == 1:
            put(conga(330), t0 + 15 * STEP, 0.5, 0.6)
    # bass
    if full or (sec == 'outro' and b < BARS - 4):
        for s, nm, ln in BASS_BARS[chord]:
            put(bass_note(NOTE[nm], ln * STEP * 0.95), t0 + s * STEP, 0, 1.0)
    # pad (not in the full drop, to leave room)
    if sec in ('intro', 'groove', 'melody', 'break', 'outro') or (sec == 'drop' and b % 4 == 0):
        put(pad(CHORD[chord], BAR), t0, 0, 1.0 if sec != 'drop' else 0.8)
    # Arabic melody
    if sec in ('melody', 'break', 'drop') and b % 2 == 0:
        for s, nm, ln in MOTIF:
            seg = PLUCKS[nm][:int(min(0.9, ln * STEP * 2.2) * SR)]
            i = int((t0 + s * STEP) * SR)
            lead[i:i + len(seg)] += seg[:N - i] * (0.32 if sec != 'break' else 0.38)
    # chord stabs in the drop (off-beat)
    if sec == 'drop':
        for q in (1, 5, 9, 13):
            n = int(0.14 * SR); t = np.arange(n) / SR
            s = sum(np.sin(2 * np.pi * f * t) for f in CHORD[chord]) * env(n, 0.002, 0.05) * 0.06
            i = int((t0 + q * STEP + BEAT / 2) * SR)
            stab[i:i + n] += s[:N - i]

# risers at the end of the breaks
for b0 in (22, 50):
    i0, i1 = int(b0 * BAR * SR), int((b0 + 2) * BAR * SR)
    nz = hp(rng.standard_normal(i1 - i0)) * np.linspace(0, 0.18, i1 - i0) ** 1.5
    L[i0:i1] += nz; R[i0:i1] += nz

# lead: ping-pong delay (3/16) and a short room
d = int(3 * STEP * SR)
ldl = lead.copy(); ldr = lead.copy()
for k in range(1, 5):
    g = 0.42 ** k
    sh = d * k
    (ldl if k % 2 == 0 else ldr)[sh:] += lead[:-sh] * g
L += ldl * 0.9; R += ldr * 0.9
L += stab * 0.9; R += np.roll(stab, int(0.012 * SR)) * 0.9

# sidechain: duck everything except the kick itself a little (bass and pad pump)
duck = 1 - 0.55 * side
Lk = L * duck; Rk = R * duck
# add kicks back un-ducked (they were part of L/R: approximate by mixing the ducked bus with a little dry)
L = 0.75 * Lk + 0.25 * L; R = 0.75 * Rk + 0.25 * R

# simple stereo room on the whole mix
for dl, g in ((0.031, 0.12), (0.047, 0.09), (0.071, 0.06)):
    s = int(dl * SR)
    L[s:] += R[:-s] * g; R[s:] += L[:-s] * g

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
# fade in / out
fi = int(1.5 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
end = int(BARS * BAR * SR)
fo = int(8 * SR); mix[end - fo:end] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix = mix[:end]
mix /= np.max(np.abs(mix)) / 0.89
sf.write('/tmp/claude-0/vid/track.wav', mix.astype(np.float32), SR, subtype='PCM_24')
print('seconds', len(mix) / SR)
