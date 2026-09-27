import type { AudioData } from './analyzer';

/** Semantic drive layer — effects bind here, not raw bass/mid/high. */
export interface SemanticAudio {
  /** Kick / transient punch 0..1 */
  impact: number;
  /** Sustained low-end mass 0..1 */
  body: number;
  /** High-frequency grit 0..1 */
  texture: number;
  /** Spectral / energy change rate 0..1 */
  motion: number;
  /** Hard section hit */
  drop: boolean;
}

export type AudioFrame = AudioData & SemanticAudio;

export function emptySemantic(): SemanticAudio {
  return {
    impact: 0,
    body: 0,
    texture: 0,
    motion: 0,
    drop: false,
  };
}

export function emptyFrame(): AudioFrame {
  return {
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    beat: false,
    waveform: new Float32Array(128),
    spectrum: new Float32Array(64),
    bands: { sub: 0, kick: 0, lowMid: 0, highMid: 0, air: 0 },
    onsetKick: 0,
    onsetMid: 0,
    onsetHat: 0,
    flux: 0,
    ...emptySemantic(),
  };
}

/** Derives IMPACT / BODY / TEXTURE / MOTION from band onsets + levels. */
export class SemanticMapper {
  private smoothImpact = 0;
  private smoothBody = 0;
  private smoothTexture = 0;
  private smoothMotion = 0;
  private dropHold = 0;

  map(dt: number, audio: AudioData): SemanticAudio {
    const b = audio.bands;
    const impactRaw = Math.min(
      1,
      audio.onsetKick * 0.95 +
        b.kick * 0.35 +
        (audio.beat ? 0.25 : 0) +
        audio.flux * 0.15,
    );
    const bodyRaw = Math.min(1, b.sub * 0.5 + b.kick * 0.35 + audio.energy * 0.2);
    const textureRaw = Math.min(
      1,
      b.air * 0.65 + audio.onsetHat * 0.55 + b.highMid * 0.2,
    );
    const motionRaw = Math.min(
      1,
      audio.flux * 0.55 + audio.onsetMid * 0.55 + b.lowMid * 0.2,
    );

    const a = 1 - Math.exp(-dt * 14);
    const snap = audio.onsetKick > 0.5 ? 1 : a;
    this.smoothImpact += (impactRaw - this.smoothImpact) * snap;
    this.smoothBody += (bodyRaw - this.smoothBody) * a;
    this.smoothTexture += (textureRaw - this.smoothTexture) * a;
    this.smoothMotion += (motionRaw - this.smoothMotion) * a;

    if (audio.onsetKick > 0.6 && audio.energy > 0.5 && this.smoothImpact > 0.65) {
      this.dropHold = 1;
    }
    this.dropHold *= Math.exp(-dt * 3.5);

    return {
      impact: this.smoothImpact,
      body: this.smoothBody,
      texture: this.smoothTexture,
      motion: this.smoothMotion,
      drop: this.dropHold > 0.35,
    };
  }
}
