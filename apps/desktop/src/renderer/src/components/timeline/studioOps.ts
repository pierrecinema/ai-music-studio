// Studio commands that menus, buttons and keyboard shortcuts share (Ableton / Cubase functions).
import { nanoid } from 'nanoid'
import { useProjectStore } from '../../stores/project.store'
import { useAudioStore } from '../../stores/audio.store'
import { bufferOf, putBuffer, renderClips, seek, sourceSecPerBeat } from '../../audio/engine'
import { bpmAt } from '../../audio/timemap'
import { beatOfSrc, srcOfBeat } from '../../audio/warp'
import { encodeWav } from '../../audio/wav'
import { api } from '../../lib/api'
import type { AutoParam, Clip, Note, Project, Track } from '../../types'

// ── clip <-> file positions (sync and warp markers included) ───────────────────

export function spbSrcOf(clip: Clip, p: Project): number {
  return sourceSecPerBeat(clip.warpBpm, bpmAt(p, clip.startTime))
}

// the file second that plays at `local` beats into the clip
export function srcAt(clip: Clip, p: Project, local: number): number {
  const spb = spbSrcOf(clip, p)
  return srcOfBeat(clip.warpMarkers, beatOfSrc(clip.warpMarkers, clip.offset ?? 0, spb) + local, spb)
}

// how many beats of the file are left after `offset` (the longest the clip can be)
export function beatsLeft(clip: Clip, p: Project, offset = clip.offset ?? 0): number {
  const buf = clip.audioFile ? bufferOf(clip.audioFile) : undefined
  if (!buf) return Infinity
  const spb = spbSrcOf(clip, p)
  return beatOfSrc(clip.warpMarkers, buf.duration, spb) - beatOfSrc(clip.warpMarkers, offset, spb)
}

// ── selection ────────────────────────────────────────────────────────────────

export function selectedClips(): Array<{ track: Track; clip: Clip }> {
  const st = useProjectStore.getState()
  const ids = new Set(st.selectedClipIds.length ? st.selectedClipIds : st.selectedClipId ? [st.selectedClipId] : [])
  const out: Array<{ track: Track; clip: Clip }> = []
  for (const t of st.project.tracks) for (const c of t.clips) if (ids.has(c.id)) out.push({ track: t, clip: c })
  return out
}

export function selectAll(): void {
  const st = useProjectStore.getState()
  st.selectClips(st.project.tracks.flatMap((t) => t.clips.map((c) => c.id)))
}

export function deleteSelection(): boolean {
  const sel = selectedClips()
  if (!sel.length) return false
  useProjectStore.getState().removeClips(sel.map((x) => x.clip.id))
  return true
}

// ── loop and markers ─────────────────────────────────────────────────────────

export function toggleLoop(): void {
  const st = useProjectStore.getState()
  const l = st.project.loop
  if (!l) {
    const at = Math.floor(useAudioStore.getState().currentBeat / 4) * 4
    st.setLoop({ start: at, end: at + 16, enabled: true })
  } else st.setLoop({ enabled: !l.enabled })
}

// Ableton Ctrl+L / Cubase P: the loop (locators) around the selected clips
export function loopToSelection(): boolean {
  const sel = selectedClips()
  if (!sel.length) { toggleLoop(); return false }
  const start = Math.min(...sel.map((x) => x.clip.startTime))
  const end = Math.max(...sel.map((x) => x.clip.startTime + x.clip.duration))
  useProjectStore.getState().setLoop({ start, end, enabled: true })
  return true
}

export function addMarkerAtPlayhead(): void {
  useProjectStore.getState().addMarker(Math.round(useAudioStore.getState().currentBeat * 1000) / 1000)
}

export function addCycleMarkerFromLoop(): boolean {
  const l = useProjectStore.getState().project.loop
  if (!l) return false
  useProjectStore.getState().addMarker(l.start, l.end)
  return true
}

export function jumpMarker(direction: 1 | -1): void {
  const p = useProjectStore.getState().project
  const now = useAudioStore.getState().currentBeat
  const spots = [0, ...(p.markers ?? []).map((m) => m.beat), ...(p.loop ? [p.loop.start, p.loop.end] : [])].sort((a, b) => a - b)
  const target = direction > 0 ? spots.find((b) => b > now + 0.01) : [...spots].reverse().find((b) => b < now - 0.01)
  if (target !== undefined) seek(target)
}

export function togglePunch(which: 'punchIn' | 'punchOut'): void {
  const st = useProjectStore.getState()
  st.updateProject({ [which]: !st.project[which] })
  if (!st.project.loop) st.setLoop({ start: 0, end: 16, enabled: false })
}

// ── tracks ───────────────────────────────────────────────────────────────────

export function groupSelectedTracks(): void {
  const st = useProjectStore.getState()
  const fromClips = selectedClips().map((x) => x.track.id)
  const ids = [...new Set(fromClips.length ? fromClips : st.selectedTrackId ? [st.selectedTrackId] : [])]
  if (ids.length) st.groupTracks(ids)
}

export function toggleAutomationLane(trackId?: string, param: AutoParam = 'volume'): void {
  const st = useProjectStore.getState()
  const t = st.project.tracks.find((x) => x.id === (trackId ?? st.selectedTrackId))
  if (!t) return
  st.updateTrack(t.id, { showAutomation: t.showAutomation ? null : param })
}

// ── clips ────────────────────────────────────────────────────────────────────

// Ableton "Consolidate" (Ctrl+J), Cubase "Bounce selection": the selected clips of ONE track become one clip
export async function consolidate(): Promise<string | null> {
  const sel = selectedClips()
  if (sel.length < 1) return 'Select the clips to join first (Ctrl+click or drag a frame around them).'
  const trackId = sel[0].track.id
  if (sel.some((x) => x.track.id !== trackId)) return 'Consolidate works on the clips of one track at a time.'
  const clips = sel.map((x) => x.clip)
  const from = Math.min(...clips.map((c) => c.startTime))
  const to = Math.max(...clips.map((c) => c.startTime + c.duration))
  const st = useProjectStore.getState()
  if (clips.every((c) => !c.audioFile)) {
    const notes: Note[] = clips.flatMap((c) => (c.notes ?? []).map((n) => ({ ...n, id: nanoid(), startTime: n.startTime + c.startTime - from })))
    st.removeClips(clips.map((c) => c.id))
    st.addClip(trackId, { startTime: from, duration: to - from, notes, name: 'MIDI clip' })
    return null
  }
  if (clips.some((c) => !c.audioFile)) return 'Audio and MIDI clips cannot be joined into one clip.'
  const buf = await renderClips(st.project, clips, from, to)
  const path = await window.api.files.saveRecording(encodeWav(buf, 24))
  putBuffer(path, buf)
  const latest = useProjectStore.getState()
  latest.removeClips(clips.map((c) => c.id))
  latest.addClip(trackId, { startTime: from, duration: to - from, audioFile: path, name: `${clips[0].name ?? 'Audio'} (consolidated)` })
  const t = useProjectStore.getState().project.tracks.find((x) => x.id === trackId)
  const made = t?.clips[t.clips.length - 1]
  if (made) useProjectStore.getState().selectClip(made.id)
  return null
}

// Cubase "X": a crossfade between the selected clip and the clip before it on the same track
export function crossfade(lengthBeats = 0.5): string | null {
  const sel = selectedClips()
  if (sel.length !== 1 || !sel[0].clip.audioFile) return 'Select the audio clip that should fade in over the clip before it.'
  const { track, clip } = sel[0]
  const p = useProjectStore.getState().project
  const prev = track.clips
    .filter((c) => c.audioFile && c.id !== clip.id && c.startTime < clip.startTime)
    .sort((a, b) => b.startTime + b.duration - (a.startTime + a.duration))[0]
  if (!prev) return 'There is no audio clip before this one on the track.'
  const gap = clip.startTime - (prev.startTime + prev.duration)
  if (gap > 0.01) return 'The two clips do not touch: move them together first.'
  if (gap < -0.01) return null                                 // they overlap already: the crossfade is there
  // pull the start of the selected clip back into the clip before (if the file has sound there) ...
  const spb = spbSrcOf(clip, p)
  const room = (clip.offset ?? 0) / spb
  const st = useProjectStore.getState()
  if (room >= lengthBeats - 1e-6 && !clip.warpMarkers?.length) {
    st.updateClip(track.id, clip.id, { startTime: clip.startTime - lengthBeats, duration: clip.duration + lengthBeats, offset: (clip.offset ?? 0) - lengthBeats * spb })
    return null
  }
  // ... or stretch the end of the clip before into this one
  if (beatsLeft(prev, p) - prev.duration >= lengthBeats - 1e-6) {
    st.updateClip(track.id, prev.id, { duration: prev.duration + lengthBeats })
    return null
  }
  return 'Neither clip has spare audio at the cut for a crossfade. Trim one of them a little shorter first.'
}

// Cubase 15: stem separation right in the project. The clip's file is split (Demucs) and the stems are
// added as new tracks in a group, at the same place; the original track is muted.
export async function splitIntoStems(trackId: string, clipId: string): Promise<string> {
  const st = useProjectStore.getState()
  const track = st.project.tracks.find((t) => t.id === trackId)
  const clip = track?.clips.find((c) => c.id === clipId)
  if (!track || !clip?.audioFile) return 'Choose an audio clip.'
  const result = await api.stems.split({ filePath: clip.audioFile, model: 'htdemucs', stems: ['vocals', 'drums', 'bass', 'other'] })
  const names = Object.entries(result).filter(([, path]) => !!path) as Array<[string, string]>
  if (!names.length) return 'Demucs returned no stems.'
  const ids: string[] = []
  for (const [stem, path] of names) {
    useProjectStore.getState().addTrack('audio')
    const tracks = useProjectStore.getState().project.tracks
    const t = tracks[tracks.length - 1]
    ids.push(t.id)
    useProjectStore.getState().updateTrack(t.id, { name: `${clip.name ?? track.name} ${stem}` })
    useProjectStore.getState().addClip(t.id, { ...clip, audioFile: path, name: `${clip.name ?? 'Audio'} ${stem}` })
  }
  useProjectStore.getState().groupTracks(ids)
  const group = useProjectStore.getState().project.tracks.find((t) => t.id === useProjectStore.getState().selectedTrackId)
  if (group) useProjectStore.getState().updateTrack(group.id, { name: `${clip.name ?? track.name} stems` })
  useProjectStore.getState().updateTrack(trackId, { muted: true })
  return `Split into ${names.length} stems (${names.map(([n]) => n).join(', ')}). The original track is muted.`
}

// warp markers: put one at a file second, keeping the timing where it is
export function addWarpMarker(trackId: string, clip: Clip, src: number): void {
  const p = useProjectStore.getState().project
  const spb = spbSrcOf(clip, p)
  const beat = beatOfSrc(clip.warpMarkers, src, spb)
  const markers = [...(clip.warpMarkers ?? []).filter((m) => Math.abs(m.src - src) > 0.01), { src, beat }].sort((a, b) => a.src - b.src)
  useProjectStore.getState().updateClip(trackId, clip.id, { warpMarkers: markers })
}
