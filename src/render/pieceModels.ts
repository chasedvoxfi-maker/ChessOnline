import * as THREE from "three";
import { mesh, pickMat, createMaterials, addOutline, type PieceMaterials, type PieceFactory } from "./meshHelpers";

/** Procedurally modeled Staunton-style chess pieces — no external 3D assets required. */

export { createMaterials, addOutline, type PieceMaterials, type PieceFactory };

function lathe(points: [number, number][], segments = 48): THREE.BufferGeometry {
  const vec2 = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(vec2, segments);
  geo.computeVertexNormals();
  return geo;
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
    [0.16, 0.92],
    [0.12, 0.97],
  ];
  const body = mesh(lathe(profile), mat);
  g.add(body);

  // classic bulbous "flame" mitre — bulges out from the collar, then rounds to a point,
  // lathed (not a straight cone) so it reads solid and curved from every angle.
  const mitreProfile: [number, number][] = [
    [0.12, 0.0],
    [0.18, 0.08],
    [0.175, 0.18],
    [0.13, 0.3],
    [0.06, 0.4],
    [0.0, 0.47],
  ];
  const mitre = mesh(lathe(mitreProfile), mat);
  mitre.position.y = 0.97;
  g.add(mitre);

  // the classic diagonal mitre slit, cut across the widest part of the dome
  const slit = mesh(new THREE.BoxGeometry(0.21, 0.05, 0.05), mat);
  slit.position.y = 0.97 + 0.15;
  slit.rotation.z = Math.PI / 5;
  g.add(slit);

  const finial = mesh(new THREE.SphereGeometry(0.045, 16, 16), mat);
  finial.position.y = 0.97 + 0.47 + 0.025;
  g.add(finial);
  return g;
}

export function createKnight(mats: PieceMaterials, color: "w" | "b"): THREE.Group {
  const g = new THREE.Group();
  const mat = pickMat(mats, color);
  const baseGeo = lathe([...baseProfile(0.36, 0.14), [0.2, 0.2], [0.19, 0.34]]);
  g.add(mesh(baseGeo, mat));

  // horse-head silhouette (facing +x), extruded with modest depth so it reads as a rounded
  // head rather than a paper-thin card. One continuous curve carries the poll down through
  // the forehead to the nose point — earlier drafts stacked several separate convex/concave
  // "lobes" (temple dip, forehead bulge, bridge dip) which, once extruded with any real depth,
  // each grew their own flat side wall and made the head read as a stack of shelves instead of
  // a head. The ears are built separately in 3D below (not baked into this flat profile) so
  // they stick out and splay apart instead of lying coplanar with the face.
  const shape = new THREE.Shape();
  shape.moveTo(-0.19, 0.0); // chest/base, back-left — matches the base cylinder's top radius
  shape.lineTo(-0.19, 0.3); // straight up the back of the neck
  shape.quadraticCurveTo(-0.17, 0.48, -0.08, 0.56); // neck sweeps forward into the poll
  shape.quadraticCurveTo(-0.09, 0.68, -0.01, 0.74); // poll rounds up and over the top of the head
  shape.quadraticCurveTo(0.06, 0.78, 0.12, 0.7); // crown eases down toward the forehead
  shape.quadraticCurveTo(0.17, 0.62, 0.15, 0.52); // shallow bridge notch (concave) — the classic knight profile dip
  shape.quadraticCurveTo(0.25, 0.42, 0.36, 0.26); // nose bridge sweeps out to the nose point
  shape.quadraticCurveTo(0.3, 0.2, 0.22, 0.2); // mouth (concave, under the nose)
  shape.lineTo(0.14, 0.12); // chin
  shape.quadraticCurveTo(0.04, 0.06, -0.05, 0.08); // throat curve
  shape.lineTo(-0.19, 0.08); // chest, back to the base width
  shape.lineTo(-0.19, 0.0); // close, flush with the base

  const depth = 0.22;
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 3,
    curveSegments: 24,
  });
  // capture the pre-center bounding box so ears/nose/eye (specified in the shape's own
  // coordinate space above) can be placed precisely once the geometry is recentered.
  extrude.computeBoundingBox();
  const bbox = extrude.boundingBox!;
  const cx = (bbox.min.x + bbox.max.x) / 2;
  const cy = (bbox.min.y + bbox.max.y) / 2;
  const cz = (bbox.min.z + bbox.max.z) / 2;
  extrude.translate(-cx, -cy, -cz);
  extrude.computeVertexNormals();
  const head = mesh(extrude, mat);
  const anchor = { x: 0.01, y: 0.54, z: 0 };
  head.position.set(anchor.x, anchor.y, anchor.z);
  g.add(head);

  // maps a point given in the shape's original 2D coordinate space to its final world position
  const toWorld = (x: number, y: number, z = 0): [number, number, number] => [
    anchor.x + (x - cx),
    anchor.y + (y - cy),
    anchor.z + (z - cz),
  ];

  // two 3D ears (flattened low-poly cones), splayed outward and tilted forward so the head
  // reads correctly from the side, not just face-on
  const earGeo = new THREE.ConeGeometry(0.06, 0.24, 4, 1);
  earGeo.scale(1, 1, 0.42);
  const earSide = depth * 0.3;
  const [earX, earY] = toWorld(0.01, 0.78);
  for (const side of [1, -1]) {
    const ear = mesh(earGeo.clone(), mat);
    ear.position.set(earX, earY, side * earSide);
    ear.rotation.x = -0.32;
    ear.rotation.z = side * 0.32;
    g.add(ear);
  }

  // a snout bump (embedded slightly behind the profile's nose tip so it reads as a continuation
  // of the muzzle rather than a floating ball) and two eye bumps add roundness beyond the flat profile
  const [noseX, noseY, noseZ] = toWorld(0.32, 0.25, depth / 2);
  const nose = mesh(new THREE.SphereGeometry(0.075, 16, 14), mat);
  nose.scale.set(1.3, 0.85, 0.85);
  nose.position.set(noseX, noseY, noseZ);
  g.add(nose);

  for (const side of [1, -1]) {
    const [eyeX, eyeY, eyeZ] = toWorld(0.18, 0.5, depth / 2 + side * depth * 0.24);
    const eye = mesh(new THREE.SphereGeometry(0.028, 10, 10), mat);
    eye.position.set(eyeX, eyeY, eyeZ);
    g.add(eye);
  }

  // a short row of mane tufts along the back of the neck, like the reference photo's sawtooth mane
  const maneGeo = new THREE.ConeGeometry(0.028, 0.09, 4, 1);
  maneGeo.scale(1, 1, 0.5);
  const manePositions: [number, number][] = [
    [-0.17, 0.34],
    [-0.14, 0.42],
    [-0.1, 0.49],
    [-0.05, 0.56],
  ];
  for (const [mx, my] of manePositions) {
    const [wx, wy, wz] = toWorld(mx, my, depth / 2);
    const tuft = mesh(maneGeo.clone(), mat);
    tuft.position.set(wx, wy, wz);
    tuft.rotation.z = Math.PI * 0.62;
    g.add(tuft);
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

export const PIECE_FACTORIES: Record<string, PieceFactory> = {
  p: createPawn,
  r: createRook,
  n: createKnight,
  b: createBishop,
  q: createQueen,
  k: createKing,
};
