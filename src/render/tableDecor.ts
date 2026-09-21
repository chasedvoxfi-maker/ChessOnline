import * as THREE from "three";
import { woodTexture } from "./board";

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

function createTray(woodColor: string): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: woodTexture(woodColor, "#3a2416", 128),
    roughness: 0.55,
    clearcoat: 0.2,
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

  const tableTex = woodTexture("#8a5a34", "#5c3a20", 512);
  tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping;
  tableTex.repeat.set(3, 3);
  const tableMat = new THREE.MeshPhysicalMaterial({ map: tableTex, roughness: 0.6, clearcoat: 0.15 });
  const tableGeo = new THREE.PlaneGeometry(26, 26);
  tableGeo.rotateX(-Math.PI / 2);
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = TABLE_Y;
  table.receiveShadow = true;
  group.add(table);

  const leftTray = createTray("#6b4226");
  leftTray.position.set(-TRAY_CENTER_X, TABLE_Y, 0);
  group.add(leftTray);

  const rightTray = createTray("#6b4226");
  rightTray.position.set(TRAY_CENTER_X, TABLE_Y, 0);
  group.add(rightTray);

  return {
    group,
    leftTrayX: -TRAY_CENTER_X,
    rightTrayX: TRAY_CENTER_X,
    traySlotY: TABLE_Y + TRAY_WALL * 0.85 + 0.06,
  };
}
