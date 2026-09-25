/**
 * CPU reference for PHYSICS.md: verifies the numbers the doc claims.
 *  1. spring-damper step response under the exact GPU integrator
 *     (semi-implicit Euler, h = 1/120) vs. the analytic formulas
 *  2. ramp lag for an eased moving target
 *  3. stability margin at h = 1/60 for the stiffest allowed settings
 *  4. curl noise: RMS speed (for normalisation) and measured divergence
 *
 * Run: node scripts/physics-check.mjs
 */

// ---------------------------------------------------------------- spring
function stepResponse({ f0, zeta, h, cAir = 0, T = 6, m = 1 }) {
  const k = (2 * Math.PI * f0) ** 2;
  const cTot = 2 * zeta * Math.sqrt(k * m);
  const cS = Math.max(cTot - cAir, 0);
  let x = 0, v = 0;
  const target = 1;
  let peak = 0, tPeak = 0, tSettle = 0;
  for (let i = 0, t = 0; t < T; i++, t += h) {
    const F = k * (target - x) - cS * v + cAir * (0 - v);
    v += (F / m) * h;
    x += v * h;
    if (x > peak) { peak = x; tPeak = t + h; }
    if (Math.abs(x - target) > 0.02) tSettle = t + h;
  }
  return { overshoot: peak - 1, tPeak, tSettle };
}

function analytic(f0, zeta) {
  const w0 = 2 * Math.PI * f0;
  const s = Math.sqrt(1 - zeta * zeta);
  return {
    overshoot: Math.exp((-Math.PI * zeta) / s),
    tPeak: Math.PI / (w0 * s),
    tSettleEnvelope: -Math.log(0.02 * s) / (zeta * w0),
  };
}

const f0 = 0.78, zeta = 0.82, h = 1 / 120, cAir = 1.8;
const num = stepResponse({ f0, zeta, h, cAir });
const ana = analytic(f0, zeta);
console.log("— spring step response (f0 = %s Hz, ζ = %s, h = 1/120, c_air = %s)", f0, zeta, cAir);
console.log("  overshoot   numeric %s %%   analytic %s %%", (num.overshoot * 100).toFixed(2), (ana.overshoot * 100).toFixed(2));
console.log("  peak time   numeric %s s    analytic %s s", num.tPeak.toFixed(3), ana.tPeak.toFixed(3));
console.log("  2%% settle  numeric %s s    envelope bound %s s", num.tSettle.toFixed(3), ana.tSettleEnvelope.toFixed(3));
for (const m of [0.85, 1.15]) {
  const r = stepResponse({ f0, zeta, h, cAir, m });
  console.log("  mass %s:   overshoot %s %%, settle %s s", m, (r.overshoot * 100).toFixed(2), r.tSettle.toFixed(3));
}

// ramp / eased target lag
{
  const k = (2 * Math.PI * f0) ** 2, c = 2 * zeta * Math.sqrt(k);
  let x = 0, v = 0, maxLag = 0;
  const D = 2.5; // eased travel of 1 unit over 2.5 s (smootherstep)
  const ss = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let over = 0;
  for (let t = 0; t < 6; t += h) {
    const target = ss(Math.min(t / D, 1));
    v += (k * (target - x) - c * v) * h;
    x += v * h;
    maxLag = Math.max(maxLag, target - x);
    over = Math.max(over, x - 1);
  }
  console.log("— eased 1 u move over 2.5 s: max lag %s u, landing overshoot %s %%, ramp-lag formula 2ζ/ω0 = %s s",
    maxLag.toFixed(3), (over * 100).toFixed(3), ((2 * zeta) / (2 * Math.PI * f0)).toFixed(3));
}

// stability margin
{
  const worst = (f, z, hh) => { const w = 2 * Math.PI * f; const c = 2 * z * w; return hh * hh * w * w + 2 * hh * c; };
  console.log("— stability  h²ω²+2hc (must be < 4):  default@1/120 = %s   stiffest@1/60 = %s",
    worst(f0, zeta, 1 / 120).toFixed(4), worst(2, 1.2, 1 / 60).toFixed(4));
}

// ---------------------------------------------------------------- curl noise (port of glsl/noise.ts)
const mod289 = (x) => x - Math.floor(x * (1 / 289)) * 289;
const permute = (x) => mod289((x * 34 + 10) * x);
const tis = (r) => 1.79284291400159 - 0.85373472095314 * r;
function snoise(v) {
  const C = [1 / 6, 1 / 3];
  const dv = (v[0] + v[1] + v[2]) * C[1];
  const i = [Math.floor(v[0] + dv), Math.floor(v[1] + dv), Math.floor(v[2] + dv)];
  const di = (i[0] + i[1] + i[2]) * C[0];
  const x0 = [v[0] - i[0] + di, v[1] - i[1] + di, v[2] - i[2] + di];
  const g = [x0[1] <= x0[0] ? 1 : 0, x0[2] <= x0[1] ? 1 : 0, x0[0] <= x0[2] ? 1 : 0];
  const l = [1 - g[0], 1 - g[1], 1 - g[2]];
  const i1 = [Math.min(g[0], l[2]), Math.min(g[1], l[0]), Math.min(g[2], l[1])];
  const i2 = [Math.max(g[0], l[2]), Math.max(g[1], l[0]), Math.max(g[2], l[1])];
  const x1 = x0.map((c, k) => c - i1[k] + C[0]);
  const x2 = x0.map((c, k) => c - i2[k] + C[1]);
  const x3 = x0.map((c) => c - 0.5);
  const im = i.map(mod289);
  const p = [0, 1, 2, 3].map((q) => {
    const oz = [0, i1[2], i2[2], 1][q], oy = [0, i1[1], i2[1], 1][q], ox = [0, i1[0], i2[0], 1][q];
    return permute(permute(permute(im[2] + oz) + im[1] + oy) + im[0] + ox);
  });
  const ns = [2 / 7, 0.5 - 1, 1 / 7];
  // ns = n_ * D.wyz - D.xzx with n_=1/7, D=(0,.5,1,2): (2/7, 0.5/7 - 1, 1/7)
  ns[1] = 0.5 / 7 - 1;
  const grads = p.map((pp) => {
    const j = pp - 49 * Math.floor(pp * ns[2] * ns[2]);
    const x_ = Math.floor(j * ns[2]);
    const y_ = Math.floor(j - 7 * x_);
    const x = x_ * ns[0] + ns[1];
    const y = y_ * ns[0] + ns[1];
    const hh = 1 - Math.abs(x) - Math.abs(y);
    const sx = Math.floor(x) * 2 + 1, sy = Math.floor(y) * 2 + 1;
    const sh = hh <= 0 ? -1 : 0;
    const gx = x + sx * sh, gy = y + sy * sh;
    const n = tis(gx * gx + gy * gy + hh * hh);
    return [gx * n, gy * n, hh * n];
  });
  const xs = [x0, x1, x2, x3];
  let val = 0;
  const grad = [0, 0, 0];
  for (let q = 0; q < 4; q++) {
    const xq = xs[q];
    const m = Math.max(0.5 - (xq[0] ** 2 + xq[1] ** 2 + xq[2] ** 2), 0);
    const m2 = m * m, m4 = m2 * m2;
    const pd = grads[q][0] * xq[0] + grads[q][1] * xq[1] + grads[q][2] * xq[2];
    val += m4 * pd;
    for (let k = 0; k < 3; k++) grad[k] += -8 * m2 * m * pd * xq[k] + m4 * grads[q][k];
  }
  return { val: 105 * val, grad: grad.map((gg) => gg * 105) };
}
const O2 = [31.416, -47.853, 12.793], O3 = [-233.145, -113.408, -185.31];
function curl(p) {
  const g1 = snoise(p).grad;
  const g2 = snoise([p[0] + O2[0], p[1] + O2[1], p[2] + O2[2]]).grad;
  const g3 = snoise([p[0] + O3[0], p[1] + O3[1], p[2] + O3[2]]).grad;
  return [g3[1] - g2[2], g1[2] - g3[0], g2[0] - g1[1]];
}

// verify the analytic gradient against finite differences
{
  let err = 0, mag = 0;
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 20 - 10;
  for (let n = 0; n < 2000; n++) {
    const p = [rnd(), rnd(), rnd()], e = 1e-4;
    const g = snoise(p).grad;
    for (let k = 0; k < 3; k++) {
      const a = [...p], b = [...p];
      a[k] += e; b[k] -= e;
      const fd = (snoise(a).val - snoise(b).val) / (2 * e);
      err += Math.abs(fd - g[k]);
      mag += Math.abs(g[k]);
    }
  }
  console.log("— simplex gradient: mean |analytic − finite diff| / mean |grad| = %s", (err / mag).toExponential(2));
}

// RMS and divergence of the curl field
{
  let s = 777;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 40 - 20;
  let sum2 = 0, divSum = 0, gradSum = 0;
  const M = 20000, e = 1e-3;
  for (let n = 0; n < M; n++) {
    const p = [rnd(), rnd(), rnd()];
    const c = curl(p);
    sum2 += c[0] ** 2 + c[1] ** 2 + c[2] ** 2;
    let div = 0;
    for (let k = 0; k < 3; k++) {
      const a = [...p], b = [...p];
      a[k] += e; b[k] -= e;
      const d = (curl(a)[k] - curl(b)[k]) / (2 * e);
      div += d;
      gradSum += Math.abs(d);
    }
    divSum += Math.abs(div);
  }
  const rms = Math.sqrt(sum2 / M);
  console.log("— curl noise: RMS |u| = %s (FLOW_RMS in Engine.ts)", rms.toFixed(3));
  console.log("  divergence: mean |∇·u| / mean |∂u_i/∂x_i| = %s  (0 = divergence-free)", (divSum / gradSum).toExponential(2));
}
