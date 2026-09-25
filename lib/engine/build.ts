/**
 * Pure (DOM-free) build of every form + the particle assignment. Runs in a
 * Web Worker (build.worker.ts) so the ~0.5 s of sampling and matching never
 * blocks the main thread; the engine falls back to calling it directly.
 */
import { assemble } from "./assign";
import { FORM_SPECS, type BuildContext, type FormName } from "./formspecs";
import { rngFor } from "./random";
import { TIER_COUNT } from "./tier";

export interface BuildRequest {
  forms: FormName[];
  N: number;
  seed: number;
  glyphs: BuildContext["glyphs"];
}

export interface BuildResult {
  names: FormName[];
  pos: Float32Array[];
  nrm: Float32Array[];
  stats: { link: string; matched: number; random: number }[];
  buildMs: number;
  where: "worker" | "main";
}

export function buildForms(req: BuildRequest, where: BuildResult["where"]): BuildResult {
  const t0 = performance.now();
  const names: FormName[] = [...req.forms, "dust"];
  const ctx: BuildContext = { glyphs: req.glyphs };
  const inputs = names.map((name) => {
    const spec = FORM_SPECS[name];
    const { buf, rest } = spec.build(req.N, rngFor(req.seed, "form", name), ctx);
    return { buf, pose: spec.matchPose, rest };
  });
  const links: [number, number][] = [];
  for (let i = 1; i < req.forms.length; i++) links.push([i - 1, i]);
  links.push([0, names.length - 1]);
  const asm = assemble(inputs, links, TIER_COUNT, names);
  return { names, pos: asm.pos, nrm: asm.nrm, stats: asm.stats, buildMs: performance.now() - t0, where };
}
