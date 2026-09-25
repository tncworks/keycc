/**
 * The horizon: a calm plane of dust that the lineup and the call to action
 * sit on. Uniform in world space, so perspective packs it toward the
 * horizon; dimmer with distance. Procedural: samples store (x, z, phase)
 * and the simulation adds a slow swell (and typing drops ripples in it).
 */
import type { Rng } from "../random";
import { R2_A1, R2_A2, ShapeBuffer, packAttr, setOrder } from "../sampling";

export const FIELD = { x0: -8, x1: 8, z0: -11, z1: 1.6 };

export function buildField(N: number, rng: Rng): { buf: ShapeBuffer; rest: Float32Array } {
  const buf = new ShapeBuffer(N);
  const rest = new Float32Array(N * 3);
  const w = FIELD.x1 - FIELD.x0, d = FIELD.z1 - FIELD.z0;
  const S = Math.max(w, d);
  const s1 = rng(), s2 = rng();
  const spacing = Math.sqrt((w * d) / N);
  let got = 0;
  for (let n = 0; got < N; n++) {
    const x = ((s1 + n * R2_A1) % 1) * S;
    const z = ((s2 + n * R2_A2) % 1) * S;
    if (x > w || z > d) continue;
    const X = Math.min(Math.max(FIELD.x0 + x + (rng() - 0.5) * 0.8 * spacing, FIELD.x0), FIELD.x1);
    const Z = Math.min(Math.max(FIELD.z0 + z + (rng() - 0.5) * 0.8 * spacing, FIELD.z0), FIELD.z1);
    const far = Math.min(Math.max((FIELD.z1 - Z) / d, 0), 1); // 0 near … 1 far
    const edge = Math.min(Math.max((FIELD.x1 - Math.abs(X)) / 2.5, 0), 1);
    // brightest in the middle distance: the near edge would read as coarse gravel
    const near = Math.min(Math.max((FIELD.z1 - Z) / 3.2, 0), 1);
    const shade = (0.1 + 0.46 * Math.pow(1 - far, 1.4) + 0.06 * rng()) * (0.35 + 0.65 * edge) * (0.25 + 0.75 * near * near);
    buf.push(X, Z, rng(), 0, 0, 0, packAttr(shade, -1, false), 0, (got + 0.5) / N);
    rest[got * 3] = X;
    rest[got * 3 + 1] = 0;
    rest[got * 3 + 2] = Z;
    got++;
  }
  // the sea forms from the horizon toward the viewer
  setOrder(buf, (_x, z) => z);
  return { buf, rest };
}
