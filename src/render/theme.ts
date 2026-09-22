/**
 * Selectable look-and-feel for the table, board and pieces — every option here is a variant
 * that actually shipped at some point, kept around as a pickable preset instead of being
 * thrown away when the "current" look moved on.
 */

export type TableThemeId = "light" | "dark";
export type BoardThemeId = "light" | "dark";
export type PieceThemeId = "walnut-light" | "walnut-dark" | "classic-black";

export interface AppTheme {
  table: TableThemeId;
  board: BoardThemeId;
  pieces: PieceThemeId;
}

const KEY = "chessonline-theme-v1";

export const DEFAULT_THEME: AppTheme = { table: "light", board: "light", pieces: "walnut-light" };

export function loadTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppTheme>;
      return {
        table: parsed.table === "dark" ? "dark" : DEFAULT_THEME.table,
        board: parsed.board === "dark" ? "dark" : DEFAULT_THEME.board,
        pieces:
          parsed.pieces === "walnut-dark" || parsed.pieces === "classic-black" ? parsed.pieces : DEFAULT_THEME.pieces,
      };
    }
  } catch {
    // best-effort only
  }
  return { ...DEFAULT_THEME };
}

export function saveTheme(theme: AppTheme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    // best-effort only
  }
}

/** Table plank palettes, shared by the 3D texture generator (tableDecor.ts) and the settings
 * screen's swatch preview, so the preview is pixel-accurate rather than an approximation. */
export const TABLE_PALETTES: Record<TableThemeId, { colors: string[]; seam: string }> = {
  light: {
    colors: ["#e9cd9e", "#eed6ac", "#e4c48f", "#f0dab3", "#e6c896", "#ecd2a5"],
    seam: "rgba(95, 66, 36, 0.35)",
  },
  dark: {
    colors: ["#6b4a2e", "#5c3f26", "#74522f", "#654428", "#5f4227", "#70502e"],
    seam: "rgba(35, 22, 10, 0.5)",
  },
};

export const TABLE_OPTIONS: { id: TableThemeId; name: string; desc: string }[] = [
  { id: "light", name: "Светлый дуб", desc: "тёплые светлые доски стола" },
  { id: "dark", name: "Тёмный орех", desc: "тёмные доски стола" },
];

/**
 * Draws the same long-plank pattern buildTableDecor() turns into a 3D texture, as a plain
 * canvas — shared so the Settings screen's preview swatch is pixel-accurate instead of an
 * approximation, without pulling three.js into this module.
 */
export function renderPlankCanvas(theme: TableThemeId, size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const plankCount = 6;
  const plankWidth = size / plankCount;
  const { colors: palette, seam: seamColor } = TABLE_PALETTES[theme];

  for (let i = 0; i < plankCount; i++) {
    const x = i * plankWidth;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x, 0, plankWidth, size);
    ctx.fillStyle = seamColor;
    ctx.fillRect(x, 0, 1, size);
  }
  return canvas;
}

/** Board photo textures — the "light" one is the current, warmth-lifted version; "dark" is the
 * original perspective-corrected photo before that adjustment, kept as a moodier alternative. */
export const BOARD_TEXTURE_PATH: Record<BoardThemeId, string> = {
  light: "/ChessOnline/textures/board-surface.webp",
  dark: "/ChessOnline/textures/board-surface-dark.webp",
};

export const BOARD_OPTIONS: { id: BoardThemeId; name: string; desc: string }[] = [
  { id: "light", name: "Светлая доска", desc: "светлое фото доски, тёплый тон" },
  { id: "dark", name: "Тёмная доска", desc: "исходное фото доски, контрастнее" },
];

/** Piece material presets, shared by meshHelpers.ts (the real 3D material) and the settings
 * screen's swatch preview. */
export const PIECE_PRESETS: Record<
  PieceThemeId,
  {
    color: number;
    gradientTop: number;
    outline: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    reflectivity: number;
  }
> = {
  "walnut-light": { color: 0x5a4028, gradientTop: 0x8f6a41, outline: 0x33240f, roughness: 0.6, clearcoat: 0.18, clearcoatRoughness: 0.45, reflectivity: 0.25 },
  "walnut-dark": { color: 0x3c2a1a, gradientTop: 0x76512f, outline: 0x241a10, roughness: 0.6, clearcoat: 0.18, clearcoatRoughness: 0.45, reflectivity: 0.25 },
  "classic-black": { color: 0x2a2018, gradientTop: 0x5a4632, outline: 0x413c48, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, reflectivity: 0.5 },
};

export const PIECE_OPTIONS: { id: PieceThemeId; name: string; desc: string }[] = [
  { id: "walnut-light", name: "Светлый орех", desc: "тёплые светло-коричневые чёрные фигуры" },
  { id: "walnut-dark", name: "Тёмный орех", desc: "более тёмные деревянные чёрные фигуры" },
  { id: "classic-black", name: "Классический чёрный", desc: "глянцевые чёрные фигуры" },
];
