import * as THREE from "three";
import { TABLE_TEXTURE_PATH, type TableThemeId } from "./theme";
import { loadPhotoTexture } from "./textureLoader";

/** Outer edge of the board+frame (see board.ts: 8 squares + 2×0.4 frame thickness). */
const BOARD_OUTER_HALF = 4.4;
// Wider than the board's own frame would strictly need: the FOV solver (Board3D.FRAMING_POINTS)
// keeps whatever this resolves to on screen, so a bigger gap mostly just reads as more breathing
// room between the board and the captured pieces on wide/landscape screens — verified against the
// reported device's exact landscape viewport (844×390 CSS px) across all three camera modes.
const REST_GAP = 1.8;
/** World X where the nearest captured-piece rest slot sits, just clear of the board's frame —
 * exported so the FOV framing solver (Board3D.FRAMING_POINTS) can guarantee it stays on screen
 * even on narrow phones, instead of only the board itself. */
export const REST_CENTER_X = BOARD_OUTER_HALF + REST_GAP;
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
 * Both table themes are real photos, tiled with mirrored wrapping rather than a plain repeat —
 * a photo tile's edges don't naturally line up with themselves, and MirroredRepeatWrapping turns
 * that mismatch into a non-issue (each tile is a mirror of its neighbor, so edges always meet
 * cleanly) instead of showing as an obvious seam every repeat, without altering the photo itself
 * at all.
 */
function photoTableTexture(theme: TableThemeId): THREE.Texture {
  const tex = loadPhotoTexture(TABLE_TEXTURE_PATH[theme]);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  return tex;
}

/**
 * The wooden tabletop under the board, visible at every camera tilt. Captured pieces rest
 * directly on it, next to the board (see Board3D.restSlotPosition/nextRestSlot); there's no
 * separate tray box.
 */
export function buildTableDecor(tableTheme: TableThemeId = "light"): TableDecor {
  const group = new THREE.Group();

  // Large enough that the tabletop still fills every corner of the frame at the widest FOV /
  // shallowest camera angle the framing solver ever picks — a smaller plane let the scene's
  // background gradient peek through as jarring purple wedges in the far corners.
  const TABLE_SIZE = 90;
  const tex = photoTableTexture(tableTheme);
  // A large-enough per-tile scale (few repeats) keeps the area right around the board — what's
  // actually on screen most of the time — reading as one continuous photo rather than an
  // obviously repeating pattern.
  const repeats = TABLE_SIZE / 13;
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
