import type { Difficulty } from "../game/types";
import type { GameKind } from "../game/SaveGame";
import type { CornersFormation } from "../corners/CornersGame";
import { soundManager } from "../audio/SoundManager";

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
  { value: "corners", icon: "🔺", label: "Уголки", desc: "переведите все фишки в дальний угол" },
];

const GAME_TITLES: Record<GameKind, string> = { chess: "Шахматы", checkers: "Шашки", corners: "Уголки" };

/** The main menu screen: game picker, mode selection, AI difficulty, and the online host/join lobby. */
export class Menu {
  el: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private cancelledOnlineWait = false;
  private callbacks: MenuCallbacks;
  private continueInfo: Partial<Record<GameKind, ContinueInfo>>;
  private selectedGame: GameKind = "chess";
  private selectedFormation: CornersFormation = "triangle";

  constructor(callbacks: MenuCallbacks, continueInfo: Partial<Record<GameKind, ContinueInfo>> = {}) {
    this.callbacks = callbacks;
    this.continueInfo = continueInfo;
    this.el = document.createElement("div");
    this.el.className = "menu-screen";
    this.el.innerHTML = `
      <video class="menu-bg-video hidden" autoplay muted loop playsinline></video>
      <div class="menu-bg-fallback"></div>
      <div class="menu-veil"></div>
      <div class="menu-content"></div>
    `;
    this.contentEl = this.el.querySelector(".menu-content")!;
    this.renderGamePicker();

    const video = this.el.querySelector<HTMLVideoElement>(".menu-bg-video")!;
    void video; // Hook for a future background video: set video.src = "/menu-bg.mp4" and remove "hidden".
  }

  /** Call with a URL to install a background video behind the menu (e.g. from public/). */
  setBackgroundVideo(url: string) {
    const video = this.el.querySelector<HTMLVideoElement>(".menu-bg-video")!;
    video.src = url;
    video.classList.remove("hidden");
  }

  private unlockAudio() {
    soundManager.unlock();
  }

  private renderGamePicker() {
    const continuePanels = GAME_LABELS.filter((g) => this.continueInfo[g.value]).map(
      (g) => `
      <div class="menu-panel continue-panel">
        <button class="menu-btn continue-btn" data-continue="${g.value}">
          <span class="icon">▶️</span>
          <span>
            Продолжить: ${GAME_TITLES[g.value]}
            <span class="desc">${this.continueInfo[g.value]!.label}</span>
          </span>
        </button>
        <button class="back-btn" data-discard="${g.value}">Начать новую игру, удалив сохранённую</button>
      </div>`,
    );

    this.contentEl.innerHTML = `
      <h1 class="game-title">Chess Online</h1>
      <p class="game-subtitle">Три классические игры в трёх измерениях</p>
      ${continuePanels.join("")}
      <div class="menu-panel">
        ${GAME_LABELS.map(
          (g) => `
          <button class="menu-btn" data-game="${g.value}">
            <span class="icon">${g.icon}</span>
            <span>
              ${g.label}
              <span class="desc">${g.desc}</span>
            </span>
          </button>`,
        ).join("")}
      </div>
      <button class="back-btn" data-action="join-anywhere">Есть код от друга? Присоединиться</button>
    `;

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
        this.selectedFormation = "triangle";
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
      <h1 class="game-title">${GAME_TITLES[game]}</h1>
      <div class="menu-panel">
        <button class="back-btn">← К выбору игры</button>
        ${
          game === "corners"
            ? `
        <h2 class="section-title">Расстановка</h2>
        <div class="online-tabs">
          <button class="pill-btn ${this.selectedFormation === "triangle" ? "active" : ""}" data-formation="triangle">Треугольником</button>
          <button class="pill-btn ${this.selectedFormation === "rectangle" ? "active" : ""}" data-formation="rectangle">Прямоугольником</button>
        </div>`
            : ""
        }
        <button class="menu-btn" data-action="hotseat">
          <span class="icon">🎭</span>
          <span>
            Два игрока за одним экраном
            <span class="desc">Играйте по очереди, камера разворачивается к каждому</span>
          </span>
        </button>
        <button class="menu-btn" data-action="ai">
          <span class="icon">🤖</span>
          <span>
            Игра с компьютером
            <span class="desc">Выберите уровень сложности соперника</span>
          </span>
        </button>
        <button class="menu-btn" data-action="online">
          <span class="icon">🌐</span>
          <span>
            Игра онлайн
            <span class="desc">Создайте комнату и пригласите друга по коду</span>
          </span>
        </button>
      </div>
    `;
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
      <h1 class="game-title">${GAME_TITLES[game]}</h1>
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
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
      <h1 class="game-title">${GAME_TITLES[game]}</h1>
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <h2 class="section-title">Игра онлайн</h2>
        <div class="online-body"></div>
      </div>
    `;
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => {
      this.cancelledOnlineWait = true;
      this.renderModeSelect();
    });
    const body = this.onlineBody();
    body.innerHTML = `
      <p class="status-line">Нажмите, чтобы создать комнату и получить код для друга</p>
      <button class="primary-btn" data-action="create">Создать комнату</button>
    `;
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
        body.querySelector('[data-action="retry"]')!.addEventListener("click", () => this.renderHostPanel());
      }
    });
  }

  /** Joining doesn't require picking a game first — the host's room announces it once connected. */
  private renderJoinPanel() {
    this.cancelledOnlineWait = false;
    this.contentEl.innerHTML = `
      <h1 class="game-title">Chess Online</h1>
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <h2 class="section-title">Присоединиться по коду</h2>
        <div class="online-body"></div>
      </div>
    `;
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
}
