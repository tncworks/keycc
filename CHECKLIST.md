# CHECKLIST — acceptance criteria from the brief

Legend: `[x]` done and verified · `[~]` partially done · `[ ]` not started.
Evidence in *italics* names how each item was verified. Browser checks are
`npm run verify` (19 checks, run against dev **and** the production build);
screenshots are `npm run shoot` (1440 × 900 and 390 × 844, ~34 frames).

## Phase 1 — think before coding

- [x] PHYSICS.md written before any code — *first commit `f72a6c4` contains only PHYSICS.md + CHECKLIST.md*
- [x] Integration: semi-implicit Euler vs Verlet, fixed timestep + accumulator, dt clamping after tab switches — *PHYSICS §1; stability margin checked numerically*
- [x] Spring-damper: stiffness + damping ratio with the maths shown — *§2.1; `npm run physics:check`: 0.86 % overshoot, 0.80 s settle on the real integrator*
- [x] Curl noise ambient drift (divergence-free) — *§2.2; measured \|∇·u\| / \|∂u\| = 4e-6*
- [x] Cursor field with smooth falloff (never raw 1/r²) — *§2.3 poly6 kernel, speed-dependent presence*
- [x] Drag and velocity limits — *§2.4; limits scale with the frame on portrait*
- [x] Morphs: area-weighted + blue-noise sampling, crossing-avoiding assignment, staggered release — *§3; matching cuts mean travel 48–56 % vs random on like-scaled forms*
- [x] Keypress: height field vs analytic ring — justified — *§4*
- [x] GPU architecture: ping-pong float textures, passes per frame, precision, per-tier budget — *§5*
- [x] Rendering: soft sprites, depth via size + alpha, restrained bloom, blending justified — *§6*
- [x] Failure modes and guards — *§7, incl. three found in practice*
- [x] Table of every tunable parameter (69) — *§10, generated from `params.ts`; `npm run params:doc -- --check`*
- [x] Engine prototyped alone (keyboard + cursor) and tuned before the site — *`/lab`, commit `a92edf5`, PHYSICS §12*
- [x] git init, commit after each phase — *`git log`: 1a, 1b, 2, 3 (+ polish commits)*

## Phase 2 — the site

Stack
- [x] Latest Next.js (16.3.6, App Router, Turbopack) + TypeScript strict — *`next build` clean*
- [x] Tailwind v4 CSS-first: palette, fonts, type scale as `@theme` tokens in globals.css; no tailwind.config.js
- [x] Shaders read particle colours from the same CSS variables at startup — *`lib/engine/colors.ts` reads `--color-ground/particle/accent`*
- [x] Three.js with custom GLSL in TS template strings, no custom loaders — *`lib/engine/glsl/*.ts`*
- [x] Tailwind for DOM; ONE fixed full-screen canvas behind content — *verify: exactly one canvas*
- [x] WebGL client-only: 'use client' + next/dynamic({ ssr:false }) from a client component — *`components/ParticleStage.tsx`; pages prerender as static*
- [x] Idempotent init/teardown, every GPU resource disposed, no leaked contexts — *verify: dev Strict Mode creates 2 contexts / loses 1 / 1 canvas; prod 1/0/1*
- [x] Fonts via next/font (Instrument Sans + Geist Mono)
- [x] Procedural, no image assets (favicon is `ImageResponse`); all randomness seeded (`?seed=`)

Sections
- [x] Hero: dust drifts in and assembles into a 3-D 75 % keyboard from a layout table (1u = 19.05 mm, tops narrower than bases, sculpted rows) — *shots `*-00…03`*
- [x] Hero: slow parallax; ambient motion never stops — *at-rest probe: bound particles drift ≈1 px/s, loose motes ≈17 px/s; camera breathes*
- [x] Physical key depresses its particle keycap + ripple through the field — *verify (key press 0.996 after 100 ms); shots `hero-keypress`, `exploded-keypress`, `waveform-typed`*
- [x] Typing never breaks keyboard scrolling — *verify: Space / PgDn / End / Home scroll natively*
- [x] Subtle "type anything" hint (touch devices: "drag through the dust")
- [x] Scroll story with morphs: exploded keycap + switch (labelled), waveform that reacts to typing, wordmark, horizon — *shots + motion strips*
- [x] Morphs reverse cleanly — *verify: after keyboard → field → keyboard, mean error 0.015 u of 1.4 u travelled*
- [x] Optional Web Audio key sounds, muted by default — *verify: aria-pressed false → true, no errors*
- [x] Product lineup, CTA, footer with placeholder copy

Design
- [x] Near-black ground, warm off-white particles, one muted accent (Esc, stem, one dot)
- [x] Large confident type on a clear scale, whitespace, small tracked uppercase labels — *contrast: ink 15.9, muted 5.96, faint 4.66 : 1*
- [x] Motion slow and eased, never bouncy — *ζ = 0.82, eased moves land with 0.16 % overshoot*

Performance
- [x] Target 60 fps on a mid-range laptop, adaptive particle count — *cost reasoned in PHYSICS §9; `npm run adaptive:check`; ?debug shows real fps*
- [x] Pause when tab hidden or canvas offscreen — *verify (both)*
- [x] Touch acts as the cursor — *verify: presence 0.92 dragging, 0.017 after release*
- [x] prefers-reduced-motion respected — *verify: no intro flight, dissolve morphs, no Lenis, no cursor push, light-only ripples*
- [x] Responsive down to 375 px — *verify: no overflow at 375/390/768/1024/1440; shots at 390 and 1024*
- [x] `?debug`: fps meter, particle count, lil-gui for every parameter (77 controls), freeze time, set scroll/morph/intro progress — *verify*

## Phase 3 — verify and polish

- [x] CHECKLIST.md kept current; done/left printed at the end of the turn
- [x] Playwright screenshots of every section at 1440 and 390, incl. mid-morph frames — *`npm run shoot` (dev and prod), plus `scripts/strip.mjs` motion strips*
- [x] Headless WebGL works — *real GPU via ANGLE/EGL (`scripts/browser.mjs`), not SwiftShader*
- [x] Per-frame cost reasoned — *PHYSICS §9; startup long tasks measured instead*
- [x] Polish pass 1 (grain, hero, mobile placement, portrait physics) — *PHYSICS §13*
- [x] Polish pass 2 (callouts, contrast, dust, choreography, worker, adaptive bugs) — *PHYSICS §13*
- [x] Polish pass 3 (transitions, 1024 px, load, finish) — *PHYSICS §13*
- [x] `npm run build` clean; `eslint` clean
- [x] Zero console errors — *verify + every shoot run: dev and production*
- [x] Screenshots look premium — *final sets in `shots/site/`*

## Round 2 — finished product page

- [x] Switches chapter: particle force curve that reshapes for Linear / Tactile / Silent, live actuation label, bead that follows a key press — *`npm run interactions`; shots `interactions/curve-*`*
- [x] Design chapter: keyboard from above with pinned details; Chalk / Graphite / Ember re-tint the particle case — *interactions; shots `interactions/design-*`*
- [x] Connectivity chapter: coiled aviator cable whose coils travel; keystrokes pulse down the cable — *shots `interactions/coil-pulses`*
- [x] Acoustics: "Play a sentence" demo for visitors without a keyboard — *interactions (14 live bursts)*
- [x] Tap or click a particle keycap to press it (phones included) — *interactions: KeyG 0.98 after a click*
- [x] Process, full specifications, in the box, reviews, FAQ (accessible `<details>`), configured reservation card with ANSI/ISO — *shots at 1440 and 390*
- [x] Phone layouts: visual on top, copy below, via the tall-section anchor rule — *shots `site/mobile-*`*
- [x] Everything still clean: 19/19 verify, 6/6 interactions, eslint, tsc, zero console errors (dev and production)

## Not done / known limits

- Real-device fps (a physical mid-range laptop and phones) is not measured here: headless numbers are not meaningful, so the budget is argued in PHYSICS §9 and left to the `?debug` meter.
- A cold first visit still has one ~200 ms shader-compile task on drivers without KHR_parallel_shader_compile.
- HMR was not driven automatically; Strict Mode's mount → dispose → mount (the same code path) is verified.
