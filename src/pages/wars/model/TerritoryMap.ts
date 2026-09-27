import type { AudioData } from '@entities/audio';

export type FactionId = 0 | 1 | 2; // bass | mid | high

export interface FactionStats {
  id: FactionId;
  name: string;
  power: number;
  cells: number;
  share: number;
}

const EMPTY = 255;
const AREA_CAP = 0.45;

/** Territory capture sim: bass blobs, mid tendrils, high sparks. */
export class TerritoryMap {
  readonly width: number;
  readonly height: number;
  readonly owner: Uint8Array;
  readonly strength: Uint8Array;
  readonly texData: Float32Array;

  private nextOwner: Uint8Array;
  private nextStrength: Uint8Array;
  private tendrilHeads: { x: number; y: number }[] = [];
  private seedX: number[] = [];
  private seedY: number[] = [];
  private shares = [1 / 3, 1 / 3, 1 / 3];

  constructor(width = 96, height = 64) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.owner = new Uint8Array(n);
    this.strength = new Uint8Array(n);
    this.nextOwner = new Uint8Array(n);
    this.nextStrength = new Uint8Array(n);
    this.texData = new Float32Array(n * 4);
    this.owner.fill(EMPTY);

    this.seedX = [
      Math.floor(width * 0.2),
      Math.floor(width * 0.5),
      Math.floor(width * 0.8),
    ];
    this.seedY = [
      Math.floor(height * 0.55),
      Math.floor(height * 0.35),
      Math.floor(height * 0.6),
    ];

    for (let f = 0; f < 3; f++) {
      this.paintDisk(this.seedX[f], this.seedY[f], 3 + f, f as FactionId, 200);
    }

    for (let i = 0; i < 5; i++) {
      this.tendrilHeads.push({
        x: this.seedX[1] + (i - 2) * 4,
        y: this.seedY[1],
      });
    }
    this.refreshShares();
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  private paintDisk(
    cx: number,
    cy: number,
    r: number,
    faction: FactionId,
    str: number,
  ): void {
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = this.idx(x, y);
        this.owner[i] = faction;
        this.strength[i] = Math.max(this.strength[i], str);
      }
    }
  }

  private refreshShares(): void {
    const counts = [0, 0, 0];
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i];
      if (o <= 2) counts[o]++;
    }
    const total = Math.max(1, counts[0] + counts[1] + counts[2]);
    this.shares = counts.map((c) => c / total);
  }

  /** Soft penalty when a faction owns too much of the map. */
  private areaMul(f: FactionId): number {
    const over = Math.max(0, this.shares[f] - AREA_CAP);
    return Math.max(0.25, 1 - over * 3.5);
  }

  private power(audio: AudioData, f: FactionId): number {
    if (f === 0) return audio.bass;
    if (f === 1) return audio.mid;
    return audio.high;
  }

  step(dt: number, audio: AudioData): void {
    const w = this.width;
    const h = this.height;
    this.nextOwner.set(this.owner);
    this.nextStrength.set(this.strength);
    this.refreshShares();

    const bassP = this.power(audio, 0);
    const midP = this.power(audio, 1);
    const highP = this.power(audio, 2);
    const kickOn = audio.onsetKick;
    const midOn = audio.onsetMid;
    const hatOn = audio.onsetHat;
    const beatBoost = audio.beat || kickOn > 0.5 ? 1.35 : 1;
    const bassCap = this.areaMul(0);
    const midCap = this.areaMul(1);
    const highCap = this.areaMul(2);

    // decay — high lasts a bit longer so sparks stick
    for (let i = 0; i < this.strength.length; i++) {
      let s = this.strength[i];
      if (s === 0) {
        this.nextOwner[i] = EMPTY;
        continue;
      }
      const own = this.owner[i];
      const decay = own === 0 ? 10 : own === 1 ? 12 : 16;
      s = Math.max(0, s - decay * dt * (1.15 - audio.energy * 0.35));
      this.nextStrength[i] = s;
      if (s < 12) this.nextOwner[i] = EMPTY;
    }

    // --- Bass: weak continuous crawl; strong burst only on kick onset ---
    const continuousChance = 0.02 + bassP * 0.08;
    const burst = kickOn > 0.35 || audio.beat;
    const blobR = burst
      ? 1 + Math.floor((bassP * 1.8 + kickOn * 2.2) * bassCap)
      : 1;
    const blobChance = burst
      ? 0.12 + bassP * 0.25 * kickOn * bassCap
      : continuousChance * bassCap;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = this.idx(x, y);
        if (this.owner[i] !== 0) continue;
        if (Math.random() > blobChance) continue;
        for (let dy = -blobR; dy <= blobR; dy++) {
          for (let dx = -blobR; dx <= blobR; dx++) {
            if (dx * dx + dy * dy > blobR * blobR) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = this.idx(nx, ny);
            const attack =
              (burst ? 55 + kickOn * 100 + bassP * 40 : 25 + bassP * 40) *
              bassCap;
            this.tryCapture(ni, 0, attack);
          }
        }
      }
    }
    if (bassP > 0.12) {
      const seedR = burst
        ? 2 + Math.floor(kickOn * 3 + bassP * 2)
        : 1 + Math.floor(bassP);
      this.paintIntoNext(
        this.seedX[0],
        this.seedY[0],
        seedR,
        0,
        (120 + bassP * 50 + kickOn * 80) * bassCap,
      );
    }

    // --- Mid: tendril speed from onsetMid + mid level ---
    const midDrive = midP * 0.55 + midOn * 0.9;
    const midSteps = Math.max(
      1,
      Math.floor((1 + midDrive * 7 * beatBoost) * midCap),
    );
    for (const head of this.tendrilHeads) {
      for (let s = 0; s < midSteps; s++) {
        const angle =
          Math.sin(performance.now() * 0.001 + head.x * 0.1) * Math.PI +
          (Math.random() - 0.5) * 1.2;
        const tx = Math.round(head.x + Math.cos(angle));
        const ty = Math.round(head.y + Math.sin(angle) * 0.8);
        head.x = Math.max(1, Math.min(w - 2, tx));
        head.y = Math.max(1, Math.min(h - 2, ty));
        const attack = (45 + midDrive * 150 * beatBoost) * midCap;
        this.tryCapture(this.idx(head.x, head.y), 1, attack);
        this.tryCapture(this.idx(head.x + 1, head.y), 1, attack * 0.7);
        this.tryCapture(this.idx(head.x - 1, head.y), 1, attack * 0.7);
      }
    }
    if (midDrive > 0.25 && Math.random() < midDrive * 0.2 * midCap) {
      this.tendrilHeads.push({
        x: this.seedX[1] + Math.floor((Math.random() - 0.5) * 20),
        y: this.seedY[1] + Math.floor((Math.random() - 0.5) * 12),
      });
      if (this.tendrilHeads.length > 18) this.tendrilHeads.shift();
    }

    // --- High: sparks driven by onsetHat ---
    const hatDrive = highP * 0.4 + hatOn * 1.1;
    const sparks = Math.floor(
      (3 + hatDrive * 36 * beatBoost) * highCap * (hatOn > 0.4 ? 1.6 : 1),
    );
    for (let s = 0; s < sparks; s++) {
      let x: number;
      let y: number;
      if (Math.random() < 0.4) {
        x = this.seedX[2] + Math.floor((Math.random() - 0.5) * 30);
        y = this.seedY[2] + Math.floor((Math.random() - 0.5) * 24);
      } else {
        x = Math.floor(Math.random() * w);
        y = Math.floor(Math.random() * h);
        const oi = this.idx(
          Math.max(0, Math.min(w - 1, x)),
          Math.max(0, Math.min(h - 1, y)),
        );
        if (this.owner[oi] === 2) {
          x += Math.floor((Math.random() - 0.5) * (6 + hatDrive * 14));
          y += Math.floor((Math.random() - 0.5) * (6 + hatDrive * 14));
        }
      }
      x = Math.max(0, Math.min(w - 1, x));
      y = Math.max(0, Math.min(h - 1, y));
      const attack = (35 + hatDrive * 170 * beatBoost) * highCap;
      this.tryCapture(this.idx(x, y), 2, attack);
      if (hatDrive > 0.45) {
        this.tryCapture(this.idx(Math.min(w - 1, x + 1), y), 2, attack * 0.65);
        this.tryCapture(this.idx(x, Math.min(h - 1, y + 1)), 2, attack * 0.65);
      }
    }

    // contest
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = this.idx(x, y);
        const best = this.strongestNeighbour(x, y);
        if (!best) continue;
        const cur = this.nextOwner[i];
        const curS = this.nextStrength[i];
        if (cur === best.f) continue;
        const pressure =
          best.s *
          (0.12 + this.power(audio, best.f) * 0.45) *
          this.areaMul(best.f);
        if (cur === EMPTY || pressure > curS) {
          this.nextOwner[i] = best.f;
          this.nextStrength[i] = Math.min(255, best.s * 0.85);
        }
      }
    }

    this.owner.set(this.nextOwner);
    this.strength.set(this.nextStrength);
    this.syncTexture();
  }

  private strongestNeighbour(
    x: number,
    y: number,
  ): { f: FactionId; s: number } | null {
    let bestF: FactionId | null = null;
    let bestS = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const i = this.idx(x + dx, y + dy);
        const o = this.owner[i];
        if (o === EMPTY) continue;
        const s = this.strength[i];
        if (s > bestS) {
          bestS = s;
          bestF = o as FactionId;
        }
      }
    }
    return bestF === null ? null : { f: bestF, s: bestS };
  }

  private tryCapture(i: number, faction: FactionId, attack: number): void {
    if (i < 0 || i >= this.owner.length) return;
    const cur = this.nextOwner[i];
    const curS = this.nextStrength[i];
    if (cur === EMPTY || cur === faction || attack > curS) {
      this.nextOwner[i] = faction;
      this.nextStrength[i] = Math.min(
        255,
        Math.max(cur === faction ? curS : 0, attack),
      );
    } else if (cur !== faction) {
      this.nextStrength[i] = Math.max(0, curS - attack * 0.35);
    }
  }

  private paintIntoNext(
    cx: number,
    cy: number,
    r: number,
    faction: FactionId,
    str: number,
  ): void {
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r2) continue;
        this.tryCapture(this.idx(x, y), faction, str);
      }
    }
  }

  syncTexture(): void {
    const d = this.texData;
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i];
      const s = this.strength[i] / 255;
      const base = i * 4;
      if (o === EMPTY) {
        d[base] = 0;
        d[base + 1] = 0;
        d[base + 2] = 0;
        d[base + 3] = 0;
      } else {
        d[base] = o / 2;
        d[base + 1] = s;
        d[base + 2] = o === 0 ? 0.08 : o === 1 ? 0.45 : 0.85;
        d[base + 3] = 0.35 + s * 0.65;
      }
    }
  }

  stats(): FactionStats[] {
    const counts = [0, 0, 0];
    const powers = [0, 0, 0];
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i];
      if (o > 2) continue;
      counts[o]++;
      powers[o] += this.strength[i];
    }
    const total = Math.max(1, counts[0] + counts[1] + counts[2]);
    const names = ['Bass Blob', 'Mid Tendril', 'High Spark'];
    return [0, 1, 2].map((id) => ({
      id: id as FactionId,
      name: names[id],
      power: powers[id] / Math.max(1, counts[id]) / 255,
      cells: counts[id],
      share: counts[id] / total,
    }));
  }

  reset(): void {
    this.owner.fill(EMPTY);
    this.strength.fill(0);
    this.tendrilHeads = [];
    for (let f = 0; f < 3; f++) {
      this.paintDisk(this.seedX[f], this.seedY[f], 3 + f, f as FactionId, 200);
    }
    for (let i = 0; i < 5; i++) {
      this.tendrilHeads.push({
        x: this.seedX[1] + (i - 2) * 4,
        y: this.seedY[1],
      });
    }
    this.syncTexture();
    this.refreshShares();
  }
}
