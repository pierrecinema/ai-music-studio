# Road to 1.0

Plan written on 2026-11-18 (state: 0.60.5). The owner decides the order; items marked **decide** need the owner's choice.

1.0 means: everything shown in the app works, nothing loses work, a new user gets from install to a finished,
exported song without help from outside the app. Linux comes after RC 1.0.

## 0.70: finish what is half there (released 2026-11-19, except plugin automation / presets and album mastering)

| Item | What | Done when |
|---|---|---|
| Plugins on the Studio master | VST effects on the master channel (Mixer and Studio), saved with the project and in the export | Test plan rows pass |
| Plugin automation | Automation lanes for plugin parameters (like volume / pan) | Parameter follows the lane in play and export |
| Plugin presets | Save / load a plugin state as a preset, per plugin | Presets survive a restart |
| MIDI | Velocity lane and note length handles in the Piano Roll, MIDI file import / export (.mid) | A .mid from another program opens with the right notes |
| Studio audio | Clip fades with handles, clip gain, reverse, time-stretch per clip | |
| Mastering step 6 | Album: several songs, the same loudness, gaps, one export | **pending list** (owner, 19.11.2026) |
| Looks | Swiss (#73) rebuilt; Analog console removed in 0.70.1 (owner) | done |

## 0.80: AI Instruments (owner, 19.11.2026: first, all instruments in one version) — built in 0.80.0

- Virtual band: drummer, bass player, guitarist that follow the song's chords (MIDI, every PC). Singer: 0.90.
- AI orchestra: MIDI-DDSP (13 orchestral instruments, processor) renders a MIDI track to audio.
- Any instrument by text: ACE-Step cover of the MIDI track (NVIDIA).
- 0.81: MIDI song generator (owner's idea, 20.11.2026), studio-device look with rotary knobs.
- Later ideas: more drum kits as samples, a keyboard player (piano comping), guitar and bass sounds from samples or AI.

## 0.90: Vocal Editor (owner, 18.11.2026; moved after AI Instruments on 19.11.2026)

- Short vocals first: a word, a phrase, one-shots and short vocal loops (owner's wish of 12.11.), voice (male / female / style), language, tempo and key; trimmed to the sung part and saved to the Library with tags.
- Then longer vocals from notes and lyrics on a MIDI track, placed in the Studio.

Karaoke Export, Video Composer and Cloud Rendering (Pro): **decide**: hidden in 1.0 (no "coming soon" pages) or built later.

## 0.95: help, languages, first start

- **Help in the app:** the manual and wiki inside the app, in the chosen language, a "?" on each page that opens its part.
- **First start guide:** three steps: install an AI engine, make a first song, open it in the Studio. A demo project to try at once.
- **Translations:** fill Japanese and Korean; the mastering assistant's texts in all languages.
- **Crash and error reports:** errors written to the log with one click "send report" (opens a GitHub issue with the log, nothing sent automatically).
- **Autosave and recovery:** project saved every few minutes; after a crash the app offers the last state.

## RC 1.0: test and polish

- Full pass of `docs/TESTPLAN.md` on the owner's PCs (AMD R9 290, a PC with NVIDIA, a PC without a GPU), both shortcut layouts, all four looks.
- Performance: 30+ tracks with plugins, CPU meter, no clicks at 256 buffer with ASIO.
- Code signing: reapply at SignPath Foundation with stars, articles and videos as references (so Windows shows no SmartScreen warning).
- Updated screenshots, wiki, manual and a new video.
- Two weeks with no new features: only fixes. Then 1.0.

## After 1.0

- Linux (AppImage, engine install; owner tests in WSL2 or a VM).
- Karaoke Export, Video Composer, Cloud Rendering (Pro) if not built before, more looks (tape machine, modular, blueprint …), macOS if asked for.

## Alongside, all the time

- Feedback from Reddit, YouTube, GitHub issues first.
- Posts in forums and blogs (see `NEXT-STEPS.md`).
