import type { Difficulty } from "../game/types";
import type { GameKind } from "../game/SaveGame";
import type { CornersFormation } from "../corners/CornersGame";
import { soundManager } from "../audio/SoundManager";
import { musicManager } from "../audio/MusicManager";
import { APP_VERSION } from "../version";

export interface MenuCallbacks {
  onStartHotseat: (game: GameKind, formation?: CornersFormation) => void;
  onStartAI: (game: GameKind, difficulty: Difficulty, formation?: CornersFormation) => void;
  onHostOnline: (game: GameKind, formation?: CornersFormation) => Promise<string>; // resolves with room code, rejects with error string
  /** The joined game is announced by the host once connected — the caller doesn't pick it up front. */
  onJoinOnline: (code: string) => Promise<void>;
  onContinue: (game: GameKind) => void;
  onDiscardSave: (game: GameKind) => void;
}

export interface ContinueInfo {
  /** Short human-readable description, e.g. "Игра с компьютером · Ход белых". */
  label: string;
}

const DIFFICULTY_LABELS: { value: Difficulty; label: string; desc: string }[] = [
  { value: "easy", label: "Новичок", desc: "для расслабленной игры" },
  { value: "medium", label: "Любитель", desc: "сбалансированный вызов" },
  { value: "hard", label: "Эксперт", desc: "играет агрессивно" },
  { value: "master", label: "Мастер", desc: "считает глубоко" },
];

const GAME_LABELS: { value: GameKind; icon: string; label: string; desc: string }[] = [
  { value: "chess", icon: "♞", label: "Шахматы", desc: "классическая королевская игра" },
  { value: "checkers", icon: "⛀", label: "Шашки", desc: "с обязательным взятием и дамками" },
  { value: "corners", icon: "▲", label: "Уголки", desc: "переведите все фишки в дальний угол" },
];

const GAME_TITLES: Record<GameKind, string> = { chess: "Шахматы", checkers: "Шашки", corners: "Уголки" };

/** Simple gold line icons, matching the key-art's own icon-in-a-roundel style. */
const SVG_ICONS: Record<string, string> = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  people:
    '<svg viewBox="0 0 24 24"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c.3-3.3 3-5.5 6-5.5s5.7 2.2 6 5.5H2Zm12.2-5.4c2.6.5 4.6 2.5 4.8 5.4H24c-.2-2.7-1.9-4.7-4.4-5.2-.4-.1-.9-.2-1.4-.2Z"/></svg>',
  robot:
    '<svg viewBox="0 0 24 24"><path d="M12 2a1 1 0 0 1 1 1v1.06A6 6 0 0 1 19 10v1h.5a1.5 1.5 0 0 1 0 3H19v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3h-.5a1.5 1.5 0 0 1 0-3H5v-1a6 6 0 0 1 6-5.94V3a1 1 0 0 1 1-1ZM9 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7.94 9h-3.1a15.6 15.6 0 0 0-1.14-5.3A8.02 8.02 0 0 1 19.94 11ZM12 4.1c.8 1.1 1.7 3 1.9 6.9h-3.8c.2-3.9 1.1-5.8 1.9-6.9ZM8.3 5.7A15.6 15.6 0 0 0 7.16 11h-3.1A8.02 8.02 0 0 1 8.3 5.7ZM4.06 13h3.1c.15 2 .55 3.8 1.14 5.3A8.02 8.02 0 0 1 4.06 13ZM12 19.9c-.8-1.1-1.7-3-1.9-6.9h3.8c-.2 3.9-1.1 5.8-1.9 6.9Zm3.7-1.6c.59-1.5.99-3.3 1.14-5.3h3.1a8.02 8.02 0 0 1-4.24 5.3Z"/></svg>',
  musicOn:
    '<svg viewBox="0 0 24 24"><path d="M9 18V5.5l11-2.2v11.2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-3.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  musicOff:
    '<svg viewBox="0 0 24 24"><path d="M9 18V5.5l11-2.2v11.2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-3.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  soundOn:
    '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  soundOff:
    '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

/** Wraps a text glyph or one of SVG_ICONS in the gold roundel badge used by every pill button. */
function iconBadge(glyphOrSvgKey: string): string {
  const content = SVG_ICONS[glyphOrSvgKey] ?? glyphOrSvgKey;
  return `<span class="menu-icon-badge">${content}</span>`;
}

/** The main menu screen: game picker, mode selection, AI difficulty, and the online host/join lobby. */
export class Menu {
  el: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private cancelledOnlineWait = false;
  private callbacks: MenuCallbacks;
  private continueInfo: Partial<Record<GameKind, ContinueInfo>>;
  private selectedGame: GameKind = "chess";
  private selectedFormation: CornersFormation = "rectangle";

  constructor(callbacks: MenuCallbacks, continueInfo: Partial<Record<GameKind, ContinueInfo>> = {}) {
    this.callbacks = callbacks;
    this.continueInfo = continueInfo;
    this.el = document.createElement("div");
    this.el.className = "menu-screen";
    this.el.innerHTML = `
      <video class="menu-bg-video hidden" autoplay muted loop playsinline></video>
      <div class="menu-bg-fallback"></div>
      <div class="menu-bg-shield"></div>
      <div class="menu-veil"></div>
      <div class="menu-audio-controls">
        <button class="audio-toggle-btn" data-action="toggle-music" title="Музыка"></button>
        <button class="audio-toggle-btn" data-action="toggle-sound" title="Звуки"></button>
      </div>
      <div class="menu-content"></div>
      <div class="app-version">v${APP_VERSION}</div>
    `;
    this.contentEl = this.el.querySelector(".menu-content")!;
    this.renderGamePicker();
    this.wireAudioControls();
    musicManager.play("menu");

    const video = this.el.querySelector<HTMLVideoElement>(".menu-bg-video")!;
    void video; // Hook for a future background video: set video.src = "/menu-bg.mp4" and remove "hidden".
  }

  private wireAudioControls() {
    const musicBtn = this.el.querySelector<HTMLButtonElement>('[data-action="toggle-music"]')!;
    const soundBtn = this.el.querySelector<HTMLButtonElement>('[data-action="toggle-sound"]')!;
    const refresh = () => {
      musicBtn.innerHTML = musicManager.isMuted() ? SVG_ICONS.musicOff : SVG_ICONS.musicOn;
      soundBtn.innerHTML = soundManager.muted ? SVG_ICONS.soundOff : SVG_ICONS.soundOn;
    };
    refresh();
    musicBtn.addEventListener("click", () => {
      this.unlockAudio();
      musicManager.setMuted(!musicManager.isMuted());
      refresh();
    });
    soundBtn.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.setMuted(!soundManager.muted);
      soundManager.playSelect();
      refresh();
    });
  }

  /** Call with a URL to install a background video behind the menu (e.g. from public/). */
  setBackgroundVideo(url: string) {
    const video = this.el.querySelector<HTMLVideoElement>(".menu-bg-video")!;
    video.src = url;
    video.classList.remove("hidden");
  }

  private unlockAudio() {
    soundManager.unlock();
    musicManager.unlock();
  }

  private renderGamePicker() {
    const continuePanels = GAME_LABELS.filter((g) => this.continueInfo[g.value]).map(
      (g) => `
      <div class="menu-panel continue-panel">
        <button class="menu-btn continue-btn" data-continue="${g.value}">
          ${iconBadge("play")}
          <span>
            Продолжить: ${GAME_TITLES[g.value]}
            <span class="desc">${this.continueInfo[g.value]!.label}</span>
          </span>
        </button>
        <button class="back-btn" data-discard="${g.value}">Начать новую игру, удалив сохранённую</button>
      </div>`,
    );

    this.contentEl.innerHTML = `
      ${continuePanels.join("")}
      <div class="menu-panel">
        ${GAME_LABELS.map(
          (g) => `
          <button class="menu-btn" data-game="${g.value}">
            ${iconBadge(g.icon)}
            <span>
              ${g.label}
              <span class="desc">${g.desc}</span>
            </span>
          </button>`,
        ).join("")}
      </div>
      <button class="back-btn join-link" data-action="join-anywhere">Есть код от друга? Присоединиться</button>
    `;
    this.wireEffects();

    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-continue]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.unlockAudio();
        soundManager.playSelect();
        this.callbacks.onContinue(btn.dataset.continue as GameKind);
      });
    });
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-discard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const game = btn.dataset.discard as GameKind;
        delete this.continueInfo[game];
        this.callbacks.onDiscardSave(game);
        this.renderGamePicker();
      });
    });
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-game]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.unlockAudio();
        soundManager.playSelect();
        this.selectedGame = btn.dataset.game as GameKind;
        this.selectedFormation = "rectangle";
        this.renderModeSelect();
      });
    });
    this.contentEl.querySelector('[data-action="join-anywhere"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderJoinPanel();
    });
  }

  private renderModeSelect() {
    const game = this.selectedGame;
    this.contentEl.innerHTML = `
      <div class="menu-panel">
        <button class="back-btn">← К выбору игры</button>
        <div class="panel-game-label">${GAME_TITLES[game]}</div>
        ${
          game === "corners"
            ? `
        <h2 class="section-title">Расстановка</h2>
        <div class="online-tabs">
          <button class="pill-btn ${this.selectedFormation === "rectangle" ? "active" : ""}" data-formation="rectangle">Прямоугольником</button>
          <button class="pill-btn ${this.selectedFormation === "triangle" ? "active" : ""}" data-formation="triangle">Треугольником</button>
        </div>`
            : ""
        }
        <button class="menu-btn" data-action="hotseat">
          ${iconBadge("people")}
          <span>
            Два игрока за одним экраном
            <span class="desc">Играйте по очереди, камера разворачивается к каждому</span>
          </span>
        </button>
        <button class="menu-btn" data-action="ai">
          ${iconBadge("robot")}
          <span>
            Игра с компьютером
            <span class="desc">Выберите уровень сложности соперника</span>
          </span>
        </button>
        <button class="menu-btn" data-action="online">
          ${iconBadge("globe")}
          <span>
            Игра онлайн
            <span class="desc">Создайте комнату и пригласите друга по коду</span>
          </span>
        </button>
      </div>
    `;
    this.wireEffects();
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => this.renderGamePicker());
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-formation]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedFormation = btn.dataset.formation as CornersFormation;
        soundManager.playSelect();
        this.renderModeSelect();
      });
    });
    this.contentEl.querySelector('[data-action="hotseat"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.callbacks.onStartHotseat(game, game === "corners" ? this.selectedFormation : undefined);
    });
    this.contentEl.querySelector('[data-action="ai"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderAiPanel();
    });
    this.contentEl.querySelector('[data-action="online"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderHostPanel();
    });
  }

  private renderAiPanel() {
    const game = this.selectedGame;
    this.contentEl.innerHTML = `
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <div class="panel-game-label">${GAME_TITLES[game]}</div>
        <h2 class="section-title">Уровень сложности</h2>
        <div class="difficulty-grid">
          ${DIFFICULTY_LABELS.map(
            (d) => `
            <button class="pill-btn" data-difficulty="${d.value}">
              ${d.label}<br/><small style="opacity:.7;font-weight:500">${d.desc}</small>
            </button>`,
          ).join("")}
        </div>
      </div>
    `;
    this.wireEffects();
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => this.renderModeSelect());
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundManager.playSelect();
        this.callbacks.onStartAI(
          game,
          btn.dataset.difficulty as Difficulty,
          game === "corners" ? this.selectedFormation : undefined,
        );
      });
    });
  }

  /** Hosting always happens from within a chosen game's panel — the host picks the game up front. */
  private renderHostPanel() {
    this.cancelledOnlineWait = false;
    const game = this.selectedGame;
    this.contentEl.innerHTML = `
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <div class="panel-game-label">${GAME_TITLES[game]}</div>
        <h2 class="section-title">Игра онлайн</h2>
        <div class="online-body"></div>
      </div>
    `;
    this.wireEffects();
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => {
      this.cancelledOnlineWait = true;
      this.renderModeSelect();
    });
    const body = this.onlineBody();
    body.innerHTML = `
      <p class="status-line">Нажмите, чтобы создать комнату и получить код для друга</p>
      <button class="primary-btn" data-action="create">Создать комнату</button>
    `;
    this.wireEffects();
    body.querySelector('[data-action="create"]')!.addEventListener("click", async () => {
      body.innerHTML = `<div class="spinner"></div><p class="status-line">Создаём комнату…</p>`;
      try {
        const code = await this.callbacks.onHostOnline(game, game === "corners" ? this.selectedFormation : undefined);
        if (this.cancelledOnlineWait) return;
        body.innerHTML = `
          <p class="status-line">Отправьте этот код другу:</p>
          <div class="room-code-display">${code}</div>
          <div class="spinner"></div>
          <p class="status-line">Ожидаем подключения соперника…</p>
        `;
      } catch {
        if (this.cancelledOnlineWait) return;
        body.innerHTML = `
          <p class="status-line error">Не удалось создать комнату. Проверьте соединение и попробуйте снова.</p>
          <button class="primary-btn" data-action="retry">Повторить</button>
        `;
        this.wireEffects();
        body.querySelector('[data-action="retry"]')!.addEventListener("click", () => this.renderHostPanel());
      }
    });
  }

  /** Joining doesn't require picking a game first — the host's room announces it once connected. */
  private renderJoinPanel() {
    this.cancelledOnlineWait = false;
    this.contentEl.innerHTML = `
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <div class="panel-game-label">Chess Online</div>
        <h2 class="section-title">Присоединиться по коду</h2>
        <div class="online-body"></div>
      </div>
    `;
    this.wireEffects();
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => {
      this.cancelledOnlineWait = true;
      this.renderGamePicker();
    });
    this.renderJoinBody();
  }

  private onlineBody(): HTMLElement {
    return this.contentEl.querySelector(".online-body")!;
  }

  private renderJoinBody() {
    const body = this.onlineBody();
    body.innerHTML = `
      <p class="status-line">Введите код комнаты, полученный от друга</p>
      <input class="room-input" maxlength="5" placeholder="КОД" autocomplete="off" />
      <button class="primary-btn" data-action="join" disabled>Присоединиться</button>
      <p class="status-line"></p>
    `;
    this.wireEffects();
    const input = body.querySelector<HTMLInputElement>(".room-input")!;
    const joinBtn = body.querySelector<HTMLButtonElement>('[data-action="join"]')!;
    const status = body.querySelector<HTMLParagraphElement>(".status-line:last-child")!;
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      joinBtn.disabled = input.value.length < 4;
    });
    input.focus();
    joinBtn.addEventListener("click", async () => {
      this.unlockAudio();
      joinBtn.disabled = true;
      status.textContent = "";
      status.className = "status-line";
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      joinBtn.after(spinner);
      try {
        await this.callbacks.onJoinOnline(input.value);
        if (this.cancelledOnlineWait) return;
        status.textContent = "Подключено! Начинаем игру…";
        status.className = "status-line success";
      } catch {
        if (this.cancelledOnlineWait) return;
        status.textContent = "Не удалось подключиться. Проверьте код и попробуйте снова.";
        status.className = "status-line error";
      } finally {
        spinner.remove();
        joinBtn.disabled = false;
      }
    });
  }

  markCancelled() {
    this.cancelledOnlineWait = true;
  }

  /**
   * A gold ripple radiating from the tap/click point on every interactive button, plus the
   * scale/glow hover already handled in CSS. Safe to call repeatedly — it only ever adds
   * listeners to buttons currently in the (freshly replaced) DOM.
   */
  private wireEffects() {
    this.contentEl.querySelectorAll<HTMLButtonElement>(".menu-btn, .pill-btn, .primary-btn").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => {
        if (btn.disabled) return;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.5;
        const ripple = document.createElement("span");
        ripple.className = "btn-ripple";
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove());
      });
    });
  }
}
