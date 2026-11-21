"""DiffSinger singing synthesis: a melody (notes with lyrics) sung by a DiffSinger voicebank in the OpenUtau format.

The voicebank (downloaded by the user from its author, who sets its terms) is a folder with dsconfig.yaml, the acoustic
model (ONNX), its phoneme list and dictionaries, and optionally the variance models in sub-folders: dsdur (phoneme
durations), dspitch (a natural pitch curve) and dsvariance (energy, breathiness, voicing, tension). The vocoder
(NSF-HiFiGAN, mel -> sound) is named in dsconfig.yaml and installed once (services/diffsinger.find_vocoder).

The steps follow OpenUtau's DiffSinger renderer (MIT, github.com/stakira/OpenUtau, OpenUtau.Core/DiffSinger):
lyrics -> phonemes (the voicebank's dictionary, then OpenUtau's G2P for English, Spanish or German, data/g2p),
phonemes placed on the notes (the vowel starts on the note, consonants before it), durations from the duration
model or from rules, the pitch curve from the pitch model or from the notes, then the acoustic model (mel) and
the vocoder (waveform). Phrases (notes without long rests between them) are rendered one by one.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

HEAD, TAIL = 8, 8                     # frames of silence (SP) around a phrase, as in OpenUtau
G2P_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "g2p")
CONTINUE = ("+", "-", "+~", "+*")     # a note that holds the previous syllable (melisma)


def _yaml(path: str) -> dict:
    import yaml
    with open(path, encoding="utf-8-sig") as f:
        return yaml.safe_load(f) or {}


def _session(path: str):
    import onnxruntime as ort
    o = ort.SessionOptions()
    o.log_severity_level = 3
    return ort.InferenceSession(path, sess_options=o, providers=["CPUExecutionProvider"])


# ── grapheme -> phoneme (OpenUtau's G2P packs: a dictionary, and a small model for unknown words) ──────────

class G2p:
    def __init__(self, lang: str):
        d = os.path.join(G2P_DIR, lang)
        t = json.load(open(os.path.join(d, "tables.json"), encoding="utf-8"))
        self.lang = lang
        self.lower = t["prep"] == "lower"
        self.graphemes = {g: i + 4 for i, g in enumerate(t["graphemes"][4:])}
        self.phonemes = t["phonemes"]
        strip = (lambda s: re.sub(r"\d+$", "", s.lower())) if lang == "en" else (lambda s: s)
        self.strip = strip
        self.vowels: set[str] = set()
        for line in open(os.path.join(d, "phones.txt"), encoding="utf-8"):
            parts = line.split()
            if len(parts) == 2 and parts[1] == "vowel":
                self.vowels.add(strip(parts[0]))
        self.dict: dict[str, list[str]] = {}
        for line in open(os.path.join(d, "dict.txt"), encoding="utf-8", errors="ignore"):
            if line.startswith(";;;"):
                continue
            parts = line.strip().split("  ")
            if len(parts) == 2:
                w = parts[0].lower() if self.lower else parts[0]
                self.dict.setdefault(w, [strip(p) for p in parts[1].split()])
        self._session = None
        self._cache: dict[str, list[str]] = {}

    def query(self, word: str) -> list[str] | None:
        w = word.lower() if self.lower else word
        if not w or re.fullmatch(r"[\W_]+", w):
            return None
        if w in self.dict:
            return list(self.dict[w])
        if w.lower() in self.dict:
            return list(self.dict[w.lower()])
        if w not in self._cache:
            self._cache[w] = self._predict(w)
        return list(self._cache[w]) or None

    def _predict(self, word: str) -> list[str]:
        """the G2P model: an encoder-decoder that adds one phoneme per step (G2pPack.Predict in OpenUtau)"""
        src = [self.graphemes[c] for c in word.lower() if c in self.graphemes]
        if not src:
            return []
        if self._session is None:
            self._session = _session(os.path.join(G2P_DIR, self.lang, "g2p.onnx"))
        tgt, t = [2], 0
        while t < len(src) and len(tgt) < 48:
            pred = int(self._session.run(None, {"src": np.array([src], np.int32), "tgt": np.array([tgt], np.int32),
                                                 "t": np.array([t], np.int32)})[0].reshape(-1)[0])
            if pred != 2:
                tgt.append(pred)
            else:
                t += 1
        return [self.strip(self.phonemes[i]) for i in tgt[1:]]


_G2P: dict[str, G2p] = {}


def g2p(lang: str) -> G2p | None:
    if lang not in ("en", "es", "de"):
        return None
    if lang not in _G2P:
        _G2P[lang] = G2p(lang)
    return _G2P[lang]


# ── the voicebank ─────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class Model:
    """one model folder (the acoustic model in the root, or dsdur / dspitch / dsvariance) with its own phonemes"""
    root: str
    cfg: dict
    tokens: dict[str, int]
    languages: dict[str, int] = field(default_factory=dict)

    @property
    def frame(self) -> float:
        return self.cfg.get("hop_size", 512) / self.cfg.get("sample_rate", 44100)

    def file(self, key: str) -> str | None:
        v = self.cfg.get(key)
        return os.path.join(self.root, v) if v else None


def _load_model(root: str) -> Model | None:
    p = os.path.join(root, "dsconfig.yaml")
    if not os.path.exists(p):
        return None
    cfg = _yaml(p)
    ph = os.path.join(root, cfg.get("phonemes", "phonemes.txt"))
    if ph.endswith(".json"):
        tokens = {k: int(v) for k, v in json.load(open(ph, encoding="utf-8")).items()}
    else:
        tokens = {line.strip(): i for i, line in enumerate(open(ph, encoding="utf-8-sig")) if line.strip()}
    langs = {}
    if cfg.get("use_lang_id") and cfg.get("languages"):
        langs = {k: int(v) for k, v in json.load(open(os.path.join(root, cfg["languages"]), encoding="utf-8")).items()}
    return Model(root, cfg, tokens, langs)


class Dictionary:
    """the voicebank's dictionary (dsdict-<lang>.yaml or dsdict.yaml): whole words, phoneme types, replacements
    from OpenUtau's G2P phonemes to the voicebank's own"""

    def __init__(self, root: str, lang: str | None, tokens: dict[str, int]):
        self.words: dict[str, list[str]] = {}
        self.vowels: set[str] = {"SP", "AP"}
        self.symbols: set[str] = {"SP", "AP"}
        self.replace: dict[str, str] = {}
        self.lang = lang
        names = ([f"dsdict-{lang}.yaml"] if lang else []) + (["dsdict-de-marzipan.yaml"] if lang == "de" else []) + ["dsdict.yaml"]
        for n in names:
            p = os.path.join(root, n)
            if os.path.exists(p):
                d = _yaml(p)
                for s in d.get("symbols") or []:
                    sym = str(s.get("symbol", "")).strip()
                    self.symbols.add(sym)
                    if s.get("type") == "vowel":
                        self.vowels.add(sym)
                for e in d.get("entries") or []:
                    self.words[str(e.get("grapheme", "")).lower()] = [str(x) for x in e.get("phonemes") or []]
                for r in d.get("replacements") or []:
                    self.replace[str(r.get("from"))] = str(r.get("to"))
                break
        else:
            # an old voicebank: dsdict.txt (word -> phonemes, tab separated) or only the phoneme list
            p = os.path.join(root, "dsdict.txt")
            if os.path.exists(p):
                for line in open(p, encoding="utf-8-sig"):
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) == 2:
                        self.words[parts[0].lower()] = parts[1].split()
                        self.symbols.update(parts[1].split())
        self.base = g2p(lang) if lang else None
        if self.base:
            # OpenUtau: a base G2P phoneme becomes "<lang>/<ph>" when the voicebank has that, else stays as it is
            for ph in set(sum(self.base.dict.values(), [])) | set(self.base.vowels):
                if ph in self.replace:
                    continue
                pre = f"{lang}/{ph}"
                self.replace[ph] = pre if pre in tokens else ph
            for frm, to in self.replace.items():
                if frm in self.base.vowels:
                    self.vowels.add(to)
        # the phoneme list alone tells the vowels of old voicebanks poorly: a phoneme of one vowel letter group is one
        for t in tokens:
            core = t.split("/")[-1]
            if re.fullmatch(r"[aeiouAEIOUvy@]+[a-z]*", core) and not re.fullmatch(r"[bcdfghjklmnpqrstvwxz]+", core.lower()):
                if core.lower() not in ("y", "w", "v") or core in self.vowels:
                    self.vowels.add(t)

    def phonemes(self, word: str, tokens: dict[str, int]) -> list[str]:
        """a word (or phonemes written with spaces) -> the voicebank's phonemes; unknown ones are left out"""
        w = word.strip()
        if not w:
            return []
        if w.lower() in self.words:
            out = self.words[w.lower()]
        elif self.base and (q := self.base.query(w)):
            out = [self.replace.get(p, p) for p in q]
        else:
            out = w.split()                                       # phonemes typed directly ("l a")
        res = []
        for p in out:
            if p in tokens:
                res.append(p)
            elif self.lang and f"{self.lang}/{p}" in tokens:
                res.append(f"{self.lang}/{p}")
        return res

    def is_vowel(self, ph: str) -> bool:
        return ph in self.vowels or ph.split("/")[-1] in self.vowels


class Voicebank:
    def __init__(self, path: str):
        self.path = path
        self.acoustic = _load_model(path)
        if not self.acoustic or not self.acoustic.file("acoustic"):
            raise ValueError("Not a DiffSinger voicebank: dsconfig.yaml with an acoustic model is missing.")
        self.dur = self._sub("dsdur")
        self.pitch = self._sub("dspitch")
        self.variance = self._sub("dsvariance")
        self._sessions: dict[str, object] = {}
        info = {}
        for n in ("character.yaml", "character.txt"):
            p = os.path.join(path, n)
            if os.path.exists(p):
                if n.endswith(".yaml"):
                    info.update({k: v for k, v in (_yaml(p) or {}).items() if isinstance(v, (str, int, float))})
                else:
                    for line in open(p, encoding="utf-8-sig", errors="ignore"):
                        if "=" in line:
                            k, v = line.split("=", 1); info.setdefault(k.strip(), v.strip())
        self.name = str(info.get("name") or os.path.basename(path.rstrip("/\\")))
        self.info = info
        langs = set()
        for root in [path] + [m.root for m in (self.dur, self.pitch, self.variance) if m]:
            for f in os.listdir(root):
                m = re.match(r"dsdict-([a-z]{2})", f)
                if m:
                    langs.add(m.group(1))
        self.languages = sorted(langs)
        self.speakers = self.acoustic.cfg.get("speakers") or []

    def _sub(self, name: str) -> Model | None:
        p = os.path.join(self.path, name)
        return _load_model(p) if os.path.isdir(p) else None

    def session(self, model: Model, key: str):
        f = model.file(key)
        if f not in self._sessions:
            self._sessions[f] = _session(f)
        return self._sessions[f]

    def describe(self) -> dict:
        return {"name": self.name, "path": self.path, "languages": self.languages, "speakers": self.speakers,
                "models": {"duration": bool(self.dur), "pitch": bool(self.pitch), "variance": bool(self.variance)},
                "vocoder": self.acoustic.cfg.get("vocoder"), "author": self.info.get("author"), "web": self.info.get("web")}


# ── the vocoder (mel -> waveform) ─────────────────────────────────────────────────────────────────────────────

def vocoder_dirs(extra: list[str] | None = None) -> list[str]:
    base = os.environ.get("AMS_VOCODERS") or os.path.join(os.path.expanduser("~"), ".ai-music-studio", "vocoders")
    return (extra or []) + [base]


def find_vocoder(name: str, bank: str) -> tuple[str, dict] | None:
    """the vocoder named in dsconfig.yaml: in the voicebank, or among the installed vocoders (OpenUtau .oudep layout)"""
    for d in [bank] + vocoder_dirs():
        if not os.path.isdir(d):
            continue
        for root, _dirs, files in os.walk(d):
            if "vocoder.yaml" in files:
                cfg = _yaml(os.path.join(root, "vocoder.yaml"))
                if cfg.get("name") == name or name in (cfg.get("model") or "") or os.path.basename(root) == name:
                    return os.path.join(root, cfg["model"]), cfg
            for f in files:
                if f.endswith(".onnx") and (f[:-5] == name or (name == "nsf_hifigan" and "nsf_hifigan" in f)):
                    return os.path.join(root, f), {"sample_rate": 44100, "hop_size": 512}
    return None


# ── notes -> phonemes on the notes ────────────────────────────────────────────────────────────────────────────

@dataclass
class Phone:
    ph: str
    start: float        # seconds
    end: float
    note: int           # index of the note it belongs to (-1: before the first note)


def split_phrases(notes: list[dict], gap: float = 0.6) -> list[list[dict]]:
    """phrases: runs of notes without a rest longer than `gap` seconds"""
    notes = sorted(notes, key=lambda n: n["start"])
    out: list[list[dict]] = []
    for n in notes:
        if out and n["start"] - max(x["end"] for x in out[-1]) < gap:
            out[-1].append(n)
        else:
            out.append([n])
    return out


def words_of(notes: list[dict]) -> list[list[int]]:
    """a word starts at a note with a lyric; notes with '+' or '-' (or empty after a word) continue it"""
    words: list[list[int]] = []
    for i, n in enumerate(notes):
        lyr = str(n.get("lyric") or "").strip()
        if words and (lyr in CONTINUE or lyr.startswith("+")):
            words[-1].append(i)
        else:
            words.append([i])
    return words


def place_phonemes(notes: list[dict], d: Dictionary, tokens: dict[str, int], cons_len: float = 0.07,
                   unknown: list[str] | None = None) -> list[Phone]:
    """the phonemes of each word on its notes (as OpenUtau's ProcessWord: each vowel starts a note and takes the
    consonants after it; the consonants before a word's first vowel sound just before its first note). Extra
    syllables go onto the last note, extra notes hold the last vowel (melisma). Rule timing; the duration model,
    when the voicebank has one, sets the lengths afterwards."""
    phones: list[Phone] = []
    for word in words_of(notes):
        lyr = str(notes[word[0]].get("lyric") or "").strip() or "la"
        syms = d.phonemes(lyr, tokens)
        if not syms:
            if unknown is not None:
                unknown.append(lyr)
            continue
        vow = [i for i, s in enumerate(syms) if d.is_vowel(s)] or [len(syms) - 1]
        lead = syms[: vow[0]]
        groups = [syms[v: (vow[k + 1] if k + 1 < len(vow) else len(syms))] for k, v in enumerate(vow)]
        n = min(len(groups), len(word))
        spans = []                                        # (group, note index, start, end)
        for k in range(n):
            last = k == n - 1
            g = sum(groups[k:], []) if last else groups[k]
            s0 = notes[word[k]]["start"]
            e0 = notes[word[-1]]["end"] if last else notes[word[k]]["end"]
            spans.append((g, word[k], s0, e0))
        start = spans[0][2]
        if lead:
            prev = phones[-1] if phones else None
            want = cons_len * len(lead)
            t = start - want
            if prev and prev.end > t:
                t = max(prev.start + 0.03, t)
                prev.end = t
            step = (start - t) / len(lead)
            for j, p in enumerate(lead):
                phones.append(Phone(p, t + j * step, t + (j + 1) * step, word[0]))
        for g, ni, s0, e0 in spans:
            vowel, tail = g[:1], g[1:]
            v_end = max(s0 + 0.5 * (e0 - s0), e0 - cons_len * len(tail)) if tail else e0
            phones.append(Phone(vowel[0], s0, v_end, ni))
            if tail:
                step = (e0 - v_end) / len(tail)
                for j, p in enumerate(tail):
                    phones.append(Phone(p, v_end + j * step, v_end + (j + 1) * step, ni))
    for a, b in zip(phones, phones[1:]):                  # no overlaps; short gaps inside a phrase are closed
        if b.start < a.end or b.start - a.end < 0.03:
            a.end = max(a.start + 0.01, b.start)
    return phones


# ── rendering ─────────────────────────────────────────────────────────────────────────────────────────────────

def _frames(sec: float, frame: float) -> int:
    return max(1, int(round(sec / frame)))


def _note_pitch_curve(notes: list[dict], times: np.ndarray, vibrato: float) -> np.ndarray:
    """MIDI pitch per frame from the notes: steps smoothed over ~60 ms, vibrato after the first 40 % of long notes"""
    p = np.full(len(times), float(notes[0]["pitch"]))
    for n in notes:
        p[times >= n["start"] - 0.03] = n["pitch"]
    k = max(1, int(0.06 / max(1e-6, times[1] - times[0] if len(times) > 1 else 0.01)))
    if k > 1:
        p = np.convolve(np.pad(p, k // 2, mode="edge"), np.ones(k) / k, "valid")[: len(times)]
    if vibrato > 0:
        for n in notes:
            dur = n["end"] - n["start"]
            if dur < 0.45:
                continue
            m = (times >= n["start"] + 0.4 * dur) & (times < n["end"])
            ramp = np.clip((times[m] - (n["start"] + 0.4 * dur)) / 0.25, 0, 1)
            p[m] += vibrato * ramp * np.sin(2 * np.pi * 5.6 * (times[m] - n["start"]))
    return p


def render(bank: Voicebank, notes: list[dict], lang: str | None = None, steps: int = 20, vibrato: float = 0.25,
           speaker: str | None = None, report: Callable[[float, str], None] = lambda p, t: None,
           unknown: list[str] | None = None) -> tuple[np.ndarray, int]:
    """notes: [{pitch, start, end (seconds), lyric}] -> (waveform, sample rate); lyrics the voice cannot sing are
    added to `unknown`"""
    ac = bank.acoustic
    voc = find_vocoder(str(ac.cfg.get("vocoder") or "nsf_hifigan"), bank.path)
    if not voc:
        raise FileNotFoundError(f"The vocoder \"{ac.cfg.get('vocoder')}\" is not installed (Vocal Editor → Install the vocoder).")
    voc_sess = _session(voc[0])
    sr = int(ac.cfg.get("sample_rate", 44100))
    frame = ac.frame
    lang = lang or (bank.languages[0] if bank.languages else None)
    dct = Dictionary(bank.path, lang, ac.tokens)
    phrases = split_phrases(notes)
    end_s = max(n["end"] for n in notes) + 1.0
    out = np.zeros(int(end_s * sr) + sr, np.float32)
    for pi, phrase in enumerate(phrases):
        report(100 * pi / len(phrases), f"Singing phrase {pi + 1} of {len(phrases)}")
        phones = place_phonemes(phrase, dct, ac.tokens, unknown=unknown)
        if not phones:
            continue
        if bank.dur:
            try:
                phones = _durations_from_model(bank, phrase, phones, lang) or phones
            except Exception as e:  # noqa: BLE001 - the rule timing still sings
                print(f"[diffsinger] duration model not used: {e}", flush=True)
        t0 = phones[0].start - HEAD * frame
        durs = [HEAD] + [_frames(p.end - p.start, frame) for p in phones] + [TAIL]
        toks = [ac.tokens.get("SP", 0)] + [ac.tokens[p.ph] for p in phones] + [ac.tokens.get("SP", 0)]
        n_frames = int(sum(durs))
        times = t0 + np.arange(n_frames) * frame
        midi = None
        if bank.pitch:
            try:
                midi = _pitch_from_model(bank, phrase, phones, durs, toks, times, lang, steps)
            except Exception as e:  # noqa: BLE001
                print(f"[diffsinger] pitch model not used: {e}", flush=True)
        if midi is None:
            midi = _note_pitch_curve(phrase, times, vibrato)
        f0 = (440.0 * 2 ** ((midi - 69) / 12)).astype(np.float32)
        feeds = {"tokens": np.array([toks], np.int64), "durations": np.array([durs], np.int64), "f0": f0[None]}
        sess = bank.session(ac, "acoustic")
        names = {i.name: i for i in sess.get_inputs()}
        if "speedup" in names:
            sp = max(1, 1000 // max(1, steps))
            while 1000 % sp and sp > 1:
                sp -= 1
            feeds["speedup"] = np.array(sp, np.int64) if not names["speedup"].shape else np.array([sp], np.int64)
        if "steps" in names:
            feeds["steps"] = np.array(steps, np.int64) if not names["steps"].shape else np.array([steps], np.int64)
        if "depth" in names:
            depth = float(ac.cfg.get("max_depth", 1.0) or 1.0)
            if "float" in names["depth"].type:
                feeds["depth"] = np.array(min(1.0, depth), np.float32) if not names["depth"].shape else np.array([min(1.0, depth)], np.float32)
            else:
                feeds["depth"] = np.array(int(depth), np.int64) if not names["depth"].shape else np.array([int(depth)], np.int64)
        if "languages" in names:
            feeds["languages"] = np.array([[0] + [ac.languages.get(p.ph.split("/")[0], 0) if "/" in p.ph else 0 for p in phones] + [0]], np.int64)
        if "spk_embed" in names:
            feeds["spk_embed"] = _speaker(bank, ac, speaker, n_frames)
        var = {}
        if bank.variance and any(k in names for k in ("energy", "breathiness", "voicing", "tension")):
            try:
                var = _variance_from_model(bank, phones, durs, toks, midi, lang, steps)
            except Exception as e:  # noqa: BLE001
                print(f"[diffsinger] variance model not used: {e}", flush=True)
        for k, default in (("energy", -30.0), ("breathiness", -70.0), ("voicing", -10.0), ("tension", 0.0)):
            if k in names:
                feeds[k] = var.get(k, np.full((1, n_frames), default, np.float32))
        if "gender" in names:
            feeds["gender"] = np.zeros((1, n_frames), np.float32)
        if "velocity" in names:
            feeds["velocity"] = np.ones((1, n_frames), np.float32)
        mel = sess.run(None, {k: v for k, v in feeds.items() if k in names})[0]
        wav = voc_sess.run(None, {"mel": mel.astype(np.float32), "f0": f0[None]})[0].reshape(-1)
        at = int(round(t0 * sr))
        a, b = max(0, at), min(len(out), at + len(wav))
        if b > a:
            out[a:b] += wav[a - at: b - at]
    report(100, "Done")
    peak = float(np.max(np.abs(out))) if len(out) else 0.0
    if peak > 0.98:
        out *= 0.98 / peak
    return out, sr


def _speaker(bank: Voicebank, model: Model, speaker: str | None, n_frames: int) -> np.ndarray:
    names = model.cfg.get("speakers") or []
    name = speaker if speaker in names else (names[0] if names else None)
    vec = np.zeros(int(model.cfg.get("hiddenSize", 256)), np.float32)
    if name:
        p = os.path.join(model.root, name + ".emb")
        if os.path.exists(p):
            vec = np.fromfile(p, dtype=np.float32)
    return np.repeat(vec[None, None, :], n_frames, axis=1)


def _durations_from_model(bank: Voicebank, notes: list[dict], phones: list[Phone], lang: str | None) -> list[Phone] | None:
    """the duration model (dsdur): linguistic encoder + duration predictor give each phoneme its length; the phonemes
    of each note are then stretched to end where the next note's vowel starts (OpenUtau ProcessPart)"""
    m = bank.dur
    if any(p.ph not in m.tokens for p in phones):
        return None
    frame = m.frame
    # word groups: the phonemes from one note's vowel to the next (the first group: the lead-in from the start)
    starts = [notes[i]["start"] for i in range(len(notes))]
    groups: list[list[int]] = [[]]
    for i, p in enumerate(phones):
        if p.note >= 0 and abs(p.start - starts[p.note]) < 1e-6 and (not groups[-1] or phones[groups[-1][-1]].note != p.note or True):
            if groups[-1]:
                groups.append([])
        groups[-1].append(i)
    head = phones[0].start - 0.5
    bounds = [head] + [phones[g[0]].start for g in groups[1:]] + [max(n["end"] for n in notes)]
    toks = [m.tokens.get("SP", 0)] + [m.tokens[p.ph] for p in phones]
    word_div = [1 + len(groups[0])] + [len(g) for g in groups[1:]]
    word_dur = [_frames(b - a, frame) for a, b in zip(bounds, bounds[1:])]
    if len(word_dur) != len(word_div):
        return None
    lsess = bank.session(m, "linguistic")
    lin_names = {i.name for i in lsess.get_inputs()}
    feeds = {"tokens": np.array([toks], np.int64), "word_div": np.array([word_div], np.int64), "word_dur": np.array([word_dur], np.int64)}
    if "languages" in lin_names:
        feeds["languages"] = np.array([[0] + [m.languages.get(p.ph.split("/")[0], 0) if "/" in p.ph else 0 for p in phones]], np.int64)
    lo = lsess.run(None, {k: v for k, v in feeds.items() if k in lin_names})
    outs = {o.name: v for o, v in zip(lsess.get_outputs(), lo)}
    dsess = bank.session(m, "dur")
    dn = {i.name for i in dsess.get_inputs()}
    midi = [notes[0]["pitch"]] + [notes[max(0, p.note)]["pitch"] for p in phones]
    dfeeds = {"encoder_out": outs["encoder_out"], "x_masks": outs["x_masks"], "ph_midi": np.array([midi], np.int64),
              "word_div": feeds["word_div"], "word_dur": feeds["word_dur"]}
    if "spk_embed" in dn:
        dfeeds["spk_embed"] = _speaker(bank, m, None, len(toks))
    dur = dsess.run(None, {k: v for k, v in dfeeds.items() if k in dn})[0].reshape(-1).astype(float)
    # stretch each group so it ends at the next alignment point
    res = [Phone(p.ph, p.start, p.end, p.note) for p in phones]
    cum = 1
    for gi, g in enumerate(groups):
        seg = dur[cum: cum + len(g)]
        cum += len(g)
        end = bounds[gi + 1]
        if gi == 0:
            total = seg.sum() * frame
            t = end - total
        else:
            t = bounds[gi]
            total = end - t
            seg = seg / max(1e-6, seg.sum()) * (total / frame)
        for k, i in enumerate(g):
            res[i].start = t
            t += seg[k] * frame
            res[i].end = t
    return res


def _pitch_from_model(bank: Voicebank, notes, phones, durs, toks_ac, times, lang, steps) -> np.ndarray | None:
    """the pitch model (dspitch): a natural pitch curve over the notes (OpenUtau DiffSingerPitch)"""
    m = bank.pitch
    if any(p.ph not in m.tokens for p in phones):
        return None
    toks = [m.tokens.get("SP", 0)] + [m.tokens[p.ph] for p in phones] + [m.tokens.get("SP", 0)]
    n_frames = int(sum(durs))
    lsess = bank.session(m, "linguistic")
    ln = {i.name for i in lsess.get_inputs()}
    feeds = {"tokens": np.array([toks], np.int64), "ph_dur": np.array([durs], np.int64)}
    if "word_div" in ln:
        vowels = [0] + [i + 1 for i, p in enumerate(phones) if Dictionary.__dict__ and p.ph in m.tokens and _is_vowel_guess(p.ph)]
        idx = sorted(set(vowels))
        div = [b - a for a, b in zip(idx, idx[1:] + [len(toks) - 1])] + [1]
        if sum(div) != len(toks):
            div = [len(toks) - 1, 1]
        wdur, c = [], 0
        for d_ in div:
            wdur.append(int(sum(durs[c: c + d_]))); c += d_
        feeds["word_div"] = np.array([div], np.int64); feeds["word_dur"] = np.array([wdur], np.int64)
    if "languages" in ln:
        feeds["languages"] = np.array([[0] + [m.languages.get(p.ph.split("/")[0], 0) if "/" in p.ph else 0 for p in phones] + [0]], np.int64)
    lo = lsess.run(None, {k: v for k, v in feeds.items() if k in ln})
    outs = {o.name: v for o, v in zip(lsess.get_outputs(), lo)}
    frame = m.frame
    t0 = times[0]
    nd, nm, nr = [max(0.0, notes[0]["start"] - t0)], [notes[0]["pitch"]], [True]
    prev = notes[0]["start"]
    for n in notes:
        if n["start"] - prev > 1e-3:
            nd.append(n["start"] - prev); nm.append(n["pitch"]); nr.append(True)
        nd.append(n["end"] - n["start"]); nm.append(n["pitch"]); nr.append(False)
        prev = n["end"]
    nd.append(TAIL * frame); nm.append(notes[-1]["pitch"]); nr.append(True)
    fr = [max(1, int(round(x / frame))) for x in nd]
    diff = n_frames - sum(fr)
    fr[-1] = max(1, fr[-1] + diff)
    psess = bank.session(m, "pitch")
    pn = {i.name: i for i in psess.get_inputs()}
    pf = {"encoder_out": outs["encoder_out"], "note_midi": np.array([nm], np.float32), "note_dur": np.array([fr], np.int64),
          "ph_dur": np.array([durs], np.int64), "pitch": np.full((1, n_frames), 60.0, np.float32),
          "retake": np.ones((1, n_frames), bool), "note_rest": np.array([nr], bool), "expr": np.ones((1, n_frames), np.float32)}
    for k in ("speedup", "steps"):
        if k in pn:
            v = max(1, 1000 // max(1, steps)) if k == "speedup" else steps
            pf[k] = np.array(v, np.int64) if not pn[k].shape else np.array([v], np.int64)
    if "depth" in pn:
        pf["depth"] = np.array(1.0, np.float32) if "float" in pn["depth"].type else np.array(1000, np.int64)
    if "spk_embed" in pn:
        pf["spk_embed"] = _speaker(bank, m, None, n_frames)
    curve = psess.run(None, {k: v for k, v in pf.items() if k in pn})[0].reshape(-1)
    return curve[:n_frames] if len(curve) >= n_frames else np.pad(curve, (0, n_frames - len(curve)), mode="edge")


def _variance_from_model(bank, phones, durs, toks_ac, midi, lang, steps) -> dict:
    m = bank.variance
    if any(p.ph not in m.tokens for p in phones):
        return {}
    toks = [m.tokens.get("SP", 0)] + [m.tokens[p.ph] for p in phones] + [m.tokens.get("SP", 0)]
    n_frames = int(sum(durs))
    lsess = bank.session(m, "linguistic")
    ln = {i.name for i in lsess.get_inputs()}
    feeds = {"tokens": np.array([toks], np.int64), "ph_dur": np.array([durs], np.int64)}
    if "word_div" in ln:
        feeds["word_div"] = np.array([[len(toks) - 1, 1]], np.int64)
        feeds["word_dur"] = np.array([[int(sum(durs[:-1])), int(durs[-1])]], np.int64)
    if "languages" in ln:
        feeds["languages"] = np.array([[0] + [m.languages.get(p.ph.split("/")[0], 0) if "/" in p.ph else 0 for p in phones] + [0]], np.int64)
    lo = lsess.run(None, {k: v for k, v in feeds.items() if k in ln})
    outs = {o.name: v for o, v in zip(lsess.get_outputs(), lo)}
    vsess = bank.session(m, "variance")
    vn = {i.name: i for i in vsess.get_inputs()}
    vf = {"encoder_out": outs["encoder_out"], "ph_dur": np.array([durs], np.int64), "pitch": midi[None].astype(np.float32),
          "retake": np.ones((1, n_frames, sum(1 for k in ("energy", "breathiness", "voicing", "tension") if k in vn)), bool)}
    for k in ("energy", "breathiness", "voicing", "tension"):
        if k in vn:
            vf[k] = np.zeros((1, n_frames), np.float32)
    for k in ("speedup", "steps"):
        if k in vn:
            v = max(1, 1000 // max(1, steps)) if k == "speedup" else steps
            vf[k] = np.array(v, np.int64) if not vn[k].shape else np.array([v], np.int64)
    if "spk_embed" in vn:
        vf["spk_embed"] = _speaker(bank, m, None, n_frames)
    res = vsess.run(None, {k: v for k, v in vf.items() if k in vn})
    return {o.name.replace("_pred", ""): v.astype(np.float32) for o, v in zip(vsess.get_outputs(), res)}


def _is_vowel_guess(ph: str) -> bool:
    core = ph.split("/")[-1].lower()
    return bool(re.match(r"^[aeiou@]", core)) or core in ("er", "ax", "ix", "ux")


# ── lyrics on notes ───────────────────────────────────────────────────────────────────────────────────────────

def syllable_count(word: str, lang: str) -> int:
    """how many notes a word needs: its vowels after G2P (en, es, de), else vowel letter groups"""
    g = g2p(lang)
    if g:
        q = g.query(word)
        if q:
            return max(1, sum(1 for p in q if p in g.vowels))
    return max(1, len(re.findall(r"[aeiouyäöüáéíóúàèìòù]+", word.lower())))


def assign_lyrics(text: str, n_notes: int, lang: str) -> list[str]:
    """lyrics text -> one entry per note: a word on its first note, '+' on the notes that hold its further syllables"""
    words = [w for w in re.findall(r"[\w'’-]+", text) if w.strip("-")]
    out: list[str] = []
    for w in words:
        if len(out) >= n_notes:
            break
        out.append(w)
        out += ["+"] * min(n_notes - len(out), syllable_count(w, lang) - 1)
    return out + ["+"] * 0 + [""] * (n_notes - len(out))
