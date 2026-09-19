export type PieceColor = "w" | "b";
export type CornersFormation = "triangle" | "rectangle";

export interface CornersPiece {
  color: PieceColor;
  square: string;
}

export interface CornersMoveOption {
  to: string;
  /** Every landing square of the move, in order (length 1 for a simple step). */
  path: string[];
  /** false for a single-square orthogonal step; true for a jump (or jump chain) over other pieces. */
  isJump: boolean;
}

export interface CornersMoveResult extends CornersMoveOption {
  from: string;
  color: PieceColor;
}

export interface CornersGameOverInfo {
  winner: PieceColor;
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

type Board = Map<string, PieceColor>;

const ORTHO_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function zoneSquares(formation: CornersFormation): { white: string[]; black: string[] } {
  const white: string[] = [];
  const black: string[] = [];
  if (formation === "triangle") {
    // 4-3-2-1 right triangle, right angle at white's h1 corner (bottom-right), mirrored to black's a8 corner (top-left).
    for (let rank = 0; rank < 4; rank++) {
      for (let file = 0; file < 4 - rank; file++) {
        white.push(toSquare(7 - file, rank)!);
        black.push(toSquare(file, 7 - rank)!);
      }
    }
  } else {
    // rectangle: solid 4x4 block in each corner.
    for (let rank = 0; rank < 4; rank++) {
      for (let file = 0; file < 4; file++) {
        white.push(toSquare(7 - file, rank)!);
        black.push(toSquare(file, 7 - rank)!);
      }
    }
  }
  return { white, black };
}

/**
 * Corners (Уголки), classic variant: orthogonal-only movement, no captures.
 * A move is either a single step to an adjacent empty square, or a chain of jumps
 * (over an own or enemy piece, landing on the empty square immediately beyond, in any
 * of the 4 orthogonal directions, changeable between hops) ending on any square reached
 * along the chain. First player to move every piece into the opposite corner's zone wins.
 */
export class CornersGame {
  private board: Board = new Map();
  private turn: PieceColor = "w";
  private formation: CornersFormation = "rectangle";
  private homeZoneWhite: Set<string> = new Set();
  private homeZoneBlack: Set<string> = new Set();
  private history: { board: Board; turn: PieceColor }[] = [];
  private gameOverInfo: CornersGameOverInfo | null = null;

  constructor(formation: CornersFormation = "rectangle") {
    this.reset(formation);
  }

  reset(formation: CornersFormation = this.formation) {
    this.formation = formation;
    const { white, black } = zoneSquares(formation);
    this.homeZoneWhite = new Set(white);
    this.homeZoneBlack = new Set(black);
    this.board = new Map();
    for (const sq of white) this.board.set(sq, "w");
    for (const sq of black) this.board.set(sq, "b");
    this.turn = "w";
    this.history = [];
    this.gameOverInfo = null;
  }

  loadState(pieces: CornersPiece[], turn: PieceColor, formation: CornersFormation) {
    this.formation = formation;
    const { white, black } = zoneSquares(formation);
    this.homeZoneWhite = new Set(white);
    this.homeZoneBlack = new Set(black);
    this.board = new Map(pieces.map((p) => [p.square, p.color]));
    this.turn = turn;
    this.history = [];
    this.gameOverInfo = null;
  }

  get currentTurn(): PieceColor {
    return this.turn;
  }

  get currentFormation(): CornersFormation {
    return this.formation;
  }

  get(square: string): PieceColor | undefined {
    return this.board.get(square);
  }

  pieces(): CornersPiece[] {
    return [...this.board.entries()].map(([square, color]) => ({ color, square }));
  }

  /** The zone a piece of `color` is trying to reach (the opposite corner from its own start). */
  targetZoneFor(color: PieceColor): Set<string> {
    return color === "w" ? this.homeZoneBlack : this.homeZoneWhite;
  }

  /** All legal moves for the piece on `square`: simple steps plus every square reachable via a jump chain. */
  legalMovesFrom(square: string): CornersMoveOption[] {
    const color = this.board.get(square);
    if (!color || color !== this.turn) return [];

    const out: CornersMoveOption[] = [];
    const f0 = fileOf(square);
    const r0 = rankOf(square);

    for (const [df, dr] of ORTHO_DIRS) {
      const to = toSquare(f0 + df, r0 + dr);
      if (to && !this.board.has(to)) out.push({ to, path: [to], isJump: false });
    }

    const visited = new Set<string>([square]);
    const queue: { square: string; path: string[] }[] = [{ square, path: [] }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const cf = fileOf(cur.square);
      const cr = rankOf(cur.square);
      for (const [df, dr] of ORTHO_DIRS) {
        const mid = toSquare(cf + df, cr + dr);
        const land = toSquare(cf + 2 * df, cr + 2 * dr);
        if (!mid || !land) continue;
        if (!this.board.has(mid)) continue; // must hop over some piece, own or enemy
        if (this.board.has(land)) continue; // landing square must be empty
        if (visited.has(land)) continue;
        visited.add(land);
        const path = [...cur.path, land];
        out.push({ to: land, path, isJump: true });
        queue.push({ square: land, path });
      }
    }
    return out;
  }

  move(from: string, to: string): CornersMoveResult | null {
    const color = this.board.get(from);
    if (!color || color !== this.turn) return null;
    const chosen = this.legalMovesFrom(from).find((o) => o.to === to);
    if (!chosen) return null;

    this.history.push({ board: new Map(this.board), turn: this.turn });

    this.board.delete(from);
    this.board.set(to, color);

    const targetZone = this.targetZoneFor(color);
    const ownPieces = this.pieces().filter((p) => p.color === color);
    const allHome = ownPieces.length > 0 && ownPieces.every((p) => targetZone.has(p.square));

    this.gameOverInfo = allHome ? { winner: color } : null;
    if (!allHome) this.turn = color === "w" ? "b" : "w";

    return { from, to, path: chosen.path, isJump: chosen.isJump, color };
  }

  isGameOver(): boolean {
    return this.gameOverInfo !== null;
  }

  gameOverReason(): CornersGameOverInfo | null {
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

  serialize(): { pieces: CornersPiece[]; turn: PieceColor; formation: CornersFormation } {
    return { pieces: this.pieces(), turn: this.turn, formation: this.formation };
  }
}
