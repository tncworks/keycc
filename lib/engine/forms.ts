/**
 * Placement of the forms: each form is sampled once in local space
 * (formspecs.ts) and posed per frame by a layout-aware transform, so the
 * same particles can sit centred on a phone and beside the copy on a
 * laptop. Poses are expressed in fractions of the visible frame.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { EXPLODED_HEIGHT } from "./shapes/exploded";
import { keyTops } from "./shapes/keyboard";
import { WAVE } from "./shapes/waveform";
import { WORDMARK_WIDTH } from "./shapes/wordmark";
import { EXPLODED_PITCH, EXPLODED_ROLL, EXPLODED_YAW, KEYBOARD_PITCH, WAVE_PITCH, type FormName } from "./formspecs";

export { FORM_SPECS, KIND, KEYBOARD_PITCH, type BuildContext, type FormName, type FormSpec } from "./formspecs";

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
      const s = (mix(0.39, 0.84, w) * 2 * L.halfH) / EXPLODED_HEIGHT;
      const sway = ((10 * Math.PI) / 180) * Math.sin(time * 0.19);
      return compose(out, L.halfW * mix(0.02, 0.33, w), L.halfH * mix(0.39, -0.05, w), 0, EXPLODED_PITCH, EXPLODED_YAW + sway, s, EXPLODED_ROLL * w);
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
