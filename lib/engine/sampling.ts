/**
 * Even surface sampling (PHYSICS.md §3.1).
 *
 * Shapes are unions of analytic primitives. N samples are allocated to
 * primitives by weighted area (largest remainder, so the total is exact) and
 * placed inside each primitive with the R2 quasirandom sequence plus a random
 * Cranley–Patterson rotation. R2 is progressive, so every sample carries a
 * rank; any rank-prefix of a shape is itself evenly spread (tiers, §5.3).
 */
import type { Rng } from "./random";

/** R2 sequence constants: 1/φ₂ and 1/φ₂² with φ₂ the plastic number. */
export const R2_A1 = 0.7548776662466927;
export const R2_A2 = 0.5698402909980532;
/** R3 (Kronecker) constants for volumes: powers of 1/φ₃, φ₃⁴ = φ₃ + 1. */
const PHI3 = 1.2207440846057596;
export const R3_A = [1 / PHI3, 1 / (PHI3 * PHI3), 1 / (PHI3 * PHI3 * PHI3)] as const;
/** Golden-ratio additive sequence for 1-D domains. */
export const R1_A = 0.6180339887498949;

const frac = (x: number) => x - Math.floor(x);

// ---------------------------------------------------------------------------
// Affine transforms (row-major 3×3 + translation), generation-time only.

export type Xf = Float64Array; // [r00 r01 r02 r10 r11 r12 r20 r21 r22 tx ty tz]

export function xfIdentity(): Xf {
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
}
export function xfTranslate(x: number, y: number, z: number): Xf {
  const m = xfIdentity();
  m[9] = x;
  m[10] = y;
  m[11] = z;
  return m;
}
export function xfScale(s: number): Xf {
  return new Float64Array([s, 0, 0, 0, s, 0, 0, 0, s, 0, 0, 0]);
}
export function xfRotX(a: number): Xf {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([1, 0, 0, 0, c, -s, 0, s, c, 0, 0, 0]);
}
export function xfRotY(a: number): Xf {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0]);
}
export function xfRotZ(a: number): Xf {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1, 0, 0, 0]);
}
/** a ∘ b (apply b first). */
export function xfMul(a: Xf, b: Xf): Xf {
  const m = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
    m[9 + r] = a[r * 3] * b[9] + a[r * 3 + 1] * b[10] + a[r * 3 + 2] * b[11] + a[9 + r];
  }
  return m;
}
export function xfChain(...xs: Xf[]): Xf {
  return xs.reduce((acc, x) => xfMul(acc, x), xfIdentity());
}
function xfScaleOf(m: Xf): number {
  return Math.hypot(m[0], m[3], m[6]);
}

// ---------------------------------------------------------------------------
// Output buffer

export function packAttr(shade: number, key: number, accent: boolean): number {
  const s = Math.min(Math.max(shade, 0), 1);
  return (key + 1) * 4 + (accent ? 2 : 0) + s * 1.99;
}

export class ShapeBuffer {
  readonly n: number;
  count = 0;
  /** xyz + packed attr */
  readonly pos: Float32Array;
  /** surface normal (zero = no facing) + build order */
  readonly nrm: Float32Array;
  /** progressive rank in [0,1) */
  readonly rank: Float32Array;

  constructor(n: number) {
    this.n = n;
    this.pos = new Float32Array(n * 4);
    this.nrm = new Float32Array(n * 4);
    this.rank = new Float32Array(n);
  }

  push(x: number, y: number, z: number, nx: number, ny: number, nz: number, attr: number, order: number, rank: number) {
    const i = this.count++;
    const p = i * 4;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.pos[p + 3] = attr;
    this.nrm[p] = nx;
    this.nrm[p + 1] = ny;
    this.nrm[p + 2] = nz;
    this.nrm[p + 3] = order;
    this.rank[i] = rank;
  }
}

// ---------------------------------------------------------------------------
// Primitives

/** Emits one local-space sample: point, (unnormalised) normal, shade multiplier. */
export type LocalEmit = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shadeMod: number) => void;

export interface Part {
  xf: Xf;
  key: number;
  accent: boolean;
  shade: number; // multiplier on the lighting term
  /** optional override of the lit shade (e.g. glyph masks) */
  flat?: number;
}

export interface Primitive {
  /** area in local units² */
  area: number;
  weight: number;
  part: Part;
  sample(count: number, rng: Rng, emit: LocalEmit): void;
}

export type HeightFn = (x: number, z: number) => number;

export interface RoundRect {
  hx: number;
  hz: number;
  r: number;
  cx?: number;
  cz?: number;
  y: HeightFn;
}

function rrInside(x: number, z: number, hx: number, hz: number, r: number): boolean {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > hx || az > hz) return false;
  const ix = hx - r, iz = hz - r;
  if (ax <= ix || az <= iz) return true;
  const dx = ax - ix, dz = az - iz;
  return dx * dx + dz * dz <= r * r;
}

function rrArea(hx: number, hz: number, r: number): number {
  return 4 * hx * hz - (4 - Math.PI) * r * r;
}

const SEG = { x: 0, z: 0, nx: 0, nz: 0 };
/** Point on segment k (0..7: edges and quarter arcs) of a rounded rect at param s∈[0,1]. */
function rrSeg(hx: number, hz: number, r: number, k: number, s: number) {
  const ix = hx - r, iz = hz - r;
  switch (k) {
    case 0: SEG.x = hx; SEG.z = -iz + 2 * iz * s; SEG.nx = 1; SEG.nz = 0; break;
    case 2: SEG.x = ix - 2 * ix * s; SEG.z = hz; SEG.nx = 0; SEG.nz = 1; break;
    case 4: SEG.x = -hx; SEG.z = iz - 2 * iz * s; SEG.nx = -1; SEG.nz = 0; break;
    case 6: SEG.x = -ix + 2 * ix * s; SEG.z = -hz; SEG.nx = 0; SEG.nz = -1; break;
    default: {
      const q = (k - 1) >> 1; // 0..3
      const a = (q + s) * (Math.PI / 2);
      const cx = q === 0 || q === 3 ? ix : -ix;
      const cz = q === 0 || q === 1 ? iz : -iz;
      SEG.nx = Math.cos(a);
      SEG.nz = Math.sin(a);
      SEG.x = cx + r * SEG.nx;
      SEG.z = cz + r * SEG.nz;
    }
  }
  return SEG;
}
function rrSegLen(hx: number, hz: number, r: number, k: number): number {
  if (k === 0 || k === 4) return 2 * (hz - r);
  if (k === 2 || k === 6) return 2 * (hx - r);
  return (Math.PI / 2) * r;
}

/** Inverse CDF of a linear pdf on [0,1] that goes from a to b. */
function invLinear(u: number, a: number, b: number): number {
  const d = b - a;
  if (Math.abs(d) < 1e-9 * (a + b + 1e-9)) return u;
  // ∫0^t (a + d s) ds / ((a+b)/2) = u
  const c = u * (a + b) * 0.5;
  return (-a + Math.sqrt(Math.max(a * a + 2 * d * c, 0))) / d;
}

/**
 * Iterate R2 points with rejection until `count` are accepted.
 *
 * The sequence runs over a *square* of side max(w, h) in real units and is
 * clipped to the w×h domain: stretching R2's lattice over a thin strip (a
 * keycap skirt is 60 mm around but 8 mm tall) shows up as diagonal moiré.
 * A jitter of ~0.4 × the mean spacing breaks the residual lattice while
 * keeping the no-clump property. `accept` gets normalised (u, v).
 */
function r2Loop(count: number, rng: Rng, w: number, h: number, accept: (u: number, v: number) => boolean) {
  const s1 = rng(), s2 = rng();
  const S = Math.max(w, h, 1e-9);
  const spacing = Math.sqrt((w * h) / Math.max(count, 1));
  const j = 0.4 * spacing;
  let got = 0;
  const cap = Math.ceil(count * (S / Math.max(Math.min(w, h), 1e-9)) * 64) + 256;
  for (let n = 0; got < count && n < cap; n++) {
    const x = frac(s1 + n * R2_A1) * S;
    const y = frac(s2 + n * R2_A2) * S;
    if (x > w || y > h) continue;
    const jx = (rng() - 0.5) * j, jy = (rng() - 0.5) * j;
    const u = Math.min(Math.max((x + jx) / w, 0), 1);
    const v = Math.min(Math.max((y + jy) / h, 0), 1);
    if (accept(u, v)) got++;
  }
  // Pathological masks: fill the rest with plain random points.
  while (got < count) {
    if (accept(rng(), rng())) got++;
  }
}

/** Horizontal rounded-rect face with a height field (keycap tops, knob tops…). */
export function rrFace(part: Part, weight: number, rr: RoundRect, dir = 1): Primitive {
  const cx = rr.cx ?? 0, cz = rr.cz ?? 0;
  return {
    area: rrArea(rr.hx, rr.hz, rr.r),
    weight,
    part,
    sample(count, rng, emit) {
      const e = 0.05;
      r2Loop(count, rng, 2 * rr.hx, 2 * rr.hz, (u, v) => {
        const x = (u * 2 - 1) * rr.hx, z = (v * 2 - 1) * rr.hz;
        if (!rrInside(x, z, rr.hx, rr.hz, rr.r)) return false;
        const X = x + cx, Z = z + cz;
        const y = rr.y(X, Z);
        const dx = (rr.y(X + e, Z) - rr.y(X - e, Z)) / (2 * e);
        const dz = (rr.y(X, Z + e) - rr.y(X, Z - e)) / (2 * e);
        emit(X, y, Z, -dx * dir, dir, -dz * dir, 1);
        return true;
      });
    },
  };
}

/** Flat ring between an outer and an inner rounded rect (a case rim). */
export function rrRing(part: Part, weight: number, outer: RoundRect, inner: RoundRect, y: number): Primitive {
  const icx = inner.cx ?? 0, icz = inner.cz ?? 0;
  return {
    area: rrArea(outer.hx, outer.hz, outer.r) - rrArea(inner.hx, inner.hz, inner.r),
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, 2 * outer.hx, 2 * outer.hz, (u, v) => {
        const x = (u * 2 - 1) * outer.hx, z = (v * 2 - 1) * outer.hz;
        if (!rrInside(x, z, outer.hx, outer.hz, outer.r)) return false;
        if (rrInside(x - icx, z - icz, inner.hx, inner.hz, inner.r)) return false;
        emit(x, y, z, 0, 1, 0, 1);
        return true;
      });
    },
  };
}

/**
 * Wall lofted between two rounded rects (keycap skirts, case walls,
 * chamfers). Area-weighted across the 8 segments and along the height
 * (the perimeter shrinks toward the top, so the pdf in t is linear).
 */
export function rrLoft(part: Part, weight: number, b: RoundRect, t: RoundRect, inward = false): Primitive {
  const bcx = b.cx ?? 0, bcz = b.cz ?? 0, tcx = t.cx ?? 0, tcz = t.cz ?? 0;
  const segArea = new Float64Array(8);
  const lenB = new Float64Array(8);
  const lenT = new Float64Array(8);
  let area = 0;
  for (let k = 0; k < 8; k++) {
    lenB[k] = rrSegLen(b.hx, b.hz, b.r, k);
    lenT[k] = rrSegLen(t.hx, t.hz, t.r, k);
    const pb = rrSeg(b.hx, b.hz, b.r, k, 0.5);
    const bx = pb.x + bcx, bz = pb.z + bcz, nx = pb.nx, nz = pb.nz;
    const pt = rrSeg(t.hx, t.hz, t.r, k, 0.5);
    const tx = pt.x + tcx, tz = pt.z + tcz;
    const dy = t.y(tx, tz) - b.y(bx, bz);
    const inset = (bx - tx) * nx + (bz - tz) * nz;
    const slant = Math.hypot(dy, inset);
    segArea[k] = 0.5 * (lenB[k] + lenT[k]) * slant;
    area += segArea[k];
  }
  const cum = new Float64Array(9);
  for (let k = 0; k < 8; k++) cum[k + 1] = cum[k] + segArea[k];
  let lenSum = 0;
  for (let k = 0; k < 8; k++) lenSum += 0.5 * (lenB[k] + lenT[k]);
  const hAvg = area / Math.max(lenSum, 1e-9);
  return {
    area,
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, lenSum, hAvg, (u, v) => {
        const a = u * area;
        let k = 0;
        while (k < 7 && a >= cum[k + 1]) k++;
        if (segArea[k] <= 0) return false;
        const s = Math.min(Math.max((a - cum[k]) / segArea[k], 0), 1);
        const h = invLinear(v, lenB[k], lenT[k]);
        const pb = rrSeg(b.hx, b.hz, b.r, k, s);
        const bx = pb.x + bcx, bz = pb.z + bcz, nx = pb.nx, nz = pb.nz;
        const pt = rrSeg(t.hx, t.hz, t.r, k, s);
        const tx = pt.x + tcx, tz = pt.z + tcz;
        const by = b.y(bx, bz), ty = t.y(tx, tz);
        const x = bx + (tx - bx) * h, z = bz + (tz - bz) * h, y = by + (ty - by) * h;
        const dy = ty - by;
        const inset = (bx - tx) * nx + (bz - tz) * nz;
        const sg = inward ? -1 : 1;
        emit(x, y, z, nx * dy * sg, inset * sg, nz * dy * sg, 1);
        return true;
      });
    },
  };
}

export interface Hole {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

/** Flat face inside a rounded rect minus rectangular holes (plate between keys). */
export function plateWithHoles(part: Part, weight: number, outer: RoundRect, holes: Hole[], y: number, rngArea: Rng): Primitive {
  const inside = (x: number, z: number) => {
    if (!rrInside(x, z, outer.hx, outer.hz, outer.r)) return false;
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      if (Math.abs(x - h.cx) < h.hx && Math.abs(z - h.cz) < h.hz) return false;
    }
    return true;
  };
  // Area by quasi-Monte-Carlo.
  let hit = 0;
  const M = 20000;
  const s1 = rngArea(), s2 = rngArea();
  for (let n = 0; n < M; n++) {
    const x = (frac(s1 + n * R2_A1) * 2 - 1) * outer.hx;
    const z = (frac(s2 + n * R2_A2) * 2 - 1) * outer.hz;
    if (inside(x, z)) hit++;
  }
  return {
    area: (hit / M) * 4 * outer.hx * outer.hz,
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, 2 * outer.hx, 2 * outer.hz, (u, v) => {
        const x = (u * 2 - 1) * outer.hx, z = (v * 2 - 1) * outer.hz;
        if (!inside(x, z)) return false;
        emit(x, y, z, 0, 1, 0, 1);
        return true;
      });
    },
  };
}

/** Parallelogram o + u·a + v·b with normal a×b. */
export function quad(part: Part, weight: number, o: number[], a: number[], b: number[]): Primitive {
  const nx = a[1] * b[2] - a[2] * b[1];
  const ny = a[2] * b[0] - a[0] * b[2];
  const nz = a[0] * b[1] - a[1] * b[0];
  return {
    area: Math.hypot(nx, ny, nz),
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, Math.hypot(a[0], a[1], a[2]), Math.hypot(b[0], b[1], b[2]), (u, v) => {
        emit(o[0] + a[0] * u + b[0] * v, o[1] + a[1] * u + b[1] * v, o[2] + a[2] * u + b[2] * v, nx, ny, nz, 1);
        return true;
      });
    },
  };
}

/** Axis-aligned box centred at c with half extents h; faces selectable. */
export function box(part: Part, weight: number, c: number[], h: number[], faces = "xXyYzZ"): Primitive[] {
  const [cx, cy, cz] = c, [hx, hy, hz] = h;
  const out: Primitive[] = [];
  if (faces.includes("X")) out.push(quad(part, weight, [cx + hx, cy - hy, cz + hz], [0, 0, -2 * hz], [0, 2 * hy, 0]));
  if (faces.includes("x")) out.push(quad(part, weight, [cx - hx, cy - hy, cz - hz], [0, 0, 2 * hz], [0, 2 * hy, 0]));
  if (faces.includes("Y")) out.push(quad(part, weight, [cx - hx, cy + hy, cz - hz], [0, 0, 2 * hz], [2 * hx, 0, 0]));
  if (faces.includes("y")) out.push(quad(part, weight, [cx - hx, cy - hy, cz - hz], [2 * hx, 0, 0], [0, 0, 2 * hz]));
  if (faces.includes("Z")) out.push(quad(part, weight, [cx - hx, cy - hy, cz + hz], [2 * hx, 0, 0], [0, 2 * hy, 0]));
  if (faces.includes("z")) out.push(quad(part, weight, [cx + hx, cy - hy, cz - hz], [-2 * hx, 0, 0], [0, 2 * hy, 0]));
  return out;
}

/** Cylinder side around +y. `shadeFn(angle)` modulates shade (knurling). */
export function cylinder(part: Part, weight: number, cx: number, cz: number, r: number, y0: number, y1: number, inward = false, shadeFn?: (a: number) => number): Primitive {
  return {
    area: 2 * Math.PI * r * (y1 - y0),
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, 2 * Math.PI * r, y1 - y0, (u, v) => {
        const a = u * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const sg = inward ? -1 : 1;
        emit(cx + r * c, y0 + (y1 - y0) * v, cz + r * s, c * sg, 0, s * sg, shadeFn ? shadeFn(a) : 1);
        return true;
      });
    },
  };
}

/** Annulus (disc when r0 = 0) at height y, normal ±y. */
export function annulus(part: Part, weight: number, cx: number, cz: number, r0: number, r1: number, y: number, dir = 1): Primitive {
  return {
    area: Math.PI * (r1 * r1 - r0 * r0),
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, 1, 1, (u, v) => {
        // area-uniform radius
        const rr = Math.sqrt(r0 * r0 + u * (r1 * r1 - r0 * r0));
        const a = v * Math.PI * 2;
        emit(cx + rr * Math.cos(a), y, cz + rr * Math.sin(a), 0, dir, 0, 1);
        return true;
      });
    },
  };
}

/** Helical spring: tube of radius wr around a helix of radius R. */
export function helix(part: Part, weight: number, R: number, pitch: number, turns: number, wr: number, y0: number): Primitive {
  const L = turns * Math.hypot(2 * Math.PI * R, pitch);
  return {
    area: 2 * Math.PI * wr * L,
    weight,
    part,
    sample(count, rng, emit) {
      r2Loop(count, rng, L, 2 * Math.PI * wr, (u, v) => {
        const th = u * turns * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        // Frame: radial (c,0,s), tangent, binormal.
        const tx = -s * 2 * Math.PI * R, ty = pitch, tz = c * 2 * Math.PI * R;
        const tl = Math.hypot(tx, ty, tz);
        const Tx = tx / tl, Ty = ty / tl, Tz = tz / tl;
        const Nx = c, Ny = 0, Nz = s;
        const Bx = Ty * Nz - Tz * Ny, By = Tz * Nx - Tx * Nz, Bz = Tx * Ny - Ty * Nx;
        const phi = v * Math.PI * 2;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const ox = Nx * cp + Bx * sp, oy = Ny * cp + By * sp, oz = Nz * cp + Bz * sp;
        emit(R * c + wr * ox, y0 + (th / (Math.PI * 2)) * pitch + wr * oy, R * s + wr * oz, ox, oy, oz, 1);
        return true;
      });
    },
  };
}

/** Samples inside a 2-D coverage mask (glyphs), extruded ±depth/2 in z. */
export function mask2D(part: Part, weight: number, mask: Uint8Array, mw: number, mh: number, width: number, height: number, depth: number, edgeBoost: number): Primitive {
  let on = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) on++;
  const at = (x: number, y: number) => {
    const ix = Math.min(mw - 1, Math.max(0, Math.floor(x)));
    const iy = Math.min(mh - 1, Math.max(0, Math.floor(y)));
    return mask[iy * mw + ix];
  };
  return {
    area: (on / (mw * mh)) * width * height,
    weight,
    part,
    sample(count, rng, emit) {
      const s3 = rng();
      let n = 0;
      r2Loop(count, rng, width, height, (u, v) => {
        const px = u * mw, py = v * mh;
        if (at(px, py) <= 127) return false;
        // edge detection for a crisper outline: samples near an edge are brighter
        const e = at(px + 3, py) <= 127 || at(px - 3, py) <= 127 || at(px, py + 3) <= 127 || at(px, py - 3) <= 127;
        const w = frac(s3 + n++ * R1_A) - 0.5;
        emit((u - 0.5) * width, (0.5 - v) * height, w * depth, 0, 0, 1, e ? 1 + edgeBoost : 1);
        return true;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Allocation + build

/** Largest-remainder rounding of N·wᵢAᵢ/ΣwA so Σ countᵢ = N exactly. */
export function allocate(prims: Primitive[], N: number): Int32Array {
  const w = prims.map((p) => Math.max(p.area * p.weight * xfScaleOf(p.part.xf) ** 2, 0));
  const total = w.reduce((a, b) => a + b, 0);
  const counts = new Int32Array(prims.length);
  const rema: { i: number; r: number }[] = [];
  let used = 0;
  for (let i = 0; i < prims.length; i++) {
    const exact = total > 0 ? (N * w[i]) / total : 0;
    counts[i] = Math.floor(exact);
    used += counts[i];
    rema.push({ i, r: exact - counts[i] });
  }
  rema.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let j = 0; used < N; j = (j + 1) % rema.length, used++) counts[rema[j].i]++;
  return counts;
}

export interface BuildOptions {
  /** lit shade from a shape-space unit normal */
  shade: (nx: number, ny: number, nz: number) => number;
}

export function buildShape(prims: Primitive[], N: number, rng: Rng, opts: BuildOptions): ShapeBuffer {
  const out = new ShapeBuffer(N);
  const counts = allocate(prims, N);
  for (let i = 0; i < prims.length; i++) {
    const c = counts[i];
    if (c <= 0) continue;
    const prim = prims[i];
    const { xf, key, accent, shade, flat } = prim.part;
    const rho = rng();
    let j = 0;
    prim.sample(c, rng, (x, y, z, nx, ny, nz, shadeMod) => {
      if (j >= c) return;
      const X = xf[0] * x + xf[1] * y + xf[2] * z + xf[9];
      const Y = xf[3] * x + xf[4] * y + xf[5] * z + xf[10];
      const Z = xf[6] * x + xf[7] * y + xf[8] * z + xf[11];
      let NX = xf[0] * nx + xf[1] * ny + xf[2] * nz;
      let NY = xf[3] * nx + xf[4] * ny + xf[5] * nz;
      let NZ = xf[6] * nx + xf[7] * ny + xf[8] * nz;
      const nl = Math.hypot(NX, NY, NZ);
      if (nl > 1e-9) {
        NX /= nl;
        NY /= nl;
        NZ /= nl;
      }
      const lit = flat !== undefined ? flat : opts.shade(NX, NY, NZ);
      out.push(X, Y, Z, NX, NY, NZ, packAttr(lit * shade * shadeMod, key, accent), 0, (j + rho) / c);
      j++;
    });
  }
  if (out.count !== N) throw new Error(`sampler produced ${out.count}/${N}`);
  return out;
}

/** Normalised build order from any scalar field over the samples. */
export function setOrder(buf: ShapeBuffer, f: (x: number, y: number, z: number, i: number) => number) {
  let lo = Infinity, hi = -Infinity;
  const tmp = new Float32Array(buf.n);
  for (let i = 0; i < buf.n; i++) {
    const v = f(buf.pos[i * 4], buf.pos[i * 4 + 1], buf.pos[i * 4 + 2], i);
    tmp[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < buf.n; i++) buf.nrm[i * 4 + 3] = (tmp[i] - lo) / span;
}
