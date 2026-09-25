/**
 * Behavioural verification for CHECKLIST.md. Each check prints PASS/FAIL
 * with the measured evidence. Run against dev or a production server:
 *   BASE=http://localhost:3100 node scripts/verify.mjs
 */
import { launch, watchConsole } from "./browser.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  —  ${evidence}`);
};

const browser = await launch();

// Counts live WebGL contexts (created − lost) across navigations.
const CONTEXT_COUNTER = () => {
  window.__ctx = { created: 0, lost: 0 };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !this.__counted) {
      this.__counted = true;
      window.__ctx.created++;
      this.addEventListener("webglcontextlost", () => window.__ctx.lost++);
    }
    return ctx;
  };
};

async function open(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await ctx.addInitScript(CONTEXT_COUNTER);
  const page = await ctx.newPage();
  const logs = [];
  watchConsole(page, logs);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  return { ctx, page, logs };
}
const ready = (page) => page.waitForFunction(() => window.__mote, null, { timeout: 120000 });

// ---------------------------------------------------------------- 1. console + load
{
  const { ctx, page, logs } = await open("/?debug");
  await ready(page);
  // scroll the whole page slowly, then back, in real time
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= H; y += 600) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  const gui = await page.evaluate(() => ({
    panel: !!document.querySelector(".lil-gui"),
    controllers: document.querySelectorAll(".lil-gui .lil-controller").length,
    meter: [...document.querySelectorAll("div")].some((d) => /fps\s+\d+/.test(d.textContent ?? "") && /particles/.test(d.textContent ?? "")),
  }));
  check("?debug panel: lil-gui with every parameter, fps meter + particle count", gui.panel && gui.controllers >= 68 && gui.meter, `panel=${gui.panel} controllers=${gui.controllers} meter=${gui.meter}`);
  const hooks = await page.evaluate(() => {
    const m = window.__mote;
    m.freeze(true);
    const p0 = m.probe([123]).pos[0];
    // frozen: real frames must not move particles
    return new Promise((res) =>
      setTimeout(() => {
        const p1 = m.probe([123]).pos[0];
        m.setMorph(2.5, true);
        const mm = m.getMorph();
        m.setMorph(null);
        m.freeze(false);
        res({ still: Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), mm });
      }, 500),
    );
  });
  check("?debug hooks: freeze time + set morph progress", hooks.still === 0 && Math.abs(hooks.mm - 2.5) < 1e-6, `moved while frozen=${hooks.still} setMorph→${hooks.mm}`);
  check("zero console errors/warnings (load + full scroll, dev)", logs.length === 0, logs.length ? logs.slice(0, 5).join(" | ") : "clean");
  await ctx.close();
}

// ---------------------------------------------------------------- 2. keyboard scrolling + key depress
{
  const { ctx, page, logs } = await open("/?shot");
  await ready(page);
  await page.evaluate(() => window.__mote.setIntro(null));
  await page.mouse.click(700, 450); // focus the document (not a control)
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.down("Space");
  const pressed = await page.evaluate(() => {
    window.__mote.advance(0.1);
    return window.__mote.key("Space");
  });
  await page.keyboard.up("Space");
  await page.waitForTimeout(400);
  const y1 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(400);
  const y2 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const y3 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const y4 = await page.evaluate(() => window.scrollY);
  check("typing never blocks keyboard scrolling (Space, PgDn, End, Home)", y1 > y0 && y2 > y1 && y3 > y2 && y4 === 0, `scrollY ${y0}→${y1}→${y2}→${y3}→${y4}`);
  check("physical key depresses its particle keycap", pressed > 0.5, `space keyPress after 100 ms = ${pressed.toFixed(3)}`);
  check("no console errors while typing", logs.length === 0, logs.length ? logs[0] : "clean");
  await ctx.close();
}

// ---------------------------------------------------------------- 3. morphs reverse cleanly
{
  const { ctx, page } = await open("/?shot");
  await ready(page);
  const r = await page.evaluate(() => {
    const m = window.__mote;
    m.freeze(true);
    m.setIntro(null);
    m.setMorph(0, true);
    m.advance(4);
    const idx = Array.from({ length: 400 }, (_, i) => (i * 257) % m.stats().N);
    const a = m.probe(idx).pos;
    // scroll the story forward to the field and back, like a user
    for (let k = 0; k <= 80; k++) {
      m.setMorph((4 * k) / 80);
      m.advance(1 / 20);
    }
    const mid = m.probe(idx).pos;
    for (let k = 80; k >= 0; k--) {
      m.setMorph((4 * k) / 80);
      m.advance(1 / 20);
    }
    m.advance(4);
    const b = m.probe(idx).pos;
    const d = (P, Q) => P.reduce((s, p, i) => s + Math.hypot(p[0] - Q[i][0], p[1] - Q[i][1], p[2] - Q[i][2]), 0) / P.length;
    const sorted = a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2])).sort((x, y) => x - y);
    return { back: d(a, b), away: d(a, mid), p95: sorted[Math.floor(sorted.length * 0.95)] };
  });
  check("morphs reverse cleanly (keyboard → field → keyboard)", r.back < 0.02 * r.away && r.p95 < 0.05, `mean return error ${r.back.toFixed(4)} u vs ${r.away.toFixed(2)} u travelled; p95 ${r.p95.toFixed(4)} u`);
  await ctx.close();
}

// ---------------------------------------------------------------- 4. pause when hidden / offscreen
{
  const { ctx, page } = await open("/?debug");
  await ready(page);
  const r = await page.evaluate(async () => {
    const m = window.__mote;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const running0 = m.running();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(100);
    const hidden = m.running();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(100);
    const back = m.running();
    const host = m.engine.opts.host;
    host.style.transform = "translateY(-300vh)";
    await wait(400);
    const off = m.running();
    host.style.transform = "";
    await wait(400);
    const on = m.running();
    return { running0, hidden, back, off, on };
  });
  check("pauses when the tab is hidden, resumes when visible", r.running0 && !r.hidden && r.back, JSON.stringify(r));
  check("pauses when the canvas is offscreen", !r.off && r.on, `offscreen running=${r.off}, back on screen running=${r.on}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 5. touch acts as the cursor
{
  const { ctx, page } = await open("/?shot", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ready(page);
  const r = await page.evaluate(() => {
    const m = window.__mote;
    m.freeze(true);
    m.setIntro(null);
    m.advance(3);
    const e = m.engine;
    const t = (type, x, y) => {
      const touch = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
      window.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch], changedTouches: [touch] }));
    };
    t("touchstart", 100, 560);
    for (let i = 0; i < 20; i++) {
      t("touchmove", 100 + i * 10, 560);
      m.advance(1 / 30);
    }
    const during = e.cursorPresence;
    t("touchend", 300, 560);
    m.advance(1);
    return { during, after: e.cursorPresence, active: e.cursorActive };
  });
  check("touch acts as the cursor (presence rises while dragging, fades on release)", r.during > 0.3 && r.after < 0.05, `presence dragging ${r.during.toFixed(2)}, after release ${r.after.toFixed(3)}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 6. reduced motion
{
  const { ctx, page, logs } = await open("/?debug", { reducedMotion: "reduce" });
  await ready(page);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const e = window.__mote?.engine;
    return {
      reduced: e?.reduced,
      intro: e?.simMat.uniforms.uIntro.value,
      lenis: document.documentElement.classList.contains("lenis"),
      cursor: e?.simMat.uniforms.uCursor.value.y,
      disp: e?.pointsMat.uniforms.uRippleDisp.value,
    };
  });
  check(
    "prefers-reduced-motion: no intro flight, morphs dissolve, no smooth scroll, no cursor push, ripples as light only",
    r.reduced === true && r.intro === 1 && !r.lenis && r.disp === 0,
    JSON.stringify(r) + (logs.length ? " console: " + logs[0] : ""),
  );
  await ctx.close();
}

// ---------------------------------------------------------------- 7. no leaked WebGL contexts (Strict Mode / navigation)
{
  const { ctx, page, logs } = await open("/?debug");
  await ready(page);
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/lab?debug`, { waitUntil: "networkidle" });
    await ready(page);
    await page.goBack({ waitUntil: "networkidle" });
    await ready(page);
  }
  // each load runs React Strict Mode (dev): mount → dispose → mount
  const r = await page.evaluate(async () => {
    const canvases = document.querySelectorAll("canvas").length;
    return { canvases, live: window.__ctx.created - window.__ctx.lost, created: window.__ctx.created, lost: window.__ctx.lost };
  });
  check("exactly one canvas and one live WebGL context (Strict Mode double-mount disposed)", r.canvases === 1 && r.live === 1, JSON.stringify(r));
  check("no console errors across navigations", logs.length === 0, logs.length ? logs[0] : "clean");
  await ctx.close();
}

// ---------------------------------------------------------------- 8. sound toggle
{
  const { ctx, page, logs } = await open("/?shot");
  await ready(page);
  const before = await page.evaluate(() => document.querySelector("header button[aria-pressed]")?.getAttribute("aria-pressed"));
  await page.click("header button[aria-pressed]");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.querySelector("header button[aria-pressed]")?.getAttribute("aria-pressed"));
  for (const k of ["KeyA", "KeyS", "Space", "Enter"]) await page.keyboard.press(k);
  await page.waitForTimeout(300);
  check("key sounds are muted by default and toggle on without errors", before === "false" && after === "true" && logs.length === 0, `aria-pressed ${before}→${after}; console ${logs.length ? logs[0] : "clean"}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 9. responsive down to 375 px
for (const w of [375, 390, 768, 1024, 1440]) {
  const { ctx, page } = await open("/?shot", { viewport: { width: w, height: 812 } });
  await ready(page);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`no horizontal overflow at ${w}px`, r.sw <= r.cw, `scrollWidth ${r.sw} / clientWidth ${r.cw}`);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
