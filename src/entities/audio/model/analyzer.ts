export interface BandLevels {
  sub: number;
  kick: number;
  lowMid: number;
  highMid: number;
  air: number;
}

export interface AudioData {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: boolean;
  waveform: Float32Array;
  spectrum: Float32Array;
  /** Perceptual Hz bands 0..1 */
  bands: BandLevels;
  /** Spectral flux onset envelopes 0..1 */
  onsetKick: number;
  onsetMid: number;
  onsetHat: number;
  /** Overall positive spectral flux 0..1 */
  flux: number;
}

const EMPTY_WAVE = new Float32Array(128);
const EMPTY_SPEC = new Float32Array(64);
const EMPTY_BANDS: BandLevels = {
  sub: 0,
  kick: 0,
  lowMid: 0,
  highMid: 0,
  air: 0,
};

export function emptyAudio(): AudioData {
  return {
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    beat: false,
    waveform: EMPTY_WAVE,
    spectrum: EMPTY_SPEC,
    bands: { ...EMPTY_BANDS },
    onsetKick: 0,
    onsetMid: 0,
    onsetHat: 0,
    flux: 0,
  };
}

/** Hz windows for perceptual bands. */
const BAND_HZ: { key: keyof BandLevels; lo: number; hi: number; lift: number }[] = [
  { key: 'sub', lo: 20, hi: 60, lift: 1.0 },
  { key: 'kick', lo: 60, hi: 150, lift: 1.05 },
  { key: 'lowMid', lo: 150, hi: 600, lift: 1.1 },
  { key: 'highMid', lo: 600, hi: 3000, lift: 1.2 },
  { key: 'air', lo: 3000, hi: 16000, lift: 1.45 },
];

export class AudioAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | MediaElementAudioSourceNode | null =
    null;
  private element: HTMLAudioElement | null = null;
  private freqData = new Uint8Array(0);
  private timeData = new Uint8Array(0);
  private spectrum = new Float32Array(64);
  private waveform = new Float32Array(128);
  private prevBandSpec = {
    kick: new Float32Array(32),
    mid: new Float32Array(48),
    hat: new Float32Array(64),
  };
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothHigh = 0;
  private smoothEnergy = 0;
  private smoothBands: BandLevels = { ...EMPTY_BANDS };
  private onsetKick = 0;
  private onsetMid = 0;
  private onsetHat = 0;
  private smoothFlux = 0;
  private prevEnergy = 0;
  private beatCooldown = 0;
  private kickCd = 0;
  private midCd = 0;
  private hatCd = 0;
  private playing = false;

  async loadFile(file: File): Promise<void> {
    this.stop();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.loop = true;
    this.element = audio;

    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);

    this.source = this.ctx.createMediaElementSource(audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async play(): Promise<void> {
    if (!this.ctx || !this.element) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.element.play();
    this.playing = true;
  }

  pause(): void {
    this.element?.pause();
    this.playing = false;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  hasTrack(): boolean {
    return this.element !== null;
  }

  getCurrentTime(): number {
    return this.element?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.element?.duration ?? 0;
  }

  stop(): void {
    this.pause();
    if (this.element?.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.element.src);
    }
    this.element = null;
    this.source = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }

  private hzToBin(hz: number, bins: number, sampleRate: number): number {
    const nyquist = sampleRate * 0.5;
    return Math.max(0, Math.min(bins - 1, Math.floor((hz / nyquist) * bins)));
  }

  private bandMean(loHz: number, hiHz: number, sampleRate: number): number {
    const bins = this.freqData.length;
    const lo = this.hzToBin(loHz, bins, sampleRate);
    const hi = Math.max(lo + 1, this.hzToBin(hiHz, bins, sampleRate));
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += this.freqData[i];
    return sum / ((hi - lo) * 255);
  }

  private bandFlux(
    loHz: number,
    hiHz: number,
    sampleRate: number,
    prev: Float32Array,
  ): number {
    const bins = this.freqData.length;
    const lo = this.hzToBin(loHz, bins, sampleRate);
    const hi = Math.max(lo + 1, this.hzToBin(hiHz, bins, sampleRate));
    const n = Math.min(prev.length, hi - lo);
    let flux = 0;
    for (let i = 0; i < n; i++) {
      const v = this.freqData[lo + i] / 255;
      const d = v - prev[i];
      if (d > 0) flux += d;
      prev[i] = v;
    }
    return Math.min(1, flux / Math.max(0.08, n * 0.06));
  }

  sample(dt: number): AudioData {
    if (!this.analyser || !this.ctx || !this.playing) {
      this.smoothBass *= 0.92;
      this.smoothMid *= 0.92;
      this.smoothHigh *= 0.92;
      this.smoothEnergy *= 0.92;
      this.onsetKick *= 0.9;
      this.onsetMid *= 0.9;
      this.onsetHat *= 0.9;
      this.smoothFlux *= 0.9;
      for (const k of Object.keys(this.smoothBands) as (keyof BandLevels)[]) {
        this.smoothBands[k] *= 0.92;
      }
      return {
        bass: this.smoothBass,
        mid: this.smoothMid,
        high: this.smoothHigh,
        energy: this.smoothEnergy,
        beat: false,
        waveform: this.waveform,
        spectrum: this.spectrum,
        bands: { ...this.smoothBands },
        onsetKick: this.onsetKick,
        onsetMid: this.onsetMid,
        onsetHat: this.onsetHat,
        flux: this.smoothFlux,
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const sr = this.ctx.sampleRate;
    const raw: BandLevels = { ...EMPTY_BANDS };
    for (const b of BAND_HZ) {
      raw[b.key] = Math.min(1, this.bandMean(b.lo, b.hi, sr) * b.lift);
    }

    // Relative peak-norm across 5 bands
    const peak = Math.max(
      raw.sub,
      raw.kick,
      raw.lowMid,
      raw.highMid,
      raw.air,
      0.08,
    );
    const scale = Math.min(1, peak * 1.4);
    for (const k of Object.keys(raw) as (keyof BandLevels)[]) {
      raw[k] = Math.min(1, (raw[k] / peak) * scale);
    }

    let bass = Math.min(1, raw.sub * 0.45 + raw.kick * 0.55);
    let mid = Math.min(1, raw.lowMid * 0.55 + raw.highMid * 0.45);
    let high = raw.air;
    const energy = Math.min(1, bass * 0.32 + mid * 0.34 + high * 0.34);

    const a = 1 - Math.exp(-dt * 10);
    this.smoothBass += (bass - this.smoothBass) * a;
    this.smoothMid += (mid - this.smoothMid) * a;
    this.smoothHigh += (high - this.smoothHigh) * a;
    this.smoothEnergy += (energy - this.smoothEnergy) * a;
    for (const k of Object.keys(raw) as (keyof BandLevels)[]) {
      this.smoothBands[k] += (raw[k] - this.smoothBands[k]) * a;
    }

    // Per-band spectral flux onsets
    const kickFlux = this.bandFlux(60, 150, sr, this.prevBandSpec.kick);
    const midFlux = this.bandFlux(150, 2500, sr, this.prevBandSpec.mid);
    const hatFlux = this.bandFlux(4000, 14000, sr, this.prevBandSpec.hat);
    const totalFlux = Math.min(1, kickFlux * 0.35 + midFlux * 0.35 + hatFlux * 0.3);
    this.smoothFlux += (totalFlux - this.smoothFlux) * (1 - Math.exp(-dt * 12));

    this.kickCd = Math.max(0, this.kickCd - dt);
    this.midCd = Math.max(0, this.midCd - dt);
    this.hatCd = Math.max(0, this.hatCd - dt);

    if (this.kickCd <= 0 && kickFlux > 0.22 && this.smoothBands.kick > 0.2) {
      this.onsetKick = 1;
      this.kickCd = 0.12;
    }
    if (this.midCd <= 0 && midFlux > 0.2 && mid > 0.18) {
      this.onsetMid = 1;
      this.midCd = 0.1;
    }
    if (this.hatCd <= 0 && hatFlux > 0.18 && high > 0.15) {
      this.onsetHat = 1;
      this.hatCd = 0.08;
    }

    this.onsetKick *= Math.exp(-dt * 7);
    this.onsetMid *= Math.exp(-dt * 8);
    this.onsetHat *= Math.exp(-dt * 9);

    this.beatCooldown = Math.max(0, this.beatCooldown - dt);
    const spike = this.smoothEnergy - this.prevEnergy;
    const beat =
      this.beatCooldown <= 0 &&
      (this.onsetKick > 0.55 || (spike > 0.05 && this.smoothEnergy > 0.28));
    if (beat) this.beatCooldown = 0.14;
    this.prevEnergy = this.smoothEnergy;

    const step = Math.floor(this.freqData.length / this.spectrum.length);
    for (let i = 0; i < this.spectrum.length; i++) {
      this.spectrum[i] = this.freqData[i * step] / 255;
    }

    const wStep = Math.floor(this.timeData.length / this.waveform.length);
    for (let i = 0; i < this.waveform.length; i++) {
      this.waveform[i] = (this.timeData[i * wStep] - 128) / 128;
    }

    return {
      bass: this.smoothBass,
      mid: this.smoothMid,
      high: this.smoothHigh,
      energy: this.smoothEnergy,
      beat,
      waveform: this.waveform,
      spectrum: this.spectrum,
      bands: { ...this.smoothBands },
      onsetKick: this.onsetKick,
      onsetMid: this.onsetMid,
      onsetHat: this.onsetHat,
      flux: this.smoothFlux,
    };
  }
}
