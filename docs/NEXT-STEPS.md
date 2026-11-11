# Next steps and working notes

Kept for the next working session (also read by Claude: see CLAUDE.md). State: version 0.17.0, 2026-11-11.

## Where things are

- App releases: every version on GitHub Releases with `latest.yml` (in-app update). Changelog: `CHANGELOG.md`.
- Promo material (not in `main`): branch `promo` – YouTube video (v3, 2:12), `YouTube-Text.txt` (title, description
  under 3000 characters, chapters, hashtags, tags), soundtrack mix and sources, scripts for screenshots / video / mix.
- YouTube tour: https://youtu.be/F1hakwjWwEc (shown at the top of the README).
- Donations: https://paypal.me/djpedroflores (Settings → About, README, `.github/FUNDING.yml`). No paid features yet;
  "Cloud Rendering (Pro)" is only a Coming soon page.
- Reddit drafts: `docs/reddit-posts.md` (two posts are live; waiting for feedback).

## Tonight / next session

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

## Open technical items

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

## Things learned about working with the owner

- Talk German with the owner; code, docs and commits in English.
- The owner does not want manual release steps: see the release procedure in CLAUDE.md, merge own PRs when green.
- Do not name other commercial products in texts (no "alternative to ACE Studio", no "RipX"); describe our own features.
- Do not use or download "free pro version" repositories of commercial software (cracks / malware risk, licence).
- The app's MCP endpoint is on the owner's PC (`http://127.0.0.1:38765/mcp`, 38766 if the port is busy): only a
  Claude session running on that PC can reach it (`claude mcp add --transport http ai-music-studio <url>`).
- ElevenLabs free generations were often busy; Splice downloads spend credits (ask first).
