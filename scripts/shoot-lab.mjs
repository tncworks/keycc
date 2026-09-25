/** Phase-1 prototype shots: the intro assembly, the cursor field and a keypress ripple. */
import { mkdirSync } from "node:fs";
import { launch, watchConsole } from "./browser.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "shots/lab";
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
watchConsole(page, logs);
await page.goto(`${BASE}/lab?shot&seed=7${process.env.TIER ? `&tier=${process.env.TIER}` : ""}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__mote, null, { timeout: 60000 });
const info = await page.evaluate(() => {
  const m = window.__mote;
  m.freeze(true);
  m.replay();
  return m.stats();
});
console.log(JSON.stringify(info));
const snap = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });

let t = 0;
for (const at of [0.3, 1.2, 2.0, 2.8, 3.6, 4.6, 6.5]) {
  await page.evaluate((d) => window.__mote.advance(d), at - t);
  t = at;
  await snap(`intro-${at.toFixed(1)}s`);
}
// cursor sweeping through the keyboard (a hand through dust)
await page.evaluate(() => {
  for (let i = 0; i <= 24; i++) {
    window.__mote.setCursor(460 + i * 16, 520 + Math.sin(i / 5) * 20);
    window.__mote.advance(1 / 30);
  }
});
await snap("cursor-sweep");
await page.evaluate(() => window.__mote.advance(0.8));
await snap("cursor");
await page.evaluate(() => {
  window.__mote.setCursor(null);
  window.__mote.advance(2.5);
});
await snap("cursor-released");
// keypress ripple
await page.evaluate(() => {
  window.__mote.press("KeyG");
  window.__mote.advance(0.06);
});
await snap("key-0.06s");
await page.evaluate(() => window.__mote.advance(0.24));
await snap("key-0.30s");
await page.evaluate(() => window.__mote.advance(0.4));
await snap("key-0.70s");
console.log(logs.length ? logs.join("\n") : "console: clean");
await browser.close();

// --- motion quality at rest: per-frame travel and jerk of settled particles ---
{
  const browser2 = await launch();
  const p2 = await browser2.newPage({ viewport: { width: W, height: H } });
  await p2.goto(`${BASE}/lab?shot&seed=7`, { waitUntil: "networkidle" });
  await p2.waitForFunction(() => window.__mote, null, { timeout: 60000 });
  const res = await p2.evaluate(() => {
    const m = window.__mote;
    m.freeze(true);
    m.advance(8);
    const N = m.stats().N;
    const idx = Array.from({ length: 200 }, (_, i) => Math.floor((i * 7919) % N));
    const frames = [];
    for (let f = 0; f < 90; f++) {
      m.advance(1 / 60);
      frames.push(m.probe(idx).pos);
    }
    const pxPerU = m.engine.pointsMat.uniforms.uProjScale.value / m.engine.camDist;
    const speeds = [], jerks = [];
    for (let i = 0; i < idx.length; i++) {
      for (let f = 2; f < frames.length; f++) {
        const a = frames[f - 2][i], b = frames[f - 1][i], c = frames[f][i];
        const d1 = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
        const d2 = Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]);
        speeds.push(d1 * pxPerU);
        jerks.push(d2 * pxPerU);
      }
    }
    const q = (arr, p) => arr.sort((x, y) => x - y)[Math.floor(arr.length * p)];
    return { pxPerU, speedMedian: q(speeds, 0.5), speedP99: q(speeds, 0.99), accelMedian: q(jerks, 0.5), accelP99: q(jerks, 0.99) };
  });
  console.log("at rest (px/frame @60fps):", JSON.stringify(res));
  await browser2.close();
}
