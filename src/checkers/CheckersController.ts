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
  onMove?: () => void;
  onGameOver?: (info: GameOverInfo) => void;
  onOpponentDisconnected?: () => void;
  /** Online only: the opponent asked to take back their last move — show a Yes/No prompt and
   * resolve with the local player's answer. */
  onUndoRequested?: () => Promise<boolean>;
  /** Online only: the opponent declined our undo request. */
  onUndoDeclined?: () => void;
  /** Fires once an undo actually happens, whichever side triggered it — used to clear a
   * "waiting for opponent" indicator regardless of how the wait ended. */
  onUndoResolved?: () => void;
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
  /** Online only: true while we're waiting for the opponent's answer to our own undo request. */
  private undoRequestPending = false;

  callbacks: CheckersControllerCallbacks = {};

  constructor(container: HTMLElement, opts: CheckersControllerOptions) {
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    // Checkers pieces are flat discs (a crowned king tops out ~0.44 units, vs. a chess king's
    // ~1.3), so the default camera can sit a bit steeper than chess's without clipping — see
    // Board3D.DEFAULT_CAMERA_PRESET for how these numbers were solved (maximize both-axes fill,
    // not just guessed). The player can still nudge further with the HUD's +/- tilt control.
    this.board = new Board3D(container, {
      pieceFactories: CHECKER_FACTORIES,
      pieceHeightAllowance: 0.55,
      cameraPreset: { elevationDeg: 87, elevationFloorDeg: 55 },
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
      this.postMoveUpdates();
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

  private postMoveUpdates() {
    this.callbacks.onMove?.();

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
    } else if (msg.kind === "undoRequest") {
      void this.handleUndoRequest();
    } else if (msg.kind === "undoAccept") {
      this.undoRequestPending = false;
      this.performUndo();
    } else if (msg.kind === "undoDecline") {
      this.undoRequestPending = false;
      this.callbacks.onUndoDeclined?.();
    }
  }

  /** The opponent asked to take back their last move — ask the local human, then reply. Blocks
   * local interaction (this.busy) while the question is on screen so the two sides can't race. */
  private async handleUndoRequest() {
    if (!this.online) return;
    if (!this.game.canUndo()) {
      this.online.send({ kind: "undoDecline" });
      return;
    }
    this.busy = true;
    const accepted = this.callbacks.onUndoRequested ? await this.callbacks.onUndoRequested() : false;
    this.busy = false;
    if (accepted) {
      this.online.send({ kind: "undoAccept" });
      this.performUndo();
    } else {
      this.online.send({ kind: "undoDecline" });
    }
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

  /** Not available online directly — see requestUndo(), which asks the opponent's permission
   * first since their board can't be un-synced without their say-so. */
  undo(): boolean {
    if (this.mode === "online" || this.busy) return false;
    return this.performUndo();
  }

  /** The actual undo, applied once both sides agree (or immediately for hotseat/AI). */
  private performUndo(): boolean {
    if (!this.game.undo()) return false;
    if (this.mode === "ai" && this.game.currentTurn !== this.localHumanColor) this.game.undo();

    this.gameOver = false;
    this.deselect();
    this.board.resetCameraFraming();
    this.syncBoard();
    if (this.mode === "hotseat") this.board.setOrientation(this.game.currentTurn);
    else this.board.setOrientation(this.localHumanColor);

    soundManager.playMove();
    this.callbacks.onTurnChange?.(this.game.currentTurn);
    this.callbacks.onMove?.();
    this.callbacks.onUndoResolved?.();
    this.autosave();
    return true;
  }

  /** Online only: asks the opponent for permission before taking back the last move. Returns
   * false immediately (no request sent) if there's nothing to undo, a request is already in
   * flight, or we're mid-animation. */
  requestUndo(): boolean {
    if (this.mode !== "online" || !this.online) return false;
    if (this.busy || this.undoRequestPending || !this.game.canUndo()) return false;
    this.undoRequestPending = true;
    this.online.send({ kind: "undoRequest" });
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
