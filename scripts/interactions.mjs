/**
 * The configurator and the new interactions, end to end:
 * switch tabs → curve, finish swatches → tint, click a keycap → press,
 * "Play a sentence" → ridges, typing on the cable → pulses, and the reserve
 * summary following the choices. Prints PASS/FAIL and writes shots.
 */
import { mkdirSync } from "node:fs";
import { launch, watchConsole } from "./browser.mjs";
import { ANCHOR_JS } from "./anchor.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = "shots/interactions";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, ev) => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  —  ${ev}`);
};
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
watchConsole(p, logs);
await p.goto(`${BASE}/?shot`, { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__mote, null, { timeout: 120000 });
const go = (id, settle = 6) =>
  p.evaluate(
    ([id, src, settle]) => {
      scrollTo(0, id === "top" ? 0 : eval(src)(document.getElementById(id)));
      const m = window.__mote;
      m.freeze(true);
      m.setIntro(null);
      m.measure();
      m.advance(settle);
    },
    [id, ANCHOR_JS, settle],
  );
const advance = (s) => p.evaluate((s) => window.__mote.advance(s), s);
// raw mouse clicks: locator.click() may scroll its target, which would move the story
const tap = async (sel) => {
  const box = await p.locator(sel).first().boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

// 1. click a particle keycap in the hero
await go("top", 5);
// project the G keycap's top onto the screen
const keyXY = await p.evaluate(() => {
  const e = window.__mote.engine;
  const i = [...Array(82).keys()].find((k) => window.__mote.keyCode(k) === "KeyG");
  const v = e.anchorP.set(e.keyTops[i * 3], e.keyTops[i * 3 + 1], e.keyTops[i * 3 + 2]).applyMatrix4(e.xfA).project(e.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
});
await p.mouse.click(keyXY.x, keyXY.y);
await advance(0.06);
const pressed = await p.evaluate(() => window.__mote.key("KeyG"));
check("click a particle keycap presses that key", pressed > 0.5, `KeyG press ${pressed.toFixed(2)} after clicking at ${keyXY.x.toFixed(0)},${keyXY.y.toFixed(0)}`);
await p.screenshot({ path: `${OUT}/hero-click-G.png` });

// 2. switch tabs reshape the force curve
await go("switches", 9);
for (const name of ["Tactile", "Silent", "Linear"]) {
  await tap(`#switches button[role=radio]:has-text("${name}")`);
  await advance(1.4);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/curve-${name.toLowerCase()}.png` });
}
const bump = await p.evaluate(() => window.__mote.engine.curve.bumpH);
check("switch tabs drive the curve parameters", bump < 1, `bumpH after returning to Linear = ${bump.toFixed(2)}`);

// 3. press a key: the bead rides the curve
await p.evaluate(() => {
  window.__mote.press("KeyF", 400);
  window.__mote.advance(0.2);
});
await p.screenshot({ path: `${OUT}/curve-bead.png` });

// 4. demo typer on the ridgeline
await go("sound", 9);
await tap('#sound button:has-text("Play a sentence")');
for (let i = 0; i < 14; i++) {
  await p.waitForTimeout(110);
  await advance(0.11);
}
await p.screenshot({ path: `${OUT}/sound-demo.png` });
const typed = await p.evaluate(() => window.__mote.engine.wave.bursts.length);
check("“Play a sentence” types into the ridgeline", typed > 3, `${typed} live bursts`);

// 5. finishes tint the case
await go("design", 9);
for (const f of ["Graphite", "Ember", "Chalk"]) {
  await tap(`#design button[aria-label^="${f}"]`);
  await advance(1.2);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/design-${f.toLowerCase()}.png` });
  if (f === "Ember") {
    const t = await p.evaluate(() => window.__mote.engine.caseTint.toArray());
    check("finish swatch tints the particle case", t[0] > t[2] * 2, `ember case tint ${t.map((v) => v.toFixed(2)).join(", ")}`);
  }
}
await tap(`#design button[aria-label^="Graphite"]`);

// 6. keystrokes travel down the cable
await go("connectivity", 9);
await p.evaluate(() => {
  for (const k of ["KeyA", "KeyS", "KeyD"]) {
    window.__mote.press(k, 80);
    window.__mote.advance(0.25);
  }
  window.__mote.advance(0.3);
});
await p.screenshot({ path: `${OUT}/coil-pulses.png` });

// 7. the reserve summary follows the choices
await go("switches", 3);
await tap('#switches button[role=radio]:has-text("Tactile")');
await go("reserve", 6);
await p.waitForTimeout(1200);
const summary = await p.evaluate(() => document.querySelector("#reserve")?.textContent ?? "");
check("reserve summary shows the chosen finish and switch", /Graphite/.test(summary) && /Tactile/.test(summary) && /\$329/.test(summary), summary.match(/Your Mote 75.{0,80}/)?.[0] ?? "");
await p.screenshot({ path: `${OUT}/reserve.png` });

check("no console errors during interactions", logs.length === 0, logs.slice(0, 3).join(" | ") || "clean");
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
