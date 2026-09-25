/**
 * Adaptive quality ladder, driven with synthetic frame times through the
 * real QualityMonitor (lib/engine/tier.ts).
 */
import { QualityMonitor, LADDER, TIERS } from "../lib/engine/tier.ts";

function run(label, phases) {
  const m = new QualityMonitor();
  const trace = [];
  for (const [seconds, dt] of phases) {
    for (let t = 0; t < seconds; t += dt) {
      if (m.sample(dt)) trace.push(`${(trace.length + 1)}: L${m.level} (${LADDER[m.level][0]}/4 rows, dpr×${LADDER[m.level][1]})`);
    }
  }
  console.log(`${label}: final L${m.level}  ${trace.join("  →  ") || "no change"}`);
  return m.level;
}

const slow = run("iGPU struggling at 35 ms, then OK at 60 Hz", [[2, 1 / 60], [20, 0.035], [30, 1 / 60]]);
// a device that is fine at L2 but drops frames at L1: must settle at L2, not oscillate
function device() {
  const m = new QualityMonitor();
  const levels = [];
  for (let t = 0; t < 180; t += 1 / 60) {
    const dt = m.level <= 1 ? 0.028 : 1 / 60;
    if (m.sample(dt)) levels.push(m.level);
  }
  console.log(`device that holds 60 Hz only at L2+: ${levels.join(" → ")}  (final L${m.level})`);
  return { final: m.level, changes: levels.length };
}
const dev = device();
const fast = run("steady 60 Hz", [[40, 1 / 60]]);
const hz144 = run("steady 144 Hz", [[40, 1 / 144]]);
const jank = run("occasional 50 ms hitch every second", [[40, 1 / 60], ...Array.from({ length: 30 }, () => [[1 / 60 * 59, 1 / 60], [0.05, 0.05]]).flat()]);
const budgets = Object.entries(TIERS).map(([k, v]) => `${k} ${v.size}²=${(v.size * v.size).toLocaleString()}`).join(", ");
console.log(`tier budgets: ${budgets}`);
const ok = slow > 0 && slow < 5 && fast === 0 && hz144 === 0 && jank === 0 && dev.final === 2 && dev.changes <= 4;
console.log(ok ? "PASS adaptive ladder steps down under load, never on healthy or 144 Hz frames" : "FAIL");
process.exit(ok ? 0 : 1);
