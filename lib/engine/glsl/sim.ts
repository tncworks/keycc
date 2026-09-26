import { NOISE_GLSL } from "./noise";
import { COIL_GLSL } from "../shapes/coil";
import { CURVE } from "../shapes/curve";

/**
 * One simulation substep for every particle (PHYSICS.md §1–§3), written to
 * two MRT attachments: position(+brightness) and velocity(+accent).
 * Semi-implicit Euler with the fixed dt from the CPU accumulator.
 */
export const SIM_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2 uRes;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uSeed;

// morph slots: A -> B, plus the dust source for the intro
uniform sampler2D uPosA;
uniform sampler2D uNrmA;
uniform sampler2D uPosB;
uniform sampler2D uNrmB;
uniform sampler2D uPosD;
uniform int uKindA;
uniform int uKindB;
uniform mat4 uXfA;
uniform mat4 uXfB;
uniform mat4 uXfD;
uniform vec2 uShapeA;   // stiffness mult, wind mult
uniform vec2 uShapeB;
uniform vec2 uShapeD;
uniform float uMix;     // 0..1 progress A -> B
uniform float uIntro;   // 0..1 progress dust -> form
uniform vec4 uMorph;    // window, jitter, arc, reduced motion
uniform vec2 uIntroCfg; // intro window, intro jitter

uniform float uTime;
uniform float uDt;
uniform vec3 uSpring;   // k, zeta, mass jitter
uniform vec2 uLoose;    // fraction, stiffness mult
uniform vec4 uFlow;     // speed/rms, frequency, octave2, coupling
uniform vec4 uFlowPhase;
uniform float uTransitBoost;
uniform vec3 uRayO;
uniform vec3 uRayD;
uniform vec4 uCursor;   // radius, strength, wake, swirl (presence applied)
uniform float uCursorLift;
uniform vec3 uCursorVel;
uniform vec2 uLimits;   // max speed, max accel
uniform vec3 uCamPos;
uniform float uBackface;

// procedural forms
uniform sampler2D uWaveTex;
uniform vec4 uWave;     // width, depth, height, thickness
uniform vec4 uWave2;    // lines, rows per line, head row, rows
uniform vec4 uField;    // amplitude, frequency, speed, -
uniform vec4 uCurve;    // switch curve: F0, k, bump height, bump x
uniform vec4 uCurve2;   // bump width, spike height, spike start, travel
uniform vec4 uCurve3;   // actuation x, bead (any-key press 0..1), -, -
uniform vec4 uCoil;     // phase, -, -, -
uniform vec4 uCoilPulse; // sim start times of the last four pulses (<0: none)

layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;

${NOISE_GLSL}

${COIL_GLSL}

float smoother(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

// switch force curve — mirrors force() in shapes/curve.ts
float swForce(float x) {
  float s = smoothstep(uCurve2.z, uCurve2.w, x);
  float g = exp(-pow((x - uCurve.w) / uCurve2.x, 2.0));
  return uCurve.x + uCurve.y * min(x, uCurve2.w) + uCurve.z * g + uCurve2.y * s * s;
}
float swForceUp(float x) {
  float g = exp(-pow((x - uCurve.w) / uCurve2.x, 2.0));
  return swForce(x) - 7.0 - 0.45 * uCurve.z * g;
}
vec2 chartXY(float x, float F) {
  return vec2((x / ${CURVE.axisMM.toFixed(1)} - 0.5) * ${CURVE.width.toFixed(3)}, (F / ${CURVE.maxF.toFixed(1)} - 0.5) * ${CURVE.height.toFixed(3)});
}

float release(float p, float order, float rnd, float w, float jitter) {
  float d = mix(order, rnd, jitter);
  return smoother(clamp((p - d * (1.0 - w)) / w, 0.0, 1.0));
}

float decodeShade(float attr) {
  float rem = attr - 4.0 * floor(attr / 4.0);
  return (rem >= 2.0 ? rem - 2.0 : rem) / 1.99;
}
float decodeAccent(float attr) {
  float rem = attr - 4.0 * floor(attr / 4.0);
  return rem >= 2.0 ? 1.0 : 0.0;
}

// Local-space point of a form; w = brightness multiplier.
vec4 formPoint(int kind, vec4 t) {
  if (kind == 2) {
    // ridgeline waveform: t = (u, line, jitter, attr)
    float lines = uWave2.x;
    float rowF = uWave2.z - t.y * uWave2.y;
    float a = texture(uWaveTex, vec2(t.x, (rowF + 0.5) / uWave2.w)).r;
    float depth01 = t.y / max(lines - 1.0, 1.0);
    vec3 p = vec3((t.x - 0.5) * uWave.x, a * uWave.z + t.z * uWave.w, (0.5 - depth01) * uWave.y);
    return vec4(p, 1.0 + 1.6 * clamp(a, 0.0, 1.0));
  }
  if (kind == 4) {
    // switch force chart: t = (u, role*4 + v, w, attr)
    float role = floor(t.y / 4.0);
    float v = t.y - 4.0 * role;
    float u = t.x;
    float travel = uCurve2.w;
    float ang = t.z * 6.2831853;
    float bright = 1.0;
    vec3 p;
    if (role < 0.5) {
      float x = u * travel;
      p = vec3(chartXY(x, swForce(x)), 0.0) + vec3(0.0, cos(ang), sin(ang)) * 0.013;
      float d = (u - uCurve3.y) / 0.03;
      bright += 2.4 * exp(-d * d) * smoothstep(0.02, 0.08, uCurve3.y);
    } else if (role < 1.5) {
      float x = u * travel;
      p = vec3(chartXY(x, swForceUp(x)), 0.0) + vec3(0.0, cos(ang), sin(ang)) * 0.008;
    } else if (role < 2.5) {
      float x = u * travel;
      p = vec3(chartXY(x, swForce(x) * v), (t.z - 0.5) * 0.16);
      bright = 0.3 + 0.7 * v * v;
    } else if (role < 3.5) {
      p = vec3((u - 0.5) * ${CURVE.width.toFixed(3)}, (v - 0.5) * ${CURVE.height.toFixed(3)}, (t.z - 0.5) * 0.015);
    } else if (role < 4.5) {
      float x = uCurve3.x;
      p = vec3(chartXY(x, swForce(x)) + vec2(cos(ang), sin(ang)) * (0.055 + 0.012 * v), 0.0);
      float a = x / travel;
      bright = 1.0 + 1.6 * smoothstep(a - 0.05, a, uCurve3.y);
    } else {
      float x = uCurve3.x;
      p = vec3(chartXY(x, swForce(x) * v), 0.0);
    }
    return vec4(p, bright);
  }
  if (kind == 5) {
    // coiled cable: t = (s, part*4 + a, b, attr); the coil turns with phase
    float part = floor(t.y / 4.0);
    float a = t.y - 4.0 * part;
    vec4 c = coilPoint(t.x, part, a, t.z, uCoil.x);
    float bright = c.w;
    for (int i = 0; i < 4; i++) {
      float t0 = uCoilPulse[i];
      float age = uTime - t0;
      if (t0 < 0.0 || age < 0.0 || age > 2.6) continue;
      float d = (t.x - (1.0 - age * 0.62)) / 0.02;
      bright += 1.9 * exp(-d * d) * (1.0 - age / 2.6);
    }
    return vec4(c.xyz, bright);
  }
  if (kind == 3) {
    // undulating horizon field: t = (x, z, phase, attr)
    float y = uField.x * snoise(vec3(t.x * uField.y, t.y * uField.y, uTime * uField.z));
    return vec4(t.x, y, t.y, 1.0);
  }
  return vec4(t.xyz, 1.0);
}

float facing(vec3 n, mat4 xf, vec3 p) {
  vec3 w = mat3(xf) * n;
  float l = length(w);
  if (l < 1e-4) return 1.0;
  float f = dot(w / l, normalize(uCamPos - p));
  return mix(1.0 - uBackface, 1.0, smoothstep(-0.2, 0.15, f));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 P = texture(uPos, uv);
  vec4 V = texture(uVel, uv);
  vec4 seed = texture(uSeed, uv);
  vec3 x = P.xyz;
  vec3 v = V.xyz;
  float reduced = uMorph.w;

  // ---- target ------------------------------------------------------------
  vec4 ta = texture(uPosA, uv);
  vec4 na = texture(uNrmA, uv);
  vec4 fa = formPoint(uKindA, ta);
  vec3 pa = (uXfA * vec4(fa.xyz, 1.0)).xyz;
  float bA = decodeShade(ta.w) * fa.w * facing(na.xyz, uXfA, pa);
  float accent = decodeAccent(ta.w);
  float key = floor(ta.w / 4.0) - 1.0;
  float slot = 0.0;
  float stiff = uShapeA.x;
  float wind = uShapeA.y;
  vec3 target = pa;
  float bright = bA;
  float transit = 0.0;

  if (uMix > 0.0) {
    vec4 tb = texture(uPosB, uv);
    vec4 nb = texture(uNrmB, uv);
    vec4 fb = formPoint(uKindB, tb);
    vec3 pb = (uXfB * vec4(fb.xyz, 1.0)).xyz;
    float bB = decodeShade(tb.w) * fb.w * facing(nb.xyz, uXfB, pb);
    float e = release(uMix, nb.w, seed.y, uMorph.x, uMorph.y);
    float eMove = mix(e, step(0.5, e), reduced);
    target = mix(pa, pb, eMove);
    bright = mix(bA, bB, e) * mix(1.0, abs(1.0 - 2.0 * e), reduced);
    accent = mix(accent, decodeAccent(tb.w), e);
    if (e >= 0.5) {
      key = floor(tb.w / 4.0) - 1.0;
      slot = 1.0;
    }
    stiff = mix(uShapeA.x, uShapeB.x, e);
    wind = mix(uShapeA.y, uShapeB.y, e);
    transit = 4.0 * e * (1.0 - e);
  }

  if (uIntro < 1.0) {
    vec4 td = texture(uPosD, uv);
    vec3 pd = (uXfD * vec4(td.xyz, 1.0)).xyz;
    float ei = release(uIntro, na.w, seed.y, uIntroCfg.x, uIntroCfg.y);
    float eiMove = mix(ei, step(0.5, ei), reduced);
    target = mix(pd, target, eiMove);
    bright = mix(decodeShade(td.w), bright, ei) * mix(1.0, abs(1.0 - 2.0 * ei), reduced);
    accent *= ei;
    if (ei < 0.5) key = -1.0;
    stiff = mix(uShapeD.x, stiff, ei);
    wind = mix(uShapeD.y, wind, ei);
    transit = max(transit, 4.0 * ei * (1.0 - ei));
  }
  transit *= 1.0 - reduced;

  // mid-flight lift toward the camera (depth cue, crosses over the forms)
  vec3 arcDir = normalize(vec3((seed.z - 0.5) * 0.7, 0.2 + (seed.w - 0.5) * 0.6, 1.0));
  target += arcDir * (uMorph.z * transit);

  // ---- forces --------------------------------------------------------------
  float m = 1.0 + uSpring.z * (seed.x * 2.0 - 1.0);
  float loose = step(seed.z, uLoose.x);
  float k = uSpring.x * stiff * mix(1.0, uLoose.y, loose);
  float cTot = 2.0 * uSpring.y * sqrt(k * m);
  float cAir = uFlow.w;
  float cS = max(cTot - cAir, 0.0);

  vec3 q = x * uFlow.y;
  vec3 flow = curlNoise(q + vec3(uFlowPhase.xy, 0.0))
            + uFlow.z * curlNoise(q * 2.1 + vec3(uFlowPhase.zw, 17.0));
  flow *= uFlow.x * wind * (1.0 + uTransitBoost * transit);

  vec3 F = k * (target - x) - cS * v + cAir * (flow - v);

  // cursor: poly6 kernel around the ray, bounded at the core
  vec3 rel = x - uRayO;
  float tr = dot(rel, uRayD);
  vec3 radial = rel - tr * uRayD;
  float d2 = dot(radial, radial);
  float R2 = uCursor.x * uCursor.x;
  if (d2 < R2 && tr > 0.0) {
    float qk = 1.0 - d2 / R2;
    float W = qk * qk * qk;
    vec3 rh = radial * inversesqrt(d2 + 1e-8);
    F += W * (uCursor.y * rh - uCursorLift * uRayD + uCursor.z * (uCursorVel - v) + uCursor.w * cross(uRayD, rh));
  }

  vec3 a = F / m;
  float al = length(a);
  if (al > uLimits.y) a *= uLimits.y / al;

  if (reduced > 0.5) {
    // no travel: sit on the target, breathing with the (reduced) wind
    x = target + flow * (cAir / max(k, 1e-3));
    v = vec3(0.0);
  } else {
    v += a * uDt;
    float vl = length(v);
    if (vl > uLimits.x) v *= uLimits.x / vl;
    x += v * uDt;
  }

  // NaN / runaway guard: comparisons with NaN are false, so this catches both
  if (!(abs(x.x) < 1e4 && abs(x.y) < 1e4 && abs(x.z) < 1e4 &&
        abs(v.x) < 1e4 && abs(v.y) < 1e4 && abs(v.z) < 1e4)) {
    x = target;
    v = vec3(0.0);
  }
  // the w channels feed colour: a NaN there would be smeared by the bloom
  if (!(abs(bright) < 1e4)) bright = 0.0;
  if (!(abs(accent) < 1e4)) accent = 0.0;

  oPos = vec4(x, bright);
  // w packs accent (0..1), the key slot this particle answers to, and
  // whether it currently belongs to form A or B (for the key axis)
  oVel = vec4(v, clamp(accent, 0.0, 1.0) + 2.0 * (key + 1.0) + 512.0 * slot);
}
`;

/** Initialises state at the dust positions (both ping-pong targets). */
export const INIT_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform vec2 uRes;
uniform sampler2D uPosD;
uniform mat4 uXfD;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
float decodeShade(float attr) {
  float rem = attr - 4.0 * floor(attr / 4.0);
  return (rem >= 2.0 ? rem - 2.0 : rem) / 1.99;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 td = texture(uPosD, uv);
  oPos = vec4((uXfD * vec4(td.xyz, 1.0)).xyz, decodeShade(td.w));
  oVel = vec4(0.0);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
precision highp float;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
