/**
 * Particle ↔ target assignment (PHYSICS.md §3.2) and tier layout (§5.3).
 *
 * Every shape has N samples with a progressive rank. Samples are cut into T
 * equal tiers by rank; particle rows are tier-major, so dropping tiers keeps
 * every shape evenly sampled. Within a tier, consecutive forms along the
 * story are matched by recursive median bisection in view space — a
 * balanced k-d matching that approximates optimal transport in O(n log n)
 * and keeps neighbours together, so morphs flow instead of exploding.
 */
import type { ShapeBuffer, Xf } from "./sampling";

export interface FormInput {
  buf: ShapeBuffer;
  /** canonical pose used for matching (shape → approx. view space) */
  pose: Xf;
  /** rest position for procedural forms (defaults to buf.pos xyz) */
  rest?: Float32Array;
}

export interface Assembly {
  N: number;
  tiers: number;
  /** per form, in particle order */
  pos: Float32Array[];
  nrm: Float32Array[];
  /** mean travel per link in normalised view space (unit RMS radius): matched vs random */
  stats: { link: string; matched: number; random: number }[];
}

const DEPTH_WEIGHT = 0.35;

function tierSplit(rank: Float32Array, tiers: number): Int32Array[] {
  const n = rank.length;
  const keys = new Float64Array(n);
  const SHIFT = 2 ** 21;
  for (let i = 0; i < n; i++) keys[i] = Math.floor(rank[i] * 2 ** 30) * SHIFT + i;
  keys.sort();
  const per = n / tiers;
  const out: Int32Array[] = [];
  for (let t = 0; t < tiers; t++) {
    const a = new Int32Array(per);
    for (let j = 0; j < per; j++) a[j] = keys[t * per + j] % SHIFT;
    out.push(a);
  }
  return out;
}

interface Norm {
  cx: number;
  cy: number;
  cz: number;
  inv: number;
}

/**
 * Forms live at very different scales (a 330 mm keyboard, an 86 mm switch,
 * a 5 u horizon). Matching compares them in a normalised view space:
 * centred on their centroid and scaled to unit RMS radius.
 */
function normFor(form: FormInput): Norm {
  const src = form.rest ?? form.buf.pos;
  const stride = form.rest ? 3 : 4;
  const m = form.pose;
  const n = src.length / stride;
  let sx = 0, sy = 0, sz = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i * stride], y = src[i * stride + 1], z = src[i * stride + 2];
    const X = m[0] * x + m[1] * y + m[2] * z, Y = m[3] * x + m[4] * y + m[5] * z, Z = (m[6] * x + m[7] * y + m[8] * z) * DEPTH_WEIGHT;
    sx += X;
    sy += Y;
    sz += Z;
    s2 += X * X + Y * Y + Z * Z;
  }
  const cx = sx / n, cy = sy / n, cz = sz / n;
  const rms = Math.sqrt(Math.max(s2 / n - cx * cx - cy * cy - cz * cz, 1e-12));
  return { cx, cy, cz, inv: 1 / rms };
}

function posed(form: FormInput, idx: Int32Array, nm: Norm): Float32Array {
  const src = form.rest ?? form.buf.pos;
  const stride = form.rest ? 3 : 4;
  const m = form.pose;
  const out = new Float32Array(idx.length * 3);
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j] * stride;
    const x = src[i], y = src[i + 1], z = src[i + 2];
    out[j * 3] = (m[0] * x + m[1] * y + m[2] * z - nm.cx) * nm.inv;
    out[j * 3 + 1] = (m[3] * x + m[4] * y + m[5] * z - nm.cy) * nm.inv;
    out[j * 3 + 2] = ((m[6] * x + m[7] * y + m[8] * z) * DEPTH_WEIGHT - nm.cz) * nm.inv;
  }
  return out;
}

/** In-place selection: after return idx[lo..k) ≤ idx[k] ≤ idx(k..hi) on `axis`. */
function select(idx: Int32Array, lo: number, hi: number, k: number, pts: Float32Array, axis: number) {
  let l = lo, r = hi - 1;
  while (r > l) {
    const mid = (l + r) >> 1;
    const pivot = pts[idx[mid] * 3 + axis];
    let i = l, j = r;
    while (i <= j) {
      while (pts[idx[i] * 3 + axis] < pivot) i++;
      while (pts[idx[j] * 3 + axis] > pivot) j--;
      if (i <= j) {
        const t = idx[i];
        idx[i] = idx[j];
        idx[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) r = j;
    else if (k >= i) l = i;
    else break;
  }
}

/** Returns match[j] = index into Q for point j of P. */
export function bisectMatch(P: Float32Array, Q: Float32Array): Int32Array {
  const n = P.length / 3;
  const ip = new Int32Array(n), iq = new Int32Array(n);
  for (let i = 0; i < n; i++) ip[i] = iq[i] = i;
  const out = new Int32Array(n);
  const stack: number[] = [0, n];
  const mn = new Float64Array(3), mx = new Float64Array(3);
  while (stack.length) {
    const hi = stack.pop()!;
    const lo = stack.pop()!;
    const cnt = hi - lo;
    if (cnt === 1) {
      out[ip[lo]] = iq[lo];
      continue;
    }
    if (cnt === 2) {
      const a = ip[lo] * 3, b = ip[lo + 1] * 3, c = iq[lo] * 3, d = iq[lo + 1] * 3;
      const d2 = (u: number, v: number, U: Float32Array, V: Float32Array) =>
        (U[u] - V[v]) ** 2 + (U[u + 1] - V[v + 1]) ** 2 + (U[u + 2] - V[v + 2]) ** 2;
      const straight = d2(a, c, P, Q) + d2(b, d, P, Q);
      const crossed = d2(a, d, P, Q) + d2(b, c, P, Q);
      if (straight <= crossed) {
        out[ip[lo]] = iq[lo];
        out[ip[lo + 1]] = iq[lo + 1];
      } else {
        out[ip[lo]] = iq[lo + 1];
        out[ip[lo + 1]] = iq[lo];
      }
      continue;
    }
    // split axis: largest combined spread
    let best = 0, bestSpread = -1;
    for (let ax = 0; ax < 3; ax++) {
      mn[ax] = Infinity;
      mx[ax] = -Infinity;
    }
    for (let j = lo; j < hi; j++) {
      const a = ip[j] * 3, b = iq[j] * 3;
      for (let ax = 0; ax < 3; ax++) {
        const u = P[a + ax], v = Q[b + ax];
        if (u < mn[ax]) mn[ax] = u;
        if (u > mx[ax]) mx[ax] = u;
        if (v < mn[ax]) mn[ax] = v;
        if (v > mx[ax]) mx[ax] = v;
      }
    }
    for (let ax = 0; ax < 3; ax++) {
      const s = mx[ax] - mn[ax];
      if (s > bestSpread) {
        bestSpread = s;
        best = ax;
      }
    }
    const mid = lo + (cnt >> 1);
    select(ip, lo, hi, mid, P, best);
    select(iq, lo, hi, mid, Q, best);
    stack.push(lo, mid, mid, hi);
  }
  return out;
}

function meanDist(P: Float32Array, Q: Float32Array, match: Int32Array | null): number {
  const n = P.length / 3;
  let s = 0;
  for (let j = 0; j < n; j++) {
    const k = match ? match[j] : (j * 7919) % n;
    s += Math.hypot(P[j * 3] - Q[k * 3], P[j * 3 + 1] - Q[k * 3 + 1], (P[j * 3 + 2] - Q[k * 3 + 2]) / DEPTH_WEIGHT);
  }
  return s / n;
}

/**
 * forms[0] is the reference (keyboard). links are [from, to] pairs in the
 * order they should be resolved; `from` must already be assigned.
 */
export function assemble(forms: FormInput[], links: [number, number][], tiers: number, names: string[]): Assembly {
  const N = forms[0].buf.n;
  const per = N / tiers;
  if (!Number.isInteger(per)) throw new Error("N must be divisible by tiers");
  const split = forms.map((f) => tierSplit(f.buf.rank, tiers));
  const norms = forms.map(normFor);
  const assign: (Int32Array | null)[] = forms.map(() => null);
  const stats: Assembly["stats"] = [];

  // reference: particle p = t·per + j ↔ sample split[0][t][j]
  const ref = new Int32Array(N);
  for (let t = 0; t < tiers; t++) ref.set(split[0][t], t * per);
  assign[0] = ref;

  for (const [from, to] of links) {
    const src = assign[from];
    if (!src) throw new Error(`link ${from}→${to}: source unassigned`);
    const out = new Int32Array(N);
    let matched = 0, random = 0;
    for (let t = 0; t < tiers; t++) {
      const pIdx = src.subarray(t * per, (t + 1) * per);
      const qIdx = split[to][t];
      const Pp = posed(forms[from], pIdx, norms[from]);
      const Qp = posed(forms[to], qIdx, norms[to]);
      const match = bisectMatch(Pp, Qp);
      if (t === 0) {
        matched = meanDist(Pp, Qp, match);
        random = meanDist(Pp, Qp, null);
      }
      for (let j = 0; j < per; j++) out[t * per + j] = qIdx[match[j]];
    }
    assign[to] = out;
    stats.push({ link: `${names[from]}→${names[to]}`, matched, random });
  }

  const pos: Float32Array[] = [];
  const nrm: Float32Array[] = [];
  forms.forEach((f, s) => {
    const a = assign[s];
    if (!a) throw new Error(`form ${names[s]} unassigned`);
    const P = new Float32Array(N * 4);
    const Nn = new Float32Array(N * 4);
    for (let p = 0; p < N; p++) {
      const i = a[p] * 4;
      P.set(f.buf.pos.subarray(i, i + 4), p * 4);
      Nn.set(f.buf.nrm.subarray(i, i + 4), p * 4);
    }
    pos.push(P);
    nrm.push(Nn);
  });
  return { N, tiers, pos, nrm, stats };
}
