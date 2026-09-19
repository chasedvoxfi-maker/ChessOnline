import type { GameOverInfo, PieceColor, PieceType } from "../game/types";
import { soundManager } from "../audio/SoundManager";

const WHITE_GLYPHS: Record<PieceType, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
const BLACK_GLYPHS: Record<PieceType, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function glyph(type: PieceType, color: PieceColor) {
  return color === "w" ? WHITE_GLYPHS[type] : BLACK_GLYPHS[type];
}

export interface HUDCallbacks {
  onResign: () => void;
  onOfferDraw?: () => void;
  onMenu: () => void;
  onRematch: () => void;
  onMuteToggle: (muted: boolean) => void;
}

export class HUD {
  el: HTMLDivElement;
  private isHotseat: boolean;
  private callbacks: HUDCallbacks;

  constructor(callbacks: HUDCallbacks, opts: { hotseat: boolean }) {
    this.callbacks = callbacks;
    this.isHotseat = opts.hotseat;
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="turn-indicator">
          <div class="turn-dot white pulsing"></div>
          <div class="turn-label"><span class="turn-label-text">Ход белых</span><small class="turn-hint"></small></div>
        </div>
        <div class="hud-actions">
          <button class="icon-btn" data-action="draw" title="Ничья">🤝</button>
          <button class="icon-btn" data-action="resign" title="Сдаться">🏳️</button>
          <button class="icon-btn" data-action="mute" title="Звук">🔊</button>
          <button class="icon-btn" data-action="menu" title="Меню">☰</button>
        </div>
      </div>
      <div class="check-banner hidden">Шах!</div>
      <div style="flex:1"></div>
      <div class="captured-trays">
        <div class="captured-tray" data-tray="w"></div>
        <div class="captured-tray" data-tray="b"></div>
      </div>
    `;

    this.el.querySelector('[data-action="menu"]')!.addEventListener("click", () => this.callbacks.onMenu());
    this.el.querySelector('[data-action="resign"]')!.addEventListener("click", () => this.confirmResign());
    this.el.querySelector('[data-action="draw"]')!.addEventListener("click", () => this.callbacks.onOfferDraw?.());

    let muted = false;
    const muteBtn = this.el.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
    muteBtn.addEventListener("click", () => {
      muted = !muted;
      muteBtn.textContent = muted ? "🔇" : "🔊";
      soundManager.setMuted(muted);
      this.callbacks.onMuteToggle(muted);
    });
  }

  private confirmResign() {
    const btn = this.el.querySelector<HTMLButtonElement>('[data-action="resign"]')!;
    if (btn.dataset.confirm === "1") {
      this.callbacks.onResign();
      return;
    }
    btn.dataset.confirm = "1";
    btn.textContent = "⚠️";
    btn.title = "Точно сдаться? Нажмите ещё раз";
    btn.classList.add("confirm-pending");
    setTimeout(() => {
      btn.dataset.confirm = "0";
      btn.textContent = "🏳️";
      btn.title = "Сдаться";
      btn.classList.remove("confirm-pending");
    }, 3000);
  }

  setTurn(color: PieceColor, inCheck: boolean) {
    const dot = this.el.querySelector(".turn-dot")!;
    dot.className = `turn-dot ${color === "w" ? "white" : "black"} pulsing`;
    const label = this.el.querySelector(".turn-label-text")!;
    const hint = this.el.querySelector(".turn-hint")!;
    label.textContent = color === "w" ? "Ход белых" : "Ход чёрных";
    hint.textContent = this.isHotseat ? "передайте устройство" : "";
    this.el.querySelector(".check-banner")!.classList.toggle("hidden", !inCheck);
  }

  updateCaptured(captured: { type: PieceType; color: PieceColor }[]) {
    const whiteTray = this.el.querySelector('[data-tray="w"]')!; // pieces captured BY white (black pieces)
    const blackTray = this.el.querySelector('[data-tray="b"]')!;
    const byWhite = captured.filter((c) => c.color === "b");
    const byBlack = captured.filter((c) => c.color === "w");
    const render = (list: { type: PieceType; color: PieceColor }[]) => {
      const sorted = [...list].sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
      return sorted.map((c) => glyph(c.type, c.color)).join(" ");
    };
    whiteTray.textContent = render(byWhite);
    blackTray.textContent = render(byBlack);
  }

  promptPromotion(color: PieceColor): Promise<PieceType> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "overlay";
      const choices: PieceType[] = ["q", "r", "b", "n"];
      overlay.innerHTML = `
        <div class="promotion-panel">
          <h2 class="section-title">Превращение пешки</h2>
          <div class="promotion-choices">
            ${choices.map((c) => `<button class="promotion-choice" data-piece="${c}">${glyph(c, color)}</button>`).join("")}
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelectorAll<HTMLButtonElement>("[data-piece]").forEach((btn) => {
        btn.addEventListener("click", () => {
          soundManager.playSelect();
          document.body.removeChild(overlay);
          resolve(btn.dataset.piece as PieceType);
        });
      });
    });
  }

  showGameOver(info: GameOverInfo) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    let title = "Ничья";
    let subtitle = "Игра завершена вничью.";
    if (info.reason === "checkmate") {
      title = "Шах и мат!";
      subtitle = `Победа за ${info.winner === "w" ? "белыми" : "чёрными"}! Поздравляем!`;
    } else if (info.reason === "resign") {
      title = "Победа!";
      subtitle = `${info.winner === "w" ? "Белые" : "Чёрные"} побеждают — соперник сдался.`;
    } else if (info.reason === "stalemate") {
      title = "Пат";
      subtitle = "Ничья: у соперника нет доступных ходов.";
    } else if (info.reason === "disconnect") {
      title = "Соперник отключился";
      subtitle = "Соединение потеряно.";
    }
    overlay.innerHTML = `
      <div class="gameover-panel">
        <h1 class="gameover-title">${title}</h1>
        <p class="gameover-subtitle">${subtitle}</p>
        <div class="gameover-actions">
          <button class="primary-btn" data-action="rematch">Играть ещё раз</button>
          <button class="hud-btn" data-action="menu">В меню</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="rematch"]')!.addEventListener("click", () => {
      document.body.removeChild(overlay);
      this.callbacks.onRematch();
    });
    overlay.querySelector('[data-action="menu"]')!.addEventListener("click", () => {
      document.body.removeChild(overlay);
      this.callbacks.onMenu();
    });
  }

  showDisconnectNotice() {
    this.showGameOver({ winner: null, reason: "disconnect" });
  }
}
