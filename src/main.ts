import "./style.css";
import { Chess } from "chess.js";
import { GameController } from "./game/GameController";
import { CheckersController } from "./checkers/CheckersController";
import { CornersController } from "./corners/CornersController";
import { OnlineSession } from "./net/OnlineSession";
import { Menu, type ContinueInfo } from "./ui/Menu";
import { HUD } from "./ui/HUD";
import { RotateGate, tryLockLandscape } from "./ui/RotateGate";
import { soundManager } from "./audio/SoundManager";
import { musicManager } from "./audio/MusicManager";
import { loadSavedGame, clearSavedGame, type SavedGameState, type GameKind } from "./game/SaveGame";
import type { CornersFormation } from "./corners/CornersGame";
import type { Difficulty, GameMode } from "./game/types";

// The very first tap/click anywhere unlocks audio — belt-and-braces alongside the specific
// menu/HUD buttons that also call unlock(), since a couple of mobile browsers (notably iOS
// Safari) can be picky about exactly which gesture counts.
window.addEventListener(
  "pointerdown",
  () => {
    soundManager.unlock();
    musicManager.unlock();
  },
  { once: true, capture: true },
);

const app = document.getElementById("app")!;

type AnyController = GameController | CheckersController | CornersController;

let controller: AnyController | null = null;
let activeOnlineSession: OnlineSession | null = null;
let activeRotateGate: RotateGate | null = null;

const DIFFICULTY_RU: Record<Difficulty, string> = {
  easy: "Новичок",
  medium: "Любитель",
  hard: "Эксперт",
  master: "Мастер",
};

const GAME_KINDS: GameKind[] = ["chess", "checkers", "corners"];

function clearApp() {
  app.innerHTML = "";
}

function describeSavedGame(saved: SavedGameState): ContinueInfo {
  const modeLabel = saved.mode === "ai" ? `С компьютером · ${DIFFICULTY_RU[saved.difficulty ?? "medium"]}` : "Два игрока за экраном";
  let turn: "w" | "b" = "w";
  if (saved.kind === "chess" && saved.chess) turn = new Chess(saved.chess.fen).turn();
  else if (saved.kind === "checkers" && saved.checkers) turn = saved.checkers.turn;
  else if (saved.kind === "corners" && saved.corners) turn = saved.corners.turn;
  const turnLabel = turn === "w" ? "ход белых" : "ход чёрных";
  return { label: `${modeLabel} · ${turnLabel}` };
}

function showMenu() {
  if (controller) {
    controller.dispose();
    controller = null;
  }
  if (activeOnlineSession) {
    activeOnlineSession.close();
    activeOnlineSession = null;
  }
  if (activeRotateGate) {
    activeRotateGate.dispose();
    activeRotateGate = null;
  }
  clearApp();

  const saves: Partial<Record<GameKind, SavedGameState>> = {};
  for (const kind of GAME_KINDS) {
    const saved = loadSavedGame(kind);
    if (saved) saves[kind] = saved;
  }
  const continueInfo: Partial<Record<GameKind, ContinueInfo>> = {};
  for (const kind of GAME_KINDS) {
    const saved = saves[kind];
    if (saved) continueInfo[kind] = describeSavedGame(saved);
  }

  const menu = new Menu(
    {
      onStartHotseat: (game, formation) => startGame({ kind: game, mode: "hotseat", formation }),
      onStartAI: (game, difficulty, formation) => startGame({ kind: game, mode: "ai", difficulty, formation }),
      onHostOnline: async (game, formation) => {
        const session = new OnlineSession();
        activeOnlineSession = session;
        const code = await session.hostGame(game, formation);
        session.on("connected", () => {
          if (activeOnlineSession === session) startGame({ kind: game, mode: "online", online: session, formation });
        });
        return code;
      },
      onJoinOnline: async (code: string) => {
        const session = new OnlineSession();
        activeOnlineSession = session;
        const info = await session.joinGame(code);
        startGame({ kind: info.game, mode: "online", online: session, formation: info.formation });
      },
      onContinue: (game) => {
        const saved = saves[game];
        if (saved) startGame({ kind: game, mode: saved.mode, difficulty: saved.difficulty, resume: saved });
      },
      onDiscardSave: (game) => clearSavedGame(game),
    },
    continueInfo,
  );
  app.appendChild(menu.el);
}

interface StartOpts {
  kind: GameKind;
  mode: GameMode;
  difficulty?: Difficulty;
  online?: OnlineSession;
  resume?: SavedGameState;
  formation?: CornersFormation;
}

/** The HUD's action buttons (resign/rematch/save/undo) call identically-shaped methods on every game's controller. */
function buildHud(
  mode: GameMode,
  ctrl: { resign(): void; restart(): void; saveNow(): boolean; undo(): boolean; board: { setTableMode(on: boolean): void } },
): HUD {
  return new HUD(
    {
      onResign: () => ctrl.resign(),
      onOfferDraw: () => {
        // simple local draw offer: in hotseat/AI it just ends as a draw; in online, a full offer/accept protocol
        // is a natural follow-up but out of scope for this pass.
      },
      onMenu: () => showMenu(),
      onRematch: () => ctrl.restart(),
      onMuteToggle: () => {},
      onViewToggle: (tableView) => ctrl.board.setTableMode(tableView),
      onSave: () => ctrl.saveNow(),
      onUndo: () => ctrl.undo(),
    },
    { hotseat: mode === "hotseat", saveable: mode !== "online", undoable: mode !== "online" },
  );
}

function startGame(opts: StartOpts) {
  clearApp();
  musicManager.play("game");

  const screen = document.createElement("div");
  screen.className = "game-screen";
  const boardContainer = document.createElement("div");
  boardContainer.className = "board-container";
  screen.appendChild(boardContainer);
  app.appendChild(screen);

  if (opts.kind === "chess") startChessGame(boardContainer, screen, opts);
  else if (opts.kind === "checkers") startCheckersGame(boardContainer, screen, opts);
  else startCornersGame(boardContainer, screen, opts);

  activeRotateGate = new RotateGate(screen);
  void tryLockLandscape();
}

function startChessGame(boardContainer: HTMLElement, screen: HTMLElement, opts: StartOpts) {
  const ctrl = new GameController(boardContainer, {
    mode: opts.mode,
    difficulty: opts.difficulty,
    online: opts.online,
    resume: opts.resume,
  });
  controller = ctrl;

  const hud = buildHud(opts.mode, ctrl);
  screen.appendChild(hud.el);

  ctrl.callbacks = {
    onTurnChange: (turn) => hud.setTurn(turn, ctrl.game.inCheck()),
    onMove: (_move, captured) => {
      hud.updateCaptured(captured);
      hud.setTurn(ctrl.game.turn, ctrl.game.inCheck());
    },
    onUndo: (turn, captured) => {
      hud.updateCaptured(captured);
      hud.setTurn(turn, ctrl.game.inCheck());
    },
    onPromotionNeeded: (color) => hud.promptPromotion(color),
    onGameOver: (info) => hud.showGameOver(info),
    onOpponentDisconnected: () => hud.showDisconnectNotice(),
  };

  if (opts.resume) {
    hud.updateCaptured(ctrl.capturedSummary());
    hud.setTurn(ctrl.game.turn, ctrl.game.inCheck());
  } else {
    hud.setTurn("w", false);
    soundManager.playGameStart();
  }
}

function startCheckersGame(boardContainer: HTMLElement, screen: HTMLElement, opts: StartOpts) {
  const ctrl = new CheckersController(boardContainer, {
    mode: opts.mode,
    difficulty: opts.difficulty,
    online: opts.online,
    resume: opts.resume,
  });
  controller = ctrl;

  const hud = buildHud(opts.mode, ctrl);
  screen.appendChild(hud.el);

  ctrl.callbacks = {
    onTurnChange: (turn) => hud.setTurn(turn, false),
    onMove: (captured) => {
      hud.updateCaptured(captured);
      hud.setTurn(ctrl.game.currentTurn, false);
    },
    onGameOver: (info) => hud.showGameOver(info),
    onOpponentDisconnected: () => hud.showDisconnectNotice(),
  };

  if (opts.resume) {
    hud.updateCaptured(ctrl.capturedSummary());
    hud.setTurn(ctrl.game.currentTurn, false);
  } else {
    hud.setTurn("w", false);
    soundManager.playGameStart();
  }
}

function startCornersGame(boardContainer: HTMLElement, screen: HTMLElement, opts: StartOpts) {
  const ctrl = new CornersController(boardContainer, {
    mode: opts.mode,
    difficulty: opts.difficulty,
    formation: opts.formation ?? "rectangle",
    online: opts.online,
    resume: opts.resume,
  });
  controller = ctrl;

  const hud = buildHud(opts.mode, ctrl);
  screen.appendChild(hud.el);

  ctrl.callbacks = {
    onTurnChange: (turn) => hud.setTurn(turn, false),
    onMove: () => hud.setTurn(ctrl.game.currentTurn, false),
    onGameOver: (info) => hud.showGameOver(info),
    onOpponentDisconnected: () => hud.showDisconnectNotice(),
  };

  if (opts.resume) {
    hud.setTurn(ctrl.game.currentTurn, false);
  } else {
    hud.setTurn("w", false);
    soundManager.playGameStart();
  }
}

showMenu();
