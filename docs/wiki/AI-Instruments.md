# AI Instruments

Musicians for your song (menu **🎻 AI Instruments**, new in 0.80). Three parts on one page:

## Virtual band (every PC, nothing to install)

A **drummer**, a **bass player** and a **guitarist** play along with your song.

1. **Chords:** *From the song* reads the chords of your MIDI tracks bar by bar (drum tracks are left out), or choose
   *Typed* and write them: `Am F C G`, `C | G Am | F -` (`|` separates bars, two chords in a bar share it, `-` holds
   the chord). Chords like `Am`, `F`, `C#m7`, `Bb`, `G7`, `Fmaj7`, `Dsus4`, `E5`, `F/A` are understood. The line under
   it shows what the players will play.
2. **Where:** from which bar, for how many bars. **🎲 Take** makes the players play the part a little differently.
3. Pick a style for each player and press **Add to the Studio**, or **Add the whole band**.

| Player | Styles | Settings |
|---|---|---|
| 🥁 Drummer | Rock, Pop, Hip-hop / boom bap, Trap, House, Tech house, Afro house, Funk, Reggaeton, Drum & bass, Ballad, Jazz (swing), Bossa nova, Metal, Disco | Intensity (sparse … busy), Feel (exact … loose), Swing, Fills every 4 / 8 bars or none; a crash on the first bar and after each fill |
| 🎸 Bass player | Long notes, Rock eighths, Root and fifth, Octaves (disco), Walking bass (jazz), Funk, House (offbeat), 808 (trap), Reggae (one drop), Afro house | Intensity |
| 🎸 Guitarist | Strumming, Ballad, Fingerpicking, Power chords (rock), Funk scratch, Reggae / ska, Afro / highlife picking, Jazz comping | Intensity, Distorted guitar |

Each player becomes a new **MIDI track** with one clip: edit it in the [[Piano Roll]], move it, copy it. It plays with
a built-in sound (drum kit, bass, clean or distorted guitar, 808): change it in **Channel → Instrument** to another
built-in sound or any VST instrument. Swing set at the drummer also swings the bass and the guitar.

The **singer** comes with the Vocal Editor (0.90).

## AI orchestra (MIDI-DDSP)

A MIDI track played by AI like a real musician. **MIDI-DDSP** (Google Magenta, Apache 2.0) was trained on recordings
of real players: it decides how each note is played (bow, breath, vibrato, swell, attack) and makes the sound.
13 instruments: violin, viola, cello, double bass, flute, oboe, clarinet, saxophone, bassoon, trumpet, French horn,
trombone, tuba. It runs on the processor: no graphics card needed.

- Install once: [[Settings]] → AI Engines → **AI Instruments (MIDI-DDSP)** → Install selected (about 1.5 GB, needs
  Python 3.10 or 3.11). The models (about 80 MB) come from GitHub.
- Choose the **MIDI track** and the **instrument**. Notes outside the instrument's range are moved by octaves
  (a hint shows how many), or use **Transpose**.
- **Vibrato, Dynamics, Brightness, Attack** change how the AI plays; **Velocity** sets how much the velocities of
  your notes count.
- **Players for chords:** the instrument plays one note at a time; chords are spread over this many players
  (like a section).
- **Play with the AI instrument:** the result is a new **audio track** under the others, starting at the bar of the
  first note, and it is kept in the [[Library]] (folder *AI Instruments*). *Mute the MIDI track afterwards* is on by
  default. A minute of music takes a few minutes on an older processor.

In the [[Studio]], **Channel → 🎻 AI instrument…** opens this page with that track chosen.

## Any instrument by text (ACE-Step cover)

Describe the instrument or style (*electric guitar, overdrive*, *jazz piano trio*, *sitar*, *string orchestra* …):
ACE-Step plays your MIDI track in it. The MIDI track is first played by the built-in sound as a guide, then ACE-Step
makes a cover of it. **Follow the notes**: low lets the AI play freely in the style, high keeps it close to your notes
and timing. Needs the ACE-Step engine ([[Settings]] → AI Engines → Music generator (ACE-Step)); fast with an NVIDIA
graphics card, very slow on the processor (the page says so). The result is an audio track in the Studio and in the
Library.
