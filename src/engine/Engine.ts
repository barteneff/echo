import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
} from 'three';
import type { AudioFrame } from '../audio/semantic';
import type { Signal } from './Signal';
import { Timeline, type TimelineState } from './Timeline';
import { EchoWars } from '../wars/EchoWars';
import type { EffectStats, WarComboId, WarEffectId } from '../wars/catalog';
import { Flat2D } from '../flat2d/Flat2D';
import { type FlatOpId } from '../flat2d/catalog';
import { applyModeTheme, COLORS } from '../theme';
import type { CoverArt } from '../media/CoverArt';
import { CoverStage } from '../signals/CoverStage';

export type ViewMode = 'orbit' | 'front';
export type AppMode = 'signals' | 'wars' | 'flat2d';

export class Engine {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly timeline: Timeline;
  readonly wars: EchoWars;
  readonly flat2d: Flat2D;
  readonly seed: number;

  private signals: Signal[];
  private coverStage = new CoverStage();
  private lastState: TimelineState | null = null;
  private lastWarsStats: EffectStats[] = [];
  private shake = 0;
  private shakeAmount = 0.15;
  private viewMode: ViewMode = 'orbit';
  private appMode: AppMode = 'signals';
  private baseFov = 55;

  constructor(canvas: HTMLCanvasElement, signals: Signal[], seed = 847291) {
    this.seed = seed;
    this.signals = signals;

    this.scene = new Scene();
    this.scene.background = new Color(COLORS.bg);
    this.scene.fog = null;

    this.camera = new PerspectiveCamera(
      this.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 0, 8);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const ambient = new AmbientLight(0x333338, 0.7);
    const key = new DirectionalLight(0xffffff, 1.0);
    key.position.set(4, 6, 8);
    this.scene.add(ambient, key);

    this.timeline = new Timeline(signals, 9, 1.6);
    this.wars = new EchoWars();
    this.flat2d = new Flat2D();

    const ctx = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      seed,
    };
    for (const s of signals) s.init(ctx);

    this.coverStage.init(this.scene);
    this.coverStage.setActive(true);

    const host = canvas.parentElement ?? document.body;
    this.wars.init(this.scene, this.camera, this.renderer, host);

    const flatCanvas = this.flat2d.getCanvas();
    flatCanvas.id = 'stage-2d';
    flatCanvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:1;';
    host.appendChild(flatCanvas);

    applyModeTheme('signals');
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.wars.resize(w, h);
    this.flat2d.resize(w, h);
  };

  setShakeAmount(value: number): void {
    this.shakeAmount = Math.max(0, Math.min(1, value));
  }

  getShakeAmount(): number {
    return this.shakeAmount;
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  setAppMode(mode: AppMode): void {
    this.appMode = mode;
    this.wars.setActive(mode === 'wars');
    this.flat2d.setActive(mode === 'flat2d');
    this.coverStage.setActive(mode === 'signals');
    applyModeTheme(mode);

    const three = this.renderer.domElement;
    const flat = this.flat2d.getCanvas();
    three.style.visibility = mode === 'flat2d' ? 'hidden' : 'visible';
    flat.style.display = mode === 'flat2d' ? 'block' : 'none';

    if (mode === 'wars' || mode === 'flat2d') this.viewMode = 'front';
  }

  getAppMode(): AppMode {
    return this.appMode;
  }

  setFlatEffect(id: FlatOpId, enabled: boolean): void {
    this.flat2d.setEffectEnabled(id, enabled);
  }

  isFlatEffect(id: FlatOpId): boolean {
    return this.flat2d.isEffectEnabled(id);
  }

  getFlatCombo(): string {
    return this.flat2d.getLastCombo();
  }

  setCover(cover: CoverArt | null): void {
    this.coverStage.setCover(cover);
    this.wars.setCover(cover);
    for (const s of this.signals) {
      const maybe = s as Signal & { setCover?: (c: CoverArt | null) => void };
      maybe.setCover?.(cover);
    }
  }

  setWarEffect(id: WarEffectId, enabled: boolean): void {
    this.wars.setEffectEnabled(id, enabled);
  }

  isWarEffect(id: WarEffectId): boolean {
    return this.wars.isEffectEnabled(id);
  }

  applyWarCombo(id: WarComboId): void {
    this.wars.applyCombo(id);
  }

  getState(): TimelineState | null {
    return this.lastState;
  }

  getWarsStats(): EffectStats[] {
    return this.lastWarsStats;
  }

  getWarsCombo(): string {
    return this.wars.getLastCombo();
  }

  update(time: number, dt: number, frame: AudioFrame): void {
    const shakeMul = this.shakeAmount;

    // only punch shake on hard hits — never random jitter every frame
    if (frame.beat || frame.impact > 0.75) {
      this.shake = Math.min(1, this.shake + 0.35 * shakeMul);
    }
    this.shake *= Math.exp(-dt * 8);
    const sx = Math.sin(time * 37.0) * this.shake * 0.12 * shakeMul;
    const sy = Math.cos(time * 31.0) * this.shake * 0.09 * shakeMul;

    if (this.appMode === 'flat2d') {
      for (const s of this.signals) s.update(time, frame, 0);
      this.coverStage.setActive(false);
      if (this.wars.isActive()) this.wars.setActive(false);
      this.flat2d.update(time, dt, frame);
      this.lastState = null;
      return;
    }

    if (this.viewMode === 'front') {
      if (this.appMode === 'signals') {
        // Elevated front — like webgl_points_waves default view (above + back)
        this.camera.position.set(sx * 0.4, 5.2 + sy * 0.3, 9.5);
        this.camera.lookAt(0, 0.35, 0);
      } else {
        const z = this.appMode === 'wars' ? 10 : 9;
        this.camera.position.set(sx, sy, z);
        this.camera.lookAt(0, 0, 0);
      }
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    } else {
      // Orbit from above the plane (never under the wave)
      const camRadius = 9.5 + frame.bass * 0.35;
      const camAngle = time * 0.08;
      const camY = 4.6 + Math.sin(time * 0.12) * 0.7;

      this.camera.position.x = Math.cos(camAngle) * camRadius + sx;
      this.camera.position.z = Math.sin(camAngle) * camRadius + sx * 0.4;
      this.camera.position.y = camY + sy;
      this.camera.lookAt(0, 0.2, 0);
      this.camera.fov = this.baseFov + this.shake * 1.5 * shakeMul;
      this.camera.updateProjectionMatrix();
    }

    if (this.appMode === 'wars') {
      for (const s of this.signals) s.update(time, frame, 0);
      this.coverStage.setActive(false);
      this.lastWarsStats = this.wars.update(time, dt, frame);
      this.lastState = null;
      this.wars.render();
      return;
    }

    if (this.wars.isActive()) this.wars.setActive(false);
    this.coverStage.setActive(true);
    this.coverStage.update(time, frame);
    const state = this.timeline.tick(dt);
    this.lastState = state;
    // Single SoftWave — always full intensity, no clip crossfades
    for (const s of this.signals) {
      s.update(time, frame, 1);
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    for (const s of this.signals) s.dispose();
    this.coverStage.dispose();
    this.wars.dispose();
    this.flat2d.getCanvas().remove();
    this.flat2d.dispose();
    this.renderer.dispose();
  }
}
