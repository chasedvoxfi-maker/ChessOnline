import { createCheckerMan } from "./checkerPieceModels";
import type { PieceFactory } from "./meshHelpers";

/** Corners (Уголки) uses plain checker-style discs — every piece moves identically, no kings. */
export const CORNERS_FACTORIES: Record<string, PieceFactory> = {
  p: createCheckerMan,
};
