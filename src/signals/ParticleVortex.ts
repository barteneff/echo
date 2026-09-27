import {
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  AdditiveBlending,
} from 'three';
import type { AudioData } from '../audio/analyzer';
import type { Signal, SignalContext } from '../engine/Signal';
import { seededRandom } from '../engine/Signal';

const vert = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uIntensity;

attribute float aSeed;
attribute float aRadius;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float angle = aSeed * 6.28318 + uTime * (0.6 + uBass * 1.8);
  float twist = uTime * 0.35 + aRadius * 0.8;
  float r = aRadius * (1.0 + uBass * 0.7);

  vec3 p;
  p.x = cos(angle) * r;
  p.z = sin(angle) * r;
  p.y = (aSeed - 0.5) * 5.0;

  // vortex pull
  float pull = 1.0 - smoothstep(0.0, 3.5, length(p.xz));
  float spin = twist * (1.0 + pull * 2.0 + uMid * 2.0);
  float cs = cos(spin);
  float sn = sin(spin);
  float px = p.x * cs - p.z * sn;
  float pz = p.x * sn + p.z * cs;
  p.x = px;
  p.z = pz;
  p.y += sin(angle * 3.0 + uTime) * uHigh * 0.8;
  p *= 1.0 + uEnergy * 0.25;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.8 + uBass * 5.0 + pull * 3.0) * (150.0 / -mv.z) * uIntensity;

  vAlpha = uIntensity * (0.2 + pull * 0.6 + uEnergy * 0.3);
  vColor = mix(vec3(0.1, 0.4, 1.0), vec3(0.9, 0.2, 0.85), pull);
  vColor = mix(vColor, vec3(1.0, 0.6, 0.2), uBass * 0.55);
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.08, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class ParticleVortex implements Signal {
  readonly name = 'Vortex';
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;

  init(ctx: SignalContext): void {
    const count = 8000;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const radii = new Float32Array(count);
    const rand = seededRandom(ctx.seed + 77);

    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rand()) * 3.5;
      const a = rand() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (rand() - 0.5) * 5;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i] = rand();
      radii[i] = r;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    geo.setAttribute('aRadius', new BufferAttribute(radii, 1));

    this.material = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uEnergy: { value: 0 },
        uIntensity: { value: 0 },
      },
    });

    this.points = new Points(geo, this.material);
    this.points.visible = false;
    ctx.scene.add(this.points);
  }

  update(time: number, audio: AudioData, intensity: number): void {
    if (!this.points || !this.material) return;
    this.points.visible = intensity > 0.01;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBass.value = audio.bass;
    u.uMid.value = audio.mid;
    u.uHigh.value = audio.high;
    u.uEnergy.value = audio.energy;
    u.uIntensity.value = intensity;
    this.points.rotation.x = Math.sin(time * 0.1) * 0.3;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
  }
}
