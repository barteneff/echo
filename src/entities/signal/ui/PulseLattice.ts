import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { AudioData } from '@entities/audio';
import type { Signal, SignalContext } from '../model/types';
import { seededRandom } from '../model/types';
import type { CoverArt } from '@entities/cover';
import type { DisplaceFn } from '../lib/waveDisplace';

export type LatticeMode = 'lattice' | 'scatter';

function makeDot(hex: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, hex);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Atom-lattice / molecule cloud with wave-equation displacement
 * (three.js webgl_multiple_elements_text) + audio amplitude.
 */
export class PulseLattice implements Signal {
  readonly name: string;
  private points: Points | null = null;
  private mat: PointsMaterial | null = null;
  private geo: BufferGeometry | null = null;
  private base: Float32Array | null = null;
  private displace: DisplaceFn;
  private mode: LatticeMode;
  private colorHex: string;
  private readonly _off = new Vector3();
  private range: number;
  private pointSize: number;

  constructor(
    name: string,
    displace: DisplaceFn,
    opts: {
      mode?: LatticeMode;
      color?: string;
      range?: number;
      pointSize?: number;
    } = {},
  ) {
    this.name = name;
    this.displace = displace;
    this.mode = opts.mode ?? 'lattice';
    this.colorHex = opts.color ?? '#66ddff';
    this.range = opts.range ?? 4.5;
    this.pointSize = opts.pointSize ?? 0.48;
  }

  setCover(cover: CoverArt | null): void {
    if (!this.mat) return;
    if (cover?.isLoaded()) {
      const pal = cover.getPalette();
      // pick mid as default accent; signals can look different via initial color
      const hex =
        this.name.includes('Sphere')
          ? pal.high
          : this.name.includes('Cylinder')
            ? pal.mid
            : this.name.includes('Scatter')
              ? pal.bass
              : pal.mid;
      this.mat.color.set(hex);
      this.mat.map?.dispose();
      this.mat.map = makeDot(hex);
      this.mat.needsUpdate = true;
    }
  }

  init(ctx: SignalContext): void {
    const balls = 10;
    const vertices: number[] = [];
    const rand = seededRandom(ctx.seed + this.name.length * 97);

    if (this.mode === 'lattice') {
      const range = balls / 2;
      for (let i = -range; i <= range; i++) {
        for (let j = -range; j <= range; j++) {
          for (let k = -range; k <= range; k++) {
            const s = this.range / range;
            vertices.push(i * s, j * s, k * s * 0.7);
          }
        }
      }
    } else {
      const n = Math.pow(balls, 3);
      for (let m = 0; m < n; m++) {
        vertices.push(
          (rand() - 0.5) * this.range * 2,
          (rand() - 0.5) * this.range * 2,
          (rand() - 0.5) * this.range * 1.4,
        );
      }
    }

    this.base = new Float32Array(vertices);
    const pos = new Float32Array(vertices);
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(pos, 3));

    this.mat = new PointsMaterial({
      size: this.pointSize,
      map: makeDot(this.colorHex),
      color: new Color(this.colorHex),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.85,
      sizeAttenuation: true,
      alphaTest: 0.05,
    });

    this.points = new Points(this.geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    ctx.scene.add(this.points);
  }

  update(time: number, audio: AudioData, intensity: number): void {
    if (!this.points || !this.mat || !this.geo || !this.base) return;
    this.points.visible = intensity > 0.01;

    const pos = this.geo.attributes.position as BufferAttribute;
    // Wave time scaled by motion/energy — like example t, but audio-driven
    const waveT =
      time * (2.4 + audio.mid * 2.0 + audio.onsetMid * 1.5) * (0.7 + intensity);
    const amp =
      (0.55 + audio.energy * 0.9 + audio.onsetKick * 0.7 + audio.bass * 0.35) *
      intensity;

    for (let i = 0; i < pos.count; i++) {
      const bx = this.base[i * 3];
      const by = this.base[i * 3 + 1];
      const bz = this.base[i * 3 + 2];
      this.displace(bx, by, bz, waveT, this._off);
      pos.setXYZ(
        i,
        bx + this._off.x * amp,
        by + this._off.y * amp,
        bz + this._off.z * amp,
      );
    }
    pos.needsUpdate = true;

    // Soft whole-field pulse (scale breath)
    const breath =
      1 +
      Math.sin(time * 2.0) * 0.03 * intensity +
      audio.onsetKick * 0.1 * intensity +
      audio.bass * 0.04 * intensity;
    this.points.scale.setScalar(breath);
    this.points.rotation.y = time * 0.06;

    this.mat.size =
      this.pointSize * (0.85 + audio.high * 0.35 + audio.onsetHat * 0.25) *
      (0.5 + intensity * 0.5);
    this.mat.opacity = (0.35 + intensity * 0.55) * (0.6 + audio.energy * 0.4);
  }

  dispose(): void {
    this.geo?.dispose();
    this.mat?.map?.dispose();
    this.mat?.dispose();
  }
}
