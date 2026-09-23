import type { MusicTheme } from "./MusicManager";

export interface Track {
  id: string;
  title: string;
  src: string;
}

/**
 * Each theme's playlist. MusicManager shuffles a theme's list into a fresh random play order
 * every time that theme is (re)entered, and reshuffles again once the order is exhausted — a
 * manual pick (see MusicManager.selectTrack) or the in-game skip button just moves the cursor
 * within that order. A slot whose file doesn't exist in public/audio/ is simply skipped
 * (MusicManager tries the next one), so both lists below can list all 20 numbered slots up
 * front regardless of how many are actually filled in.
 *
 * To add music: drop menu-music-N.mp3 or game-music-N.mp3 (N = 1..20) into public/audio/ — no
 * code change needed, it's picked up automatically (README has the exact naming). To add more
 * than 20 for either theme, add an extra { id, title, src } entry to the relevant list here.
 */
const SLOTS_PER_THEME = 20;

function numberedSlots(theme: "menu" | "game", label: string): Track[] {
  return Array.from({ length: SLOTS_PER_THEME }, (_, i) => ({
    id: `${theme}-${i + 1}`,
    title: `${label} ${i + 1}`,
    src: `/ChessOnline/audio/${theme}-music-${i + 1}.mp3`,
  }));
}

export const TRACKS: Record<MusicTheme, Track[]> = {
  menu: numberedSlots("menu", "Тема меню"),
  game: numberedSlots("game", "Тема партии"),
};
