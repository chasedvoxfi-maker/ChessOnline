import type { GameOverInfo, PieceColor, PieceType } from "../game/types";
import { soundManager } from "../audio/SoundManager";
import { musicManager } from "../audio/MusicManager";
import { CAMERA_TILT_MIN, CAMERA_TILT_MAX } from "../render/Board3D";

/** "m" (checkers man) is the only non-chess type shown in the captured tray — Corners has no captures. */
export type CapturedGlyphType = PieceType | "m";

const WHITE_GLYPHS: Record<CapturedGlyphType, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙", m: "⛀" };
const BLACK_GLYPHS: Record<CapturedGlyphType, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟", m: "⛂" };
const PIECE_VALUE: Record<CapturedGlyphType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0, m: 1 };

function glyph(type: CapturedGlyphType, color: PieceColor) {
  return color === "w" ? WHITE_GLYPHS[type] : BLACK_GLYPHS[type];
}

const CAMERA_TILT_KEY = "chessonline-camera-tilt-v1";
/** Degrees the +/- widget nudges per press. */
const TILT_STEP = 5;

function clampTilt(deg: number): number {
  return Math.max(CAMERA_TILT_MIN, Math.min(CAMERA_TILT_MAX, deg));
}

function loadTiltPref(): number {
  try {
    const v = Number(localStorage.getItem(CAMERA_TILT_KEY));
    if (Number.isFinite(v)) return clampTilt(v);
  } catch {
    // best-effort only
  }
  return 0;
}

function saveTiltPref(deg: number) {
  try {
    localStorage.setItem(CAMERA_TILT_KEY, String(deg));
  } catch {
    // best-effort only
  }
}

export interface HUDCallbacks {
  onResign: () => void;
  onOfferDraw?: () => void;
  onMenu: () => void;
  onRematch: () => void;
  onMuteToggle: (muted: boolean) => void;
  /** Sets the camera's tilt offset (degrees off its per-game base elevation, +/- CAMERA_TILT_MIN/MAX). */
  onTiltChange: (offsetDeg: number) => void;
  /** Manually rotates the camera 180° to peek at the position from the opponent's side. */
  onFlipCamera: () => void;
  /** Persists the current game so it can be resumed later. Returns false if this game can't be saved (online). */
  onSave: () => boolean;
  /** Takes back one ply. Returns false if there was nothing to undo, or undo isn't available (online). */
  onUndo: () => boolean;
}

interface MenuRowSpec {
  action: string;
  icon: string;
  label: string;
}

export class HUD {
  el: HTMLDivElement;
  private isHotseat: boolean;
  private callbacks: HUDCallbacks;

  constructor(callbacks: HUDCallbacks, opts: { hotseat: boolean; saveable: boolean; undoable: boolean }) {
    this.callbacks = callbacks;
    this.isHotseat = opts.hotseat;
    this.el = document.createElement("div");
    this.el.className = "hud";

    const rows: MenuRowSpec[] = [
      ...(opts.undoable ? [{ action: "undo", icon: "↩️", label: "Отменить ход" }] : []),
      ...(opts.saveable ? [{ action: "save", icon: "💾", label: "Сохранить игру" }] : []),
      { action: "draw", icon: "🤝", label: "Предложить ничью" },
      { action: "resign", icon: "🏳️", label: "Сдаться" },
      { action: "music", icon: musicManager.isMuted() ? "🔕" : "🎵", label: musicManager.isMuted() ? "Включить музыку" : "Выключить музыку" },
      { action: "mute", icon: soundManager.muted ? "🔇" : "🔊", label: soundManager.muted ? "Включить звук" : "Выключить звук" },
    ];

    this.el.innerHTML = `
      <div class="hud-top">
        <div class="turn-indicator">
          <div class="turn-dot white pulsing"></div>
          <div class="turn-label"><span class="turn-label-text">Ход белых</span><small class="turn-hint"></small></div>
        </div>
        <div class="hud-actions">
          <button class="icon-btn" data-action="menu" title="Меню">☰</button>
        </div>
      </div>
      <div class="hud-menu-dropdown hidden">
        ${rows.map((r) => `<button class="hud-menu-row" data-action="${r.action}"><span class="hud-menu-icon">${r.icon}</span><span class="hud-menu-label">${r.label}</span></button>`).join("")}
        <div class="hud-menu-row hud-track-row">
          <button class="hud-track-nav" data-action="track-prev" title="Предыдущий трек">◀</button>
          <span class="hud-menu-icon">🎼</span>
          <span class="hud-menu-label">Музыка</span>
          <button class="hud-track-nav" data-action="track-next" title="Следующий трек">▶</button>
        </div>
        <div class="hud-menu-divider"></div>
        <button class="hud-menu-row hud-menu-exit" data-action="exit"><span class="hud-menu-icon">🚪</span><span class="hud-menu-label">Выйти из игры</span></button>
      </div>
      <div class="cam-mode-widget">
        <button class="cam-mode-btn" data-action="cam-up" title="Круче (+5°)">+</button>
        <span class="cam-mode-current"></span>
        <button class="cam-mode-btn" data-action="cam-down" title="Более полого (−5°)">−</button>
        <span class="cam-mode-caption">наклон камеры</span>
        <div class="cam-mode-divider"></div>
        <button class="cam-mode-btn cam-flip-btn" data-action="cam-flip" title="Перевернуть камеру на сторону соперника">🔄</button>
        <span class="cam-mode-caption">переворот камеры<br />на сторону соперника</span>
      </div>
      <div class="music-nav-widget">
        <div class="music-nav-row">
          <button class="music-nav-btn" data-action="music-prev" title="Предыдущий трек">◀</button>
          <span class="music-nav-icon">🎵</span>
          <button class="music-nav-btn" data-action="music-next" title="Следующий трек">▶</button>
        </div>
        <div class="music-nav-divider"></div>
        <div class="music-nav-row">
          <button class="music-nav-btn" data-action="music-vol-down" title="Тише">−</button>
          <span class="music-nav-icon">🔊</span>
          <button class="music-nav-btn" data-action="music-vol-up" title="Громче">+</button>
        </div>
      </div>
      <div class="check-banner hidden">Шах!</div>
      <div style="flex:1"></div>
      <div class="captured-trays">
        <div class="captured-tray" data-tray="w"></div>
        <div class="captured-tray" data-tray="b"></div>
      </div>
    `;

    const menuBtn = this.el.querySelector<HTMLButtonElement>('[data-action="menu"]')!;
    const dropdown = this.el.querySelector<HTMLDivElement>(".hud-menu-dropdown")!;
    const closeMenu = () => dropdown.classList.add("hidden");
    const toggleMenu = () => dropdown.classList.toggle("hidden");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    document.addEventListener("click", (e) => {
      if (!dropdown.classList.contains("hidden") && !dropdown.contains(e.target as Node) && e.target !== menuBtn) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    dropdown.querySelector('[data-action="resign"]')!.addEventListener("click", () => this.confirmResign());
    dropdown.querySelector('[data-action="draw"]')?.addEventListener("click", () => {
      this.callbacks.onOfferDraw?.();
      closeMenu();
    });
    dropdown.querySelector('[data-action="save"]')?.addEventListener("click", () => this.handleSave());
    dropdown.querySelector('[data-action="undo"]')?.addEventListener("click", () => {
      this.handleUndo();
      closeMenu();
    });
    dropdown.querySelector('[data-action="exit"]')!.addEventListener("click", () => {
      closeMenu();
      this.callbacks.onMenu();
    });

    const muteRow = dropdown.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
    muteRow.addEventListener("click", () => {
      soundManager.unlock();
      const muted = !soundManager.muted;
      muteRow.querySelector(".hud-menu-icon")!.textContent = muted ? "🔇" : "🔊";
      muteRow.querySelector(".hud-menu-label")!.textContent = muted ? "Включить звук" : "Выключить звук";
      soundManager.setMuted(muted);
      this.callbacks.onMuteToggle(muted);
      closeMenu();
    });

    const musicRow = dropdown.querySelector<HTMLButtonElement>('[data-action="music"]')!;
    musicRow.addEventListener("click", () => {
      musicManager.unlock();
      const muted = !musicManager.isMuted();
      musicRow.querySelector(".hud-menu-icon")!.textContent = muted ? "🔕" : "🎵";
      musicRow.querySelector(".hud-menu-label")!.textContent = muted ? "Включить музыку" : "Выключить музыку";
      musicManager.setMuted(muted);
      closeMenu();
    });

    // Prev/next step through the "game" playlist directly — no track list to pick from, just
    // rewind either direction from whatever's currently playing.
    dropdown.querySelector('[data-action="track-prev"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      musicManager.unlock();
      musicManager.skipPrev("game");
    });
    dropdown.querySelector('[data-action="track-next"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      musicManager.unlock();
      musicManager.skipNext("game");
    });

    // A persistent prev/next widget alongside the camera controls, so switching tracks doesn't
    // need opening the hamburger menu first — same "game" playlist as the row above.
    this.el.querySelector('[data-action="music-prev"]')!.addEventListener("click", () => {
      musicManager.unlock();
      musicManager.skipPrev("game");
    });
    this.el.querySelector('[data-action="music-next"]')!.addEventListener("click", () => {
      musicManager.unlock();
      musicManager.skipNext("game");
    });
    this.el.querySelector('[data-action="music-vol-down"]')!.addEventListener("click", () => {
      musicManager.unlock();
      musicManager.setVolume(musicManager.getVolume() - 0.1);
    });
    this.el.querySelector('[data-action="music-vol-up"]')!.addEventListener("click", () => {
      musicManager.unlock();
      musicManager.setVolume(musicManager.getVolume() + 0.1);
    });

    const camCurrent = this.el.querySelector<HTMLSpanElement>(".cam-mode-current")!;
    const camUpBtn = this.el.querySelector<HTMLButtonElement>('[data-action="cam-up"]')!;
    const camDownBtn = this.el.querySelector<HTMLButtonElement>('[data-action="cam-down"]')!;
    let tiltOffset = loadTiltPref();
    const applyCamWidget = () => {
      camCurrent.textContent = tiltOffset > 0 ? `+${tiltOffset}°` : `${tiltOffset}°`;
      camUpBtn.disabled = tiltOffset >= CAMERA_TILT_MAX;
      camDownBtn.disabled = tiltOffset <= CAMERA_TILT_MIN;
    };
    const stepTilt = (delta: number) => {
      tiltOffset = clampTilt(tiltOffset + delta);
      applyCamWidget();
      saveTiltPref(tiltOffset);
      this.callbacks.onTiltChange(tiltOffset);
    };
    applyCamWidget();
    this.callbacks.onTiltChange(tiltOffset); // apply the saved preference right away
    camUpBtn.addEventListener("click", () => stepTilt(TILT_STEP));
    camDownBtn.addEventListener("click", () => stepTilt(-TILT_STEP));
    this.el.querySelector('[data-action="cam-flip"]')!.addEventListener("click", () => this.callbacks.onFlipCamera());
  }

  private handleUndo() {
    const ok = this.callbacks.onUndo();
    if (ok) soundManager.playSelect();
    else soundManager.playIllegal();
  }

  private handleSave() {
    const row = this.el.querySelector<HTMLButtonElement>('[data-action="save"]')!;
    const icon = row.querySelector(".hud-menu-icon")!;
    const label = row.querySelector(".hud-menu-label")!;
    const ok = this.callbacks.onSave();
    soundManager.playSelect();
    icon.textContent = ok ? "✅" : "🚫";
    label.textContent = ok ? "Сохранено" : "Не удалось сохранить";
    row.disabled = true;
    setTimeout(() => {
      icon.textContent = "💾";
      label.textContent = "Сохранить игру";
      row.disabled = false;
    }, 1200);
    this.el.querySelector(".hud-menu-dropdown")!.classList.add("hidden");
  }

  private confirmResign() {
    const row = this.el.querySelector<HTMLButtonElement>('[data-action="resign"]')!;
    const icon = row.querySelector(".hud-menu-icon")!;
    const label = row.querySelector(".hud-menu-label")!;
    if (row.dataset.confirm === "1") {
      row.dataset.confirm = "0";
      icon.textContent = "🏳️";
      label.textContent = "Сдаться";
      row.classList.remove("confirm-pending");
      this.el.querySelector(".hud-menu-dropdown")!.classList.add("hidden");
      this.callbacks.onResign();
      return;
    }
    row.dataset.confirm = "1";
    icon.textContent = "⚠️";
    label.textContent = "Точно сдаться? Нажмите ещё раз";
    row.classList.add("confirm-pending");
    setTimeout(() => {
      row.dataset.confirm = "0";
      icon.textContent = "🏳️";
      label.textContent = "Сдаться";
      row.classList.remove("confirm-pending");
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

  updateCaptured(captured: { type: CapturedGlyphType; color: PieceColor }[]) {
    const whiteTray = this.el.querySelector('[data-tray="w"]')!; // pieces captured BY white (black pieces)
    const blackTray = this.el.querySelector('[data-tray="b"]')!;
    const byWhite = captured.filter((c) => c.color === "b");
    const byBlack = captured.filter((c) => c.color === "w");
    const render = (list: { type: CapturedGlyphType; color: PieceColor }[]) => {
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
    } else if (info.reason === "no-moves") {
      title = "Победа!";
      subtitle = `Победа за ${info.winner === "w" ? "белыми" : "чёрными"}! У соперника не осталось ходов.`;
    } else if (info.reason === "no-pieces") {
      title = "Победа!";
      subtitle = `Победа за ${info.winner === "w" ? "белыми" : "чёрными"}! Все шашки соперника взяты.`;
    } else if (info.reason === "corners-win") {
      title = "Победа!";
      subtitle = `${info.winner === "w" ? "Белые" : "Чёрные"} первыми перевели все фишки в дальний угол! Поздравляем!`;
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
