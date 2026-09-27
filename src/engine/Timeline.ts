import type { Signal } from './Signal';

export interface TimelineClip {
  signal: Signal;
  duration: number;
  transition: number;
}

export interface TimelineState {
  active: Signal;
  next: Signal | null;
  blend: number;
  clipIndex: number;
  clipTime: number;
  totalTime: number;
}

/** Auto-rotating timeline over a list of signals. */
export class Timeline {
  private clips: TimelineClip[];
  private index = 0;
  private clipTime = 0;
  private totalTime = 0;
  private auto = true;

  constructor(signals: Signal[], duration = 8, transition = 1.4) {
    this.clips = signals.map((signal) => ({
      signal,
      duration,
      transition,
    }));
  }

  setAuto(value: boolean): void {
    this.auto = value;
  }

  isAuto(): boolean {
    return this.auto;
  }

  jumpTo(index: number): void {
    this.index = ((index % this.clips.length) + this.clips.length) % this.clips.length;
    this.clipTime = 0;
  }

  next(): void {
    this.jumpTo(this.index + 1);
  }

  prev(): void {
    this.jumpTo(this.index - 1);
  }

  getSignals(): Signal[] {
    return this.clips.map((c) => c.signal);
  }

  getCurrentIndex(): number {
    return this.index;
  }

  tick(dt: number): TimelineState {
    this.totalTime += dt;
    if (this.auto) this.clipTime += dt;

    const clip = this.clips[this.index];
    const fadeStart = clip.duration - clip.transition;

    let blend = 0;
    let next: Signal | null = null;

    if (this.auto && this.clipTime >= fadeStart) {
      const t = (this.clipTime - fadeStart) / clip.transition;
      blend = Math.min(1, Math.max(0, t));
      blend = blend * blend * (3 - 2 * blend);
      next = this.clips[(this.index + 1) % this.clips.length].signal;
    }

    if (this.auto && this.clipTime >= clip.duration) {
      this.index = (this.index + 1) % this.clips.length;
      this.clipTime = 0;
      blend = 0;
      next = null;
    }

    return {
      active: this.clips[this.index].signal,
      next,
      blend,
      clipIndex: this.index,
      clipTime: this.clipTime,
      totalTime: this.totalTime,
    };
  }
}
