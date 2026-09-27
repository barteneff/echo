import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';
import type { AudioData } from '../audio/analyzer';
import type { Signal, SignalContext } from '../engine/Signal';
import type { CoverArt } from '../media/CoverArt';
import { FACTIONS, type FactionId } from '../wars/catalog';

const AMOUNTX = 60;
const AMOUNTY = 60;
const SEPARATION = 0.22;
const HALF = (AMOUNTX * SEPARATION) / 2;
const NUM = AMOUNTX * AMOUNTY;

const VERT = /* glsl */ `
attribute float scale;
attribute vec3 aColor;
uniform float uPointScale;
varying vec3 vColor;

void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = scale * uPointScale * (180.0 / max(1.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  if (length(gl_PointCoord - vec2(0.5)) > 0.475) discard;
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/** Extra height multiplier by Wars faction colour. */
const LIFT_BY_FACTION: Record<FactionId, number> = {
  0: 1.35, // bass / orange — highest
  1: 0.85, // mid / green
  2: 0.55, // high / purple — lower, sharper colour
};

const FACTION_COLORS = FACTIONS.map((f) => new Color(f.color));

interface Scope {
  faction: FactionId;
  x: number;
  z: number;
  radius: number;
  age: number;
  life: number;
  /** Target influence 0..1 */
  strength: number;
  /** Smoothed envelope */
  smooth: number;
  vx: number;
  vz: number;
}

/**
 * Flat points wave + Wars-style random colour scopes.
 * Colour = how far that scope lifts points above the base sine wave.
 */
export class SoftWave implements Signal {
  readonly name = 'Wave';
  private points: Points | null = null;
  private mat: ShaderMaterial | null = null;
  private geo: BufferGeometry | null = null;
  private smoothAmp = 0.55;
  private smoothSpeed = 0.08;
  private baseColor = new Color(0xe8eef5);
  private scopes: Scope[] = [];
  /** Per-point smoothed extra lift */
  private liftSmooth = new Float32Array(NUM);
  private lastKick = 0;
  private lastMid = 0;
  private lastHat = 0;
  private spawnCooldown = 0;

  setCover(cover: CoverArt | null): void {
    if (cover?.isLoaded()) {
      this.baseColor.set(cover.getPalette().mid).lerp(new Color(0xffffff), 0.45);
    } else {
      this.baseColor.set(0xe8eef5);
    }
  }

  init(ctx: SignalContext): void {
    const positions = new Float32Array(NUM * 3);
    const scales = new Float32Array(NUM);
    const colors = new Float32Array(NUM * 3);

    let i = 0;
    let j = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - HALF;
        positions[i + 1] = 0;
        positions[i + 2] = iy * SEPARATION - HALF;
        scales[j] = 1;
        colors[i] = this.baseColor.r;
        colors[i + 1] = this.baseColor.g;
        colors[i + 2] = this.baseColor.b;
        i += 3;
        j++;
      }
    }

    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(positions, 3));
    this.geo.setAttribute('scale', new BufferAttribute(scales, 1));
    this.geo.setAttribute('aColor', new BufferAttribute(colors, 3));

    this.mat = new ShaderMaterial({
      uniforms: { uPointScale: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });

    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    ctx.scene.add(this.points);
  }

  private spawnScope(faction: FactionId, strength: number): void {
    if (this.scopes.length > 10) this.scopes.shift();
    const rBase =
      faction === 0
        ? 1.4 + Math.random() * 1.6 // bass blobs — larger
        : faction === 1
          ? 0.9 + Math.random() * 1.1
          : 0.45 + Math.random() * 0.7; // high sparks — smaller
    this.scopes.push({
      faction,
      x: (Math.random() - 0.5) * HALF * 1.6,
      z: (Math.random() - 0.5) * HALF * 1.6,
      radius: rBase,
      age: 0,
      life: 2.2 + Math.random() * 2.4,
      strength: Math.min(1, strength),
      smooth: 0,
      vx: (Math.random() - 0.5) * 0.55,
      vz: (Math.random() - 0.5) * 0.55,
    });
  }

  update(time: number, audio: AudioData, intensity: number): void {
    if (!this.points || !this.mat || !this.geo) return;
    const vis = intensity > 0.01;
    this.points.visible = vis;
    if (!vis) return;

    const dt = 1 / 60;

    const targetAmp =
      0.48 + audio.energy * 0.28 + audio.bass * 0.18 + audio.onsetKick * 0.1;
    const targetSpeed = 0.05 + audio.mid * 0.045 + audio.flux * 0.035;
    this.smoothAmp += (targetAmp - this.smoothAmp) * 0.035;
    this.smoothSpeed += (targetSpeed - this.smoothSpeed) * 0.04;

    // Spawn random scopes on band onsets (Wars colours)
    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);
    if (this.spawnCooldown <= 0) {
      if (audio.onsetKick > 0.42 && audio.onsetKick > this.lastKick + 0.06) {
        this.spawnScope(0, 0.55 + audio.onsetKick * 0.5);
        this.spawnCooldown = 0.12;
      } else if (audio.onsetMid > 0.38 && audio.onsetMid > this.lastMid + 0.06) {
        this.spawnScope(1, 0.45 + audio.onsetMid * 0.45);
        this.spawnCooldown = 0.1;
      } else if (audio.onsetHat > 0.32 && audio.onsetHat > this.lastHat + 0.06) {
        this.spawnScope(2, 0.4 + audio.onsetHat * 0.5);
        // high can spawn 1–2 small sparks
        if (Math.random() < 0.45) this.spawnScope(2, 0.3 + audio.onsetHat * 0.35);
        this.spawnCooldown = 0.08;
      } else if (audio.energy > 0.35 && Math.random() < 0.012) {
        // occasional ambient wandering scope
        const f = (Math.floor(Math.random() * 3) as FactionId);
        this.spawnScope(f, 0.25 + audio.energy * 0.25);
        this.spawnCooldown = 0.2;
      }
    }
    this.lastKick = audio.onsetKick;
    this.lastMid = audio.onsetMid;
    this.lastHat = audio.onsetHat;

    // Drift + soft envelope (fade in / out)
    for (const s of this.scopes) {
      s.age += dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      // soft bounce inside field
      if (Math.abs(s.x) > HALF * 0.95) s.vx *= -1;
      if (Math.abs(s.z) > HALF * 0.95) s.vz *= -1;

      const t = s.age / s.life;
      const envelope =
        t < 0.15 ? t / 0.15 : t > 0.65 ? Math.max(0, (1 - t) / 0.35) : 1;
      const target = s.strength * envelope;
      s.smooth += (target - s.smooth) * 0.06;
    }
    this.scopes = this.scopes.filter((s) => s.age < s.life && s.smooth > 0.01);

    const count = time * (this.smoothSpeed * 12);
    const height = this.smoothAmp * intensity;
    const scaleMul = (0.75 + this.smoothAmp * 0.45) * intensity;

    const positions = this.geo.attributes.position.array as Float32Array;
    const scales = this.geo.attributes.scale.array as Float32Array;
    const colors = this.geo.attributes.aColor.array as Float32Array;

    let i = 0;
    let j = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        const x = positions[i]!;
        const z = positions[i + 2]!;

        const wave =
          Math.sin((ix + count) * 0.3) * 0.55 +
          Math.sin((iy + count) * 0.5) * 0.55;
        const baseY = wave * height;

        // Accumulate scope influence + colour (soft falloff disks)
        let liftTarget = 0;
        let cr = this.baseColor.r;
        let cg = this.baseColor.g;
        let cb = this.baseColor.b;
        let colorW = 0;

        for (const s of this.scopes) {
          if (s.smooth < 0.01) continue;
          const dist = Math.hypot(x - s.x, z - s.z);
          const fall = 1 - Math.min(1, dist / s.radius);
          // smoothstep-ish soft edge
          const soft = fall * fall * (3 - 2 * fall);
          const w = soft * s.smooth;
          if (w <= 0.001) continue;

          liftTarget += w * LIFT_BY_FACTION[s.faction] * height * 1.15;

          const fc = FACTION_COLORS[s.faction]!;
          cr += fc.r * w;
          cg += fc.g * w;
          cb += fc.b * w;
          colorW += w;
        }

        // Smooth the lift so regions rise/fall gently
        const prev = this.liftSmooth[j]!;
        const next = prev + (liftTarget - prev) * 0.055;
        this.liftSmooth[j] = next;

        positions[i + 1] = baseY + next;

        scales[j] =
          ((Math.sin((ix + count) * 0.3) + 1) * 0.55 +
            (Math.sin((iy + count) * 0.5) + 1) * 0.55) *
          scaleMul *
          (1 + Math.min(0.45, next * 0.35));

        // Blend base → faction colour by influence
        const blend = Math.min(1, colorW * 1.1);
        colors[i] = this.baseColor.r * (1 - blend) + Math.min(1.35, cr) * blend;
        colors[i + 1] =
          this.baseColor.g * (1 - blend) + Math.min(1.35, cg) * blend;
        colors[i + 2] =
          this.baseColor.b * (1 - blend) + Math.min(1.35, cb) * blend;

        i += 3;
        j++;
      }
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.scale.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.mat.uniforms.uPointScale.value = 0.95 + audio.high * 0.12;
  }

  dispose(): void {
    this.geo?.dispose();
    this.mat?.dispose();
  }
}
