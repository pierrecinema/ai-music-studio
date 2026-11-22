# Vocal Editor

A melody of a MIDI track is sung with your lyrics. Write the melody in the [[Piano Roll]] (one note per syllable), or turn a sung line into MIDI with [[Audio to MIDI]], then open *Vocal Editor* in the sidebar.

## Sing the melody yourself

Record yourself on an audio track in the [[Studio]], select the clip and press *My singing (Studio clip) → MIDI* (or choose a recording file). The melody lands on a new MIDI track, in the project tempo from where the clip starts, ready for lyrics and *Sing* or for the [[Piano Roll]].

## Three singers

| | Built-in voices | DiffSinger voice (exact) | AI singer (ACE-Step) |
|---|---|---|---|
| Follows the melody | every note | every note: pitch, timing, length | only tempo, key and length |
| Voices | 39 in the app | a voicebank you import | male or female |
| Languages | English, German, Spanish | those of the voice | many |
| Speed on a CPU | about a minute per 5 s of singing | seconds | minutes |
| Needs | *Install the singer* once (about 4 GB) | the voicebank and its vocoder | ACE-Step 1.5 (Settings → AI Engines) |

## Built-in voices

*Built-in voices* is the first choice: nothing to import. The first time, press *Install the singer*: the singing model SoulX-Singer (Apache 2.0) and its own Python environment are downloaded once (about 4 GB, also under Settings → AI Engines → *Singer*). It uses an NVIDIA graphics card when there is one.

- **Voices**: 39 voices of 20 singers with names (Anna, Bella … Adam, Ben …), filtered by *All / Female / Male* and grouped as *clear* (straight, pop), *with vibrato* (ballads, soul) and *powerful* (belt, good for rock). **Click a voice** to choose it and hear it at once: a 16-second song line in its typical style, a finished recording (no computing); click again to stop.
- **Style**: how the line is sung, and the effects of the new vocal track (*Put the style's effects on the new vocal track*, on by default):

| Style | Way of singing | Effects on the track |
|---|---|---|
| Pop | light vibrato, small slides | high-pass, compressor, EQ, short delay, reverb |
| Rock | hard attacks, sliding up into the notes, shorter notes, a fall at the end of phrases | high-pass, saturation, strong compressor, EQ with presence, short reverb |
| Ballad | lots of vibrato, legato (short gaps are filled) | high-pass, gentle compressor, delay, long reverb |
| Soul | turns and slides into long notes, vibrato | high-pass, light saturation, compressor, warm EQ, reverb |
| Rap | performed by the AI singer (see below) | high-pass, compressor, EQ, light saturation, short reverb |

- **Rap**: the built-in voices sing; rapping needs a model that really raps, so the style *Rap* has the AI singer (ACE-Step 1.5) rap the lyrics in the song's tempo (lyrics from the lyrics field or, if it is empty, from the notes). The chosen voice decides male or female. It takes a few minutes and follows the rhythm and words, not every note.
- *Best quality* off sings about twice as fast, a little less clean.
- Words the voice does not know are sung as "ah" and named afterwards.

The voices are short recordings of singers from **VocalSet** (Julia Wilkins, Prem Seetharaman, Alison Wahl, Bryan Pardo, 2018, doi:10.5281/zenodo.1442513, CC BY 4.0); the singing model is **SoulX-Singer** by Soul AI Lab (Apache 2.0).

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
