# Next steps and working notes

Kept for the next working session (also read by Claude: see CLAUDE.md). State: version 0.60.5, 2026-11-18.

## Where things are

- App releases: every version on GitHub Releases with `latest.yml` (in-app update). Changelog: `CHANGELOG.md`.
- Promo material (not in `main`): branch `promo` – YouTube video (v3, 2:12), `YouTube-Text.txt` (title, description
  under 3000 characters, chapters, hashtags, tags), soundtrack mix and sources, scripts for screenshots / video / mix.
- YouTube tour: https://youtu.be/FTNmsRxWuy4 (0.60, rack look, shown at the top of the README; older tour: https://youtu.be/F1hakwjWwEc). Video v4 and its YouTube text were made from scripts on the branch `promo` (adapted).
- Donations: https://paypal.me/djpedroflores (Settings → About, README "Buy me a coffee", `.github/FUNDING.yml`); not in the
  release notes (owner's wish). No paid features yet;
  "Cloud Rendering (Pro)" is only a Coming soon page.
- Reddit drafts: `docs/reddit-posts.md` (two posts are live; waiting for feedback).

## Tonight / next session

0. Plan to 1.0: `docs/ROADMAP-1.0.md`. Testing goes by `docs/TESTPLAN.md` (German checklist, the owner fills in results; fix ❌ first).

1. Go through feedback: Reddit and YouTube comments, GitHub issues and stars. Fix what is needed first.
2. Write the posts (tone of each community, say openly that the owner is the developer, read each place's
   self-promotion rules, not everything on the same day):

   | When | Where |
   |---|---|
   | Day 1 | r/LocalLLaMA (local AI angle), r/opensource, add the app on AlternativeTo.net, write to Bedroom Producers Blog and CDM (Create Digital Music) |
   | Day 2 | Show HN (Hacker News), KVR Audio forum, Sequencer.de |
   | Then | Product Hunt (Tue/Wed), showcase channels of the ACE-Step and Ollama Discords, a 20–30 s short (song in → karaoke version out with the stem mixer) for TikTok / Reels / Shorts |
   | Ongoing | feedback / self-promo threads of r/WeAreTheMusicMakers and r/edmproduction; r/coolgithubprojects, r/musicproduction, r/aimusic |

   German outlets: Sequencer.de, recording.de, Musiker-Board.de; Amazona.de, Bonedo, delamar.de (news tips).
   Free-software lists: Rekkerd.org, Plugins4Free. "awesome" lists on GitHub (AI music / audio): pull requests.
   YouTube creators: small channels (5k–50k) that show free music tools; find current ones by searching.
3. Prepare the emails to the blogs (short: what it is, why it is different – local, free, open source –, video link,
   download link, one screenshot).

## Plan (owner, 17.11.2026)

- **0.50.0: VST plugins, VST3 and VST2 at the same time:** host, scan, Settings → Plugins list with ticks, plugin
  windows, plugins in the Studio inserts, on the master and in the Mastering chain.
- **Translations:** Japanese and Korean tables (`i18n/ui/ja.json`, `ko.json`) are still empty: only the menu is
  translated. The mastering assistant writes its suggestions in German or English only. See `docs/TRANSLATING.md`.
- **Done in 0.60.0:** ASIO output through the plugin host, VST instruments on MIDI tracks, free instruments (Dexed, Surge XT), Hardware rack look rebuilt. Next: test them with the owner (TESTPLAN section 11); Swiss rebuilt in 0.70.0; the Analog console look was removed in 0.70.1 (owner did not like it).
- **(done) 0.60.0: Settings → Audio, sound cards (owner, 17.11.2026):** more options for the audio output: choose the sound card
  / output device, other driver types such as **ASIO** (also WASAPI exclusive), buffer size and sample rate per device,
  and a **test tone** button to check that the right card plays. Idea: the JUCE plugin host already has JUCE's audio
  device layer (ASIO needs the ASIO SDK, which Steinberg now publishes under GPL-3), so it could play the app's output;
  plain outputs also work in the page (setSinkId). Plan it first and let the owner add to it.
- **Linux version: only after RC 1.0** (owner, 17.11.2026). Then: AppImage build, engine install on Linux; the owner
  can test it in WSL2 (WSLg) or a VM on Windows 11. Not before.
- **Help in the app:** the manual / wiki inside the app, in the chosen language (owner's idea).
- **New promo video** once VST is in (the owner plans it soon).

## Pending list (owner)

- **Album mastering** (Mastering step 6): several songs, the same loudness, gaps, one export. Put on the list on 2026-11-19.
- **Plugin automation and presets:** explained to the owner on 2026-11-19, decision open.

## Ideas from the owner (19.11.2026)

- **MIDI hardware:** 0.72 has Settings → MIDI. Later: Launchpad as a clip grid (needs a session / clip view), more device profiles (the owner tests with an Akai MPK Mini and a few others).
- **External hardware synths:** midi.guide (github.com/pencilresearch/midi, CSV per device, CC BY-SA 4.0, attribution needed) lists the CC/NRPN numbers of many synthesizers: could give named CC automation lanes for a MIDI track that plays an external synth. cc.mxrlkn.com could not be reached from the cloud session.

## Open technical items

- **Beat sync, ideas from the projects the owner linked (studied 12.11.2026):**
  Mixxx (`src/track/beatutils.cpp`: constant regions, rounding within the error range, adjustPhase) and opendj
  (`crates/engine/src/gridfit.rs`: numbered beats, robust line fit, round tempo only if the beats fit it, tempo
  sections, "unsure" grids) — rounding check and the unsteady warning are in 0.18.6. Still open: tempo sections for
  live songs (one warp marker per section, set automatically). auto-dj-ai: phrase grid (16/32/64 beats from timbre
  changes) could put "Sync together" on phrase starts. MixingBear: offset search maximising coinciding beats, a
  possible cross-check of the phase. emcdjapp, BeatSync-Engine: plain librosa beat_track, nothing new;
  MixPerfect: uses the BASS library's tempo detection.

- Test with real models on the owner's PCs: "→ MIDI" (needs Audio → MIDI (basic-pitch) in AI Engines), the stem mixer
  remix export, ACE-Step 1.5 install, Grok / Ollama chat. Stem splitting and saving to the Library are confirmed working.
- Test the new "Vocals + Instrumental (fastest)" mode (0.18.0) on the R9 290: does DirectML work, how fast is it,
  does the fallback to the processor kick in? Written from the audio-separator code, tested here only with a stand-in.
- Demucs runs on the CPU with AMD / Intel graphics (DirectML lacks the complex STFT); "Fast" is ~4x quicker than
  "Balanced" (4 models). An NVIDIA card with the CUDA variant is much faster.
- torchaudio 2.9+ needs TorchCodec for load/save: do not use `torchaudio.load/save` in the backend (use soundfile /
  librosa); `torchaudio.functional` is fine.
- Code signing: the SignPath Foundation application was declined (too little visibility). Reapply in 2–3 months with
  stars, articles, videos as references. Until then releases stay unsigned (SmartScreen note in README / manual).
- Ideas for later: VST3 plugins, Vocal Editor, AI Instruments, Karaoke Export with lyrics, Video Composer, a cloud
  render service (check model licences first: MusicGen weights are non-commercial), Electron → Tauri.

## Owner's wishes for coming features

- **Vocal Editor (12.11.2026):** very short vocals must be possible too, down to a single word or a short phrase,
  to make vocal samples (one-shots and short vocal loops for the Library / Samples). Think: word or phrase,
  voice (male / female / style), language, tempo and key; result trimmed to the sung part (no silence), saved to the
  Library with tags so it can be dragged into the Studio. Note: ACE-Step 1.5 sings little or nothing with a one-line
  text in a 60–90 s song, so short vocals need their own approach (short length, the word repeated, then cut).
- **Where we stopped (13.11.2026, 0.30.7):** area 7 (Mastering 0.30.x) tested by the owner; 6c.19 (ACE-Step 1.5 LoRA) and 6c.20 (Stem Splitter button) passed with 0.30.8; open: 6c.21 (0.30.9 load/download text). Mastering step 4 is in 0.31.x and tested (test plan 7c, 17.11.2026); next is step 5 (VST3) when the owner wants it. Open idea: translate the rest of the Mastering page to German.
- **Mastering:** steps 1–3 of `docs/MASTERING-PLAN.md` are in 0.30.0 (test plan area 7). Next, step by step with the
  owner: 4 (assistant, editing), 5 (VST3 host), 6 (album). AI Chat and the rest (test plan 7b): ask what is missing.

## Things learned about working with the owner

- Talk German with the owner; code, docs and commits in English.
- Texts for the owner (YouTube texts, posts, emails) always shown in the chat itself, not only as a file.
- The owner does not want manual release steps: see the release procedure in CLAUDE.md, merge own PRs when green.
- Do not name other commercial products in texts (no "alternative to ACE Studio", no "RipX"); describe our own features.
- Do not use or download "free pro version" repositories of commercial software (cracks / malware risk, licence).
- The app's MCP endpoint is on the owner's PC (`http://127.0.0.1:38765/mcp`, 38766 if the port is busy): only a
  Claude session running on that PC can reach it (`claude mcp add --transport http ai-music-studio <url>`).
- ElevenLabs free generations were often busy; Splice downloads spend credits (ask first).

## Layouts (planned for a later version)

The owner wants, next to light / dark, a choice of whole layouts (structure, type and controls, not only colours), and
they should not look like the usual "AI app" style. Mock-ups made on 2026-11-18; the owner liked:
1 **Analog console** (warm wood, amber display, mixer strips with VU needles at the bottom), 3 **Swiss / brutal**
(white and black, very large type, orange, transport as big blocks, navigation bar at the bottom) and 4 **Hardware rack**
(grey device fronts with screws, green LCD, LED buttons, effect rack with knobs). 1, 3 and 4 are in the app since 0.51.4 (Settings → Appearance: console, swiss, rack). Five further ideas were shown
(tape machine, modular with cables, vertical timeline, blueprint, pocket device); the owner's choice is still open.
