# PHYSICS.md — the motion engine behind MOTE

This document is written **before** any code. It reasons through every
physical and rendering decision for the particle system, records the calls I
made (and why), and ends with a table of every tunable parameter. The table
is regenerated from `lib/engine/params.ts` so the doc and the `?debug` panel can
never drift apart.

Units: **1 world unit = 100 mm**. A 1u key pitch (19.05 mm) is `0.1905` units, a
75% keyboard is ≈ `3.3` units wide. Time is in seconds. Mass is 1 unless noted.

---

## 0. Brand and art-direction calls

| Call | Decision | Why |
|---|---|---|
| Brand name | **MOTE** (product: *Mote 75*) | The brief left `[BRAND NAME]` open. A *mote* is a speck of dust, which is literally the hero: dust that condenses into a keyboard. Four letters render well as a particle wordmark. It is a single constant (`lib/brand.ts`) so it can be swapped. |
| Mood | premium hardware photographed in a dark studio | Calm, not RGB gamer: one warm light, shallow depth of field, slow motion. |
| Palette | near-black warm ground, warm off-white particles, **one** muted ember accent used on a single keycap (Esc) and a few UI details | One accent keeps it quiet; Esc is the classic enthusiast accent key. |
| Look of the particles | "dust catching a light": soft round sprites, density reads as opacity, shallow DOF | Additive neon would read as gamer. |

---

## 1. Integration

### 1.1 Semi-implicit (symplectic) Euler vs Verlet

State per particle: position `x`, velocity `v`.

**Semi-implicit Euler** (velocity first, then position with the *new* velocity):

$$v_{n+1} = v_n + h\,a(x_n, v_n) \qquad x_{n+1} = x_n + h\,v_{n+1}$$

**Position Verlet**: $x_{n+1} = 2x_n - x_{n-1} + h^2 a(x_n)$, velocity implicit.

| | Semi-implicit Euler | Position Verlet |
|---|---|---|
| Order | 1 | 2 |
| Symplectic (no energy drift) | yes | yes |
| Velocity-dependent forces (damping, drag, air coupling, cursor wake) | exact, uses current `v` | needs a lagged estimate $(x_n-x_{n-1})/h$ — damping becomes first order *and* lagged |
| Velocity clamp | trivial | must rewrite $x_{n-1}$ |
| Variable/interrupted steps | trivial | needs time-corrected Verlet |
| Memory | pos + vel | pos + prevPos (same) |

Our system is **heavily damped** (ζ ≈ 0.8) and dominated by velocity-dependent
terms. Verlet's second-order energy accuracy buys nothing when we deliberately
destroy energy, while its awkward velocity handling costs us the drag model,
the cursor wake and the velocity limit. **Decision: semi-implicit Euler.**

Stability of semi-implicit Euler for $\ddot x = -\omega^2 x - c\dot x$. The
one-step matrix is

$$M = \begin{pmatrix}1-h^2\omega^2 & h(1-hc)\\ -h\omega^2 & 1-hc\end{pmatrix},\quad \det M = 1-hc,\quad \operatorname{tr} M = 2-h^2\omega^2-hc$$

Both eigenvalues are inside the unit circle iff $hc < 2$ and
$h^2\omega^2 + 2hc < 4$. With our defaults (ω = 4.90 s⁻¹, c = 8.04 s⁻¹,
h = 1/120 s): $h^2\omega^2 + 2hc = 0.0017 + 0.134 = 0.136 \ll 4$ — a 30× margin.
Even the stiffest values the debug panel allows (f₀ = 2 Hz, ζ = 1.2) stay
stable up to h ≈ 58 ms. The discrete per-step decay is $\sqrt{1-hc}$, i.e. an
effective $\zeta\omega = -\ln(1-hc)/2h = c/2\,(1 + O(hc))$ — within 0.3 % of the
continuous design value, so the maths below transfers to the GPU unchanged.

### 1.2 Fixed timestep with an accumulator

Variable `dt` would make the spring feel different at 60, 120 and 144 Hz, and a
single long frame would inject a huge step into every force. So the
simulation runs at a **fixed h = 1/120 s** ("Fix your timestep"):

```
frameDt  = min(now - last, maxFrameDt)          // clamp (see 1.3)
acc     += frameDt
steps    = 0
while (acc >= h && steps < maxSubsteps) { simulate(h); acc -= h; steps++ }
if (steps == maxSubsteps) acc = min(acc, h)       // drop backlog → slow-mo, never a spiral of death
alpha    = acc / h                                 // render interpolation
render( mix(statePrev, stateCurr, alpha) )
```

* 60 Hz display → 2 substeps/frame; 120 Hz → 1; 144 Hz → 0 or 1.
* The ping-pong pair *already* holds the previous and current state, so the
  render interpolation (`alpha`) is free and removes the 0/1-substep judder on
  144 Hz panels.
* `maxSubsteps = 4`: a device that cannot keep up gets time dilation, not a
  death spiral.

### 1.3 dt clamping and tab switches

* `frameDt` is clamped to `maxFrameDt = 50 ms`.
* On `visibilitychange → hidden` the loop is **cancelled** (no rAF at all).
  On return the clock is reset (`last = now`) so the first frame has `dt ≈ 0`.
* The same pause happens when the canvas host is off screen
  (IntersectionObserver) and when the WebGL context is lost.
* Belt and braces: even if a huge `dt` slipped through, the clamp + substep cap
  bound the work to 4 × h of simulated time per frame.

---

## 2. Forces

Total acceleration on particle *i* (mass $m_i$):

$$a = \underbrace{\tfrac{k}{m_i}(x_t - x) - \tfrac{c_s}{m_i} v}_{\text{spring–damper}} + \underbrace{\tfrac{c_{air}}{m_i}\,(u(x,t) - v)}_{\text{air drag in a curl-noise wind}} + \underbrace{F_{cursor}}_{\text{smooth kernel}}$$

followed by an acceleration clamp, integration, and a velocity clamp.

### 2.1 Spring-damper pull to targets

For unit mass, $\omega_0=\sqrt{k}$ and $\zeta = c/(2\omega_0)$ where
$c = c_s + c_{air}$ is the **total** damping (air drag is part of the damping
budget, so the design ζ holds exactly).

Step response of the underdamped oscillator:

* overshoot $M_p = \exp\!\big(-\pi\zeta/\sqrt{1-\zeta^2}\big)$
* damped frequency $\omega_d = \omega_0\sqrt{1-\zeta^2}$, peak time $t_p = \pi/\omega_d$
* 2 % settling time $t_s = -\ln\!\big(0.02\sqrt{1-\zeta^2}\big)/(\zeta\omega_0)$

| ζ | overshoot | reads as |
|---|---|---|
| 0.60 | 9.5 % | visible bounce — rejected (brief: never bouncy) |
| 0.70 | 4.6 % | a small wobble on arrival |
| **0.82** | **1.1 %** | **a soft "arrival" — the particle eases in and just breathes past** |
| 0.90 | 0.15 % | nearly dead |
| 1.00 | 0 % | critically damped: correct but lifeless, asymptotic crawl |

The target is "soft settle with minimal overshoot". A hair of underdamping is
what makes motion feel organic rather than mechanical, and 1.1 % of a 300 px
journey is 3 px — felt, not seen. **ζ = 0.82.**

Stiffness from the settle time: we want the swarm to settle in ≈ 1.1 s
(slow, calm, but responsive enough for scroll). With ζ = 0.82:

$$\omega_0 = \frac{-\ln(0.02\cdot0.572)}{0.82\cdot 1.11\,\text{s}} = 4.90\ \text{s}^{-1}\ \ (f_0 = 0.78\ \text{Hz}),\quad k = \omega_0^2 = 24.0\ \text{s}^{-2},\quad c = 2\zeta\omega_0 = 8.04\ \text{s}^{-1}$$

Peak (of the 1.1 % overshoot) at $t_p = 1.12$ s. For a *moving* target (all
morphs are eased paths, not steps) the steady ramp lag is
$2\zeta/\omega_0 = 0.33$ s — the particles trail the choreography by a third
of a second, which is exactly the "weight" we want.

**Organic spread.** Each particle gets a mass $m_i \in [1-j, 1+j]$
(`spring.massJitter`, default 0.15) with the damper scaled by
$\sqrt{m_i}$ so ζ stays constant while $\omega_i$ varies ±7 %. Arrivals
de-synchronise and the swarm settles like a cloth, not a grid.

**Loose motes.** A seeded fraction (`spring.looseFraction` = 4 %) of particles
have their stiffness multiplied by 0.04. They orbit their home in the wind with
a radius ≈ $c_{air}|u| / (0.04k)$ ≈ 15 % of a key-row — a halo of dust that
keeps the scene alive even when everything else is settled.

### 2.2 Curl noise for ambient drift

Bridson et al. (2007): take a vector potential $\psi = (\psi_1,\psi_2,\psi_3)$
built from three decorrelated simplex-noise fields and use its curl

$$u = \nabla\times\psi = \Big(\tfrac{\partial\psi_3}{\partial y}-\tfrac{\partial\psi_2}{\partial z},\ \tfrac{\partial\psi_1}{\partial z}-\tfrac{\partial\psi_3}{\partial x},\ \tfrac{\partial\psi_2}{\partial x}-\tfrac{\partial\psi_1}{\partial y}\Big)$$

Because $\nabla\cdot(\nabla\times\psi) \equiv 0$, the flow is incompressible: it
can swirl particles but never **converge** them into clumps or tear holes. We
use simplex noise with **analytic gradients** (3 evaluations, no finite
differences), two octaves (f and 2.1 f, second at 40 %).

*How it enters the dynamics matters.* Adding curl noise as an **acceleration**
does not keep the velocity divergence-free (it gets integrated along curved
paths and mixed with springs). Instead it is the **wind** in the drag term
$c_{air}(u - v)$:

* a free particle relaxes to $v = u$, i.e. it is *advected* by an
  incompressible flow → no clumping, by construction;
* a bound particle settles at an offset $\delta = c_{air}u/k$ from its target,
  which is a scaled divergence-free field → the shape breathes without local
  density changes.

With `flow.speed` = 0.08 u/s, $\delta$ ≈ 0.006 u ≈ 1.5 px on a laptop:
the surface shimmers but key gaps stay crisp.

*Time evolution without precision loss:* instead of $p + t\cdot\hat d$ (which
grows without bound and loses float precision after an hour) the noise domain
is offset along a **circle** $R(\cos\Omega t, \sin\Omega t, \ldots)$. The field
evolves continuously and is exactly periodic, so the time uniform is wrapped on
the CPU with no seam.

*Transit boost:* while a particle is mid-morph the wind coupling is multiplied
by $1 + B\cdot 4e(1-e)$ ($e$ = its eased morph progress, $B$ =
`flow.transitBoost`). Particles are *picked up by the air* between forms and
set down again, which reads as dust rather than as linear interpolation.

### 2.3 Cursor field

The cursor is a **ray** from the camera. For a particle at distance $d$ from
the ray, with radial unit vector $\hat r$ away from the ray:

$$W(d) = \big(1 - (d/R)^2\big)^3 \ \ (d<R), \quad 0 \text{ otherwise}$$

(the SPH "poly6" kernel: $W(0)=1$, $W'(0)=0$, and $W, W', W''$ all vanish at
$R$ → C² with compact support).

$$F = W(d)\Big[S\,\hat r \;+\; K_w\,(u_c - v) \;+\; \Omega_s\,(\hat d\times\hat r)\Big]$$

* $S\hat r$: gentle push aside. Max force is $S$ — **bounded**. A raw
  $1/r^2$ is unbounded at the core: a particle passing close to the ray gets an
  arbitrarily large kick, which the integrator then turns into "popcorn".
* $K_w(u_c - v)$: wake — drag toward the cursor's own velocity, like a hand
  stirring smoke. $u_c$ is the cursor's world velocity on the focal plane,
  low-passed (τ = 60 ms) and clamped.
* $\Omega_s(\hat d\times\hat r)$: a small swirl so the wake curls.
* $\hat r = r/(|r|+\varepsilon)$ → no NaN on the ray itself.
* Equilibrium displacement at the core for a bound particle: $S/k$ = 5/24 ≈
  0.2 u — about a key width. Presence fades in/out over 250 ms.

Touch acts as the cursor (`touchstart/touchmove`, passive); the field fades
out on `touchend`.

### 2.4 Drag and velocity limits

* Drag is the air term above (`flow.coupling` = 1.8 s⁻¹ of the 8.04 s⁻¹ total).
* **Acceleration clamp** $|a| \le a_{max}$ = 80 u/s² — protects against the
  rare huge spring force (e.g. a target teleport).
* **Velocity clamp** $|v| \le v_{max}$ = 3.2 u/s (hard clamp on magnitude).
  At that speed a particle crosses the viewport in ≈ 1.7 s: even pathological
  inputs stay *calm*. It only engages in abnormal situations, so a hard clamp
  (which is exactly the identity below the limit) beats a soft `tanh` clamp
  that would add hidden damping at normal speeds.

---

## 3. Morphs

### 3.1 Even surface sampling (area-weighted + blue noise)

Every target shape is built from analytic primitives (rounded-rect faces,
lofted rounded-rect walls, cylinders, a helix, glyph masks, planes). Sampling:

1. **Area weighting.** Each primitive $p$ has area $A_p$ and a density weight
   $w_p$ (keycap tops 1.0, walls ≈ 0.3–0.5, …). Counts are
   $n_p = N\,w_pA_p/\sum w A$, rounded with the **largest-remainder method**
   so $\sum n_p = N$ exactly.
2. **Blue-noise-like distribution inside a primitive.** Points come from the
   **R2 quasirandom sequence** (Roberts 2018,
   $\alpha = (1/\phi_2, 1/\phi_2^2)$, $\phi_2$ = plastic number) in the
   primitive's 2-D parameter domain, with a random **Cranley–Patterson
   rotation** per primitive. R2 has the best packing of the low-discrepancy
   sequences (no clumps, no holes, blue-ish spectrum). Rounded corners, holes
   and glyphs use rejection on top of R2, which keeps low discrepancy.
   Lofted walls sample height with an inverse-CDF so density stays uniform
   as the perimeter shrinks toward the keycap top.
3. **Why R2 and not Poisson-disk:** R2 is **progressive** — every prefix of
   the sequence is itself evenly spread. Each sample carries a *rank*
   $(j+\rho_p)/n_p$. Sorting by rank and cutting into 4 equal **tiers** gives
   four interleaved, individually even subsets. The adaptive particle count
   (§5.3) drops whole tiers, so at 25 %, 50 % or 75 % the shapes are *still*
   evenly sampled. A Poisson-disk set thinned at random would clump.
4. The per-primitive random rotation also breaks the moiré you would get from
   84 keycaps carrying identical point patterns.

### 3.2 Particle-to-target assignment without chaotic crossing

Particle *i* has one target per shape. Random assignment makes every morph an
explosion: paths cross everywhere. The ideal is the optimal-transport
bijection (min Σ|A_i − B_i|²) but Hungarian is O(n³).

**Recursive median bisection (balanced k-d matching)**, O(n log n):

```
match(P, Q):                        # |P| = |Q|
  if |P| == 1: pair them
  axis = argmax over x,y,z of spread(P ∪ Q) · weight(axis)
  split P and Q at their own medians on that axis (quickselect)
  match(P_lo, Q_lo); match(P_hi, Q_hi)
```

Both sets are split into **equal counts** at every level, so the "left half by
count" of A always feeds the "left half by count" of B, recursively down to
single points. It is translation-invariant, adapts to density differences, and
approximates OT well for the smooth, similarly-sized shapes we morph between.

* Matching is done in **view space** (each shape posed as it will be seen, then
  rotated into camera space) with depth down-weighted (×0.35): crossings that
  matter are the ones you can *see*.
* It runs **chain-wise** along the scroll story (keyboard → exploded → waveform
  → wordmark → field; keyboard ← dust for the intro) so every *visible*
  transition is locally optimal.
* It runs **per tier**, so tier subsets stay aligned across all shapes.
* After matching, particle rows are laid out tier-major; within a tier order is
  irrelevant.

### 3.3 Staggered release (waves, not teleports)

The global morph progress $p\in[0,1]$ between shapes A and B is shared, but
each particle has a delay $d_i\in[0,1]$ and its own window $w$:

$$t_i = \operatorname{clamp}\!\Big(\frac{p - d_i(1-w)}{w},0,1\Big),\quad e_i = 6t_i^5 - 15t_i^4 + 10t_i^3$$

$$x_t = \operatorname{mix}(A_i, B_i, e_i) + \text{lift}\cdot 4e_i(1-e_i)\,\hat n_{arc}$$

* $d_i = \operatorname{mix}(\text{order}_B(i), \xi_i, \text{jitter})$ where
  *order* is a per-shape build order stored with the samples (keyboard:
  diagonal sweep; exploded: top-to-bottom; waveform: left-to-right; wordmark:
  letter by letter; field: near-to-far) and $\xi_i$ is seeded noise.
* **smootherstep** has zero velocity *and* zero acceleration at both ends, so
  release and landing have no jerk; the spring adds the weight.
* The arc lifts mid-flight particles toward the camera: they grow slightly
  (depth cue) and cross *over* the forms rather than through them.
* **Clean reversal:** the target is a pure function of $(p, i)$. Scrolling
  back simply runs $p$ backwards — the last particle to leave is the first to
  come home. No state, no hysteresis.
* $p$ comes from scroll through a critically-damped smoother
  (τ = 0.35 s, max 1.2 shapes/s). A jump from the hero to the footer (End
  key) therefore *plays through* the forms quickly instead of teleporting.
* The intro is the same machinery: dust → keyboard, driven by time (4.6 s)
  instead of scroll.

---

## 4. Keypress: depress + ripple

**Depression.** Each of the 84 keys has a press amount $q_k\in[0,1]$ animated
on the CPU (exponential approach, τ↓ = 18 ms, τ↑ = 70 ms, minimum visible hold
70 ms so a fast tap still reads). It is uploaded as `float uKeyPress[96]`; the
particle vertex shader looks up its key id (stored in the keyboard shape
texture) and moves along the keyboard's up axis by $q_k\cdot 4.0\,\text{mm}$
(real MX travel). This is applied at render time, *not* through the 0.78 Hz
spring — a keycap that took a second to sink would feel broken.

**Ripple: damped height-field wave vs analytic expanding ring.**

| | Height field (2-D damped wave eq.) | Analytic ring (superposed) |
|---|---|---|
| Cost | 1–2 extra passes per substep + textures | K ≤ 16 terms per particle, in the vertex shader |
| Domain | bounded grid; must cover every shape | infinite, any shape, any orientation |
| Artefacts | CFL limit, grid dispersion (square-ish rings), boundary reflections unless an absorbing layer is added | none — exact and isotropic |
| Interference | yes | yes (superposition is linear — the free-space wave equation) |
| Reflections / obstacles | yes | no (not wanted: the ring should leave the keyboard and travel through the dust) |
| Determinism / scrubbing | stateful | pure function of time → freeze/step for screenshots |

**Decision: analytic expanding rings.** A ring buffer of 16 events
$(o_j, t_j, A_j)$ in uniforms. For a particle at in-plane distance $r$ from
$o_j$ (plane ⟂ the current form's ripple axis) and age $\tau = t - t_j$:

$$h = \sum_j A_j\, e^{-\tau/T}\, \frac{\psi\!\big((r - c\tau)/\sigma\big)}{\sqrt{1 + r/r_0}},\qquad \psi(u) = (1-u^2)e^{-u^2/2}$$

The Ricker wavelet $\psi$ has zero mean: a crest with a shallow trough either
side, which reads as a real ripple rather than a bump. $1/\sqrt{r}$ is 2-D
energy spreading. The displacement is along the form's axis (keyboard up,
view axis for camera-facing forms) and also adds a faint brightness sheen.
Each form maps a key to an origin: the key itself on the keyboard, the key's
normalised layout position elsewhere (Q ripples from the left, P from the
right). Key repeats do not spawn rings.

Listeners are **passive** and never call `preventDefault`, so Space, PgDn,
arrows, Home/End keep scrolling the page natively.

---

## 5. GPU architecture

### 5.1 WebGL2 GPGPU (not WebGPU compute)

* Universal: WebGL2 runs in every current browser incl. iOS 15+ Safari. WebGPU
  is still missing on some targets, so a WebGL2 path is mandatory anyway —
  adding WebGPU would *double* the shader code and test matrix.
* The simulation is a **pure per-particle map** (no neighbour search, no
  scatter, no atomics). Fragment-shader GPGPU runs a map at the same speed as
  a compute shader. WebGPU would earn its keep for particle–particle forces or
  GPU sorting; we need neither (see §6 blending).
* The brief asks for custom GLSL with Three.js.

### 5.2 Textures and passes

State lives in two **MRT** render targets (ping-pong), each with 2 attachments:

| texture | format | xyz | w |
|---|---|---|---|
| position | RGBA32F | position | brightness (shade × facing × twinkle) |
| velocity | RGBA32F | velocity | accent amount |

Static inputs: per shape **RGBA32F** `(xyz, attr)` + `(normal, order)`, and one
seed texture (4 uniform randoms per particle). `attr` packs key id, accent flag
and baked shade.

Passes per frame (typical 60 Hz):

| # | pass | resolution | notes |
|---|---|---|---|
| 1–2 | simulate (MRT: pos+vel in one pass) | N texels | 1–4 substeps, scissored to active tiers |
| 3 | particles → RGBA16F | full × DPR | points, premultiplied over |
| 4–8 | bloom downsample ×5 (13-tap, soft-knee prefilter on first) | ½ … ¹⁄₃₂ | Jimenez 2014 |
| 9–12 | bloom upsample ×4 (9-tap tent, additive) | ¹⁄₁₆ … ½ | |
| 13 | composite: ground + particles + bloom, vignette, sRGB, dither | full | |

**Precision.** Positions must be float32: half-float has an 11-bit mantissa,
so at |x| ≈ 3 u the quantum is ≈ 0.0015 u ≈ 0.4 px *and it changes as the value
moves* → visible shimmer at rest. The particle colour buffer is RGBA16F (blendable
everywhere in WebGL2, enough range for bloom). All sim math is `highp`.
Requires `EXT_color_buffer_float` (≈ universal on WebGL2); without it the page
keeps its DOM-only layout (graceful degradation, no broken canvas).

### 5.3 Particle budget per device tier

Sprite fill and blending dominate, so budgets scale with GPU class:

| tier | texture | particles | chosen when |
|---|---|---|---|
| low | 160² | 25 600 | software GL, ≤ 3 GB devices |
| mobile | 224² | 50 176 | coarse pointer / small screen |
| mid | 256² | 65 536 | integrated GPU on hi-DPI |
| high | 320² | 102 400 | default desktop / laptop |
| ultra | 448² | 200 704 | discrete / Apple Pro-class GPU |

Adaptive at runtime: the frame-time monitor compares the median frame delta
with the display's refresh interval. Sustained misses drop a **tier quarter**
(draw range + simulation scissor shrink by ¼ of the rows; sprite size grows by
$\sqrt{N_{ref}/N}$ to keep coverage), then DPR. Sustained headroom climbs
back, with hysteresis so it never oscillates. Because tiers are interleaved
blue-noise subsets (§3.1), the shapes stay evenly sampled at every level.

---

## 6. Rendering

**Sprites.** `gl.POINTS` (cheapest: one vertex per particle). Size is
`worldSize × projScale / depth`; the fragment kernel is
$(1-r^2)^2$ — smooth, compact, no hard rim.

**Depth via size and alpha, i.e. a lens.** A thin-lens circle of confusion
$\text{coc} = A\,|z - z_f|\,/\,z$ is added in quadrature to the sprite size.
Alpha is scaled by $(\text{size}/\text{size}_{eff})^2$ so a blurred sprite
spreads the *same energy* over a larger disc — out-of-focus dust becomes soft
bokeh, not bright blobs. Out-of-focus sprites flatten toward a disc profile
(lens bokeh) while in-focus ones stay Gaussian-like.

* **Min size clamp:** sprites below 1.6 device px are drawn at 1.6 px with
  alpha × (s/1.6)² → no sub-pixel shimmer.
* **Stochastic bokeh culling:** a sprite whose area grew by $g$ is drawn with
  probability $1/g$ (stable per-particle hash, soft edge) at $g\times$ the
  alpha. Same expected energy, constant fill cost per particle however blurry
  the dust gets.
* **Backface fade:** samples carry their surface normal; particles on faces
  pointing away from the camera fade (to 18 %). This fakes occlusion so the
  keyboard reads as a solid object instead of an X-ray, while keeping a hint
  of the translucent particle character.
* Depth also dims far particles slightly (aerial perspective).

**Blending: premultiplied "over", not additive.** With a single particle hue $C$,

$$\text{result} = C\,\big(1-\textstyle\prod_i(1-\alpha_i)\big) + B\prod_i(1-\alpha_i)$$

which is **commutative** — order-independent without sorting — and bounded by
$C$: dense regions saturate *to the particle colour*, never past it. Density
reads as opacity, the way real dust scatters light. Additive blending is also
order-independent but unbounded: overlapping sprites (keycap walls seen
edge-on, wordmark strokes, bunching mid-morph) sum past 1, clip and shift to
white — the exact "blown out" look the brief rejects. Additive + tone mapping
avoids clipping but still desaturates dense areas and makes brightness depend
on density. With one accent hue on ~1 % of particles, order dependence is
limited to accent/base overlaps and is imperceptible at our alphas.

**Bloom, restrained.** Physically-based dual-filter bloom (13-tap down, tent
up) on a soft-knee threshold at 0.62 luminance, strength 0.3: only the densest,
brightest regions get a faint halo. Composite in linear light, vignette on the
particle layer only (the ground colour must match the CSS background
exactly), sRGB encode, ±1 LSB triangular dither against banding in the dark
gradients.

**Colour.** Particle, accent and ground colours are read at startup from the
same CSS custom properties Tailwind generates from `@theme`, converted to
linear sRGB. One source of truth.

---

## 7. Failure modes and guards

| Failure | Symptom | Guard |
|---|---|---|
| NaN/Inf enters state | particle vanishes forever / spreads garbage | shader checks `x != x` and \|x\| > 1e4 → reset to target, v = 0 |
| Frame hitch / slow device | spiral of death | substep cap 4 + backlog drop (time dilation) |
| Tab switch | giant dt, everything jumps | loop paused on hidden; clock reset; dt clamp 50 ms |
| Cursor singularity | popcorn near the pointer | bounded poly6 kernel, ε in normalisation |
| Scroll jump (End, scrollbar drag) | target teleports → explosion | progress smoother with max rate; accel + velocity clamps |
| float16 state | shimmer at rest | float32 state |
| 144 Hz vs 60 Hz | judder from 0/1 substeps | render interpolation α |
| sub-pixel sprites | twinkling aliasing | min size + alpha compensation |
| Out-of-focus overdraw | GPU fill cliff during intro | stochastic culling + max size |
| Identical sample patterns | moiré across keycaps | random Cranley–Patterson rotation per primitive |
| Long sessions | noise precision loss | periodic (circular) noise time |
| Chaotic morphs | particles cross everywhere | view-space median-bisection matching |
| Uneven density after adapting count | holes / clumps | progressive R2 tiers |
| WebGL context loss | frozen/black canvas | `webglcontextlost` → stop, `restored` → rebuild |
| React Strict Mode / HMR | double init, leaked contexts | idempotent mount; fresh `<canvas>` per mount; `dispose()` + `forceContextLoss()` |
| Missing float render targets | black canvas | capability check → DOM-only graceful fallback |
| Stuck keys (blur, repeat) | key stays down | release all on `blur`; repeats ignored for ripples |
| Layout thrash | scroll jank | section anchors cached, recomputed on resize/fonts only |
| Reduced motion | discomfort | see §8 |

---

## 8. Reduced motion

`prefers-reduced-motion: reduce` (live-updated):

* no dust intro — the form is present immediately;
* morphs become **dissolves in place**: particles fade out at A and in at B
  (no travel), still scroll-scrubbed and reversible;
* wind reduced to 15 % (the scene still breathes, very slightly), no transit
  boost, no parallax, cursor field off, ripples become a brightness pulse only;
* Lenis smooth-scroll disabled (native scroll).

---

## 9. Per-frame cost (reasoned, not measured headless)

Headless fps is meaningless, so the budget is argued from first principles for
the default **high** tier (N = 102 400) at 1440×900, DPR 1.5:

* **Simulate** (×2 substeps): per texel ≈ 6 texture fetches (pos, vel, seed,
  2 shape pos, 2 shape normals) + 3 simplex-with-gradient (~65 flops each) +
  springs/cursor/stagger (~80 flops) ≈ 300 flops, ~130 B memory.
  → 2 × 102k × 300 = **61 MFLOP**, 2 × 13 MB = **27 MB** traffic.
* **Particles**: vertex ≈ 3 fetches + 16 ripple terms (~15 flops each) + DOF
  ≈ 320 flops → **33 MFLOP**. Fragments: mean sprite ≈ 3.2 px Ø at DPR 1.5
  ≈ 8 px² ⇒ ≈ 0.8 M fragments, RGBA16F blend 16 B → **13 MB**.
  Bokeh is capped by stochastic culling (energy-preserving).
* **Bloom**: ½-res = 1080×675 = 0.73 Mpx; chain ≈ 1.33 × 2 passes × ~13 taps
  → ≈ 25 M texel fetches, mostly cache-friendly.
* **Composite**: 2.9 Mpx × 3 fetches.

Total ≈ 0.1 GFLOP and ≈ 90 MB of traffic per frame → ≈ 6 GFLOP/s and
5.4 GB/s at 60 fps. A mid-range laptop iGPU (Intel Iris Xe: ~2 TFLOP/s,
~60 GB/s shared) spends ≈ 10 % of its bandwidth — headroom for DPR 2. The
real fps is shown in the `?debug` overlay; the adaptive monitor is the safety net.

---

## 10. Tunable parameters

Every value below is live-editable in `?debug` (lil-gui). This table is
generated from `lib/engine/params.ts` (`npm run params:doc`).

<!-- PARAMS:START -->
| group | key | default | range | meaning |
|---|---|---|---|---|
| sim | dt | 1/120 s | 1/240 – 1/60 | fixed timestep |
| sim | maxSubsteps | 4 | 1 – 8 | substep cap per frame |
| sim | maxFrameDt | 0.05 s | 0.02 – 0.1 | frame dt clamp |
| spring | frequency | 0.78 Hz | 0.3 – 2 | f₀ of the target spring |
| spring | damping | 0.82 | 0.5 – 1.2 | damping ratio ζ |
| spring | massJitter | 0.15 | 0 – 0.4 | ± mass variation |
| spring | looseFraction | 0.04 | 0 – 0.15 | share of loose motes |
| spring | looseStiffness | 0.04 | 0.005 – 0.3 | stiffness multiplier for loose motes |
| flow | speed | 0.08 u/s | 0 – 0.6 | RMS wind speed |
| flow | frequency | 0.85 | 0.2 – 3 | spatial frequency |
| flow | evolution | 0.12 | 0 – 0.6 | how fast the wind changes |
| flow | octave2 | 0.4 | 0 – 1 | second octave weight |
| flow | coupling | 1.8 s⁻¹ | 0 – 6 | air drag coefficient |
| flow | transitBoost | 6 | 0 – 15 | wind multiplier mid-morph |
| cursor | radius | 0.55 u | 0.1 – 1.5 | kernel radius |
| cursor | strength | 5 | 0 – 20 | push |
| cursor | wake | 1.4 | 0 – 6 | drag toward cursor velocity |
| cursor | swirl | 0.6 | 0 – 5 | tangential swirl |
| limits | maxSpeed | 3.2 u/s | 0.5 – 10 | velocity clamp |
| limits | maxAccel | 80 u/s² | 5 – 300 | acceleration clamp |
| morph | window | 0.55 | 0.1 – 1 | per-particle share of the transition |
| morph | jitter | 0.25 | 0 – 0.6 | randomness of release order |
| morph | arc | 0.22 u | 0 – 1 | mid-flight lift |
| morph | smoothing | 0.35 s | 0 – 1.5 | scroll-progress smoother |
| morph | maxRate | 1.2 /s | 0.2 – 5 | max shapes per second |
| intro | duration | 4.6 s | 1 – 10 | dust → keyboard |
| keys | travel | 0.04 u | 0 – 0.1 | key travel (4 mm) |
| ripple | speed | 1.25 u/s | 0.2 – 4 | ring speed |
| ripple | width | 0.09 u | 0.02 – 0.4 | ring width σ |
| ripple | amplitude | 0.028 u | 0 – 0.15 | ring height |
| ripple | decay | 1.1 s | 0.2 – 4 | ring lifetime T |
| render | size | 0.0105 u | 0.002 – 0.04 | sprite diameter |
| render | aperture | 0.035 | 0 – 0.2 | depth-of-field strength |
| render | backface | 0.82 | 0 – 1 | fade of back-facing samples |
| bloom | threshold | 0.62 | 0 – 1.5 | soft-knee threshold |
| bloom | strength | 0.3 | 0 – 2 | bloom mix |
<!-- PARAMS:END -->

(Table above is the Phase-1 plan; it is replaced by the generated table once
`params.ts` exists.)

---

## 11. Decision log

* **Brand = MOTE.** See §0.
* **Semi-implicit Euler @ 120 Hz fixed** with interpolation. §1.
* **ζ = 0.82, f₀ = 0.78 Hz** → 1.1 % overshoot, 1.1 s settle. §2.1.
* **Curl noise as wind (drag target), not as force.** Keeps the
  divergence-free guarantee meaningful. §2.2.
* **Poly6 cursor kernel + wake + swirl.** §2.3.
* **R2 + progressive tiers** instead of Poisson disk. §3.1.
* **Median-bisection matching in view space, chain-wise, per tier.** §3.2.
* **Analytic Ricker rings** instead of a height field. §4.
* **WebGL2 GPGPU with MRT**, no WebGPU. §5.
* **Premultiplied over-blending** + energy-conserving DOF. §6.
