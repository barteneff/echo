import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  RedFormat,
  UnsignedByteType,
  NearestFilter,
  NoColorSpace,
  type Texture,
} from 'three';
import type { AudioData } from '../audio/analyzer';
import type { Signal, SignalContext } from '../engine/Signal';
import { seededRandom } from '../engine/Signal';

const WAVE_BINS = 64;

const vert = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uIntensity;
uniform sampler2D uWaveTex;

attribute float aX;
attribute float aRow;
attribute float aSeed;

varying float vAlpha;
varying vec3 vColor;

void main() {
  // spectrum column for this x — primary height drive
  float bin = texture2D(uWaveTex, vec2(aX, 0.5)).r;

  float x = (aX - 0.5) * 10.0;
  float z = (aRow - 0.5) * 6.0;

  // soft row falloff so grid reads as a surface
  float rowFall = 1.0 - abs(aRow - 0.5) * 0.55;
  float wave = bin * (1.8 + uEnergy * 1.2) * rowFall;

  // secondary time ripple — never dominates spectrum
  wave += sin(x * 1.2 + uTime * 1.4 + aRow * 2.0) * 0.12;
  wave += sin(uTime * 0.8 + aSeed * 6.0) * uEnergy * 0.06;

  vec3 p = vec3(x, wave, z);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float amp = abs(wave);
  gl_PointSize = max(1.2, (1.6 + amp * 2.8 + bin * 2.0) * (130.0 / max(0.1, -mv.z))) * uIntensity;

  vAlpha = uIntensity * (0.22 + bin * 0.45 + amp * 0.2) * rowFall;

  // faction zones by frequency position (orange / green / purple)
  vec3 lowC = vec3(1.0, 0.42, 0.1);
  vec3 midC = vec3(0.1, 1.0, 0.55);
  vec3 highC = vec3(0.7, 0.3, 1.0);
  vec3 zone = aX < 0.28 ? lowC : (aX < 0.62 ? midC : highC);
  vColor = mix(zone * 0.55, zone, clamp(bin * 0.9 + amp * 0.25, 0.0, 1.0));
  vColor = mix(vColor, vec3(1.0), bin * uHigh * 0.15);
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class NoiseWave implements Signal {
  readonly name = 'Noise Wave';
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;
  private waveData = new Uint8Array(WAVE_BINS);
  private waveTex: DataTexture | null = null;

  init(ctx: SignalContext): void {
    const cols = 128;
    const rows = 40;
    const count = cols * rows;
    const positions = new Float32Array(count * 3);
    const xs = new Float32Array(count);
    const rowAttr = new Float32Array(count);
    const seeds = new Float32Array(count);
    const rand = seededRandom(ctx.seed + 55);

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        xs[i] = c / (cols - 1);
        rowAttr[i] = r / (rows - 1);
        seeds[i] = rand();
        positions[i * 3] = (xs[i] - 0.5) * 10;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (rowAttr[i] - 0.5) * 6;
        i++;
      }
    }

    this.waveTex = new DataTexture(
      this.waveData,
      WAVE_BINS,
      1,
      RedFormat,
      UnsignedByteType,
    );
    this.waveTex.minFilter = NearestFilter;
    this.waveTex.magFilter = NearestFilter;
    this.waveTex.colorSpace = NoColorSpace;
    this.waveTex.needsUpdate = true;

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aX', new BufferAttribute(xs, 1));
    geo.setAttribute('aRow', new BufferAttribute(rowAttr, 1));
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
        uWaveTex: { value: this.waveTex as Texture },
      },
    });

    this.points = new Points(geo, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    ctx.scene.add(this.points);
  }

  update(time: number, audio: AudioData, intensity: number): void {
    if (!this.points || !this.material || !this.waveTex) return;
    this.points.visible = intensity > 0.01;

    const src = audio.spectrum.length ? audio.spectrum : audio.waveform;
    for (let i = 0; i < WAVE_BINS; i++) {
      const s = src[Math.floor((i / WAVE_BINS) * src.length)] ?? 0;
      this.waveData[i] = Math.min(255, Math.abs(s) * 255);
    }
    this.waveTex.needsUpdate = true;

    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBass.value = audio.bass;
    u.uMid.value = audio.mid;
    u.uHigh.value = audio.high;
    u.uEnergy.value = audio.energy;
    u.uIntensity.value = intensity;
    this.points.rotation.x = -0.35 + audio.mid * 0.1;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.waveTex?.dispose();
  }
}
