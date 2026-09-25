/**
 * Thin GPU plumbing over three.js: a fullscreen triangle, float data
 * textures, the ping-pong MRT simulation targets and the post chain.
 * Every object created here is tracked and disposed by its owner.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  ClampToEdgeWrapping,
  CustomBlending,
  DataTexture,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  Sphere,
  WebGLRenderTarget,
  Vector2,
  Vector3,
  Vector4,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from "three";
import { FULLSCREEN_VERT } from "./glsl/sim";
import { COMPOSITE_FRAG, DOWN_FRAG, UP_FRAG } from "./glsl/post";

export type Uniforms = Record<string, IUniform>;

export function rawMaterial(vertexShader: string, fragmentShader: string, uniforms: Uniforms, extra: Partial<RawShaderMaterial> = {}) {
  const m = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  Object.assign(m, extra);
  return m;
}

export function premultipliedOver(m: RawShaderMaterial) {
  m.transparent = true;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
}

export function additive(m: RawShaderMaterial) {
  m.transparent = true;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneFactor;
}

export function dataTexture(data: Float32Array, w: number, h: number): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export class FullscreenQuad {
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;

  constructor() {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    this.geometry.boundingSphere = new Sphere(new Vector3(), 10);
    this.mesh = new Mesh(this.geometry);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer: WebGLRenderer, material: RawShaderMaterial, target: WebGLRenderTarget | null) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
  }
}

// ---------------------------------------------------------------------------

function stateTarget(w: number, h: number) {
  const rt = new WebGLRenderTarget(w, h, {
    count: 2,
    type: FloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  return rt;
}

/** Ping-pong MRT state: textures[0] = position(+brightness), [1] = velocity(+accent). */
export class StatePair {
  readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
  private cur = 0;

  constructor(readonly w: number, readonly h: number) {
    this.targets = [stateTarget(w, h), stateTarget(w, h)];
  }

  get curr() {
    return this.targets[this.cur];
  }
  get prev() {
    return this.targets[1 - this.cur];
  }
  /** target to write next (the older one) */
  get next() {
    return this.targets[1 - this.cur];
  }
  swap() {
    this.cur = 1 - this.cur;
  }
  setRows(rows: number) {
    for (const t of this.targets) {
      t.viewport.set(0, 0, this.w, rows);
      t.scissor.set(0, 0, this.w, rows);
      t.scissorTest = rows < this.h;
    }
  }
  dispose() {
    for (const t of this.targets) t.dispose();
  }
}

// ---------------------------------------------------------------------------

const LEVELS = 5;

function colorTarget(w: number, h: number) {
  return new WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

/** Particle colour buffer + bloom chain + composite. */
export class Post {
  readonly scene: WebGLRenderTarget;
  private readonly mips: WebGLRenderTarget[] = [];
  readonly down: RawShaderMaterial;
  readonly up: RawShaderMaterial;
  readonly composite: RawShaderMaterial;
  private w = 1;
  private h = 1;

  constructor() {
    this.scene = colorTarget(1, 1);
    for (let i = 0; i < LEVELS; i++) this.mips.push(colorTarget(1, 1));
    this.down = rawMaterial(FULLSCREEN_VERT, DOWN_FRAG, {
      uSrc: { value: null },
      uTexel: { value: new Vector2(1, 1) },
      uThreshold: { value: new Vector3(0.6, 0.3, 0) },
    });
    this.up = rawMaterial(FULLSCREEN_VERT, UP_FRAG, {
      uSrc: { value: null },
      uTexel: { value: new Vector2(1, 1) },
      uRadius: { value: 1 },
    });
    additive(this.up);
    this.composite = rawMaterial(FULLSCREEN_VERT, COMPOSITE_FRAG, {
      uParticles: { value: this.scene.texture },
      uBloom: { value: this.mips[0].texture },
      uGround: { value: new Vector3() },
      uGrade: { value: new Vector4(0.3, 1, 0.3, 1) },
      uRes: { value: new Vector2(1, 1) },
    });
  }

  setSize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.scene.setSize(w, h);
    let mw = w, mh = h;
    for (const m of this.mips) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      m.setSize(mw, mh);
    }
    (this.composite.uniforms.uRes.value as Vector2).set(w, h);
  }

  bloom(renderer: WebGLRenderer, quad: FullscreenQuad, threshold: number, knee: number, radius: number) {
    let src: Texture = this.scene.texture;
    let sw = this.w, sh = this.h;
    const du = this.down.uniforms;
    for (let i = 0; i < LEVELS; i++) {
      du.uSrc.value = src;
      (du.uTexel.value as Vector2).set(1 / sw, 1 / sh);
      (du.uThreshold.value as Vector3).set(threshold, knee, i === 0 ? 1 : 0);
      quad.render(renderer, this.down, this.mips[i]);
      src = this.mips[i].texture;
      sw = this.mips[i].width;
      sh = this.mips[i].height;
    }
    const uu = this.up.uniforms;
    uu.uRadius.value = 0.5 + radius;
    for (let i = LEVELS - 2; i >= 0; i--) {
      const s = this.mips[i + 1];
      uu.uSrc.value = s.texture;
      (uu.uTexel.value as Vector2).set(1 / s.width, 1 / s.height);
      quad.render(renderer, this.up, this.mips[i]);
    }
  }

  dispose() {
    this.scene.dispose();
    for (const m of this.mips) m.dispose();
    this.down.dispose();
    this.up.dispose();
    this.composite.dispose();
  }
}
