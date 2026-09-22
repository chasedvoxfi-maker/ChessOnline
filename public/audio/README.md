Drop your own tracks here to replace the generated ambient music:

- `menu-music-1.mp3` … `menu-music-10.mp3` — the main menu's playlist (see below)
- `game-music.mp3` — plays during a game

All are optional. If a file is missing, that theme just falls back to the built-in generative
music automatically — nothing else needs to change, and a missing numbered slot is silently
skipped rather than breaking the rest of the playlist.

## Adding menu tracks (up to 10, no code change)

`src/audio/tracks.ts` already declares all 10 numbered slots for the main menu. To add a track,
just drop an mp3 named `menu-music-N.mp3` (N = 2, 3, … up to 10) in this folder and commit it —
that's it. On each page load, one track from whichever slots actually exist is picked at random
to start, then the rest cycle through as each one ends.

To add an 11th+ track, or more than one `game` track, add an extra `{ id, title, src }` entry to
the relevant list in `src/audio/tracks.ts` yourself.

## Uploading tracks from the app

The Settings screen (gear icon → "Музыка") also has a "+ Добавить трек" button per playlist that
lets a player upload an mp3 straight from their phone/tablet/computer, no repo change needed.
Those tracks are stored in the browser's IndexedDB, so they survive a reload — but only in that
one browser; they're never uploaded anywhere and won't show up on another device.
