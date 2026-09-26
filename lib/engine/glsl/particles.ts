/**
 * Particle sprites (PHYSICS.md §4, §6): interpolated state, key depression
 * and analytic Ricker rings applied at render time, thin-lens depth of field
 * with energy conservation, stochastic bokeh culling, min-size clamp.
 * Output is premultiplied for ONE / ONE_MINUS_SRC_ALPHA ("over") blending.
 */
export const MAX_RIPPLES = 16;
export const KEY_SLOTS = 96;

export const PARTICLE_VERT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 position; // texel reference into the state textures

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform sampler2D uPosPrev;
uniform sampler2D uPosCurr;
uniform sampler2D uVel;
uniform sampler2D uSeed;
uniform float uAlpha;
uniform float uTime;

uniform vec4 uKeys[${KEY_SLOTS / 4}];
uniform vec4 uKeyCfgA;    // form A: key axis xyz, travel (world)
uniform vec4 uKeyCfgB;    // form B
uniform float uKeyGlow;

uniform vec4 uRipA[${MAX_RIPPLES}];  // origin xyz, start time
uniform vec4 uRipB[${MAX_RIPPLES}];  // axis xyz, amplitude
uniform vec4 uRipple;               // speed, width, decay, spread
uniform float uRippleDisp;          // 0 under reduced motion (sheen only)
uniform float uSheen;

uniform float uProjScale;  // device px per world unit at distance 1
uniform vec4 uSize;        // world size, jitter, min px, max px
uniform vec4 uLens;        // aperture, focus distance, bokeh cull, depth fade
uniform float uOpacity;
uniform float uGlint;
uniform float uLooseFrac;
uniform vec3 uColor;
uniform vec3 uAccent;
// finish tints per morph slot: case (non-key) and keycap particles
uniform vec3 uCaseTintA;
uniform vec3 uCaseTintB;
uniform vec3 uKeyTintA;
uniform vec3 uKeyTintB;

out vec4 vColor;
out float vBlur;

void main() {
  vec4 p0 = texture(uPosPrev, position);
  vec4 p1 = texture(uPosCurr, position);
  vec3 pos = mix(p0.xyz, p1.xyz, uAlpha);
  float bright = p1.w;
  vec4 vel = texture(uVel, position);
  vec4 seed = texture(uSeed, position);

  // unpack accent / key slot / form slot (see sim.ts)
  float slotB = floor(vel.w / 512.0);
  float rem = vel.w - 512.0 * slotB;
  float kidf = floor(rem / 2.0);
  float accent = rem - 2.0 * kidf;
  int kid = int(kidf) - 1;

  // key depression (render-time: a keycap must not take a second to sink)
  vec4 kc = slotB > 0.5 ? uKeyCfgB : uKeyCfgA;
  if (kid >= 0 && kc.w > 0.0) {
    float q = uKeys[kid / 4][kid - (kid / 4) * 4];
    pos -= kc.xyz * (kc.w * q);
    bright *= 1.0 + uKeyGlow * q;
  }

  // analytic expanding rings (Ricker wavelet, 2-D energy spreading)
  float sheen = 0.0;
  // B.xyz = axis scaled by the form's size, so rings keep their proportions
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 A = uRipA[i];
    vec4 B = uRipB[i];
    float age = uTime - A.w;
    float sc = length(B.xyz);
    if (B.w <= 0.0 || sc < 1e-4 || age < 0.0 || age > uRipple.z * 5.0) continue;
    vec3 ax = B.xyz / sc;
    vec3 rel = pos - A.xyz;
    float along = dot(rel, ax);
    float r = length(rel - along * ax) / sc;
    float u = (r - uRipple.x * age) / uRipple.y;
    float w = (1.0 - u * u) * exp(-0.5 * u * u);
    float h = B.w * exp(-age / uRipple.z) * w * inversesqrt(1.0 + r / uRipple.w);
    pos += ax * (h * sc * uRippleDisp);
    sheen += h;
  }

  vec4 mv = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);

  float base = uSize.x * (1.0 + uSize.y * (seed.w * 2.0 - 1.0)) * uProjScale / depth;
  float coc = uLens.x * uProjScale * abs(depth - uLens.y) / (depth * uLens.y);
  float s = sqrt(base * base + coc * coc);
  float g = (s * s) / max(base * base, 1e-6); // area growth
  // brightness is scattered light (colour); opacity is coverage. Dense but
  // dim surfaces therefore converge to *dim*, like a real occluding wall.
  float alpha = uOpacity * (0.45 + 0.55 * min(bright, 1.0)) / g;
  vBlur = 1.0 - 1.0 / g;

  // energy-conserving stochastic culling of big bokeh sprites
  float keep = min(1.0, uLens.z / g);
  float h = fract(seed.x * 7.13 + seed.y * 91.7 + seed.z * 3.31);
  alpha *= (1.0 - smoothstep(keep * 0.85, keep, h)) / keep;

  // aerial perspective behind the subject
  alpha *= 1.0 - uLens.w * smoothstep(0.0, 4.0, depth - uLens.y);

  // loose motes occasionally catch the light
  float loose = step(seed.z, uLooseFrac);
  float glint = pow(max(sin(uTime * (0.35 + seed.y * 0.5) + seed.x * 40.0), 0.0), 30.0);
  float lift = 1.0 + uGlint * loose * glint * 2.5;

  // sub-pixel sprites fade instead of shimmering
  if (s < uSize.z) {
    alpha *= (s * s) / (uSize.z * uSize.z);
    s = uSize.z;
  }
  s = min(s, uSize.w);

  vec3 tint = kid >= 0 ? (slotB > 0.5 ? uKeyTintB : uKeyTintA) : (slotB > 0.5 ? uCaseTintB : uCaseTintA);
  vec3 col = mix(uColor, uAccent, clamp(accent, 0.0, 1.0)) * tint;
  col *= bright * lift * (1.0 + uSheen * max(sheen, 0.0));
  vColor = vec4(col, clamp(alpha, 0.0, 1.0));
  gl_PointSize = s;
  if (!(alpha >= 0.002) || !(s < 1e4)) { // also rejects NaN
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
  }
}
`;

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
in vec4 vColor;
in float vBlur;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float soft = 1.0 - r2;
  soft *= soft;
  // out of focus: flatter disc with a faint rim, like lens bokeh (energy matched)
  float disc = (1.0 - smoothstep(0.7, 1.0, r2)) * (0.82 + 0.18 * r2) * 0.42;
  float k = mix(soft, disc, vBlur);
  float a = vColor.a * k;
  fragColor = vec4(vColor.rgb * a, a);
}
`;
