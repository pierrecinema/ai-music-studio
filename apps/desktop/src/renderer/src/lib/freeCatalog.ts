// Free plugins (Settings → Plugins → Free plugins): the LANDR list "Best Free VST Plugins (2026)" plus the open-source
// instruments the app installs by itself. Most of these makers only allow downloading from their own site (some after
// a free account), so the app opens the official page; the plugin search then finds what was installed. Open-source
// plugins with a release on GitHub are installed with one click (see main/free-plugins.ts, `auto`).
export type FreeKind = 'effect' | 'instrument' | 'midi'
export interface FreePluginInfo {
  id: string
  name: string
  vendor: string
  kind: FreeKind
  what: string                 // what it is (category)
  url: string                  // the maker's own page
  match: RegExp                // how it shows in the plugin search (name of the scanned plugin)
  auto?: string                // one-click install from the project's releases (id in main/free-plugins.ts)
  account?: boolean            // the maker asks for a free account / its own installer app
  note?: string
}

export const FREE_PLUGINS: FreePluginInfo[] = [
  // ── effects ──
  { id: 'supermassive', name: 'Valhalla Supermassive', vendor: 'Valhalla DSP', kind: 'effect', what: 'Reverb and delay', url: 'https://valhalladsp.com/shop/reverb/valhalla-supermassive/', match: /supermassive/i },
  { id: 'deelay', name: 'Deelay', vendor: 'Sixth Sample', kind: 'effect', what: 'Delay', url: 'https://sixthsample.com/deelay/', match: /deelay/i },
  { id: 'tdr-nova', name: 'TDR Nova', vendor: 'Tokyo Dawn Records', kind: 'effect', what: 'Dynamic EQ', url: 'https://www.tokyodawn.net/tdr-nova/', match: /tdr ?nova/i },
  { id: 'multiply', name: 'Multiply', vendor: 'Acon Digital', kind: 'effect', what: 'Chorus', url: 'https://acondigital.com/products/multiply/', match: /multiply/i },
  { id: 'space-mod', name: 'Valhalla Space Modulator', vendor: 'Valhalla DSP', kind: 'effect', what: 'Flanger', url: 'https://valhalladsp.com/shop/modulation/valhalla-space-modulator/', match: /space ?modulator/i },
  { id: 'fb-phaser', name: 'Phaser', vendor: 'Full Bucket Music', kind: 'effect', what: 'Phaser', url: 'https://www.fullbucket.de/music/fbphaser.html', match: /fb.?phaser|full ?bucket.*phaser/i },
  { id: 's-pulser', name: 'S Pulser', vendor: 'Solider Sound', kind: 'effect', what: 'Tremolo', url: 'https://solidersound.com/plugins/s-pulser/', match: /s ?pulser/i },
  { id: 'krush', name: 'Krush', vendor: 'Tritik', kind: 'effect', what: 'Bitcrusher', url: 'https://www.tritik.com/product/krush/', match: /krush/i },
  { id: 'scream4', name: 'Scream 4 (Reason Rack Free)', vendor: 'Reason Studios', kind: 'effect', what: 'Distortion', url: 'https://www.reasonstudios.com/reason-free', match: /reason ?rack/i, account: true, note: 'Part of Reason Rack Free: one plugin that holds the Reason devices' },
  { id: 'overheat', name: 'Overheat', vendor: 'Sampleson', kind: 'effect', what: 'Saturation', url: 'https://sampleson.com/overheat.html', match: /overheat/i },
  { id: 'rough-rider', name: 'Rough Rider 3', vendor: 'Audio Damage', kind: 'effect', what: 'Compressor', url: 'https://www.audiodamage.com/pages/free-and-legacy', match: /rough ?rider/i },
  { id: 'w1', name: 'W1 Limiter', vendor: 'George Yohng', kind: 'effect', what: 'Limiter', url: 'https://www.yohng.com/software/w1limit.html', match: /w1 ?limit/i },
  { id: 'filterstep', name: 'Filterstep', vendor: 'Audiomodern', kind: 'effect', what: 'Filter', url: 'https://audiomodern.com/shop/plugins/filterstep/', match: /filterstep/i },
  { id: 'spacer', name: 'Spacer', vendor: 'Spectral Plugins', kind: 'effect', what: 'Multi-effect', url: 'https://spectral-plugins.com/', match: /spacer/i },
  { id: 'tape-cassette', name: 'Tape Cassette 2', vendor: 'Caelum Audio', kind: 'effect', what: 'Lo-fi tape', url: 'https://www.caelumaudio.com/CaelumAudio/?Page=TapeCassette2', match: /tape ?cassette/i },
  // ── instruments ──
  { id: 'surge', name: 'Surge XT', vendor: 'Surge Synth Team', kind: 'instrument', what: 'Hybrid synthesizer', url: 'https://surge-synthesizer.github.io/', match: /surge/i, auto: 'surge' },
  { id: 'dexed', name: 'Dexed', vendor: 'Digital Suburban', kind: 'instrument', what: 'FM synthesizer (DX7)', url: 'https://asb2m10.github.io/dexed/', match: /dexed/i, auto: 'dexed' },
  { id: 'vital', name: 'Vital', vendor: 'Vital Audio', kind: 'instrument', what: 'Wavetable synthesizer', url: 'https://vital.audio/', match: /^vital/i, account: true },
  { id: 'noisemaker', name: 'TAL-NoiseMaker', vendor: 'TAL Software', kind: 'instrument', what: 'Analog-style synthesizer', url: 'https://tal-software.com/products/tal-noisemaker', match: /noise ?maker/i },
  { id: 'tyrelln6', name: 'TyrellN6', vendor: 'u-he', kind: 'instrument', what: 'Bass and analog synthesizer', url: 'https://u-he.com/products/tyrelln6/', match: /tyrell/i },
  { id: 'tx16wx', name: 'TX16Wx', vendor: 'CWITEC', kind: 'instrument', what: 'Sampler', url: 'https://www.tx16wx.com/', match: /tx16wx/i },
  { id: 'reason-rack', name: 'Reason Rack Free', vendor: 'Reason Studios', kind: 'instrument', what: 'Rack of instruments and effects', url: 'https://www.reasonstudios.com/reason-free', match: /reason ?rack/i, account: true },
  { id: 'labs-drums', name: 'LABS Drums', vendor: 'Spitfire Audio', kind: 'instrument', what: 'Acoustic drums', url: 'https://labs.spitfireaudio.com/?types=drums&sortBy=prod_products_labs_latest', match: /^labs/i, account: true, note: 'All LABS sounds play in the one plugin "LABS"' },
  { id: 'kong', name: 'Kong Drum Designer (Reason Rack Free)', vendor: 'Reason Studios', kind: 'instrument', what: 'Drum synthesizer', url: 'https://www.reasonstudios.com/reason-free', match: /reason ?rack/i, account: true },
  { id: 'sub', name: 'SUB', vendor: 'Sampleson', kind: 'instrument', what: 'Analog drum machine', url: 'https://sampleson.com/SUB-free-analog-drums.html', match: /^sub\b|sampleson ?sub/i },
  { id: 'chowkick', name: 'CHOW Kick', vendor: 'Chowdhury DSP', kind: 'instrument', what: 'Kick drum synthesizer', url: 'https://chowdsp.com/products.html', match: /chow ?kick/i, auto: 'chowkick' },
  { id: 'labs-piano', name: 'LABS Soft Piano', vendor: 'Spitfire Audio', kind: 'instrument', what: 'Piano', url: 'https://labs.spitfireaudio.com/soft-piano', match: /^labs/i, account: true },
  { id: 'sweetcase', name: 'Sweetcase', vendor: 'NoiseAsh', kind: 'instrument', what: 'Rhodes electric piano', url: 'https://noiseash.com/sweetcase-vintage-electric-piano/', match: /sweetcase/i },
  { id: 'labs-guitars', name: 'LABS Guitars', vendor: 'Spitfire Audio', kind: 'instrument', what: 'Guitars', url: 'https://labs.spitfireaudio.com/?types=guitars&sortBy=prod_products_labs_latest', match: /^labs/i, account: true },
  { id: 'bbc-discover', name: 'BBC Symphony Orchestra Discover', vendor: 'Spitfire Audio', kind: 'instrument', what: 'Orchestra', url: 'https://www.spitfireaudio.com/bbc-symphony-orchestra-discover', match: /bbc ?symphony/i, account: true },
  // ── MIDI ──
  { id: 'hy-seq', name: 'HY MIDI Sequencer plugins', vendor: 'HY-Plugins', kind: 'midi', what: 'Step sequencers', url: 'https://hy-plugins.com/plugins/vst/vst-instrument/', match: /^hy-?/i },
  { id: 'codefn42', name: 'CodeFN42 plugins', vendor: 'CodeFN42', kind: 'midi', what: 'MIDI generators and arpeggiators', url: 'https://www.codefn42.com/index.html', match: /codefn42|rand ?arp|chordz/i },
  { id: 'harvest-mini', name: 'Harvest Mini', vendor: 'Harvest Plugins', kind: 'midi', what: 'MIDI pattern generator', url: 'https://harvestplugins.com/harvest-mini/', match: /harvest/i },
  { id: 'gatelab', name: 'Gatelab', vendor: 'Audiomodern', kind: 'midi', what: 'Rhythmic gate', url: 'https://audiomodern.com/shop/plugins/gatelab/', match: /gatelab/i },
  { id: 'rhygenerator', name: 'HATEFISh RhyGenerator One', vendor: 'HoRNet', kind: 'midi', what: 'Rhythm generator', url: 'https://www.hornetplugins.com/plugins/hatefish-rhygenerator-one/', match: /rhygenerator/i },
  { id: 'rpg', name: 'Rhythm and Pitch Generator', vendor: 'Sonisto / Soundemote', kind: 'midi', what: 'Rhythm and melody generator', url: 'https://sonisto.com/products/soundemote-labs/rhythm-and-pitch-generator', match: /rhythm and pitch/i },
  { id: 'bluearp', name: 'BlueArp', vendor: 'OMG Instruments', kind: 'midi', what: 'Arpeggiator', url: 'https://omg-instruments.com/wp/?page_id=63', match: /bluearp/i },
  { id: 'hypercyclic', name: 'Hypercyclic', vendor: 'Mucoder', kind: 'midi', what: 'Arpeggiator and sequencer', url: 'https://www.mucoder.net/en/hypercyclic#download', match: /hypercyclic/i },
  { id: 'dodo', name: 'Dodo MIDI 2', vendor: 'Dodo Bird Music', kind: 'midi', what: 'MIDI melody generator', url: 'https://dodobirdmusic.com/dodo-midi/', match: /dodo/i },
  { id: 'stochas', name: 'Stochas', vendor: 'Surge Synth Team', kind: 'midi', what: 'Probability sequencer', url: 'https://stochas.org/', match: /stochas/i, auto: 'stochas' },
]
