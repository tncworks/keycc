/**
 * Procedural Mote 75: sculpted keycaps (tops narrower than bases, row
 * profiles, cylindrical dish, rounded corners), a machined case with a
 * chamfer, a wedge, the plate visible between keys, and a knurled knob.
 * Modelled in millimetres, emitted in world units (1 u = 100 mm), flat
 * (y up, +z toward the typist). The station pose tilts it for the camera.
 */
import { KEYS, KNOB, PITCH_MM, FIELD_U } from "../layout75";
import type { Rng } from "../random";
import {
  buildShape,
  cylinder,
  annulus,
  plateWithHoles,
  rrFace,
  rrLoft,
  rrRing,
  setOrder,
  xfChain,
  xfScale,
  xfTranslate,
  type Hole,
  type Part,
  type Primitive,
  type ShapeBuffer,
} from "../sampling";

const P = PITCH_MM;
const GAP = 1.05; // between keycap skirts
const CAP_Y0 = 6.0; // keycap skirt bottom above the plate
const RIM_Y = 10.0; // case rim above the plate
const Y_SHIFT = -8.0; // centre the model vertically on the key tops
export const MM = 0.01;

/** Cherry-like sculpt: height at the top centre and tilt toward the typist. */
const PROFILE = [
  { h: 9.6, tilt: 8 },
  { h: 9.2, tilt: 6 },
  { h: 8.1, tilt: 3 },
  { h: 7.7, tilt: 0 },
  { h: 8.3, tilt: -5 },
  { h: 8.3, tilt: -5 },
];
const DISH = 0.55;

const FIELD_HX = (FIELD_U.w * P) / 2;
const FIELD_HZ = (FIELD_U.h * P) / 2;
const OPEN = { hx: FIELD_HX + 0.9, hz: FIELD_HZ + 0.9, r: 1.5 };
const BEZEL = 10;
const OUTER = { hx: OPEN.hx + BEZEL, hz: OPEN.hz + BEZEL, r: 7 };
const CHAMFER = 1.2;

export const KEYBOARD_SIZE = {
  width: OUTER.hx * 2 * MM,
  depth: OUTER.hz * 2 * MM,
};

function keyCentre(i: number): [number, number] {
  const k = KEYS[i];
  return [(k.x + k.w / 2) * P - FIELD_HX, (k.y + 0.5) * P - FIELD_HZ];
}

/** Top of the knob, in shape units (label anchor). */
export const KNOB_TOP: [number, number, number] = [
  ((KNOB.x + KNOB.w / 2) * P - FIELD_HX) * MM,
  (CAP_Y0 + 11.5 + Y_SHIFT) * MM,
  ((KNOB.y + 0.5) * P - FIELD_HZ) * MM,
];

/** Key index under a point on the key plane (shape units), or -1. */
export function keyAt(x: number, z: number): number {
  const X = x / MM, Z = z / MM;
  for (let i = 0; i < KEYS.length; i++) {
    const [cx, cz] = keyCentre(i);
    const hx = (KEYS[i].w * P) / 2, hz = P / 2;
    if (Math.abs(X - cx) <= hx && Math.abs(Z - cz) <= hz) return i;
  }
  return -1;
}

/** Height of the key tops (shape units), for hit-testing taps. */
export const KEY_PLANE_Y = (CAP_Y0 + 8.3 + Y_SHIFT) * MM;

/** Top surface centre of every key, in shape units (for ripple origins). */
export function keyTops(): Float32Array {
  const out = new Float32Array(KEYS.length * 3);
  KEYS.forEach((k, i) => {
    const [cx, cz] = keyCentre(i);
    const prof = PROFILE[k.row];
    out[i * 3] = cx * MM;
    out[i * 3 + 1] = (CAP_Y0 + prof.h + Y_SHIFT) * MM;
    out[i * 3 + 2] = cz * MM;
  });
  return out;
}

const LIGHT = (() => {
  const l = [-0.35, 1.0, 0.25];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

export function keyboardShade(nx: number, ny: number, nz: number): number {
  const lam = Math.max(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0);
  // soft sky term keeps walls facing away from the key light readable
  const sky = 0.5 + 0.5 * ny;
  return 0.08 + 0.85 * Math.pow(lam, 1.3) + 0.07 * sky;
}

export function keyboardPrimitives(rng: Rng): Primitive[] {
  const base = xfChain(xfScale(MM), xfTranslate(0, Y_SHIFT, 0));
  const prims: Primitive[] = [];
  const part = (key: number, shade: number, accent = false, cx = 0, cz = 0): Part => ({
    xf: cx || cz ? xfChain(base, xfTranslate(cx, 0, cz)) : base,
    key,
    accent,
    shade,
  });

  // --- keycaps -------------------------------------------------------------
  const holes: Hole[] = [];
  KEYS.forEach((k, i) => {
    const [cx, cz] = keyCentre(i);
    const prof = PROFILE[k.row];
    const tan = Math.tan((prof.tilt * Math.PI) / 180);
    const hxb = (k.w * P - GAP) / 2;
    const hzb = (P - GAP) / 2;
    const hxt = hxb - 3.0;
    const frontInset = 2.6, backInset = 3.4;
    const hzt = hzb - (frontInset + backInset) / 2;
    const czt = (backInset - frontInset) / 2;
    const top = (x: number, z: number) => {
      const u = Math.min(Math.abs(x) / hxt, 1);
      return CAP_Y0 + prof.h - tan * (z - czt) - DISH * (1 - u * u);
    };
    const p = part(i, 1, !!k.accent, cx, cz);
    prims.push(rrFace(p, 1.0, { hx: hxt, hz: hzt, r: 2.2, cz: czt, y: top }));
    prims.push(
      rrLoft(
        p,
        0.42,
        { hx: hxb, hz: hzb, r: 1.3, y: () => CAP_Y0 },
        { hx: hxt, hz: hzt, r: 2.2, cz: czt, y: top },
      ),
    );
    holes.push({ cx, cz, hx: hxb + 0.35, hz: hzb + 0.35 });
  });

  // --- knob ----------------------------------------------------------------
  const kx = (KNOB.x + KNOB.w / 2) * P - FIELD_HX;
  const kz = (KNOB.y + 0.5) * P - FIELD_HZ;
  const knobR = 8.2, knobTop = CAP_Y0 + 11.5;
  const knob = part(-1, 1);
  prims.push(cylinder(knob, 0.8, kx, kz, knobR, CAP_Y0 - 2, knobTop - 0.8, false, (a) => 0.78 + 0.22 * Math.cos(a * 40)));
  prims.push(annulus(knob, 0.9, kx, kz, 0, knobR - 0.8, knobTop, 1));
  prims.push(rrLoft(knob, 1.0, { hx: knobR, hz: knobR, r: knobR, cx: kx, cz: kz, y: () => knobTop - 0.8 }, { hx: knobR - 0.8, hz: knobR - 0.8, r: knobR - 0.8, cx: kx, cz: kz, y: () => knobTop }));
  holes.push({ cx: kx, cz: kz, hx: knobR + 0.5, hz: knobR + 0.5 });

  // --- case ----------------------------------------------------------------
  const flat = (y: number) => () => y;
  const wedge = (_x: number, z: number) => -8 - ((OUTER.hz - z) / (2 * OUTER.hz)) * 12;
  const rim = part(-1, 0.78);
  // the case recedes so the key tops lead: a soft chamfer glint, darker walls
  const chamfer = part(-1, 1.08);
  const wall = part(-1, 0.4);
  const inner = part(-1, 0.4);
  const plate = part(-1, 0.3);
  const top = { hx: OUTER.hx - CHAMFER, hz: OUTER.hz - CHAMFER, r: OUTER.r - CHAMFER };

  prims.push(rrRing(rim, 0.8, { ...top, y: flat(RIM_Y) }, { ...OPEN, y: flat(RIM_Y) }, RIM_Y));
  prims.push(rrLoft(chamfer, 1.2, { ...OUTER, y: flat(RIM_Y - CHAMFER) }, { ...top, y: flat(RIM_Y) }));
  prims.push(rrLoft(wall, 0.4, { ...OUTER, y: wedge }, { ...OUTER, y: flat(RIM_Y - CHAMFER) }));
  prims.push(rrLoft(inner, 0.3, { ...OPEN, y: flat(0) }, { ...OPEN, y: flat(RIM_Y) }, true));
  prims.push(plateWithHoles(plate, 0.3, { ...OPEN, y: flat(0) }, holes, 0, rng));

  return prims;
}

export function buildKeyboard(N: number, rng: Rng): ShapeBuffer {
  const buf = buildShape(keyboardPrimitives(rng), N, rng, { shade: keyboardShade });
  const hw = KEYBOARD_SIZE.width / 2, hd = KEYBOARD_SIZE.depth / 2;
  // Build order: a diagonal sweep, left → right, back rows slightly first.
  setOrder(buf, (x, _y, z) => 0.74 * ((x + hw) / (2 * hw)) + 0.26 * ((z + hd) / (2 * hd)));
  return buf;
}
