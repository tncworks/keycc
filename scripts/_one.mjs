import { launch } from "./browser.mjs";
const b = await launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3100/?shot", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__mote, null, { timeout: 120000 });
const y = await p.evaluate(() => { const el = document.getElementById("anatomy"); const r = el.getBoundingClientRect(); return r.top + scrollY + r.height / 2 - innerHeight / 2; });
await p.evaluate((y) => { scrollTo(0, y); const m = window.__mote; m.freeze(true); m.setIntro(null); m.measure(); m.advance(4); }, y);
await p.waitForTimeout(1600);
await p.screenshot({ path: "shots/anatomy.png" }); await b.close();
