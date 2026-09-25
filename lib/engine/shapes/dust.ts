/**
 * Dust: the resting state before assembly. A deep, soft volume in front of
 * and behind the subject (near motes become bokeh), denser toward the middle,
 * mostly dim with a few brighter motes. Positions come from the 3-D
 * Kronecker sequence rejected to the unit ball (even and progressive), then
 * warped radially with a smooth power law for the density falloff.
 */
import type { Rng } from "../random";
import { R3_A, ShapeBuffer, packAttr, setOrder } from "../sampling";

export function buildDust(N: number, rng: Rng, extent = { x: 5.2, y: 3.0, z: 4.2 }): ShapeBuffer {
  const buf = new ShapeBuffer(N);
  const s = [rng(), rng(), rng()];
  const frac = (x: number) => x - Math.floor(x);
  let got = 0;
  for (let n = 0; got < N; n++) {
    const u = frac(s[0] + n * R3_A[0]) * 2 - 1;
    const v = frac(s[1] + n * R3_A[1]) * 2 - 1;
    const w = frac(s[2] + n * R3_A[2]) * 2 - 1;
    const r = Math.hypot(u, v, w);
    if (r > 1 || r < 1e-6) continue;
    // radius r (uniform in the ball) → r^1.5: denser core, smooth everywhere
    const k = Math.pow(r, 1.5) / r;
    const x = u * k * extent.x;
    const y = v * k * extent.y;
    const z = w * k * extent.z - 0.6;
    // most motes are nearly invisible haze; roughly one in six catches the light
    const b = rng();
    const lit = rng() < 0.17;
    const shade = lit ? 0.16 + 0.5 * b * b : 0.025 + 0.05 * b;
    buf.push(x, y, z, 0, 0, 0, packAttr(shade, -1, false), 0, (got + 0.5) / N);
    got++;
  }
  setOrder(buf, (x, y, z) => Math.hypot(x / extent.x, y / extent.y, z / extent.z));
  return buf;
}
