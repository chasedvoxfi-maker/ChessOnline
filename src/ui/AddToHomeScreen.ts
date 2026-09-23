/**
 * A one-time, full-screen hint shown on phones only (iOS/Android), telling the player how to
 * add the game to their home screen. Never shown on desktop, and never shown again once already
 * installed (running standalone) or once the player has dismissed it once — the localStorage
 * flag makes it a one-time onboarding tip, not a nag repeated on every launch.
 */
const DISMISSED_KEY = "chessonline-a2hs-dismissed-v1";

function isIOS(): boolean {
  // iPadOS 13+ reports as "MacIntel" but with touch support, unlike a real Mac.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // best-effort only
  }
}

/** Call once at app startup. No-op on desktop, once installed, or after the player has already dismissed it. */
export function maybeShowAddToHomeScreenHint() {
  if (isStandalone() || alreadyDismissed()) return;
  const ios = isIOS();
  const android = isAndroid();
  if (!ios && !android) return;

  const steps = ios
    ? [
        `Нажмите значок «Поделиться» ${SHARE_ICON} внизу экрана Safari.`,
        `Выберите «На экран «Домой»» в списке.`,
      ]
    : [
        `Откройте меню ${MENU_ICON} в браузере (три точки).`,
        `Выберите «Добавить на главный экран» или «Установить приложение».`,
      ];
  const extraNote = android ? `<p class="a2hs-note">После установки игра будет открываться в полноэкранном режиме, без адресной строки браузера.</p>` : "";

  const overlay = document.createElement("div");
  overlay.className = "a2hs-overlay";
  overlay.innerHTML = `
    <div class="a2hs-card">
      <p class="a2hs-title">Добавьте Chess Online на главный экран</p>
      <p class="a2hs-desc">Так игра будет открываться сразу, как обычное приложение:</p>
      <ol class="a2hs-steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      ${extraNote}
      <button class="a2hs-ok-btn" data-action="a2hs-dismiss">Понятно</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = () => {
    markDismissed();
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismiss(); // tap anywhere on the backdrop, not just the button
  });
  overlay.querySelector('[data-action="a2hs-dismiss"]')!.addEventListener("click", dismiss);
}

const SHARE_ICON = `<svg class="a2hs-inline-icon" viewBox="0 0 24 24"><path d="M12 2v13M8 6l4-4 4 4M5 12v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MENU_ICON = `<svg class="a2hs-inline-icon" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>`;
