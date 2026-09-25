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
import { assemble, type FormInput } from "./assign";
import { readPalette, type Palette } from "./colors";
import { FORM_SPECS, KIND, formPose, keyboardKeyTops, type FormName, type Layout } from "./forms";
import { INIT_FRAG, SIM_FRAG, FULLSCREEN_VERT } from "./glsl/sim";
import { KEY_SLOTS, MAX_RIPPLES, PARTICLE_FRAG, PARTICLE_VERT } from "./glsl/particles";
import { FullscreenQuad, Post, StatePair, dataTexture, premultipliedOver, rawMaterial } from "./gpu";
import { KEYS } from "./layout75";
import { defaultParams, type Params } from "./params";
import { rngFor } from "./random";
import { LADDER, QualityMonitor, TIERS, TIER_COUNT, pickTier, type TierName } from "./tier";
import { keyChannel, releaseChannel, installKeyboard, stationStore, type KeyEvt } from "../bus";

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
  onReady?: (e: Engine) => void;
}

const FLOW_RMS = 3.96; // RMS |curl| of one octave, measured by scripts/physics-check.mjs
const TAU = Math.PI * 2;
const FOV = 28;

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

export class Engine {
  readonly params: Params = defaultParams();
  readonly tier: TierName;
  readonly N: number;
  readonly size: number;
  readonly forms: FormName[];
  stats = { fps: 0, frameMs: 0, substeps: 0, active: 0, dpr: 1, buildMs: 0, level: 0 };
  matchStats: { link: string; matched: number; random: number }[] = [];

  private readonly opts: EngineOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
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
  private palette: Palette;
  private readonly keyTops = keyboardKeyTops();

  private raf = 0;
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
  private lastMove = 0;
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
  private keyAge = new Float32Array(KEY_SLOTS);
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

  // ------------------------------------------------------------------------

  static async create(opts: EngineOptions): Promise<Engine | null> {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    opts.host.appendChild(canvas);
    let renderer: WebGLRenderer | null = null;
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
      canvas.remove();
      return null;
    }
    if (!renderer.extensions.has("EXT_color_buffer_float")) {
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      return null;
    }
    // let the browser paint the DOM before the (synchronous) shape build
    await new Promise((r) => setTimeout(r, 0));
    if (opts.signal?.aborted) {
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      return null;
    }
    const engine = new Engine(opts, canvas, renderer);
    if (opts.signal?.aborted) {
      engine.dispose();
      return null;
    }
    engine.start();
    opts.onReady?.(engine);
    return engine;
  }

  private constructor(opts: EngineOptions, canvas: HTMLCanvasElement, renderer: WebGLRenderer) {
    this.opts = opts;
    this.canvas = canvas;
    this.renderer = renderer;
    this.forms = opts.forms;
    const seed = opts.seed ?? 7;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.tier = pickTier(gl, opts.tier);
    this.size = TIERS[this.tier].size;
    this.N = this.size * this.size;
    this.monitor.enabled = !opts.shot;
    this.palette = readPalette();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- shapes ----------------------------------------------------------
    const t0 = performance.now();
    const names: FormName[] = [...opts.forms, "dust"];
    const inputs: FormInput[] = names.map((name) => {
      const spec = FORM_SPECS[name];
      const { buf, rest } = spec.build(this.N, rngFor(seed, "form", name));
      return { buf, pose: spec.matchPose, rest };
    });
    const links: [number, number][] = [];
    for (let i = 1; i < opts.forms.length; i++) links.push([i - 1, i]);
    this.dustIndex = names.length - 1;
    links.push([0, this.dustIndex]);
    const asm = assemble(inputs, links, TIER_COUNT, names);
    this.matchStats = asm.stats;
    this.stats.buildMs = performance.now() - t0;

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

    // procedural-form helpers (filled by later phases; valid placeholders now)
    const waveTex = dataTexture(new Float32Array(4 * 4), 2, 2);
    this.textures.push(waveTex);

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
      uWave: { value: new Vector4(1, 1, 0, 0) },
      uWave2: { value: new Vector4(2, 1, 0, 2) },
      uField: { value: new Vector4() },
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
    // refs are 2-D texel coordinates, not positions: give three a bounding
    // sphere so it never tries to compute one from them
    this.geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.pointsMat = rawMaterial(PARTICLE_VERT, PARTICLE_FRAG, {
      uPosPrev: { value: null },
      uPosCurr: { value: null },
      uVel: { value: null },
      uSeed: { value: seedTex },
      uKeyShape: { value: this.formPos[Math.max(0, opts.forms.indexOf("keyboard"))] },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uKeys: { value: this.keyPress },
      uKeyCfg: { value: new Vector4() },
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
    if (opts.debug || opts.shot) this.installHooks();
  }

  // ------------------------------------------------------------------------
  // lifecycle

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
    const want = this.visible && this.onScreen && !this.contextLost && !this.disposed;
    if (want && !this.running) this.start();
    else if (!want && this.running) this.stop();
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
    this.state.dispose();
    this.post.dispose();
    this.quad.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    const w = window as unknown as { __mote?: unknown };
    if (w.__mote && (w.__mote as { engine?: Engine }).engine === this) delete w.__mote;
  }

  // ------------------------------------------------------------------------
  // events

  private listen<K extends keyof WindowEventMap>(target: Window | Document, type: K | string, fn: (e: never) => void, opts: AddEventListenerOptions = { passive: true }) {
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
      if (t) this.setPointer(t.clientX, t.clientY, true);
    });
    this.listen(window, "touchmove", (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) this.setPointer(t.clientX, t.clientY);
    });
    this.listen(window, "touchend", () => (this.cursorActive = false));
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
    const onRestored = () => {
      // Simplest correct recovery: rebuild from scratch.
      window.dispatchEvent(new CustomEvent("mote:context-restored"));
    };
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
    this.lastMove = performance.now();
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
    const frameW = 3.75 + (5.6 - 3.75) * wide;
    const frameH = 3.4;
    this.camDist = Math.max(frameW / (2 * t * aspect), frameH / (2 * t));
    this.layout = { halfH: this.camDist * t, halfW: this.camDist * t * aspect, aspect, wide };
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.pointsMat.uniforms.uProjScale.value = bh / (2 * t);
    this.measureAnchors();
  }

  private measureAnchors() {
    if (!this.opts.scrollDriven) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-form]"));
    const vh = window.innerHeight;
    this.anchors = els
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        return { form: this.forms.indexOf(el.dataset.form as FormName), y: top + r.height / 2 - vh / 2 };
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
    if (e.down && !e.repeat) this.spawnRipple(e.index, e.code === "Space" ? 1.35 : 1);
  }

  /** ripple origin/axis for the form currently on screen */
  private spawnRipple(keyIndex: number, gain: number) {
    const fi = Math.round(this.m);
    const name = this.forms[Math.min(Math.max(fi, 0), this.forms.length - 1)];
    const o = this.tmpV, axis = this.tmpV2;
    if (name === "keyboard") {
      const pose = fi === Math.floor(this.m) ? this.xfA : this.xfB;
      if (keyIndex >= 0) o.fromArray(this.keyTops, keyIndex * 3);
      else o.set(0, 0, 0);
      o.applyMatrix4(pose);
      axis.set(0, 1, 0).transformDirection(pose);
    } else {
      o.set(0, 0, 0);
      axis.set(0, 0, 1);
    }
    const i = this.ripNext;
    this.ripNext = (this.ripNext + 1) % MAX_RIPPLES;
    const tNow = this.simTime + this.acc;
    this.ripA.set([o.x, o.y, o.z, tNow], i * 4);
    this.ripB.set([axis.x, axis.y, axis.z, this.params.ripple.amplitude * gain], i * 4);
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
    if (this.monitor.sample(real)) this.applyLevel();
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
      const hold = this.params.morph.hold;
      if (y <= A[0].y) target = A[0].form;
      else if (y >= A[A.length - 1].y) target = A[A.length - 1].form;
      else {
        for (let i = 0; i < A.length - 1; i++) {
          if (y >= A[i].y && y <= A[i + 1].y) {
            const span = A[i + 1].y - A[i].y;
            const t = smoothstep(A[i].y + span * hold, A[i + 1].y - span * hold, y);
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
    const station = Math.round(this.m);
    stationStore.set(station);
  }

  private updatePoses(time: number) {
    const a = Math.min(Math.floor(this.m), this.forms.length - 1);
    const b = Math.min(a + 1, this.forms.length - 1);
    formPose(this.forms[a], this.layout, time, this.xfA);
    formPose(this.forms[b], this.layout, time, this.xfB);
    formPose("dust", this.layout, time, this.xfD);
  }

  private update(dt: number, real: number) {
    const P = this.params;
    // intro
    if (!this.reduced) this.introClock += dt;
    const intro = this.introOverride ?? Math.min(Math.max((this.introClock - P.intro.delay) / P.intro.duration, 0), 1);

    // morph
    this.computeMorph(dt);
    const a = Math.min(Math.floor(this.m), this.forms.length - 1);
    const b = Math.min(a + 1, this.forms.length - 1);
    const mix = b === a ? 0 : this.m - a;
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

    // cursor
    // the field follows the air: a resting cursor makes a faint dent, a
    // moving one stirs (presence scales with smoothed cursor speed)
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

    // keys
    const kDown = 1 - Math.exp(-dt / P.keys.pressTime);
    const kUp = 1 - Math.exp(-dt / P.keys.releaseTime);
    for (let i = 0; i < KEYS.length; i++) {
      this.keyAge[i] += dt;
      if (this.keyAuto[i] > 0 && this.keyAge[i] >= this.keyAuto[i]) {
        this.keyDown[i] = 0;
        this.keyAuto[i] = 0;
      }
      const target = this.keyDown[i] || this.keyAge[i] < P.keys.minHold ? 1 : 0;
      const q = this.keyPress[i];
      this.keyPress[i] = q + (target - q) * (target > q ? kDown : kUp);
    }

    // ---- uniforms -------------------------------------------------------
    const su = this.simMat.uniforms;
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
    (su.uLimits.value as Vector2).set(P.limits.maxSpeed, P.limits.maxAccel);
    (su.uCamPos.value as Vector3).copy(this.camera.position);
    su.uBackface.value = P.render.backface;

    const pu = this.pointsMat.uniforms;
    const kbIndex = this.forms.indexOf("keyboard");
    const kbWeight = kbIndex < 0 ? 0 : Math.max(0, 1 - Math.abs(this.m - kbIndex) * 2.5) * smoothstep(0.6, 1, intro);
    if (kbIndex >= 0) {
      const pose = Math.floor(this.m) === kbIndex ? this.xfA : this.xfB;
      this.tmpV.set(0, 1, 0).transformDirection(pose);
      (pu.uKeyCfg.value as Vector4).set(this.tmpV.x, this.tmpV.y, this.tmpV.z, P.keys.travel * kbWeight);
    }
    pu.uKeyGlow.value = P.keys.glow;
    (pu.uRipple.value as Vector4).set(P.ripple.speed, P.ripple.width, P.ripple.decay, P.ripple.spread);
    pu.uRippleDisp.value = reduced ? 0 : 1;
    pu.uSheen.value = P.ripple.sheen;
    const [quarters] = LADDER[this.monitor.level];
    const sizeComp = Math.pow(TIER_COUNT / quarters, 0.35);
    (pu.uSize.value as Vector4).set(P.render.size * sizeComp, P.render.sizeJitter, P.render.minPx * this.stats.dpr, P.render.maxPx * this.stats.dpr);
    (pu.uLens.value as Vector4).set(P.render.aperture, this.camDist + P.render.focusOffset, P.render.bokehCull, P.render.depthFade);
    pu.uOpacity.value = P.render.alpha;
    pu.uGlint.value = reduced ? 0 : P.render.glint;
    pu.uLooseFrac.value = P.spring.looseFraction;
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
      measure: () => this.measureAnchors(),
      stats: () => ({ ...this.stats, tier: this.tier, N: this.N, m: this.m, match: this.matchStats }),
    };
  }
}
