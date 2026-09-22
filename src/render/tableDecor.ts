import * as THREE from "three";
import { loadPhotoTexture } from "./textureLoader";

/** Outer edge of the board+frame (see board.ts: 8 squares + 2×0.4 frame thickness). */
const BOARD_OUTER_HALF = 4.4;

/** Trays sit to the board's left/right: narrow across (X), long along the board's depth (Z). */
export const TRAY_SPAN = 7.2;
export const TRAY_THICKNESS = 1.7;
const TRAY_WALL = 0.3;
const TRAY_GAP = 0.35;
export const TRAY_CENTER_X = BOARD_OUTER_HALF + TRAY_GAP + TRAY_THICKNESS / 2;
const TABLE_Y = -0.64;

export interface TableDecor {
  group: THREE.Group;
  /** World X of the tray to the board's left. */
  leftTrayX: number;
  /** World X of the tray to the board's right. */
  rightTrayX: number;
  /** World Y a captured piece should rest at once placed in either tray. */
  traySlotY: number;
}

function createTray(woodTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: woodTexture,
    roughness: 0.65,
    clearcoat: 0.08,
  });
  const outer = new THREE.Mesh(new THREE.BoxGeometry(TRAY_THICKNESS, TRAY_WALL, TRAY_SPAN), woodMat);
  outer.position.y = TRAY_WALL / 2;
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(outer);

  const feltMat = new THREE.MeshPhysicalMaterial({ color: 0x18120f, roughness: 0.95 });
  const inset = 0.18;
  const felt = new THREE.Mesh(new THREE.BoxGeometry(TRAY_THICKNESS - inset * 2, TRAY_WALL * 0.45, TRAY_SPAN - inset * 2), feltMat);
  felt.position.y = TRAY_WALL * 0.85;
  felt.receiveShadow = true;
  group.add(felt);

  return group;
}

/**
 * A wooden tabletop under the board plus two shallow felt-lined trays to its left/right, for
 * captured pieces to be visually set into (the "table view" camera skin). Hidden by default —
 * Board3D toggles the group's visibility via setTableMode().
 */
export function buildTableDecor(): TableDecor {
  const group = new THREE.Group();

  const woodPhoto = loadPhotoTexture("/ChessOnline/textures/table-wood.webp");
  woodPhoto.wrapS = woodPhoto.wrapT = THREE.RepeatWrapping;

  // Large enough that the tabletop still fills every corner of the frame at the widest FOV /
  // shallowest camera angle the framing solver ever picks — a smaller plane let the scene's
  // background gradient peek through as jarring purple wedges in the far corners.
  const TABLE_SIZE = 90;
  const tableTex = woodPhoto.clone();
  tableTex.repeat.set(21, 21);
  const tableMat = new THREE.MeshPhysicalMaterial({ map: tableTex, roughness: 0.68, clearcoat: 0.06 });
  const tableGeo = new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE);
  tableGeo.rotateX(-Math.PI / 2);
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = TABLE_Y;
  table.receiveShadow = true;
  group.add(table);

  const trayTex = woodPhoto.clone();
  trayTex.repeat.set(1, 3);

  const leftTray = createTray(trayTex);
  leftTray.position.set(-TRAY_CENTER_X, TABLE_Y, 0);
  group.add(leftTray);

  const rightTray = createTray(trayTex);
  rightTray.position.set(TRAY_CENTER_X, TABLE_Y, 0);
  group.add(rightTray);

  return {
    group,
    leftTrayX: -TRAY_CENTER_X,
    rightTrayX: TRAY_CENTER_X,
    traySlotY: TABLE_Y + TRAY_WALL * 0.85 + 0.06,
  };
}
