import { ChessGame } from "./ChessGame";
import { Board3D } from "../render/Board3D";
import { AIPlayer } from "./AIPlayer";
import { OnlineSession } from "../net/OnlineSession";
import { soundManager } from "../audio/SoundManager";
import { saveGame, clearSavedGame, type SavedGameState } from "./SaveGame";
import type { Difficulty, GameMode, GameOverInfo, MoveResult, PieceColor, PieceType } from "./types";

export interface GameControllerOptions {
  mode: GameMode;
  difficulty?: Difficulty;
  online?: OnlineSession;
  /** Resumes a previously saved hotseat/AI game instead of starting from the initial position. */
  resume?: SavedGameState;
}

export interface GameControllerCallbacks {
  onTurnChange?: (turn: PieceColor) => void;
  onMove?: (move: MoveResult, captured: { type: PieceType; color: PieceColor }[]) => void;
  onUndo?: (turn: PieceColor, captured: { type: PieceType; color: PieceColor }[]) => void;
  onGameOver?: (info: GameOverInfo) => void;
  onPromotionNeeded?: (color: PieceColor) => Promise<PieceType>;
  onOpponentDisconnected?: () => void;
}

/** Orchestrates the rules engine, 3D board, AI worker and online sync into one cohesive game session. */
export class GameController {
  game = new ChessGame();
  board: Board3D;
  private ai: AIPlayer | null = null;
  private online: OnlineSession | null = null;
  private mode: GameMode;
  private difficulty?: Difficulty;
  private selected: string | null = null;
  private capturedByWhite: PieceType[] = []; // pieces white has captured (i.e. black pieces taken)
  private capturedByBlack: PieceType[] = [];
  private localHumanColor: PieceColor = "w"; // for ai/online modes: which side the local human controls
  private busy = false;
  private gameOver = false;

  callbacks: GameControllerCallbacks = {};

  constructor(container: HTMLElement, opts: GameControllerOptions) {
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    this.board = new Board3D(container);
    this.board.onSquareClick = (sq) => this.handleSquareClick(sq);

    if (opts.mode === "ai") {
      this.ai = new AIPlayer(opts.difficulty ?? "medium");
      this.localHumanColor = "w";
      this.board.setOrientation("w");
    } else if (opts.mode === "online" && opts.online) {
      this.online = opts.online;
      this.localHumanColor = opts.online.myColor;
      this.board.setOrientation(this.localHumanColor);
      this.online.on("message", (msg) => this.handleNetMessage(msg));
      this.online.on("disconnected", () => this.callbacks.onOpponentDisconnected?.());
    } else {
      this.board.setOrientation("w");
    }

    if (opts.resume) {
      this.game.loadFen(opts.resume.fen);
      if (this.mode === "hotseat") this.board.setOrientation(this.game.turn);
    }

    this.recomputeCaptured();
    this.syncBoard();

    if (opts.resume && this.mode === "ai" && this.game.turn !== this.localHumanColor) {
      void this.runAITurn();
    }
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.ai?.setDifficulty(d);
  }

  /** Persists the current position so it can be resumed later. No-op (returns false) for online games. */
  saveNow(): boolean {
    const state = this.buildSaveState();
    if (!state) return false;
    saveGame(state);
    return true;
  }

  private buildSaveState(): SavedGameState | null {
    if (this.mode !== "hotseat" && this.mode !== "ai") return null;
    if (this.gameOver) return null;
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      fen: this.game.fen(),
      savedAt: Date.now(),
    };
  }

  private static readonly START_COUNTS: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

  /** Derives captured-piece lists from the current board, rather than tracking pushes — this stays
   * correct across undo, resume-from-FEN, and any other path that doesn't go through executeMove. */
  private recomputeCaptured() {
    const onBoard: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    for (const piece of this.game.pieces()) onBoard[piece.color][piece.type]++;

    const missing = (counts: Record<PieceType, number>): PieceType[] => {
      const out: PieceType[] = [];
      for (const type of ["q", "r", "b", "n", "p"] as PieceType[]) {
        for (let i = 0; i < GameController.START_COUNTS[type] - counts[type]; i++) out.push(type);
      }
      return out;
    };

    this.capturedByWhite = missing(onBoard.b); // black pieces white has captured
    this.capturedByBlack = missing(onBoard.w); // white pieces black has captured
  }

  private syncBoard() {
    this.board.syncFromPieces(this.game.pieces());
  }

  private isLocalPlayersTurn(): boolean {
    if (this.mode === "hotseat") return true;
    if (this.mode === "ai") return this.game.turn === this.localHumanColor;
    if (this.mode === "online") return this.game.turn === this.localHumanColor;
    return true;
  }

  private handleSquareClick(square: string) {
    if (this.busy || this.gameOver) return;
    if (!this.isLocalPlayersTurn()) return;

    const piece = this.game.get(square);

    if (this.selected) {
      if (this.selected === square) {
        this.selected = null;
        this.board.showSelection(null);
        this.board.clearLegalMoves();
        return;
      }
      const legalTargets = this.game.legalMovesFrom(this.selected);
      if (legalTargets.includes(square)) {
        void this.attemptMove(this.selected, square);
        return;
      }
      // clicking another own piece re-selects
      if (piece && piece.color === this.game.turn) {
        this.selectSquare(square);
      } else {
        this.selected = null;
        this.board.showSelection(null);
        this.board.clearLegalMoves();
        soundManager.playIllegal();
      }
      return;
    }

    if (piece && piece.color === this.game.turn) {
      this.selectSquare(square);
    }
  }

  private selectSquare(square: string) {
    this.selected = square;
    this.board.showSelection(square);
    const targets = this.game.legalMovesFrom(square);
    this.board.showLegalMoves(
      targets.map((sq) => ({ square: sq, capture: !!this.game.get(sq) || this.isEnPassantTarget(square, sq) })),
    );
    soundManager.playSelect();
  }

  private isEnPassantTarget(from: string, to: string): boolean {
    const piece = this.game.get(from);
    if (!piece || piece.type !== "p") return false;
    return from[0] !== to[0] && !this.game.get(to);
  }

  private async attemptMove(from: string, to: string, promotion?: PieceType) {
    this.selected = null;
    this.board.showSelection(null);
    this.board.clearLegalMoves();

    if (!promotion && this.game.isPromotion(from, to)) {
      this.busy = true;
      const color = this.game.turn;
      promotion = this.callbacks.onPromotionNeeded ? await this.callbacks.onPromotionNeeded(color) : "q";
      this.busy = false;
    }

    this.executeMove(from, to, promotion);

    if (this.mode === "online" && this.online) {
      this.online.sendMove(from, to, promotion);
    }
  }

  /** Executes a validated move: updates rules engine, plays the 3D animation + sound, then advances turn (AI etc). */
  private executeMove(from: string, to: string, promotion?: PieceType) {
    const enPassant = this.isEnPassantTarget(from, to);
    const enPassantVictimSquare = enPassant ? to[0] + from[1] : null;
    const castleRookMove = this.detectCastleRookSquares(from, to);

    const result = this.game.move(from, to, promotion);
    if (!result) {
      soundManager.playIllegal();
      return;
    }

    this.busy = true;
    this.board.showLastMove(from, to);

    const finishVisuals = () => {
      if (result.promotion) {
        this.board.promotePiece(to, result.promotion, result.color);
      }
      this.busy = false;
      this.postMoveUpdates(result);
    };

    if (result.captured) {
      const captureSquare = enPassantVictimSquare ?? to;
      this.board.animateCapture(captureSquare, () => {
        this.board.animateSlide(from, to, { onComplete: finishVisuals });
      });
      soundManager.playCapture();
    } else {
      this.board.animateSlide(from, to, { onComplete: finishVisuals });
      soundManager.playMove();
    }

    if (castleRookMove) {
      this.board.animateSlide(castleRookMove.from, castleRookMove.to, { arc: false });
    }
  }

  private detectCastleRookSquares(from: string, to: string): { from: string; to: string } | null {
    const piece = this.game.get(from);
    if (!piece || piece.type !== "k") return null;
    const rank = from[1];
    if (from === `e${rank}` && to === `g${rank}`) return { from: `h${rank}`, to: `f${rank}` };
    if (from === `e${rank}` && to === `c${rank}`) return { from: `a${rank}`, to: `d${rank}` };
    return null;
  }

  private postMoveUpdates(result: MoveResult) {
    if (result.captured) this.recomputeCaptured();
    this.callbacks.onMove?.(result, this.capturedSummary());

    if (result.isCheckmate) {
      this.gameOver = true;
      this.clearSaveIfOwned();
      this.board.showCheck(this.game.kingSquare(result.color === "w" ? "b" : "w")!);
      soundManager.playCheckmate(result.color);
      const loserKing = this.game.kingSquare(result.color === "w" ? "b" : "w")!;
      this.board.dramaticZoom(loserKing);
      this.board.celebrateCheckmate(loserKing);
      this.callbacks.onGameOver?.({ winner: result.color, reason: "checkmate" });
      return;
    }
    if (result.isStalemate || result.isDraw) {
      this.gameOver = true;
      this.clearSaveIfOwned();
      soundManager.playDraw();
      this.callbacks.onGameOver?.({ winner: null, reason: result.isStalemate ? "stalemate" : "draw" });
      return;
    }

    if (result.isCheck) {
      const kingSq = this.game.kingSquare(this.game.turn);
      if (kingSq) this.board.showCheck(kingSq);
      soundManager.playCheck();
    } else {
      this.board.clearCheck();
    }

    this.callbacks.onTurnChange?.(this.game.turn);
    this.autosave();

    if (this.mode === "hotseat") {
      this.board.flipTo(this.game.turn);
    } else if (this.mode === "ai" && this.game.turn !== this.localHumanColor) {
      void this.runAITurn();
    }
  }

  private autosave() {
    const state = this.buildSaveState();
    if (state) saveGame(state);
  }

  capturedSummary() {
    return [
      ...this.capturedByWhite.map((type) => ({ type, color: "b" as PieceColor })),
      ...this.capturedByBlack.map((type) => ({ type, color: "w" as PieceColor })),
    ];
  }

  private async runAITurn() {
    if (!this.ai || this.gameOver) return;
    this.busy = true;
    const move = await this.ai.requestMove(this.game.fen());
    this.busy = false;
    if (!move) return;
    this.executeMove(move.from, move.to, move.promotion as PieceType | undefined);
  }

  private handleNetMessage(msg: import("../net/OnlineSession").NetMessage) {
    if (msg.kind === "move") {
      this.executeMove(msg.from, msg.to, msg.promotion);
    } else if (msg.kind === "resign") {
      this.gameOver = true;
      const winner = this.localHumanColor;
      this.callbacks.onGameOver?.({ winner, reason: "resign" });
    }
  }

  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.clearSaveIfOwned();
    const resigningColor = this.mode === "hotseat" ? this.game.turn : this.localHumanColor;
    const winner: PieceColor = resigningColor === "w" ? "b" : "w";
    if (this.mode === "online") this.online?.send({ kind: "resign" });
    this.callbacks.onGameOver?.({ winner, reason: "resign" });
  }

  /** Clears the shared save slot, but only when this controller's own mode owns it (never touches a hotseat/AI save from an unrelated online session). */
  private clearSaveIfOwned() {
    if (this.mode === "hotseat" || this.mode === "ai") clearSavedGame();
  }

  /**
   * Takes back one ply. In AI mode this also unwinds the computer's reply when there is one,
   * so a single tap always hands the turn straight back to the human. Not available online —
   * the opponent's board can't be un-synced. Works even after the game has ended.
   */
  undo(): boolean {
    if (this.mode === "online" || this.busy) return false;
    if (!this.game.undo()) return false;
    if (this.mode === "ai" && this.game.turn !== this.localHumanColor) this.game.undo();

    this.gameOver = false;
    this.selected = null;
    this.board.showSelection(null);
    this.board.clearLegalMoves();
    this.board.resetCameraFraming();
    this.recomputeCaptured();
    this.syncBoard();

    this.board.clearCheck();
    if (this.game.inCheck()) {
      const kingSq = this.game.kingSquare(this.game.turn);
      if (kingSq) this.board.showCheck(kingSq);
    }
    if (this.mode === "hotseat") this.board.setOrientation(this.game.turn);
    else this.board.setOrientation(this.localHumanColor);

    soundManager.playMove();
    this.callbacks.onUndo?.(this.game.turn, this.capturedSummary());
    this.autosave();
    return true;
  }

  restart() {
    this.gameOver = false;
    this.busy = false;
    this.selected = null;
    this.capturedByWhite = [];
    this.capturedByBlack = [];
    this.game.reset();
    this.board.clearCheck();
    this.board.showSelection(null);
    this.board.clearLegalMoves();
    this.board.resetCameraFraming();
    this.board.setOrientation(this.mode === "hotseat" ? "w" : this.localHumanColor);
    this.syncBoard();
    soundManager.playGameStart();
  }

  dispose() {
    this.ai?.dispose();
    this.board.dispose();
  }
}
