/** Same rule as anchorScroll() in lib/engine/Engine.ts, as page-side source. */
export const ANCHOR_JS = `(el) => { const r = el.getBoundingClientRect(); const vh = innerHeight; return r.top + scrollY + Math.min(r.height - vh, 0.25 * vh) / 2; }`;
