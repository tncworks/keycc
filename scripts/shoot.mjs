/**
 * Full-site verification shots (CHECKLIST Phase 3).
 *
 * For each viewport: every section at its scroll anchor, the mid-morph
 * scroll positions between sections, the intro assembly, and a keypress —
 * with the particle engine frozen and advanced deterministically through
 * the ?shot hooks. Console errors/warnings are collected and printed.
 *
 *   node scripts/shoot.mjs            (desktop 1440 + mobile 390)
 *   ONLY=desktop node scripts/shoot.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { launch, watchConsole } from "./browser.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "shots/site";
const QS = process.env.QS ?? "";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false },
  { name: "mobile", width: 390, height: 844, dpr: 2, mobile: true },
].filter((v) => !process.env.ONLY || v.name === process.env.ONLY);

const browser = await launch();
const report = {};

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const logs = [];
  watchConsole(page, logs);
  await page.goto(`${BASE}/?shot&seed=7${QS}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__mote, null, { timeout: 120000 });
  const stats = await page.evaluate(() => window.__mote.stats());
  const shots = [];
  const snap = async (name) => {
    const file = `${OUT}/${vp.name}-${String(shots.length).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
  };

  // ---- intro: dust → keyboard -------------------------------------------
  await page.evaluate(() => {
    window.__mote.freeze(true);
    window.__mote.replay();
  });
  let elapsed = 0;
  for (const t of [0.6, 2.0, 3.2]) {
    await page.evaluate((d) => window.__mote.advance(d), t - elapsed);
    elapsed = t;
    if (t === 0.6) await page.waitForTimeout(400);
    await snap(`intro-${t}s`);
  }
  await page.evaluate(() => window.__mote.advance(3));
  await page.waitForTimeout(2600); // hero copy entrance
  await snap("hero");

  // keypress in the hero
  await page.evaluate(() => {
    window.__mote.press("KeyJ", 140);
    window.__mote.advance(0.28);
  });
  await snap("hero-keypress");
  await page.evaluate(() => window.__mote.advance(1.5));

  // ---- sections and the transitions between them ----------------------
  const anchors = await page.evaluate(() => {
    const vh = window.innerHeight;
    return Array.from(document.querySelectorAll("[data-form]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id || el.dataset.form, form: el.dataset.form, y: Math.max(0, r.top + window.scrollY + r.height / 2 - vh / 2) };
    });
  });
  const go = async (y, settle, name, reveal = 1500) => {
    await page.evaluate(
      ([y, settle]) => {
        window.scrollTo(0, y);
        window.__mote.measure();
        window.__mote.advance(settle);
      },
      [y, settle],
    );
    await page.waitForTimeout(reveal);
    await snap(name);
  };
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (a.form !== b.form) {
      await go((a.y + b.y) / 2, 1.6, `mid-${a.form}-${b.form}`, 300);
    }
    await go(b.y, 3, `${b.id}`);
    if (b.form === "waveform") {
      // type a short word into the ridgeline
      await page.evaluate(() => {
        for (const k of ["KeyM", "KeyO", "KeyT", "KeyE", "Space"]) {
          window.__mote.press(k, 90);
          window.__mote.advance(0.16);
        }
        window.__mote.advance(0.2);
      });
      await snap("waveform-typed");
    }
    if (b.form === "exploded") {
      await page.evaluate(() => {
        window.__mote.press("KeyK", 400);
        window.__mote.advance(0.15);
      });
      await snap("exploded-keypress");
      await page.evaluate(() => window.__mote.advance(1));
    }
  }
  // footer
  await go(1e6, 1.5, "footer");

  report[vp.name] = { stats, console: logs, shots };
  console.log(`${vp.name}: ${shots.length} shots, tier ${stats.tier}, N ${stats.N}, build ${stats.buildMs.toFixed(0)} ms`);
  console.log(logs.length ? logs.join("\n") : "  console: clean");
  await ctx.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
