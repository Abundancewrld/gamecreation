// Simple seeded value-noise generator (no external deps).
class ValueNoise {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.perm = new Uint8Array(256);
    let s = this.seed || 1;
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
  }

  hash(x, y) {
    const a = this.perm[(x & 255)];
    const b = this.perm[(a + y) & 255];
    return b / 255;
  }

  smooth(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const sx = x - x0, sy = y - y0;
    const n00 = this.hash(x0, y0), n10 = this.hash(x1, y0);
    const n01 = this.hash(x0, y1), n11 = this.hash(x1, y1);
    const ix0 = n00 + (n10 - n00) * sx;
    const ix1 = n01 + (n11 - n01) * sx;
    return ix0 + (ix1 - ix0) * sy;
  }

  // Fractal/octave noise, returns 0..1
  noise2D(x, y, octaves = 4, persistence = 0.5, scale = 0.05) {
    let total = 0, freq = scale, amp = 1, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.smooth(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / maxAmp;
  }
}
