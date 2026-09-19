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
  const baseGeo = lathe([...baseProfile(0.36, 0.14), [0.2, 0.2], [0.19, 0.34]]);
  g.add(mesh(baseGeo, mat));

  // horse-head silhouette (facing +x), extruded — alternating convex/concave curves (neck,
  // mane, ear, temple, forehead, nose bridge, nose, mouth, chin, throat) read clearly as equine.
  const shape = new THREE.Shape();
  shape.moveTo(-0.19, 0.0); // chest/base, back-left — matches the base cylinder's top radius
  shape.lineTo(-0.19, 0.3); // straight up the back of the neck
  shape.quadraticCurveTo(-0.17, 0.48, -0.08, 0.56); // neck sweeps forward into the poll
  shape.quadraticCurveTo(-0.1, 0.64, -0.06, 0.7); // mane bump
  shape.lineTo(-0.02, 0.74); // up to the ear's back edge
  shape.lineTo(0.04, 0.92); // ear tip
  shape.lineTo(0.09, 0.72); // ear front, back down
  shape.quadraticCurveTo(0.1, 0.62, 0.06, 0.56); // temple dip (concave)
  shape.quadraticCurveTo(0.14, 0.54, 0.22, 0.46); // forehead bulge (convex)
  shape.quadraticCurveTo(0.2, 0.4, 0.16, 0.38); // bridge dip (concave)
  shape.quadraticCurveTo(0.28, 0.36, 0.36, 0.26); // nose (strongest forward point)
  shape.quadraticCurveTo(0.3, 0.2, 0.22, 0.2); // mouth (concave, under the nose)
  shape.lineTo(0.14, 0.12); // chin
  shape.quadraticCurveTo(0.04, 0.06, -0.05, 0.08); // throat curve
  shape.lineTo(-0.19, 0.08); // chest, back to the base width
  shape.lineTo(-0.19, 0.0); // close, flush with the base

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.19,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 14,
  });
  extrude.center();
  extrude.computeVertexNormals();
  const head = mesh(extrude, mat);
  head.position.set(0.01, 0.54, 0);
  g.add(head);
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

  // solid crown base so the spikes read as a crown, not a hollow ring you see through from above
  const crownBase = mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.1, 32), mat);
  crownBase.position.y = 1.03;
  g.add(crownBase);

  const spikeCount = 8;
  const radius = 0.18;
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.05, 0.16, 10), mat);
    spike.position.set(Math.cos(angle) * radius, 1.13, Math.sin(angle) * radius);
    g.add(spike);
  }
  const orb = mesh(new THREE.SphereGeometry(0.08, 20, 16), mat);
  orb.position.y = 1.22;
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

  // solid collar (a torus here would show as a hollow ring when the camera looks down on it)
  const collar = mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 32), mat);
  collar.position.y = 0.98;
  g.add(collar);

  // small orb connecting the collar to the cross finial
  const orb = mesh(new THREE.SphereGeometry(0.09, 20, 16), mat);
  orb.position.y = 1.16;
  g.add(orb);

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
