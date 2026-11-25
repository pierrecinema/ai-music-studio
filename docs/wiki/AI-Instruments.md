# AI Instruments

Musicians for your song (menu **🎻 AI Instruments**, new in 0.80).

## The stage (0.99.11)

The musicians stand on a lit **stage**: **Composer** (song generator), **Drummer**, **Bass player**, **Guitarist**, **Orchestra** and **AI soloist** (text instrument). Those already in your song glow and say *● in your song*. **Click a musician** and their desk opens below:

- **left:** who they are and what each control does (ⓘ);
- **middle:** their own device (each with its own look);
- **right:** **▶ Preview** (hear it before it goes into the song: the band the first 4 bars, the composer the chorus, the orchestra a demo of the instrument, the AI soloist the notes it will play), **▶ The whole band** (drums, bass and guitar together), **✦ 3 ideas** (three suggestions, each with ▶ to listen and *Take* to use it), **+ Add to the song** and, for the band, **✦ Add and AI render (real sound)**: the part is added and the music AI (ACE-Step) plays it as a real-sounding recording on a new audio track; the MIDI track is muted (minutes without an NVIDIA card; the progress stays under the buttons and it goes on when you leave the page).

The settings of each musician are kept while you look at another one.

The devices: the drummer shows its pattern as a step grid, bass player and guitarist a mini piano roll, all updated as you turn the knobs:
turn a **knob** by dragging it up or down (Shift: finer, mouse wheel, arrow keys; double-click: back to its default),
step through an **LCD** with ◀ ▶ or click it for the list. With the AI assistant closed the page uses the whole width.

## Sound packs: real instruments (every PC)

The song generator, the band and every MIDI track sound much better with the **sound packs**: recorded instruments instead of the simple synthesizer. Install them once in [[Settings]] → *Audio* → *Sound packs* (or with **Install** at the top of this page while none is installed): **Band** (a recorded drum kit with soft and hard hits, electric bass, electric, acoustic and nylon guitar: the AI band plays them, about 47 MB), **Salamander Grand Piano** (concert grand, 22 MB), **VSCO-2 Orchestra** (strings and brass, about 330 MB), **MuseScore General** (48 MB) and **GeneralUser GS** (28 MB). The best installed pack plays each instrument; the instrument list in the Studio shows which one. The song generator then picks a band for each genre (for example funk: clavinet, slap bass, brass section; jazz: alto sax, upright bass, piano, jazz kit; ballad: piano, strings, brushes) and sets a first mix: levels per part and a little room reverb. Any track can switch to another instrument in the Studio: *Channel → Instrument*.

## Song generator (0.81, every PC)

A whole song as MIDI. Choose the **genre** (pop, rock, ballad, house, tech house, afro house, trap / rap, funk,
reggaeton, jazz, reggae, metal), the **key**, **major or minor** and the **tempo** (knob; the genre sets a typical one).
The coloured strip shows the form (intro, verse, pre-chorus, chorus, bridge or drop, outro) and the line under it the
length and the first chords. **Parts** switch melody, keys, bass, drums and guitar on or off.

**Make the song in the Studio** adds one MIDI track per part after what is already in the project, sets the project
tempo (switch) and puts a marker at each part (switch). The chords of a part stay the same each time it comes back;
the melody follows them and sits higher in the chorus; the band plays louder in the chorus and the drop.
**🎲 Take** makes another version. Every part can be edited in the [[Piano Roll]] and played by any built-in sound or
VST instrument, or by the AI orchestra below.

## Virtual band (every PC, nothing to install)

A **drummer**, a **bass player** and a **guitarist** play along with your song.

1. **Chords:** *From the song* reads the chords of your MIDI tracks bar by bar (drum tracks are left out), or choose
   *Type them* and write them in the field marked *Chords (type here)*: `Am F C G`, `C | G Am | F -` (`|` separates bars, two chords in a bar share it, `-` holds
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

Describe the instrument or style in the field *Instrument / style (type here)*, or click one of the suggestions (*electric guitar, overdrive*, *jazz piano trio*, *sitar*, *string orchestra* …):
ACE-Step plays your MIDI track in it. The MIDI track is first played by the built-in sound as a guide, then ACE-Step
makes a cover of it. **Follow the notes**: low lets the AI play freely in the style, high keeps it close to your notes
and timing. Needs the ACE-Step engine ([[Settings]] → AI Engines → Music generator (ACE-Step)); fast with an NVIDIA
graphics card, very slow on the processor (the page says so). The result is an audio track in the Studio and in the
Library.
