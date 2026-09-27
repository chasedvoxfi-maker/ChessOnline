/**
 * Manual graphics quality override — separate from the visual theme (table/board/piece look):
 * this is purely about performance, for a device the automatic in-game quality scaling (see
 * Board3D's perfTier) hasn't caught up with yet, or a player who'd rather just pick a setting
 * than wait for it to detect anything.
 */

export type GraphicsQuality = "high" | "medium" | "low";

export interface GraphicsPrefs {
  quality: GraphicsQuality;
  /** Real-time shadows under the pieces. The single biggest performance lever on a weak GPU —
   * exposed on its own rather than folded into "quality" since it's the one most players would
   * recognize and want to turn off first. */
  shadows: boolean;
}

const KEY = "chessonline-graphics-v1";

export const DEFAULT_GRAPHICS: GraphicsPrefs = { quality: "high", shadows: true };

export function loadGraphicsPrefs(): GraphicsPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphicsPrefs>;
      return {
        quality: parsed.quality === "medium" || parsed.quality === "low" ? parsed.quality : DEFAULT_GRAPHICS.quality,
        shadows: typeof parsed.shadows === "boolean" ? parsed.shadows : DEFAULT_GRAPHICS.shadows,
      };
    }
  } catch {
    // best-effort only
  }
  return { ...DEFAULT_GRAPHICS };
}

export function saveGraphicsPrefs(prefs: GraphicsPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // best-effort only
  }
}

export const GRAPHICS_QUALITY_OPTIONS: { id: GraphicsQuality; name: string; desc: string }[] = [
  { id: "high", name: "Высокое", desc: "чёткая картинка — для мощных устройств" },
  { id: "medium", name: "Среднее", desc: "немного проще — сгладит лаги на слабых телефонах" },
  { id: "low", name: "Экономное", desc: "максимальная плавность, попроще картинка" },
];

/** Pixel-ratio cap per quality level — the single biggest lever on fragment-shader cost, since
 * it scales with the square of the device's actual rendered resolution. */
export const QUALITY_PIXEL_RATIO: Record<GraphicsQuality, number> = {
  high: 2,
  medium: 1.5,
  low: 1,
};
