export type Square = string; // e.g. "e4"
export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface PieceInfo {
  type: PieceType;
  color: PieceColor;
  square: Square;
}

export interface MoveResult {
  from: Square;
  to: Square;
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  promotion?: PieceType;
  san: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
}

export type GameMode = "hotseat" | "ai" | "online";

export interface GameOverInfo {
  winner: PieceColor | null; // null = draw
  reason: "checkmate" | "stalemate" | "draw" | "resign" | "timeout" | "disconnect";
}

export type Difficulty = "easy" | "medium" | "hard" | "master";
