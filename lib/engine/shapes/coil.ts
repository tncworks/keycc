/**
 * The coiled cable: a USB-C plug, a short straight run, a long coil, an
 * aviator connector and the run to the keyboard, all along one cubic
 * Bézier. Procedural: samples store (s along the path, part·4 + a, b) and
 * the simulation rebuilds the tube frame, so the coil can slowly turn
 * (its coils appear to travel) and keystrokes can send a pulse down it.
 * The GLSL (COIL_GLSL) and the CPU mirror (coilPoint) share these numbers.
 */
import type { Rng } from "../random";
import { R2_A1, R2_A2, ShapeBuffer, packAttr, setOrder } from "../sampling";

export const COIL = {
  p: [
    [-3.0, -0.5, 0.25],
    [-1.2, 0.85, 0.7],
    [1.0, -1.0, -0.45],
    [3.0, 0.25, 0.1],
  ],
  plug: [0, 0.045],
  coil: [0.1, 0.7],
  aviator: [0.7, 0.755],
  turns: 58,
  coilR: 0.105,
  wireR: 0.018,
  cableR: 0.024,
  aviatorR: 0.075,
} as const;

export const COIL_PARTS = { coil: 0, cable: 1, aviator: 2, plug: 3 } as const;

type V3 = [number, number, number];

function bez(s: number): V3 {
  const [a, b, c, d] = COIL.p;
  const u = 1 - s;
  const w0 = u * u * u, w1 = 3 * u * u * s, w2 = 3 * u * s * s, w3 = s * s * s;
  return [0, 1, 2].map((i) => w0 * a[i] + w1 * b[i] + w2 * c[i] + w3 * d[i]) as V3;
}
function bezD(s: number): V3 {
  const [a, b, c, d] = COIL.p;
  const u = 1 - s;
  return [0, 1, 2].map((i) => 3 * u * u * (b[i] - a[i]) + 6 * u * s * (c[i] - b[i]) + 3 * s * s * (d[i] - c[i])) as V3;
}
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** CPU mirror of the shader's coil evaluation (phase 0), for matching. */
export function coilPoint(s: number, part: number, a: number, b: number, phase = 0): V3 {
  const C = bez(s);
  const T = norm(bezD(s));
  const N = norm(cross(T, [0, 1, 0]));
  const B = cross(N, T);
  const ang = a * Math.PI * 2;
  const off = (r1: number, r2: number) => [0, 1, 2].map((i) => C[i] + N[i] * Math.cos(ang) * r1 + B[i] * Math.sin(ang) * r2) as V3;
  if (part === COIL_PARTS.coil) {
    const [c0, c1] = COIL.coil;
    const phi = ((s - c0) / (c1 - c0)) * COIL.turns * Math.PI * 2 + phase;
    const rad = [0, 1, 2].map((i) => N[i] * Math.cos(phi) + B[i] * Math.sin(phi));
    return [0, 1, 2].map((i) => C[i] + rad[i] * (COIL.coilR + COIL.wireR * Math.cos(ang)) + T[i] * COIL.wireR * Math.sin(ang)) as V3;
  }
  if (part === COIL_PARTS.aviator) return off(COIL.aviatorR * (1 + 0.04 * b), COIL.aviatorR * (1 + 0.04 * b));
  if (part === COIL_PARTS.plug) return off(0.06, 0.025);
  return off(COIL.cableR, COIL.cableR);
}

/** GLSL for the same geometry; `phase` turns the coil, returns vec4(pos, light). */
export const COIL_GLSL = /* glsl */ `
const vec3 COIL_P0 = vec3(${COIL.p[0].join(",")});
const vec3 COIL_P1 = vec3(${COIL.p[1].join(",")});
const vec3 COIL_P2 = vec3(${COIL.p[2].join(",")});
const vec3 COIL_P3 = vec3(${COIL.p[3].join(",")});
vec3 coilBez(float s) {
  float u = 1.0 - s;
  return u*u*u*COIL_P0 + 3.0*u*u*s*COIL_P1 + 3.0*u*s*s*COIL_P2 + s*s*s*COIL_P3;
}
vec3 coilBezD(float s) {
  float u = 1.0 - s;
  return 3.0*u*u*(COIL_P1-COIL_P0) + 6.0*u*s*(COIL_P2-COIL_P1) + 3.0*s*s*(COIL_P3-COIL_P2);
}
vec4 coilPoint(float s, float part, float a, float b, float phase) {
  vec3 C = coilBez(s);
  vec3 T = normalize(coilBezD(s));
  vec3 N = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
  vec3 B = cross(N, T);
  float ang = a * 6.2831853;
  vec3 n;
  vec3 p;
  if (part < 0.5) {
    float phi = (s - ${COIL.coil[0].toFixed(4)}) / ${(COIL.coil[1] - COIL.coil[0]).toFixed(4)} * ${COIL.turns.toFixed(1)} * 6.2831853 + phase;
    vec3 rad = N * cos(phi) + B * sin(phi);
    n = rad * cos(ang) + T * sin(ang);
    p = C + rad * ${COIL.coilR.toFixed(4)} + n * ${COIL.wireR.toFixed(4)};
  } else if (part < 1.5) {
    n = N * cos(ang) + B * sin(ang);
    p = C + n * ${COIL.cableR.toFixed(4)};
  } else if (part < 2.5) {
    n = N * cos(ang) + B * sin(ang);
    p = C + n * ${COIL.aviatorR.toFixed(4)} * (1.0 + 0.04 * b);
  } else {
    n = normalize(N * cos(ang) * 0.025 + B * sin(ang) * 0.06);
    p = C + N * cos(ang) * 0.06 + B * sin(ang) * 0.025;
  }
  float light = 0.28 + 0.72 * max(dot(n, normalize(vec3(-0.35, 0.9, 0.45))), 0.0);
  return vec4(p, light);
}
`;

export function buildCoil(N: number, rng: Rng): { buf: ShapeBuffer; rest: Float32Array } {
  const buf = new ShapeBuffer(N);
  const rest = new Float32Array(N * 3);
  // share by surface area, lightly weighted toward the coil
  const parts: [number, number, [number, number][]][] = [
    [COIL_PARTS.coil, 0.72, [COIL.coil as unknown as [number, number]]],
    [COIL_PARTS.cable, 0.1, [[COIL.plug[1], COIL.coil[0]], [COIL.aviator[1], 1]]],
    [COIL_PARTS.aviator, 0.12, [COIL.aviator as unknown as [number, number]]],
    [COIL_PARTS.plug, 0.06, [COIL.plug as unknown as [number, number]]],
  ];
  const counts = parts.map(([, s]) => Math.floor(N * s));
  counts[0] += N - counts.reduce((a, b) => a + b, 0);
  let k = 0;
  parts.forEach(([part, , ranges], pi) => {
    const n = counts[pi];
    const total = ranges.reduce((acc, [a, b]) => acc + b - a, 0);
    const s1 = rng(), s2 = rng();
    for (let j = 0; j < n; j++) {
      // R2 over (length, angle), mapped across the part's ranges
      let t = ((s1 + j * R2_A1) % 1) * total;
      let s = ranges[0][0];
      for (const [a, b] of ranges) {
        if (t <= b - a) {
          s = a + t;
          break;
        }
        t -= b - a;
      }
      const a = (s2 + j * R2_A2) % 1;
      const b = rng();
      const knurl = part === COIL_PARTS.aviator ? 0.75 + 0.25 * Math.cos(a * Math.PI * 48) : 1;
      const shade = part === COIL_PARTS.coil ? 0.9 : part === COIL_PARTS.cable ? 0.75 : 0.85 * knurl;
      buf.push(s, part * 4 + a * 0.999, b, 0, 0, 0, packAttr(shade, -1, false), 0, (j + 0.5) / n);
      const p = coilPoint(s, part, a, b);
      rest[k * 3] = p[0];
      rest[k * 3 + 1] = p[1];
      rest[k * 3 + 2] = p[2];
      k++;
    }
  });
  // the cable runs in from the keyboard end
  setOrder(buf, (s) => 1 - s);
  return { buf, rest };
}
