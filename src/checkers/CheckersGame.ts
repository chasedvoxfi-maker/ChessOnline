export type PieceColor = "w" | "b";
export type CheckerPieceType = "m" | "k"; // man, king ("dama")

export interface CheckerPiece {
  type: CheckerPieceType;
  color: PieceColor;
  square: string;
}

export interface CheckersMoveOption {
  to: string;
  /** Every landing square of the move, in order (length 1 for a simple step). */
  path: string[];
  /** Squares of pieces captured along the way, in order. Empty for a simple step. */
  captured: string[];
}

export interface CheckersMoveResult extends CheckersMoveOption {
  from: string;
  color: PieceColor;
  promoted: boolean;
  isCapture: boolean;
}

export interface CheckersGameOverInfo {
  winner: PieceColor;
  reason: "no-moves" | "no-pieces";
}

function fileOf(sq: string) {
  return sq.charCodeAt(0) - 97;
}
function rankOf(sq: string) {
  return parseInt(sq[1], 10) - 1;
}
function toSquare(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

type Board = Map<string, { type: CheckerPieceType; color: PieceColor }>;

const DIRECTIONS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Russian draughts (шашки) rules engine: 8x8, 12 men per side, mandatory captures with chaining, flying kings. */
export class CheckersGame {
  private board: Board = new Map();
  private turn: PieceColor = "w";
  private history: { board: Board; turn: PieceColor }[] = [];
  private gameOverInfo: CheckersGameOverInfo | null = null;

  constructor() {
    this.reset();
  }

  reset() {
    this.board = new Map();
    for (let rank = 0; rank < 3; rank++) {
      for (let file = 0; file < 8; file++) {
        if ((file + rank) % 2 === 0) this.board.set(toSquare(file, rank)!, { type: "m", color: "w" });
      }
    }
    for (let rank = 5; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        if ((file + rank) % 2 === 0) this.board.set(toSquare(file, rank)!, { type: "m", color: "b" });
      }
    }
    this.turn = "w";
    this.history = [];
    this.gameOverInfo = null;
  }

  loadState(pieces: CheckerPiece[], turn: PieceColor) {
    this.board = new Map(pieces.map((p) => [p.square, { type: p.type, color: p.color }]));
    this.turn = turn;
    this.history = [];
    this.gameOverInfo = null;
  }

  get currentTurn(): PieceColor {
    return this.turn;
  }

  get(square: string): { type: CheckerPieceType; color: PieceColor } | undefined {
    return this.board.get(square);
  }

  pieces(): CheckerPiece[] {
    return [...this.board.entries()].map(([square, p]) => ({ ...p, square }));
  }

  private cloneBoard(board: Board): Board {
    return new Map(board);
  }

  /** All legal moves for `square`, respecting the mandatory-capture rule for the whole side. */
  legalMovesFrom(square: string): CheckersMoveOption[] {
    const piece = this.board.get(square);
    if (!piece || piece.color !== this.turn) return [];

    const anyCapture = this.sideHasCapture(this.turn);
    const captures = this.findCaptures(square, piece.color, piece.type, this.board, [], []);
    if (anyCapture) return captures;
    if (captures.length > 0) return captures; // shouldn't happen given anyCapture, but stay consistent
    return this.findSimpleMoves(square, piece.color, piece.type, this.board);
  }

  private sideHasCapture(color: PieceColor): boolean {
    for (const [square, piece] of this.board) {
      if (piece.color !== color) continue;
      if (this.findCaptures(square, piece.color, piece.type, this.board, [], []).length > 0) return true;
    }
    return false;
  }

  private findSimpleMoves(square: string, color: PieceColor, type: CheckerPieceType, board: Board): CheckersMoveOption[] {
    const f0 = fileOf(square);
    const r0 = rankOf(square);
    const out: CheckersMoveOption[] = [];
    const forward = color === "w" ? 1 : -1;

    for (const [df, dr] of DIRECTIONS) {
      if (type === "m" && dr !== forward) continue; // men only step forward
      if (type === "m") {
        const to = toSquare(f0 + df, r0 + dr);
        if (to && !board.has(to)) out.push({ to, path: [to], captured: [] });
      } else {
        let f = f0 + df;
        let r = r0 + dr;
        while (true) {
          const to = toSquare(f, r);
          if (!to || board.has(to)) break;
          out.push({ to, path: [to], captured: [] });
          f += df;
          r += dr;
        }
      }
    }
    return out;
  }

  private findCaptures(
    square: string,
    color: PieceColor,
    type: CheckerPieceType,
    board: Board,
    pathSoFar: string[],
    capturedSoFar: string[],
  ): CheckersMoveOption[] {
    const f0 = fileOf(square);
    const r0 = rankOf(square);
    const results: CheckersMoveOption[] = [];

    for (const [df, dr] of DIRECTIONS) {
      if (type === "m") {
        const midSq = toSquare(f0 + df, r0 + dr);
        const landSq = toSquare(f0 + 2 * df, r0 + 2 * dr);
        if (!midSq || !landSq) continue;
        const midPiece = board.get(midSq);
        if (!midPiece || midPiece.color === color) continue;
        if (capturedSoFar.includes(midSq)) continue;
        if (board.has(landSq)) continue;
        results.push(...this.extendCapture(square, landSq, midSq, color, type, board, pathSoFar, capturedSoFar));
      } else {
        let f = f0 + df;
        let r = r0 + dr;
        let enemySq: string | null = null;
        for (;;) {
          const sq = toSquare(f, r);
          if (!sq) break;
          const occ = board.get(sq);
          if (!enemySq) {
            if (!occ) {
              f += df;
              r += dr;
              continue;
            }
            if (occ.color === color || capturedSoFar.includes(sq)) break;
            enemySq = sq;
            f += df;
            r += dr;
            continue;
          } else {
            if (occ) break; // landing squares must be empty
            results.push(...this.extendCapture(square, sq, enemySq, color, type, board, pathSoFar, capturedSoFar));
            f += df;
            r += dr;
          }
        }
      }
    }
    return results;
  }

  private extendCapture(
    from: string,
    landSq: string,
    capturedSq: string,
    color: PieceColor,
    type: CheckerPieceType,
    board: Board,
    pathSoFar: string[],
    capturedSoFar: string[],
  ): CheckersMoveOption[] {
    const nextBoard = this.cloneBoard(board);
    nextBoard.delete(from);
    nextBoard.set(landSq, { type, color });
    const newPath = [...pathSoFar, landSq];
    const newCaptured = [...capturedSoFar, capturedSq];
    const continued = this.findCaptures(landSq, color, type, nextBoard, newPath, newCaptured);
    if (continued.length > 0) return continued;
    return [{ to: landSq, path: newPath, captured: newCaptured }];
  }

  /** Applies a move, picking the legal option (from legalMovesFrom(from)) whose final square is `to`. */
  move(from: string, to: string): CheckersMoveResult | null {
    const options = this.legalMovesFrom(from);
    const chosen = options.find((o) => o.to === to);
    if (!chosen) return null;

    const piece = this.board.get(from)!;
    this.history.push({ board: this.cloneBoard(this.board), turn: this.turn });

    this.board.delete(from);
    for (const capturedSquare of chosen.captured) this.board.delete(capturedSquare);

    const backRank = piece.color === "w" ? 7 : 0;
    const promoted = piece.type === "m" && rankOf(chosen.to) === backRank;
    this.board.set(chosen.to, { type: promoted ? "k" : piece.type, color: piece.color });

    this.turn = piece.color === "w" ? "b" : "w";
    this.updateGameOver();

    return {
      from,
      to: chosen.to,
      path: chosen.path,
      captured: chosen.captured,
      color: piece.color,
      promoted,
      isCapture: chosen.captured.length > 0,
    };
  }

  private updateGameOver() {
    this.gameOverInfo = null;
    const remaining = this.pieces().filter((p) => p.color === this.turn);
    if (remaining.length === 0) {
      this.gameOverInfo = { winner: this.turn === "w" ? "b" : "w", reason: "no-pieces" };
      return;
    }
    const hasAnyMove = remaining.some(
      (p) => this.legalMovesFrom(p.square).length > 0,
    );
    if (!hasAnyMove) {
      this.gameOverInfo = { winner: this.turn === "w" ? "b" : "w", reason: "no-moves" };
    }
  }

  isGameOver(): boolean {
    return this.gameOverInfo !== null;
  }

  gameOverReason(): CheckersGameOverInfo | null {
    return this.gameOverInfo;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.board = prev.board;
    this.turn = prev.turn;
    this.gameOverInfo = null;
    return true;
  }

  serialize(): { pieces: CheckerPiece[]; turn: PieceColor } {
    return { pieces: this.pieces(), turn: this.turn };
  }
}
