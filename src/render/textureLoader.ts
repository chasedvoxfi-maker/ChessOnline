import * as THREE from "three";

const loader = new THREE.TextureLoader();

/** Loads a same-origin image (public/textures/…) as a properly color-managed base-color map. */
export function loadPhotoTexture(path: string): THREE.Texture {
  const texture = loader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
