import {
  BufferAttribute,
  BufferGeometry,
  Color,
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
attribute float aOffset;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float t = uTime * (0.25 + aSeed * 0.4) + aOffset;
  float r = 0.4 + aSeed * 2.8;
  float grow = 1.0 + uBass * 1.4 + uEnergy * 0.6;

  vec3 p = position;
  p.x += sin(t * 1.3 + p.y * 2.0) * (0.35 + uMid * 0.9);
  p.y += cos(t * 0.9 + p.x * 1.7) * (0.25 + uHigh * 0.5);
  p.z += sin(t * 1.1 + p.x + p.y) * (0.3 + uBass * 0.7);
  p *= grow * r / length(position + 0.001);

  float attract = sin(uTime * 0.5 + aSeed * 6.28) * 0.5 + 0.5;
  p *= mix(1.0, 0.55 + attract * 0.7, uEnergy);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = (2.0 + uBass * 6.0 + uHigh * 3.0) * (0.6 + aSeed);
  gl_PointSize = size * (180.0 / -mv.z) * uIntensity;

  vAlpha = uIntensity * (0.35 + uEnergy * 0.5 + aSeed * 0.25);
  vColor = mix(vec3(0.15, 0.85, 0.55), vec3(0.95, 0.35, 0.2), uBass);
  vColor = mix(vColor, vec3(0.4, 0.7, 1.0), uHigh * 0.6);
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class OrganicSignal implements Signal {
  readonly name = 'Organic';
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;
  private color = new Color();

  init(ctx: SignalContext): void {
    const count = 6000;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const offsets = new Float32Array(count);
    const rand = seededRandom(ctx.seed + 11);

    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const r = 0.8 + rand() * 2.4;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      seeds[i] = rand();
      offsets[i] = rand() * Math.PI * 2;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    geo.setAttribute('aOffset', new BufferAttribute(offsets, 1));

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
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uBass.value = audio.bass;
    this.material.uniforms.uMid.value = audio.mid;
    this.material.uniforms.uHigh.value = audio.high;
    this.material.uniforms.uEnergy.value = audio.energy;
    this.material.uniforms.uIntensity.value = intensity;
    this.points.rotation.y = time * 0.08;
    this.color.setHSL(0.35 - audio.bass * 0.25, 0.7, 0.5);
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
  }
}
