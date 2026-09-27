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

attribute float aLayer;
attribute float aAngle;
attribute float aSeed;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float layer = aLayer;
  float angle = aAngle + uTime * (0.15 + layer * 0.05) + uMid * 0.8;
  float petals = 5.0 + floor(uBass * 4.0);
  float r = (0.3 + layer * 0.55) * (1.0 + sin(angle * petals + uTime) * 0.18);
  r *= 1.0 + uBass * 0.9 + uEnergy * 0.35;

  float spiral = layer * 0.35;
  vec3 p;
  p.x = cos(angle + spiral) * r;
  p.z = sin(angle + spiral) * r;
  p.y = (layer - 3.0) * 0.25 + sin(angle * 3.0 + uTime) * 0.15 * uHigh;

  float bloom = pow(1.0 - layer / 7.0, 1.4);
  p *= 1.0 + bloom * uHigh * 0.5;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.5 + (1.0 - layer / 7.0) * 5.0 + uBass * 4.0)
    * (160.0 / -mv.z) * uIntensity * (0.7 + aSeed * 0.6);

  vAlpha = uIntensity * (0.25 + bloom * 0.55 + uEnergy * 0.3);
  float hue = layer / 7.0;
  vColor = mix(vec3(1.0, 0.45, 0.15), vec3(0.55, 0.2, 1.0), hue);
  vColor = mix(vColor, vec3(1.0, 0.9, 0.4), uBass * 0.5);
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class FractalBloom implements Signal {
  readonly name = 'Fractal Bloom';
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;

  init(ctx: SignalContext): void {
    const layers = 7;
    const perLayer = 900;
    const count = layers * perLayer;
    const positions = new Float32Array(count * 3);
    const layerAttr = new Float32Array(count);
    const angleAttr = new Float32Array(count);
    const seeds = new Float32Array(count);
    const rand = seededRandom(ctx.seed + 42);

    let i = 0;
    for (let L = 0; L < layers; L++) {
      for (let j = 0; j < perLayer; j++) {
        const angle = (j / perLayer) * Math.PI * 2 + rand() * 0.02;
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        layerAttr[i] = L;
        angleAttr[i] = angle;
        seeds[i] = rand();
        i++;
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aLayer', new BufferAttribute(layerAttr, 1));
    geo.setAttribute('aAngle', new BufferAttribute(angleAttr, 1));
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
    this.points.rotation.y = time * 0.2 + audio.mid;
    this.points.rotation.z = Math.sin(time * 0.15) * 0.2;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
  }
}
