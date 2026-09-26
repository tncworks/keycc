/**
 * Placement of the forms: each form is sampled once in local space
 * (formspecs.ts) and posed per frame by a layout-aware transform, so the
 * same particles can sit centred on a phone and beside the copy on a
 * laptop. Poses are expressed in fractions of the visible frame.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { EXPLODED_HEIGHT } from "./shapes/exploded";
import { keyTops, KNOB_TOP, KEYBOARD_SIZE } from "./shapes/keyboard";
import { WAVE } from "./shapes/waveform";
import { WORDMARK_WIDTH } from "./shapes/wordmark";
import { CURVE_PITCH, CURVE_YAW, EXPLODED_PITCH, EXPLODED_ROLL, EXPLODED_YAW, KEYBOARD_PITCH, LAYOUT_PITCH, WAVE_PITCH, type FormName } from "./formspecs";
import { CURVE, chartXY, force, type SwitchCurve } from "./shapes/curve";
import { COIL, coilPoint, COIL_PARTS } from "./shapes/coil";
import { KEYS } from "./layout75";

export { FORM_SPECS, KIND, KEYBOARD_PITCH, type BuildContext, type FormName, type FormSpec } from "./formspecs";

export interface Layout {
  /** visible half extents at the focal plane (world units) */
  halfW: number;
  halfH: number;
  aspect: number;
  /** 0 portrait … 1 landscape */
  wide: number;
  /** viewports scrolled into the closing horizon (slowly turns the field) */
  fieldDrift?: number;
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
    case "curve": {
      const s = (mix(0.72, 0.44, w) * 2 * L.halfW) / CURVE.width;
      const sway = ((3.5 * Math.PI) / 180) * Math.sin(time * 0.17);
      return compose(out, L.halfW * mix(0.07, 0.46, w), L.halfH * mix(0.4, 0.02, w), 0, CURVE_PITCH, CURVE_YAW * w + sway, s);
    }
    case "layout": {
      const s = (mix(0.9, 0.5, w) * 2 * L.halfW) / KEYBOARD_SIZE.width;
      return compose(out, 0, L.halfH * mix(-0.3, -0.36, w), 0, LAYOUT_PITCH, 0, s);
    }
    case "coil": {
      const s = L.halfW / mix(2.6, 3.35, w);
      const sway = ((2.5 * Math.PI) / 180) * Math.sin(time * 0.13);
      // phones: the cable crosses the top, the copy runs below it
      return compose(out, 0, L.halfH * mix(0.34, -0.22, w), 0, 0.05, sway, s);
    }
    case "waveform": {
      const s = (mix(0.98, 0.9, w) * 2 * L.halfW) / WAVE.width;
      // portrait screens are narrow: let the ridges stand taller
      return compose(out, 0, L.halfH * mix(-0.36, -0.36, w), 0, WAVE_PITCH, 0, s, 0, mix(1.5, 1, w));
    }
    case "wordmark": {
      const s = (mix(0.8, 0.6, w) * 2 * L.halfW) / WORDMARK_WIDTH;
      return compose(out, 0, L.halfH * mix(0.1, 0.04, w), 0, 0, 0, s);
    }
    case "field": {
      // scale with the frame so the horizon sits at the same screen height
      // everywhere; the sea turns a little as the closing sections scroll by
      const s = L.halfH / 1.75;
      const turn = Math.max(Math.min((L.fieldDrift ?? 0) * 0.05, 0.45), -0.45);
      return compose(out, 0, -1.1 * s, 0, 0, turn, s);
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

/**
 * Local-space anchor points for DOM labels (`data-anchor="form:name"`),
 * projected by the engine every frame. `curve` anchors follow the live curve.
 */
export function anchorLocal(form: FormName, name: string, curve: SwitchCurve, out: Vector3): boolean {
  if (form === "curve") {
    const m = /^x(\d)$/.exec(name);
    if (m) {
      const [x, y] = chartXY(Number(m[1]), 0);
      out.set(x, y - 0.07, 0);
      return true;
    }
    const f = /^y(\d+)$/.exec(name);
    if (f) {
      const [x, y] = chartXY(0, Number(f[1]));
      out.set(x - 0.07, y, 0);
      return true;
    }
    if (name === "act") {
      const [x, y] = chartXY(curve.actX, force(curve, curve.actX));
      out.set(x, y, 0);
      return true;
    }
    if (name === "end") {
      const [x, y] = chartXY(curve.travel, force(curve, curve.travel));
      out.set(x, y, 0);
      return true;
    }
    return false;
  }
  if (form === "layout" || form === "keyboard") {
    if (name === "knob") {
      out.fromArray(KNOB_TOP);
      return true;
    }
    const code = { esc: "Escape", space: "Space", arrows: "ArrowUp", enter: "Enter" }[name];
    const i = code ? KEYS.findIndex((k) => k.code === code) : -1;
    if (i < 0) return false;
    out.fromArray(TOPS, i * 3);
    return true;
  }
  if (form === "coil") {
    const s = name === "plug" ? 0.03 : name === "aviator" ? (COIL.aviator[0] + COIL.aviator[1]) / 2 : name === "coil" ? 0.3 : -1;
    if (s < 0) return false;
    const p = coilPoint(s, COIL_PARTS.cable, 0.25, 0);
    out.set(p[0], p[1], p[2]);
    return true;
  }
  return false;
}
const TOPS = keyTops();
