/**
 * The forms of the scroll story and their placement. Each form is sampled
 * once in local space and posed per frame by a layout-aware transform, so
 * the same particles can sit centred on a phone and beside the copy on a
 * laptop. Poses are expressed in fractions of the visible frame.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { buildDust } from "./shapes/dust";
import { buildExploded, EXPLODED_HEIGHT } from "./shapes/exploded";
import { buildField } from "./shapes/field";
import { buildKeyboard, keyTops } from "./shapes/keyboard";
import { buildWaveform, WAVE } from "./shapes/waveform";
import { buildWordmark, WORDMARK_WIDTH, type GlyphMask } from "./shapes/wordmark";
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
const EXPLODED_PITCH = (16 * Math.PI) / 180;
const EXPLODED_YAW = (-34 * Math.PI) / 180;
const EXPLODED_ROLL = (-11 * Math.PI) / 180;
const WAVE_PITCH = (13 * Math.PI) / 180;

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

export interface Layout {
  /** visible half extents at the focal plane (world units) */
  halfW: number;
  halfH: number;
  aspect: number;
  /** 0 portrait … 1 landscape */
  wide: number;
}

const _q = new Quaternion();
const _qx = new Quaternion();
const _axis = new Vector3();
const _p = new Vector3();
const _s = new Vector3();

/** T · Rz(roll) · Rx(pitch) · Ry(yaw) · S (yStretch scales local y only) */
function compose(out: Matrix4, x: number, y: number, z: number, pitch: number, yaw: number, scale: number, roll = 0, yStretch = 1) {
  _q.setFromAxisAngle(_axis.set(0, 0, 1), roll);
  _q.multiply(_qx.setFromAxisAngle(_axis.set(1, 0, 0), pitch));
  _q.multiply(_qx.setFromAxisAngle(_axis.set(0, 1, 0), yaw));
  return out.compose(_p.set(x, y, z), _q, _s.set(scale, scale * yStretch, scale));
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** World transform of a form for the current layout and time. */
export function formPose(name: FormName, L: Layout, time: number, out: Matrix4): Matrix4 {
  const w = L.wide;
  switch (name) {
    case "keyboard":
      // below the headline on every layout, a touch smaller on wide screens
      return compose(out, 0, L.halfH * mix(-0.4, -0.2, w), 0, KEYBOARD_PITCH, 0, mix(1, 0.93, w));
    case "exploded": {
      const s = (mix(0.34, 0.84, w) * 2 * L.halfH) / EXPLODED_HEIGHT;
      const sway = ((10 * Math.PI) / 180) * Math.sin(time * 0.19);
      return compose(out, L.halfW * mix(0.02, 0.3, w), L.halfH * mix(0.36, -0.05, w), 0, EXPLODED_PITCH, EXPLODED_YAW + sway, s, EXPLODED_ROLL * w);
    }
    case "waveform": {
      const s = (mix(0.98, 0.9, w) * 2 * L.halfW) / WAVE.width;
      // portrait screens are narrow: let the ridges stand taller
      return compose(out, 0, L.halfH * mix(-0.2, -0.3, w), 0, WAVE_PITCH, 0, s, 0, mix(1.8, 1, w));
    }
    case "wordmark": {
      const s = (mix(0.86, 0.6, w) * 2 * L.halfW) / WORDMARK_WIDTH;
      return compose(out, 0, L.halfH * mix(0.1, 0.04, w), 0, 0, 0, s);
    }
    case "field": {
      // scale with the frame so the horizon sits at the same screen height everywhere
      const s = L.halfH / 1.75;
      return compose(out, 0, -1.1 * s, 0, 0, 0, s);
    }
    case "dust":
    default: {
      const s = L.halfH / 1.75;
      return out.makeScale(s, s, s);
    }
  }
}

export function keyboardKeyTops(): Float32Array {
  return keyTops();
}
