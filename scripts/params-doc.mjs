/**
 * Regenerates the parameter table in PHYSICS.md from lib/engine/params.ts,
 * so the doc and the ?debug panel can never drift apart.
 *   node scripts/params-doc.mjs          rewrite the table
 *   node scripts/params-doc.mjs --check  exit 1 if the doc is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PARAM_META } from "../lib/engine/params.ts";

const fmt = (v, step) => {
  if (Math.abs(v - 1 / 120) < 1e-9) return "1/120";
  if (Math.abs(v - 1 / 240) < 1e-9) return "1/240";
  if (Math.abs(v - 1 / 60) < 1e-9) return "1/60";
  const d = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step || 1))));
  return Number(v.toFixed(d)).toString();
};

let rows = ["| group | key | default | range | unit | meaning |", "|---|---|---|---|---|---|"];
let count = 0;
for (const [g, defs] of Object.entries(PARAM_META)) {
  for (const [k, m] of Object.entries(defs)) {
    rows.push(`| ${g} | \`${k}\` | ${fmt(m.v, m.step)} | ${fmt(m.min, m.step)} – ${fmt(m.max, m.step)} | ${m.unit ?? ""} | ${m.doc} |`);
    count++;
  }
}
const table = rows.join("\n") + `\n\n${count} parameters, all live in \`?debug\`.`;
const path = new URL("../PHYSICS.md", import.meta.url);
const doc = readFileSync(path, "utf8");
const re = /<!-- PARAMS:START -->[\s\S]*<!-- PARAMS:END -->/;
const next = doc.replace(re, `<!-- PARAMS:START -->\n${table}\n<!-- PARAMS:END -->`);
if (process.argv.includes("--check")) {
  if (next !== doc) {
    console.error("PHYSICS.md parameter table is stale: run npm run params:doc");
    process.exit(1);
  }
  console.log(`PHYSICS.md table up to date (${count} parameters)`);
} else {
  writeFileSync(path, next);
  console.log(`wrote ${count} parameters to PHYSICS.md`);
}
