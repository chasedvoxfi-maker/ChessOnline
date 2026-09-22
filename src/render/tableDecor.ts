import * as THREE from "three";
import { TABLE_PALETTES, type TableThemeId } from "./theme";
import { loadPhotoTexture } from "./textureLoader";

const TABLE_PHOTO_PATH = "/ChessOnline/textures/table-photo.webp";

/** Outer edge of the board+frame (see board.ts: 8 squares + 2×0.4 frame thickness). */
const BOARD_OUTER_HALF = 4.4;
const REST_GAP = 0.5;
/** How far out (world X) captured pieces rest, just clear of the board's frame — there's no
 * separate tray box any more, they simply stand on the tabletop itself. */
const REST_CENTER_X = BOARD_OUTER_HALF + REST_GAP;
const TABLE_Y = -0.64;

export interface TableDecor {
  group: THREE.Group;
  /** World X where white's captures (black pieces) rest, to the board's right. */
  rightRestX: number;
  /** World X where black's captures (white pieces) rest, to the board's left. */
  leftRestX: number;
  /** World Y a captured piece rests at once set down on the tabletop. */
  restY: number;
}

/**
 * Procedural light, warm hardwood-plank texture: long parallel boards, each its own slightly
 * different honey tone, with fine lengthwise grain streaks and the occasional cross-seam where
 * one board segment ends and the next begins. Built from flat fills rather than a repeating
 * photo tile — a small photo tiled densely enough to cover the tabletop read as an obvious grid
 * of square "panels" instead of long boards. Tileable in both directions.
 */
function lightPlankTexture(theme: TableThemeId): THREE.Texture {
  const W = 1024;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const plankCount = 9;
  const plankWidth = W / plankCount;
  const { colors: palette, seam: seamColor } = TABLE_PALETTES[theme];

  for (let i = 0; i < plankCount; i++) {
    const x = i * plankWidth;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x, 0, plankWidth, H);

    // fine lengthwise grain streaks
    for (let s = 0; s < 26; s++) {
      const sx = x + Math.random() * plankWidth;
      const sw = 0.6 + Math.random() * 1.8;
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(120,84,45,0.10)";
      ctx.fillRect(sx, 0, sw, H);
    }

    // one or two faint cross-seams where a board segment ends
    const seams = 1 + Math.floor(Math.random() * 2);
    for (let s = 0; s < seams; s++) {
      const sy = Math.random() * H;
      ctx.fillStyle = "rgba(110,78,42,0.22)";
      ctx.fillRect(x + plankWidth * 0.05, sy, plankWidth * 0.9, 1.5);
    }

    // seam between adjacent planks
    ctx.fillStyle = seamColor;
    ctx.fillRect(x, 0, 1.5, H);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The "light" table theme's real photo, tiled with mirrored wrapping rather than a plain repeat
 * — a photo tile's edges don't naturally line up with themselves, and MirroredRepeatWrapping
 * turns that mismatch into a non-issue (each tile is a mirror of its neighbor, so edges always
 * meet cleanly) instead of showing as an obvious seam every repeat, without altering the photo
 * itself at all.
 */
function photoTableTexture(): THREE.Texture {
  const tex = loadPhotoTexture(TABLE_PHOTO_PATH);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  return tex;
}

/**
 * A light, warm wooden tabletop under the board — the "table" / "topdown" camera skins. Captured
 * pieces rest directly on it, next to the board (see Board3D.restSlotPosition/nextRestSlot);
 * there's no separate tray box. Hidden by default — Board3D toggles the group's visibility via
 * setViewMode().
 */
export function buildTableDecor(tableTheme: TableThemeId = "light"): TableDecor {
  const group = new THREE.Group();

  // Large enough that the tabletop still fills every corner of the frame at the widest FOV /
  // shallowest camera angle the framing solver ever picks — a smaller plane let the scene's
  // background gradient peek through as jarring purple wedges in the far corners.
  const TABLE_SIZE = 90;
  const tex = tableTheme === "light" ? photoTableTexture() : lightPlankTexture(tableTheme);
  // A larger per-tile scale for the photo (fewer repeats) keeps the area right around the board
  // — what's actually on screen most of the time — reading as one continuous photo rather than
  // an obviously repeating pattern; the procedural dark planks tile at their original, denser
  // scale since they're seamless by construction.
  const repeats = tableTheme === "light" ? TABLE_SIZE / 13 : TABLE_SIZE / 9;
  tex.repeat.set(repeats, repeats);
  const tableMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.3 });
  const tableGeo = new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE);
  tableGeo.rotateX(-Math.PI / 2);
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = TABLE_Y;
  table.receiveShadow = true;
  group.add(table);

  return {
    group,
    rightRestX: REST_CENTER_X,
    leftRestX: -REST_CENTER_X,
    restY: TABLE_Y + 0.02,
  };
}
