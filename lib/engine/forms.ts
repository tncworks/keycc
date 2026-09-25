/**
 * The forms of the scroll story and their placement. Each form is sampled
 * once (local space) and posed per frame by a layout-aware transform, so
 * the same particles can sit centred on a phone and beside the copy on a
 * laptop.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { buildDust } from "./shapes/dust";
import { buildKeyboard, keyTops } from "./shapes/keyboard";
import type { Rng } from "./random";
import { xfRotX, xfIdentity, type ShapeBuffer, type Xf } from "./sampling";

export type FormName = "dust" | "keyboard" | "exploded" | "waveform" | "wordmark" | "field";

export const KIND = { static: 0, keyboard: 1, wave: 2, field: 3 } as const;

export interface FormSpec {
  name: FormName;
  kind: number;
  /** stiffness multiplier (dust is loose) */
  stiffness: number;
  /** wind multiplier */
  wind: number;
  /** canonical pose for matching (≈ desktop view, no translation) */
  matchPose: Xf;
  build(N: number, rng: Rng): { buf: ShapeBuffer; rest?: Float32Array };
}

export const KEYBOARD_PITCH = (38 * Math.PI) / 180;

export const FORM_SPECS: Record<FormName, FormSpec> = {
  dust: {
    name: "dust",
    kind: KIND.static,
    stiffness: 0.06,
    wind: 3.2,
    matchPose: xfIdentity(),
    build: (N, rng) => ({ buf: buildDust(N, rng) }),
  },
  keyboard: {
    name: "keyboard",
    kind: KIND.keyboard,
    stiffness: 1,
    wind: 1,
    matchPose: xfRotX(KEYBOARD_PITCH),
    build: (N, rng) => ({ buf: buildKeyboard(N, rng) }),
  },
  // filled in Phase 2
  exploded: undefined as unknown as FormSpec,
  waveform: undefined as unknown as FormSpec,
  wordmark: undefined as unknown as FormSpec,
  field: undefined as unknown as FormSpec,
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

function compose(out: Matrix4, x: number, y: number, z: number, rx: number, ry: number, scale: number) {
  _q.setFromAxisAngle(_axis.set(0, 1, 0), ry);
  _q.multiply(_qx.setFromAxisAngle(_axis.set(1, 0, 0), rx));
  return out.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
}

/** World transform of a form for the current layout and time. */
export function formPose(name: FormName, L: Layout, _time: number, out: Matrix4): Matrix4 {
  switch (name) {
    case "keyboard":
      return compose(out, 0, -0.2 * L.wide + 0.05 * (1 - L.wide), 0, KEYBOARD_PITCH, 0, 1);
    default:
      return out.identity();
  }
}

export function keyboardKeyTops(): Float32Array {
  return keyTops();
}
