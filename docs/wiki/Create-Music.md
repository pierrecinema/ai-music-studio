# Create Music ✨

Make songs and loops with AI on your own PC. Two modes at the top: **Simple** (style, lyrics, Create) and **Studio** (all settings). Every result is saved to the [[Library]] at once.

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
- **Title** and **Style:** describe genre, mood, instruments, tempo. ✨ lets the AI improve the style text.
- **Tags:** for searching in the [[Library]] later (separate with commas).

## Lyrics
- **Instrumental**, or **A cappella (voice only)**: only the singing, no instruments (the app removes leftover sounds with Demucs). Needs a model that can sing.
- **Language**, **Voice** (any / male / female).
- **Lyrics:** the buttons **[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro]** insert a section at the cursor; **Auto structure** turns stanzas (separated by an empty line) into verses and choruses; lyrics without sections are structured automatically. ✨ lets the AI write lyrics.
- **🎤 Preview voices (3 × 20 s):** three short takes of the voice alone (a cappella, no music), each singing your first lines with another voice (ACE-Step). The model is loaded once for all three. **Use this voice** fixes it (its seed) for the whole song; similar, but not always identical, because the song is longer.

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
- **Find LoRA on Hugging Face…:** search, see license, likes and downloads, check if it fits the engine, **Download** with progress.
- **Which LoRA fits which model:** ACE-Step v1 uses LoRAs made for v1. **ACE-Step 1.5 turbo** uses LoRAs made for ACE-Step 1.5 (a folder with `adapter_config.json`); LoRAs for the larger **XL** model ("xl" in the name) do not fit turbo and are left out with a note.
- **Train your own LoRA…:** choose a folder of songs you own, describe each one, choose length and rank; trains on an NVIDIA card or builds a ZIP bundle for another PC.

## Quality and Advanced
Steps, songs × variations, queue, seed; language-model level, rendering, LoRA per layer, output format (FLAC / MP3 / WAV), fade in/out.

## Create, cancel, results
- **Create** starts; one job at a time, in the background. The progress shows the phase, percent, time left and what is used (graphics card or processor). It stays visible in the bottom bar when you switch menus.
- **✕ Cancel** stops within seconds; finished songs of the job are kept.
- **Results:** play, rename (name field above the player), **Into project** (onto new tracks in the [[Studio]]). Every song is cut to start exactly on beat 1.
