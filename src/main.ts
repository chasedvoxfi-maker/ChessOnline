import "./style.css";
import { Chess } from "chess.js";
import { GameController } from "./game/GameController";
import { OnlineSession } from "./net/OnlineSession";
import { Menu, type ContinueInfo } from "./ui/Menu";
import { HUD } from "./ui/HUD";
import { soundManager } from "./audio/SoundManager";
import { loadSavedGame, clearSavedGame, type SavedGameState } from "./game/SaveGame";
import type { Difficulty, GameMode } from "./game/types";

const app = document.getElementById("app")!;

let controller: GameController | null = null;
let activeOnlineSession: OnlineSession | null = null;

const DIFFICULTY_RU: Record<Difficulty, string> = {
  easy: "Новичок",
  medium: "Любитель",
  hard: "Эксперт",
  master: "Мастер",
};

function clearApp() {
  app.innerHTML = "";
}

function describeSavedGame(saved: SavedGameState): ContinueInfo {
  const chess = new Chess(saved.fen);
  const modeLabel = saved.mode === "ai" ? `С компьютером · ${DIFFICULTY_RU[saved.difficulty ?? "medium"]}` : "Два игрока за экраном";
  const turnLabel = chess.turn() === "w" ? "ход белых" : "ход чёрных";
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
  clearApp();

  const saved = loadSavedGame();

  const menu = new Menu(
    {
      onStartHotseat: () => startGame({ mode: "hotseat" }),
      onStartAI: (difficulty: Difficulty) => startGame({ mode: "ai", difficulty }),
      onHostOnline: async () => {
        const session = new OnlineSession();
        activeOnlineSession = session;
        const code = await session.hostGame();
        session.on("connected", () => {
          if (activeOnlineSession === session) startGame({ mode: "online", online: session });
        });
        return code;
      },
      onJoinOnline: async (code: string) => {
        const session = new OnlineSession();
        activeOnlineSession = session;
        await session.joinGame(code);
        startGame({ mode: "online", online: session });
      },
      onOnlineReady: () => {},
      onContinue: () => {
        if (saved) startGame({ mode: saved.mode, difficulty: saved.difficulty, resume: saved });
      },
      onDiscardSave: () => clearSavedGame(),
    },
    saved ? describeSavedGame(saved) : null,
  );
  app.appendChild(menu.el);
}

interface StartOpts {
  mode: GameMode;
  difficulty?: Difficulty;
  online?: OnlineSession;
  resume?: SavedGameState;
}

function startGame(opts: StartOpts) {
  clearApp();

  const screen = document.createElement("div");
  screen.className = "game-screen";
  const boardContainer = document.createElement("div");
  boardContainer.className = "board-container";
  screen.appendChild(boardContainer);
  app.appendChild(screen);

  controller = new GameController(boardContainer, {
    mode: opts.mode,
    difficulty: opts.difficulty,
    online: opts.online,
    resume: opts.resume,
  });

  const hud = new HUD(
    {
      onResign: () => controller?.resign(),
      onOfferDraw: () => {
        // simple local draw offer: in hotseat/AI it just ends as a draw; in online, a full offer/accept protocol
        // is a natural follow-up but out of scope for this pass.
      },
      onMenu: () => showMenu(),
      onRematch: () => controller?.restart(),
      onMuteToggle: () => {},
      onSave: () => controller?.saveNow() ?? false,
      onUndo: () => controller?.undo() ?? false,
    },
    { hotseat: opts.mode === "hotseat", saveable: opts.mode !== "online", undoable: opts.mode !== "online" },
  );
  screen.appendChild(hud.el);

  controller.callbacks = {
    onTurnChange: (turn) => hud.setTurn(turn, controller!.game.inCheck()),
    onMove: (_move, captured) => {
      hud.updateCaptured(captured);
      hud.setTurn(controller!.game.turn, controller!.game.inCheck());
    },
    onUndo: (turn, captured) => {
      hud.updateCaptured(captured);
      hud.setTurn(turn, controller!.game.inCheck());
    },
    onPromotionNeeded: (color) => hud.promptPromotion(color),
    onGameOver: (info) => hud.showGameOver(info),
    onOpponentDisconnected: () => hud.showDisconnectNotice(),
  };

  if (opts.resume) {
    hud.updateCaptured(controller.capturedSummary());
    hud.setTurn(controller.game.turn, controller.game.inCheck());
  } else {
    hud.setTurn("w", false);
    soundManager.playGameStart();
  }
}

showMenu();
