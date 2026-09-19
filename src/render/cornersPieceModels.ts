import { createPawn } from "./pieceModels";
import type { PieceFactory } from "./meshHelpers";

/** Corners (Уголки) uses plain pegs — the same pawn silhouette as chess, since every piece moves identically. */
export const CORNERS_FACTORIES: Record<string, PieceFactory> = {
  p: createPawn,
};
