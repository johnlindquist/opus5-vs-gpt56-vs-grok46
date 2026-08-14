# Signal Garden — Bioluminescent Ecosystem Synth

A living bioluminescent ecosystem that doubles as an instrument. Anchored **blooms**
drink nutrient light and burst open; **drifters** ferry that energy between them,
trailing wakes; rarer **hunters** stalk the most charged drifters and cut the local
signal when they strike. Every opening sends a wave through the water that neighbouring
organisms relay onward.

**Open `index.html` directly from disk.** No build, no server, no packages, no network.

```
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

The scene animates immediately — nothing is gated behind a click, and there is no
"enable audio" modal. Audio is opt-in and off by default.

---

## Controls

| Input | Effect |
| --- | --- |
| **Move pointer** | Bends nearby trails and drifters like a current; the wake curves around the cursor |
| **Click / tap** | Plants a temporary signal beacon (~9 s) that pulses and draws drifters in |
| **Click-drag** | Paints a nutrient current into the field; blooms downstream feed and brighten |
| **`Space`** | Global pulse from the centre, with a visible 4 s cooldown meter in the legend |
| **`P`** | Pause / resume |
| **`R`** | Regenerate the world with the next deterministic seed |
| **`1` `2` `3`** | Switch ecosystem presets |
| **`M`** | Toggle audio |
| **`B`** | Plant a beacon at centre (keyboard route to the click interaction) |
| **`Tab`** | Move between on-screen controls; focus is clearly ringed |

All controls also exist as buttons in the lower right, so the piece is fully operable
by mouse, touch, or keyboard alone.

Optional deep link: `index.html#2` opens preset 2; `index.html#preset=3&seed=90210`
opens a specific world.

---

## The three organism classes

**Blooms** — anchored to a holdfast, drifting only slightly on their tether. They absorb
nutrient light from the field beneath them; the ring around the core shows how charged
they are. At full charge a bloom opens its petals, emits a signal pulse, releases edible
motes, and occasionally seeds a neighbouring bloom. Drained blooms go **dormant** (dim,
still present) and recover once nutrient returns; long-dormant ones eventually die.

**Drifters** — small teardrop swimmers with two trailing filaments and a persistent
bioluminescent wake. They seek the nearest charged bloom, dock, and drain its *surplus*
(never below the bloom's recharge floor — grazers that strip a bloom bare starve
themselves). Their nucleus brightens as they fill; at full charge they divide. They flock
loosely with neighbours, flee hunters, and starve to death if they wander a barren patch
too long — their remains fertilise the field where they fall.

**Hunters** — rare, angular, dark-bodied silhouettes with rim light and spines. They
target the *most energised* drifter in range, not the nearest. A strike drains the prey
and emits a dashed **disruption wave** that dims and silences organisms it passes,
briefly muting the local signal network. Starved hunters go dormant and drift harmlessly
until they recover.

## How the simulation works

- **Deterministic seeded RNG** (mulberry32). The same seed always produces the same
  initial world — the seed is shown in the readout, and `R` walks a deterministic
  sequence of seeds.
- **Fixed 1/60 s timestep** with an accumulator and a catch-up clamp, so behaviour is
  the same at 30, 60, or 144 fps and a backgrounded tab cannot fast-forward the world.
- **Spatial hash grids** for blooms and drifters. Every neighbour query — seeking,
  flocking, hunting, pulse propagation — reads only nearby cells, so there are no
  all-to-all comparisons at any population.
- **Nutrient field**: a coarse grid of low-frequency plumes that regenerates toward its
  base and is depleted by feeding blooms. Dragging paints into it; dying drifters
  fertilise it.
- **Signal propagation**: a pulse is an expanding wavefront that touches each organism
  exactly once. Excited blooms relay a weaker pulse onward (up to two generations, with a
  live-relay cap), so signals visibly travel *through* the colony rather than merely
  drawing a circle.
- **Stability**: population floors, per-class caps, a grazing floor that lets blooms
  recharge, and bounded relay chains keep the attract state running indefinitely without
  either collapsing or exploding. Verified over simulated hours by `tools/balance.mjs`.

## Rendering

Canvas 2D only — no WebGL, shaders, libraries, or external assets. Layers, back to front:

1. Deep-water radial base.
2. A half-resolution emissive buffer carrying the nutrient haze, slow light banding, and
   every organism's soft light blob, blurred at that resolution and added back over the
   scene. This is the "bloom" glow, and doing it at half res is several times cheaper
   than blurring at full res for an indistinguishable result.
3. A persistent full-resolution trail layer that fades a little each frame — the soft
   wakes.
4. Crisp organism silhouettes, signal rings, motes, and beacons.
5. Vignette.

Depth comes from per-organism `z` affecting scale, brightness, and parallax, plus drifting
marine snow at several depths.

## Accessibility and resilience

- **`prefers-reduced-motion`** is honoured: smaller population, much shorter trail
  persistence, fewer particles, and a softer bloom pass — the ecosystem still runs and
  still reads, it just stops flashing. Verified by `--reduced-motion` runs of both tools.
- **No unsafe flashing.** Brightness changes are gradual per-organism glows and expanding
  rings; there is no full-screen strobe, and the global pulse is rate-limited by a 4 s
  cooldown.
- **Keyboard**: every control is focusable with a visible focus ring, and every pointer
  interaction has a key equivalent.
- **Screen readers**: the canvas is `role="img"` with a live-updating description naming
  the preset, seed, per-class populations, stored energy, and elapsed time.
- **Resize** rescales the living world (organisms, trails, wavefronts, and the nutrient
  field) instead of resetting it; the handler is debounced.
- **Runaway protection**: hard caps on every entity class, on live relays, and on pulses.
- **Mouse, touch, and pen** all go through Pointer Events.

---

## Local checks

```bash
node tools/selftest.mjs                    # 19 checks — simulation, UI, determinism
node tools/selftest.mjs --reduced-motion
node tools/balance.mjs --minutes=4         # ecosystem stays lively and bounded
node tools/balance.mjs --minutes=3 --reduced-motion
node tools/browser-check.mjs               # 21 checks in real headless Chrome
```

`selftest.mjs` and `balance.mjs` run the *real* inline script from `index.html` inside a
Node `vm` against a small Canvas2D/DOM stub, so simulation and draw code are both
exercised. `browser-check.mjs` covers what a stub cannot: real Canvas2D output (it samples
painted pixels), real `KeyboardEvent`/`PointerEvent` dispatch, focusability, Web Audio
availability, console cleanliness, and frame cost.

These tools are development aids. `index.html` is entirely self-contained and does not
reference them.

## Files

```
index.html              the whole artwork — markup, styles, simulation, rendering
README.md               this file
tools/selftest.mjs      headless simulation + UI test suite
tools/balance.mjs       long-run ecosystem balance probe
tools/browser-check.mjs real-browser smoke test (needs a local Chrome/Chromium)
```
