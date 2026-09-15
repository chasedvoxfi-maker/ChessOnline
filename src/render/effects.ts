import * as THREE from "three";
import { squareToWorld } from "./coords";

export function createSelectMarker(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.38, 0.46, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

export function createLegalDot(isCapture: boolean): THREE.Mesh {
  const geo = isCapture ? new THREE.RingGeometry(0.4, 0.48, 32) : new THREE.CircleGeometry(0.13, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: isCapture ? 0xff5555 : 0x64ffb0,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

export function createLastMoveMarker(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.98, 0.98);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  return mesh;
}

/** A pulsing red glow placed under a king to signal check. */
export class CheckGlow {
  group: THREE.Group;
  private light: THREE.PointLight;
  private ring: THREE.Mesh;
  private t = 0;
  active = false;

  constructor() {
    this.group = new THREE.Group();
    this.light = new THREE.PointLight(0xff2222, 0, 3.5, 2);
    this.light.position.y = 0.6;
    this.group.add(this.light);

    const geo = new THREE.RingGeometry(0.3, 0.55, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geo, mat);
    this.ring.position.y = 0.03;
    this.group.add(this.ring);
  }

  show(square: string) {
    const { x, z } = squareToWorld(square);
    this.group.position.set(x, 0, z);
    this.active = true;
  }

  hide() {
    this.active = false;
    this.light.intensity = 0;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const pulse = (Math.sin(this.t * 6) + 1) / 2;
    this.light.intensity = 1.2 + pulse * 1.8;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.4;
  }
}

interface ConfettiParticle {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
}

/** A celebratory confetti burst for checkmate. */
export class ConfettiSystem {
  group: THREE.Group;
  private particles: THREE.Mesh[] = [];
  private data: ConfettiParticle[] = [];
  private life = 0;
  private maxLife = 4.5;
  private gravity = -3.2;

  constructor() {
    this.group = new THREE.Group();
  }

  burst(origin: THREE.Vector3, count = 160) {
    this.clear();
    const colors = [0xffd700, 0xff4d6d, 0x4dd2ff, 0x8bff4d, 0xffffff, 0xb14dff];
    const geo = new THREE.PlaneGeometry(0.09, 0.14);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 0.6;
      mesh.position.z += (Math.random() - 0.5) * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3.5;
      this.data.push({
        velocity: new THREE.Vector3(Math.cos(angle) * speed * 0.5, 4 + Math.random() * 3, Math.sin(angle) * speed * 0.5),
        angularVelocity: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      });
      this.group.add(mesh);
      this.particles.push(mesh);
    }
    this.life = 0;
  }

  clear() {
    for (const p of this.particles) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
      this.group.remove(p);
    }
    this.particles = [];
    this.data = [];
  }

  update(dt: number) {
    if (this.particles.length === 0) return;
    this.life += dt;
    for (let i = 0; i < this.particles.length; i++) {
      const mesh = this.particles[i];
      const d = this.data[i];
      d.velocity.y += this.gravity * dt;
      mesh.position.addScaledVector(d.velocity, dt);
      mesh.rotation.x += d.angularVelocity.x * dt;
      mesh.rotation.y += d.angularVelocity.y * dt;
      mesh.rotation.z += d.angularVelocity.z * dt;
      if (mesh.position.y < -1) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 2);
      }
    }
    if (this.life > this.maxLife) this.clear();
  }
}
