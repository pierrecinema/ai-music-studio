// Tests of the Studio logic that does not need a sound card: tempo map, automation, warp markers,
// loop recording passes, comping, groups, several clips at once, loop range and markers.
// Run: pnpm --filter ai-music-studio-desktop test   (bundled with esbuild, run with node)
import { barAt, bars, beatToSec, bpmAt, formatPosition, isDownbeat, secToBeat } from '../src/renderer/src/audio/timemap'
import { valueAt } from '../src/renderer/src/audio/automation'
import { beatOfSrc, srcOfBeat, validMarkers, warpSegments } from '../src/renderer/src/audio/warp'
import { isAudible, recordingPieces } from '../src/renderer/src/audio/engine'
import { useProjectStore } from '../src/renderer/src/stores/project.store'
import type { Project, Track } from '../src/renderer/src/types'
import { matchesQuery } from '../src/renderer/src/lib/librarySearch'
import type { LibraryTrack } from '../src/renderer/src/lib/api'
import { alignStarts, leadBeats, phaseAlign } from '../src/renderer/src/beatmatch/store'
import { autoStructure } from '../src/renderer/src/lib/lyrics'
import { measureBalance, PROFILES, suggest, bassWidth } from '../src/renderer/src/audio/master/assistant'
import { defaultChain } from '../src/renderer/src/audio/master/chain'
import { applyEdits, applyOp, copyPart, fadeShape } from '../src/renderer/src/audio/master/edit'
import { VstLink, packBlock, unpackBlock } from '../src/renderer/src/audio/vst/link'
import { buildMap, comboTaken, eventToCombo } from '../src/renderer/src/shortcuts/registry'
import { analyze, BiquadBank, CompressorCore, crossover, LimiterCore, MultibandCore, truePeakTaps } from '../src/renderer/src/audio/master/dsp'

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else { failed++; console.log(`FAIL ${name} ${detail}`) }
}
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps

// ── tempo map ──
const p0 = { bpm: 120, timeSignature: [4, 4] as [number, number], tempoMap: [{ beat: 8, bpm: 60 }], signatures: [{ bar: 2, num: 3, den: 4 }] }
check('beatToSec before change', near(beatToSec(p0, 4), 2))
check('beatToSec after change', near(beatToSec(p0, 10), 4 + 2))
check('secToBeat inverse', near(secToBeat(p0, beatToSec(p0, 13.7)), 13.7))
check('bpmAt', bpmAt(p0, 7.9) === 120 && bpmAt(p0, 8) === 60)
const b = bars(p0, 20)
check('bars with 3/4 from bar 3', b[2].beat === 8 && b[2].length === 3 && b[3].beat === 11, JSON.stringify(b.slice(0, 4)))
check('barAt', barAt(p0, 12).index === 3)
check('downbeat', isDownbeat(p0, 11) && !isDownbeat(p0, 12))
check('formatPosition', formatPosition(p0, 12) === '4.2', formatPosition(p0, 12))
const p68 = { bpm: 120, timeSignature: [6, 8] as [number, number] }
check('6/8 bar is 3 quarter beats', bars(p68, 7)[1].beat === 3)

// ── automation ──
const pts = [{ beat: 0, value: 0 }, { beat: 4, value: 1 }]
check('automation middle', near(valueAt(pts, 2, 0.5), 0.5))
check('automation after', near(valueAt(pts, 9, 0.5), 1))
check('automation empty uses fallback', near(valueAt([], 3, 0.7), 0.7))

// ── warp markers ──
const spb = 0.5
const m = [{ src: 1, beat: 2 }, { src: 2, beat: 6 }]     // 1 s of audio stretched over 4 beats
check('warp before first', near(beatOfSrc(m, 0.5, spb), 1))
check('warp between', near(beatOfSrc(m, 1.5, spb), 4))
check('warp after last', near(beatOfSrc(m, 3, spb), 8))
check('warp inverse', [0.2, 1.3, 2.7].every((s) => near(srcOfBeat(m, beatOfSrc(m, s, spb), spb), s)))
check('warp valid', validMarkers(m) && !validMarkers([{ src: 1, beat: 3 }, { src: 2, beat: 2 }]))
const segs = warpSegments(m, 4, spb, spb)
check('warp segments', segs.length === 3 && near(segs[0].ratio, 1) && near(segs[1].ratio, 2) && near(segs[2].ratio, 1), JSON.stringify(segs))
check('no markers = plain', near(beatOfSrc(undefined, 3, spb), 6) && near(srcOfBeat([], 6, spb), 3))

// ── loop recording passes ──
const pr = { ...p0, tempoMap: [], signatures: [] } as unknown as Project
// recording starts at beat 2 inside a loop 0..8 (4 s at 120 bpm), wraps after 3 s and 7 s, 9.5 s recorded, 0.2 s lead
const pieces = recordingPieces(pr, 2, 9.5, 0.2, [3.2, 7.2], { start: 0, end: 8 })
check('loop passes: three takes', pieces.length === 3, JSON.stringify(pieces))
check('first pass from start beat', near(pieces[0].startBeat, 2) && near(pieces[0].endBeat, 8) && near(pieces[0].offset, 0.2))
check('second pass full loop', near(pieces[1].startBeat, 0) && near(pieces[1].endBeat, 8) && near(pieces[1].offset, 3.2))
check('last pass partial', near(pieces[2].offset, 7.2) && near(pieces[2].endBeat, (9.5 - 7.2) * 2))
const single = recordingPieces(pr, 4, 5.2, 0.2, [], null)
check('no loop: one clip', single.length === 1 && near(single[0].endBeat, 14))

// ── store: groups, comping, several clips, loop, markers ──
const st = useProjectStore.getState()
st.newProject()
st.addTrack('audio'); st.addTrack('audio'); st.addTrack('midi')
let tracks = useProjectStore.getState().project.tracks
const [a, c] = [tracks[0], tracks[1]]
useProjectStore.getState().addClip(a.id, { startTime: 0, duration: 8, audioFile: 'x.wav', offset: 0 })
useProjectStore.getState().addClip(c.id, { startTime: 4, duration: 4, audioFile: 'y.wav' })
useProjectStore.getState().groupTracks([a.id, c.id])
tracks = useProjectStore.getState().project.tracks
const group = tracks.find((t) => t.type === 'group') as Track
check('group created first', tracks[0].id === group.id && tracks[1].parentId === group.id && tracks[2].parentId === group.id && !tracks[3].parentId,
  tracks.map((t) => `${t.type}:${t.parentId ?? '-'}`).join(' '))
useProjectStore.getState().updateTrack(tracks[1].id, { soloed: true })
tracks = useProjectStore.getState().project.tracks
check('solo: group stays audible', isAudible(tracks[0], tracks) && isAudible(tracks[1], tracks) && !isAudible(tracks[2], tracks))
useProjectStore.getState().updateTrack(tracks[1].id, { soloed: false })
useProjectStore.getState().updateTrack(group.id, { soloed: true })
tracks = useProjectStore.getState().project.tracks
check('solo group: children audible', isAudible(tracks[1], tracks) && isAudible(tracks[2], tracks) && !isAudible(tracks[3], tracks))
useProjectStore.getState().updateTrack(group.id, { soloed: false })

// comping: a take from beat 2 to 4 replaces that part of the 0..8 clip
const take = { id: 't1', name: 'Take 1', clips: [{ id: 'tc', startTime: 2, duration: 2, audioFile: 'take.wav', offset: 1 }] }
useProjectStore.getState().updateTrack(a.id, { takes: [take] })
useProjectStore.getState().promoteTake(a.id, 't1', 'tc')
const comped = useProjectStore.getState().project.tracks.find((t) => t.id === a.id)!.clips.sort((x, y) => x.startTime - y.startTime)
check('comping splits the main clip', comped.length === 3 && near(comped[0].duration, 2) && comped[1].audioFile === 'take.wav' && near(comped[2].startTime, 4) && near(comped[2].offset ?? 0, 2),
  JSON.stringify(comped.map((x) => [x.startTime, x.duration, x.offset, x.audioFile])))

// several clips move together, never before 0
const ids = useProjectStore.getState().project.tracks.flatMap((t) => t.clips.map((x) => x.id))
useProjectStore.getState().moveClips(ids, -10)
const starts = useProjectStore.getState().project.tracks.flatMap((t) => t.clips.map((x) => x.startTime))
check('move group stops at 0', Math.min(...starts) === 0)
useProjectStore.getState().removeClips(ids.slice(0, 2))
check('remove several', useProjectStore.getState().project.tracks.flatMap((t) => t.clips).length === ids.length - 2)

// loop range and markers
useProjectStore.getState().setLoop({ start: 8, end: 4, enabled: true })
const loop = useProjectStore.getState().project.loop!
check('loop swaps reversed ends', loop.start === 4 && loop.end === 8 && loop.enabled)
const mid = useProjectStore.getState().addMarker(12)
useProjectStore.getState().addMarker(2, 6)
const markers = useProjectStore.getState().project.markers!
check('markers sorted, cycle marker named', markers[0].end === 6 && markers[0].name === 'Cycle 1' && markers[1].id === mid)

// returns and sends: deleting a return cleans the sends and its automation lane
useProjectStore.getState().addReturn('reverb')
const r = useProjectStore.getState().project.returns![0]
useProjectStore.getState().setSend(a.id, r.id, 0.5)
useProjectStore.getState().setAutomation(a.id, `send:${r.id}`, [{ beat: 0, value: 0.2 }])
useProjectStore.getState().removeReturn(r.id)
const ta = useProjectStore.getState().project.tracks.find((t) => t.id === a.id)!
check('return removed cleanly', !useProjectStore.getState().project.returns!.length && !(r.id in (ta.sends ?? {})) && !ta.automation?.[`send:${r.id}`])

// split respects warp markers: the right part starts at the file second that plays there
useProjectStore.getState().newProject()
useProjectStore.getState().addTrack('audio')
const t2 = useProjectStore.getState().project.tracks[0]
useProjectStore.getState().addClip(t2.id, { startTime: 0, duration: 8, audioFile: 'z.wav', offset: 0, warpMarkers: [{ src: 1, beat: 4 }] })
const clip = useProjectStore.getState().project.tracks[0].clips[0]
useProjectStore.getState().splitClip(t2.id, clip.id, 2)       // 120 bpm: beat 2 lies halfway to the marker -> 0.5 s
const right = useProjectStore.getState().project.tracks[0].clips[1]
check('split with warp markers', near(right.offset ?? -1, 0.5), String(right.offset))

// library search: words, tags, BPM and BPM ranges
const lt = (o: Partial<LibraryTrack>): LibraryTrack => ({ id: 'x', title: '', file: '', path: '', exists: true, created: 0, duration: 10, engine: '', source: 'generated', prompt: '', lyrics: '', seed: null, favorite: false, notes: '', ...o })
const loopT = lt({ title: 'Deep house – Loop 124 BPM 4 bars', bpm: 124, tags: ['house', 'warm'] })
const stemT = lt({ title: 'Midnight Drive – vocals', bpm: 118, source: 'stem', stem: 'vocals', tags: ['synthwave'] })
check('search by word', matchesQuery(loopT, 'deep') && !matchesQuery(stemT, 'deep'))
check('search by tag', matchesQuery(loopT, 'warm') && matchesQuery(stemT, 'Synthwave'))
check('search by bpm', matchesQuery(loopT, '124') && matchesQuery(loopT, '123') && !matchesQuery(loopT, '120'))
check('search by bpm range', matchesQuery(stemT, '110-120') && matchesQuery(stemT, 'bpm 118') && !matchesQuery(loopT, '110-120'))
check('search by stem name and several words', matchesQuery(stemT, 'vocals midnight') && !matchesQuery(stemT, 'vocals house'))

// beat sync: a clip's beats on project beats; with a measured downbeat, its bar 1 on a project bar line
{
  // 120 BPM file, first beat 0.25 s in, downbeat on its 3rd beat (0.25 + 2 * 0.5 = 1.25 s); clip dropped at beat 5.3
  const beatOnly = phaseAlign({ startTime: 5.3, duration: 16 }, 0.25, 120)
  const firstBeatAt = beatOnly.startTime + 0.25 / 0.5
  check('phase sync puts a beat on a project beat', near(firstBeatAt, Math.round(firstBeatAt)), String(firstBeatAt))
  const bar = phaseAlign({ startTime: 5.3, duration: 16 }, 0.25, 120, 1.25, 4)
  const downAt = bar.startTime + 1.25 / 0.5
  check('bar sync puts the downbeat on a bar line', near(downAt % 4, 0) || near(downAt % 4, 4), String(downAt))
  check('bar sync moves at most two beats', Math.abs(bar.startTime - 5.3) <= 2.0001, String(bar.startTime))
}

// several clips synced together: beat 1 of every clip on the same bar line
{
  // a song with a 3.1 s intro at 125 BPM (downbeat after 6.458 beats) and a loop that starts on beat 1
  const songLead = leadBeats({ offset: 0 }, 125, 3.1, 4)
  check('lead beats of a song intro', near(songLead, 3.1 / 0.48), String(songLead))
  check('lead beats skip a trimmed downbeat', near(leadBeats({ offset: 4 }, 120, 1, 4), 2), String(leadBeats({ offset: 4 }, 120, 1, 4)))
  const r = alignStarts([
    { id: 'song', startTime: 0.7, lead: songLead },
    { id: 'loop', startTime: 13.2, lead: 0 },
    { id: 'stem', startTime: 9, lead: 0.5 }
  ], 4)
  const ones = [r.starts.song + songLead, r.starts.loop, r.starts.stem + 0.5]
  check('all start on the same bar', ones.every((x) => near(x, r.bar)), JSON.stringify(ones))
  check('the shared bar is a bar line and fits every intro', near(r.bar % 4, 0) && r.bar >= songLead && Object.values(r.starts).every((x) => x >= 0), String(r.bar))
  const late = alignStarts([{ id: 'a', startTime: 31, lead: 0 }, { id: 'b', startTime: 40, lead: 1 }], 4)
  check('the bar nearest the earliest clip is kept', near(late.bar, 32) && near(late.starts.b, 31), JSON.stringify(late))
}

// lyrics without sections get [Verse] / [Chorus]; a repeated stanza is the chorus
{
  const a = autoStructure('a1\na2\n\nchorus x\nchorus y\n\nb1\nb2\n\nchorus x\nchorus y')
  check('repeated stanza becomes the chorus', a === '[Verse]\na1\na2\n\n[Chorus]\nchorus x\nchorus y\n\n[Verse]\nb1\nb2\n\n[Chorus]\nchorus x\nchorus y', a)
  const b = autoStructure('l1\nl2\nl3\nl4\nl5\nl6')
  check('one long block is cut into stanzas of four', b === '[Verse]\nl1\nl2\nl3\nl4\n\n[Chorus]\nl5\nl6', b)
  check('lyrics with sections stay as they are', autoStructure('[Intro]\nhey') === '[Intro]\nhey')
}

// mastering: loudness after ITU-R BS.1770, true peak, limiter ceiling, multiband sums flat
{
  const sr = 48000, n = sr * 6
  const sine = (f: number, a: number, ph = 0): Float32Array => { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = a * Math.sin(2 * Math.PI * f * i / sr + ph); return d }
  const full = analyze([sine(997, 1), sine(997, 1)], sr)
  check('997 Hz at 0 dBFS in both channels is 0.0 LUFS', Math.abs(full.integrated) < 0.05, full.integrated.toFixed(3))
  const one = analyze([sine(997, 1), new Float32Array(n)], sr)
  check('one channel only is -3.01 LUFS', Math.abs(one.integrated + 3.01) < 0.05, one.integrated.toFixed(3))
  const q = analyze([sine(sr / 4, 1, Math.PI / 4), sine(sr / 4, 1, Math.PI / 4)], sr)
  check('true peak finds the peak between samples', Math.abs(q.samplePeak + 3.01) < 0.05 && q.truePeak > -0.3, `${q.samplePeak.toFixed(2)} / ${q.truePeak.toFixed(2)}`)
  const x = sine(100, 0.9), y = sine(3000, 0.9)
  for (let i = 0; i < n; i++) { const r = Math.sin(i * 12.9898) * 43758.5453; const v = (r - Math.floor(r) - 0.5) * 0.6; x[i] += v; y[i] -= v }
  const lim = new LimiterCore({ sr, channels: 2, tp: truePeakTaps() })
  lim.set({ gainDb: 12, ceilingDb: -1 })
  const o = [new Float32Array(n), new Float32Array(n)]
  for (let i = 0; i < n; i += 128) lim.process([x.subarray(i, i + 128), y.subarray(i, i + 128)], [o[0].subarray(i, i + 128), o[1].subarray(i, i + 128)], 128)
  const l = analyze(o, sr)
  check('limiter keeps the true peak at the ceiling', l.truePeak <= -0.95, l.truePeak.toFixed(2))
  const c = new CompressorCore({ sr, channels: 1 })
  c.set({ thresholdDb: -20, ratio: 4, kneeDb: 0 })
  check('compressor 4:1 above -20 dB: 12 dB over gives 9 dB less', Math.abs(c.curve(-8) + 9) < 1e-9, String(c.curve(-8)))
  const mb = new MultibandCore({ sr, channels: 1, Comp: CompressorCore, Bank: BiquadBank, xo: [crossover(sr, 200), crossover(sr, 3000)].map((z) => [z.low, z.high]) })
  for (let b = 0; b < 3; b++) mb.set(b, { thresholdDb: 0, ratio: 1 })
  let worst = 0
  for (const f of [60, 200, 1000, 2950, 9000]) {
    const s = sine(f, 0.5), out = new Float32Array(n)
    for (let i = 0; i < n; i += 128) mb.process([s.subarray(i, i + 128)], [out.subarray(i, i + 128)], 128)
    let e = 0, ei = 0
    for (let i = n / 2; i < n; i++) { e += out[i] * out[i]; ei += s[i] * s[i] }
    worst = Math.max(worst, Math.abs(10 * Math.log10(e / ei)))
  }
  check('multiband with no compression sums flat (±0.05 dB)', worst < 0.05, worst.toFixed(3))
}

// mastering edits: cut, crop, paste, silence, fades, gain, normalise, DC, trim
{
  const sr = 1000
  const ramp = (): Float32Array[] => [Float32Array.from({ length: 1000 }, (_, i) => i / 1000), Float32Array.from({ length: 1000 }, (_, i) => -i / 1000)]
  const src = ramp()
  const cut = applyOp(src, sr, { type: 'delete', start: 0.2, end: 0.5 })
  check('cut removes the part and joins the rest', cut[0].length === 700 && Math.abs(cut[0][200] - 0.5) < 1e-6 && Math.abs(cut[1][200] + 0.5) < 1e-6, String(cut[0][200]))
  check('the original is not changed', src[0].length === 1000 && src[0][300] > 0.29)
  const crop = applyOp(src, sr, { type: 'crop', start: 0.1, end: 0.3 })
  check('crop keeps only the part', crop[0].length === 200 && Math.abs(crop[0][0] - 0.1) < 1e-6)
  const clip = copyPart(src, sr, 0.0, 0.1)
  const pasted = applyOp(src, sr, { type: 'paste', at: 0.5, clip })
  check('paste inserts the copied part', pasted[0].length === 1100 && Math.abs(pasted[0][500]) < 1e-6 && Math.abs(pasted[0][600] - 0.5) < 1e-6)
  const sil = applyOp(src, sr, { type: 'silence', start: 0.4, end: 0.6 })
  check('silence makes a part quiet, length stays', sil[0].length === 1000 && sil[0][500] === 0 && sil[0][700] > 0)
  const fin = applyOp([new Float32Array(1000).fill(1)], sr, { type: 'fade', start: 0, end: 1, dir: 'in', curve: 'linear' })
  check('fade in starts silent and ends at full level', fin[0][0] === 0 && Math.abs(fin[0][999] - 1) < 1e-6 && Math.abs(fin[0][500] - 0.5) < 0.01)
  check('fade curves: smooth is 0.5 in the middle, log quieter than linear', Math.abs(fadeShape(0.5, 'smooth') - 0.5) < 1e-9 && fadeShape(0.5, 'log') < 0.5)
  const g = applyOp([new Float32Array(10).fill(0.5)], sr, { type: 'gain', start: 0, end: 0.01, db: 6.0206 })
  check('gain +6 dB doubles the level', Math.abs(g[0][5] - 1) < 1e-4)
  const pk = applyOp([Float32Array.from({ length: 100 }, (_, i) => Math.sin(i) * 0.25)], sr, { type: 'normalize', start: 0, end: 0.1, mode: 'peak', target: -1 })
  const peak = Math.max(...Array.from(pk[0], Math.abs))
  check('normalise to -1 dBFS peak', Math.abs(20 * Math.log10(peak) + 1) < 0.01, String(peak))
  const dc = applyOp([new Float32Array(100).fill(0.2)], sr, { type: 'dc' })
  check('DC offset removed', Math.abs(dc[0][50]) < 1e-6)
  const padded = [new Float32Array(1000)]; padded[0].fill(0.5, 300, 600)
  const tr = applyOp(padded, sr, { type: 'trim', thresholdDb: -60 })
  check('trim removes silence at start and end', tr[0].length < 400 && tr[0].length >= 300, String(tr[0].length))
  const all = applyEdits(src, sr, [{ type: 'delete', start: 0, end: 0.1 }, { type: 'crop', start: 0, end: 0.5 }])
  check('steps apply in order', all[0].length === 500 && Math.abs(all[0][0] - 0.1) < 1e-6)
}

// mastering assistant: pink noise measures flat; too much bass is found and turned down
{
  const sr = 48000, n = sr * 8
  let seed = 7
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1 }
  const pink = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {            // Paul Kellet's pink filter
    const w = rnd()
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520
    b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
    pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.05; b6 = w * 0.115926
  }
  const flat = measureBalance([pink, pink], sr)
  // the test's pink filter is only pink up to about 10 kHz (above, its white part shows): bands 20 Hz–12 kHz
  const worst = Math.max(...Object.entries(flat).filter(([k]) => k !== 'air').map(([, v]) => Math.abs(v)))
  check('pink noise measures flat (±1.5 dB, 20 Hz–12 kHz)', worst < 1.5, JSON.stringify(flat))
  check('mono material has no bass width', bassWidth([pink, pink], sr) < 0.01)
  // +8 dB below 150 Hz
  const xo = { b: 0, y: 0 }
  const boosted = new Float32Array(n)
  const k = 1 - Math.exp(-2 * Math.PI * 150 / sr)
  for (let i = 0; i < n; i++) { xo.y += k * (pink[i] - xo.y); boosted[i] = pink[i] + xo.y * 1.5 }
  const bal = measureBalance([boosted, boosted], sr)
  check('extra bass is measured', bal.bass > flat.bass + 3, JSON.stringify(bal))
  const flatProfile = { ...PROFILES[3], balance: flat }
  const a = analyze([boosted, boosted], sr)
  const sug = suggest(a, bal, 0, flatProfile)
  const low = sug.find((x) => x.id === 'low')
  const c = low?.apply?.(defaultChain())
  const eq = c?.slots.find((x) => x.type === 'eq') as { p: { lowG: number } } | undefined
  check('assistant turns the bass down with the low shelf', !!eq && eq.p.lowG < 0, JSON.stringify(sug.map((x) => x.id)))
  check('assistant always proposes the loudness target', sug.some((x) => x.id === 'loud' && x.reach))
}

// ── VST link (worklet side of a plugin insert) ──
{
  // a "plugin" that halves the sound and answers at once: the output is the input * 0.5, exactly `delay` later
  const sent: Array<[number, Float32Array[]]> = []
  const link = new VstLink({ block: 256, delay: 512, send: (seq, b) => sent.push([seq, b]) })
  const total = 128 * 40
  const inp = new Float32Array(total).map((_, i) => Math.sin(i * 0.01))
  const out = new Float32Array(total)
  for (let p = 0; p < total; p += 128) {
    const o = [new Float32Array(128), new Float32Array(128)]
    link.process([inp.subarray(p, p + 128), inp.subarray(p, p + 128)], o, 128)
    while (sent.length) { const [seq, b] = sent.shift()!; link.receive(seq, b.map((c) => c.map((x) => x * 0.5))) }
    out.set(o[0], p)
  }
  check('vst link: silent for the delay', out.slice(0, 512).every((x) => x === 0))
  check('vst link: processed and delayed exactly', [600, 1000, 3000, 5000].every((i) => near(out[i], inp[i - 512] * 0.5, 1e-6)))
  check('vst link: no underruns when answers come in time', link.underruns === 0, String(link.underruns))
  // answers that never come: silence and counted, no drift afterwards
  const lost = new VstLink({ block: 256, delay: 512, send: () => {} })
  const o2 = [new Float32Array(128), new Float32Array(128)]
  for (let k = 0; k < 20; k++) lost.process([inp.subarray(0, 128)], o2, 128)
  check('vst link: missing blocks play silence and are counted', lost.underruns > 0 && o2[0].every((x) => x === 0))
  // switched off: plays the dry sound with the same delay
  const off = new VstLink({ block: 256, delay: 512, on: false, send: () => { throw new Error('sent while off') } })
  const o3 = new Float32Array(total)
  for (let p = 0; p < total; p += 128) { const o = [new Float32Array(128), new Float32Array(128)]; off.process([inp.subarray(p, p + 128)], o, 128); o3.set(o[0], p) }
  check('vst link: off keeps the timing (dry, delayed)', near(o3[2000], inp[2000 - 512]))
  // a late block is dropped instead of being played at the wrong time
  const late = new VstLink({ block: 256, delay: 256, send: () => {} })
  for (let k = 0; k < 8; k++) late.process([inp.subarray(0, 128)], o2, 128)
  late.receive(0, [new Float32Array(256).fill(1)])
  check('vst link: late block dropped', !late.done.has(0))
  // the binary frame round trip
  const buf = packBlock(7, 42, [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])], true)
  const u = unpackBlock(buf)
  check('vst frame round trip', !!u && u.instance === 7 && u.seq === 42 && u.block[1][2] === 6 && new DataView(buf).getUint16(14, true) === 1)
}

// ── own shortcuts: only free keys, in addition to the layout ──
{
  const own = { 'track.group': ['Ctrl+Alt+G'], 'transport.stop': ['Space'] }
  const m = buildMap('ableton', own)
  check('own key added', m.get('ctrl+alt+g') === 'track.group')
  check('own key cannot take a layout key', m.get('space') === 'transport.playStop')
  check('taken: layout key', comboTaken('Space', 'ableton', {}).reason === 'used')
  check('taken: own key', comboTaken('Ctrl+Alt+G', 'ableton', own).action === 'track.group')
  check('taken: reserved', comboTaken('Alt+F4', 'ableton', {}).reason === 'reserved')
  check('free key', comboTaken('Ctrl+Alt+K', 'ableton', {}).reason === '')
  // Windows reports Ctrl+Alt as AltGr: a letter stays a shortcut, a typed character (@) does not
  const altgr = (key: string): ReturnType<typeof eventToCombo> => eventToCombo({ key, code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: false, getModifierState: (m) => m === 'AltGraph' })
  check('Ctrl+Alt+K on Windows', altgr('k') === 'Ctrl+Alt+K', String(altgr('k')))
  check('AltGr+Q (@) is typing', altgr('@') === null)
  // Windows can send a key that is not the letter: the physical key decides
  check('Ctrl+Alt+K with an unidentified key', eventToCombo({ key: 'Unidentified', code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: false, getModifierState: (m) => m === 'AltGraph' }) === 'Ctrl+Alt+K')
  check('Ctrl+Alt+K without AltGr', eventToCombo({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: false }) === 'Ctrl+Alt+K')
}

// ── VST instruments: MIDI goes out with the block that holds its frame ──
{
  const sent: Array<[number, number[][]]> = []
  const link = new VstLink({ block: 256, delay: 512, send: (seq, _b, midi) => sent.push([seq, midi]) })
  link.addEvents([[300, 0x80, 60, 0], [10, 0x90, 60, 100], [600, 0x90, 64, 90]])
  const buf = [new Float32Array(128)], out = [new Float32Array(128), new Float32Array(128)]
  for (let k = 0; k < 6; k++) link.process(buf, out, 128)
  check('midi: note-on in block 0 at its offset', JSON.stringify(sent[0][1]) === JSON.stringify([[10, 0x90, 60, 100]]), JSON.stringify(sent[0]))
  check('midi: note-off in block 1', JSON.stringify(sent[1][1]) === JSON.stringify([[44, 0x80, 60, 0]]), JSON.stringify(sent[1]))
  check('midi: event 600 in block 2', sent[2][1][0][0] === 600 - 512)
  link.addEvents([[0, 0x90, 1, 1]])                  // late: goes with the next block, at its start
  link.process(buf, out, 128); link.process(buf, out, 128)
  check('midi: late event at the start of the next block', sent[3][1][0][0] === 0 && sent[3][1][0][2] === 1)
  const f = packBlock(3, 9, [new Float32Array([0.5, 0.25])], false, [[1, 0x90, 60, 100]])
  const v = new DataView(f)
  check('midi frame: count, offset, bytes, audio after the events', v.getUint32(20, true) === 1 && v.getUint32(24, true) === 1 && v.getUint8(28) === 0x90 && v.getUint8(29) === 60 && v.getUint8(30) === 100 && new Float32Array(f, 32, 2)[1] === 0.25)
}

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
