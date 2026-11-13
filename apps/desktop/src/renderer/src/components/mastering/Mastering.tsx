import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { renderChain, TARGETS, type Chain } from '../../audio/master/chain'
import { analyze, type Analysis } from '../../audio/master/dsp'
import { masterPlayer } from '../../audio/master/player'
import { encodeWavFloat } from '../../audio/wav'
import { isPlaying, pause as pauseStudio } from '../../audio/engine'
import { useMasteringStore } from '../../stores/mastering.store'
import { MasterWave } from './MasterWave'
import { MasterMeters } from './MasterMeters'
import { MasterRack } from './MasterRack'
import { MasterOutput, loadOutput, type OutputSettings } from './MasterOutput'

// Mastering workspace: drop or open a song, hear it through the chain (A/B with the original at the same loudness),
// see every measurement before and after, and export it in any format. Processing runs in the app's audio engine
// (AudioWorklets), live while playing and offline for the export: the file sounds exactly like the preview.

const SR = 48000                                     // the processing rate; the export converts to the chosen rate
const AUDIO = /\.(wav|mp3|flac|ogg|opus|m4a|aac|aif|aiff)$/i

async function decodeFile(path: string): Promise<AudioBuffer> {
  const bytes: Uint8Array = await window.api.fs.readFile(path)
  const ctx = new OfflineAudioContext(2, 1, SR)
  const buf = await ctx.decodeAudioData(new Uint8Array(bytes).buffer)
  if (buf.numberOfChannels >= 2) return buf
  const st = new AudioBuffer({ numberOfChannels: 2, length: buf.length, sampleRate: buf.sampleRate })   // mono → both sides
  st.copyToChannel(buf.getChannelData(0), 0); st.copyToChannel(buf.getChannelData(0), 1)
  return st
}

const chansOf = (b: AudioBuffer): Float32Array[] => [b.getChannelData(0), b.getChannelData(1)]
const later = (): Promise<void> => new Promise((r) => setTimeout(r, 30))   // let the page paint "measuring…" first
const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

export function Mastering(): React.ReactElement {
  const { files, current, recent, chain, open, close, select, setChain } = useMasteringStore()
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [after, setAfter] = useState<AudioBuffer | null>(null)
  const [aBefore, setABefore] = useState<Analysis | null>(null)
  const [aAfter, setAAfter] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [show, setShow] = useState<'follow' | 'both' | 'before' | 'after'>('follow')
  const [target, setTarget] = useState<string>(() => localStorage.getItem('ams-master-target') ?? 'streaming')
  const [reaching, setReaching] = useState(false)
  const [output, setOutput] = useState<OutputSettings | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ format: string; path?: string; error?: string; warning?: string }> | null>(null)
  const [refOpen, setRefOpen] = useState(false)
  const [, tick] = useState(0)
  const version = useRef(0)
  const afterFor = useRef<{ chain: Chain; buf: AudioBuffer } | null>(null)
  const name = files.find((f) => f.path === current)?.name ?? ''
  const tgt = TARGETS.find((t) => t.id === target) ?? TARGETS[0]

  useEffect(() => masterPlayer.on(() => tick((n) => n + 1)), [])
  useEffect(() => () => masterPlayer.pause(), [])               // leaving the page stops the song

  // load the shown file
  useEffect(() => {
    let gone = false
    setBuffer(null); setAfter(null); setABefore(null); setAAfter(null); setError(null); afterFor.current = null
    void masterPlayer.load(null)
    if (!current) return
    setLoading(true)
    ;(async () => {
      try {
        const buf = await decodeFile(current)
        if (gone) return
        await masterPlayer.load(buf)
        await masterPlayer.setChain(useMasteringStore.getState().chain)
        setBuffer(buf)
        setLoading(false)
        setMeasuring(true)
        await later()
        const a = analyze(chansOf(buf), buf.sampleRate)
        if (!gone) setABefore(a)
      } catch (e) {
        if (!gone) { setError(`Could not open the file: ${(e as Error).message}`); setLoading(false) }
      }
    })()
    return () => { gone = true }
  }, [current])

  // the chain: live at once, the measurement "after" a moment later (rendered offline with the same code)
  useEffect(() => { void masterPlayer.setChain(chain) }, [chain])
  const measureAfter = useCallback(async (c: Chain, buf: AudioBuffer, before: Analysis): Promise<Analysis | null> => {
    const v = ++version.current
    setMeasuring(true)
    try {
      const out = await renderChain(buf, c)
      if (v !== version.current) return null
      await later()
      const a = analyze(chansOf(out), out.sampleRate)
      if (v !== version.current) return null
      afterFor.current = { chain: c, buf: out }
      setAfter(out); setAAfter(a)
      // A/B: "before" is played at the loudness of "after", so the comparison is about sound, not level
      if (Number.isFinite(a.integrated) && Number.isFinite(before.integrated)) masterPlayer.setMatch(a.integrated - before.integrated)
      setMeasuring(false)
      return a
    } catch (e) {
      setError(`Processing failed: ${(e as Error).message}`)
      setMeasuring(false)
      return null
    }
  }, [])
  useEffect(() => {
    if (!buffer || !aBefore) return
    const t = setTimeout(() => void measureAfter(chain, buffer, aBefore), 600)
    return () => clearTimeout(t)
  }, [chain, buffer, aBefore, measureAfter])

  const reachTarget = async (): Promise<void> => {
    if (!buffer || !aBefore) return
    setReaching(true)
    let c: Chain = { ...chain, limiter: { ...chain.limiter, on: true, ceilingDb: tgt.ceiling } }
    for (let i = 0; i < 4; i++) {
      const a = await measureAfter(c, buffer, aBefore)
      if (!a || !Number.isFinite(a.integrated)) break
      const diff = tgt.lufs - a.integrated
      if (Math.abs(diff) < 0.2) break
      c = { ...c, louderDb: Math.max(-12, Math.min(24, Math.round((c.louderDb + diff * (diff > 0 ? 1.1 : 1)) * 10) / 10)) }
    }
    setChain(c)
    setReaching(false)
  }

  const play = async (): Promise<void> => {
    if (isPlaying()) pauseStudio()                              // only one song at a time
    if (masterPlayer.playing) masterPlayer.pause(); else await masterPlayer.play()
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault(); setDropping(false)
    const paths = [...e.dataTransfer.files].filter((f) => AUDIO.test(f.name)).map((f) => (f as File & { path?: string }).path).filter((p): p is string => !!p)
    if (!paths.length) { setError('Drop audio files (WAV, MP3, FLAC, OGG, M4A, AIFF).'); return }
    for (const p of paths) open({ path: p, name: '' })
  }

  const openFiles = async (): Promise<void> => {
    const paths = await window.api.dialog.openAudio()
    for (const p of paths.filter((x) => AUDIO.test(x))) open({ path: p, name: '' })
  }

  const doExport = async (s: OutputSettings): Promise<void> => {
    if (!buffer) return
    setResults(null)
    try {
      setExporting('Rendering the master…')
      const out = afterFor.current && afterFor.current.chain === chain ? afterFor.current.buf : await renderChain(buffer, chain)
      setExporting('Writing the files…')
      const tmp = await window.api.files.saveTemp(encodeWavFloat(out), `master-${Date.now()}.wav`)
      const r = await api.mastering.export({
        source: tmp, folder: s.folder, name: s.name.trim(), dither: s.dither, cover: s.cover, meta: s.meta,
        outputs: s.formats.map((f) => ({ ...f, sampleRate: s.sampleRate })),
      })
      setResults(r.results)
    } catch (e) {
      setResults([{ format: 'error', error: (e as Error).message }])
    } finally {
      setExporting(null)
    }
  }

  const pos = masterPlayer.position()
  const active: 'before' | 'after' = masterPlayer.bypass ? 'before' : 'after'   // what is heard: the page shows that
  const shown = show === 'follow' ? active : show
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false) }}
      onDrop={onDrop}>
      {dropping && (
        <div style={{ position: 'absolute', inset: 8, border: '2px dashed var(--accent)', borderRadius: 12, background: 'rgba(124,58,237,0.12)', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, pointerEvents: 'none' }}>
          Release to open in Mastering
        </div>
      )}

      {/* files */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, marginRight: 6 }}>Mastering</span>
        {files.map((f) => (
          <span key={f.path} title={f.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 4px 3px 10px', borderRadius: 6, cursor: 'pointer',
            background: f.path === current ? 'var(--accent-dim)' : 'var(--bg-tertiary)', border: `1px solid ${f.path === current ? 'var(--accent)' : 'var(--border-subtle)'}` }}
            onClick={() => select(f.path)}>
            <span className="truncate" style={{ maxWidth: 180 }}>{f.name}</span>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '0 5px' }} title="Close" onClick={(e) => { e.stopPropagation(); close(f.path) }}>×</button>
          </span>
        ))}
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={openFiles}>Open…</button>
        {recent.length > 0 && (
          <select value="" onChange={(e) => { const r = recent.find((x) => x.path === e.target.value); if (r) open(r) }} style={{ fontSize: 11 }}>
            <option value="">Recent…</option>
            {recent.map((r) => <option key={r.path} value={r.path}>{r.name}</option>)}
          </select>
        )}
      </div>

      {!current && (
        <div style={{ border: '2px dashed var(--border-mid)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
          Drag a song here from the Explorer, or press <b>Open…</b>.<br />
          From the <b>Library</b>, <b>Create music</b> and the <b>Studio</b> (File → Send song to Mastering) a song comes here with one click.
        </div>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Opening {name}…</div>}

      {buffer && (
        <>
          {/* transport */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ minWidth: 70 }} onClick={play}>{masterPlayer.playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn btn-ghost" onClick={() => { masterPlayer.pause(); masterPlayer.seek(0) }} title="Back to the start">⏮</button>
            <span style={{ fontFamily: 'monospace', fontSize: 13, minWidth: 120 }}>{clock(pos)} / {clock(buffer.duration)}</span>
            <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-mid)' }} title="A/B: hear the original (at the same loudness) or the master">
              <button className="btn" style={{ borderRadius: 0, background: masterPlayer.bypass ? 'var(--bg-elevated)' : 'var(--accent)', color: '#fff' }} onClick={() => masterPlayer.setBypass(false)}>After</button>
              <button className="btn" style={{ borderRadius: 0, background: masterPlayer.bypass ? 'var(--accent)' : 'var(--bg-elevated)', color: '#fff' }} onClick={() => masterPlayer.setBypass(true)}>Before</button>
            </div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', gap: 4, alignItems: 'center' }}
              title={'On: the louder of the two is turned down while listening, so you hear only what the chain does to the sound (the meters and the export are not changed). Off: both at their real level, so you also hear how much louder the master is.'}>
              <input type="checkbox" checked={masterPlayer.matchOn} onChange={(e) => masterPlayer.setMatchOn(e.target.checked)} />
              Same loudness{masterPlayer.matchOn && aAfter && Number.isFinite(masterPlayer.matchDb) && Math.abs(masterPlayer.matchDb) >= 0.1
                ? ` (${masterPlayer.matchDb > 0 ? '"After"' : '"Before"'} played ${Math.abs(masterPlayer.matchDb).toFixed(1)} dB quieter)` : ''}
            </label>
            <button className={`btn ${masterPlayer.loopOn ? 'btn-primary' : 'btn-ghost'}`} disabled={!masterPlayer.loop} title="Loop the marked region (drag in the waveform to mark one)"
              onClick={() => masterPlayer.setLoop(masterPlayer.loop, !masterPlayer.loopOn)}>⟲ Loop</button>
            {masterPlayer.loop && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => masterPlayer.setLoop(null, false)}>Clear region</button>}
            <span style={{ flex: 1 }} />
            <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} style={{ fontSize: 11 }} title="Which waveform to show">
              <option value="follow">Waveform: follows Before / After</option><option value="both">Waveform: before + after</option><option value="after">Waveform: after</option><option value="before">Waveform: before</option>
            </select>
            <button className="btn btn-primary" onClick={() => { setResults(null); setOutput(loadOutput(name)) }}>Export…</button>
          </div>

          <MasterWave before={buffer} after={after} clips={shown === 'before' ? aBefore?.clips ?? [] : aAfter?.clips ?? []} show={shown} />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(320px, 420px)', minWidth: 0, gap: 14, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MasterRack chain={chain} onChange={setChain} target={target}
                onTarget={(t) => { setTarget(t); try { localStorage.setItem('ams-master-target', t) } catch { /* */ } }}
                onReachTarget={() => void reachTarget()} reaching={reaching} />
              <ReferenceMatch open={refOpen} setOpen={setRefOpen} target={current!} onDone={(p) => open({ path: p, name: `${name} (reference match)` })} />
            </div>
            <MasterMeters before={aBefore} after={aAfter} target={tgt.lufs} busy={measuring} active={active} />
          </div>
        </>
      )}

      {output && (
        <MasterOutput initial={output} busy={exporting} results={results} onClose={() => setOutput(null)} onExport={(s) => void doExport(s)} />
      )}
    </div>
  )
}

function ReferenceMatch({ open, setOpen, target, onDone }: { open: boolean; setOpen: (v: boolean) => void; target: string; onDone: (path: string) => void }): React.ReactElement {
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { onDone((await api.mastering.master({ targetPath: target, referencePath: reference, bitDepth: 24 })).audioFile) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Reference match (sound like another song)</div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>Matches loudness, tone balance and stereo width to a song you like (Matchering). The result opens as a new file here; you can then work on it with the chain.</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={async () => { const p = await window.api.dialog.openAudio(); if (p[0]) setReference(p[0]) }}>Reference song…</button>
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{reference || 'none chosen'}</span>
          </div>
          <div><button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!reference || busy} onClick={run}>{busy ? 'Matching…' : 'Match to the reference'}</button></div>
          {error && <span style={{ color: 'var(--red)' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}
