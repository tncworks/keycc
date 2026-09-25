/**
 * Amplitude history for the ridgeline waveform: a ring buffer of rows
 * (newest = front line), written at a fixed rate on the CPU and sampled
 * with linear filtering on the GPU so the ridges glide back smoothly.
 * Each keystroke adds a short, decaying "thock" packet centred where the
 * key sits on the board (Q left, P right, space a broad low swell).
 */
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat, RepeatWrapping, ClampToEdgeWrapping } from "three";
import { WAVE } from "./shapes/waveform";
import type { Rng } from "./random";

interface Burst {
  u: number;
  amp: number;
  t0: number;
  width: number;
  h1: number;
  h2: number;
  d1: number;
  d2: number;
}

export class WaveHistory {
  readonly tex: DataTexture;
  private readonly data: Uint16Array;
  private readonly row = new Float32Array(WAVE.cols);
  private bursts: Burst[] = [];
  private time = 0;
  private written = 0; // rows written so far
  /** continuous head position in rows (for smooth scrolling) */
  head = 0;
  private readonly phases: number[];
  private dirty = false;

  constructor(private readonly rng: Rng) {
    this.data = new Uint16Array(WAVE.cols * WAVE.rows);
    this.tex = new DataTexture(this.data, WAVE.cols, WAVE.rows, RedFormat, HalfFloatType);
    this.tex.minFilter = LinearFilter;
    this.tex.magFilter = LinearFilter;
    this.tex.wrapS = ClampToEdgeWrapping;
    this.tex.wrapT = RepeatWrapping;
    this.tex.generateMipmaps = false;
    this.phases = Array.from({ length: 6 }, () => rng() * 100);
    // pre-fill so the lines are already alive when first seen
    for (let i = 0; i < WAVE.rows; i++) this.writeRow(i / WAVE.rate);
    this.written = WAVE.rows;
    this.time = WAVE.rows / WAVE.rate;
    this.head = this.written;
    this.tex.needsUpdate = true;
  }

  /** a keystroke at normalised board position u (0 left … 1 right) */
  hit(u: number, strength = 1, wide = false) {
    const r = this.rng;
    this.bursts.push({
      u: 0.1 + 0.8 * u,
      amp: (0.55 + 0.25 * r()) * strength,
      t0: this.time,
      width: wide ? 0.13 : 0.028 + 0.01 * r(),
      h1: 0.25 + 0.25 * r(),
      h2: 0.15 + 0.2 * r(),
      d1: 0.05 + 0.03 * r(),
      d2: -(0.04 + 0.03 * r()),
    });
    if (this.bursts.length > 24) this.bursts.shift();
  }

  /**
   * "Room tone": a few slowly wandering peaks in the middle band (edges stay
   * flat, like the classic ridgeline plot) plus fine grain, so the lines
   * read as sound even before anyone types.
   */
  private idle(u: number, t: number): number {
    const p = this.phases;
    const grain =
      Math.sin(u * 61.3 + t * 2.3 + p[0]) * 0.5 + Math.sin(u * 97.1 - t * 3.1 + p[1]) * 0.3 + Math.sin(u * 149.9 + t * 4.7 + p[2]) * 0.2;
    let peaks = 0;
    for (let k = 0; k < 4; k++) {
      const c = 0.5 + 0.17 * Math.sin(t * (0.11 + 0.04 * k) + p[k] * 3.1) + (k - 1.5) * 0.06;
      const wdt = 0.035 + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.17 + p[k + 1]));
      const amp = 0.14 + 0.1 * Math.sin(t * (0.23 + 0.05 * k) + p[k + 2]);
      peaks += amp * Math.exp(-(((u - c) / wdt) ** 2));
    }
    const band = Math.exp(-(((u - 0.5) / 0.19) ** 4));
    return 0.012 + band * (0.05 + peaks + 0.03 * grain);
  }

  private writeRow(t: number) {
    const row = this.row;
    for (let i = 0; i < WAVE.cols; i++) {
      const u = i / (WAVE.cols - 1);
      let a = this.idle(u, t);
      for (const b of this.bursts) {
        const tau = t - b.t0;
        if (tau < 0) continue;
        const env = (1 - Math.exp(-tau / 0.012)) * Math.exp(-tau / 0.24);
        if (env < 1e-3) continue;
        const g = (du: number, w: number) => Math.exp(-((du / w) ** 2));
        a += b.amp * env * (g(u - b.u, b.width) + b.h1 * g(u - b.u - b.d1, b.width * 0.7) + b.h2 * g(u - b.u - b.d2, b.width * 0.6));
      }
      const win = Math.pow(Math.sin(Math.PI * u), 1.3);
      row[i] = Math.min(a * win, 1.4);
    }
    const r = this.written % WAVE.rows;
    for (let i = 0; i < WAVE.cols; i++) this.data[r * WAVE.cols + i] = DataUtils.toHalfFloat(row[i]);
    this.written++;
  }

  /** advance; returns true when new rows were written */
  update(dt: number): boolean {
    if (dt <= 0) return false;
    this.time += dt;
    let wrote = false;
    while (this.written < this.time * WAVE.rate) {
      this.writeRow(this.written / WAVE.rate);
      wrote = true;
    }
    this.bursts = this.bursts.filter((b) => this.time - b.t0 < 2.5);
    this.head = this.time * WAVE.rate;
    if (wrote) this.dirty = true;
    return wrote;
  }

  /** upload pending rows (call only while the ridgeline is on screen) */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
