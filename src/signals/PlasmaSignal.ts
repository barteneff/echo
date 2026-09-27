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

attribute vec2 aUv;
attribute float aSeed;

varying float vAlpha;
varying vec3 vColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec2 uv = aUv;
  float t = uTime * (0.3 + uMid * 0.4);
  float n1 = noise(uv * 3.0 + t);
  float n2 = noise(uv * 6.0 - t * 1.3 + aSeed);
  float plasma = sin(uv.x * 6.0 + t) * cos(uv.y * 5.0 - t * 0.7);
  plasma += n1 * 1.2 + n2 * 0.8;
  plasma *= 0.5 + uBass * 0.8;

  vec3 p;
  p.x = (uv.x - 0.5) * 8.0;
  p.y = (uv.y - 0.5) * 5.0;
  p.z = plasma * (0.8 + uEnergy * 1.4);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.4 + abs(plasma) * 2.5 + uHigh * 3.0) * (140.0 / -mv.z) * uIntensity;

  vAlpha = uIntensity * (0.15 + abs(plasma) * 0.35 + uEnergy * 0.3);
  vColor = mix(vec3(0.05, 0.9, 0.7), vec3(0.9, 0.15, 0.55), n1);
  vColor = mix(vColor, vec3(0.3, 0.5, 1.0), n2 * uHigh);
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class PlasmaSignal implements Signal {
  readonly name = 'Plasma';
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;

  init(ctx: SignalContext): void {
    const cols = 90;
    const rows = 55;
    const count = cols * rows;
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const seeds = new Float32Array(count);
    const rand = seededRandom(ctx.seed + 99);

    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        uvs[i * 2] = x / (cols - 1);
        uvs[i * 2 + 1] = y / (rows - 1);
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        seeds[i] = rand();
        i++;
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aUv', new BufferAttribute(uvs, 2));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));

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
    this.points.rotation.y = Math.sin(time * 0.12) * 0.15;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
  }
}
