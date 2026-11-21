// Test set for audio -> MIDI: songs of the song generator rendered with the sound packs, every part alone (a "stem")
// and the mix, plus the true notes (seconds) as JSON
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path')
;(async () => {
  const OUT = process.argv[2]
  const b = await chromium.launch(); const p = await b.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message))
  const root = process.env.PACKS || '/tmp/sp/packs'   // the sound packs as served to the preview (index.json + pack folders)
  await p.route('**/packs/**', (r) => { const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/packs\//, ''); const f = path.join(root, rel); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }) })
  await p.goto('http://localhost:5199/'); await p.waitForTimeout(3000)
  await p.exposeFunction('save', (name, b64) => fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64')))
  await p.evaluate(async (genres) => {
    const sb = await import('/src/audio/soundbank.ts'); await sb.loadSoundPack()
    const { useProjectStore } = await import('/src/stores/project.store.ts')
    const { generateSong, GENRES } = await import('/src/lib/songgen.ts')
    const eng = await import('/src/audio/engine.ts')
    const b64 = (u) => { let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin) }
    for (const [gid, key] of genres) {
      const g = GENRES.find(x => x.id === gid)
      const song = generateSong({ genre: gid, key, mode: g.mode, bpm: g.bpm, seed: 3 })
      const FROM = 32, LEN = 64      // 16 bars from bar 9 (verse + chorus)
      const parts = song.parts.map((pt) => ({ ...pt, notes: pt.notes.filter(n => n.startTime >= FROM && n.startTime < FROM + LEN).map(n => ({ ...n, startTime: n.startTime - FROM })) }))
      const truth = { genre: gid, bpm: g.bpm, key, mode: g.mode, chords: song.chords.filter(c => c.beat >= FROM && c.beat < FROM + LEN).map(c => ({ ...c, beat: c.beat - FROM })), parts: {} }
      const setup = (only) => {
        const st = useProjectStore.getState(); st.newProject(); st.setBpm(g.bpm)
        for (const pt of parts) {
          if (only && pt.id !== only) continue
          useProjectStore.getState().addTrack('midi')
          const tr = useProjectStore.getState().project.tracks; const id = tr[tr.length - 1].id
          useProjectStore.getState().updateTrack(id, { name: pt.id, sound: pt.sound, program: pt.program, volume: pt.volume, reverb: pt.reverb })
          useProjectStore.getState().addClip(id, { startTime: 0, duration: LEN, name: pt.id, notes: pt.notes.map((n, i) => ({ ...n, id: 'n' + i })) })
        }
      }
      for (const pt of parts) {
        setup(pt.id)
        const m = await eng.renderMix({ bits: 16, normalize: false, tailSeconds: 1.5 })
        await window.save(`${gid}-${pt.id}.wav`, b64(m.wav))
        truth.parts[pt.id] = { program: pt.program, notes: pt.notes.map(n => ({ pitch: n.pitch, start: n.startTime * 60 / g.bpm, end: (n.startTime + n.duration) * 60 / g.bpm, velocity: n.velocity })) }
      }
      setup(null)
      const m = await eng.renderMix({ bits: 16, normalize: true, tailSeconds: 1.5 })
      await window.save(`${gid}-mix.wav`, b64(m.wav))
      await window.save(`${gid}-truth.json`, btoa(unescape(encodeURIComponent(JSON.stringify(truth)))))
    }
  }, [['pop', 9], ['funk', 4], ['ballad', 0], ['rock', 7], ['jazz', 5], ['house', 2]])
  console.log(fs.readdirSync(OUT).length, 'files', errs.slice(0, 3)); await b.close()
})()
