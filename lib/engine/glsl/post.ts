/**
 * Restrained, physically-based bloom (Jimenez 2014: 13-tap downsample with
 * a soft-knee prefilter, 9-tap tent upsample) and the final composite:
 * ground + particles (premultiplied) + bloom, vignette on the particle layer
 * only, highlight shoulder, sRGB encode, triangular dither.
 */
export const DOWN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel;       // 1 / source size
uniform vec3 uThreshold;   // threshold, knee, enabled (1 on the first pass)
in vec2 vUv;
out vec4 fragColor;

vec3 tap(vec2 o) { return texture(uSrc, vUv + uTexel * o).rgb; }

void main() {
  vec3 a = tap(vec2(-2.0, 2.0)), b = tap(vec2(0.0, 2.0)), c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0)), e = tap(vec2(0.0)), f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0)), h = tap(vec2(0.0, -2.0)), i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0)), k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0)), m = tap(vec2(1.0, -1.0));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (uThreshold.z > 0.5) {
    float br = max(col.r, max(col.g, col.b));
    float knee = max(uThreshold.y, 1e-4);
    float rq = clamp(br - uThreshold.x + knee, 0.0, 2.0 * knee);
    rq = rq * rq / (4.0 * knee);
    col *= max(rq, br - uThreshold.x) / max(br, 1e-4);
  }
  fragColor = vec4(col, 1.0);
}
`;

export const UP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 o = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * uRadius;
  vec3 s = texture(uSrc, vUv - o.xy).rgb;
  s += texture(uSrc, vUv - o.wy).rgb * 2.0;
  s += texture(uSrc, vUv - o.zy).rgb;
  s += texture(uSrc, vUv + o.zw).rgb * 2.0;
  s += texture(uSrc, vUv).rgb * 4.0;
  s += texture(uSrc, vUv + o.xw).rgb * 2.0;
  s += texture(uSrc, vUv + o.zy).rgb;
  s += texture(uSrc, vUv + o.wy).rgb * 2.0;
  s += texture(uSrc, vUv + o.xy).rgb;
  fragColor = vec4(s / 16.0, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uParticles;
uniform sampler2D uBloom;
uniform vec3 uGround;      // linear
uniform vec4 uGrade;       // vignette, dither (LSB), bloom strength, exposure
uniform vec2 uRes;         // drawing buffer size
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec4 p = texture(uParticles, vUv);
  vec3 bloom = texture(uBloom, vUv).rgb * uGrade.z;
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - uGrade.x * smoothstep(0.35, 1.25, length(q));
  vec3 layer = (p.rgb * uGrade.w + bloom) * vig;
  vec3 col = uGround * (1.0 - clamp(p.a, 0.0, 1.0)) + layer;
  // hue-preserving highlight shoulder above 0.8
  float mx = max(col.r, max(col.g, col.b));
  if (mx > 0.8) col *= (0.8 + 0.2 * (1.0 - exp(-(mx - 0.8) / 0.2))) / mx;
  col = toSrgb(col);
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.31) - 1.0;
  col += n * uGrade.y / 255.0;
  fragColor = vec4(col, 1.0);
}
`;
