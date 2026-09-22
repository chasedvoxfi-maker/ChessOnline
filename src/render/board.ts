import * as THREE from "three";
import { SQUARE_SIZE } from "./coords";
import { loadPhotoTexture } from "./textureLoader";
import { BOARD_TEXTURE_PATH, type BoardThemeId } from "./theme";

/** A small flat coordinate glyph (file letter or rank number), printed on the frame like a real board. */
function createCoordLabel(text: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#d9c49a";
  ctx.font = "700 42px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 35);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const geo = new THREE.PlaneGeometry(0.17, 0.17);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

export interface BoardBuild {
  group: THREE.Group;
  highlightLayer: THREE.Group;
}

export function buildBoard(boardTheme: BoardThemeId = "light"): BoardBuild {
  const group = new THREE.Group();

  // The playing surface is a single photo of a real board (perspective-corrected to a flat,
  // regular 8x8 grid before export) rather than 64 separately-colored squares — one texture,
  // one draw call, and every square gets its own bit of real wood grain instead of a repeated
  // swatch.
  const surfaceTex = loadPhotoTexture(BOARD_TEXTURE_PATH[boardTheme]);
  const surfaceMat = new THREE.MeshPhysicalMaterial({ map: surfaceTex, roughness: 0.62, clearcoat: 0.08, metalness: 0 });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x3a2416, roughness: 0.6, clearcoat: 0.1 });
  const slabGeo = new THREE.BoxGeometry(8 * SQUARE_SIZE, 0.12, 8 * SQUARE_SIZE);
  // BoxGeometry face order: +x, -x, +y (top), -y, +z, -z — only the top needs the photo.
  const slab = new THREE.Mesh(slabGeo, [edgeMat, edgeMat, surfaceMat, edgeMat, edgeMat, edgeMat]);
  slab.position.y = -0.06;
  slab.receiveShadow = true;
  slab.castShadow = false;
  group.add(slab);

  // frame
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x2b1710, roughness: 0.5, clearcoat: 0.2 });
  const frameThickness = 0.4;
  const outer = 8 * SQUARE_SIZE + frameThickness * 2;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-outer / 2, -outer / 2);
  frameShape.lineTo(outer / 2, -outer / 2);
  frameShape.lineTo(outer / 2, outer / 2);
  frameShape.lineTo(-outer / 2, outer / 2);
  frameShape.lineTo(-outer / 2, -outer / 2);
  const hole = new THREE.Path();
  const inner = 8 * SQUARE_SIZE;
  hole.moveTo(-inner / 2, -inner / 2);
  hole.lineTo(inner / 2, -inner / 2);
  hole.lineTo(inner / 2, inner / 2);
  hole.lineTo(-inner / 2, inner / 2);
  hole.lineTo(-inner / 2, -inner / 2);
  frameShape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
  frameGeo.rotateX(Math.PI / 2);
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.y = -0.25;
  frameMesh.receiveShadow = true;
  frameMesh.castShadow = true;
  group.add(frameMesh);

  // base plinth beneath the frame
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(outer * 1.02, 0.25, outer * 1.02), frameMat);
  plinth.position.y = -0.5;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  // file/rank coordinates, printed small on the frame like a real board — on both opposite
  // edges (so they read the same way regardless of which side the camera currently faces)
  const FILES = "abcdefgh";
  const edgeOffset = inner / 2 + frameThickness / 2;
  const labelY = 0.06; // just proud of the frame's top surface
  for (let file = 0; file < 8; file++) {
    const x = (file - 3.5) * SQUARE_SIZE;
    const near = createCoordLabel(FILES[file]);
    near.position.set(x, labelY, edgeOffset);
    group.add(near);
    const far = createCoordLabel(FILES[file]);
    far.position.set(x, labelY, -edgeOffset);
    group.add(far);
  }
  for (let rank = 0; rank < 8; rank++) {
    const z = (3.5 - rank) * SQUARE_SIZE;
    const left = createCoordLabel(String(rank + 1));
    left.position.set(-edgeOffset, labelY, z);
    group.add(left);
    const right = createCoordLabel(String(rank + 1));
    right.position.set(edgeOffset, labelY, z);
    group.add(right);
  }

  const highlightLayer = new THREE.Group();
  group.add(highlightLayer);

  return { group, highlightLayer };
}
