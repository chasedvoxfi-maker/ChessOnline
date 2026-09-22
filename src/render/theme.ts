/**
 * Selectable look-and-feel for the table, board and pieces — every option here is a variant
 * that actually shipped at some point, kept around as a pickable preset instead of being
 * thrown away when the "current" look moved on.
 */

export type TableThemeId = "light" | "dark";
export type BoardThemeId = "light" | "dark";
export type PieceColorId = "walnut-light" | "walnut-dark" | "classic-black";
export type PieceFinishId = "glossy" | "matte";

export interface AppTheme {
  table: TableThemeId;
  board: BoardThemeId;
  pieceColor: PieceColorId;
  pieceFinish: PieceFinishId;
}

const KEY = "chessonline-theme-v1";

export const DEFAULT_THEME: AppTheme = { table: "light", board: "light", pieceColor: "walnut-light", pieceFinish: "glossy" };

export function loadTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // "pieces" was this theme's old (pre-finish-split) field name — read it as a fallback so a
      // previously saved color choice survives the split instead of silently resetting.
      const parsed = JSON.parse(raw) as Partial<AppTheme> & { pieces?: PieceColorId };
      const pieceColor = parsed.pieceColor ?? parsed.pieces;
      return {
        table: parsed.table === "dark" ? "dark" : DEFAULT_THEME.table,
        board: parsed.board === "dark" ? "dark" : DEFAULT_THEME.board,
        pieceColor:
          pieceColor === "walnut-dark" || pieceColor === "classic-black" || pieceColor === "walnut-light"
            ? pieceColor
            : DEFAULT_THEME.pieceColor,
        pieceFinish: parsed.pieceFinish === "matte" ? "matte" : DEFAULT_THEME.pieceFinish,
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

/** Table photo textures, shared by the 3D scene (tableDecor.ts, tiled with mirrored wrapping)
 * and the settings screen's swatch preview, so the preview matches exactly. */
export const TABLE_TEXTURE_PATH: Record<TableThemeId, string> = {
  light: "/ChessOnline/textures/table-photo.webp",
  dark: "/ChessOnline/textures/table-photo-dark.webp",
};

export const TABLE_OPTIONS: { id: TableThemeId; name: string; desc: string }[] = [
  { id: "light", name: "Светлый дуб", desc: "тёплые светлые доски стола" },
  { id: "dark", name: "Тёмный орех", desc: "тёмные доски стола" },
];

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

/** Piece color presets — just the base/gradient/outline color, independent of finish (below).
 * Shared by meshHelpers.ts (the real 3D material) and the settings screen's swatch preview. */
export const PIECE_COLOR_PRESETS: Record<PieceColorId, { color: number; gradientTop: number; outline: number }> = {
  "walnut-light": { color: 0x5a4028, gradientTop: 0x8f6a41, outline: 0x33240f },
  "walnut-dark": { color: 0x3c2a1a, gradientTop: 0x76512f, outline: 0x241a10 },
  "classic-black": { color: 0x2a2018, gradientTop: 0x5a4632, outline: 0x413c48 },
};

export const PIECE_OPTIONS: { id: PieceColorId; name: string; desc: string }[] = [
  { id: "walnut-light", name: "Светлый орех", desc: "тёплые светло-коричневые чёрные фигуры" },
  { id: "walnut-dark", name: "Тёмный орех", desc: "более тёмные деревянные чёрные фигуры" },
  { id: "classic-black", name: "Классический чёрный", desc: "глубокий тёмный тон" },
];

/**
 * Piece surface finish, independent of color — applies to both white and black pieces so the
 * whole set shares one finish, the way a real chess set would.
 */
export const PIECE_FINISH_PRESETS: Record<
  PieceFinishId,
  { roughness: number; clearcoat: number; clearcoatRoughness: number; reflectivity: number }
> = {
  // A real varnish coat: a strong, tight clearcoat on top of the base color throws a crisp
  // lacquered highlight — the same reason a polished wooden chess set gleams under light.
  glossy: { roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.12, reflectivity: 0.45 },
  // No clearcoat at all: light just scatters off the base color, the way unfinished or
  // satin-waxed wood looks — no lacquer sheen, no crisp highlight.
  matte: { roughness: 0.8, clearcoat: 0, clearcoatRoughness: 0.8, reflectivity: 0.1 },
};

export const PIECE_FINISH_OPTIONS: { id: PieceFinishId; name: string; desc: string }[] = [
  { id: "glossy", name: "Лакированные", desc: "глянцевый лак, чёткие блики" },
  { id: "matte", name: "Матовые", desc: "без лака, мягкая матовая поверхность" },
];
