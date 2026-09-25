import { NOISE_GLSL } from "./noise";

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

layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;

${NOISE_GLSL}

float smoother(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

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

  oPos = vec4(x, bright);
  oVel = vec4(v, accent);
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
