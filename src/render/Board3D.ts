import * as THREE from "three";
import { buildBoard } from "./board";
import { createMaterials, PIECE_FACTORIES, addOutline, type PieceMaterials, type PieceFactory } from "./pieceModels";
import { squareToWorld, worldToSquare } from "./coords";
import { createSelectMarker, createLegalDot, createLastMoveMarker, CheckGlow, ConfettiSystem } from "./effects";
import { buildTableDecor, REST_CENTER_X, type TableDecor } from "./tableDecor";
import { loadTheme, type AppTheme } from "./theme";
import type { PieceColor } from "../game/types";

interface ActiveAnim {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  arcHeight: number;
  duration: number;
  elapsed: number;
  spin?: number;
  fromScale?: number;
  toScale?: number;
  onComplete?: () => void;
}

export type ViewMode = "angle" | "table" | "topdown";

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function bgGradientTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(256, 200, 40, 256, 300, 420);
  grad.addColorStop(0, "#2e2436");
  grad.addColorStop(0.55, "#1c1420");
  grad.addColorStop(1, "#0d0910");
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
  private pieceFactories: Record<string, PieceFactory>;
  /** Instance framing points and "angle" view preset — see the constructor's pieceHeightAllowance
   * and anglePreset options, and the FRAMING_POINTS comment, for why these vary per game type. */
  private framingPoints: [number, number, number][];
  private viewPresets: Record<ViewMode, { elevationDeg: number; elevationFloorDeg: number; distance: number; lookZ: number }>;
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

  // Camera angle — "angle" is a shallower player eye-view, "table" and "topdown" are
  // progressively more overhead. The wooden tabletop (captured pieces rest directly on it) is
  // always visible; only the camera's elevation changes between modes.
  private tableDecor: TableDecor;
  private viewMode: ViewMode = "angle";
  private capturedGroup = new THREE.Group();
  private capturedCounts: Record<PieceColor, number> = { w: 0, b: 0 };

  // camera orbit state
  private camAngle = 0;
  private camAngleTarget = 0;
  private camHeight = 6.4;
  private camRadius = 7.4;
  private camLookY = 0.35;
  /** Look-at target offset toward the near/camera side, biasing the board's far edge to hug the top of the frame. */
  private camLookZ = 0;
  private camTransitioning = false;
  private cameraOverride = false;

  interactionEnabled = true;
  onSquareClick: ((square: string) => void) | null = null;

  constructor(
    container: HTMLElement,
    opts?: {
      pieceFactories?: Record<string, PieceFactory>;
      theme?: AppTheme;
      /** How tall a piece can get at the back rank (world Y) — the "angle"/"table" cameras
       * reserve exactly this much headroom. Chess needs room for a king/queen; checkers' flat
       * discs don't, so a lower value lets those cameras sit noticeably closer/steeper. */
      pieceHeightAllowance?: number;
      /** Overrides the "angle" (default) view's elevation, both at its normal steepest (tall
       * screens) and eased-down floor (wide screens), and/or its near-side look-at bias — see
       * VIEW_PRESETS. */
      anglePreset?: Partial<{ elevationDeg: number; elevationFloorDeg: number; lookZ: number }>;
      /** Same as anglePreset, for the "table" view instead. */
      tablePreset?: Partial<{ elevationDeg: number; elevationFloorDeg: number; lookZ: number }>;
    },
  ) {
    this.container = container;
    // The look-and-feel picked on the Settings screen (main menu) — read fresh at construction
    // time, so a new game always starts with whatever was last saved there.
    const theme = opts?.theme ?? loadTheme();
    this.materials = createMaterials(theme.pieceColor, theme.pieceFinish);
    this.pieceFactories = opts?.pieceFactories ?? PIECE_FACTORIES;
    const pieceHeightAllowance = opts?.pieceHeightAllowance ?? 1.3;
    this.framingPoints = [
      ...Board3D.FRAMING_POINTS,
      [-0.5, pieceHeightAllowance, -4],
      [0.5, pieceHeightAllowance, -4],
      [-0.5, pieceHeightAllowance, 4],
      [0.5, pieceHeightAllowance, 4],
    ];
    this.viewPresets = {
      ...Board3D.VIEW_PRESETS,
      angle: { ...Board3D.VIEW_PRESETS.angle, ...opts?.anglePreset },
      table: { ...Board3D.VIEW_PRESETS.table, ...opts?.tablePreset },
    };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = bgGradientTexture();
    this.scene.fog = new THREE.FogExp2(0x0d0a18, 0.022);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.updateCameraPosition();

    this.setupLights();

    const { group: boardGroup, highlightLayer } = buildBoard(theme.board);
    this.scene.add(boardGroup);
    this.highlightLayer = highlightLayer;
    this.scene.add(this.checkGlow.group);
    this.scene.add(this.confetti.group);

    this.tableDecor = buildTableDecor(theme.table);
    this.scene.add(this.tableDecor.group);
    this.scene.add(this.capturedGroup);

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
    // More ambient fill relative to the key light (a lower key:ambient ratio) reads as softer,
    // less contrasty lighting — shadows stay present but lift off pure black, and highlights
    // stop looking like a single hard sun. Shadow softness comes from a larger PCF sample
    // radius on the key light below.
    const hemi = new THREE.HemisphereLight(0x8fa5ff, 0x4a3624, 1.5);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2d8, 1.8);
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
    key.shadow.radius = 4.5;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.4);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0xffe3b8, 0.6, 20);
    fill.position.set(-2, 3, 4);
    this.scene.add(fill);

    // A soft, shadowless light aimed squarely down at the board specifically — the key/hemi
    // lights already carry the whole scene, but the board is the one thing that always needs to
    // read brightly and clearly whatever the camera angle, so it gets its own dedicated top-up.
    const boardFill = new THREE.PointLight(0xfff6e6, 0.8, 14, 1.4);
    boardFill.position.set(0, 5, 1);
    this.scene.add(boardFill);
  }

  private handleResize = () => {
    // Prefer the visual viewport: on mobile Safari a fixed/inset:0 container can still
    // report the larger layout-viewport size while the address bar/toolbar visually
    // cover part of it, which would frame the camera for space that isn't actually visible.
    const vv = window.visualViewport;
    const w = vv ? Math.round(vv.width) : this.container.clientWidth;
    const h = vv ? Math.round(vv.height) : this.container.clientHeight;
    this.camera.aspect = w / h;
    this.applyResponsiveFraming(w / h, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.cameraOverride) this.updateCameraPosition();
  };

  /** Layout of the captured-piece rest columns beside the board (also used by restSlotPosition,
   * which is where a captured piece's actual position comes from) — pulled out as shared
   * constants so FRAMING_POINTS below can guarantee the real outer corners of the first column
   * stay on screen, not just a single, easy-to-get-wrong representative point. */
  private static readonly REST_PER_COLUMN = 8;
  private static readonly REST_SPACING_Z = 0.78;
  private static readonly REST_SPACING_X = 0.62;
  private static readonly REST_OUTER_X = REST_CENTER_X + Board3D.REST_SPACING_X / 2;
  /** Furthest Z-offset (in spacingZ units, from centerOutRowOffset) any of the 8 rows in a
   * column reaches — ±4 covers all of them symmetrically. "angle"/"table" fit this whole range
   * comfortably; the near-overhead "topdown" camera's required FOV to cover it hits the 115° cap
   * below regardless, so its far captures can still run past the edge either way. */
  private static readonly REST_GUARANTEE_Z = 4 * Board3D.REST_SPACING_Z;

  /**
   * Points (in board-local world space) the camera must keep in frame: the 8x8 board plane's
   * own corners edge-to-edge (the actual "whole board must fit" requirement), plus the outer
   * corners of each side's captured-piece rest column (REST_GUARANTEE_Z, not the column's full
   * depth — see that constant), so a growing pile of captures stays on screen instead of getting
   * cropped on narrow or notched-phone-landscape screens; a piece beyond that range can still run
   * off the edge, more so on the near-overhead "topdown" camera than "angle"/"table". Generous
   * enough to cover chess, checkers and Corners' rectangle formation (which fills every square in
   * each corner, right up to the board edge). The piece-height headroom for a tall center-file
   * piece (king/queen) at the back rank is NOT here — it's instance-specific (see
   * pieceHeightAllowance in the constructor and framingPoints below), since checkers' flat discs
   * need far less vertical clearance than a chess king and can afford a noticeably steeper camera
   * angle as a result.
   */
  private static readonly FRAMING_POINTS: [number, number, number][] = [
    [-4, 0, -4], [4, 0, -4], [-4, 0, 4], [4, 0, 4],
    [-4, 0.5, -4], [4, 0.5, -4], [-4, 0.5, 4], [4, 0.5, 4],
    [-Board3D.REST_OUTER_X, 0.5, Board3D.REST_GUARANTEE_Z], [-Board3D.REST_OUTER_X, 0.5, -Board3D.REST_GUARANTEE_Z],
    [Board3D.REST_OUTER_X, 0.5, Board3D.REST_GUARANTEE_Z], [Board3D.REST_OUTER_X, 0.5, -Board3D.REST_GUARANTEE_Z],
  ];

  /**
   * The FOV that keeps every FRAMING_POINT inside the frustum for the camera's current
   * position/look-at and the given screen aspect, plus a small safety margin. Computed
   * analytically (not hand-tuned per device) so it's correct for any aspect ratio and stays
   * correct if the piece models or board size ever change.
   */
  private computeRequiredFov(aspect: number): number {
    const Cx = 0;
    const Cy = this.camHeight;
    const Cz = this.camRadius;
    let fx = 0 - Cx;
    let fy = this.camLookY - Cy;
    let fz = this.camLookZ - Cz;
    const flen = Math.hypot(fx, fy, fz);
    fx /= flen;
    fy /= flen;
    fz /= flen;
    // right = normalize(cross(forward, worldUp)); camera is always aimed along x=0, so this
    // reduces to (-fz, 0, fx) exactly (no roll).
    let rx = -fz;
    let rz = fx;
    const rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen;
    rz /= rlen;
    // up = cross(right, forward)
    const ux = 0 * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - 0 * fx;

    const marginRad = (1.3 * Math.PI) / 180;
    let maxH = 0;
    let maxV = 0;
    for (const [px, py, pz] of this.framingPoints) {
      const vx = px - Cx;
      const vy = py - Cy;
      const vz = pz - Cz;
      const fwd = vx * fx + vy * fy + vz * fz;
      const right = vx * rx + vz * rz;
      const up = vx * ux + vy * uy + vz * uz;
      maxH = Math.max(maxH, Math.abs(Math.atan2(right, fwd)));
      maxV = Math.max(maxV, Math.abs(Math.atan2(up, fwd)));
    }

    const neededHalfV = maxV + marginRad;
    const neededHalfVFromH = Math.atan(Math.tan(maxH + marginRad) / aspect);
    const halfV = Math.max(neededHalfV, neededHalfVFromH);
    return Math.min(115, (halfV * 2 * 180) / Math.PI);
  }

  /**
   * Reframes the camera so the board reads as large as possible on small screens, near edge
   * included, while guaranteeing the whole board actually fits on screen at any aspect ratio.
   * Portrait phones (narrow) are pulled back a bit so the wide FOV that requires doesn't get
   * absurdly fisheye-distorted; the FOV itself is then solved analytically, not guessed.
   *
   * The look-at target is biased toward the near/camera side (camLookZ > 0) rather than the
   * board's own center: that makes the FAR edge — not the geometric middle — the tight/binding
   * constraint the FOV solves for, so the board's far edge sits right up against the top of the
   * screen instead of leaving empty headroom above it, with any slack landing near the bottom
   * (the player's own side) instead.
   *
   * Radius and height are derived from a fixed camera DISTANCE and the elevation angle (not a
   * fixed radius with height scaling as tan(angle)) — the latter sends the camera's actual
   * distance from the board toward infinity as the angle approaches 90°, which at steep angles
   * pushed it far enough for the scene's exponential fog (tuned for ~9-10 units) to wash the
   * whole board out to near-invisible. Distance stays constant across every angle instead.
   */
  private static readonly VIEW_PRESETS: Record<ViewMode, { elevationDeg: number; elevationFloorDeg: number; distance: number; lookZ: number }> = {
    angle: { elevationDeg: 70, elevationFloorDeg: 42, distance: 9.6, lookZ: 1.7 },
    table: { elevationDeg: 62, elevationFloorDeg: 34, distance: 9.6, lookZ: 1.7 },
    // Dead overhead, centered on the board (no near/far bias — lookZ: 0) rather than eased per
    // aspect: with the look-at target centered, the board's own square footprint is already
    // symmetric in the camera's H/V axes, so the FOV solver naturally frames it as a square
    // filling the screen's shorter dimension, no extra tuning needed. 89° (not 90°) avoids the
    // degenerate straight-down case where the camera's "right" axis is undefined.
    topdown: { elevationDeg: 89, elevationFloorDeg: 89, distance: 8.6, lookZ: 0 },
  };

  private applyResponsiveFraming(aspect: number, height: number) {
    const portraitness = Math.max(0, Math.min(1, 1 - aspect)); // 0 on wide screens, up to ~1 on tall phones
    const shortScreen = aspect > 1.15 ? Math.max(0, Math.min(1, (560 - height) / 340)) : 0; // 0 at h>=560, 1 at h<=220
    const preset = this.viewPresets[this.viewMode];
    // A camera looking down a deep scene from a steep angle needs far more vertical FOV than
    // horizontal (the board's front-to-back depth, plus piece height, projects mostly onto the
    // screen's Y axis) — on a wide/short phone-landscape screen that vertical requirement leaves
    // huge unused margin on the sides, so the board reads as small even though it technically
    // "fits". Easing the elevation angle down on wide screens compresses that depth back toward
    // the horizontal axis instead, trading a bit of "looking straight down" for a board that
    // actually fills the width; square/portrait screens have vertical room to spare, so they keep
    // the full requested angle.
    const wideness = Math.max(0, Math.min(1, (aspect - 1.15) / (2.2 - 1.15)));
    const elevationDeg = preset.elevationDeg - wideness * (preset.elevationDeg - preset.elevationFloorDeg);
    const elevationRad = (elevationDeg * Math.PI) / 180;
    const distance = preset.distance - shortScreen * 0.8;

    this.camRadius = distance * Math.cos(elevationRad) + portraitness * 0.5;
    this.camHeight = distance * Math.sin(elevationRad) + portraitness * 1.4; // steepen a bit further on tall phones — a wide board wastes less vertical space viewed from more overhead
    this.camLookY = 0.35 - portraitness * 0.32 + shortScreen * 0.18;
    this.camLookZ = preset.lookZ;
    this.camera.fov = this.computeRequiredFov(aspect);
  }

  private updateCameraPosition() {
    const x = Math.sin(this.camAngle) * this.camRadius;
    const z = Math.cos(this.camAngle) * this.camRadius;
    this.camera.position.set(x, this.camHeight, z);
    // the look-at bias rotates together with the camera's own orbit position, so it stays
    // biased toward whichever side is currently "near" regardless of which color is facing us
    const lookX = Math.sin(this.camAngle) * this.camLookZ;
    const lookZ = Math.cos(this.camAngle) * this.camLookZ;
    this.camera.lookAt(lookX, this.camLookY, lookZ);
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

  /**
   * Manually rotates the camera 180° from wherever it currently sits — a quick way to peek at
   * the position from the opponent's side. Independent of the automatic per-turn flip in
   * hotseat: the next turn change (or manual setOrientation) simply overrides it again.
   */
  flipCamera() {
    this.camAngleTarget = this.camAngle + Math.PI;
    this.camTransitioning = true;
  }

  /**
   * Switches camera angle: "angle" is a shallower player eye-view, "table" a bit more overhead,
   * "topdown" dead overhead so the board reads as one large square. The wooden tabletop itself
   * stays visible in every mode — it used to disappear behind a flat background in "angle",
   * which just read as a bug.
   */
  setViewMode(mode: ViewMode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.handleResize();
  }

  getViewMode() {
    return this.viewMode;
  }

  /** Row 0, 1, 2, 3, … within a column maps to Z-offset 0, -1, +1, -2, +2, … (spacingZ units) —
   * captures start right beside the board's own Z-center and alternate outward from there, so
   * however many the FOV guarantees (REST_GUARANTEE_Z) are exactly the ones placed first, rather
   * than the column's fixed physical extreme always being "capture #1" regardless of how many
   * pieces have actually been taken. */
  private static centerOutRowOffset(row: number): number {
    const half = Math.floor(row / 2);
    return row % 2 === 0 ? half : -(half + 1);
  }

  /** Where the Nth captured piece of this color comes to rest, directly on the tabletop next to the board. */
  private restSlotPosition(color: PieceColor, index: number): THREE.Vector3 {
    const perColumn = Board3D.REST_PER_COLUMN;
    const row = index % perColumn;
    const col = Math.floor(index / perColumn);
    const spacingZ = Board3D.REST_SPACING_Z;
    const spacingX = Board3D.REST_SPACING_X;
    const centerX = color === "w" ? this.tableDecor.rightRestX : this.tableDecor.leftRestX;
    const colOffset = (col === 0 ? -1 : 1) * (spacingX / 2);
    const z = Board3D.centerOutRowOffset(row) * spacingZ;
    return new THREE.Vector3(centerX + colOffset, this.tableDecor.restY, z);
  }

  private nextRestSlot(color: PieceColor): THREE.Vector3 {
    const index = this.capturedCounts[color]++;
    return this.restSlotPosition(color, index);
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

  placePiece(square: string, type: string, color: PieceColor) {
    const factory = this.pieceFactories[type];
    const group = factory(this.materials, color);
    if (color === "b") addOutline(group, this.materials.outlineColor);
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
    for (const mesh of [...this.capturedGroup.children]) this.capturedGroup.remove(mesh);
    this.capturedCounts = { w: 0, b: 0 };
  }

  syncFromPieces(pieces: { type: string; color: PieceColor; square: string }[]) {
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
    this.handleResize();
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
    const color = (mesh.userData as { color: PieceColor }).color;

    // The tabletop is visible in every camera mode now, so captures always fly to a rest slot
    // on it rather than off the edge of the board.
    const to = this.nextRestSlot(color);
    this.anims.push({
      mesh,
      from,
      to,
      arcHeight: 1.0,
      duration: 0.55,
      spin: (Math.random() - 0.5) * 4,
      fromScale: 0.95,
      toScale: 0.55,
      elapsed: 0,
      onComplete: () => {
        this.capturedGroup.add(mesh); // reparents; three.js detaches it from the scene root first
        onComplete?.();
      },
    });
  }

  promotePiece(square: string, newType: string, color: PieceColor) {
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
      if (a.fromScale !== undefined && a.toScale !== undefined) {
        a.mesh.scale.setScalar(a.fromScale + (a.toScale - a.fromScale) * e);
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
