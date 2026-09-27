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
  /** Specular sheen/reflections on the board surface and pieces (the clearcoat pass on their
   * materials) — a real, separate fragment-shader cost from shadows, on a device where even a
   * flat-lit scene struggles. Independent of the piece "Отделка" (glossy/matte) look, which is a
   * style choice on the pieces only and stays whatever it was set to; this flattens the board's
   * own surface too, for a device that needs every bit of it back. */
  highlights: boolean;
  /** The tabletop's wood-photo texture, tiled across a large plane — a plain flat color instead
   * skips that image entirely (no decode/upload, no per-pixel sampling), the biggest single
   * texture-driven cost in the scene after the board and pieces themselves. */
  simpleTable: boolean;
}

const KEY = "chessonline-graphics-v1";

export const DEFAULT_GRAPHICS: GraphicsPrefs = { quality: "high", shadows: true, highlights: true, simpleTable: false };

export function loadGraphicsPrefs(): GraphicsPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphicsPrefs>;
      return {
        quality: parsed.quality === "medium" || parsed.quality === "low" ? parsed.quality : DEFAULT_GRAPHICS.quality,
        shadows: typeof parsed.shadows === "boolean" ? parsed.shadows : DEFAULT_GRAPHICS.shadows,
        highlights: typeof parsed.highlights === "boolean" ? parsed.highlights : DEFAULT_GRAPHICS.highlights,
        simpleTable: typeof parsed.simpleTable === "boolean" ? parsed.simpleTable : DEFAULT_GRAPHICS.simpleTable,
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

export const HIGHLIGHTS_OPTIONS: { id: "on" | "off"; name: string; desc: string }[] = [
  { id: "on", name: "Блики включены", desc: "глянец на доске и фигурах" },
  { id: "off", name: "Блики выключены", desc: "быстрее на слабых устройствах" },
];

export const TABLE_TEXTURE_OPTIONS: { id: "photo" | "simple"; name: string; desc: string }[] = [
  { id: "photo", name: "Фото стола", desc: "настоящая текстура дерева" },
  { id: "simple", name: "Простая текстура", desc: "однотонный стол — быстрее на слабых устройствах" },
];

/** Pixel-ratio cap per quality level — the single biggest lever on fragment-shader cost, since
 * it scales with the square of the device's actual rendered resolution. */
export const QUALITY_PIXEL_RATIO: Record<GraphicsQuality, number> = {
  high: 2,
  medium: 1.5,
  low: 1,
};

/** Shared "flatten it" material values for when highlights are turned off — used by the board
 * surface/frame and tabletop alike (the piece materials have their own per-finish presets, see
 * meshHelpers.ts, but get flattened to these same numbers too when this is on). */
export const FLAT_FINISH = { roughness: 0.9, clearcoat: 0, clearcoatRoughness: 0.9, reflectivity: 0.04 };
