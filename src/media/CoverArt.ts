import {
  CanvasTexture,
  Color,
  NearestFilter,
  SRGBColorSpace,
  type Texture,
} from 'three';

export interface CoverPalette {
  /** Dominant colors for Bass / Mid / High factions */
  bass: string;
  mid: string;
  high: string;
  bassRgb: [number, number, number];
  midRgb: [number, number, number];
  highRgb: [number, number, number];
}

const FALLBACK: CoverPalette = {
  bass: '#FF6A1A',
  mid: '#1AFF9A',
  high: '#B44DFF',
  bassRgb: [1, 0.416, 0.102],
  midRgb: [0.102, 1, 0.604],
  highRgb: [0.706, 0.302, 1],
};

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

/**
 * Cover art for effect materials — canvas texture + 3-color palette.
 */
export class CoverArt {
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture | null = null;
  private palette: CoverPalette = { ...FALLBACK };
  private objectUrl: string | null = null;
  private loaded = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getTexture(): Texture | null {
    return this.texture;
  }

  getPalette(): CoverPalette {
    return this.palette;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  async loadFile(file: File): Promise<void> {
    this.clear();
    const url = URL.createObjectURL(file);
    this.objectUrl = url;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('cover load failed'));
      el.src = url;
    });

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    const size = 256;
    this.canvas.width = size;
    this.canvas.height = size;
    // cover-fit
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) * 0.5, (size - h) * 0.5, w, h);

    this.palette = this.extractPalette(ctx, size);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.needsUpdate = true;
    this.loaded = true;
  }

  private extractPalette(
    ctx: CanvasRenderingContext2D,
    size: number,
  ): CoverPalette {
    const data = ctx.getImageData(0, 0, size, size).data;
    // Quantize to 4-bit/channel buckets, skip near-black/white
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
    const step = 8;
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 200) continue;
      const lum = luminance(r, g, b);
      if (lum < 0.08 || lum > 0.92) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const cur = buckets.get(key);
      if (cur) {
        cur.r += r;
        cur.g += g;
        cur.b += b;
        cur.n++;
      } else {
        buckets.set(key, { r, g, b, n: 1 });
      }
    }

    const sorted = [...buckets.values()]
      .map((c) => ({
        r: c.r / c.n,
        g: c.g / c.n,
        b: c.b / c.n,
        n: c.n,
        hue: (Math.atan2(Math.sqrt(3) * (c.g / c.n - c.b / c.n), 2 * (c.r / c.n) - c.g / c.n - c.b / c.n) + Math.PI) / (Math.PI * 2),
      }))
      .sort((a, b) => b.n - a.n);

    if (sorted.length < 1) return { ...FALLBACK };

    // Pick three diverse hues: warm, greenish, cool/magenta
    const pickNear = (targetHue: number) => {
      let best = sorted[0];
      let bestD = 999;
      for (const c of sorted.slice(0, 24)) {
        let d = Math.abs(c.hue - targetHue);
        if (d > 0.5) d = 1 - d;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    };

    const warm = pickNear(0.05); // orange
    const green = pickNear(0.38);
    const purple = pickNear(0.78);

    const toPal = (c: { r: number; g: number; b: number }) => {
      const rgb: [number, number, number] = [c.r / 255, c.g / 255, c.b / 255];
      return { hex: rgbToHex(c.r, c.g, c.b), rgb };
    };

    const b = toPal(warm);
    const m = toPal(green);
    const h = toPal(purple);
    return {
      bass: b.hex,
      mid: m.hex,
      high: h.hex,
      bassRgb: b.rgb,
      midRgb: m.rgb,
      highRgb: h.rgb,
    };
  }

  /** Three.js Color helpers for Wars uniforms */
  getFactionColors(): { bass: Color; mid: Color; high: Color } {
    return {
      bass: new Color(this.palette.bass),
      mid: new Color(this.palette.mid),
      high: new Color(this.palette.high),
    };
  }

  clear(): void {
    this.loaded = false;
    this.texture?.dispose();
    this.texture = null;
    this.palette = { ...FALLBACK };
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  dispose(): void {
    this.clear();
  }
}
