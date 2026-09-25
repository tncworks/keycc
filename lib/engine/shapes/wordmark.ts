/**
 * The wordmark, set in the site's display face (next/font) so particles
 * and DOM share one typeface. Rasterised once on the main thread into a
 * coverage mask; ~80 % of the particles sit in the glyphs (slightly
 * extruded, brighter at the edges for a crisp outline), the rest hang
 * behind as a faint haze so no particle is idle.
 */
import type { Rng } from "../random";
import { buildShape, mask2D, setOrder, xfIdentity, type Part, type Primitive, type ShapeBuffer } from "../sampling";

export interface GlyphMask {
  mask: Uint8Array;
  w: number;
  h: number;
  /** ink bounds as a fraction of the mask, for tight layout */
  aspect: number;
}

export const WORDMARK_WIDTH = 3.8;

/** Rasterise `text` with the given CSS font family. Browser only. */
export function rasterizeWordmark(text: string, family: string, weight = 560, tracking = 0.16): GlyphMask {
  const size = 320;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${weight} ${size}px ${family}`;
  const chars = [...text];
  const widths = chars.map((c) => probe.measureText(c).width);
  const track = tracking * size;
  const inkW = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  const pad = Math.ceil(size * 0.08);
  const W = Math.ceil(inkW + pad * 2);
  const H = Math.ceil(size * 0.86 + pad * 2);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "alphabetic";
  let x = pad;
  const baseline = pad + size * 0.72;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += widths[i] + track;
  });
  const img = ctx.getImageData(0, 0, W, H).data;
  // crop to ink bounds
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let xx = 0; xx < W; xx++) {
      if (img[(y * W + xx) * 4] > 127) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) {
    x0 = 0;
    y0 = 0;
    x1 = W - 1;
    y1 = H - 1;
  }
  const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let xx = 0; xx < mw; xx++) mask[y * mw + xx] = img[((y + y0) * W + xx + x0) * 4];
  }
  return { mask, w: mw, h: mh, aspect: mw / mh };
}

function haze(part: Part, area: number, ext: { x: number; y: number; z: number; z0: number }): Primitive {
  return {
    area,
    weight: 1,
    part,
    sample(count, rng, emit) {
      for (let i = 0; i < count; i++) {
        const x = (rng() * 2 - 1) * ext.x;
        const y = (rng() * 2 - 1) * ext.y;
        const z = ext.z0 - rng() * ext.z;
        const b = rng();
        emit(x, y, z, 0, 0, 0, 0.35 + 0.65 * b * b * b);
      }
    },
  };
}

export function buildWordmark(N: number, rng: Rng, glyphs: GlyphMask): ShapeBuffer {
  const width = WORDMARK_WIDTH;
  const height = width / glyphs.aspect;
  const letters = mask2D({ xf: xfIdentity(), key: -1, accent: false, shade: 1, flat: 0.86 }, 1, glyphs.mask, glyphs.w, glyphs.h, width, height, 0.07, 0.22);
  const hazePart: Part = { xf: xfIdentity(), key: -1, accent: false, shade: 1, flat: 0.16 };
  const prims = [letters, haze(hazePart, letters.area * 0.26, { x: 3.4, y: 1.8, z: 3.2, z0: -0.4 })];
  const buf = buildShape(prims, N, rng, { shade: () => 1 });
  // letters assemble left to right; the haze gathers last
  setOrder(buf, (x, _y, z) => (z < -0.3 ? 1.2 : (x + width / 2) / width));
  return buf;
}
