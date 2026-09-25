/**
 * Exploded view of one key: keycap, top housing, stem, spring, bottom
 * housing — the classic switch diagram, pulled apart along its axis.
 * Millimetres, emitted in local units (1 mm = 0.01 u, like the keyboard);
 * the station pose scales it up. The stem carries the accent (switch
 * stems are colour-coded) and the keycap + stem respond to typing.
 */
import type { Rng } from "../random";
import {
  annulus,
  box,
  buildShape,
  cylinder,
  helix,
  plateWithHoles,
  rrFace,
  rrLoft,
  setOrder,
  xfChain,
  xfScale,
  xfTranslate,
  type Part,
  type Primitive,
  type ShapeBuffer,
} from "../sampling";

/** key slots the render shader uses for "any key" (full travel) and "half travel" */
export const ANY_KEY_SLOT = 95;
export const HALF_KEY_SLOT = 94;

const MM = 0.01;

// vertical layout of the exploded stack (part bottoms, mm)
const Y = {
  bottom: 0, // bottom housing 0..5 (+ pins below, guide to 8.6)
  spring: 11, // spring 11..28.2
  stem: 32, // stem post 32..36, body 36..42, cross 42..45.8
  top: 50, // top housing 50..55.2
  cap: 60, // keycap 60..69
};
const CENTER = 33;
export const EXPLODED_HEIGHT = 72.3 * MM;

/** Label anchors for the DOM callouts: part centre height and half width (mm). */
export const EXPLODED_PARTS = [
  { name: "keycap", y: Y.cap + 4.5, hx: 9 },
  { name: "housing", y: Y.top + 2.6, hx: 7.8 },
  { name: "stem", y: Y.stem + 7, hx: 5 },
  { name: "spring", y: Y.spring + 8.6, hx: 3.1 },
  { name: "base", y: Y.bottom + 2.5, hx: 7 },
].map((p) => ({ name: p.name, y: (p.y - CENTER) * MM, hx: p.hx * MM }));

const LIGHT = (() => {
  const l = [-0.5, 0.9, 0.55];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

function shade(nx: number, ny: number, nz: number) {
  const lam = Math.max(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0);
  return 0.1 + 0.78 * Math.pow(lam, 1.2) + 0.1 * (0.5 + 0.5 * ny);
}

export function explodedPrimitives(rng: Rng): Primitive[] {
  const base = xfChain(xfScale(MM), xfTranslate(0, -CENTER, 0));
  const P = (key: number, s: number, accent = false, y = 0): Part => ({
    xf: y ? xfChain(base, xfTranslate(0, y, 0)) : base,
    key,
    accent,
    shade: s,
  });
  const prims: Primitive[] = [];
  const flat = (y: number) => () => y;

  // keycap (R3-ish profile): 18 × 18 base, dished top
  {
    const p = P(ANY_KEY_SLOT, 1, false, Y.cap);
    const hxb = 9, hzb = 9, hxt = 6.2, hzt = 6.6, h = 9;
    const top = (x: number) => h - 0.6 * (1 - Math.min(Math.abs(x) / hxt, 1) ** 2);
    prims.push(rrFace(p, 1.0, { hx: hxt, hz: hzt, r: 2.2, y: top }));
    prims.push(rrLoft(p, 0.7, { hx: hxb, hz: hzb, r: 1.4, y: flat(0) }, { hx: hxt, hz: hzt, r: 2.2, y: top }));
    // (the hollow underside and stem socket are omitted on purpose: particles
    // do not occlude, so hidden internals would show through the skirt)
  }

  // top housing: tapered box with the stem window on top
  {
    const p = P(-1, 0.92, false, Y.top);
    const outer = { hx: 7.8, hz: 7.8, r: 1.0 };
    const topR = { hx: 7.0, hz: 6.6, r: 1.6 };
    prims.push(rrLoft(p, 0.8, { ...outer, y: flat(0) }, { ...topR, y: flat(5.2) }));
    prims.push(plateWithHoles(p, 0.9, { ...topR, y: flat(5.2) }, [{ cx: 0, cz: 0, hx: 3.7, hz: 2.8 }], 5.2, rng));
    // LED window and clip hints as small raised boxes
    prims.push(...box(P(-1, 0.75, false, Y.top), 0.9, [0, 5.5, -5.2], [1.8, 0.3, 0.9], "xXYzZ"));
    prims.push(...box(P(-1, 0.7, false, Y.top), 0.8, [-7.9, 2.2, 0], [0.25, 1.4, 2.2], "xyYzZ"));
    prims.push(...box(P(-1, 0.7, false, Y.top), 0.8, [7.9, 2.2, 0], [0.25, 1.4, 2.2], "XyYzZ"));
  }

  // stem: post, body, cross — the accent part
  {
    const acc = P(ANY_KEY_SLOT, 1, true, Y.stem);
    prims.push(cylinder(acc, 1.6, 0, 0, 1.3, 0, 4));
    prims.push(...box(acc, 1.3, [0, 7, 0], [3.6, 3, 2.6]));
    prims.push(...box(acc, 1.6, [0, 11.9, 0], [2.05, 1.9, 0.6]));
    prims.push(...box(acc, 1.6, [0, 11.9, 0], [0.6, 1.9, 2.05]));
    // side rails
    prims.push(...box(acc, 1.3, [-4.3, 5.5, 0], [0.7, 3.5, 0.9], "xXyYzZ"));
    prims.push(...box(acc, 1.3, [4.3, 5.5, 0], [0.7, 3.5, 0.9], "xXyYzZ"));
  }

  // spring: 11 turns, 19 mm free length
  prims.push(helix(P(HALF_KEY_SLOT, 1.05, false, Y.spring), 12, 2.75, 1.72, 10, 0.32, 0));

  // bottom housing: box, spring guide, centre post, pins
  {
    const p = P(-1, 0.85, false, Y.bottom);
    const outer = { hx: 7.0, hz: 7.0, r: 0.9 };
    prims.push(rrLoft(p, 0.8, { ...outer, y: flat(0) }, { ...outer, y: flat(5) }));
    prims.push(plateWithHoles(p, 0.9, { ...outer, y: flat(5) }, [{ cx: 0, cz: 0, hx: 2.6, hz: 2.6 }], 5, rng));
    prims.push(cylinder(p, 1.0, 0, 0, 2.6, 5, 8.6));
    prims.push(annulus(p, 1.0, 0, 0, 1.4, 2.6, 8.6, 1));
    prims.push(cylinder(P(-1, 0.7, false, Y.bottom), 1.2, 0, 0, 2.0, -3.3, 0));
    prims.push(cylinder(P(-1, 1.05, false, Y.bottom), 2.2, -3.81, 2.54, 0.55, -3.3, 0));
    prims.push(cylinder(P(-1, 1.05, false, Y.bottom), 2.2, 2.54, 5.08, 0.55, -3.3, 0));
  }
  return prims;
}

export function buildExploded(N: number, rng: Rng): ShapeBuffer {
  const buf = buildShape(explodedPrimitives(rng), N, rng, { shade });
  // build order: top of the stack first, a gentle cascade downward
  setOrder(buf, (_x, y) => -y);
  return buf;
}
