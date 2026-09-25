/** Each form at rest and mid-morph, via the morph override hook. */
import { mkdirSync } from "node:fs";
import { launch, watchConsole } from "./browser.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "shots/forms";
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const logs = [];
watchConsole(page, logs);
await page.goto(`${BASE}/?shot&seed=7`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__mote, null, { timeout: 90000 });
console.log(JSON.stringify(await page.evaluate(() => window.__mote.stats())));
await page.evaluate(() => {
  const m = window.__mote;
  m.freeze(true);
  m.setIntro(null);
  m.setMorph(0, true);
  m.advance(3);
});
const stops = (process.env.STOPS ?? "0,0.5,1,1.5,2,2.5,3,3.5,4").split(",").map(Number);
let prev = 0;
for (const s of stops) {
  await page.evaluate(([s, prev]) => {
    const m = window.__mote;
    // walk the override there so the smoother and springs see a real scroll
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      m.setMorph(prev + ((s - prev) * i) / steps);
      m.advance(1 / 30);
    }
    m.advance(Number.isInteger(s) ? 3 : 0.4);
  }, [s, prev]);
  prev = s;
  await page.screenshot({ path: `${OUT}/m-${s.toFixed(1)}.png` });
}
console.log(logs.length ? logs.join("\n") : "console: clean");
await browser.close();
