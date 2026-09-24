/**
 * The game is landscape-only: on a touch device held in portrait, this fully covers the board
 * with an animated "rotate your phone" cue instead of trying to render a cramped portrait
 * layout. It shows/hides itself automatically as the device is turned.
 */
const PORTRAIT_TOUCH = "(orientation: portrait) and (pointer: coarse)";

export class RotateGate {
  el: HTMLDivElement;
  private mql: MediaQueryList;
  private onChange = () => this.sync();

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "rotate-gate";
    this.el.innerHTML = `
      <div class="rotate-gate-icon">
        <div class="rotate-gate-glow"></div>
        <svg viewBox="0 0 100 100">
          <g class="phone-rotor">
            <rect x="33" y="18" width="34" height="64" rx="7" fill="#161020" stroke="#f3d999" stroke-width="2.5"/>
            <rect x="44" y="23.5" width="12" height="2.4" rx="1.2" fill="#f3d999" opacity="0.75"/>
            <circle cx="50" cy="74" r="2.3" fill="#f3d999"/>
          </g>
          <g class="rotate-arrow-badge">
            <circle cx="76" cy="76" r="13" fill="#1c1424" stroke="#d4af6a" stroke-width="1.5"/>
            <path d="M72.2 70.5a6 6 0 1 1 -1.7 6.2" fill="none" stroke="#f3d999" stroke-width="2" stroke-linecap="round"/>
            <path d="M70.3 68.3l0.6 4.4 4.2-1.4z" fill="#f3d999"/>
          </g>
        </svg>
      </div>
      <div class="rotate-gate-title">Поверните телефон</div>
      <div class="rotate-gate-subtitle">Игра открывается в горизонтальном положении — так доска видна крупнее</div>
    `;
    container.appendChild(this.el);

    this.mql = window.matchMedia(PORTRAIT_TOUCH);
    this.mql.addEventListener("change", this.onChange);
    this.sync();
  }

  private sync() {
    this.el.classList.toggle("visible", this.mql.matches);
  }

  dispose() {
    this.mql.removeEventListener("change", this.onChange);
    this.el.remove();
  }
}

/** Best-effort: ask the browser to lock into landscape (Android Chrome et al.); silently no-ops where unsupported (notably iOS Safari), which is exactly when RotateGate's manual cue matters most. */
export async function tryLockLandscape() {
  try {
    const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!orientation?.lock) return;
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
    await orientation.lock("landscape");
  } catch {
    // unsupported or denied — RotateGate covers this case visually
  }
}

/** Undoes tryLockLandscape() — call this when leaving the game screen. Without it the page stays
 * fullscreen and orientation-locked to landscape after returning to the (portrait) menu, which on
 * the browsers that support the lock made the browser fight the phone's actual (portrait) sensor
 * orientation and visibly jitter the layout up and down as it kept trying to reconcile the two. */
export async function releaseLandscapeLock() {
  try {
    const orientation = screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
    orientation?.unlock?.();
  } catch {
    // unsupported — nothing to release
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // already left fullscreen, or the browser refused — nothing more to do
  }
}
