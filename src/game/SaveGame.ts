import type { Difficulty } from "./types";
import type { CheckerPiece, PieceColor } from "../checkers/CheckersGame";
import type { CornersPiece, CornersFormation } from "../corners/CornersGame";

export type GameKind = "chess" | "checkers" | "corners";

export interface SavedGameState {
  kind: GameKind;
  mode: "hotseat" | "ai";
  difficulty?: Difficulty;
  savedAt: number;
  chess?: { fen: string };
  checkers?: { pieces: CheckerPiece[]; turn: PieceColor };
  corners?: { pieces: CornersPiece[]; turn: PieceColor; formation: CornersFormation };
}

function storageKey(kind: GameKind) {
  return `chessonline-save-${kind}-v1`;
}

export function saveGame(state: SavedGameState) {
  try {
    localStorage.setItem(storageKey(state.kind), JSON.stringify(state));
  } catch {
    // storage unavailable (private browsing, quota) — saving is best-effort only
  }
}

export function loadSavedGame(kind: GameKind): SavedGameState | null {
  try {
    const raw = localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameState;
    if (parsed.kind !== kind || (parsed.mode !== "hotseat" && parsed.mode !== "ai")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedGame(kind: GameKind) {
  try {
    localStorage.removeItem(storageKey(kind));
  } catch {
    // ignore
  }
}
