/**
 * Device tiers (PHYSICS.md §5.3) and the adaptive quality monitor.
 */
export type TierName = "low" | "mobile" | "mid" | "high" | "ultra";

export const TIERS: Record<TierName, { size: number; dpr: number }> = {
  low: { size: 160, dpr: 1 },
  mobile: { size: 224, dpr: 2 },
  mid: { size: 256, dpr: 1.5 },
  high: { size: 320, dpr: 1.75 },
  ultra: { size: 448, dpr: 2 },
};

export const TIER_COUNT = 4; // interleaved quarters of the particle rows

export function pickTier(gl: WebGL2RenderingContext | null, override?: string | null): TierName {
  if (override && override in TIERS) return override as TierName;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 600;
  const mem = nav.deviceMemory ?? 8;
  let renderer = "";
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  }
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return "low";
  if (coarse || small) return mem <= 3 ? "low" : "mobile";
  if (/nvidia|geforce|rtx|radeon rx|apple m\d (pro|max|ultra)/i.test(renderer)) return "ultra";
  if (/intel.*(uhd|hd graphics)/i.test(renderer)) return "mid";
  return "high";
}

/**
 * Quality ladder: [active quarters of the particle rows, DPR factor].
 * The monitor steps down on sustained frame drops and back up on sustained
 * headroom, with hysteresis so it never oscillates.
 */
export const LADDER: [number, number][] = [
  [4, 1],
  [3, 1],
  [3, 0.8],
  [2, 0.8],
  [2, 0.65],
  [1, 0.65],
];

export class QualityMonitor {
  level = 0;
  private samples: number[] = [];
  private refresh = 1 / 60;
  private lastChange = 0;
  private locked = new Set<number>();
  private clock = 0;
  enabled = true;

  /** feed a real frame delta (seconds); returns true when the level changed */
  sample(dt: number): boolean {
    if (!this.enabled || dt <= 0 || dt > 0.5) return false;
    this.clock += dt;
    this.samples.push(dt);
    if (this.samples.length < 90) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.samples.length = 0;
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const median = sorted[sorted.length >> 1];
    // refresh interval estimate: fastest sustained frames, snapped to common rates
    const est = Math.min(Math.max(p10, 1 / 240), 1 / 30);
    this.refresh = this.refresh * 0.7 + est * 0.3;
    const since = this.clock - this.lastChange;
    if (median > this.refresh * 1.35 && this.level < LADDER.length - 1 && since > 2) {
      if (since < 6) this.locked.add(this.level - 1); // just stepped up and it failed
      this.level++;
      this.lastChange = this.clock;
      return true;
    }
    if (median < this.refresh * 1.08 && this.level > 0 && since > 8 && !this.locked.has(this.level - 1)) {
      this.level--;
      this.lastChange = this.clock;
      return true;
    }
    return false;
  }
}
