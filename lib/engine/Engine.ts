/**
 * MOTE particle engine: owns the WebGL context, the GPGPU simulation, the
 * particle/post passes, input, and the timeline. Client-only.
 *
 * Lifecycle is idempotent: `Engine.create()` builds everything into a fresh
 * <canvas> inside `host`; `dispose()` releases every GPU object, forces the
 * context loss and removes the canvas, so React Strict Mode double-mounts
 * and HMR never leak contexts.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Ray,
  Plane,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type DataTexture,
  type RawShaderMaterial,
} from "three";
import type { Assembly } from "./assign";
import { buildForms, type BuildRequest, type BuildResult } from "./build";
import { readPalette, type Palette } from "./colors";
import { FORM_SPECS, anchorLocal, formPose, keyboardKeyTops, type BuildContext, type FormName, type Layout } from "./forms";
import { INIT_FRAG, SIM_FRAG, FULLSCREEN_VERT } from "./glsl/sim";
import { KEY_SLOTS, MAX_RIPPLES, PARTICLE_FRAG, PARTICLE_VERT } from "./glsl/particles";
import { FullscreenQuad, Post, StatePair, dataTexture, premultipliedOver, rawMaterial } from "./gpu";
import { KEYS, keyUV } from "./layout75";
import { defaultParams, type Params } from "./params";
import { rngFor } from "./random";
import { ANY_KEY_SLOT, HALF_KEY_SLOT, EXPLODED_HEIGHT, EXPLODED_PARTS } from "./shapes/exploded";
import { WAVE } from "./shapes/waveform";
import { SWITCHES, type SwitchCurve } from "./shapes/curve";
import { KEY_PLANE_Y, keyAt } from "./shapes/keyboard";
import { rasterizeWordmark, WORDMARK_WIDTH } from "./shapes/wordmark";
import { LADDER, QualityMonitor, TIERS, TIER_COUNT, pickTier, type TierName } from "./tier";
import { WaveHistory } from "./wave";
import { configStore, keyChannel, releaseChannel, installKeyboard, stationStore, type FinishId, type KeyEvt } from "../bus";
import { BRAND } from "../brand";

export interface EngineOptions {
  host: HTMLElement;
  /** story forms in scroll order (the intro always starts from dust) */
  forms: FormName[];
  seed?: number;
  debug?: boolean;
  shot?: boolean;
  tier?: string | null;
  /** DOM anchors: elements with data-form="<name>" drive the morph from scroll */
  scrollDriven?: boolean;
  signal?: AbortSignal;
}

type Assets = BuildResult;

const FLOW_RMS = 3.96; // RMS |curl| of one octave, measured by scripts/physics-check.mjs
const KEYBOARD_FORMS: FormName[] = ["keyboard", "layout"];
/** finish tints relative to the particle colour: [case, keycaps]; ember is derived from the accent */
const FINISH_TINTS: Record<Exclude<FinishId, "ember">, [number[], number[]]> = {
  chalk: [[1, 1, 1], [1, 1, 1]],
  graphite: [[0.3, 0.3, 0.33], [0.94, 0.94, 0.96]],
};
const CURVE_KEYS: (keyof SwitchCurve)[] = ["F0", "k", "bumpH", "bumpX", "bumpW", "spikeH", "spikeX0", "travel", "actX"];
const TAU = Math.PI * 2;
const FOV = 28;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Critically-damped smoothing (Unity SmoothDamp) with a max speed. */
function smoothDamp(cur: number, target: number, vel: { v: number }, smoothTime: number, maxSpeed: number, dt: number) {
  if (dt <= 0) return cur;
  smoothTime = Math.max(1e-4, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.min(Math.max(change, -maxChange), maxChange);
  const t2 = cur - change;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  let out = t2 + (change + temp) * exp;
  if (target - cur > 0 === out > target) {
    out = target;
    vel.v = (out - target) / dt;
  }
  return out;
}

/**
 * Scroll position at which a section's form is fully shown: centred for
 * sections up to 1.25 viewports tall; taller ones (long copy on phones) are
 * anchored 1/8 viewport in, so their visual-on-top layout still holds.
 * Mirrored by the screenshot scripts (scripts/anchor.mjs).
 */
export function anchorScroll(top: number, height: number, vh: number) {
  return top + Math.min(height - vh, 0.25 * vh) / 2;
}

async function loadGlyphs(): Promise<BuildContext["glyphs"]> {
  await Promise.race([document.fonts.ready, wait(2000)]);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-instrument-sans").trim() || "sans-serif";
  try {
    await Promise.race([document.fonts.load(`560 320px ${family}`), wait(1500)]);
  } catch {
    /* fall back to whatever is available */
  }
  return rasterizeWordmark(BRAND.wordmark, family);
}

/** Builds every form off the main thread; falls back to building inline. */
async function buildAssets(forms: FormName[], N: number, seed: number, signal?: AbortSignal): Promise<Assets | null> {
  const glyphs = forms.includes("wordmark") ? await loadGlyphs() : null;
  if (signal?.aborted) return null;
  const req: BuildRequest = { forms, N, seed, glyphs };
  try {
    return await new Promise<Assets>((resolve, reject) => {
      const worker = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
      const done = () => worker.terminate();
      worker.onmessage = (e: MessageEvent<Assets>) => {
        done();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        done();
        reject(e);
      };
      signal?.addEventListener("abort", () => {
        done();
        reject(new DOMException("aborted", "AbortError"));
      });
      worker.postMessage(req);
    });
  } catch {
    if (signal?.aborted) return null;
    // no module workers (very old browsers, strict CSP): build inline
    await wait(0);
    return buildForms(req, "main");
  }
}

export class Engine {
  readonly params: Params = defaultParams();
  readonly tier: TierName;
  readonly N: number;
  readonly size: number;
  readonly forms: FormName[];
  stats = { fps: 0, frameMs: 0, substeps: 0, active: 0, dpr: 1, buildMs: 0, level: 0 };
  matchStats: Assembly["stats"] = [];
  buildWhere: BuildResult["where"] = "main";

  private readonly opts: EngineOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 120);
  private readonly quad = new FullscreenQuad();
  private readonly state: StatePair;
  private readonly post = new Post();
  private readonly simMat: RawShaderMaterial;
  private readonly initMat: RawShaderMaterial;
  private readonly pointsMat: RawShaderMaterial;
  private readonly points: Points;
  private readonly pointsScene = new Scene();
  private readonly geometry: BufferGeometry;
  private readonly textures: DataTexture[] = [];
  private readonly formPos: DataTexture[] = [];
  private readonly formNrm: DataTexture[] = [];
  private readonly dustIndex: number;
  private readonly monitor = new QualityMonitor();
  private readonly wave: WaveHistory | null;
  private palette: Palette;
  private readonly keyTops = keyboardKeyTops();

  private raf = 0;
  private ready = false;
  private running = false;
  private disposed = false;
  private lastNow = 0;
  private frozen = false;
  private visible = true;
  private onScreen = true;
  private contextLost = false;
  private cleanups: (() => void)[] = [];

  // time
  private simTime = 0;
  private acc = 0;
  private flowClock = 0;
  private introClock = 0;
  private introOverride: number | null = null;
  // morph
  private m = 0;
  private mVel = { v: 0 };
  private morphOverride: number | null = null;
  private anchors: { form: number; y: number }[] = [];
  // layout
  private layout: Layout = { halfW: 3, halfH: 2, aspect: 1.5, wide: 1 };
  private camDist = 8;
  private reduced = false;
  // cursor
  private ndc = new Vector2();
  private cursorActive = false;
  private cursorPresence = 0;
  private cursorWorld = new Vector3();
  private cursorPrev = new Vector3();
  private cursorVel = new Vector3();
  private cursorFresh = true;
  // parallax
  private parYaw = 0;
  private parPitch = 0;
  // keys
  private keyPress = new Float32Array(KEY_SLOTS);
  private keyDown = new Uint8Array(KEY_SLOTS);
  private keyAge = new Float32Array(KEY_SLOTS).fill(10);
  private keyAuto = new Float32Array(KEY_SLOTS); // scripted presses release after this age
  private ripA = new Float32Array(MAX_RIPPLES * 4);
  private ripB = new Float32Array(MAX_RIPPLES * 4);
  private ripNext = 0;
  // scratch
  private readonly xfA = new Matrix4();
  private readonly xfB = new Matrix4();
  private readonly xfD = new Matrix4();
  private readonly tmpV = new Vector3();
  private readonly tmpV2 = new Vector3();
  private readonly fwd = new Vector3();
  private readonly look = new Vector3();
  private levelApplied = -1;
  // DOM callouts pinned to the exploded parts
  private callouts: { el: HTMLElement; y: number; hx: number; w: number; h: number; left: number; top: number }[] = [];
  // generic DOM labels pinned to points of a form (data-anchor="form:name")
  private anchorEls: { el: HTMLElement; form: FormName; name: string; idx: number }[] = [];
  private readonly anchorP = new Vector3();
  // configuration-driven state (eased)
  private curve: SwitchCurve = { ...SWITCHES.linear };
  private caseTint = new Vector3(1, 1, 1);
  private keyTint = new Vector3(1, 1, 1);
  private readonly tintTarget = [new Vector3(), new Vector3()];
  private coilPhase = 0;
  private coilPulse = new Vector4(-1, -1, -1, -1);
  private coilNext = 0;
  private fieldAnchorY = Infinity;
  // tap / click to press a key
  private touchStart: { x: number; y: number; t: number } | null = null;
  private readonly ray = new Ray();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly inv = new Matrix4();
  private readonly calloutP = new Vector3();
  private calloutBound: HTMLElement | null = null;

  // ------------------------------------------------------------------------

  static async create(opts: EngineOptions): Promise<Engine | null> {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    let renderer: WebGLRenderer | null = null;
    const bail = () => {
      renderer?.dispose();
      renderer?.forceContextLoss();
      canvas.remove();
      return null;
    };
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      return bail();
    }
    if (!renderer.extensions.has("EXT_color_buffer_float")) return bail();
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const tier = pickTier(gl, opts.tier);
    const size = TIERS[tier].size;
    // let the browser paint the DOM first; shapes are built in yielding chunks
    await wait(0);
    if (opts.signal?.aborted) return bail();
    const assets = await buildAssets(opts.forms, size * size, opts.seed ?? 7, opts.signal);
    if (!assets || opts.signal?.aborted) return bail();
    const engine = new Engine(opts, canvas, renderer, tier, assets);
    await engine.warmup();
    if (opts.signal?.aborted) {
      engine.dispose();
      return null;
    }
    opts.host.appendChild(canvas);
    engine.ready = true;
    engine.syncRunning();
    if (opts.debug || opts.shot) engine.installHooks();
    return engine;
  }

  private constructor(opts: EngineOptions, canvas: HTMLCanvasElement, renderer: WebGLRenderer, tier: TierName, assets: Assets) {
    this.opts = opts;
    this.canvas = canvas;
    this.renderer = renderer;
    this.forms = opts.forms;
    this.tier = tier;
    this.size = TIERS[tier].size;
    this.N = this.size * this.size;
    this.monitor.enabled = !opts.shot;
    this.palette = readPalette();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.matchStats = assets.stats;
    this.stats.buildMs = assets.buildMs;
    this.buildWhere = assets.where;
    const seed = opts.seed ?? 7;
    const asm = assets;
    const names = assets.names;
    this.dustIndex = names.length - 1;

    const S = this.size;
    for (let i = 0; i < names.length; i++) {
      const p = dataTexture(asm.pos[i], S, S);
      const n = dataTexture(asm.nrm[i], S, S);
      this.formPos.push(p);
      this.formNrm.push(n);
      this.textures.push(p, n);
    }
    const seedRng = rngFor(seed, "particle-seeds");
    const seeds = new Float32Array(this.N * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = seedRng();
    const seedTex = dataTexture(seeds, S, S);
    this.textures.push(seedTex);

    this.wave = opts.forms.includes("waveform") ? new WaveHistory(rngFor(seed, "wave")) : null;
    const waveTex = this.wave?.tex ?? dataTexture(new Float32Array(16), 2, 2);
    if (!this.wave) this.textures.push(waveTex as DataTexture);

    // ---- simulation ------------------------------------------------------
    this.state = new StatePair(S, S);
    this.simMat = rawMaterial(FULLSCREEN_VERT, SIM_FRAG, {
      uRes: { value: new Vector2(S, S) },
      uPos: { value: null },
      uVel: { value: null },
      uSeed: { value: seedTex },
      uPosA: { value: this.formPos[0] },
      uNrmA: { value: this.formNrm[0] },
      uPosB: { value: this.formPos[0] },
      uNrmB: { value: this.formNrm[0] },
      uPosD: { value: this.formPos[this.dustIndex] },
      uKindA: { value: 0 },
      uKindB: { value: 0 },
      uXfA: { value: this.xfA },
      uXfB: { value: this.xfB },
      uXfD: { value: this.xfD },
      uShapeA: { value: new Vector2(1, 1) },
      uShapeB: { value: new Vector2(1, 1) },
      uShapeD: { value: new Vector2(FORM_SPECS.dust.stiffness, FORM_SPECS.dust.wind) },
      uMix: { value: 0 },
      uIntro: { value: 0 },
      uMorph: { value: new Vector4() },
      uIntroCfg: { value: new Vector2() },
      uTime: { value: 0 },
      uDt: { value: 1 / 120 },
      uSpring: { value: new Vector3() },
      uLoose: { value: new Vector2() },
      uFlow: { value: new Vector4() },
      uFlowPhase: { value: new Vector4() },
      uTransitBoost: { value: 0 },
      uRayO: { value: new Vector3() },
      uRayD: { value: new Vector3(0, 0, -1) },
      uCursor: { value: new Vector4() },
      uCursorLift: { value: 0 },
      uCursorVel: { value: new Vector3() },
      uLimits: { value: new Vector2() },
      uCamPos: { value: new Vector3() },
      uBackface: { value: 0.8 },
      uWaveTex: { value: waveTex },
      uWave: { value: new Vector4(WAVE.width, WAVE.depth, WAVE.height, WAVE.thickness) },
      uWave2: { value: new Vector4(WAVE.lines, WAVE.rowsPerLine, 0, WAVE.rows) },
      uField: { value: new Vector4(0.09, 0.33, 0.07, 0) },
      uCurve: { value: new Vector4() },
      uCurve2: { value: new Vector4(0.42, 34, 3.5, 4) },
      uCurve3: { value: new Vector4(2, 0, 0, 0) },
      uCoil: { value: new Vector4() },
      uCoilPulse: { value: this.coilPulse },
    });
    this.initMat = rawMaterial(FULLSCREEN_VERT, INIT_FRAG, {
      uRes: { value: new Vector2(S, S) },
      uPosD: { value: this.formPos[this.dustIndex] },
      uXfD: { value: this.xfD },
    });

    // ---- particles -------------------------------------------------------
    this.geometry = new BufferGeometry();
    const refs = new Float32Array(this.N * 2);
    for (let i = 0; i < this.N; i++) {
      refs[i * 2] = ((i % S) + 0.5) / S;
      refs[i * 2 + 1] = (Math.floor(i / S) + 0.5) / S;
    }
    this.geometry.setAttribute("position", new BufferAttribute(refs, 2));
    // refs are texel coordinates, not positions: never let three bound them
    this.geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.pointsMat = rawMaterial(PARTICLE_VERT, PARTICLE_FRAG, {
      uPosPrev: { value: null },
      uPosCurr: { value: null },
      uVel: { value: null },
      uSeed: { value: seedTex },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uKeys: { value: this.keyPress },
      uKeyCfgA: { value: new Vector4() },
      uKeyCfgB: { value: new Vector4() },
      uKeyGlow: { value: 0 },
      uRipA: { value: this.ripA },
      uRipB: { value: this.ripB },
      uRipple: { value: new Vector4() },
      uRippleDisp: { value: 1 },
      uSheen: { value: 0 },
      uProjScale: { value: 1 },
      uSize: { value: new Vector4() },
      uLens: { value: new Vector4() },
      uOpacity: { value: 1 },
      uGlint: { value: 0 },
      uLooseFrac: { value: 0 },
      uCaseTintA: { value: new Vector3(1, 1, 1) },
      uCaseTintB: { value: new Vector3(1, 1, 1) },
      uKeyTintA: { value: new Vector3(1, 1, 1) },
      uKeyTintB: { value: new Vector3(1, 1, 1) },
      uColor: { value: new Vector3(...this.palette.particle) },
      uAccent: { value: new Vector3(...this.palette.accent) },
    });
    premultipliedOver(this.pointsMat);
    this.points = new Points(this.geometry, this.pointsMat);
    this.points.frustumCulled = false;
    this.pointsScene.add(this.points);
    (this.post.composite.uniforms.uGround.value as Vector3).set(...this.palette.ground);

    this.bindEvents();
    this.onResize();
    this.computeMorph(0, true);
    this.updatePoses(0);
    this.initState();
    if (this.reduced) this.introClock = 1e6;
  }

  // ------------------------------------------------------------------------
  // lifecycle

  /**
   * Spread first-frame work over several frames: compile every program in
   * parallel (KHR_parallel_shader_compile via compileAsync) and upload the
   * ~20 MB of float textures one per frame, instead of one long task.
   */
  private async warmup() {
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const scene = new Scene();
    const mats = [this.simMat, this.initMat, this.post.down, this.post.up, this.post.composite];
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    geo.boundingSphere = new Sphere(new Vector3(), 10);
    for (const m of mats) {
      const mesh = new Mesh(geo, m);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    scene.add(this.points);
    try {
      await this.renderer.compileAsync(scene, this.camera);
    } catch {
      /* fall back to compiling on first use */
    }
    this.pointsScene.add(this.points);
    geo.dispose();
    for (const t of [...this.formPos, ...this.formNrm, ...this.textures]) {
      if (this.disposed) return;
      this.renderer.initTexture(t);
      await nextFrame();
    }
  }

  private start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private syncRunning() {
    const want = this.ready && this.visible && this.onScreen && !this.contextLost && !this.disposed;
    if (want && !this.running) this.start();
    else if (!want && this.running) this.stop();
  }

  get isRunning() {
    return this.running;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.simMat.dispose();
    this.initMat.dispose();
    this.pointsMat.dispose();
    this.geometry.dispose();
    for (const t of this.textures) t.dispose();
    this.wave?.dispose();
    this.state.dispose();
    this.post.dispose();
    this.quad.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    const w = window as unknown as { __mote?: { engine?: Engine } };
    if (w.__mote?.engine === this) delete w.__mote;
  }

  // ------------------------------------------------------------------------
  // events

  private listen(target: Window | Document, type: string, fn: (e: never) => void, opts: AddEventListenerOptions = { passive: true }) {
    target.addEventListener(type, fn as EventListener, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private bindEvents() {
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.opts.host);
    this.cleanups.push(() => ro.disconnect());
    // section anchors move when fonts load / content reflows
    const ro2 = new ResizeObserver(() => this.measureAnchors());
    ro2.observe(document.body);
    this.cleanups.push(() => ro2.disconnect());

    const io = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      this.syncRunning();
    });
    io.observe(this.opts.host);
    this.cleanups.push(() => io.disconnect());

    this.listen(document, "visibilitychange", () => {
      this.visible = document.visibilityState === "visible";
      this.lastNow = performance.now();
      this.syncRunning();
    });

    this.listen(window, "pointermove", (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      this.setPointer(e.clientX, e.clientY);
    });
    this.listen(document, "pointerleave", () => (this.cursorActive = false));
    this.listen(window, "blur", () => (this.cursorActive = false));
    this.listen(window, "touchstart", (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) {
        this.setPointer(t.clientX, t.clientY, true);
        this.touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
      }
    });
    this.listen(window, "touchmove", (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) this.setPointer(t.clientX, t.clientY);
    });
    this.listen(window, "touchend", (e: TouchEvent) => {
      this.cursorActive = false;
      const s = this.touchStart, t = e.changedTouches[0];
      this.touchStart = null;
      if (s && t && performance.now() - s.t < 320 && Math.hypot(t.clientX - s.x, t.clientY - s.y) < 12 && !this.interactive(e.target)) {
        this.tapKey(t.clientX, t.clientY);
      }
    });
    this.listen(window, "pointerdown", (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0 || this.interactive(e.target)) return;
      this.tapKey(e.clientX, e.clientY);
    });
    this.listen(window, "touchcancel", () => (this.cursorActive = false));

    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => {
      this.reduced = mq.matches;
      if (this.reduced) this.introClock = 1e6;
    };
    mq.addEventListener("change", onMq);
    this.cleanups.push(() => mq.removeEventListener("change", onMq));

    const onLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.syncRunning();
    };
    // simplest correct recovery: the React host rebuilds the engine
    const onRestored = () => window.dispatchEvent(new CustomEvent("mote:context-restored"));
    this.canvas.addEventListener("webglcontextlost", onLost);
    this.canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      this.canvas.removeEventListener("webglcontextlost", onLost);
      this.canvas.removeEventListener("webglcontextrestored", onRestored);
    });

    this.cleanups.push(installKeyboard());
    this.cleanups.push(keyChannel.on((e) => this.onKey(e)));
    this.cleanups.push(releaseChannel.on(() => this.keyDown.fill(0)));
  }

  private setPointer(x: number, y: number, fresh = false) {
    const w = window.innerWidth, h = window.innerHeight;
    this.ndc.set((x / w) * 2 - 1, -((y / h) * 2 - 1));
    if (!this.cursorActive || fresh) this.cursorFresh = true;
    this.cursorActive = true;
  }

  private onResize() {
    const w = Math.max(1, this.opts.host.clientWidth);
    const h = Math.max(1, this.opts.host.clientHeight);
    const [, dprFactor] = LADDER[this.monitor.level];
    const dpr = Math.min(window.devicePixelRatio || 1, TIERS[this.tier].dpr) * dprFactor;
    this.stats.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const bw = this.renderer.domElement.width, bh = this.renderer.domElement.height;
    this.post.setSize(bw, bh);
    const aspect = w / h;
    const wide = smoothstep(0.62, 1.45, aspect);
    const t = Math.tan(((FOV / 2) * Math.PI) / 180);
    const frameW = 4.0 + (5.6 - 4.0) * wide;
    const frameH = 3.4;
    this.camDist = Math.max(frameW / (2 * t * aspect), frameH / (2 * t));
    this.layout = { halfH: this.camDist * t, halfW: this.camDist * t * aspect, aspect, wide };
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.pointsMat.uniforms.uProjScale.value = bh / (2 * t);
    this.measureAnchors();
  }

  private measureCallouts() {
    this.callouts = [];
    this.calloutBound = document.querySelector<HTMLElement>("[data-callout-bound]");
    for (const el of document.querySelectorAll<HTMLElement>("[data-callout]")) {
      const part = EXPLODED_PARTS.find((p) => p.name === el.dataset.callout);
      const text = el.firstElementChild as HTMLElement | null;
      if (part) this.callouts.push({ el, y: part.y, hx: part.hx, w: text?.offsetWidth ?? 0, h: el.offsetHeight, left: 0, top: 0 });
    }
  }

  /**
   * Project each exploded part and pin its label on a common column to the
   * left of the model, with a leader line running to the part's near edge
   * (the classic technical-drawing layout). Labels follow the model's sway.
   */
  private updateCallouts() {
    if (!this.callouts.length) return;
    const idx = this.forms.indexOf("exploded");
    const near = idx < 0 ? 0 : 1 - Math.min(Math.abs(this.m - idx) / 0.22, 1);
    const show = this.layout.wide > 0.5 && near > 0.001;
    if (!show) {
      for (const c of this.callouts) if (c.el.style.opacity !== "0") c.el.style.opacity = "0";
      return;
    }
    const pose = Math.floor(this.m) === idx ? this.xfA : this.xfB;
    const W = this.opts.host.clientWidth, H = this.opts.host.clientHeight;
    const p = this.calloutP;
    let col = Infinity;
    for (const c of this.callouts) {
      let minX = Infinity, sumY = 0;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          p.set(sx * c.hx, c.y, sz * c.hx).applyMatrix4(pose).project(this.camera);
          const x = (p.x * 0.5 + 0.5) * W;
          if (x < minX) minX = x;
          sumY += (-p.y * 0.5 + 0.5) * H;
        }
      }
      c.left = minX;
      c.top = sumY / 4;
      col = Math.min(col, minX);
    }
    col -= 48;
    // never draw labels over the copy column (medium widths bring them close)
    const widest = this.callouts.reduce((m, c) => Math.max(m, c.w), 0);
    const bound = this.calloutBound ? this.calloutBound.getBoundingClientRect().right + 24 : -Infinity;
    const room = Math.min(Math.max((col - 12 - widest - bound) / 40, 0), 1);
    const k = near * room;
    const alpha = (k * k * (3 - 2 * k)).toFixed(3);
    for (const c of this.callouts) {
      const lead = Math.max(c.left - 12 - col, 8);
      c.el.style.transform = `translate3d(${(col - c.w - 12).toFixed(1)}px, ${(c.top - c.h / 2).toFixed(1)}px, 0)`;
      c.el.style.setProperty("--lead", `${lead.toFixed(1)}px`);
      c.el.style.opacity = alpha;
    }
  }

  private measureAnchorEls() {
    this.anchorEls = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-anchor]")) {
      const [form, name] = (el.dataset.anchor ?? "").split(":") as [FormName, string];
      const idx = this.forms.indexOf(form);
      if (idx >= 0 && name) this.anchorEls.push({ el, form, name, idx });
    }
    const field = document.querySelector<HTMLElement>('[data-form="field"]');
    this.fieldAnchorY = field ? field.getBoundingClientRect().top + window.scrollY : Infinity;
  }

  /** Position every [data-anchor] label on its projected point; fade with the form. */
  private updateAnchorEls() {
    if (!this.anchorEls.length) return;
    const W = this.opts.host.clientWidth, H = this.opts.host.clientHeight;
    const p = this.anchorP;
    for (const a of this.anchorEls) {
      const near = 1 - Math.min(Math.abs(this.m - a.idx) / 0.2, 1);
      if (near <= 0.001 || !anchorLocal(a.form, a.name, this.curve, p)) {
        if (a.el.style.opacity !== "0") a.el.style.opacity = "0";
        continue;
      }
      const pose = Math.floor(this.m) === a.idx ? this.xfA : this.xfB;
      p.applyMatrix4(pose).project(this.camera);
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      a.el.style.opacity = (near * near * (3 - 2 * near)).toFixed(3);
    }
  }

  private measureAnchors() {
    this.measureCallouts();
    this.measureAnchorEls();
    if (!this.opts.scrollDriven) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-form]"));
    const vh = window.innerHeight;
    this.anchors = els
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        return { form: this.forms.indexOf(el.dataset.form as FormName), y: anchorScroll(top, r.height, vh) };
      })
      .filter((a) => a.form >= 0)
      .sort((a, b) => a.y - b.y);
  }

  // ------------------------------------------------------------------------
  // keys & ripples

  private onKey(e: KeyEvt) {
    if (e.index >= 0 && e.index < KEY_SLOTS) {
      if (e.down) {
        this.keyDown[e.index] = 1;
        if (!e.repeat) this.keyAge[e.index] = 0;
      } else this.keyDown[e.index] = 0;
    }
    if (e.down && !e.repeat) this.react(e.index, e.code === "Space");
  }

  private interactive(target: EventTarget | null) {
    return target instanceof Element && !!target.closest("a, button, input, textarea, select, label, summary, [role='button'], [data-no-tap]");
  }

  /**
   * Tap or click a particle keycap to press it: the ray from the camera is
   * taken into the keyboard's local frame and intersected with the key plane.
   * The press goes through the shared key channel, so the sound, the hint
   * and the GPU all answer exactly as they do to a physical key.
   */
  private tapKey(x: number, y: number) {
    const fi = Math.min(Math.max(Math.round(this.m), 0), this.forms.length - 1);
    if (!KEYBOARD_FORMS.includes(this.forms[fi]) || Math.abs(this.m - fi) > 0.15) return;
    const pose = fi === Math.floor(this.m) ? this.xfA : this.xfB;
    const w = window.innerWidth, h = window.innerHeight;
    const o = this.tmpV.copy(this.camera.position);
    const d = this.tmpV2.set((x / w) * 2 - 1, -((y / h) * 2 - 1), 0.5).unproject(this.camera).sub(o).normalize();
    this.inv.copy(pose).invert();
    this.ray.set(o, d).applyMatrix4(this.inv);
    this.plane.constant = -KEY_PLANE_Y;
    const hit = this.ray.intersectPlane(this.plane, this.anchorP);
    if (!hit) return;
    const i = keyAt(hit.x, hit.z);
    if (i < 0) return;
    const k = KEYS[i];
    const evt = { code: k.code, index: i, label: k.label, repeat: false, time: performance.now() };
    keyChannel.emit({ ...evt, down: true });
    setTimeout(() => keyChannel.emit({ ...evt, down: false, time: performance.now() }), 140);
  }

  /** the current form answers a keystroke: a ring, a waveform packet… */
  private react(keyIndex: number, space: boolean) {
    const fi = Math.min(Math.max(Math.round(this.m), 0), this.forms.length - 1);
    const name = this.forms[fi];
    const pose = fi === Math.floor(this.m) ? this.xfA : this.xfB;
    const scale = this.tmpV2.setFromMatrixScale(pose).x;
    const [ku, kv] = keyIndex >= 0 ? keyUV(keyIndex) : [0.5, 0.5];
    const o = this.tmpV;
    const axis = this.tmpV2;
    let gain = space ? 1.35 : 1;
    switch (name) {
      case "keyboard":
      case "layout":
        if (keyIndex >= 0) o.fromArray(this.keyTops, keyIndex * 3);
        else o.set(0, 0, 0);
        o.applyMatrix4(pose);
        axis.set(0, 1, 0).transformDirection(pose);
        break;
      case "exploded":
        o.set(0, EXPLODED_HEIGHT / 2, 0).applyMatrix4(pose);
        axis.copy(this.camera.position).sub(o).normalize();
        gain *= 0.6;
        break;
      case "wordmark": {
        const hgt = 1.3; // approx glyph height (local)
        o.set((ku - 0.5) * WORDMARK_WIDTH, (0.5 - kv) * hgt, 0).applyMatrix4(pose);
        axis.set(0, 0, 1).transformDirection(pose);
        break;
      }
      case "field":
        o.set((ku - 0.5) * 9, 0, -1.5 - kv * 3).applyMatrix4(pose);
        axis.set(0, 1, 0).transformDirection(pose);
        gain *= 1.3;
        break;
      case "waveform":
        this.wave?.hit(ku, space ? 1.25 : 1, space);
        return;
      case "coil":
        // the keystroke travels down the cable, from the keyboard to the plug
        this.coilPulse.setComponent(this.coilNext, this.simTime + this.acc);
        this.coilNext = (this.coilNext + 1) % 4;
        return;
      default:
        // the switch chart answers through the bead (any-key press) instead
        return;
    }
    const i = this.ripNext;
    this.ripNext = (this.ripNext + 1) % MAX_RIPPLES;
    const tNow = this.simTime + this.acc;
    this.ripA[i * 4] = o.x;
    this.ripA[i * 4 + 1] = o.y;
    this.ripA[i * 4 + 2] = o.z;
    this.ripA[i * 4 + 3] = tNow;
    this.ripB[i * 4] = axis.x * scale;
    this.ripB[i * 4 + 1] = axis.y * scale;
    this.ripB[i * 4 + 2] = axis.z * scale;
    this.ripB[i * 4 + 3] = this.params.ripple.amplitude * gain;
  }

  // ------------------------------------------------------------------------
  // per-frame

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const real = Math.min(Math.max((now - this.lastNow) / 1000, 0), this.params.sim.maxFrameDt);
    this.lastNow = now;
    const dt = this.frozen ? 0 : real * this.params.sim.timeScale;
    this.update(dt, real);
    this.simulate(dt);
    this.render();
    this.trackPerf(real);
  };

  private trackPerf(real: number) {
    if (real > 0) {
      this.stats.frameMs = this.stats.frameMs * 0.9 + real * 1000 * 0.1;
      this.stats.fps = 1000 / Math.max(this.stats.frameMs, 1e-3);
    }
    this.monitor.sample(real);
    if (this.levelApplied !== this.monitor.level) this.applyLevel();
  }

  private applyLevel() {
    this.levelApplied = this.monitor.level;
    this.stats.level = this.monitor.level;
    const [quarters] = LADDER[this.monitor.level];
    const rows = (this.size / TIER_COUNT) * quarters;
    this.state.setRows(rows);
    this.geometry.setDrawRange(0, rows * this.size);
    this.stats.active = rows * this.size;
    this.onResize();
  }

  private computeMorph(dt: number, snap = false) {
    let target = 0;
    if (this.morphOverride !== null) target = this.morphOverride;
    else if (this.opts.scrollDriven && this.anchors.length) {
      const y = window.scrollY;
      const A = this.anchors;
      const { holdOut, holdIn } = this.params.morph;
      if (y <= A[0].y) target = A[0].form;
      else if (y >= A[A.length - 1].y) target = A[A.length - 1].form;
      else {
        for (let i = 0; i < A.length - 1; i++) {
          if (y >= A[i].y && y <= A[i + 1].y) {
            const span = A[i + 1].y - A[i].y;
            // leave early, arrive early: the next form is settled before its copy is
            const t = smoothstep(A[i].y + span * holdOut, A[i + 1].y - span * holdIn, y);
            target = A[i].form + (A[i + 1].form - A[i].form) * t;
            break;
          }
        }
      }
    }
    target = Math.min(Math.max(target, 0), this.forms.length - 1);
    if (snap) {
      this.m = target;
      this.mVel.v = 0;
    } else {
      this.m = smoothDamp(this.m, target, this.mVel, this.params.morph.smoothing, this.params.morph.maxRate, dt);
    }
    stationStore.set(Math.round(this.m));
  }

  private slots() {
    const a = Math.min(Math.floor(this.m), this.forms.length - 1);
    const b = Math.min(a + 1, this.forms.length - 1);
    return { a, b, mix: b === a ? 0 : this.m - a };
  }

  private updatePoses(time: number) {
    const { a, b } = this.slots();
    formPose(this.forms[a], this.layout, time, this.xfA);
    formPose(this.forms[b], this.layout, time, this.xfB);
    formPose("dust", this.layout, time, this.xfD);
  }

  private keyCfg(formIndex: number, pose: Matrix4, weight: number, out: Vector4) {
    const spec = FORM_SPECS[this.forms[formIndex]];
    if (!spec.keyTravel) return out.set(0, 1, 0, 0);
    const s = this.tmpV2.setFromMatrixScale(pose).x;
    this.tmpV.set(0, 1, 0).transformDirection(pose);
    return out.set(this.tmpV.x, this.tmpV.y, this.tmpV.z, spec.keyTravel * this.params.keys.travel / 0.04 * s * weight);
  }

  private update(dt: number, real: number) {
    const P = this.params;
    // intro
    if (!this.reduced) this.introClock += dt;
    const intro = this.introOverride ?? Math.min(Math.max((this.introClock - P.intro.delay) / P.intro.duration, 0), 1);

    // morph
    this.computeMorph(dt);
    const { a, b, mix } = this.slots();
    const time = this.simTime + this.acc;
    this.updatePoses(time);

    // camera: layout distance + slow parallax + breathing
    const reduced = this.reduced;
    const targetYaw = reduced || !this.cursorActive ? 0 : this.ndc.x * P.parallax.yaw;
    const targetPitch = reduced || !this.cursorActive ? 0 : this.ndc.y * P.parallax.pitch;
    const kPar = 1 - Math.exp(-dt / Math.max(P.parallax.smoothing, 1e-3));
    this.parYaw += (targetYaw - this.parYaw) * kPar;
    this.parPitch += (targetPitch - this.parPitch) * kPar;
    const breathe = reduced ? 0 : P.parallax.breathe;
    const yaw = ((this.parYaw + breathe * Math.sin((time * TAU) / 23)) * Math.PI) / 180;
    const pitch = ((this.parPitch + breathe * 0.6 * Math.sin((time * TAU) / 31 + 1.3)) * Math.PI) / 180;
    this.look.set(0, 0, 0);
    this.camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * this.camDist,
      Math.sin(pitch) * this.camDist,
      Math.cos(yaw) * Math.cos(pitch) * this.camDist,
    );
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();

    // cursor: the field follows the air — a resting cursor makes a faint
    // dent, a moving one stirs (presence scales with smoothed cursor speed)
    const stir = P.cursor.still + (1 - P.cursor.still) * smoothstep(0.02, P.cursor.stirSpeed, this.cursorVel.length());
    const presenceTarget = reduced || !this.cursorActive ? 0 : stir;
    const kc = 1 - Math.exp(-(dt > 0 ? dt : real) / Math.max(P.cursor.fade, 1e-3));
    this.cursorPresence += (presenceTarget - this.cursorPresence) * kc;
    const rayO = this.simMat.uniforms.uRayO.value as Vector3;
    const rayD = this.simMat.uniforms.uRayD.value as Vector3;
    rayO.copy(this.camera.position);
    rayD.set(this.ndc.x, this.ndc.y, 0.5).unproject(this.camera).sub(rayO).normalize();
    this.camera.getWorldDirection(this.fwd);
    const denom = rayD.dot(this.fwd);
    if (Math.abs(denom) > 1e-4) {
      const tt = this.tmpV.copy(this.look).sub(rayO).dot(this.fwd) / denom;
      this.cursorWorld.copy(rayD).multiplyScalar(tt).add(rayO);
    }
    if (this.cursorFresh) {
      this.cursorPrev.copy(this.cursorWorld);
      this.cursorVel.set(0, 0, 0);
      this.cursorFresh = false;
    } else if (dt > 0) {
      const inst = this.tmpV.copy(this.cursorWorld).sub(this.cursorPrev).divideScalar(dt);
      if (inst.length() > 5) inst.setLength(5);
      const kv = 1 - Math.exp(-dt / Math.max(P.cursor.smoothing, 1e-3));
      this.cursorVel.lerp(inst, kv);
      this.cursorPrev.copy(this.cursorWorld);
    }

    // keys (+ the "any key" slots the exploded switch answers to)
    const kDown = 1 - Math.exp(-dt / P.keys.pressTime);
    const kUp = 1 - Math.exp(-dt / P.keys.releaseTime);
    let any = 0;
    for (let i = 0; i < KEYS.length; i++) {
      this.keyAge[i] += dt;
      if (this.keyAuto[i] > 0 && this.keyAge[i] >= this.keyAuto[i]) {
        this.keyDown[i] = 0;
        this.keyAuto[i] = 0;
      }
      const target = this.keyDown[i] || this.keyAge[i] < P.keys.minHold ? 1 : 0;
      const q = this.keyPress[i];
      this.keyPress[i] = q + (target - q) * (target > q ? kDown : kUp);
      any = Math.max(any, this.keyPress[i]);
    }
    this.keyPress[ANY_KEY_SLOT] = any;
    this.keyPress[HALF_KEY_SLOT] = any * 0.5;

    // waveform history (only uploaded while the ridgeline is near)
    if (this.wave) {
      const wi = this.forms.indexOf("waveform");
      this.wave.update(dt);
      if (Math.abs(this.m - wi) < 1.2) this.wave.flush();
      (this.simMat.uniforms.uWave2.value as Vector4).z = this.wave.head - 1;
    }

    // configuration: the switch reshapes the chart, the finish tints the board
    const cfg = configStore.get();
    const kCfg = 1 - Math.exp(-dt / 0.28);
    const target = SWITCHES[cfg.switch];
    for (const key of CURVE_KEYS) this.curve[key] += (target[key] - this.curve[key]) * kCfg;
    const [ct, kt] = this.tintTarget;
    if (cfg.finish === "ember") {
      const acc = this.palette.accent, pc = this.palette.particle;
      ct.set(Math.min((acc[0] / pc[0]) * 1.15, 1), Math.min((acc[1] / pc[1]) * 1.15, 1), Math.min((acc[2] / pc[2]) * 1.15, 1));
      kt.set(1, 1, 1);
    } else {
      ct.fromArray(FINISH_TINTS[cfg.finish][0]);
      kt.fromArray(FINISH_TINTS[cfg.finish][1]);
    }
    const kTint = 1 - Math.exp(-dt / 0.35);
    this.caseTint.lerp(ct, kTint);
    this.keyTint.lerp(kt, kTint);
    this.coilPhase = (this.coilPhase + dt * (reduced ? 0.05 : 0.32)) % (Math.PI * 2000);
    this.layout.fieldDrift = Math.max(0, window.scrollY - this.fieldAnchorY) / Math.max(window.innerHeight, 1);

    // ---- uniforms -------------------------------------------------------
    const su = this.simMat.uniforms;
    const c = this.curve;
    (su.uCurve.value as Vector4).set(c.F0, c.k, c.bumpH, c.bumpX);
    (su.uCurve2.value as Vector4).set(c.bumpW, c.spikeH, c.spikeX0, c.travel);
    (su.uCurve3.value as Vector4).set(c.actX, this.keyPress[ANY_KEY_SLOT], 0, 0);
    (su.uCoil.value as Vector4).set(this.coilPhase, 0, 0, 0);
    const specA = FORM_SPECS[this.forms[a]], specB = FORM_SPECS[this.forms[b]];
    su.uPosA.value = this.formPos[a];
    su.uNrmA.value = this.formNrm[a];
    su.uPosB.value = this.formPos[b];
    su.uNrmB.value = this.formNrm[b];
    su.uKindA.value = specA.kind;
    su.uKindB.value = specB.kind;
    (su.uShapeA.value as Vector2).set(specA.stiffness, specA.wind);
    (su.uShapeB.value as Vector2).set(specB.stiffness, specB.wind);
    su.uMix.value = mix;
    su.uIntro.value = reduced ? 1 : intro;
    (su.uMorph.value as Vector4).set(P.morph.window, P.morph.jitter, P.morph.arc, reduced ? 1 : 0);
    (su.uIntroCfg.value as Vector2).set(P.intro.window, P.morph.jitter);
    const w0 = TAU * P.spring.frequency;
    (su.uSpring.value as Vector3).set(w0 * w0, P.spring.damping, P.spring.massJitter);
    (su.uLoose.value as Vector2).set(P.spring.looseFraction, P.spring.looseStiffness);
    const windScale = reduced ? 0.15 : 1;
    (su.uFlow.value as Vector4).set((P.flow.speed * windScale) / (FLOW_RMS * Math.sqrt(1 + P.flow.octave2 * P.flow.octave2)), P.flow.frequency, P.flow.octave2, P.flow.coupling);
    // wind evolves along circles in noise space: continuous and exactly periodic
    this.flowClock = (this.flowClock + dt * P.flow.evolution) % (TAU * 40);
    const R1 = 40, ph = this.flowClock / R1;
    (su.uFlowPhase.value as Vector4).set(R1 * Math.cos(ph), R1 * Math.sin(ph), 23 + R1 * Math.cos(-ph * 1.7 + 2), 11 + R1 * Math.sin(-ph * 1.7 + 2));
    su.uTransitBoost.value = reduced ? 0 : P.flow.transitBoost;
    const pres = this.cursorPresence;
    (su.uCursor.value as Vector4).set(P.cursor.radius, P.cursor.strength * pres, P.cursor.wake * pres, P.cursor.swirl * pres);
    su.uCursorLift.value = P.cursor.lift * pres;
    (su.uCursorVel.value as Vector3).copy(this.cursorVel);
    // limits are "per frame height": portrait layouts pull the camera back
    // and scale the dust up, so absolute limits would slow the intro there
    const fs = this.layout.halfH / 1.75;
    (su.uLimits.value as Vector2).set(P.limits.maxSpeed * fs, P.limits.maxAccel * fs);
    (su.uCamPos.value as Vector3).copy(this.camera.position);
    su.uBackface.value = P.render.backface;

    const pu = this.pointsMat.uniforms;
    const introW = smoothstep(0.6, 1, intro);
    this.keyCfg(a, this.xfA, introW, pu.uKeyCfgA.value as Vector4);
    this.keyCfg(b, this.xfB, introW, pu.uKeyCfgB.value as Vector4);
    pu.uKeyGlow.value = P.keys.glow;
    (pu.uRipple.value as Vector4).set(P.ripple.speed, P.ripple.width, P.ripple.decay, P.ripple.spread);
    pu.uRippleDisp.value = reduced ? 0 : 1;
    pu.uSheen.value = P.ripple.sheen;
    const [quarters] = LADDER[this.monitor.level];
    const sizeComp = Math.pow(TIER_COUNT / quarters, 0.35);
    (pu.uSize.value as Vector4).set(P.render.size * sizeComp * (this.camDist / 7.02) ** 0.25, P.render.sizeJitter, P.render.minPx * this.stats.dpr, P.render.maxPx * this.stats.dpr);
    (pu.uLens.value as Vector4).set(P.render.aperture, this.camDist + P.render.focusOffset, P.render.bokehCull, P.render.depthFade);
    pu.uOpacity.value = P.render.alpha;
    pu.uGlint.value = reduced ? 0 : P.render.glint;
    pu.uLooseFrac.value = P.spring.looseFraction;
    const tintFor = (fi: number, which: Vector3, out: Vector3) => (KEYBOARD_FORMS.includes(this.forms[fi]) ? out.copy(which) : out.set(1, 1, 1));
    tintFor(a, this.caseTint, pu.uCaseTintA.value as Vector3);
    tintFor(b, this.caseTint, pu.uCaseTintB.value as Vector3);
    tintFor(a, this.keyTint, pu.uKeyTintA.value as Vector3);
    tintFor(b, this.keyTint, pu.uKeyTintB.value as Vector3);
  }

  private simulate(dt: number) {
    const P = this.params;
    const h = P.sim.dt;
    this.acc += dt;
    let steps = 0;
    const su = this.simMat.uniforms;
    su.uDt.value = h;
    while (this.acc >= h && steps < P.sim.maxSubsteps) {
      su.uTime.value = this.simTime;
      su.uPos.value = this.state.curr.textures[0];
      su.uVel.value = this.state.curr.textures[1];
      this.quad.render(this.renderer, this.simMat, this.state.next);
      this.state.swap();
      this.simTime += h;
      this.acc -= h;
      steps++;
    }
    if (steps === P.sim.maxSubsteps) this.acc = Math.min(this.acc, h);
    this.stats.substeps = steps;
  }

  private render() {
    const P = this.params;
    const pu = this.pointsMat.uniforms;
    pu.uPosPrev.value = this.state.prev.textures[0];
    pu.uPosCurr.value = this.state.curr.textures[0];
    pu.uVel.value = this.state.curr.textures[1];
    pu.uAlpha.value = Math.min(this.acc / P.sim.dt, 1);
    pu.uTime.value = this.simTime + this.acc;

    const r = this.renderer;
    r.setRenderTarget(this.post.scene);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this.pointsScene, this.camera);
    this.post.bloom(r, this.quad, P.bloom.threshold, P.bloom.knee, P.bloom.radius);
    (this.post.composite.uniforms.uGrade.value as Vector4).set(P.grade.vignette, P.grade.dither, P.bloom.strength, P.render.exposure);
    this.quad.render(r, this.post.composite, null);
    this.updateCallouts();
    this.updateAnchorEls();
  }

  private initState() {
    for (let i = 0; i < 2; i++) {
      this.quad.render(this.renderer, this.initMat, this.state.next);
      this.state.swap();
    }
  }

  // ------------------------------------------------------------------------
  // debug / screenshot hooks (PHYSICS.md §10, CHECKLIST ?debug)

  freeze(on: boolean) {
    this.frozen = on;
  }

  /** Deterministically advance `seconds` in fixed 1/fps frames, then render. */
  advance(seconds: number, fps = 60) {
    const n = Math.max(0, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) {
      this.update(1 / fps, 1 / fps);
      this.simulate(1 / fps);
    }
    this.render();
  }

  setMorph(m: number | null, snap = false) {
    this.morphOverride = m;
    if (snap) this.computeMorph(0, true);
  }

  /** restart the dust → form assembly from scratch */
  replay() {
    this.initState();
    this.introClock = 0;
    this.introOverride = null;
    this.acc = 0;
  }

  setIntro(v: number | null) {
    this.introOverride = v;
    if (v === null) this.introClock = 1e6;
  }

  getMorph() {
    return this.m;
  }

  /** scripted keystroke; releases after `holdMs` of simulated time */
  press(code: string, holdMs = 120) {
    const index = KEYS.findIndex((k) => k.code === code);
    this.onKey({ code, index, label: code, down: true, repeat: false, time: 0 });
    if (index >= 0) this.keyAuto[index] = holdMs / 1000;
  }

  setCursor(x: number | null, y = 0) {
    if (x === null) {
      this.cursorActive = false;
      return;
    }
    this.setPointer(x, y);
  }

  /** read back positions (and velocities) of the given particles */
  probe(indices: number[]): { pos: number[][]; vel: number[][] } {
    const buf = new Float32Array(4);
    const pos: number[][] = [], vel: number[][] = [];
    for (const i of indices) {
      const x = i % this.size, y = Math.floor(i / this.size);
      this.renderer.readRenderTargetPixels(this.state.curr, x, y, 1, 1, buf, undefined, 0);
      pos.push(Array.from(buf));
      this.renderer.readRenderTargetPixels(this.state.curr, x, y, 1, 1, buf, undefined, 1);
      vel.push(Array.from(buf));
    }
    return { pos, vel };
  }

  private installHooks() {
    const w = window as unknown as Record<string, unknown>;
    w.__mote = {
      engine: this,
      params: this.params,
      freeze: (on: boolean) => this.freeze(on),
      advance: (s: number, fps?: number) => this.advance(s, fps),
      setMorph: (m: number | null, snap?: boolean) => this.setMorph(m, snap),
      getMorph: () => this.m,
      setIntro: (v: number | null) => this.setIntro(v),
      replay: () => this.replay(),
      press: (code: string, ms?: number) => this.press(code, ms),
      setCursor: (x: number | null, y?: number) => this.setCursor(x, y),
      setLevel: (l: number) => {
        this.monitor.level = l;
        this.monitor.enabled = false;
      },
      probe: (idx: number[]) => this.probe(idx),
      keyCode: (i: number) => KEYS[i]?.code,
      key: (code: string) => {
        const i = KEYS.findIndex((k) => k.code === code);
        return i >= 0 ? this.keyPress[i] : -1;
      },
      measure: () => this.measureAnchors(),
      running: () => this.running,
      stats: () => ({ ...this.stats, tier: this.tier, N: this.N, m: this.m, match: this.matchStats, built: this.buildWhere }),
    };
  }
}
