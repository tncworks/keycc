# MOTE — a particle landing page for a quiet keyboard

A landing page for **Mote 75**, a (fictional) premium mechanical keyboard,
whose every image is made of GPU particles: dust assembles into a 3-D 75 %
keyboard, which becomes an exploded switch, a ridgeline of sound that reacts
to typing, the wordmark, and a calm horizon.

* **Design + physics reasoning:** [PHYSICS.md](PHYSICS.md) (written before
  the code; includes the generated parameter table, verification numbers
  and the polish log).
* **Acceptance criteria:** [CHECKLIST.md](CHECKLIST.md).

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4
(CSS-first `@theme` tokens, shared with the shaders) · three.js with raw GLSL
3 in TypeScript template strings · Lenis · lil-gui (debug only) · Web Audio.
No image or audio assets; all randomness is seeded.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

Query flags: `?debug` (fps meter, particle count, lil-gui for every
parameter, freeze/morph/intro hooks), `?tier=low|mobile|mid|high|ultra`,
`?seed=N`, `?shot` (deterministic mode for screenshots). `/lab` is the
Phase-1 engine prototype (keyboard + cursor only).

## Verify

```bash
npm run physics:check    # CPU reference of the integrator, noise, divergence
npm run adaptive:check   # adaptive quality ladder under synthetic load
npm run params:doc       # regenerate the PHYSICS.md parameter table
BASE=http://localhost:3000 npm run verify   # 19 behavioural browser checks
BASE=http://localhost:3000 npm run shoot    # screenshots at 1440 and 390 px
```

The browser scripts use headless Chromium on the real GPU
(`scripts/browser.mjs`: ANGLE on EGL); screenshots land in `shots/`.

## Layout

```
app/                 page, layout (fonts, tokens), procedural icon, /lab
components/          ParticleStage (next/dynamic ssr:false) → ParticleCanvas,
                     SoundToggle, TypeHint, Reveal, SmoothScroll, ReserveForm
lib/engine/          Engine (loop, input, uniforms), gpu (MRT ping-pong, bloom),
                     glsl/ (sim, particles, post, noise), shapes/ (keyboard,
                     exploded, waveform, wordmark, field, dust), sampling,
                     assign (tiered bisection matching), build(.worker),
                     params (single source of truth), tier (adaptive quality)
lib/bus.ts           key events shared by DOM, audio and GPU
lib/audio.ts         synthesised key sounds (muted by default)
scripts/             verification, screenshots, motion strips, doc generation
```
