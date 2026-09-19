import * as THREE from "three";
import { mesh, pickMat, type PieceMaterials, type PieceFactory } from "./meshHelpers";

/** Procedural checker-style discs, shared by both Checkers and Corners. */

const DISC_RADIUS = 0.36;
const DISC_HEIGHT = 0.16;

function discBody(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS * 0.96, DISC_HEIGHT, 40), mat);
  base.position.y = DISC_HEIGHT / 2;
  g.add(base);

  // a slightly domed cap gives the disc some life instead of a flat drum-top
  const cap = mesh(new THREE.CylinderGeometry(DISC_RADIUS * 0.86, DISC_RADIUS * 0.86, 0.03, 40), mat);
  cap.position.y = DISC_HEIGHT + 0.01;
  g.add(cap);

  // decorative concentric groove, echoing a real checker piece
  const groove = mesh(new THREE.TorusGeometry(DISC_RADIUS * 0.68, 0.012, 8, 40), mat);
  groove.rotation.x = Math.PI / 2;
  groove.position.y = DISC_HEIGHT + 0.026;
  g.add(groove);

  return g;
}

/** A plain man/checker piece — also used as the Corners marker (no kings in that game). */
export function createCheckerMan(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const mat = pickMat(mats, color);
  return discBody(mat);
}

/** A crowned king: a second, slightly smaller disc stacked on top. */
export function createCheckerKing(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const mat = pickMat(mats, color);
  const g = discBody(mat);

  const crown = mesh(new THREE.CylinderGeometry(DISC_RADIUS * 0.8, DISC_RADIUS * 0.84, DISC_HEIGHT * 0.85, 40), mat);
  crown.position.y = DISC_HEIGHT + 0.03 + (DISC_HEIGHT * 0.85) / 2;
  g.add(crown);

  const cap = mesh(new THREE.CylinderGeometry(DISC_RADIUS * 0.7, DISC_RADIUS * 0.7, 0.03, 40), mat);
  cap.position.y = DISC_HEIGHT + 0.03 + DISC_HEIGHT * 0.85 + 0.01;
  g.add(cap);

  const groove = mesh(new THREE.TorusGeometry(DISC_RADIUS * 0.55, 0.011, 8, 40), mat);
  groove.rotation.x = Math.PI / 2;
  groove.position.y = DISC_HEIGHT + 0.03 + DISC_HEIGHT * 0.85 + 0.026;
  g.add(groove);

  // a small star-like finial marks it unmistakably as a king from any camera angle
  const star = mesh(new THREE.ConeGeometry(0.05, 0.09, 5), mat);
  star.position.y = crown.position.y + (DISC_HEIGHT * 0.85) / 2 + 0.08;
  g.add(star);

  return g;
}

export const CHECKER_FACTORIES: Record<string, PieceFactory> = {
  m: createCheckerMan,
  k: createCheckerKing,
};
