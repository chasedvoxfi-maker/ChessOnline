import type { Difficulty } from "../game/types";
import { soundManager } from "../audio/SoundManager";

export interface MenuCallbacks {
  onStartHotseat: () => void;
  onStartAI: (difficulty: Difficulty) => void;
  onHostOnline: () => Promise<string>; // resolves with room code, rejects with error string
  onJoinOnline: (code: string) => Promise<void>;
  onOnlineReady: () => void; // called once the opponent has connected and the game should start
}


const DIFFICULTY_LABELS: { value: Difficulty; label: string; desc: string }[] = [
  { value: "easy", label: "Новичок", desc: "для расслабленной игры" },
  { value: "medium", label: "Любитель", desc: "сбалансированный вызов" },
  { value: "hard", label: "Эксперт", desc: "играет агрессивно" },
  { value: "master", label: "Мастер", desc: "считает глубоко" },
];

/** The main menu screen: mode selection, AI difficulty, and the online host/join lobby. */
export class Menu {
  el: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private cancelledOnlineWait = false;
  private callbacks: MenuCallbacks;

  constructor(callbacks: MenuCallbacks) {
    this.callbacks = callbacks;
    this.el = document.createElement("div");
    this.el.className = "menu-screen";
    this.el.innerHTML = `
      <video class="menu-bg-video hidden" autoplay muted loop playsinline></video>
      <div class="menu-bg-fallback"></div>
      <div class="menu-veil"></div>
      <div class="menu-content"></div>
    `;
    this.contentEl = this.el.querySelector(".menu-content")!;
    this.renderRoot();

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

  private renderRoot() {
    this.contentEl.innerHTML = `
      <h1 class="game-title">Chess Online</h1>
      <p class="game-subtitle">Королевская игра в трёх измерениях</p>
      <div class="menu-panel">
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
            <span class="desc">Пригласите друга по коду комнаты</span>
          </span>
        </button>
      </div>
    `;
    this.contentEl.querySelector('[data-action="hotseat"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.callbacks.onStartHotseat();
    });
    this.contentEl.querySelector('[data-action="ai"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderAiPanel();
    });
    this.contentEl.querySelector('[data-action="online"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderOnlinePanel();
    });
  }

  private renderAiPanel() {
    this.contentEl.innerHTML = `
      <h1 class="game-title">Chess Online</h1>
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
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => this.renderRoot());
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundManager.playSelect();
        this.callbacks.onStartAI(btn.dataset.difficulty as Difficulty);
      });
    });
  }

  private renderOnlinePanel() {
    this.cancelledOnlineWait = false;
    this.contentEl.innerHTML = `
      <h1 class="game-title">Chess Online</h1>
      <div class="menu-panel">
        <button class="back-btn">← Назад</button>
        <h2 class="section-title">Игра онлайн</h2>
        <div class="online-tabs">
          <button class="pill-btn active" data-tab="host">Создать комнату</button>
          <button class="pill-btn" data-tab="join">Войти по коду</button>
        </div>
        <div class="online-body"></div>
      </div>
    `;
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => {
      this.cancelledOnlineWait = true;
      this.renderRoot();
    });
    const hostTab = this.contentEl.querySelector<HTMLButtonElement>('[data-tab="host"]')!;
    const joinTab = this.contentEl.querySelector<HTMLButtonElement>('[data-tab="join"]')!;
    hostTab.addEventListener("click", () => {
      hostTab.classList.add("active");
      joinTab.classList.remove("active");
      this.renderHostBody();
    });
    joinTab.addEventListener("click", () => {
      joinTab.classList.add("active");
      hostTab.classList.remove("active");
      this.renderJoinBody();
    });
    this.renderHostBody();
  }

  private onlineBody(): HTMLElement {
    return this.contentEl.querySelector(".online-body")!;
  }

  private renderHostBody() {
    const body = this.onlineBody();
    body.innerHTML = `
      <p class="status-line">Нажмите, чтобы создать комнату и получить код для друга</p>
      <button class="primary-btn" data-action="create">Создать комнату</button>
    `;
    body.querySelector('[data-action="create"]')!.addEventListener("click", async () => {
      body.innerHTML = `<div class="spinner"></div><p class="status-line">Создаём комнату…</p>`;
      try {
        const code = await this.callbacks.onHostOnline();
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
        body.querySelector('[data-action="retry"]')!.addEventListener("click", () => this.renderHostBody());
      }
    });
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
