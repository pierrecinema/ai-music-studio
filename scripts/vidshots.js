const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/vid/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('dialog', d => d.dismiss());
  await p.goto('http://localhost:5199/'); await p.waitForTimeout(3500);
  const killWelcome = () => p.evaluate(() => { for (const el of document.querySelectorAll('div')) { const s = getComputedStyle(el); if (s.position === 'fixed' && /Welcome/.test(el.innerText || '') && el.innerText.length < 3000) el.remove() } });
  await killWelcome();
  await p.waitForFunction(() => window.__ams && window.__ams.loadBuffer);
  await p.evaluate(async () => { for (const f of ['/demo/t0.wav','/demo/t1.wav','/demo/t3.wav']) await window.__ams.loadBuffer(f) });
  await p.evaluate(() => { const span = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'AI Assistant'); span?.parentElement?.querySelector('button')?.click() });
  // demo project
  await p.evaluate(async () => {
    const P = window.__ams.project; const st = P.getState();
    const id = () => Math.random().toString(36).slice(2, 10);
    const notes = []; const chord = [[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
    chord.forEach((c, i) => c.forEach(n => notes.push({ id: id(), pitch: n, startTime: i * 4, duration: 3.5, velocity: 90 })));
    const mel = [72,74,76,79,76,74,72,69,71,72,74,72,69,67,69,72];
    mel.forEach((n, i) => notes.push({ id: id(), pitch: n, startTime: i, duration: 0.9, velocity: 100 }));
    const loopLen = 16; // 4 bars
    const tracks = [
      { id: 't1', name: 'Midnight Drive', type: 'audio', color: '#8b5cf6', volume: 0.8, pan: 0, muted: false, soloed: false,
        clips: [{ id: 'c1', startTime: 0, duration: 78.67, audioFile: '/demo/t0.wav', name: 'Midnight Drive', warpBpm: 118 }],
        automation: { volume: [{ beat: 0, value: 0.2 }, { beat: 8, value: 0.8 }, { beat: 40, value: 0.8 }, { beat: 56, value: 0.5 }] }, showAutomation: 'volume', sends: { r1: 0.3 } },
      { id: 't2', name: 'Deep house – Loop 124 BPM 4 bars', type: 'audio', color: '#06b6d4', volume: 0.7, pan: -0.2, muted: false, soloed: false,
        clips: [0,1,2,3].map(k => ({ id: 'l' + k, startTime: k * loopLen, duration: loopLen, audioFile: '/demo/t1.wav', name: 'Deep house – Loop 124 BPM 4 bars', warpBpm: 124 })) },
      { id: 't3', name: 'Piano', type: 'midi', color: '#f59e0b', volume: 0.75, pan: 0.15, muted: false, soloed: false,
        clips: [{ id: 'm1', startTime: 16, duration: 16, notes, name: 'Chords + melody' }] },
      { id: 't4', name: 'Lo-fi Study – Loop 85 BPM 8 bars', type: 'audio', color: '#22c55e', volume: 0.6, pan: 0.1, muted: false, soloed: false,
        clips: [{ id: 'c4', startTime: 32, duration: 32, audioFile: '/demo/t3.wav', name: 'Lo-fi Study – Loop 85 BPM 8 bars', warpBpm: 85 }] },
    ];
    P.setState({ project: { ...st.project, name: 'Demo Project', bpm: 120, tracks,
      loop: { start: 16, end: 32, enabled: true },
      markers: [{ id: 'k1', beat: 0, name: 'Intro' }, { id: 'k2', beat: 16, name: 'Verse' }, { id: 'k3', beat: 32, name: 'Chorus' }, { id: 'k4', beat: 48, name: 'Drop' }],
      returns: [{ id: 'r1', name: 'Reverb', effect: 'reverb', volume: 0.7, muted: false, pan: 0, decay: 2.5 }] }, selectedTrackId: 't3', selectedClipId: 'm1', selectedClipIds: ['m1'] });
  });
  const go = async (view) => { await p.evaluate((v) => window.__ams.ui.getState().setActiveView(v), view); await p.waitForTimeout(1800); await killWelcome(); };
  const shot = async (name) => { await p.evaluate(() => { for (const el of document.querySelectorAll('*')) { if (el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.firstChild.textContent.includes('/tmp/claude-0/demo/lib')) el.firstChild.textContent = el.firstChild.textContent.replace('/tmp/claude-0/demo/lib', 'C:\\Users\\you\\Music\\AI Music Studio') } }); await p.screenshot({ path: OUT + name + '.png' }); console.log('shot', name); };
  await p.evaluate(() => window.__ams.ui.getState().setZoom(0.3));
  await go('timeline'); await p.waitForTimeout(2500); await shot('studio');
  await go('create');
  try { await p.locator('button', { hasText: /^Studio$/ }).first().click(); await p.waitForTimeout(500) } catch (e) {}
  await p.fill('textarea >> nth=0', 'afro house, deep house, arabic oud melody, warm bass, 120 bpm').catch(()=>{});
  await shot('create');
  const loopLbl = p.locator('text=/^(Create loop|Loop erzeugen)$/').first();
  await loopLbl.locator('xpath=ancestor::div[2]').locator('[role=switch]').first().dispatchEvent('click');
  await p.waitForTimeout(400); await loopLbl.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await shot('loop');
  await go('piano-roll'); await shot('piano-roll');
  await go('mixer'); await shot('mixer');
  await go('library'); await shot('library');
  await p.locator('button', { hasText: /^Stems/ }).first().click(); await p.waitForTimeout(800); await shot('stems');
  await p.locator('button', { hasText: /^Export all/ }).first().click(); await p.waitForTimeout(500); await shot('export');
  await p.locator('button', { hasText: /^Cancel$/ }).first().click().catch(()=>{});
  await go('stem-splitter'); await shot('stem-splitter');
  await go('mastering'); await shot('mastering');
  await go('settings');
  for (const tab of ['AI Engines', 'Hardware', 'Shortcuts', 'About']) {
    await p.locator('button', { hasText: new RegExp('^' + tab + '$') }).first().click(); await p.waitForTimeout(1500); await shot('settings-' + tab.toLowerCase().replace(/ /g, '-'))
  }
  await p.locator('button', { hasText: /^AI$/ }).first().click(); await p.locator('button', { hasText: /Ollama/ }).first().click(); await p.waitForTimeout(500); await shot('settings-ai');
  await b.close();
})();
