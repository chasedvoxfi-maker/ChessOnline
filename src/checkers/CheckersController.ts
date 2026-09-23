import { CheckersGame, type CheckerPiece, type PieceColor } from "./CheckersGame";
import { CheckersAIPlayer } from "./CheckersAIPlayer";
import { CHECKER_FACTORIES } from "../render/checkerPieceModels";
import { Board3D } from "../render/Board3D";
import { OnlineSession, type NetMessage } from "../net/OnlineSession";
import { soundManager } from "../audio/SoundManager";
import { saveGame, clearSavedGame, type SavedGameState } from "../game/SaveGame";
import type { Difficulty, GameMode, GameOverInfo } from "../game/types";

export interface CheckersControllerOptions {
  mode: GameMode;
  difficulty?: Difficulty;
  online?: OnlineSession;
  resume?: SavedGameState;
}

export interface CheckersControllerCallbacks {
  onTurnChange?: (turn: PieceColor) => void;
  onMove?: (captured: { type: "m" | "k"; color: PieceColor }[]) => void;
  onGameOver?: (info: GameOverInfo) => void;
  onOpponentDisconnected?: () => void;
}

/** Orchestrates the Checkers rules engine, 3D board, AI worker and online sync. */
export class CheckersController {
  game = new CheckersGame();
  board: Board3D;
  private ai: CheckersAIPlayer | null = null;
  private online: OnlineSession | null = null;
  private mode: GameMode;
  private difficulty?: Difficulty;
  private selected: string | null = null;
  private localHumanColor: PieceColor = "w";
  private busy = false;
  private gameOver = false;
  private capturedByWhite: ("m" | "k")[] = [];
  private capturedByBlack: ("m" | "k")[] = [];

  callbacks: CheckersControllerCallbacks = {};

  constructor(container: HTMLElement, opts: CheckersControllerOptions) {
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    // Checkers pieces are flat discs (a crowned king tops out ~0.44 units, vs. a chess king's
    // ~1.3), so the default "angle" camera can sit noticeably steeper/closer without clipping —
    // the board's far edge lands nearer the top of the screen instead of the shallower chess angle.
    this.board = new Board3D(container, {
      pieceFactories: CHECKER_FACTORIES,
      pieceHeightAllowance: 0.55,
      anglePreset: { elevationDeg: 82, elevationFloorDeg: 58 },
    });
    this.board.onSquareClick = (sq) => this.handleSquareClick(sq);

    if (opts.mode === "ai") {
      this.ai = new CheckersAIPlayer(opts.difficulty ?? "medium");
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

    if (opts.resume?.checkers) {
      this.game.loadState(opts.resume.checkers.pieces, opts.resume.checkers.turn);
      if (this.mode === "hotseat") this.board.setOrientation(this.game.currentTurn);
    }

    this.recomputeCaptured();
    this.syncBoard();

    if (opts.resume && this.mode === "ai" && this.game.currentTurn !== this.localHumanColor) {
      void this.runAITurn();
    }
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.ai?.setDifficulty(d);
  }

  private syncBoard() {
    this.board.syncFromPieces(this.game.pieces());
  }

  private isLocalPlayersTurn(): boolean {
    if (this.mode === "hotseat") return true;
    return this.game.currentTurn === this.localHumanColor;
  }

  private handleSquareClick(square: string) {
    if (this.busy || this.gameOver) return;
    if (!this.isLocalPlayersTurn()) return;

    const piece = this.game.get(square);

    if (this.selected) {
      if (this.selected === square) {
        this.deselect();
        return;
      }
      const options = this.game.legalMovesFrom(this.selected);
      const chosen = options.find((o) => o.to === square);
      if (chosen) {
        this.performMove(this.selected, square);
        return;
      }
      if (piece && piece.color === this.game.currentTurn && this.game.legalMovesFrom(square).length > 0) {
        this.selectSquare(square);
      } else {
        this.deselect();
        soundManager.playIllegal();
      }
      return;
    }

    if (piece && piece.color === this.game.currentTurn) {
      if (this.game.legalMovesFrom(square).length === 0) {
        soundManager.playIllegal();
        return;
      }
      this.selectSquare(square);
    }
  }

  private deselect() {
    this.selected = null;
    this.board.showSelection(null);
    this.board.clearLegalMoves();
  }

  private selectSquare(square: string) {
    this.selected = square;
    this.board.showSelection(square);
    const options = this.game.legalMovesFrom(square);
    this.board.showLegalMoves(options.map((o) => ({ square: o.to, capture: o.captured.length > 0 })));
    soundManager.playSelect();
  }

  private performMove(from: string, to: string) {
    this.deselect();
    const result = this.game.move(from, to);
    if (!result) {
      soundManager.playIllegal();
      return;
    }
    this.busy = true;
    this.board.showLastMove(from, to);

    if (this.mode === "online" && this.online) this.online.sendMove(from, to);

    this.animateChain(from, result.path, result.captured, () => {
      this.busy = false;
      if (result.promoted) {
        // rebuild as a king in place, with a little pop
        this.board.promotePiece(result.to, "k", result.color);
      }
      this.postMoveUpdates(result.isCapture, result.color);
    });
  }

  /** Hops the piece through every intermediate landing square of the move, removing captured pieces as it passes them. */
  private animateChain(from: string, path: string[], captured: string[], onDone: () => void) {
    let current = from;
    let i = 0;
    const step = () => {
      if (i >= path.length) {
        onDone();
        return;
      }
      const target = path[i];
      const capturedSquare = captured[i];
      if (capturedSquare) {
        this.board.animateCapture(capturedSquare, () => {});
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }
      this.board.animateSlide(current, target, {
        duration: 0.32,
        arc: true,
        onComplete: () => {
          current = target;
          i++;
          step();
        },
      });
    };
    step();
  }

  private postMoveUpdates(wasCapture: boolean, movedColor: PieceColor) {
    if (wasCapture) this.recomputeCaptured();
    this.callbacks.onMove?.(this.capturedSummary());

    if (this.game.isGameOver()) {
      this.gameOver = true;
      this.clearSaveIfOwned();
      const info = this.game.gameOverReason()!;
      const winnerLabel = info.winner === "w" ? "белые" : "чёрные";
      const reasonPhrase = info.reason === "no-pieces" ? "все шашки соперника взяты" : "у соперника не осталось ходов";
      soundManager.playVictory(info.winner, `Победа! Выигрывают ${winnerLabel} — ${reasonPhrase}. Поздравляем!`);
      const loserPiece = this.game.pieces().find((p) => p.color !== info.winner);
      if (loserPiece) {
        this.board.dramaticZoom(loserPiece.square);
        this.board.celebrateCheckmate(loserPiece.square);
      }
      this.callbacks.onGameOver?.({ winner: info.winner, reason: info.reason });
      return;
    }

    this.callbacks.onTurnChange?.(this.game.currentTurn);
    this.autosave();

    if (this.mode === "hotseat") {
      this.board.flipTo(this.game.currentTurn);
    } else if (this.mode === "ai" && this.game.currentTurn !== this.localHumanColor) {
      void this.runAITurn();
    }
    void movedColor;
  }

  private async runAITurn() {
    if (!this.ai || this.gameOver) return;
    this.busy = true;
    const move = await this.ai.requestMove(this.game.pieces(), this.game.currentTurn);
    this.busy = false;
    if (!move) return;
    this.performMove(move.from, move.to);
  }

  private handleNetMessage(msg: NetMessage) {
    if (msg.kind === "move") {
      this.performMove(msg.from, msg.to);
    } else if (msg.kind === "resign") {
      this.gameOver = true;
      this.callbacks.onGameOver?.({ winner: this.localHumanColor, reason: "resign" });
    }
  }

  private static readonly START_COUNT = 12;

  private recomputeCaptured() {
    const onBoard: Record<PieceColor, number> = { w: 0, b: 0 };
    for (const p of this.game.pieces()) onBoard[p.color]++;
    this.capturedByWhite = new Array(Math.max(0, CheckersController.START_COUNT - onBoard.b)).fill("m");
    this.capturedByBlack = new Array(Math.max(0, CheckersController.START_COUNT - onBoard.w)).fill("m");
  }

  capturedSummary() {
    return [
      ...this.capturedByWhite.map((type) => ({ type, color: "b" as PieceColor })),
      ...this.capturedByBlack.map((type) => ({ type, color: "w" as PieceColor })),
    ];
  }

  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.clearSaveIfOwned();
    const resigningColor = this.mode === "hotseat" ? this.game.currentTurn : this.localHumanColor;
    const winner: PieceColor = resigningColor === "w" ? "b" : "w";
    if (this.mode === "online") this.online?.send({ kind: "resign" });
    this.callbacks.onGameOver?.({ winner, reason: "resign" });
  }

  undo(): boolean {
    if (this.mode === "online" || this.busy) return false;
    if (!this.game.undo()) return false;
    if (this.mode === "ai" && this.game.currentTurn !== this.localHumanColor) this.game.undo();

    this.gameOver = false;
    this.deselect();
    this.board.resetCameraFraming();
    this.recomputeCaptured();
    this.syncBoard();
    if (this.mode === "hotseat") this.board.setOrientation(this.game.currentTurn);
    else this.board.setOrientation(this.localHumanColor);

    soundManager.playMove();
    this.callbacks.onTurnChange?.(this.game.currentTurn);
    this.callbacks.onMove?.(this.capturedSummary());
    this.autosave();
    return true;
  }

  private clearSaveIfOwned() {
    if (this.mode === "hotseat" || this.mode === "ai") clearSavedGame("checkers");
  }

  private buildSaveState(): SavedGameState | null {
    if (this.mode !== "hotseat" && this.mode !== "ai") return null;
    if (this.gameOver) return null;
    return {
      kind: "checkers",
      mode: this.mode,
      difficulty: this.difficulty,
      savedAt: Date.now(),
      checkers: this.game.serialize(),
    };
  }

  private autosave() {
    const state = this.buildSaveState();
    if (state) saveGame(state);
  }

  saveNow(): boolean {
    const state = this.buildSaveState();
    if (!state) return false;
    saveGame(state);
    return true;
  }

  restart() {
    this.gameOver = false;
    this.busy = false;
    this.deselect();
    this.game.reset();
    this.board.clearCheck();
    this.board.resetCameraFraming();
    this.board.setOrientation(this.mode === "hotseat" ? "w" : this.localHumanColor);
    this.recomputeCaptured();
    this.syncBoard();
    soundManager.playGameStart();
  }

  dispose() {
    this.ai?.dispose();
    this.board.dispose();
  }
}

// re-exported for convenience at call sites
export type { CheckerPiece };
