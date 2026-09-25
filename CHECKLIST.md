# CHECKLIST — acceptance criteria from the brief

Legend: `[x]` done and verified · `[~]` partially done · `[ ]` not started.
Each item names how it is verified.

## Phase 1 — think before coding

- [x] PHYSICS.md written before any code (git history shows it first)
- [x] Integration: semi-implicit Euler vs Verlet, fixed timestep + accumulator, dt clamping after tab switches
- [x] Spring-damper: stiffness + damping ratio chosen with the maths shown (soft settle, minimal overshoot)
- [x] Curl noise ambient drift (divergence-free, no clumping)
- [x] Cursor field with smooth falloff (never raw 1/r²)
- [x] Drag and velocity limits
- [x] Morphs: area-weighted + blue-noise sampling, crossing-avoiding assignment, staggered release
- [x] Keypress: height field vs analytic ring — choice justified
- [x] GPU architecture: ping-pong float textures, passes per frame, precision, per-tier budget
- [x] Rendering: soft round sprites, depth via size + alpha, restrained bloom, blending choice justified
- [x] Failure modes and guards
- [x] Table of every tunable parameter with defaults and ranges (generated from params.ts)
- [x] Engine prototyped alone (one shape + cursor) and feel tuned before the site
- [~] git init, commit after each phase (Phase 1, Phase 2 committed)

## Phase 2 — the site

Stack
- [x] Latest Next.js (App Router) + TypeScript strict
- [x] Tailwind CSS v4 CSS-first: palette, fonts, type scale as `@theme` tokens in globals.css; no tailwind.config.js
- [x] Shaders read particle colours from the same CSS variables at startup
- [x] Three.js with custom GLSL (GLSL in TS template strings, no custom loaders)
- [x] Tailwind for DOM; particles in ONE fixed full-screen canvas behind content
- [x] All WebGL client-only: 'use client' + next/dynamic({ ssr:false }) from a client component
- [~] Idempotent init/teardown (Strict Mode), every GPU resource disposed, no leaked contexts on HMR — implemented, verification pending
- [x] Fonts via next/font
- [x] Everything procedural, no image assets; all randomness seeded

Sections
- [x] Hero: dust drifts in and assembles into a 3D 75% keyboard from a layout table (1u = 19.05 mm, tops narrower than bases)
- [~] Hero: slow parallax; ambient motion never fully stops — implemented, verification pending
- [~] Real typing: physical key depresses matching particle keycap + ripple through the field — implemented, verification pending
- [~] Typing does not break keyboard scrolling (Space / PgDn / arrows / Home / End) — implemented, verification pending
- [~] Subtle "type anything" hint — implemented, verification pending
- [x] Scroll story, 3–4 sections, each morphs to a new form (exploded keycap+switch, waveform reacting to typing, wordmark)
- [~] Morphs reverse cleanly when scrolling up — implemented, verification pending
- [~] Optional Web Audio key sounds, muted by default — implemented, verification pending
- [x] Product lineup, CTA, footer with tasteful placeholder copy

Design
- [x] Near-black background, warm off-white particles, at most one muted accent
- [~] Large confident type on a clear scale, generous whitespace, small tracked uppercase labels — implemented, verification pending
- [~] Motion slow and eased, never bouncy or frantic — implemented, verification pending

Performance
- [~] Target 60 fps on a mid-range laptop, adaptive particle count — implemented, verification pending
- [~] Pause when tab hidden or canvas offscreen — implemented, verification pending
- [~] Touch acts as the cursor on mobile — implemented, verification pending
- [~] prefers-reduced-motion respected — implemented, verification pending
- [~] Responsive down to 375 px — implemented, verification pending
- [~] `?debug`: fps meter, particle count, lil-gui for every PHYSICS.md parameter, hooks to freeze time and set scroll/morph progress — implemented, verification pending

## Phase 3 — verify and polish

- [ ] CHECKLIST.md kept current; done/left printed at the end of every turn
- [ ] Playwright screenshots of every section at 1440 px and 390 px, incl. mid-morph frames via debug hooks
- [x] Headless WebGL works (launch flags fixed, not skipped)
- [ ] Per-frame cost reasoned (PHYSICS.md §9); real fps left to the ?debug overlay
- [ ] Polish pass 1 (physics feel, transition timing, typography & spacing, colour, mobile) — logged
- [ ] Polish pass 2 — logged
- [ ] Polish pass 3 — logged
- [~] `npm run build` clean (clean at Phase 2; re-verify at the end)
- [ ] Zero console errors
- [ ] Screenshots genuinely look premium
