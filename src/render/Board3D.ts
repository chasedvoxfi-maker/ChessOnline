import * as THREE from "three";
import { buildBoard } from "./board";
import { createMaterials, PIECE_FACTORIES, type PieceMaterials } from "./pieceModels";
import { squareToWorld, worldToSquare } from "./coords";
import { createSelectMarker, createLegalDot, createLastMoveMarker, CheckGlow, ConfettiSystem } from "./effects";
import type { PieceColor, PieceType } from "../game/types";

interface ActiveAnim {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  arcHeight: number;
  duration: number;
  elapsed: number;
  spin?: number;
  fadeOut?: boolean;
  onComplete?: () => void;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function bgGradientTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(256, 200, 40, 256, 300, 420);
  grad.addColorStop(0, "#2a2140");
  grad.addColorStop(0.55, "#161226");
  grad.addColorStop(1, "#070510");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

export class Board3D {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private materials: PieceMaterials;
  private pieceMeshes = new Map<string, THREE.Group>();
  private highlightLayer: THREE.Group;
  private raycastPlane: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private anims: ActiveAnim[] = [];
  private checkGlow = new CheckGlow();
  private confetti = new ConfettiSystem();
  private clock = new THREE.Clock();
  private selectMarker: THREE.Mesh;
  private legalMarkers: THREE.Mesh[] = [];
  private lastMoveMarkers: THREE.Mesh[] = [];

  // camera orbit state
  private camAngle = 0;
  private camAngleTarget = 0;
  private camHeight = 6.4;
  private camRadius = 7.4;
  private camLookY = 0.35;
  private camTransitioning = false;
  private cameraOverride = false;

  interactionEnabled = true;
  onSquareClick: ((square: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.materials = createMaterials();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = bgGradientTexture();
    this.scene.fog = new THREE.FogExp2(0x0d0a18, 0.045);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.updateCameraPosition();

    this.setupLights();

    const { group: boardGroup, highlightLayer } = buildBoard();
    this.scene.add(boardGroup);
    this.highlightLayer = highlightLayer;
    this.scene.add(this.checkGlow.group);
    this.scene.add(this.confetti.group);

    const planeGeo = new THREE.PlaneGeometry(8, 8);
    planeGeo.rotateX(-Math.PI / 2);
    this.raycastPlane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.raycastPlane.position.y = 0.07;
    this.scene.add(this.raycastPlane);

    this.selectMarker = createSelectMarker();
    this.selectMarker.visible = false;
    this.highlightLayer.add(this.selectMarker);

    this.renderer.domElement.addEventListener("click", this.handleClick);
    window.addEventListener("resize", this.handleResize);
    // Mobile Safari shows/hides its address bar and toolbar without always firing a
    // window "resize" event, which would leave the canvas sized for stale dimensions
    // and push the board's near edge behind the toolbar. visualViewport catches that.
    window.visualViewport?.addEventListener("resize", this.handleResize);
    this.handleResize();

    this.animate();
  }

  private setupLights() {
    const hemi = new THREE.HemisphereLight(0x8fa5ff, 0x2a1e14, 0.65);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2d8, 1.6);
    key.position.set(4.5, 9, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 25;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0015;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.45);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0xffe3b8, 0.35, 20);
    fill.position.set(-2, 3, 4);
    this.scene.add(fill);
  }

  private handleResize = () => {
    // Prefer the visual viewport: on mobile Safari a fixed/inset:0 container can still
    // report the larger layout-viewport size while the address bar/toolbar visually
    // cover part of it, which would frame the camera for space that isn't actually visible.
    const vv = window.visualViewport;
    const w = vv ? Math.round(vv.width) : this.container.clientWidth;
    const h = vv ? Math.round(vv.height) : this.container.clientHeight;
    this.camera.aspect = w / h;
    this.applyResponsiveFraming(w / h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.cameraOverride) this.updateCameraPosition();
  };

  /**
   * Widens the FOV and pulls the camera back for narrow/portrait screens (phones) so the
   * whole board — including the near edge closest to the player — stays inside the frame
   * instead of being cropped by the aspect ratio or hidden behind the bottom HUD chrome.
   */
  private applyResponsiveFraming(aspect: number) {
    const portraitness = Math.max(0, Math.min(1, 1 - aspect)); // 0 on wide screens, up to ~1 on tall phones
    this.camera.fov = 50 + portraitness * 34;
    this.camRadius = 7.4 + portraitness * 0.4;
    this.camHeight = this.camRadius * (6.4 / 7.4);
    this.camLookY = 0.35 - portraitness * 0.25;
  }

  private updateCameraPosition() {
    const x = Math.sin(this.camAngle) * this.camRadius;
    const z = Math.cos(this.camAngle) * this.camRadius;
    this.camera.position.set(x, this.camHeight, z);
    this.camera.lookAt(0, this.camLookY, 0);
  }

  /** Instantly orient the camera behind the given color's side, 45°-ish "eye view". */
  setOrientation(color: PieceColor) {
    this.cameraOverride = false;
    this.camAngle = color === "w" ? 0 : Math.PI;
    this.camAngleTarget = this.camAngle;
    this.updateCameraPosition();
  }

  /** Smoothly rotate the camera to the given color's side (used for hotseat pass-and-play). */
  flipTo(color: PieceColor) {
    this.camAngleTarget = color === "w" ? 0 : Math.PI;
    this.camTransitioning = true;
  }

  private handleClick = (event: MouseEvent) => {
    if (!this.interactionEnabled || !this.onSquareClick) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.raycastPlane, false)[0];
    if (!hit) return;
    const square = worldToSquare(hit.point.x, hit.point.z);
    if (square) this.onSquareClick(square);
  };

  // ---- piece placement / sync ----

  placePiece(square: string, type: PieceType, color: PieceColor) {
    const factory = PIECE_FACTORIES[type];
    const group = factory(this.materials, color);
    group.scale.setScalar(0.95);
    const { x, z } = squareToWorld(square);
    group.position.set(x, 0, z);
    group.userData = { type, color, square };
    this.scene.add(group);
    this.pieceMeshes.set(square, group);
    return group;
  }

  removePiece(square: string) {
    const mesh = this.pieceMeshes.get(square);
    if (mesh) {
      this.scene.remove(mesh);
      this.pieceMeshes.delete(square);
    }
  }

  clearAllPieces() {
    for (const mesh of this.pieceMeshes.values()) this.scene.remove(mesh);
    this.pieceMeshes.clear();
  }

  syncFromPieces(pieces: { type: PieceType; color: PieceColor; square: string }[]) {
    this.clearAllPieces();
    for (const p of pieces) this.placePiece(p.square, p.type, p.color);
  }

  getPieceMesh(square: string) {
    return this.pieceMeshes.get(square);
  }

  // ---- highlighting ----

  showSelection(square: string | null) {
    if (!square) {
      this.selectMarker.visible = false;
      return;
    }
    const { x, z } = squareToWorld(square);
    this.selectMarker.position.set(x, 0, z);
    this.selectMarker.visible = true;
  }

  showLegalMoves(moves: { square: string; capture: boolean }[]) {
    this.clearLegalMoves();
    for (const m of moves) {
      const dot = createLegalDot(m.capture);
      const { x, z } = squareToWorld(m.square);
      dot.position.x = x;
      dot.position.z = z;
      this.highlightLayer.add(dot);
      this.legalMarkers.push(dot);
    }
  }

  clearLegalMoves() {
    for (const m of this.legalMarkers) this.highlightLayer.remove(m);
    this.legalMarkers = [];
  }

  showLastMove(from: string, to: string) {
    for (const m of this.lastMoveMarkers) this.highlightLayer.remove(m);
    this.lastMoveMarkers = [];
    for (const sq of [from, to]) {
      const marker = createLastMoveMarker();
      const { x, z } = squareToWorld(sq);
      marker.position.x = x;
      marker.position.z = z;
      this.highlightLayer.add(marker);
      this.lastMoveMarkers.push(marker);
    }
  }

  // ---- check / checkmate ----

  showCheck(kingSquare: string) {
    this.checkGlow.show(kingSquare);
  }

  clearCheck() {
    this.checkGlow.hide();
  }

  celebrateCheckmate(kingSquare: string) {
    const { x, z } = squareToWorld(kingSquare);
    this.confetti.burst(new THREE.Vector3(x, 1.4, z), 200);
  }

  dramaticZoom(targetSquare: string) {
    this.cameraOverride = true;
    const { x, z } = squareToWorld(targetSquare);
    const startAngle = this.camAngle;
    const start = { radius: this.camRadius, height: this.camHeight };
    const endRadius = 3.4;
    const endHeight = 3.2;
    const duration = 1.6;
    let elapsed = 0;
    let lastTime = performance.now();
    const tick = () => {
      if (!this.cameraOverride) return; // cancelled (e.g. new game started)
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      const e = easeInOutCubic(t);
      const radius = start.radius + (endRadius - start.radius) * e;
      const height = start.height + (endHeight - start.height) * e;
      const camX = Math.sin(startAngle) * radius * (1 - e * 0.15) + x * e * 0.3;
      const camZ = Math.cos(startAngle) * radius * (1 - e * 0.15) + z * e * 0.3;
      this.camera.position.set(camX, height, camZ);
      this.camera.lookAt(x * e * 0.5, 0.5, z * e * 0.5);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resetCameraFraming() {
    this.cameraOverride = false;
    this.applyResponsiveFraming(this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  // ---- animation ----

  animateSlide(square1: string, square2: string, opts: { arc?: boolean; duration?: number; onComplete?: () => void } = {}) {
    const mesh = this.pieceMeshes.get(square1);
    if (!mesh) {
      opts.onComplete?.();
      return;
    }
    this.pieceMeshes.delete(square1);
    this.pieceMeshes.set(square2, mesh);
    mesh.userData.square = square2;
    const from = mesh.position.clone();
    const { x, z } = squareToWorld(square2);
    const to = new THREE.Vector3(x, 0, z);
    this.anims.push({
      mesh,
      from,
      to,
      arcHeight: opts.arc === false ? 0 : 0.55,
      duration: opts.duration ?? 0.42,
      elapsed: 0,
      onComplete: opts.onComplete,
    });
  }

  animateCapture(square: string, onComplete?: () => void) {
    const mesh = this.pieceMeshes.get(square);
    if (!mesh) {
      onComplete?.();
      return;
    }
    this.pieceMeshes.delete(square);
    const from = mesh.position.clone();
    const isWhite = (mesh.userData as { color: PieceColor }).color === "w";
    const to = from.clone().add(new THREE.Vector3(isWhite ? 3.2 : -3.2, -0.3, (Math.random() - 0.5) * 2));
    this.anims.push({
      mesh,
      from,
      to,
      arcHeight: 1.1,
      duration: 0.5,
      spin: (Math.random() - 0.5) * 10,
      fadeOut: true,
      elapsed: 0,
      onComplete: () => {
        this.scene.remove(mesh);
        onComplete?.();
      },
    });
  }

  promotePiece(square: string, newType: PieceType, color: PieceColor) {
    this.removePiece(square);
    const group = this.placePiece(square, newType, color);
    group.scale.setScalar(0.01);
    const target = 0.95;
    let elapsed = 0;
    const duration = 0.5;
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      const e = t < 1 ? 1.1 * Math.sin((t * Math.PI) / 2) : 1;
      group.scale.setScalar(Math.min(target, target * e));
      group.rotation.y = t * Math.PI * 2;
      if (t < 1) requestAnimationFrame(tick);
      else {
        group.scale.setScalar(target);
        group.rotation.y = 0;
      }
    };
    requestAnimationFrame(tick);
  }

  private stepAnims(dt: number) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.elapsed += dt;
      const t = Math.min(1, a.elapsed / a.duration);
      const e = easeInOutCubic(t);
      const pos = a.from.clone().lerp(a.to, e);
      pos.y += Math.sin(Math.PI * t) * a.arcHeight;
      a.mesh.position.copy(pos);
      if (a.spin) a.mesh.rotation.y += a.spin * dt;
      if (a.fadeOut) {
        a.mesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const mat = obj.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = 1 - t;
          }
        });
      }
      if (t >= 1) {
        this.anims.splice(i, 1);
        a.onComplete?.();
      }
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.stepAnims(dt);
    this.checkGlow.update(dt);
    this.confetti.update(dt);

    if (!this.cameraOverride) {
      if (this.camTransitioning) {
        let diff = this.camAngleTarget - this.camAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const step = diff * Math.min(1, dt * 2.4);
        this.camAngle += step;
        if (Math.abs(diff) < 0.01) {
          this.camAngle = this.camAngleTarget;
          this.camTransitioning = false;
        }
      }
      this.updateCameraPosition();
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    window.removeEventListener("resize", this.handleResize);
    window.visualViewport?.removeEventListener("resize", this.handleResize);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.renderer.dispose();
  }
}
