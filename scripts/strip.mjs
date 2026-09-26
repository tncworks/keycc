/**
 * Motion strip: scrolls between two sections at a realistic speed while
 * advancing the engine in lock-step, capturing frames every `every` seconds.
 *   FROM=top TO=anatomy DUR=1.4 node scripts/strip.mjs
 */
import { mkdirSync } from "node:fs";
import { launch } from "./browser.mjs";
import { ANCHOR_JS } from "./anchor.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const FROM = process.env.FROM ?? "top", TO = process.env.TO ?? "anatomy";
const DUR = Number(process.env.DUR ?? 1.4), TOTAL = Number(process.env.TOTAL ?? 2.6), EVERY = Number(process.env.EVERY ?? 0.25);
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
const OUT = `shots/strip-${FROM}-${TO}-${W}`;
mkdirSync(OUT, { recursive: true });
const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 600, hasTouch: W < 600 });
await p.goto(`${BASE}/?shot`, { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__mote, null, { timeout: 120000 });
const [y0, y1] = await p.evaluate(([a, b, src]) => {
  const at = eval(src);
  const y = (id) => (id === "top" ? 0 : at(document.getElementById(id)));
  return [y(a), y(b)];
}, [FROM, TO, ANCHOR_JS]);
await p.evaluate((y0) => { scrollTo(0, y0); const m = window.__mote; m.freeze(true); m.setIntro(null); m.measure(); m.advance(5); }, y0);
const fps = 60, frames = Math.round(TOTAL * fps), every = Math.round(EVERY * fps);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
let n = 0;
for (let f = 1; f <= frames; f++) {
  const t = Math.min(f / fps / DUR, 1);
  await p.evaluate(([y]) => { scrollTo(0, y); window.__mote.advance(1 / 60); }, [y0 + (y1 - y0) * ease(t)]);
  if (f % every === 0) await p.screenshot({ path: `${OUT}/${String(n++).padStart(2, "0")}-${(f / fps).toFixed(2)}s.png` });
}
console.log(`${n} frames → ${OUT}`);
await b.close();
