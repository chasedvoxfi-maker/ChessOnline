Drop your own tracks here to replace the generated ambient music:

- `menu-music-1.mp3` … `menu-music-20.mp3` — the main menu's playlist
- `game-music-1.mp3` … `game-music-20.mp3` — the in-game playlist

All are optional. If a file is missing, that theme just falls back to the built-in generative
music automatically — nothing else needs to change, and a missing numbered slot is silently
skipped rather than breaking the rest of the playlist.

## Adding tracks (up to 20 per theme, no code change)

`src/audio/tracks.ts` already declares all 20 numbered slots for both the main menu and the
in-game theme. To add a track, just drop an mp3 named `menu-music-N.mp3` or `game-music-N.mp3`
(N = 2, 3, … up to 20) in this folder and commit it — that's it.

The main menu shuffles its available tracks into a fresh random order every time it starts (page
load, and again each time you go back to it after a game), reshuffling once the order runs out
so a lap never repeats the same sequence. The in-game playlist instead plays straight through in
numbered order (game-1, game-2, …), looping back to the start — a match auto-advances to the
next track as each one ends, no waiting needed.

To add a 21st+ track for either theme, add an extra `{ id, title, src }` entry to the relevant
list in `src/audio/tracks.ts` yourself.

## Uploading tracks from the app

The Settings screen (gear icon → "Музыка") also has a "+ Добавить трек" button per playlist that
lets a player upload an mp3 straight from their phone/tablet/computer, no repo change needed.
Those tracks are stored in the browser's IndexedDB, so they survive a reload — but only in that
one browser; they're never uploaded anywhere and won't show up on another device.

The in-game HUD also has a persistent ◀ ▶ widget under the menu button, plus a skip (⏭) button
next to the track picker in the menu itself, both for jumping straight to the next/previous
track without waiting for the current one to end.
