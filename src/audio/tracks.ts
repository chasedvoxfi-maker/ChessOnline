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
 * A slot whose file doesn't exist in public/audio/ is simply skipped (MusicManager tries the
 * next one), so the menu list below can list all 10 numbered slots up front.
 *
 * To add music for the menu: drop menu-music-N.mp3 (N = 1..10) into public/audio/ — no code
 * change needed, it's picked up automatically (random start, cycling, README has the exact
 * naming). To add more than 10, or more "game" tracks, add an extra { id, title, src } entry
 * per file to the relevant list here.
 */
const MENU_SLOTS = 10;

export const TRACKS: Record<MusicTheme, Track[]> = {
  menu: Array.from({ length: MENU_SLOTS }, (_, i) => ({
    id: `menu-${i + 1}`,
    title: `Тема меню ${i + 1}`,
    src: `/ChessOnline/audio/menu-music-${i + 1}.mp3`,
  })),
  game: [{ id: "game-1", title: "Тема партии", src: "/ChessOnline/audio/game-music.mp3" }],
};
