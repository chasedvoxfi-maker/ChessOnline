import * as THREE from "three";
import { SQUARE_SIZE } from "./coords";

/** Generates a subtle procedural wood-grain texture on a canvas — avoids shipping image assets. */
function woodTexture(baseColor: string, grainColor: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = grainColor;
    ctx.lineWidth = Math.random() * 1.5 + 0.3;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    let x = 0;
    let yy = y;
    while (x < size) {
      x += 12 + Math.random() * 20;
      yy += (Math.random() - 0.5) * 10;
      ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

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
  squareMeshes: Map<string, THREE.Mesh>;
  highlightLayer: THREE.Group;
}

export function buildBoard(): BoardBuild {
  const group = new THREE.Group();
  const squareMeshes = new Map<string, THREE.Mesh>();

  const lightTex = woodTexture("#e8d3ab", "#c9a86a");
  const darkTex = woodTexture("#7a4a2b", "#4d2c17");

  const lightMat = new THREE.MeshPhysicalMaterial({ map: lightTex, roughness: 0.5, clearcoat: 0.25, metalness: 0 });
  const darkMat = new THREE.MeshPhysicalMaterial({ map: darkTex, roughness: 0.45, clearcoat: 0.3, metalness: 0 });

  const squareGeo = new THREE.BoxGeometry(SQUARE_SIZE * 0.98, 0.12, SQUARE_SIZE * 0.98);

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const isLight = (file + rank) % 2 === 1;
      const mesh = new THREE.Mesh(squareGeo, isLight ? lightMat : darkMat);
      const square = String.fromCharCode(97 + file) + (rank + 1);
      const x = (file - 3.5) * SQUARE_SIZE;
      const z = (3.5 - rank) * SQUARE_SIZE;
      mesh.position.set(x, -0.06, z);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `square-${square}`;
      group.add(mesh);
      squareMeshes.set(square, mesh);
    }
  }

  // frame
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x2b1710, roughness: 0.35, clearcoat: 0.5 });
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

  return { group, squareMeshes, highlightLayer };
}
