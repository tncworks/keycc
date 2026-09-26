// shoot a handful of sections by id at a viewport: IDS=design,connectivity W=1440 H=900
import { launch } from "./browser.mjs";
import { ANCHOR_JS } from "./anchor.mjs";
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900), mob = W < 600;
const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob });
await p.goto("http://localhost:3100/?shot", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__mote, null, { timeout: 120000 });
for (const id of (process.env.IDS ?? "design").split(",")) {
  await p.evaluate(([id, src]) => { const el = document.getElementById(id); scrollTo(0, eval(src)(el)); const m = window.__mote; m.freeze(true); m.setIntro(null); m.measure(); m.advance(9); }, [id, ANCHOR_JS]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `shots/sec-${W}-${id}.png` });
}
await b.close();
