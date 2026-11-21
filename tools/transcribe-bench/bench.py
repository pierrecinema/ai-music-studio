"""Accuracy of audio -> MIDI on the rendered test set (mir_eval note F1, onset 50 ms; and with offsets)."""
import json, sys, os, glob, time
import numpy as np, mir_eval
SET = os.environ.get('A2M_SET', '/tmp/a2m-set')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'server'))

def score(ref, est, offsets=False, tol=0.05):
    if not ref: return None
    ri = np.array([[n['start'], n['end']] for n in ref]); rp = np.array([440 * 2 ** ((n['pitch'] - 69) / 12) for n in ref])
    if not est: return (0.0, 0.0, 0.0)
    ei = np.array([[n['start'], max(n['end'], n['start'] + 0.01)] for n in est]); ep = np.array([440 * 2 ** ((n['pitch'] - 69) / 12) for n in est])
    p, r, f, _ = mir_eval.transcription.precision_recall_f1_overlap(ri, rp, ei, ep, onset_tolerance=tol, offset_ratio=0.2 if offsets else None)
    return (round(p, 3), round(r, 3), round(f, 3))

def drum_score(ref, est):
    # drums: per class (kick / snare / hats), onset F within 50 ms
    cls = lambda p: 'kick' if p in (35, 36) else 'snare' if p in (37, 38, 39, 40) else 'hat' if p in (42, 44, 46, 51, 53, 59) else 'other'
    out = {}
    for c in ('kick', 'snare', 'hat'):
        r = np.array(sorted(n['start'] for n in ref if cls(n['pitch']) == c)); e = np.array(sorted(n['start'] for n in est if cls(n['pitch']) == c))
        if len(r) == 0: continue
        f, p, rr = mir_eval.onset.f_measure(r, e, window=0.05) if len(e) else (0, 0, 0)
        out[c] = round(f, 3)
    return out

def run(method, parts=None):
    import importlib
    tr = importlib.import_module('services.transcribe')
    tot = {}
    for tf in sorted(glob.glob(f'{SET}/*-truth.json')):
        truth = json.load(open(tf)); g = truth['genre']
        for pid, pt in truth['parts'].items():
            if parts and pid not in parts: continue
            t0 = time.time()
            est = method(tr, f'{SET}/{g}-{pid}.wav', pid)
            dt = time.time() - t0
            if pid == 'drums':
                s = drum_score(pt['notes'], est); print(f'{g:8} {pid:7} {s}  {dt:.1f}s'); tot.setdefault(pid, []).append(np.mean(list(s.values())) if s else 0)
            else:
                s = score(pt['notes'], est); s1 = score(pt['notes'], est, tol=0.1)
                print(f'{g:8} {pid:7} 50ms P/R/F {s}  100ms {s1}  n={len(est)}/{len(pt["notes"])}  {dt:.1f}s'); tot.setdefault(pid, []).append(s[2]); tot.setdefault(pid + '@100', []).append(s1[2])
    print('MEAN', {k: round(float(np.mean(v)), 3) for k, v in tot.items()})

if __name__ == '__main__':
    mode = sys.argv[1]; parts = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    if mode == 'bp':
        run(lambda tr, f, pid: tr.basic_pitch_notes(f), parts)
    elif mode == 'aligned':
        import json as J
        def m(tr, f, pid):
            g = f.split('/')[-1].split('-')[0]; bpm = J.load(open(f'{SET}/{g}-truth.json'))['bpm']
            r = tr.transcribe_stem(f, pid)['notes']
            return tr.align_to_grid(r, bpm, 0.0)[0] if pid != 'drums' else r
        run(m, parts)
    elif mode == 'auto':
        run(lambda tr, f, pid: tr.transcribe_stem(f, pid)['notes'], parts)
