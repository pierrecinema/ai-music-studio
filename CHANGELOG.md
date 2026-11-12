# Changelog

What changed in each version of AI Music Studio. The release workflow puts the section of the released version
on its GitHub release page, so every version needs a `## <version>` section here before it is released.

## 0.18.3

- **Resizable Studio and panel:** drag the line between the Studio and the panel below it (mixer, piano roll, ...) up or down; double-click resets it. The Studio now takes all the height the panel leaves.
- **New-track zone in the Studio:** under the last track there is always a dashed "+ Drag a clip or an audio file here for a new track" area; it lights up while you drag a clip there.
- **Split into stems in the Studio** shows its progress next to the toolbar and uses the graphics-card models when *Fast vocal separation* is installed (else Demucs Fast); the message says where the stems are (new tracks at the bottom, in a group).
- **Piano Roll: select several notes:** draw a frame with the *Select* tool (or Shift+drag with any tool), Shift/Ctrl+click adds or removes a note, **Ctrl+A** selects all notes (after a click in the Piano Roll). Selected notes move and get deleted together, and *Quantize* acts on all of them.
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
