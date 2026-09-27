import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  RGBAFormat,
  FloatType,
  NearestFilter,
  NoColorSpace,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { AudioData } from '../audio/analyzer';
import type { CoverArt } from '../media/CoverArt';
import { TerritoryMap } from './TerritoryMap';
import {
  FACTIONS,
  type EffectStats,
  type WarComboId,
  type WarEffectId,
} from './catalog';

export type { EffectStats, WarEffectId, WarComboId };
export { FACTIONS, WAR_EFFECTS, WAR_COMBOS } from './catalog';

const vert = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uIntensity;
uniform sampler2D uMap;
uniform vec3 uColBass;
uniform vec3 uColMid;
uniform vec3 uColHigh;
uniform float uHasCover;
uniform sampler2D uCover;

attribute vec2 aUv;
attribute float aSeed;

varying float vAlpha;
varying vec3 vColor;

void main() {
  vec4 cell = texture2D(uMap, aUv);
  float alive = cell.a;
  float owner = cell.r;
  float str = cell.g;

  float x = (aUv.x - 0.5) * 14.0;
  float y = (aUv.y - 0.5) * 9.0;

  float h = 0.0;
  if (owner < 0.25) {
    h = str * (1.2 + uBass * 2.0);
  } else if (owner < 0.75) {
    h = str * (0.6 + uMid * 1.4) * (0.7 + sin(aUv.x * 40.0 + uTime * 3.0) * 0.3);
  } else {
    h = str * (0.3 + uHigh * 2.2) * (0.5 + aSeed);
    x += sin(uTime * 8.0 + aSeed * 20.0) * uHigh * 0.15 * alive;
    y += cos(uTime * 9.0 + aSeed * 17.0) * uHigh * 0.15 * alive;
  }

  h *= alive;
  vec3 p = vec3(x, y, h * (0.8 + uEnergy * 0.6));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = mix(1.6, 3.2, str) + (owner > 0.75 ? uHigh * 1.5 : uBass * 0.8);
  gl_PointSize = max(0.0, size * (150.0 / max(0.1, -mv.z)) * uIntensity * alive);

  vAlpha = uIntensity * alive * (0.55 + str * 0.45);

  vec3 baseCol;
  if (owner < 0.25) {
    baseCol = mix(uColBass * 0.55, uColBass, str);
  } else if (owner < 0.75) {
    baseCol = mix(uColMid * 0.55, uColMid, str);
  } else {
    baseCol = mix(uColHigh * 0.55, uColHigh, str);
  }

  if (uHasCover > 0.5) {
    vec3 cover = texture2D(uCover, aUv).rgb;
    baseCol = mix(baseCol, mix(baseCol, cover, 0.45), 0.65);
  }
  vColor = baseCol;
}
`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.48, 0.28, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/**
 * Echo Wars — 3-faction territory fight (bass / mid / high).
 */
export class EchoWars {
  readonly map: TerritoryMap;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private renderer: WebGLRenderer | null = null;
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;
  private tex: DataTexture | null = null;
  private active = false;
  private accum = 0;
  private lastStats: EffectStats[] = [];
  private lastCombo = '—';
  private dummyCover: DataTexture;

  constructor(width = 96, height = 64) {
    this.map = new TerritoryMap(width, height);
    this.dummyCover = new DataTexture(
      new Uint8Array([20, 20, 24, 255]),
      1,
      1,
      RGBAFormat,
    );
    this.dummyCover.needsUpdate = true;
  }

  init(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    _host: HTMLElement,
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    const { width: w, height: h } = this.map;
    const count = w * h;
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const seeds = new Float32Array(count);

    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        uvs[i * 2] = (x + 0.5) / w;
        uvs[i * 2 + 1] = (y + 0.5) / h;
        positions[i * 3] = (uvs[i * 2] - 0.5) * 14;
        positions[i * 3 + 1] = (uvs[i * 2 + 1] - 0.5) * 9;
        positions[i * 3 + 2] = 0;
        seeds[i] = Math.random();
        i++;
      }
    }

    this.map.syncTexture();
    this.tex = new DataTexture(
      this.map.texData as unknown as BufferSource,
      w,
      h,
      RGBAFormat,
      FloatType,
    );
    this.tex.colorSpace = NoColorSpace;
    this.tex.minFilter = NearestFilter;
    this.tex.magFilter = NearestFilter;
    this.tex.needsUpdate = true;

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
        uIntensity: { value: 1 },
        uMap: { value: this.tex },
        uMapSize: { value: [w, h] },
        uColBass: { value: new Color(FACTIONS[0].color) },
        uColMid: { value: new Color(FACTIONS[1].color) },
        uColHigh: { value: new Color(FACTIONS[2].color) },
        uHasCover: { value: 0 },
        uCover: { value: this.dummyCover as Texture },
      },
    });

    this.points = new Points(geo, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setCover(cover: CoverArt | null): void {
    if (!this.material) return;
    const u = this.material.uniforms;
    if (cover?.isLoaded() && cover.getTexture()) {
      const pal = cover.getPalette();
      u.uColBass.value.set(pal.bass);
      u.uColMid.value.set(pal.mid);
      u.uColHigh.value.set(pal.high);
      u.uCover.value = cover.getTexture();
      u.uHasCover.value = 1;
    } else {
      u.uColBass.value.set(FACTIONS[0].color);
      u.uColMid.value.set(FACTIONS[1].color);
      u.uColHigh.value.set(FACTIONS[2].color);
      u.uCover.value = this.dummyCover;
      u.uHasCover.value = 0;
    }
  }

  setActive(value: boolean): void {
    this.active = value;
    if (this.points) this.points.visible = value;
    if (value) this.map.reset();
  }

  isActive(): boolean {
    return this.active;
  }

  setEffectEnabled(_id: WarEffectId, _on: boolean): void {}

  isEffectEnabled(_id: WarEffectId): boolean {
    return this.active;
  }

  applyCombo(_id: WarComboId): void {
    this.map.reset();
    this.refreshComboLabel();
  }

  getMatchedCombo(): WarComboId | null {
    return 'territory';
  }

  getLastCombo(): string {
    return this.lastCombo;
  }

  reset(): void {
    this.map.reset();
    this.refreshComboLabel();
  }

  resize(_w: number, _h: number): void {}

  private refreshComboLabel(): void {
    const parts = this.lastStats.map((s) => {
      const meta = FACTIONS.find((f) => f.id === s.id);
      return `${meta?.name ?? s.name} ${Math.round(s.share * 100)}%`;
    });
    this.lastCombo = parts.length ? parts.join(' · ') : '—';
  }

  update(time: number, dt: number, audio: AudioData): EffectStats[] {
    if (!this.active || !this.points || !this.material || !this.tex) {
      return this.lastStats;
    }

    this.accum += dt;
    while (this.accum >= 0.05) {
      this.map.step(0.05, audio);
      this.accum -= 0.05;
    }
    this.tex.needsUpdate = true;

    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBass.value = audio.bass;
    u.uMid.value = audio.mid;
    u.uHigh.value = audio.high;
    u.uEnergy.value = audio.energy;
    u.uIntensity.value = 1;

    this.points.visible = true;

    const raw = this.map.stats();
    this.lastStats = raw.map((s) => ({
      id: s.id,
      name: FACTIONS[s.id]?.name ?? s.name,
      share: s.share,
    }));
    this.refreshComboLabel();
    return this.lastStats;
  }

  render(): boolean {
    if (!this.active || !this.renderer || !this.scene || !this.camera) {
      return false;
    }
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose(): void {
    if (this.points && this.scene) this.scene.remove(this.points);
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.tex?.dispose();
    this.dummyCover.dispose();
  }
}
