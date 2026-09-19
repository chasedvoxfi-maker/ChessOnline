import * as THREE from "three";

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface PieceMaterials {
  white: THREE.Material;
  black: THREE.Material;
}

/** Shared ivory/ebony piece materials used by every game (chess, checkers, corners). */
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
    color: 0x2a2018,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    reflectivity: 0.5,
  });
  // A subtle lighter-toward-the-top gradient, in world space so it reads correctly across
  // every sub-mesh of a piece (crown spikes, cross finials, ...), not just the main body.
  black.onBeforeCompile = (shader) => {
    shader.uniforms.uGradientColor = { value: new THREE.Color(0x5a4632) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vGradWorldY;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGradWorldY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGradWorldY;\nuniform vec3 uGradientColor;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n  float gradT = clamp(vGradWorldY / 1.3, 0.0, 1.0);\n  diffuseColor.rgb = mix(diffuseColor.rgb, uGradientColor, gradT * 0.5);",
      );
  };
  return { white, black };
}

export function pickMat(mats: PieceMaterials, color: "w" | "b") {
  return color === "w" ? mats.white : mats.black;
}

export type PieceFactory = (mats: PieceMaterials, color: "w" | "b") => THREE.Group;

/**
 * "Inverted hull" outline: a slightly larger, back-face-only copy of every mesh in the group,
 * rendered in a near-black tone just a shade cooler/greyer than the black material itself, so
 * the silhouette gets a faint soft edge against a dark background without reading as a visible
 * contrasting ring around the piece.
 */
export function addOutline(root: THREE.Object3D, color = 0x413c48, thickness = 0.01) {
  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) targets.push(obj);
  });
  const outlineMat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  for (const m of targets) {
    const outline = new THREE.Mesh(m.geometry, outlineMat);
    outline.position.copy(m.position);
    outline.rotation.copy(m.rotation);
    outline.scale.copy(m.scale).multiplyScalar(1 + thickness);
    m.parent!.add(outline);
  }
}
