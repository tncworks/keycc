/**
 * Every tunable of the motion engine, with defaults and sane ranges.
 *
 * This file is the single source of truth: the `?debug` lil-gui panel is
 * built from it and the parameter table in PHYSICS.md is generated from it
 * (`npm run params:doc`). It has no imports so plain Node can load it.
 */

export interface ParamMeta {
  v: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  doc: string;
}

const DEFS = {
  sim: {
    dt: { v: 1 / 120, min: 1 / 240, max: 1 / 60, step: 1 / 960, unit: "s", doc: "fixed simulation timestep" },
    maxSubsteps: { v: 4, min: 1, max: 8, step: 1, doc: "substep cap per frame (excess time is dropped)" },
    maxFrameDt: { v: 0.05, min: 0.02, max: 0.1, step: 0.005, unit: "s", doc: "frame dt clamp (tab switches, hitches)" },
    timeScale: { v: 1, min: 0, max: 2, step: 0.01, doc: "global time multiplier (debug)" },
  },
  spring: {
    frequency: { v: 0.78, min: 0.3, max: 2, step: 0.01, unit: "Hz", doc: "natural frequency f₀ of the pull to targets" },
    damping: { v: 0.82, min: 0.5, max: 1.2, step: 0.01, doc: "damping ratio ζ (1.1 % overshoot at 0.82)" },
    massJitter: { v: 0.15, min: 0, max: 0.4, step: 0.01, doc: "± per-particle mass variation (de-synchronises arrivals)" },
    looseFraction: { v: 0.04, min: 0, max: 0.15, step: 0.005, doc: "share of loose motes that orbit their home" },
    looseStiffness: { v: 0.04, min: 0.005, max: 0.3, step: 0.005, doc: "stiffness multiplier for loose motes" },
  },
  flow: {
    speed: { v: 0.08, min: 0, max: 0.6, step: 0.005, unit: "u/s", doc: "RMS speed of the curl-noise wind" },
    frequency: { v: 0.85, min: 0.2, max: 3, step: 0.01, unit: "1/u", doc: "spatial frequency of the wind" },
    evolution: { v: 0.12, min: 0, max: 0.6, step: 0.01, doc: "how fast the wind pattern changes" },
    octave2: { v: 0.4, min: 0, max: 1, step: 0.01, doc: "weight of the second (2.1×) octave" },
    coupling: { v: 1.8, min: 0, max: 6, step: 0.05, unit: "1/s", doc: "air drag coefficient c_air (part of total damping)" },
    transitBoost: { v: 6, min: 0, max: 15, step: 0.1, doc: "wind multiplier mid-morph (4e(1-e) weighted)" },
  },
  cursor: {
    radius: { v: 0.5, min: 0.1, max: 1.5, step: 0.01, unit: "u", doc: "poly6 kernel radius around the cursor ray" },
    strength: { v: 2.3, min: 0, max: 20, step: 0.1, unit: "u/s²", doc: "radial push at the core (bounded)" },
    lift: { v: 0.9, min: 0, max: 10, step: 0.1, unit: "u/s²", doc: "push toward the camera (motes rise into bokeh)" },
    wake: { v: 3.2, min: 0, max: 6, step: 0.05, unit: "1/s", doc: "drag toward the cursor's velocity" },
    swirl: { v: 1.4, min: 0, max: 5, step: 0.05, unit: "u/s²", doc: "tangential swirl around the ray" },
    still: { v: 0.3, min: 0, max: 1, step: 0.01, doc: "field strength while the cursor rests (air only moves when the hand does)" },
    stirSpeed: { v: 0.7, min: 0.05, max: 3, step: 0.05, unit: "u/s", doc: "cursor speed for the full field" },
    smoothing: { v: 0.06, min: 0, max: 0.3, step: 0.005, unit: "s", doc: "low-pass on cursor velocity" },
    fade: { v: 0.25, min: 0.02, max: 1, step: 0.01, unit: "s", doc: "presence fade in/out" },
  },
  limits: {
    maxSpeed: { v: 3.2, min: 0.5, max: 10, step: 0.1, unit: "u/s", doc: "velocity clamp" },
    maxAccel: { v: 80, min: 5, max: 300, step: 1, unit: "u/s²", doc: "acceleration clamp" },
  },
  morph: {
    window: { v: 0.55, min: 0.1, max: 1, step: 0.01, doc: "share of the transition each particle travels in" },
    jitter: { v: 0.25, min: 0, max: 0.6, step: 0.01, doc: "randomness mixed into the release order" },
    arc: { v: 0.22, min: 0, max: 1, step: 0.01, unit: "u", doc: "mid-flight lift toward the camera" },
    smoothing: { v: 0.25, min: 0, max: 1.5, step: 0.01, unit: "s", doc: "critically-damped smoothing of scroll progress" },
    maxRate: { v: 1.2, min: 0.2, max: 5, step: 0.05, unit: "1/s", doc: "max morph speed (shapes per second)" },
    holdOut: { v: 0.1, min: 0, max: 0.45, step: 0.01, doc: "scroll share a form holds after its section starts leaving" },
    holdIn: { v: 0.36, min: 0, max: 0.45, step: 0.01, doc: "scroll share the next form is complete before its section is centred" },
  },
  intro: {
    duration: { v: 4.1, min: 1, max: 10, step: 0.1, unit: "s", doc: "dust → keyboard assembly time" },
    delay: { v: 0.3, min: 0, max: 3, step: 0.05, unit: "s", doc: "dust drift before assembly starts" },
    window: { v: 0.42, min: 0.1, max: 1, step: 0.01, doc: "share of the intro each particle travels in" },
  },
  keys: {
    travel: { v: 0.04, min: 0, max: 0.1, step: 0.001, unit: "u", doc: "key travel (4.0 mm)" },
    pressTime: { v: 0.018, min: 0.005, max: 0.1, step: 0.001, unit: "s", doc: "time constant going down" },
    releaseTime: { v: 0.07, min: 0.01, max: 0.3, step: 0.005, unit: "s", doc: "time constant coming back up" },
    minHold: { v: 0.07, min: 0, max: 0.2, step: 0.005, unit: "s", doc: "minimum visible press for fast taps" },
    glow: { v: 0.35, min: 0, max: 1.5, step: 0.01, doc: "brightness lift of a pressed keycap" },
  },
  ripple: {
    speed: { v: 1.3, min: 0.2, max: 4, step: 0.01, unit: "u/s", doc: "ring expansion speed" },
    width: { v: 0.13, min: 0.02, max: 0.4, step: 0.005, unit: "u", doc: "ring width σ (Ricker wavelet)" },
    amplitude: { v: 0.05, min: 0, max: 0.15, step: 0.001, unit: "u", doc: "ring height" },
    decay: { v: 1.2, min: 0.2, max: 4, step: 0.05, unit: "s", doc: "ring lifetime T" },
    spread: { v: 0.35, min: 0.05, max: 2, step: 0.01, unit: "u", doc: "r₀ of the 1/√(1+r/r₀) energy spreading" },
    sheen: { v: 12, min: 0, max: 40, step: 0.5, doc: "brightness added per unit of ripple height" },
  },
  render: {
    size: { v: 0.0082, min: 0.002, max: 0.04, step: 0.0005, unit: "u", doc: "sprite diameter at the focal plane" },
    sizeJitter: { v: 0.25, min: 0, max: 0.8, step: 0.01, doc: "± sprite size variation" },
    alpha: { v: 0.72, min: 0.05, max: 1, step: 0.01, doc: "base sprite opacity" },
    aperture: { v: 0.05, min: 0, max: 0.25, step: 0.005, unit: "u", doc: "lens aperture (depth of field)" },
    focusOffset: { v: 0, min: -3, max: 3, step: 0.05, unit: "u", doc: "focus distance offset from the subject" },
    minPx: { v: 1.6, min: 0.5, max: 4, step: 0.05, unit: "px", doc: "smallest sprite; smaller ones fade instead" },
    maxPx: { v: 56, min: 8, max: 200, step: 1, unit: "px", doc: "largest sprite" },
    bokehCull: { v: 4, min: 1, max: 32, step: 0.5, doc: "area growth before stochastic bokeh culling starts" },
    backface: { v: 0.82, min: 0, max: 1, step: 0.01, doc: "fade of samples on faces pointing away" },
    depthFade: { v: 0.4, min: 0, max: 1, step: 0.01, doc: "aerial-perspective dimming behind the subject" },
    glint: { v: 0.6, min: 0, max: 3, step: 0.05, doc: "occasional glints of loose motes catching the light" },
    exposure: { v: 1, min: 0.2, max: 2, step: 0.01, doc: "particle brightness" },
  },
  bloom: {
    threshold: { v: 0.62, min: 0, max: 1.5, step: 0.01, doc: "soft-knee luminance threshold" },
    knee: { v: 0.35, min: 0, max: 1, step: 0.01, doc: "soft-knee width" },
    strength: { v: 0.3, min: 0, max: 2, step: 0.01, doc: "bloom mix" },
    radius: { v: 0.75, min: 0, max: 1, step: 0.01, doc: "upsample spread" },
  },
  grade: {
    vignette: { v: 0.28, min: 0, max: 1, step: 0.01, doc: "edge darkening of the particle layer" },
    dither: { v: 1, min: 0, max: 3, step: 0.1, unit: "LSB", doc: "triangular dither amplitude" },
  },
  parallax: {
    yaw: { v: 5, min: 0, max: 20, step: 0.1, unit: "°", doc: "camera yaw following the pointer" },
    pitch: { v: 3, min: 0, max: 15, step: 0.1, unit: "°", doc: "camera pitch following the pointer" },
    smoothing: { v: 1.2, min: 0.05, max: 4, step: 0.05, unit: "s", doc: "parallax time constant" },
    breathe: { v: 0.9, min: 0, max: 4, step: 0.05, unit: "°", doc: "slow autonomous camera drift" },
  },
} satisfies Record<string, Record<string, ParamMeta>>;

export const PARAM_META = DEFS;

export type Params = {
  [G in keyof typeof DEFS]: { [K in keyof (typeof DEFS)[G]]: number };
};

export function defaultParams(): Params {
  const out: Record<string, Record<string, number>> = {};
  for (const [g, group] of Object.entries(DEFS)) {
    out[g] = {};
    for (const [k, meta] of Object.entries(group as Record<string, ParamMeta>)) out[g][k] = meta.v;
  }
  return out as Params;
}
