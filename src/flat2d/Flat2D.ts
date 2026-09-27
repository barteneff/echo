import type { AudioData } from '../audio/analyzer';
import { DIRTY_FRAG, DIRTY_VERT } from './dirtyShaders';

export type EffectId =
  | 'plasma'
  | 'wave'
  | 'shockwave'
  | 'lightning'
  | 'particles'
  | 'spikes'
  | 'glitch'
  | 'flash';

const ALL_EFFECTS: EffectId[] = [
  'plasma',
  'wave',
  'shockwave',
  'lightning',
  'particles',
  'spikes',
  'glitch',
  'flash',
];

/**
 * Dirty VFX — pure WebGL2, one visual layer.
 * Effects compete by influence: stronger field eats the pixel (no additive stack).
 */
export class Flat2D {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private active = false;
  private beatPulse = 0;
  private lastCombo = '—';
  private toggles: Record<EffectId, boolean> = {
    plasma: true,
    wave: false,
    shockwave: false,
    lightning: false,
    particles: false,
    spikes: false,
    glitch: false,
    flash: false,
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not supported');
    this.gl = gl;

    this.program = this.link(DIRTY_VERT, DIRTY_FRAG);
    gl.useProgram(this.program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const names = [
      'u_time',
      'u_bass',
      'u_mid',
      'u_high',
      'u_beat',
      'u_energy',
      'u_resolution',
      'u_enPlasma',
      'u_enWave',
      'u_enShock',
      'u_enLightning',
      'u_enParticles',
      'u_enSpikes',
      'u_enGlitch',
      'u_enFlash',
    ];
    for (const n of names) this.uniforms[n] = gl.getUniformLocation(this.program, n);

    this.canvas.style.imageRendering = 'pixelated';
    this.resize(window.innerWidth, window.innerHeight);
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('createShader failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      throw new Error(`Shader compile failed: ${log}`);
    }
    return shader;
  }

  private link(vert: string, frag: string): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setActive(value: boolean): void {
    this.active = value;
  }

  isActive(): boolean {
    return this.active;
  }

  setEffectEnabled(id: EffectId, enabled: boolean): void {
    this.toggles[id] = enabled;
  }

  isEffectEnabled(id: EffectId): boolean {
    return this.toggles[id];
  }

  getEffectIds(): EffectId[] {
    return [...ALL_EFFECTS];
  }

  getLastCombo(): string {
    return this.lastCombo;
  }

  resize(w: number, h: number): void {
    // internal buffer kept modest for dirty pixel look + perf
    const scale = Math.min(1, 720 / Math.max(w, h));
    const width = Math.max(1, Math.floor(w * scale));
    const height = Math.max(1, Math.floor(h * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.imageRendering = 'pixelated';
  }

  update(time: number, dt: number, audio: AudioData): void {
    if (!this.active) return;
    const gl = this.gl;

    if (audio.beat) this.beatPulse = Math.max(this.beatPulse, 0.55 + audio.bass * 0.45);
    // also lift beat from strong bass / kick onsets
    if (audio.bass > 0.78 && audio.energy > 0.45) {
      this.beatPulse = Math.max(this.beatPulse, audio.bass);
    }
    if (audio.onsetKick > 0.5) {
      this.beatPulse = Math.max(this.beatPulse, 0.4 + audio.onsetKick * 0.55);
    }
    this.beatPulse *= Math.exp(-dt * 3.2);

    const active: string[] = [];
    if (this.toggles.plasma) active.push('Plasma');
    if (this.toggles.wave) active.push('Wave');
    if (this.beatPulse > 0.4 && this.toggles.shockwave) active.push('Shock');
    if (this.beatPulse > 0.55 && this.toggles.lightning) active.push('Bolt');
    if (this.beatPulse > 0.3 && this.toggles.particles) active.push('Parts');
    if (this.beatPulse > 0.75 && this.toggles.flash) active.push('Flash');
    this.lastCombo = active.length ? active.join(' › ') : 'Plasma';

    gl.useProgram(this.program);
    gl.uniform1f(this.uniforms.u_time, time);
    gl.uniform1f(this.uniforms.u_bass, audio.bass);
    gl.uniform1f(this.uniforms.u_mid, audio.mid);
    gl.uniform1f(this.uniforms.u_high, audio.high);
    gl.uniform1f(this.uniforms.u_beat, this.beatPulse);
    gl.uniform1f(this.uniforms.u_energy, audio.energy);
    gl.uniform2f(
      this.uniforms.u_resolution,
      this.canvas.width,
      this.canvas.height,
    );

    gl.uniform1f(this.uniforms.u_enPlasma, this.toggles.plasma ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enWave, this.toggles.wave ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enShock, this.toggles.shockwave ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enLightning, this.toggles.lightning ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enParticles, this.toggles.particles ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enSpikes, this.toggles.spikes ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enGlitch, this.toggles.glitch ? 1 : 0);
    gl.uniform1f(this.uniforms.u_enFlash, this.toggles.flash ? 1 : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}
