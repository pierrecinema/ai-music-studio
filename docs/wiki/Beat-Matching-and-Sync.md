# Beat Matching and Sync

Like SYNC in DJ software, two things must match: the **tempo** (every clip runs at the master BPM) and the **phase** (its beats fall exactly on the beats of the project, and beat 1 of its bar on a bar line).

## How a song is measured
When audio comes into the [[Studio]], the app builds a beat grid, like DJ programs (the approach follows Mixxx and opendj):
1. **Tempo:** the beat tracker's beats, fitted with one straight line, then fine-tuned over up to four minutes of the song. A whole (or half) BPM is taken only when the kicks really sit on it: 124 stays 124, a real 124.07 stays 124.07.
2. **Phase:** the grid sits on the kick and bass, not on loud off-beat hi-hats, and on the attack itself.
3. **Downbeat:** of the four beats of a bar, the one with the strongest low-end attack is beat 1.
4. **Steady or not:** if the tempo moves (live playing, a drummer without a click), the app says so: check those clips by ear; warp markers can pin beats that drift.

Synced clips show their grid as white lines on the waveform (every 4th line stronger).

**Stretching beat by beat:** a synced clip is cut at every beat of its grid and each piece is stretched on its own (like the *Beats* warp mode of DAWs), without changing the pitch. Every kick lands within 1 ms of its beat, also in whole songs.

## The controls
| Where | Control | What it does |
|---|---|---|
| [[Top Bar]] | **AUTO SYNC** | On: all audio is synced to the master BPM now, and every new audio automatically. The master tempo is never changed by it |
| [[Top Bar]] | **AUTO SYNC with several clips selected** | Syncs the selected clips **together**: stretched to the master BPM, beat 1 of each on the **same bar**, so they start together and stay in time |
| Studio toolbar | **Sync all to … BPM** | Measures every audio clip not synced yet and syncs it; one-shots and free rhythm are skipped with a reason |
| Studio toolbar | **Sync N selected to … BPM** | Same as *Sync together*, for the selection |
| Selection bar | **Sync together (N)** | Same, appears when two or more audio clips are selected |
| Right-click a clip | **SYNC to the master BPM** | Stretch this clip and put its bar 1 on a bar line |
| Right-click a clip | **Make this the MASTER tempo** | The project takes the tempo of this clip; synced clips follow |
| Clip bar | **Tempo field, ÷2 / ×2** | Correct a wrong tempo by hand; the clip is stretched again |
| Studio toolbar | **Beat match…** | Shows the beat-matching card for the selected clip |

## The beat-matching card
Appears for new audio when AUTO SYNC is off: **Sync to … BPM** (stretch to the project), **Set project to … BPM** (best for the first audio of a project), **Put the first beat on the grid**, **÷2 / ×2**, **Keep as is**, and whether the app should ask every time, sync automatically, or never offer.

## Several songs or loops starting together
1. Put the songs, loops or stems into the [[Studio]] (each on its own track).
2. Select them: Ctrl+A, or drag a frame, or Ctrl/Shift+click.
3. Click **Sync together** (or AUTO SYNC). All are stretched to the master BPM and start together on one bar. If a song has an intro before its beat 1, all move to a later bar so no intro is cut off.

Everything can be undone with Ctrl+Z.
