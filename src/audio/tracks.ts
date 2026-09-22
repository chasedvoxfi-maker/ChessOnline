import type { MusicTheme } from "./MusicManager";

export interface Track {
  id: string;
  title: string;
  src: string;
}

/**
 * Each theme's playlist. The player picks a random track to start a theme with, and cycles
 * through the rest of the list (looping back to the start) as each track ends — a manual pick
 * (see MusicManager.selectTrack) just moves the cursor, the auto-advance keeps going from there.
 *
 * To add more music: drop additional mp3 files into public/audio/ and add an entry per file
 * here — everything else (random start, cycling, the in-game track picker) picks them up
 * automatically, no other code needs to change.
 */
export const TRACKS: Record<MusicTheme, Track[]> = {
  menu: [{ id: "menu-1", title: "Тема меню", src: "/ChessOnline/audio/menu-music.mp3" }],
  game: [{ id: "game-1", title: "Тема партии", src: "/ChessOnline/audio/game-music.mp3" }],
};
