# Create Music ✨

Make songs and loops with AI on your own PC. Two modes at the top right: **Simple** (style, lyrics, Create) and **Studio** (all settings). Every result is saved to the [[Library]] at once.

## The page
- **Header:** the music model and its state (green dot: ready), Simple / Studio.
- **Song** (left): title, tags for the Library, the style, genre suggestions and the **lyrics editor** with line numbers (section lines such as [Verse] in colour). Above it: *With music / Instrumental / A cappella*, 🎤 voice preview, ✦ auto structure, ✨ AI lyrics. Below it: buttons that insert a section at the cursor.
- **Parameters** (right): model, compute, precision, length, tempo and key, time, language, voice, singer, loop, steps, takes (songs × variations × queue) and seed. Everything rarely changed (LoRA, source and reference, language model and rendering settings, output) is under **Advanced**.
- **Takes** (below): every song of this session as a row with its waveform (click to play from there), its name (click to rename), seed, and → Studio, Master, Stems, → MIDI. A song being made shows its stages, the time left and what the computer is doing.
- **Render bar** (bottom): **Create** (while making: **Stop**), where the songs go (*Library only* or *New track(s) in the Studio*) and the progress.

## Song
- **Music model:** the AI model, each rated for your PC (runs well / slow here / not possible):

| Model | Can do |
|---|---|
| ACE-Step v1 | full songs with vocals, up to 10 minutes, LoRA |
| ACE-Step 1.5 turbo (experimental) | songs with vocals from your lyrics; the small model also runs on the processor (slow, but works with 16 GB RAM) |
| MusicGen small / medium / large | instrumentals; longer tracks are built in 30-second steps with crossfaded seams. Small runs on old PCs and on AMD/Intel graphics cards |
| AudioLDM 2, MusicLDM | short instrumental clips (research models) |
| DiffRhythm 1.2 (experimental) | songs with vocals in one step, NVIDIA 8 GB+ only |

- **Compute:** automatic, graphics card or processor (for models that can use the graphics card).
- **Precision** (ACE-Step): *automatic* uses bf16 on NVIDIA RTX 30 cards and newer and fp32 on older ones (GTX 900 / 1000 / 1600, RTX 20), which cannot compute bf16. *fp32* works on every card but needs more memory. If an older card still fails with a bf16 error, the app loads the model again in fp32 by itself.
- **Title** and **Style:** describe genre, mood, instruments, tempo. ✨ lets the AI improve the style text.
- **Tags:** for searching in the [[Library]] later (separate with commas).

## Lyrics
- **Instrumental**, or **A cappella (voice only)**: only the singing, no instruments (the app removes leftover sounds with Demucs). Needs a model that can sing.
- **Language**, **Voice** (any / male / female).
- **Singer (Vocal Editor)**: a list of its own with the built-in voices of the Vocal Editor (women and men). Choose one and the song is sung in that voice: the music model makes the song with a singer of the same sex, then the vocals are separated from the music and turned into the chosen voice (voice exchange with Seed-VC: words, melody and timing stay as sung), and mixed back at the same level. Takes a few minutes more per song (on the processor about 15 minutes per minute of song, much faster with an NVIDIA card). Needs **Settings → AI Engines → Voice exchange** (installs the singer too, about 2.4 GB more). If the song has no vocals or the exchange fails, the song keeps the music model's voice and a note says why.
- **Lyrics:** the buttons **[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro]** insert a section at the cursor; **Auto structure** turns stanzas (separated by an empty line) into verses and choruses; lyrics without sections are structured automatically. ✨ lets the AI write lyrics.
- **🎤 Preview voices (3 × 10 s):** three short takes of the voice alone (a cappella, no music), each singing your first two lines with another voice (ACE-Step). The model is loaded once for all three. **Use this voice** fixes it (its seed) for the whole song; similar, but not always identical, because the song is longer.

## Song parameters
Length (seconds), BPM, key, time signature. **Auto** leaves it to the model; **Complete the metadata** fills the fields with AI.

## Loop
Switch on **Create loop**, choose **1, 2, 4, 8 or 16 bars** and the BPM (empty = 120). The result is exactly that long, starts on beat 1 and repeats without a gap or click. It is named like *"Deep house – Loop 124 BPM 4 bars"*. In the [[Studio]], **Ctrl+D** puts copies right behind it, exactly on the bars.

## Source and reference
A source track for a cover or remix, and a reference for the sound.

## LoRA
Style or sound add-ons for ACE-Step:
- The **+ Add LoRA** list shows the LoRAs that fit the chosen model; LoRAs made for another model (v1 or XL) are greyed out with the reason. The backend decides, with the same check it uses to load them (PEFT folders, LoKr files, packs).
- **Import LoRA file… / folder…** (`.safetensors`, `.pt`, `.bin`), **+ Add LoRA**, strength slider. One LoRA is used per run (the strongest).
- **Find LoRA on Hugging Face…:** search, see license, likes and downloads, check if it fits the engine, **Download** with progress. An ACE-Step 1.5 LoRA is saved as a folder with its `adapter_config.json`; one downloaded before 0.30.6 as a single file gets its config fetched (or written from the weights) the first time it is used.
- **Which LoRA fits which model:** ACE-Step v1 uses LoRAs made for v1. **ACE-Step 1.5 turbo** uses LoRAs made for ACE-Step 1.5 (a folder with `adapter_config.json`); LoRAs for the larger **XL** model ("xl" in the name) do not fit turbo and are left out with a note.
- **Train your own LoRA…:** choose a folder of songs you own, describe each one, choose length and rank; trains on an NVIDIA card or builds a ZIP bundle for another PC.

## Quality and Advanced
Steps, songs × variations, queue, seed; language-model level, rendering, LoRA per layer, output format (FLAC / MP3 / WAV), fade in/out.

## Create, cancel, results
- **Create** starts; one job at a time, in the background. The progress shows the phase, percent, time left and what is used (graphics card or processor). It stays visible in the bottom bar when you switch menus.
- **✕ Cancel** stops within seconds; finished songs of the job are kept.
- **Results** (newest on top, the first take at the bottom): play, rename (name field above the player), **Into project** (onto new tracks in the [[Studio]]), **Mastering** (opens it in [[Mastering]]), **Stem Splitter** (opens it in the [[Stem Splitter]], ready to split). Every song is cut to start exactly on beat 1.
