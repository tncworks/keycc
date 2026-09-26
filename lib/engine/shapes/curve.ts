/**
 * Switch force curve as a particle chart: force (g) against travel (mm).
 * Procedural: samples store (u along travel, role·4 + v, w, attr) and the
 * simulation evaluates the curve from uniforms, so choosing another switch
 * reshapes the graph in place — the particles glide to the new curve.
 *
 * Roles: 0 downstroke line · 1 upstroke line (dashed) · 2 fill under the
 * curve · 3 axes, ticks, grid (static chart fractions) · 4 actuation ring ·
 * 5 actuation guide line. 4 and 5 carry the accent.
 */
import type { Rng } from "../random";
import { R1_A, R2_A1, R2_A2, ShapeBuffer, packAttr, setOrder } from "../sampling";

export const CURVE = { width: 3.3, height: 1.95, maxF: 100, axisMM: 4 };

export interface SwitchCurve {
  F0: number; // preload at 0 mm (g)
  k: number; // spring rate (g/mm)
  bumpH: number; // tactile bump height (g)
  bumpX: number; // bump position (mm)
  bumpW: number; // bump width (mm)
  spikeH: number; // bottom-out rise (g)
  spikeX0: number; // bottom-out starts (mm)
  travel: number; // total travel (mm)
  actX: number; // actuation point (mm)
}

export type SwitchName = "linear" | "tactile" | "silent";

export const SWITCHES: Record<SwitchName, SwitchCurve> = {
  linear: { F0: 35, k: 7.5, bumpH: 0, bumpX: 0.62, bumpW: 0.42, spikeH: 34, spikeX0: 3.5, travel: 4.0, actX: 2.0 },
  tactile: { F0: 33, k: 7.6, bumpH: 28, bumpX: 0.62, bumpW: 0.42, spikeH: 30, spikeX0: 3.5, travel: 4.0, actX: 2.0 },
  silent: { F0: 34, k: 7.2, bumpH: 0, bumpX: 0.62, bumpW: 0.42, spikeH: 13, spikeX0: 3.2, travel: 3.7, actX: 1.9 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Downstroke force at x mm — mirrored exactly by swForce() in the shader. */
export function force(c: SwitchCurve, x: number): number {
  const s = smooth(c.spikeX0, c.travel, x);
  const g = Math.exp(-(((x - c.bumpX) / c.bumpW) ** 2));
  return c.F0 + c.k * Math.min(x, c.travel) + c.bumpH * g + c.spikeH * s * s;
}

export function chartXY(xmm: number, F: number): [number, number] {
  return [(xmm / CURVE.axisMM - 0.5) * CURVE.width, (F / CURVE.maxF - 0.5) * CURVE.height];
}

export const CURVE_ROLES = { down: 0, up: 1, fill: 2, chart: 3, ring: 4, guide: 5 } as const;

export function buildCurve(N: number, rng: Rng): { buf: ShapeBuffer; rest: Float32Array } {
  const buf = new ShapeBuffer(N);
  const rest = new Float32Array(N * 3);
  const shares: [number, number][] = [
    [CURVE_ROLES.down, 0.36],
    [CURVE_ROLES.up, 0.11],
    [CURVE_ROLES.fill, 0.32],
    [CURVE_ROLES.chart, 0.15],
    [CURVE_ROLES.ring, 0.03],
    [CURVE_ROLES.guide, 0.03],
  ];
  const counts = shares.map(([, s]) => Math.floor(N * s));
  counts[2] += N - counts.reduce((a, b) => a + b, 0);
  const lin = SWITCHES.linear;
  let k = 0;
  const push = (role: number, u: number, v: number, w: number, shade: number, accent: boolean, j: number, n: number) => {
    buf.push(u, role * 4 + Math.min(Math.max(v, 0), 0.999), w, 0, 0, 0, packAttr(shade, -1, accent), 0, (j + 0.5) / n);
    // rest pose (linear switch) for matching
    let xmm = u * lin.travel, F = force(lin, xmm);
    if (role === CURVE_ROLES.fill) F *= v;
    if (role === CURVE_ROLES.chart) {
      rest[k * 3] = (u - 0.5) * CURVE.width;
      rest[k * 3 + 1] = (v - 0.5) * CURVE.height;
    } else {
      if (role === CURVE_ROLES.ring || role === CURVE_ROLES.guide) {
        xmm = lin.actX;
        F = role === CURVE_ROLES.guide ? force(lin, xmm) * v : force(lin, xmm);
      }
      const [X, Y] = chartXY(xmm, F);
      rest[k * 3] = X;
      rest[k * 3 + 1] = Y;
    }
    rest[k * 3 + 2] = 0;
    k++;
  };

  shares.forEach(([role], ri) => {
    const n = counts[ri];
    const s0 = rng(), s1 = rng();
    if (role === CURVE_ROLES.down) {
      for (let j = 0; j < n; j++) push(role, (s0 + j * R1_A) % 1, 0, rng(), 0.92, false, j, n);
    } else if (role === CURVE_ROLES.up) {
      // dashed: keep only the "on" part of each dash
      let j = 0;
      for (let q = 0; j < n; q++) {
        const u = (s0 + q * R1_A) % 1;
        if ((u * 30) % 1 > 0.55) continue;
        push(role, u, 0, rng(), 0.42, false, j++, n);
      }
    } else if (role === CURVE_ROLES.fill) {
      for (let j = 0; j < n; j++) {
        const u = (s0 + j * R2_A1) % 1;
        const v = Math.pow((s1 + j * R2_A2) % 1, 0.55); // denser toward the curve
        push(role, u, v, rng(), 0.12 + 0.16 * v, false, j, n);
      }
    } else if (role === CURVE_ROLES.chart) {
      // axes, ticks and dotted grid, in chart fractions (u across, v up)
      for (let j = 0; j < n; j++) {
        const r = rng();
        let u: number, v: number, shade: number;
        if (r < 0.3) {
          u = rng(); v = (rng() - 0.5) * 0.006; shade = 0.5; // x axis
        } else if (r < 0.46) {
          u = (rng() - 0.5) * 0.004; v = rng(); shade = 0.42; // y axis
        } else if (r < 0.54) {
          u = Math.floor(rng() * 5) / 4; v = -rng() * 0.035; shade = 0.55; // x ticks (0–4 mm)
        } else {
          // dotted grid: horizontals at 25/50/75 g, verticals at each mm
          if (rng() < 0.55) {
            v = (1 + Math.floor(rng() * 3)) * 0.25;
            u = Math.floor(rng() * 64) / 64 + (rng() - 0.5) * 0.002;
          } else {
            u = (1 + Math.floor(rng() * 4)) / 4;
            v = Math.floor(rng() * 40) / 40 + (rng() - 0.5) * 0.002;
          }
          shade = 0.16;
        }
        push(role, u, v, rng(), shade, false, j, n);
      }
    } else if (role === CURVE_ROLES.ring) {
      for (let j = 0; j < n; j++) push(role, 0, rng(), (s0 + j * R1_A) % 1, 1, true, j, n);
    } else {
      // dashed guide from the travel axis up to the actuation point
      let j = 0;
      for (let q = 0; j < n; q++) {
        const v = (s0 + q * R1_A) % 1;
        if ((v * 14) % 1 > 0.6) continue;
        push(role, 0, v, rng(), 0.7, true, j++, n);
      }
    }
  });
  if (k !== N) throw new Error(`curve sampler produced ${k}/${N}`);
  // the chart draws itself left to right; the grid first, the marker last
  setOrder(buf, (u, y) => {
    const role = Math.floor(y / 4);
    if (role === CURVE_ROLES.chart) return u * 0.4;
    if (role >= CURVE_ROLES.ring) return 1.1;
    return 0.1 + u;
  });
  return { buf, rest };
}
