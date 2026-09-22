Drop your own tracks here to replace the generated ambient music:

- `menu-music.mp3` — plays on the main menu
- `game-music.mp3` — plays during a game

Both are optional. If a file is missing, that theme just falls back to the built-in generative music automatically — nothing else needs to change.

To add more than one track per theme (a real playlist — a random track starts each theme, and
it cycles through the rest as each one ends), drop the extra mp3s in here too and register each
one in `src/audio/tracks.ts`. The in-game menu's track picker (and the random start) both read
from that same list automatically.
