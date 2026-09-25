import type { Difficulty } from "../game/types";
import type { GameKind } from "../game/SaveGame";
import type { CornersFormation } from "../corners/CornersGame";
import { soundManager } from "../audio/SoundManager";
import { musicManager, type MusicTheme } from "../audio/MusicManager";
import { trackLibraryReady, addCustomTrack, removeCustomTrack, isCustomTrack } from "../audio/trackLibrary";
import { APP_VERSION } from "../version";
import {
  loadTheme,
  saveTheme,
  TABLE_OPTIONS,
  TABLE_TEXTURE_PATH,
  BOARD_OPTIONS,
  BOARD_TEXTURE_PATH,
  PIECE_OPTIONS,
  PIECE_COLOR_PRESETS,
  PIECE_FINISH_OPTIONS,
  type AppTheme,
  type TableThemeId,
  type BoardThemeId,
  type PieceColorId,
  type PieceFinishId,
} from "../render/theme";

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
  gear:
    '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.3-1.5-2.6-2.2.6a7.6 7.6 0 0 0-1.3-.75L15.9 6h-3l-.4 2.05c-.46.2-.9.45-1.3.75l-2.2-.6-1.5 2.6 1.9 1.3c-.04.5-.04 1 0 1.5l-1.9 1.3 1.5 2.6 2.2-.6c.4.3.84.55 1.3.75L12.9 20h3l.4-2.05c.46-.2.9-.45 1.3-.75l2.2.6 1.5-2.6-1.9-1.3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
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
  private launcherEl: HTMLDivElement;
  private scrollHintEl: HTMLDivElement;
  private cancelledOnlineWait = false;
  private callbacks: MenuCallbacks;
  private continueInfo: Partial<Record<GameKind, ContinueInfo>>;
  private selectedGame: GameKind = "chess";
  private selectedFormation: CornersFormation = "rectangle";
  private theme: AppTheme = loadTheme();

  constructor(callbacks: MenuCallbacks, continueInfo: Partial<Record<GameKind, ContinueInfo>> = {}) {
    this.callbacks = callbacks;
    this.continueInfo = continueInfo;
    this.el = document.createElement("div");
    this.el.className = "menu-screen";
    this.el.innerHTML = `
      <video class="menu-bg-video hidden" autoplay muted loop playsinline></video>
      <div class="menu-bg-fallback"></div>
      <div class="menu-veil"></div>
      <div class="menu-audio-controls">
        <button class="audio-toggle-btn" data-action="toggle-music" title="Музыка"></button>
        <button class="audio-toggle-btn" data-action="toggle-sound" title="Звуки"></button>
        <button class="audio-toggle-btn" data-action="open-settings" title="Настройки">${SVG_ICONS.gear}</button>
      </div>
      <div class="game-launcher hidden">
        <button class="launcher-trigger" data-action="toggle-launcher">
          ${iconBadge("play")}
          <span>Играть</span>
        </button>
        <div class="launcher-dropdown hidden"></div>
      </div>
      <div class="menu-content"></div>
      <div class="menu-scroll-hint hidden" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="app-version">v${APP_VERSION}</div>
    `;
    this.contentEl = this.el.querySelector(".menu-content")!;
    this.launcherEl = this.el.querySelector(".game-launcher")!;
    this.scrollHintEl = this.el.querySelector(".menu-scroll-hint")!;
    this.wireLauncher();
    this.renderGamePicker();
    this.wireAudioControls();
    // Outside contentEl (never wiped by a panel's innerHTML replace) so a single listener covers
    // every panel; wireEffects() itself calls updateScrollHint() after each re-render.
    this.contentEl.addEventListener("scroll", () => this.updateScrollHint());
    window.addEventListener("resize", () => this.updateScrollHint());
    this.el.querySelector('[data-action="open-settings"]')!.addEventListener("click", () => {
      soundManager.playSelect();
      // Pressing the gear again while settings is already open closes it back to the game
      // picker, the same as the panel's own "← Назад" button.
      if (this.contentEl.querySelector(".settings-panel")) this.renderGamePicker();
      else this.renderSettingsPanel();
    });
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

  /** Wires the launcher's own toggle + outside-click/Escape-to-close handling once, for the
   * lifetime of this Menu instance — renderGamePicker() only ever refills .launcher-dropdown's
   * content, so these don't need re-wiring on every re-render. */
  private wireLauncher() {
    const trigger = this.launcherEl.querySelector<HTMLButtonElement>(".launcher-trigger")!;
    this.wireEffects(this.launcherEl);
    trigger.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      const dropdown = this.launcherEl.querySelector<HTMLDivElement>(".launcher-dropdown")!;
      const opening = dropdown.classList.contains("hidden");
      dropdown.classList.toggle("hidden");
      if (opening) this.renderLauncherList();
    });
    document.addEventListener("click", (e) => {
      const dropdown = this.launcherEl.querySelector<HTMLDivElement>(".launcher-dropdown");
      // composedPath() reflects the click's target chain as it was at dispatch time — unlike
      // launcherEl.contains(e.target), it stays correct even when a click handler on the target
      // (e.g. picking a game) replaces the dropdown's innerHTML and detaches the clicked node
      // before this bubbling listener runs.
      if (dropdown && !dropdown.classList.contains("hidden") && !e.composedPath().includes(this.launcherEl)) {
        dropdown.classList.add("hidden");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.launcherEl.querySelector(".launcher-dropdown")?.classList.add("hidden");
    });
  }

  private closeLauncher() {
    this.launcherEl.querySelector(".launcher-dropdown")?.classList.add("hidden");
  }

  /** The launcher trigger only makes sense on the game-picker's own root screen — every other
   * screen (mode select, settings, online lobby, ...) is itself already a deliberate drill-down,
   * so the compact "Играть" button hides while one of those is showing. */
  private showLauncher(show: boolean) {
    this.launcherEl.classList.toggle("hidden", !show);
    if (!show) this.closeLauncher();
  }

  private renderGamePicker() {
    this.contentEl.innerHTML = "";
    this.showLauncher(true);
  }

  /** The dropdown's default state: one compact row per game (flagging which have a save to
   * resume), plus the online-join link. */
  private renderLauncherList() {
    const dropdown = this.launcherEl.querySelector<HTMLDivElement>(".launcher-dropdown")!;
    dropdown.innerHTML = `
      ${GAME_LABELS.map(
        (g) => `
        <button class="launcher-item menu-btn" data-game="${g.value}">
          ${iconBadge(g.icon)}
          <span>
            ${g.label}${this.continueInfo[g.value] ? "<small>есть сохранённая игра</small>" : ""}
            <span class="desc">${g.desc}</span>
          </span>
        </button>`,
      ).join("")}
      <button class="launcher-item launcher-join" data-action="join-anywhere">Есть код? Присоединиться</button>
    `;
    this.wireEffects(dropdown);
    dropdown.querySelectorAll<HTMLButtonElement>("[data-game]").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundManager.playSelect();
        const game = btn.dataset.game as GameKind;
        if (this.continueInfo[game]) this.renderLauncherConfirm(game);
        else this.startFreshGame(game);
      });
    });
    dropdown.querySelector('[data-action="join-anywhere"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.renderJoinPanel();
    });
  }

  /** A small "continue or start over" confirmation, swapped into the same dropdown — the extra
   * step only appears for a game that actually has a save, instead of a panel shown up front for
   * every game regardless of whether there's anything to continue. */
  private renderLauncherConfirm(game: GameKind) {
    const dropdown = this.launcherEl.querySelector<HTMLDivElement>(".launcher-dropdown")!;
    const info = this.continueInfo[game]!;
    dropdown.innerHTML = `
      <button class="launcher-back" data-action="back">← Назад</button>
      <p class="launcher-confirm-title">Продолжить «${GAME_TITLES[game]}»?</p>
      <p class="launcher-confirm-desc">${info.label}</p>
      <button class="launcher-item launcher-confirm-yes" data-action="continue">Да, продолжить</button>
      <button class="launcher-item launcher-confirm-no" data-action="new">Нет, начать заново</button>
    `;
    this.wireEffects(dropdown);
    dropdown.querySelector('[data-action="back"]')!.addEventListener("click", () => this.renderLauncherList());
    dropdown.querySelector('[data-action="continue"]')!.addEventListener("click", () => {
      this.unlockAudio();
      soundManager.playSelect();
      this.callbacks.onContinue(game);
    });
    dropdown.querySelector('[data-action="new"]')!.addEventListener("click", () => {
      soundManager.playSelect();
      delete this.continueInfo[game];
      this.callbacks.onDiscardSave(game);
      this.startFreshGame(game);
    });
  }

  private startFreshGame(game: GameKind) {
    this.unlockAudio();
    this.closeLauncher();
    this.selectedGame = game;
    this.selectedFormation = "rectangle";
    this.renderModeSelect();
  }

  /** Picks the look of the table, board and pieces for every future game — every option here is
   * a variant that actually shipped at some point (see render/theme.ts). Applies from the next
   * game started; there's no game running to update live while this screen is open. */
  private async renderSettingsPanel() {
    this.showLauncher(false);
    // Usually already resolved (kicked off at app bootstrap) — only a real wait the very first
    // time settings opens before the bundled-track probe + IndexedDB load finish.
    await trackLibraryReady();
    this.contentEl.innerHTML = `
      <div class="menu-panel settings-panel">
        <button class="back-btn">← Назад</button>
        <h2 class="section-title">Настройки внешнего вида</h2>

        <div class="settings-group">
          <h3 class="settings-group-title">Стол</h3>
          <div class="settings-options">
            ${TABLE_OPTIONS.map((o) => this.settingsOptionHtml("table", o.id, o.name, o.desc, this.tableSwatchStyle(o.id))).join("")}
          </div>
        </div>

        <div class="settings-group">
          <h3 class="settings-group-title">Доска</h3>
          <div class="settings-options">
            ${BOARD_OPTIONS.map((o) => this.settingsOptionHtml("board", o.id, o.name, o.desc, this.boardSwatchStyle(o.id))).join("")}
          </div>
        </div>

        <div class="settings-group">
          <h3 class="settings-group-title">Фигуры</h3>
          <div class="settings-options">
            ${PIECE_OPTIONS.map((o) => this.settingsOptionHtml("pieceColor", o.id, o.name, o.desc, this.pieceSwatchStyle(o.id, this.theme.pieceFinish))).join("")}
          </div>
        </div>

        <div class="settings-group">
          <h3 class="settings-group-title">Отделка фигур</h3>
          <div class="settings-options">
            ${PIECE_FINISH_OPTIONS.map((o) => this.settingsOptionHtml("pieceFinish", o.id, o.name, o.desc, this.pieceSwatchStyle(this.theme.pieceColor, o.id))).join("")}
          </div>
        </div>

        <div class="settings-group">
          <h3 class="settings-group-title">Музыка</h3>
          ${this.musicThemeBlockHtml("menu", "Главное меню")}
          ${this.musicThemeBlockHtml("game", "Во время партии")}
          <p class="settings-note">Загруженные треки хранятся только в этом браузере и не передаются никуда.</p>
        </div>

        <p class="settings-note">Внешний вид применится к следующей начатой партии.</p>
      </div>
    `;
    this.wireEffects();
    this.contentEl.querySelector(".back-btn")!.addEventListener("click", () => this.renderGamePicker());
    this.contentEl.querySelectorAll<HTMLButtonElement>(".settings-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundManager.playSelect();
        const kind = btn.dataset.kind as "table" | "board" | "pieceColor" | "pieceFinish";
        const id = btn.dataset.id!;
        if (kind === "table") this.theme.table = id as TableThemeId;
        else if (kind === "board") this.theme.board = id as BoardThemeId;
        else if (kind === "pieceColor") this.theme.pieceColor = id as PieceColorId;
        else this.theme.pieceFinish = id as PieceFinishId;
        saveTheme(this.theme);
        this.renderSettingsPanel();
      });
    });
    this.wireMusicSection();
  }

  private static escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  }

  private musicThemeBlockHtml(theme: MusicTheme, label: string): string {
    const tracks = musicManager.getTracks(theme);
    const rows = tracks.length
      ? tracks
          .map(
            (t) => `
        <div class="music-track-row">
          <span class="music-track-title">${Menu.escapeHtml(t.title)}</span>
          ${isCustomTrack(t.id) ? `<button class="music-track-remove" data-remove-theme="${theme}" data-remove-id="${t.id}" title="Удалить трек">✕</button>` : ""}
        </div>`,
          )
          .join("")
      : `<p class="music-track-empty">Треков нет — играет фоновая мелодия</p>`;
    return `
      <div class="music-theme-block">
        <p class="music-theme-label">${label}</p>
        <div class="music-track-list">${rows}</div>
        <label class="music-add-btn">
          <span class="music-add-icon">+</span> Добавить трек
          <input type="file" accept="audio/*" data-add-theme="${theme}" hidden />
        </label>
      </div>`;
  }

  private wireMusicSection() {
    this.contentEl.querySelectorAll<HTMLButtonElement>(".music-track-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        soundManager.playSelect();
        const theme = btn.dataset.removeTheme as MusicTheme;
        const id = btn.dataset.removeId!;
        await removeCustomTrack(theme, id);
        this.renderSettingsPanel();
      });
    });
    this.contentEl.querySelectorAll<HTMLInputElement>("[data-add-theme]").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        this.unlockAudio();
        const theme = input.dataset.addTheme as MusicTheme;
        await addCustomTrack(theme, file);
        soundManager.playSelect();
        this.renderSettingsPanel();
      });
    });
  }

  private settingsOptionHtml(kind: "table" | "board" | "pieceColor" | "pieceFinish", id: string, name: string, desc: string, swatchStyle: string): string {
    const active = this.theme[kind] === id;
    return `
      <button class="settings-option ${active ? "active" : ""}" data-kind="${kind}" data-id="${id}">
        <span class="settings-swatch" style="${swatchStyle}"></span>
        <span class="settings-option-label">${name}<small>${desc}</small></span>
        ${active ? '<span class="settings-check">✓</span>' : ""}
      </button>`;
  }

  private tableSwatchStyle(id: TableThemeId): string {
    return `background-image:url(${TABLE_TEXTURE_PATH[id]});background-size:cover;`;
  }

  private boardSwatchStyle(id: BoardThemeId): string {
    return `background-image:url(${BOARD_TEXTURE_PATH[id]});background-size:cover;`;
  }

  /** Renders a color+finish combination — used for both the color group (varying color, current
   * finish) and the finish group (current color, varying finish) so each preview reflects the
   * actual combination that choice would produce. */
  private pieceSwatchStyle(colorId: PieceColorId, finishId: PieceFinishId): string {
    const color = PIECE_COLOR_PRESETS[colorId];
    const base = `#${color.color.toString(16).padStart(6, "0")}`;
    const top = `#${color.gradientTop.toString(16).padStart(6, "0")}`;
    if (finishId === "glossy") {
      // a tight, bright highlight for a lacquered look
      return `background:radial-gradient(circle at 32% 26%, #ffffff, ${top} 20%, ${base} 65%);`;
    }
    // a soft, muted highlight for a matte look — no sharp specular dot
    return `background:radial-gradient(circle at 35% 32%, ${top}, ${base} 80%);`;
  }

  private renderModeSelect() {
    this.showLauncher(false);
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
    this.showLauncher(false);
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
    this.showLauncher(false);
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
    this.showLauncher(false);
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
  private wireEffects(root: HTMLElement = this.contentEl) {
    root.querySelectorAll<HTMLButtonElement>(".menu-btn, .pill-btn, .primary-btn, .launcher-trigger, .launcher-item").forEach((btn) => {
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
    // Every panel render calls wireEffects() with the default root (contentEl) — piggyback the
    // scroll-hint refresh there instead of adding it to each of the 8 render methods separately.
    if (root === this.contentEl) this.updateScrollHint();
  }

  /** Shows a bouncing "more below" chevron whenever the current panel overflows and hasn't been
   * scrolled all the way down yet — on a short landscape phone a single mode-select button can
   * already fill the whole viewport, giving no hint that "Игра с компьютером"/"Игра онлайн" are
   * just below it otherwise (native mobile browsers don't show a scrollbar until mid-scroll). */
  private updateScrollHint() {
    const el = this.contentEl;
    const overflowing = el.scrollHeight > el.clientHeight + 4;
    const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 4;
    this.scrollHintEl.classList.toggle("hidden", !overflowing || atBottom);
  }
}
