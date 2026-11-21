# Vocal Editor

A melody of a MIDI track is sung with your lyrics. Write the melody in the [[Piano Roll]] (one note per syllable), or turn a sung line into MIDI with [[Audio to MIDI]], then open *Vocal Editor* in the sidebar.

## Two singers

| | DiffSinger voice (exact) | AI singer (ACE-Step) |
|---|---|---|
| Follows the melody | every note: pitch, timing, length | only tempo, key and length |
| Languages | those of the voice (English, German, Spanish with the right voicebank) | many |
| Speed on a CPU | seconds | minutes |
| Needs | a DiffSinger voicebank you import, and its vocoder | ACE-Step 1.5 (Settings → AI Engines) |

## DiffSinger voices

Voices are not part of the app: each one belongs to its author, who sets its terms (for example: name the voice when you publish, ask before commercial use). Search for "DiffSinger voicebank OpenUtau", download the .zip, read and accept its terms, then *Import a voice…*. Examples: *Nishiren* (English, Japanese; German, Spanish and more through cross-lingual synthesis), *Tiger* (English, Spanish). The voice's readme and terms show under *Terms and notes of the voice*.

A voice also needs its **vocoder** (turns the voice model into sound): *Install the vocoder* downloads it once. These vocoders are made by OpenVPI under CC BY-NC-SA 4.0, a non-commercial component.

Voices with their own timing, pitch and expression models (folders `dsdur`, `dspitch`, `dsvariance`) sing more naturally; simple voices get their timing and pitch from the notes, with an adjustable vibrato.

## Lyrics

1. Choose the language (English, German, Spanish; or *Phonemes* to type the voice's own phonemes, e.g. `l a`).
2. Write the lyrics and press *Put the lyrics on the notes*: each word goes on its first note, and a note with `+` holds a further syllable (the word is pronounced with a dictionary and, for unknown words, a small model, both from OpenUtau, MIT).
3. Check the syllables under *Notes and syllables* and correct them; they are saved with the project and shown in the Piano Roll.
4. *Sing*: the vocals land on a new track in the Studio, in time with the song. Syllables the voice cannot sing are named.

The pronunciation follows OpenUtau's DiffSinger renderer: consonants sound just before the note, the vowel starts on it.
