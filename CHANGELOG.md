# Changelog

What changed in each version of AI Music Studio. The release workflow puts the section of the released version
on its GitHub release page, so every version needs a `## <version>` section here before it is released.

## 0.20.2

- **Updates arrive faster:** the app looks for a new version every 15 minutes (before: every 4 hours), and new versions are published by themselves as soon as they are ready.

## 0.20.1

- **The AI chat can use the app:** with every provider (Claude, ChatGPT, Gemini, Grok, Ollama and local servers that support tools) the assistant can now **make a song itself** ("make me an afro house track with female vocals"), check how far it is, list LoRAs, split stems, master a track, suggest chords and read the system info: the same tools the app offers over MCP. A song it starts shows its progress in the chat and, when ready, can go to the Studio with one click; it is saved in the Library. It uses the music model chosen in Create music.
- **Gemini 3.5:** the model list now offers Gemini 3.5 Flash and Pro; the older models Google switched off are replaced on start. **Fix:** the Gemini key and the local server address were not saved and were gone after a restart.
- **Fix: exports at 44.1 kHz.** ACE-Step 1.5 makes songs at 48 kHz, and *Export…* in the Library and the Stem Splitter kept that rate, so a platform rejected the file. Exports now use the rate from **Settings → Audio** (44.1 kHz unless changed; the setting did nothing before), converted in high quality; the export dialog shows the rate and can keep the file's own. File → Export audio uses the same setting.

## 0.20.0

- **Studio: automation in its own lanes.** The A button (or right-click → Show automation) opens **volume and pan as two lanes** below the track; each lane can be made small (▸ / ▾), switched to another value or closed, and more lanes (sends) can be added with +.
- **Studio: effects in every track (FX).** The FX button opens an effects lane: **EQ, compressor, delay, reverb, filter**, each with its settings, on / bypass and order. They are heard in playback and in the export. VST3 plugins will appear in the same place later.
- **Track colour:** right-click a track header (or click the colour strip at its left) and pick a colour.
- **MIDI recording:** the record button, **Ctrl+R** and the new **● Rec** in the Piano Roll record MIDI when a MIDI track is selected or the Piano Roll is open. What you play on the Piano Roll's keyboard or on a **MIDI keyboard** appears as notes right away, as long as you held the keys.
- **Create music – lyrics:** buttons insert **[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro]** at the cursor; **Auto structure** turns stanzas into verses and choruses (a stanza that comes back is the chorus); lyrics without sections are structured automatically.
- **Create music – preview voices:** three short takes of your first lines with different voices (ACE-Step); **Use this voice** makes the whole song with that voice (its seed). Previews are not saved in the Library.
- **Create music – LoRAs per model:** the LoRA list shows the LoRAs that fit the chosen model; the others are greyed out with the reason (made for XL, made for ACE-Step v1).
- **AI chat: Google Gemini** (with your own key, free tier) and **Local server** (LM Studio, KoboldCpp, llama.cpp; on older AMD cards through Vulkan).
- **Top bar:** the position display shows bar . beat . sixteenth (1.1.1 = the start) and switches to minutes:seconds with a click. **Channel tab:** pan shows L / R and "Center".

## 0.18.13

- **ACE-Step 1.5 songs end where the music ends:** the end is now found relative to the song's own loudness (quiet reverb tails and hiss no longer leave about a second of "nothing"), and a song that already dies away is no longer faded out a second time; only a song that stops abruptly is faded.

## 0.18.12

- **LoRAs work with ACE-Step 1.5 turbo:** a LoRA made for ACE-Step 1.5 (a folder with adapter_config.json, or a LoKr file) is now loaded with its strength. Packs with several LoRAs in one folder (like "...-5-LoRAs") show each LoRA on its own. LoRAs for the larger XL model ("xl" in the name) and LoRAs of ACE-Step v1 do not fit the 2B turbo model: they are left out with a note, and a LoRA that fails to load never stops the song. One LoRA per song (the strongest).

## 0.18.11

- **ACE-Step 1.5: no empty bar at the end:** when the model ends the song by itself before the length asked for, the extra seconds were silence. The silence at the end is now cut (a quarter second of the decay is kept) before the fade-out. The backend log also shows what the model got (style, number of lyric lines, language), to find out why a song came without vocals.
- **Changing the tempo while the song plays keeps it playing:** pressing Enter in the BPM field stopped the music for the moment every synced song was stretched to the new tempo. The old sound now keeps playing until the new one is ready, then it switches over at the same place in the song, in time with the metronome (measured: every kick within 1 ms of its click before and after the change). The position is also counted in the old tempo up to the switch, so the song no longer jumps.
- **ACE-Step 1.5: a clear message when Windows runs out of virtual memory** ("the paging file is too small", error 1455). On the processor the model needs about 12 to 14 GB; with 16 GB RAM Windows covers the rest with its paging file, which is often set too small. The message now says how to fix it once in Windows (let Windows manage the paging file size, or set 16–32 GB).

## 0.18.10

- **The project tempo can be typed again:** the BPM field at the top took every key on its own, so typing "1" on the way to 128 was refused and the field jumped back. Now type the tempo and press Enter (or leave the field); decimals work (95.5), arrow keys and the mouse wheel change it by 1 (Shift: 0.1). The field is wider, so the whole tempo is visible.
- **Click or double-click anywhere in the Studio to move the playhead there** (snapped to the grid, Alt: free). A double-click on an empty audio track no longer opens the file dialog (use *Import audio…*); on a MIDI track it still makes a clip.
- **SYNC keeps a song tempo you corrected by hand:** the clip bar field is now called *Song tempo* (the tempo the song itself was made at) and shows the project tempo it plays at; SYNC used to measure again and put the measured tempo back.

## 0.18.9

- **Track height:** every audio and MIDI track in the Studio can be made higher or lower by dragging its lower edge with the mouse (36 to 320 pixels); a double-click on the edge sets the normal height again. The height is saved with the project.
- **ACE-Step 1.5 songs end cleanly:** the model renders exactly the length asked for and then simply stops, often in the middle of the music, so the end of a song seemed cut off. It now renders 5 seconds more and fades out over the last 3 seconds (a fade-out set under Advanced is used instead).
- **ACE-Step 1.5 shows its phase:** at 80 % it decodes the song into audio, which takes a few minutes on the processor without further progress. The progress now says so ("Decoding audio…"), so a standing bar is not taken for a hang.

## 0.18.8

- **Synced songs hit the beat exactly, from the first kick on:**
  - **Stretched beat by beat**, like the "Beats" warp mode of DAWs: a synced clip is cut at every beat of its grid and each piece is stretched on its own, starting exactly at its place. Every kick now lands within 1 ms of its beat. Before, whole songs over 90 s went through a phase vocoder that smeared every kick over about 60 ms and moved single beats by up to 40 ms ("it does not start exactly on the beat"); loops could be up to 15 ms off.
  - The metronome no longer misses the click on the first beat when the computer is busy at the start.
  - A clip that starts right on a kick keeps its full attack (the fade against clicks at the clip start is 2 ms instead of 6 ms).

## 0.18.7

- **Move the playhead by hand:** drag the blue playhead line (or the small triangle on top of it) to any point in the Studio, or click and drag in the bar numbers of the ruler. It snaps to the grid (Alt: free). While the song plays, playback jumps there when you let go. No more pressing Stop to get back.
- **Fix: "'charmap' codec can't encode characters" when making a song** (seen with ACE-Step 1.5): the AI backend wrote its log in the old Windows code page, and a single character outside it (a progress bar of block characters, an arrow, lyrics in Japanese) stopped the song. The backend and its helpers now write UTF-8 and never fail on a character.

## 0.18.6

- **Beat grid, checked against Mixxx and opendj:** a tempo is rounded to a whole (or half) BPM only when the song's kicks really sit on the rounded grid, as in those programs. Before, a song at 124.07 BPM was rounded to 124 and was 50 ms off after three minutes; now it stays at 124.07 (on test tracks within 1–2 ms over three minutes).
- **Warning for songs with an unsteady tempo** (live playing, a drummer without a click): Sync now says which clips should be checked by ear, instead of syncing them silently with a grid that drifts in and out.
- **ACE-Step 1.5 install, third fix:** ACE-Step asks for an old setuptools (<72) while current PyTorch needs a new one (≥77), so pip could find no solution once PyTorch was held. That requirement is now skipped (both versions work). If torchvision still does not match PyTorch ("operator torchvision::nms does not exist"), it is removed: it is only used by training tools, not for making music.
- **Sync several clips together:** select songs, loops or stems in the Studio (Ctrl/Shift+click, drag a frame or Ctrl+A), then click **Sync together** in the selection bar, **AUTO SYNC**, the toolbar's *Sync … selected* or *SYNC the selected clips together* in the right-click menu. Every clip is stretched to the master BPM and beat 1 of each one is put on the same bar line, so they all start together and stay in time. If a song has an intro before its beat 1, all clips move to a later bar so no intro is cut off.

## 0.18.5

- **ACE-Step 1.5 install, second fix:** one of its packages made pip replace the installed PyTorch with an older one that no longer matched torchvision ("operator torchvision::nms does not exist"). PyTorch is now held at its installed version while the packages are installed, a broken PyTorch is repaired by *Install selected*, and torchao / torchcodec are left out if no version of them fits.
- **Beat matching and AUTO SYNC rebuilt like DJ software builds a beat grid:**
  - **Whole songs are synced too.** The Studio stretched only files up to 90 seconds; longer songs kept their own tempo next to the synced grid and drifted away from the metronome ("every song a little different"). Long files are now stretched on the AI backend to the project tempo, exactly to the length the grid expects.
  - **Exact tempo:** after the beat tracker, the tempo is fine-tuned over up to four minutes of the song (the tempo at which its attacks line up best), so 124 is 124 and not 123.6, and real in-between tempos such as 127.3 stay as they are.
  - **Exact phase:** the grid sits on the kick, not on loud off-beat hi-hats (beat trackers often lock half a beat off), and on the attack itself, not a few milliseconds before or after. On test tracks within 1–7 ms (before: up to half a beat).
  - **Bar sync:** the downbeat (beat 1 of a bar, found by its low-end attack) is put on a bar line of the project, not just on any beat.
  - Songs saved earlier are measured again when they are synced (only loops keep their stored tempo).

## 0.18.4

- **ACE-Step 1.5 installs on Windows:** its package list asks for *nano-vllm* (its language model runtime, not on PyPI) and a CUDA build of PyTorch pinned to its own server, so pip stopped with "No matching distribution found for nano-vllm". The install now takes the list without these (the music part used here does not need them), installs PyTorch for your PC, and checks that ACE-Step 1.5 starts.

## 0.18.3

- **Resizable Studio and panel:** drag the line between the Studio and the panel below it (mixer, piano roll, ...) up or down; double-click resets it. The Studio now takes all the height the panel leaves.
- **New-track zone in the Studio:** under the last track there is always a dashed "+ Drag a clip or an audio file here for a new track" area; it lights up while you drag a clip there.
- **Split into stems in the Studio** shows its progress next to the toolbar and uses the graphics-card models when *Fast vocal separation* is installed (else Demucs Fast); the message says where the stems are (new tracks at the bottom, in a group).
- **Piano Roll: select several notes:** draw a frame with the *Select* tool (or Shift+drag with any tool), Shift/Ctrl+click adds or removes a note, **Ctrl+A** selects all notes (after a click in the Piano Roll). Selected notes move and get deleted together, and *Quantize* acts on all of them.
- **Only one app at a time:** starting AI Music Studio again now brings the open window to the front. Before, every start ran its own AI backend (the logs showed three at once), so stem splits and songs waited on each other.
- **ACE-Step 1.5 repair:** its environment lacked NumPy, so it never started. *Install selected* now installs NumPy and checks that ACE-Step 1.5 really starts; the error message says how to repair it.
- **No more hard distortion:** a safety limiter at the end of the master stops many notes or loud clips together from clipping.

## 0.18.2

- **Every new clip gets its own track:** *Studio: synced* / *as is* in the Samples tab no longer put every sample onto the selected track; like *Add to project* in the Library, each one now gets a new audio track.
- **Stem Splitter can be cancelled:** *✕ Cancel* next to the progress bar stops a split (the fast modes at once, Demucs after its current chunk). A split that waits for an earlier one still running now says "Waiting for the previous split to finish…" instead of sitting at 0 %.
- **Drag a clip below the last track** in the Studio: a dashed frame shows "Release here: new audio track" (or MIDI track), and on release the clip moves onto a new track of its kind.
- **Test plan** for systematic testing: [docs/TESTPLAN.md](docs/TESTPLAN.md) (German).

## 0.18.1

- **Stem Splitter: "4 Stems on the graphics card":** vocals, drums, bass and other with four small MDX-Net models that run on the graphics card like *Vocals + Instrumental* (AMD / Intel through DirectML, also the R9 290, and NVIDIA). Much faster than Demucs *Fast* on these cards, a little less clean than *Balanced*. Uses the same *Fast vocal separation* engine; the models download on the first split.
- Release pages show the changelog and the install notes; the donation link is only on the project page ("Buy me a coffee").

## 0.18.0

- **Stem Splitter: "Vocals + Instrumental (fastest)":** a new mode with an MDX-Net model (through audio-separator) that is much faster than Demucs, ideal for karaoke and acapellas. It uses the graphics card on AMD and Intel (DirectX 12 through DirectML, also older cards like the R9 290) and on NVIDIA (CUDA), and falls back to the processor. Install it once in Settings → AI Engines → *Fast vocal separation*; it has its own environment and does not touch the others.
- **Waveform previews:** in the Library (My tracks, Stems, Samples) the real waveform appears under what is playing, and the stem mixer shows the waveform of all stems; click or drag in it to jump anywhere, with the time so far and the length.
- **Demucs "Fast" is quicker:** fewer overlapping chunks (10 % instead of 25 %), with hardly any audible difference.

## 0.17.0

- **Stem mixer in the Stem Splitter:** after splitting, play all stems together and set **Solo**, **Mute** and the **volume** of each stem while listening (double-click a slider: 100 %).
- **Export remix:** mixes the stems you hear at these levels into one file (WAV, AIFF, FLAC or MP3). Mute *Vocals* for a karaoke version, *Drums* for a version without drums; the file is named after what was left out.
- **Audio → MIDI:** *→ MIDI* on a stem (vocals, bass, piano, guitar, other) turns its melody into notes on a new MIDI track and opens it in the Piano Roll. Needs *Audio → MIDI (basic-pitch)* in Settings → AI Engines.

## 0.16.3

- **Stem Splitter with a progress bar:** percent, what it is doing, the time so far and about how long is left. The split runs in the background, so the app stays responsive (also the Studio's *split clip*).
- A hint explains the speed: *Balanced* runs 4 models one after the other; on the processor (also with AMD / Intel graphics, which Demucs cannot use) *Fast* is about 4 times quicker.

## 0.16.2

- **Stem Splitter fixed:** with current PyTorch versions every stem came out as an empty file (shown as "Ready to export"), so *Save to library* said "There were no stem files to save". Audio is now read and written without torchaudio's file functions, the stems keep the song's own level, and a missing Demucs or a failed split shows its reason instead of empty stems.
- **Export:** an empty file now says so instead of "Format not recognised".
- **Library → Stems:** *Open Library → Stems* in the Stem Splitter now opens the Stems tab, and *My tracks* points to the Stems tab when stems are saved.

## 0.16.1

- **Support the project:** Settings → About has a *Donate with PayPal* button, next to the GitHub star. Everything stays free.
- **Cloud Rendering (Pro)** appears in the menu as *Coming soon*: an optional paid extra that renders on fast NVIDIA graphics cards in the cloud. Everything you have now stays free and local.

## 0.16.0

- **Stems are kept and exported properly:** after splitting, *Save to library* puts the stems into their own folder in the Library (tab *Stems*, grouped by song, with tags and tempo). *Export…* writes every stem as its own file in the format your DAW wants: WAV 16/24/32-bit, AIFF, FLAC or MP3.
- **Library with tabs and search:** *My tracks* (songs and loops from Create music, imports), *Stems* and *Samples*. Search by name, tag or BPM (`124`, `120-130`). Tags can be set when creating (Create music → Tags), when saving stems, and later on every item. Every item can be exported. Samples can be copied into the Library (*+ Library*).
- **Loops stay in sync:** loops go into the Studio with their exact tempo and beat 1 at the file start, so AUTO SYNC and *Sync all* no longer measure them again and nudge them off the grid.
- **Cancel stops within seconds:** a model that cannot stop in time (ACE-Step on the CPU) makes the AI engine restart itself.
- **Updates no longer ask you to close the app:** the AI engine and its workers are ended before installing.
- **More graphics cards:** MusicGen medium and large run on AMD / Intel cards with 8 / 16 GB through DirectML (small on any DirectX 12 card).
- **AI assistant: Grok (xAI) and Ollama.** Ollama runs a model on your own PC: free, no account, no key.
- **Settings → About:** project, links, and a request for a GitHub ⭐. Vocal Editor, AI Instruments, Karaoke Export and Video Composer show "Coming soon" until they are finished.
- Windows *Settings → Apps* shows the description, project page and help link.

## 0.15.1

- **Copying text works again:** since 0.14.2 Ctrl+C, Ctrl+A, Ctrl+V and Ctrl+X were taken by the Studio everywhere, so log texts could not be copied. They now copy clips only in the Studio, piano roll and mixer, and never while text is selected or a dialog is open.
- **Right-click menu for text:** Copy / Cut / Paste / Select all on selected text and in text fields.

## 0.15.0

- **ACE-Step 1.5 turbo (experimental): songs with vocals also without a suitable graphics card.** The 2B turbo model needs only 8 steps and runs "DiT only" (without its language model), the mode the project recommends for small machines. On the processor it is slow but works with 16 GB RAM; with an NVIDIA card choose the CUDA variant of PyTorch. Install: *Settings → AI Engines → ACE-Step 1.5* (needs Python 3.11 or 3.12 and Git; the model, about 10 GB, downloads on the first song). Written from the project documentation and not yet tested on real hardware.
- **Code signing prepared** (SignPath Foundation): the release workflow signs the installer as soon as the project is approved.

## 0.14.4

- **MusicGen makes several clips side by side on the CPU:** with more than one song or variation, up to 4 clips are rendered together in one pass (as many as the free memory allows). One clip alone keeps the processor busy only in short bursts, because MusicGen writes one token after the other; clips side by side share every step, so all cores have work and several clips take far less than that many times as long. The graphics card path (DirectML) still makes them one after the other.
- Install notes explain the Windows SmartScreen warning of the unsigned installer.

## 0.14.3

- **The CPU is used fully** when a model runs on the processor: the AI now computes on all CPU threads (hyper-threads included) instead of one per core, and the AI backend runs at below-normal priority so the app and Windows stay responsive. `AMS_CPU_THREADS` still sets another number.
- **Loop titles** say what they are: "Deep house – Loop 124 BPM 4 bars" (in the library and as the track name in the Studio).

## 0.14.2

- **Copy, cut and paste in the Studio** (Ctrl+C, Ctrl+X, Ctrl+V, in the Ableton and the Cubase layout): pasting puts the clips at the playhead and moves the playhead behind them, so pressing Ctrl+V again lines up copies without a gap (ideal for loops). Clips from one track go onto the selected track. Ctrl+D with several clips duplicates all of them.
- **Shortcuts no longer go dead** after choosing a value in a drop-down list (Grid, Count-in, ...) or clicking a button: Space, Ctrl+C and the rest work at once. Space also plays and pauses while a number field (BPM) has the focus.
- Undo no longer leaves a deleted clip selected (Ctrl+X or Delete did nothing afterwards).

## 0.14.1

- **Faster on the CPU:** the AI used at most 4 CPU threads (a 6-core/12-thread CPU sat at about 25 %). It now computes on one thread per physical core (all cores of CPUs without hyper-threading, minus one on CPUs with up to 4 threads). Set the environment variable `AMS_CPU_THREADS` to choose another number.

## 0.14.0

- **Create loop** in Create music: a loop of exactly 1, 2, 4, 8 or 16 bars that starts on beat 1 and repeats seamlessly. The generator renders a little more music than needed; the loop is cut on the beat grid of the tempo the model really played, and the music after the loop end is crossfaded into its start, so copies placed one after the other (Ctrl+D in the Studio) play endlessly without a gap or a click. Loops go into the Studio synced to the project tempo and are saved as FLAC/WAV without fades.

## 0.13.1

- **Cancel button in Create music** (and a ✕ next to the progress in the status bar): stops a running or waiting generation at the next step. External workers (DiffRhythm, the DirectML graphics-card worker) are stopped at once. Songs that were already finished stay in the library.

## 0.13.0

- **Studio works like Ableton and Cubase:** drag a loop in the ruler (seamless wrap), markers and cycle markers, tempo and time-signature changes, multi-select and consolidate, crossfades, volume/pan automation lanes, reverb/delay return tracks with per-track sends, group tracks, loop recording into take lanes with comping, warp markers, count-in, punch in/out, a channel tab, split a clip into stems from the right-click menu, quick export.
- **Shortcuts** for all of the above in both the Ableton Live 12 and the Cubase layout (Settings → Shortcuts).
- **Create music** is translated into German and warns *before* rendering when the chosen model cannot sing.
- **Vocals fix:** lyrics sent to ACE-Step now always carry a vocal tag and a structure tag, which should stop typed lyrics from coming out as an instrumental (still to be confirmed with the real model on an NVIDIA PC).
- **Detailed log for beta testers** in the Feedback dialog (on/off, copy, save as file).
- AI engines are no longer shown as "not installed" when they are.
