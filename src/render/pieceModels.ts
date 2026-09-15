import * as THREE from "three";

/** Procedurally modeled Staunton-style chess pieces — no external 3D assets required. */

function lathe(points: [number, number][], segments = 48): THREE.BufferGeometry {
  const vec2 = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(vec2, segments);
  geo.computeVertexNormals();
  return geo;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Shared round base profile used (at different scales) by every piece for visual unity. */
function baseProfile(width: number, footHeight: number): [number, number][] {
  return [
    [0, 0],
    [width, 0],
    [width, footHeight * 0.35],
    [width * 0.82, footHeight * 0.7],
    [width * 0.78, footHeight],
  ];
}

export interface PieceMaterials {
  white: THREE.Material;
  black: THREE.Material;
}

export function createMaterials(): PieceMaterials {
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xf3ecdd,
    roughness: 0.32,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.25,
    reflectivity: 0.4,
  });
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x231a14,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    reflectivity: 0.5,
  });
  return { white, black };
}

function pickMat(mats: PieceMaterials, color: "w" | "b") {
  return color === "w" ? mats.white : mats.black;
}

export function createPawn(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const profile: [number, number][] = [
    ...baseProfile(0.34, 0.12),
    [0.2, 0.16],
    [0.13, 0.32],
    [0.17, 0.4],
    [0.13, 0.48],
    [0.18, 0.5],
    [0.15, 0.56],
    [0, 0.56],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.16, 24, 20), mat);
  head.position.y = 0.68;
  head.castShadow = true;
  g.add(head);
  return g;
}

export function createRook(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const profile: [number, number][] = [
    ...baseProfile(0.38, 0.13),
    [0.24, 0.18],
    [0.22, 0.55],
    [0.28, 0.62],
    [0.28, 0.78],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);

  // crenellated top ring
  const crenCount = 8;
  const radius = 0.27;
  for (let i = 0; i < crenCount; i++) {
    const angle = (i / crenCount) * Math.PI * 2;
    const box = mesh(new THREE.BoxGeometry(0.11, 0.14, 0.09), mat);
    box.position.set(Math.cos(angle) * radius, 0.85, Math.sin(angle) * radius);
    box.lookAt(0, 0.85, 0);
    g.add(box);
  }
  const topDisc = mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 32), mat);
  topDisc.position.y = 0.8;
  g.add(topDisc);
  return g;
}

export function createBishop(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const profile: [number, number][] = [
    ...baseProfile(0.34, 0.13),
    [0.19, 0.18],
    [0.14, 0.4],
    [0.24, 0.62],
    [0.27, 0.78],
    [0.14, 0.92],
    [0.1, 0.98],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);

  const mitre = mesh(new THREE.SphereGeometry(0.115, 24, 20), mat);
  mitre.scale.set(1, 1.3, 1);
  mitre.position.y = 1.08;
  g.add(mitre);

  // the classic diagonal mitre slit
  const slit = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat);
  slit.position.y = 1.16;
  slit.rotation.z = Math.PI / 5;
  g.add(slit);

  const finial = mesh(new THREE.SphereGeometry(0.045, 16, 16), mat);
  finial.position.y = 1.24;
  g.add(finial);
  return g;
}

export function createKnight(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const baseGeo = lathe([...baseProfile(0.36, 0.14), [0.2, 0.2], [0.18, 0.32]]);
  g.add(mesh(baseGeo, mat));

  // stylized horse-head silhouette, extruded
  const shape = new THREE.Shape();
  shape.moveTo(-0.16, 0.3);
  shape.bezierCurveTo(-0.2, 0.5, -0.17, 0.68, -0.05, 0.78);
  shape.bezierCurveTo(-0.02, 0.85, 0.05, 0.86, 0.12, 0.8);
  shape.bezierCurveTo(0.24, 0.84, 0.32, 0.78, 0.34, 0.7);
  shape.bezierCurveTo(0.3, 0.68, 0.26, 0.7, 0.24, 0.66);
  shape.bezierCurveTo(0.3, 0.62, 0.29, 0.55, 0.22, 0.54);
  shape.bezierCurveTo(0.2, 0.46, 0.1, 0.42, 0.02, 0.44);
  shape.bezierCurveTo(-0.02, 0.4, -0.02, 0.34, 0.02, 0.28);
  shape.bezierCurveTo(0.08, 0.22, 0.1, 0.16, 0.06, 0.1);
  shape.lineTo(-0.16, 0.12);
  shape.lineTo(-0.16, 0.3);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 3,
    curveSegments: 12,
  });
  extrude.center();
  extrude.computeVertexNormals();
  const head = mesh(extrude, mat);
  head.position.set(0, 0.62, 0);
  head.scale.set(1.05, 1.05, 1.05);
  g.add(head);

  // ears
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.035, 0.12, 10), mat);
    ear.position.set(side * 0.045, 1.0, 0.05);
    ear.rotation.z = side * 0.25;
    g.add(ear);
  }
  return g;
}

export function createQueen(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const profile: [number, number][] = [
    ...baseProfile(0.38, 0.14),
    [0.22, 0.2],
    [0.15, 0.5],
    [0.22, 0.75],
    [0.3, 0.9],
    [0.26, 1.0],
    [0.16, 1.04],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);

  const spikeCount = 8;
  const radius = 0.2;
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.045, 0.16, 10), mat);
    spike.position.set(Math.cos(angle) * radius, 1.1, Math.sin(angle) * radius);
    g.add(spike);
  }
  const orb = mesh(new THREE.SphereGeometry(0.07, 20, 16), mat);
  orb.position.y = 1.18;
  g.add(orb);
  return g;
}

export function createKing(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const profile: [number, number][] = [
    ...baseProfile(0.38, 0.14),
    [0.22, 0.2],
    [0.15, 0.5],
    [0.2, 0.78],
    [0.28, 0.95],
    [0.32, 1.05],
    [0.22, 1.12],
    [0.18, 1.16],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);

  const band = mesh(new THREE.TorusGeometry(0.2, 0.025, 12, 32), mat);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.98;
  g.add(band);

  // cross finial
  const crossV = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), mat);
  crossV.position.y = 1.32;
  g.add(crossV);
  const crossH = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), mat);
  crossH.position.y = 1.34;
  g.add(crossH);
  return g;
}

export type PieceFactory = (mats: PieceMaterials, color: "w" | "b") => THREE.Group;

export const PIECE_FACTORIES: Record<string, PieceFactory> = {
  p: createPawn,
  r: createRook,
  n: createKnight,
  b: createBishop,
  q: createQueen,
  k: createKing,
};
