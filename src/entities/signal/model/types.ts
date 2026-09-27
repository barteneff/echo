import type { AudioData } from '@entities/audio';
import type { Scene, Camera, WebGLRenderer } from 'three';

export interface SignalContext {
  scene: Scene;
  camera: Camera;
  renderer: WebGLRenderer;
  seed: number;
}

export interface Signal {
  readonly name: string;
  init(ctx: SignalContext): void;
  update(time: number, audio: AudioData, intensity: number): void;
  dispose(): void;
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
