import { Chess, type Square as ChessSquare, type Move } from "chess.js";
import type { GameOverInfo, MoveResult, PieceColor, PieceInfo, PieceType } from "./types";

type Listener<T> = (payload: T) => void;

/** Thin event-emitting wrapper around chess.js that the renderer/UI/AI/network all share as the single source of truth. */
export class ChessGame {
  private chess = new Chess();
  private listeners: { [K in keyof Events]: Listener<Events[K]>[] } = {
    move: [],
    check: [],
    gameOver: [],
    reset: [],
  };

  on<K extends keyof Events>(event: K, cb: Listener<Events[K]>) {
    this.listeners[event].push(cb as never);
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]) {
    for (const cb of this.listeners[event]) (cb as Listener<Events[K]>)(payload);
  }

  get turn(): PieceColor {
    return this.chess.turn() as PieceColor;
  }

  fen() {
    return this.chess.fen();
  }

  loadFen(fen: string) {
    this.chess.load(fen);
  }

  history(): string[] {
    return this.chess.history();
  }

  pgn(): string {
    return this.chess.pgn();
  }

  isGameOver() {
    return this.chess.isGameOver();
  }

  board() {
    return this.chess.board();
  }

  pieces(): PieceInfo[] {
    const out: PieceInfo[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ type: cell.type as PieceType, color: cell.color as PieceColor, square: cell.square });
      }
    }
    return out;
  }

  get(square: Square) {
    return this.chess.get(square as ChessSquare);
  }

  legalMovesFrom(square: Square): Square[] {
    return this.chess.moves({ square: square as ChessSquare, verbose: true }).map((m: Move) => m.to);
  }

  allLegalMoves(): Move[] {
    return this.chess.moves({ verbose: true });
  }

  isPromotion(from: Square, to: Square): boolean {
    return this.chess
      .moves({ square: from as ChessSquare, verbose: true })
      .some((m: Move) => m.to === to && m.promotion !== undefined);
  }

  inCheck(): boolean {
    return this.chess.isCheck();
  }

  move(from: Square, to: Square, promotion?: PieceType): MoveResult | null {
    let result: Move;
    try {
      result = this.chess.move({ from: from as ChessSquare, to: to as ChessSquare, promotion });
    } catch {
      return null;
    }
    if (!result) return null;

    const isCheckmate = this.chess.isCheckmate();
    const isStalemate = this.chess.isStalemate();
    const isDraw = this.chess.isDraw();
    const isCheck = this.chess.isCheck();

    const mr: MoveResult = {
      from: result.from,
      to: result.to,
      piece: result.piece as PieceType,
      color: result.color as PieceColor,
      captured: result.captured as PieceType | undefined,
      promotion: result.promotion as PieceType | undefined,
      san: result.san,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      isCastle: result.flags.includes("k") || result.flags.includes("q"),
      isEnPassant: result.flags.includes("e"),
    };

    this.emit("move", mr);
    if (isCheck && !isCheckmate) this.emit("check", { color: this.turn });
    if (isCheckmate) {
      this.emit("gameOver", { winner: mr.color, reason: "checkmate" });
    } else if (isStalemate) {
      this.emit("gameOver", { winner: null, reason: "stalemate" });
    } else if (isDraw) {
      this.emit("gameOver", { winner: null, reason: "draw" });
    }
    return mr;
  }

  resign(color: PieceColor) {
    const winner = color === "w" ? "b" : "w";
    this.emit("gameOver", { winner, reason: "resign" });
  }

  reset() {
    this.chess.reset();
    this.emit("reset", undefined);
  }

  /** Undoes the last ply. Returns false (no-op) if there is no move to undo. */
  undo(): boolean {
    return !!this.chess.undo();
  }

  kingSquare(color: PieceColor): Square | null {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === color) return cell.square;
      }
    }
    return null;
  }
}

type Square = string;

interface Events {
  move: MoveResult;
  check: { color: PieceColor };
  gameOver: GameOverInfo;
  reset: undefined;
}
