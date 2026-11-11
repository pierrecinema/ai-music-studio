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

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
