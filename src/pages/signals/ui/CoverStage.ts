import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
  type Texture,
} from 'three';
import type { AudioData } from '@entities/audio';
import type { CoverArt } from '@entities/cover';

/** Soft large cover behind the single Signals wave. */
export class CoverStage {
  private root = new Group();
  private mesh: Mesh;
  private mat: MeshBasicMaterial;
  private fallbackTex: CanvasTexture;
  private active = false;
  private scene: Scene | null = null;
  private smoothScale = 1;

  constructor() {
    this.fallbackTex = this.makeFallback();
    this.mat = new MeshBasicMaterial({
      map: this.fallbackTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    // Flat under the wave field (ground / art plane)
    this.mesh = new Mesh(new PlaneGeometry(14, 14), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.55;
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  private makeFallback(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 140);
    g.addColorStop(0, '#152018');
    g.addColorStop(1, '#050508');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  init(scene: Scene): void {
    this.scene = scene;
    scene.add(this.root);
  }

  setActive(v: boolean): void {
    this.active = v;
    this.root.visible = v;
  }

  setCover(cover: CoverArt | null): void {
    if (cover?.isLoaded() && cover.getTexture()) {
      this.mat.map = cover.getTexture() as Texture;
      this.mat.opacity = 0.72;
      this.mat.needsUpdate = true;
    } else {
      this.mat.map = this.fallbackTex;
      this.mat.opacity = 0.45;
      this.mat.needsUpdate = true;
    }
  }

  update(time: number, audio: AudioData): void {
    if (!this.active) return;
    const target =
      1 +
      Math.sin(time * 1.05) * 0.018 +
      audio.energy * 0.03 +
      audio.onsetKick * 0.04;
    this.smoothScale += (target - this.smoothScale) * 0.05;
    this.mesh.scale.setScalar(this.smoothScale);
    this.mesh.rotation.z = Math.sin(time * 0.12) * 0.015;
  }

  dispose(): void {
    this.scene?.remove(this.root);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.fallbackTex.dispose();
  }
}
