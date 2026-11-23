// Album mastering: the songs of an album (or EP) in their order, measured together and evened out so they sit
// together (loudness and, gently, lows and highs), the transitions heard with the pause between the songs, and all
// exported at once (numbered files, and the whole album as one file if wanted). Every song keeps its own chain,
// which can still be changed on the song's own page.
import React, { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { defaultChain, renderChain, TARGETS, type Chain } from '../../audio/master/chain'
import { analyze } from '../../audio/master/dsp'
import { applyEdits } from '../../audio/master/edit'
import { adjustChain, albumFileName, planLoudness, planTone, toneOf } from '../../audio/master/album'
import { encodeWavFloat } from '../../audio/wav'
import { useMasteringStore, type MasterFile } from '../../stores/mastering.store'
import { chansOf, decodeFile, editsByPath } from './masterFiles'
import { loadOutput } from './MasterOutput'
import { AlbumPlayer } from './AlbumPlayer'
import { tr, trf } from '../../i18n/tr'

const AUDIO = /\.(wav|mp3|flac|ogg|opus|m4a|aac|aif|aiff)$/i
interface Measure { before: number; after: number; peak: number; seconds: number }
const measured: Record<string, Measure> = {}            // kept while the app runs (also when the page is left)
const later = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`

/** the song as it is edited on its page (cuts, fades), at the processing rate */
async function songBuffer(path: string): Promise<AudioBuffer> {
  const original = await decodeFile(path)
  const ops = editsByPath.get(path)?.ops ?? []
  if (!ops.length) return original
  const ch = applyEdits(chansOf(original), original.sampleRate, ops)
  const buf = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, ch[0].length), sampleRate: original.sampleRate })
  buf.copyToChannel(ch[0] as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(ch[1] as Float32Array<ArrayBuffer>, 1)
  return buf
}

// the waveform of each song for the album player (max of |sample| in n parts), kept while the app runs
const peakCache = new Map<string, Float32Array>()
function peaksOf(b: AudioBuffer, n: number): Float32Array {
  const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l
  const out = new Float32Array(n)
  const per = b.length / n
  let max = 1e-6
  for (let i = 0; i < n; i++) {
    let m = 0
    const a = Math.floor(i * per), z = Math.min(b.length, Math.floor((i + 1) * per))
    for (let k = a; k < z; k += 4) { const v = Math.max(Math.abs(l[k]), Math.abs(r[k])); if (v > m) m = v }
    out[i] = m; if (m > max) max = m
  }
  for (let i = 0; i < n; i++) out[i] /= max
  return out
}

// the last few decoded songs, so the player does not decode a song again for every piece
const songCache = new Map<string, AudioBuffer>()
async function cachedSong(path: string): Promise<AudioBuffer> {
  const hit = songCache.get(path)
  if (hit) { songCache.delete(path); songCache.set(path, hit); return hit }
  const b = await songBuffer(path)
  songCache.set(path, b)
  while (songCache.size > 3) songCache.delete(songCache.keys().next().value as string)
  return b
}

export function AlbumView({ target, onTarget, onOpenSong }: { target: string; onTarget: (id: string) => void; onOpenSong: (f: MasterFile) => void }): React.ReactElement {
  const album = useMasteringStore((s) => s.album)
  const setAlbum = useMasteringStore((s) => s.setAlbum)
  const chains = useMasteringStore((s) => s.chains)
  const baseChain = useMasteringStore((s) => s.chain)
  const setChainFor = useMasteringStore((s) => s.setChainFor)
  const files = useMasteringStore((s) => s.files)
  const [measures, setMeasuresState] = useState<Record<string, Measure>>(() => ({ ...measured }))
  const setMeasures = (f: (x: Record<string, Measure>) => Record<string, Measure>): void => setMeasuresState((x) => { const n = f(x); Object.assign(measured, n); return n })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<string[] | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const player = useRef<{ ctx: AudioContext; srcs: AudioBufferSourceNode[] } | null>(null)
  const stopRef = useRef(false)
  const tgt = TARGETS.find((t) => t.id === target) ?? TARGETS[0]
  const songs = album.songs
  const chainOf = (path: string): Chain => chains[path] ?? baseChain ?? defaultChain()

  const add = (list: MasterFile[]): void => {
    const have = new Set(songs.map((s) => s.path))
    setAlbum({ songs: [...songs, ...list.filter((f) => !have.has(f.path))] })
  }
  const addFiles = async (): Promise<void> => {
    const paths: string[] = await window.api.dialog.openAudio()
    add(paths.filter((p) => AUDIO.test(p)).map((p) => ({ path: p, name: (p.split(/[\\/]/).pop() ?? p).replace(/\.[a-z0-9]+$/i, '') })))
  }
  const move = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= songs.length) return
    const next = [...songs]; [next[i], next[j]] = [next[j], next[i]]
    setAlbum({ songs: next })
  }
  const remove = (i: number): void => setAlbum({ songs: songs.filter((_, k) => k !== i) })

  // measure every song: loudness without and with its chain (and its tone with the chain, for evening out)
  const measureAll = async (withChains?: Record<string, Chain>): Promise<{ m: Record<string, Measure>; tones: ReturnType<typeof toneOf>[] }> => {
    const m: Record<string, Measure> = {}
    const tones: ReturnType<typeof toneOf>[] = []
    for (let i = 0; i < songs.length; i++) {
      if (stopRef.current) throw new Error(tr('Stopped.'))
      const s = songs[i]
      setBusy(trf('Measuring {n} of {total}: {name}', { n: i + 1, total: songs.length, name: s.name })); await later()
      const buf = await songBuffer(s.path)
      const before = analyze(chansOf(buf), buf.sampleRate)
      const out = await renderChain(buf, withChains?.[s.path] ?? chainOf(s.path))
      const after = analyze(chansOf(out), out.sampleRate)
      tones.push(toneOf(chansOf(out), out.sampleRate))
      m[s.path] = { before: before.integrated, after: after.integrated, peak: after.truePeak, seconds: buf.duration }
      setMeasures((x) => ({ ...x, [s.path]: m[s.path] }))
    }
    return { m, tones }
  }

  const run = async (what: () => Promise<void>): Promise<void> => {
    setError(null); setResults(null); stopRef.current = false
    try { await what() } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  // even the album out: tone first (gently, half way to the album's average), then loudness in two rounds (the
  // limiter makes "Louder" not exactly 1:1), each song's own chain is changed
  const evenOut = (): Promise<void> => run(async () => {
    let cs: Record<string, Chain> = Object.fromEntries(songs.map((s) => [s.path, chainOf(s.path)]))
    let { m, tones } = await measureAll(cs)
    if (album.tone) {
      const t = planTone(tones)
      cs = Object.fromEntries(songs.map((s, i) => [s.path, adjustChain(cs[s.path], 0, t[i].low, t[i].high)]))
    }
    for (let round = 0; round < 2; round++) {
      const before = songs.map((s) => m[s.path].before)
      const after = songs.map((s) => m[s.path].after)
      const d = planLoudness(before, after, tgt.lufs, album.keep)
      cs = Object.fromEntries(songs.map((s, i) => [s.path, adjustChain(cs[s.path], d[i])]))
      setBusy(trf('Evening out the album (round {n} of 2)…', { n: round + 1 })); await later()
      ;({ m } = await measureAll(cs))
    }
    for (const s of songs) setChainFor(s.path, cs[s.path])
  })

  /** a piece of a song through its chain: only these seconds are rendered (with a few seconds before, so the
   *  compressor and limiter have settled), which is fast also for long songs */
  const renderPart = async (path: string, from: number, seconds: number): Promise<AudioBuffer> => {
    const buf = await cachedSong(path)
    const sr = buf.sampleRate
    const pre = Math.min(Math.round(3 * sr), Math.round(Math.max(0, from) * sr))
    const a = Math.max(0, Math.round(from * sr) - pre), b = Math.min(buf.length, Math.round((from + seconds) * sr))
    const part = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, b - a), sampleRate: sr })
    for (let c = 0; c < 2; c++) part.copyToChannel(buf.getChannelData(c).subarray(a, b), c)
    const out = await renderChain(part, chainOf(path))
    const keep = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, out.length - pre), sampleRate: sr })
    for (let c = 0; c < 2; c++) keep.copyToChannel(out.getChannelData(c).subarray(pre), c)
    return keep
  }

  // ── the album player: the whole album on one timeline (songs and pauses), played through each song's chain in
  // short pieces rendered just ahead, so it starts at once anywhere: click in the bar, jump to a song or a transition
  const [durs, setDurs] = useState<Record<string, number>>({})
  const lens = songs.map((s) => durs[s.path] ?? measures[s.path]?.seconds ?? 0)
  const starts: number[] = []
  lens.reduce((t, l, i) => { starts[i] = t; return t + l + (i < songs.length - 1 ? album.gapSec : 0) }, 0)
  const totalLen = songs.length ? starts[songs.length - 1] + lens[songs.length - 1] : 0
  const [pos, setPos] = useState(0)
  const now = player.current ? songs.findIndex((_, i) => pos >= starts[i] && pos < starts[i] + lens[i]) : -1
  const [peaks, setPeaks] = useState<Record<string, Float32Array>>(() => Object.fromEntries(peakCache))
  const [loadingWave, setLoadingWave] = useState(false)
  // the songs' lengths and waveforms (each song decoded once; the waveforms are kept while the app runs)
  const knowLengths = async (): Promise<number[]> => {
    const out: Record<string, number> = { ...durs }
    const need = songs.filter((s) => !out[s.path] || !peakCache.has(s.path))
    if (need.length) setLoadingWave(true)
    try {
      for (const s of need) {
        const b = await cachedSong(s.path)
        out[s.path] = b.duration
        if (!peakCache.has(s.path)) peakCache.set(s.path, peaksOf(b, 1200))
      }
    } finally { setLoadingWave(false) }
    setDurs(out); setPeaks(Object.fromEntries(peakCache))
    return songs.map((s) => out[s.path])
  }
  const stop = (): void => {
    for (const x of player.current?.srcs ?? []) { try { x.stop() } catch { /* over */ } }
    player.current?.ctx.close().catch(() => undefined); player.current = null; setPlaying(null)
  }
  const playFrom = async (t: number): Promise<void> => {
    stop(); setError(null)
    const L = await knowLengths()
    const S: number[] = []
    L.reduce((acc, l, i) => { S[i] = acc; return acc + l + (i < L.length - 1 ? album.gapSec : 0) }, 0)
    const total = S[L.length - 1] + L[L.length - 1]
    t = Math.max(0, Math.min(total - 0.5, t))
    let si = S.findIndex((st, i) => t < st + L[i] + (i < L.length - 1 ? album.gapSec : 0))
    if (si < 0) si = L.length - 1
    let so = Math.max(0, t - S[si])
    const ctx = new AudioContext({ sampleRate: 48000 })
    const me = { ctx, srcs: [] as AudioBufferSourceNode[] }
    player.current = me; setPlaying(-1); setPos(t)
    const begin = ctx.currentTime + 0.25
    let at = begin
    if (so >= L[si]) { at += S[si] + L[si] + album.gapSec - t; si++; so = 0 }      // started in a pause
    const tick = window.setInterval(() => {
      if (player.current !== me) { window.clearInterval(tick); return }
      const p = t + Math.max(0, ctx.currentTime - begin)
      setPos(p)
      if (p >= total) { window.clearInterval(tick); stop() }
    }, 150)
    try {
      const CHUNK = 12
      while (player.current === me && si < L.length) {
        while (player.current === me && at - ctx.currentTime > 20) await new Promise((r) => setTimeout(r, 300))
        if (player.current !== me) break
        const buf = await renderPart(songs[si].path, so, CHUNK)
        if (player.current !== me) break
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination)
        const when = Math.max(at, ctx.currentTime + 0.02)
        src.start(when); me.srcs.push(src)
        src.onended = () => { src.buffer = null; me.srcs.splice(me.srcs.indexOf(src), 1) }
        at = when + buf.duration
        so += CHUNK
        if (so >= L[si] - 1e-3) { at += album.gapSec; si++; so = 0 }
      }
    } catch (e) { setError((e as Error).message); stop() }
  }
  useEffect(() => { if (songs.length) void knowLengths() }, [songs.map((x) => x.path).join('|')])  // eslint-disable-line react-hooks/exhaustive-deps
  const togglePlay = (): void => { if (player.current) stop(); else void playFrom(pos >= totalLen - 0.5 ? 0 : pos) }
  const toTransition = (i: number): void => { void playFrom(starts[i + 1] - album.gapSec - 8) }

  // export: every song through its chain as "01 - Title", and the whole album as one file if wanted
  const [whole, setWhole] = useState(true)
  const exportAll = (): Promise<void> => run(async () => {
    const folder = await window.api.dialog.pickFolder(tr('Folder for the album'))
    if (!folder) return
    const out = loadOutput(album.title || 'Album')
    const outputs = out.formats.map((f) => ({ ...f, sampleRate: out.sampleRate }))
    const temps: string[] = []
    const done: string[] = []
    for (let i = 0; i < songs.length; i++) {
      if (stopRef.current) throw new Error(tr('Stopped.'))
      const s = songs[i]
      setBusy(trf('Rendering {n} of {total}: {name}', { n: i + 1, total: songs.length, name: s.name })); await later()
      const rendered = await renderChain(await songBuffer(s.path), chainOf(s.path))
      const tmp = await window.api.files.saveTemp(encodeWavFloat(rendered), `album-${Date.now()}-${i}.wav`)
      temps.push(tmp)
      const meta = { ...out.meta, title: s.name, album: album.title || out.meta.album, artist: album.artist || out.meta.artist, track: String(i + 1) }
      const r = await api.mastering.export({ source: tmp, folder, name: albumFileName(i, s.name), dither: out.dither, cover: out.cover, meta, outputs })
      done.push(...r.results.map((x) => x.path ?? `${x.format}: ${x.error}`))
    }
    if (whole && songs.length > 1) {
      setBusy(tr('Writing the whole album as one file…')); await later()
      const r = await api.mastering.albumJoin({ sources: temps, gapSec: album.gapSec, folder, name: `${album.title || 'Album'} (${tr('whole album')})`,
        outputs, dither: out.dither, meta: { ...out.meta, title: album.title || 'Album', album: album.title || out.meta.album, artist: album.artist || out.meta.artist } })
      done.push(...r.results.map((x) => x.path ?? `${x.format}: ${x.error}`))
    }
    setResults(done)
  })

  const valid = Object.values(measures).filter((x) => songs.some((s) => measures[s.path] === x))
  const lo = Math.min(tgt.lufs - 6, ...valid.map((x) => x.after), ...valid.map((x) => x.before))
  const hi = Math.max(tgt.lufs + 2, ...valid.map((x) => x.after))
  const bar = (v: number): string => `${Math.max(2, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`
  const total = songs.reduce((a, s) => a + (measures[s.path]?.seconds ?? 0), 0) + Math.max(0, songs.length - 1) * album.gapSec
  const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }
  const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>{tr('Album')}</b>
          <input value={album.title} onChange={(e) => setAlbum({ title: e.target.value })} placeholder={tr('Album title')} style={{ width: 200 }} />
          <input value={album.artist} onChange={(e) => setAlbum({ artist: e.target.value })} placeholder={tr('Artist')} style={{ width: 160 }} />
          <select value={target} onChange={(e) => onTarget(e.target.value)} title={tr('The loudness the album is evened out to')} style={{ fontSize: 11 }}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{tr(t.label)}</option>)}
          </select>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void addFiles()}>{tr('+ Add songs…')}</button>
          {files.length > 0 && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => add(files)}>{tr('+ All open songs')}</button>}
        </div>
        <div style={hint}>{tr('Put the songs of your album or EP here in their order. "Even out the album" makes them equally loud and gently alike in sound; each song keeps its own chain, which you can still change on its page (click the name).')}</div>
      </div>

      {songs.length > 0 && (
        <AlbumPlayer names={songs.map((x) => x.name)} lens={lens} starts={starts} total={totalLen} gap={album.gapSec} pos={pos}
          playing={playing === -1} now={now} peaks={songs.map((x) => peaks[x.path] ?? null)} loading={loadingWave}
          onSeek={(t) => void playFrom(t)} onTransition={toTransition} onToggle={togglePlay} onLoad={() => void knowLengths()}
          onPrev={() => { const cur = now >= 0 ? now : Math.max(0, songs.findIndex((_, k) => pos < starts[k] + lens[k])); const i = pos - starts[cur] > 3 ? cur : Math.max(0, cur - 1); void playFrom(starts[i] ?? 0) }}
          onNext={() => { const cur = now >= 0 ? now : songs.findIndex((_, k) => pos < starts[k]) - 1; void playFrom(starts[Math.min(songs.length - 1, cur + 1)] ?? 0) }} />
      )}

      {songs.length === 0 ? (
        <div style={{ border: '2px dashed var(--border-mid)', borderRadius: 12, padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {tr('No songs yet: press "+ Add songs…" or "+ All open songs".')}
        </div>
      ) : (
        <div style={card}>
          {songs.map((s, i) => {
            const m = measures[s.path]
            return (
              <React.Fragment key={s.path}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(140px, 1.4fr) 2fr 150px 86px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: now === i ? 'var(--accent-light)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }} title={tr('Play the album from this song')} onClick={() => void playFrom(starts[i])}>{now === i ? '♪' : String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate" style={{ cursor: 'pointer', textDecoration: 'underline dotted' }} title={tr('Open this song on its own (its chain, editing, meters)')} onClick={() => onOpenSong(s)}>{s.name}</span>
                  <div style={{ position: 'relative', height: 16, background: 'var(--bg-tertiary)', borderRadius: 4 }} title={m ? trf('Before {b} LUFS · after {a} LUFS', { b: m.before.toFixed(1), a: m.after.toFixed(1) }) : tr('Not measured yet')}>
                    {m && <div style={{ position: 'absolute', left: 0, top: 3, height: 4, width: bar(m.before), background: '#6b7280', borderRadius: 2 }} />}
                    {m && <div style={{ position: 'absolute', left: 0, bottom: 3, height: 6, width: bar(m.after), background: Math.abs(m.after - tgt.lufs) <= 1 + album.keep * 4 ? 'var(--green)' : 'var(--yellow)', borderRadius: 2 }} />}
                    <div style={{ position: 'absolute', left: bar(tgt.lufs), top: 0, bottom: 0, width: 2, background: 'var(--accent-light)' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m ? `${m.after.toFixed(1)} LUFS · ${m.peak.toFixed(1)} dBTP · ${clock(m.seconds)}` : '–'}</span>
                  <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title={tr('Earlier')} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title={tr('Later')} disabled={i === songs.length - 1} onClick={() => move(i, 1)}>▼</button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} title={tr('Take it off the album')} onClick={() => remove(i)}>×</button>
                  </span>
                </div>
                {i < songs.length - 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 36, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>↓ {tr('Pause')}</span>
                    <select value={String(album.gapSec)} onChange={(e) => setAlbum({ gapSec: Number(e.target.value) })} title={tr('Silence between the songs (the same for the whole album)')} style={{ fontSize: 10.5, padding: '0 2px' }}>
                      {[0, 0.5, 1, 1.5, 2, 3, 4, 5, 8].map((v) => <option key={v} value={String(v)}>{v} s</option>)}
                    </select>
                    <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '1px 8px' }} title={tr('Play from 8 seconds before the end of this song, through the pause into the next')} onClick={() => toTransition(i)}>
                      ⇄ {tr('Hear the transition')}
                    </button>
                  </div>
                )}
              </React.Fragment>
            )
          })}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span>{trf('{n} songs', { n: songs.length })}{total > 0 ? ` · ${clock(total)}` : ''} · {trf('target {t}', { t: tgt.label })}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{tr('Pause between songs')}
              <input type="number" min={0} max={10} step={0.5} value={album.gapSec} onChange={(e) => setAlbum({ gapSec: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} style={{ width: 56 }} /> s
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={tr('A quiet song (a ballad) stays a little quieter than a loud one, as on most albums. Off: all exactly equally loud.')}>
              <input type="checkbox" checked={album.keep > 0} onChange={(e) => setAlbum({ keep: e.target.checked ? 0.3 : 0 })} />{tr('Quiet songs may stay a little quieter')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={tr('Lows and highs are brought half way to the album average (at most 3 dB), so no song sticks out as much duller or brighter.')}>
              <input type="checkbox" checked={album.tone} onChange={(e) => setAlbum({ tone: e.target.checked })} />{tr('Even out lows and highs too')}
            </label>
          </div>
        </div>
      )}

      {songs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => void run(async () => { await measureAll() })}>{tr('Measure')}</button>
          <button className="btn btn-primary" disabled={!!busy || songs.length < 2} onClick={() => void evenOut()}>{tr('Even out the album')}</button>
          <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />{tr('Also the whole album as one file')}
          </label>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => void exportAll()}>{tr('Export the album…')}</button>
          {busy && <><span style={{ fontSize: 12, color: 'var(--accent-light)' }}>{busy}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { stopRef.current = true; stop() }}>{tr('Stop')}</button></>}
        </div>
      )}
      {songs.length > 0 && <div style={hint}>{tr('The formats, sample rate and cover of the export are those of the song export (Output on a song\'s page).')}</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {results && (
        <div style={{ ...card, fontSize: 11.5 }}>
          <b>{tr('Exported:')}</b>
          {results.map((r) => <span key={r} style={{ color: r.includes(':') && !/^[A-Za-z]:[\\/]/.test(r) ? 'var(--red)' : 'var(--text-secondary)' }}>{r}</span>)}
        </div>
      )}
    </div>
  )
}
