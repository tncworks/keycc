/**
 * Form specifications: how each form is sampled and how it behaves.
 * Free of DOM and three.js so the build can run in a Web Worker.
 */
import { buildDust } from "./shapes/dust";
import { buildExploded } from "./shapes/exploded";
import { buildField } from "./shapes/field";
import { buildKeyboard } from "./shapes/keyboard";
import { buildWaveform } from "./shapes/waveform";
import { buildWordmark, type GlyphMask } from "./shapes/wordmark";
import type { Rng } from "./random";
import { xfIdentity, xfRotX, xfRotY, xfRotZ, xfMul, type ShapeBuffer, type Xf } from "./sampling";

export type FormName = "dust" | "keyboard" | "exploded" | "waveform" | "wordmark" | "field";

export const KIND = { static: 0, keyboard: 1, wave: 2, field: 3 } as const;

export interface BuildContext {
  glyphs: GlyphMask | null;
}

export interface FormSpec {
  name: FormName;
  kind: number;
  /** stiffness multiplier (dust is loose) */
  stiffness: number;
  /** wind multiplier */
  wind: number;
  /** canonical pose for matching (≈ desktop view, rotation only) */
  matchPose: Xf;
  /** key travel in local units (0 = form does not respond to keys) */
  keyTravel: number;
  build(N: number, rng: Rng, ctx: BuildContext): { buf: ShapeBuffer; rest?: Float32Array };
}

export const KEYBOARD_PITCH = (38 * Math.PI) / 180;
export const EXPLODED_PITCH = (16 * Math.PI) / 180;
export const EXPLODED_YAW = (-34 * Math.PI) / 180;
export const EXPLODED_ROLL = (-11 * Math.PI) / 180;
export const WAVE_PITCH = (13 * Math.PI) / 180;

export const FORM_SPECS: Record<FormName, FormSpec> = {
  dust: {
    name: "dust",
    kind: KIND.static,
    stiffness: 0.06,
    wind: 3.2,
    matchPose: xfIdentity(),
    keyTravel: 0,
    build: (N, rng) => ({ buf: buildDust(N, rng) }),
  },
  keyboard: {
    name: "keyboard",
    kind: KIND.keyboard,
    stiffness: 1,
    wind: 1,
    matchPose: xfRotX(KEYBOARD_PITCH),
    keyTravel: 0.04,
    build: (N, rng) => ({ buf: buildKeyboard(N, rng) }),
  },
  exploded: {
    name: "exploded",
    kind: KIND.static,
    stiffness: 1,
    wind: 1.1,
    matchPose: xfMul(xfRotZ(EXPLODED_ROLL), xfMul(xfRotX(EXPLODED_PITCH), xfRotY(EXPLODED_YAW))),
    keyTravel: 0.04,
    build: (N, rng) => ({ buf: buildExploded(N, rng) }),
  },
  waveform: {
    name: "waveform",
    kind: KIND.wave,
    // stiff so the ridges track the live signal (lag 2ζ/ω ≈ 0.14 s)
    stiffness: 6,
    wind: 0.8,
    matchPose: xfRotX(WAVE_PITCH),
    keyTravel: 0,
    build: (N, rng) => buildWaveform(N, rng),
  },
  wordmark: {
    name: "wordmark",
    kind: KIND.static,
    stiffness: 1,
    wind: 1.2,
    matchPose: xfIdentity(),
    keyTravel: 0,
    build: (N, rng, ctx) => {
      if (!ctx.glyphs) throw new Error("wordmark needs glyphs");
      return { buf: buildWordmark(N, rng, ctx.glyphs) };
    },
  },
  field: {
    name: "field",
    kind: KIND.field,
    stiffness: 0.9,
    wind: 1.6,
    matchPose: xfIdentity(),
    keyTravel: 0,
    build: (N, rng) => buildField(N, rng),
  },
};
