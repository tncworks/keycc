/**
 * ?debug: fps meter, particle count, a lil-gui panel for every parameter in
 * params.ts (== every row of the PHYSICS.md table), and time/morph hooks.
 */
import GUI from "lil-gui";
import type { Engine } from "./Engine";
import { PARAM_META, type ParamMeta } from "./params";

export function mountDebug(engine: Engine): () => void {
  const gui = new GUI({ title: "MOTE · physics", width: 300 });
  gui.domElement.style.zIndex = "60";
  const P = engine.params as unknown as Record<string, Record<string, number>>;
  for (const [group, defs] of Object.entries(PARAM_META)) {
    const folder = gui.addFolder(group);
    for (const [key, meta] of Object.entries(defs as Record<string, ParamMeta>)) {
      const label = meta.unit ? `${key} (${meta.unit})` : key;
      folder.add(P[group], key, meta.min, meta.max, meta.step).name(label).listen();
    }
    folder.close();
  }

  const hooks = {
    freeze: false,
    step: () => engine.advance(1 / 60),
    morphOverride: false,
    morph: 0,
    introOverride: false,
    intro: 1,
    replayIntro: () => {
      engine.setIntro(0);
      let t = 0;
      const id = setInterval(() => {
        t += 1 / 60 / engine.params.intro.duration;
        if (t >= 1) {
          clearInterval(id);
          engine.setIntro(null);
        } else engine.setIntro(t);
      }, 1000 / 60);
    },
    press: () => engine.press("KeyF"),
  };
  const f = gui.addFolder("hooks");
  f.add(hooks, "freeze").name("freeze time").onChange((v: boolean) => engine.freeze(v));
  f.add(hooks, "step").name("step 1 frame");
  f.add(hooks, "morphOverride").name("override morph").onChange((v: boolean) => engine.setMorph(v ? hooks.morph : null));
  f.add(hooks, "morph", 0, Math.max(engine.forms.length - 1, 0.001), 0.001).name("morph progress").onChange((v: number) => {
    if (hooks.morphOverride) engine.setMorph(v);
  });
  f.add(hooks, "introOverride").name("override intro").onChange((v: boolean) => engine.setIntro(v ? hooks.intro : null));
  f.add(hooks, "intro", 0, 1, 0.001).name("intro progress").onChange((v: number) => {
    if (hooks.introOverride) engine.setIntro(v);
  });
  f.add(hooks, "replayIntro").name("replay intro");
  f.add(hooks, "press").name("press F");

  const meter = document.createElement("div");
  meter.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:60;font:11px/1.5 ui-monospace,monospace;color:#e9e2d6;background:rgba(10,9,8,.72);padding:8px 10px;border:1px solid rgba(233,226,214,.14);border-radius:6px;pointer-events:none;white-space:pre;";
  document.body.appendChild(meter);
  let raf = 0;
  const tick = () => {
    const s = engine.stats;
    meter.textContent =
      `fps ${s.fps.toFixed(0).padStart(3)}  ${s.frameMs.toFixed(1)} ms\n` +
      `particles ${s.active.toLocaleString()} / ${engine.N.toLocaleString()} (${engine.tier})\n` +
      `quality L${s.level}  dpr ${s.dpr.toFixed(2)}  substeps ${s.substeps}\n` +
      `morph ${engine.getMorph().toFixed(3)}  build ${s.buildMs.toFixed(0)} ms`;
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    meter.remove();
    gui.destroy();
  };
}
