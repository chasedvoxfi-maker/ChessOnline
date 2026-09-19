import type { Difficulty, GameMode } from "./types";

export interface SavedGameState {
  mode: Extract<GameMode, "hotseat" | "ai">;
  difficulty?: Difficulty;
  fen: string;
  savedAt: number;
}

const STORAGE_KEY = "chessonline-save-v1";

export function saveGame(state: SavedGameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private browsing, quota) — saving is best-effort only
  }
}

export function loadSavedGame(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameState;
    if (!parsed.fen || (parsed.mode !== "hotseat" && parsed.mode !== "ai")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
