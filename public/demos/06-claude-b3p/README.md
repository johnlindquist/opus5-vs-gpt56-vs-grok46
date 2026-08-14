# Sand Alchemist — Elemental Cellular Automata

A falling-sand laboratory: paint materials into a bounded world where they fall, flow,
burn, freeze, grow, boil and react through a shared temperature field.

**Open `index.html` directly from disk.** No build step, no server, no dependencies, no
network access, no external fonts or assets. Everything — markup, CSS, simulation and
renderer — lives in that one file.

---

## Contents

| File | Purpose |
| --- | --- |
| `index.html` | The entire artifact: UI, simulation and renderer. |
| `README.md` | This document. |
| `test/headless.mjs` | 87-assertion behaviour suite. `node test/headless.mjs` |
| `test/env.mjs` | Minimal DOM/Canvas stub used to run `index.html`'s script under Node. |
| `test/perf.mjs` | Timing harness. `node test/perf.mjs` |

The test harness extracts the `<script>` block from `index.html` **verbatim** and runs it
against a stub DOM, so the assertions exercise the same code the browser runs — including
its keyboard bindings, which are dispatched through the page's real `keydown` listener.

---

## The world

A fixed logical grid of **400 × 225 cells**, drawn at **1600 × 900** with a 4× nearest-
neighbour upscale. Cells stay crisp squares rather than being blurred away.

Per-cell state is four bytes:

| Array | Type | Meaning |
| --- | --- | --- |
| `mat` | `Uint8` | material id |
| `aux` | `Uint8` | material-specific counter — flame life, plant vigour, lava heat budget, ice chill budget, gas lifetime |
| `temp` | `Int16` | temperature in °C |
| `stamp` | `Uint16` | tick number of this cell's last update |

Ambient temperature is 20 °C.

### Update order

Rows are scanned **bottom to top** so falling matter resolves correctly in one pass. The
horizontal sweep direction flips with **both tick parity and row parity**
(`ltr = ((tick + y) & 1) === 0`), which cancels the permanent left- or right-drift that a
fixed scan direction produces. A symmetric sand pile stays symmetric to within ~3 %
(asserted in the suite).

**Each cell updates at most once per tick.** When a cell moves, its destination is stamped
with the current tick number, so the scan skips it when it arrives there. A falling grain
therefore advances exactly one cell per tick — never two — and this is asserted directly.
Stamps are never bulk-cleared; the tick counter is compared instead.

---

## Materials

Twelve required materials plus six extras. Number keys `1`–`9` select the first nine;
`0` is the eraser; the rest are one click (or a shifted digit) away in the palette.

### Powders — fall straight down, then slide diagonally

| Material | Behaviour |
| --- | --- |
| **Sand** | Falls and piles into cones with sloped shoulders. Above **950 °C** it fuses into **Glass** (30 %/tick). The vitrification point sits above what an open flame can drive sand to, so only direct lava contact makes glass. |
| **Salt** | Dissolves into adjacent **Water** to make **Brine** (30 %/tick, the salt grain is consumed). Touching **Ice**, it melts it straight to water (16 %/tick) — a de-icer. See **Salt, specifically** below. |
| **Ash** | Inert residue of fire. Piles like sand but creeps sideways slightly (18 %/tick) so drifts settle loosely. |

### Liquids — fall, spill diagonally, then flow along the surface

Denser liquids sink through lighter ones (a density gap of >0.05 is required to swap), and
powders sink through any liquid less dense than themselves.

| Material | Density | Spread | Behaviour |
| --- | --- | --- | --- |
| **Water** | 1.00 | 10 | Boils to **Steam** at ≥100 °C; freezes to **Ice** at ≤0 °C (30 %/tick). |
| **Oil** | 0.80 | 6 | Lighter than water, so it **floats on top of it**. Ignition chance 0.60/tick from an adjacent flame — it flashes over in about a second. Self-ignites above 300 °C. Burns for 80 ticks. |
| **Brine** | 1.12 | 10 | Salt water. Denser than fresh water, so it sinks beneath it. Does not freeze until **−14 °C**. Boiling it above 104 °C leaves the salt behind 28 % of the time. |
| **Acid** | 1.05 | 7 | Dissolves sand, stone, wood, plant, glass and ash into smoke, consuming itself as it works. Cannot touch **Wall**. |
| **Lava** | 3.60 | 2 | Deliberately sluggish — it only attempts to move on 42 % of ticks, so it spreads roughly a third as fast as water. See below. |

**Surface flow.** A liquid that cannot fall walks sideways looking for room, and it is
allowed to **wade through its own kind** while doing so. This matters: if the walk may only
cross open cells, a broad standing dome is a *fixed point* of the rules — every surface cell
has its own liquid on both sides at the same row, so nothing can move and the dome never
relaxes. Wading gives the hydrostatic "water finds its level" behaviour. A 14-cell-wide pour
spreads across ~394 columns and levels to within **3 cells** of variation, and water poured
onto a shelf drains almost entirely (591 cells low vs 3 high) to the floor below.

### Gases — rise, wander, expire

| Material | Behaviour |
| --- | --- |
| **Fire** | Holds itself near 820 °C and radiates heat into its neighbours. Ignites adjacent fuel, and **dies instantly** into steam if it touches water, brine or ice. Life runs 40–84 ticks when painted, or the fuel's own burn value when it is born from burning matter. On expiry: smoke (22 %), ash (10 %), otherwise nothing. A flame **clings to what it is eating** — it only tries to move on 10 % of ticks while fuel is beside it, versus 55 % once the fuel is gone. Without that, flames float off their own fire before igniting anything. |
| **Steam** | Rises through air *and bubbles up through liquids*. Cools as it climbs and condenses back to **Water** below 90 °C, and in any case after 150–240 ticks. |
| **Smoke** | Rises, spreads and fades out after 90–180 ticks. |

### Solids — never move

| Material | Behaviour |
| --- | --- |
| **Stone** | Static. Glows visibly above 340 °C and remembers the heat that made it while cooling. Remelts to lava above 1420 °C. |
| **Wood** | Static fuel. Ignition chance 0.030/tick from an adjacent flame; self-ignites above 430 °C. Burns for 150 ticks and leaves ash. |
| **Plant** | Grows. See below. |
| **Ice** | An active cold source with a finite budget. See below. |
| **Glass** | Fused sand. Melts back to lava above 1520 °C. |
| **Wall** | Indestructible container. Immune to acid, heat and every reaction; the world border is made of it. |

### Plants

On 7 % of ticks a plant attempts to grow. It needs **both**:

1. **Something to root in** — a plant, wood, sand, stone or glass cell somewhere in its
   eight neighbours; and
2. **Water within two cells.** Roots reach a 5 × 5 neighbourhood, so a plant standing on a
   dry bank can still tap the pond beside it rather than having to stand in it.

Growth consumes **one water cell**, which is deleted, and places a new plant in an adjacent
empty cell — biased upward (three of seven candidate offsets are straight up), or
occasionally into shallow water (25 %). The new sprout inherits its parent's **vigour**
(`aux`) minus one, and the parent decrements too, so a stand grows a finite amount and then
stops rather than filling the world. Painted plants start with vigour 10.

Plants are very flammable (0.20/tick, self-igniting above 150 °C, burning for 46 ticks) and
freeze into ice below −6 °C.

### Lava

Sluggish — it only attempts to move on 42 % of ticks and has a spread range of 2, so it
crawls where water runs. Each tick it:

- **Ignites** every burnable neighbour at 1.35× that material's flammability;
- **Quenches** against adjacent water, brine or ice: the coolant flashes to **Steam**, the
  lava loses 240 °C outright, and it skins over into **Stone** 55 % of the time;
- **Freezes to Stone** below 640 °C, which the cooling glow makes visible as it happens.

Its heat comes from a finite budget — see *Finite heat and chill budgets* below.

### Ice

Ice is an *active* cold source, not merely a cold solid: while it has chill budget it holds
itself at −22 °C and drives its four neighbours toward −20 °C. It melts back to **Water**
above 0 °C (10 %/tick). Salt melts it directly on contact. Its budget, and why ice formed by
freezing gets none of it, is described under *Finite heat and chill budgets* below.

---

## The temperature model

Heat is what ties the materials together, and it works through three mechanisms.

### 1. Diffusion

Every tick, an explicit diffusion pass runs over the whole grid:

```
T' = T + conductivity × (mean of 4 neighbours − T)
```

Out-of-bounds sides act as ambient air. Every cell then relaxes gently toward 20 °C
(3.5 %/tick for empty air, 0.8 %/tick for matter) so the world does not cook forever.

### 2. Radiative coupling

Diffusion alone is far too slow for contact reactions — a log touching a flame would take
thousands of ticks to reach its ignition point. So **flames, lava and ice also push their
four neighbours directly** toward a driving temperature:

| Source | Holds itself at | Drives neighbours toward | Rate |
| --- | --- | --- | --- |
| Fire | 820 °C | 900 °C | 0.13 |
| Lava | 1320 °C | 1150 °C | 0.12 |
| Ice | −22 °C | −20 °C | 0.10 |

This is what makes "fire heats what it touches" and "ice chills what it touches" legible
within a few seconds instead of a few minutes. Note that the lava driver (1320 °C) sits
*below* stone's melting point (1420 °C), so a lava flow vitrifies sand and ignites wood but
never chain-melts the rock it is sitting in.

### 3. Latent heat

Every phase change moves heat into or out of its four neighbours:

| Change | Neighbours | Clamp |
| --- | --- | --- |
| Water → Steam | −26 °C | never below 12 °C |
| Water → Ice | +22 °C | never above 60 °C |
| Ice → Water | −22 °C | never below −60 °C |
| Steam → Water | +10 °C | never above 60 °C |

The clamps matter. Boiling must never chill its neighbour past freezing — without that
bound, water beside lava boils so hard that it super-chills the surrounding water and
**turns to ice next to molten rock**, which is exactly the sort of nonsense an unbounded
energy transfer produces. The suite asserts that quenching lava yields steam and stone and
*never* a single cell of ice.

### Finite heat and chill budgets

Lava and ice would otherwise be free, infinite energy sources — a lava pool reheats itself
every tick and can never crust over, and one ice cube eventually converts every drop of
water in the world. Both instead carry a budget in `aux`:

- **Lava** starts with 255 and spends it at 35 %/tick — roughly **twelve seconds** of
  incandescence. Once spent it simply cools, glowing orange, and freezes to **Stone**
  below 640 °C.
- **Ice** starts with 255 when painted or placed by a preset, and spends it the same way.

**Ice formed by freezing inherits a budget of zero.** This is deliberate and it is the whole
reason a freeze front terminates: give newly frozen cells any positive budget and each one
becomes a fresh refrigerator, and the entire world ices over inside a minute. As built, a
front advances only as far as the *original* ice can carry cold by conduction. A single ice
cell dropped into a 7 760-cell tank freezes fewer than 400 cells and leaves the rest liquid;
a 440-cell ice cap over a contained 440-cell pond freezes most of it and then stalls.

---

## The named reactions

Each of these is asserted in `test/headless.mjs`:

- **Sand falls and piles** into a cone wider than the column that fed it.
- **Water flows, seeks the low point and self-levels**, and abandons a shelf for the floor.
- **Water becomes steam or ice** — boiled by lava, frozen under an ice cap.
- **Fire rises**, eats through a solid wood block completely, leaves ash and smoke, and
  **expires** to nothing when there is no fuel.
- **Oil floats on water** (mean oil depth sits ~6 cells above mean water depth) and
  **burns aggressively** — a slick drops to under 20 % in 120 ticks, while the same volume
  of wood lit the same way keeps over 20 % over the same span.
- **Plants grow** beside water and soil, drinking the pond as they climb, and do **not**
  grow without water or without something to root in.
- **Lava flows slowly** (a third of water's spread rate), **ignites burnable matter**,
  **flashes water to steam** and **cools into stone**.
- **Salt dissolves into brine**, brine **resists freezing** at −6 °C where fresh water
  would set, and salt **melts ice** into liquid.
- **Steam rises** and **condenses** back to water in cool regions.
- **Lava fuses sand into glass**; stone is completely static.

### Salt, specifically

Salt is modelled in the simplified way the brief asks to be documented:

1. Salt touching **water** dissolves — the grain disappears and the water becomes **Brine**.
2. Brine's freezing point is **−14 °C** instead of 0 °C. Freezing-point depression is
   modelled as a flat offset on the phase-change threshold, not as a function of
   concentration; brine is a single material rather than a variable salinity value.
3. Salt touching **ice** converts it directly to water (16 %/tick) and is consumed —
   a de-icer, modelled as a direct phase change rather than through the temperature field.
4. Boiling brine leaves solid **Salt** behind 28 % of the time, and steam otherwise.

---

## Controls

### Pointer

| Input | Action |
| --- | --- |
| Drag | Paint the selected material |
| **Right-drag** | Erase (the browser context menu is suppressed on the canvas) |
| **Shift + click** | Draw a straight line from the previous point |
| **Wheel** | Brush size (hold Shift for ±4) |

### Keyboard

| Key | Action |
| --- | --- |
| `1`–`9` | Select Sand, Water, Stone, Wood, Plant, Fire, Oil, Ice, Lava |
| `0` | Eraser |
| `!` `@` `#` `$` `%` `^` `&` `(` | Salt, Brine, Ash, Smoke, Glass, Acid, Wall, Steam |
| `Space` | Pause / resume |
| `.` | Advance exactly one tick (and stay paused) |
| `R` | Restore the selected preset |
| `C` | Clear the world to its walls |
| `E` | Toggle the eraser |
| `[` `]` | Brush size |
| `F1`–`F4` | Volcano, Terrarium, Oil Fire, Frozen Lake |
| `/` | Focus the palette search box |

Shortcuts are suppressed whenever a form control has focus, so typing in the search box or
nudging a slider with the arrow keys never fires a shortcut as well. `Space` and `Enter` on
a focused button activate the button only. Browser chords (Ctrl/Cmd/Alt) are left alone.

### Keyboard-only painting

`Tab` to the canvas, then:

| Key | Action |
| --- | --- |
| Arrow keys | Move the paint cursor (2 cells, or 10 with Shift) |
| `Enter` | Paint at the cursor |
| `Shift + Enter` | Draw a line from the previous point |
| `Backspace` / `Delete` | Erase at the cursor |

### Panel

Pause, Step, Reset, Clear; a 9-stop speed control from **0.10× to 4.00×**; a seed slider;
brush size; an eraser and an additive-only paint mode; four scene buttons; and toggles for
bloom, embers, a temperature-heatmap view, and reduced motion.

The palette has a **search box** — type to filter, `Enter` picks the first match, `Escape`
clears it and returns focus to the canvas.

---

## Scenes

All four are generated from a **seeded PRNG** (mulberry32), so a given seed reproduces its
world bit-for-bit; the suite asserts that seed 137 gives an identical 200-tick fingerprint
across two loads, and that a different seed gives a different one. The same stream then
drives the simulation, so an untouched run is fully deterministic.

Scenes may install **emitters** — sources that keep producing material. An emitter can be
capped against the world's material census (`{mat, max}`) so a spring tops up its terrarium
without drowning it, scheduled to start later (`after`), and allowed to seed flame into fuel
rather than only into empty space (`ignite`).

| Scene | What it demonstrates |
| --- | --- |
| **Volcano** *(default)* | A basalt cone with a sinuous magma conduit. Lava spills over the crater, sheets down both flanks, flash-boils the meltwater lake into a steam plume and freezes into new stone; a fire front sweeps the eastern grove of wood, plants and a spilled oil pool. |
| **Terrarium** | A sealed glass vivarium. Ice caps drip meltwater springs, sand beds soak it up so plants climb the walls, a salt pan brines the shallows and a small hearth keeps a steam cycle running. Plants roughly triple over the first minute. |
| **Oil Fire** | A flooded refinery bay. Oil floats in a slick on top of the water, a pilot light takes hold at ~6 s and the slick flashes over into a full-width sheet of flame, gantries char and collapse, a reservoir tops the spill back up, and at ~12 s a suspended crucible overhead begins dripping lava onto the bay. |
| **Frozen Lake** | A deep lake under a thin ice sheet, warmed from below by a geothermal vent so the sheet stays a lid on open water. Scattered salt melts it into brine that stays liquid far below zero. |

A plain-language summary of the active scene is displayed in the panel and announced through
an `aria-live` region.

**Attract behaviour.** The default Volcano scene is already erupting at load — no input, no
tutorial modal, nothing to dismiss. Seven seconds in it holds roughly 2 600 lava, 2 000
water, 1 000 wood, 130 plants, 140 steam and an active fire, with lava visibly cooling into
fresh stone.

---

## Performance

Measured with `node test/perf.mjs`, which times the real simulation step and the real
renderer's CPU-side pixel work. Node's `vm` context is slower than a browser JIT, so these
numbers are pessimistic relative to what the page actually achieves.

At the default 400 × 225 grid, against a 16.67 ms budget at 60 fps:

| Scene | Simulation | Renderer | Total | Once settled |
| --- | --- | --- | --- | --- |
| Volcano | 4.27 ms | 2.19 ms | **6.46 ms** | 2.35 ms |
| Terrarium | 2.28 ms | 1.08 ms | **3.36 ms** | 2.23 ms |
| Oil Fire | 3.20 ms | 3.95 ms | **7.14 ms** | 3.30 ms |
| Frozen Lake | 7.51 ms | 1.52 ms | **9.02 ms** | 8.33 ms |

The heat field alone costs 0.56 ms/tick on an empty world. Every scene fits inside the frame
budget at the default 1× speed with room to spare. At the maximum 4× setting the loop runs up
to four ticks per frame, so the frame rate will drop on the busier scenes; the step count is
capped at four so the loop can never spiral.

The choices that get it there:

- **Chunk sleeping.** The grid is divided into 16 × 16 chunks. A cell only updates if its
  chunk is awake, and a chunk is woken when anything in or beside it changes. Settled sand
  and still water cost nothing.
- **Wake on temperature *change*, not absolute temperature.** Waking every cell that merely
  differs from ambient means a large cold lake or hot rock mass never sleeps at all, which
  costs more than the optimisation saves. A gradient at steady state stops changing, and its
  region rests. This alone cut the Frozen Lake scene from 12.2 to ~7.5 ms/tick.
- **Deep-frozen ice rests.** Ice with a spent chill budget that is comfortably below zero
  stops waking itself.
- **Tick-stamped cells** instead of a per-frame `moved` array that would need clearing.
- **A pre-baked colour lookup table** — 32 shading variants per material, so per-cell
  rendering is an array index rather than arithmetic. Per-cell colour noise is fixed at
  startup so materials do not shimmer between frames.
- **A shared material census**, recomputed once every 30 ticks, feeds both the emitter caps
  and the HUD's "filled" readout instead of each doing its own full-grid scan.
- **A fixed-capacity particle pool** (420 slots). Slots are recycled and the live prefix is
  compacted in place — nothing is allocated in the animation loop, so overlay memory is
  constant. The suite asserts the cap holds across 900 ticks.
- **Bloom without a blur filter.** The emissive layer is rendered at grid resolution and
  composited twice with `lighter` — once at 1:1 and once from a quarter-size copy — so the
  upscaler does the blurring for free. Cells are drawn with smoothing *off* so they stay
  readable; only the glow is smoothed.

---

## Resize

**The world is never resampled.** The logical grid is a fixed 400 × 225 at a fixed 16:9
aspect, and the canvas backing store is a fixed 1600 × 900. Resizing the browser only
rescales the *view*: CSS fits the canvas inside its frame with `max-width`/`max-height` and
`aspect-ratio: 16/9`, and `image-rendering: pixelated` keeps cells crisp at any scale.

This is a deliberate trade. Resampling a cellular automaton on resize has no correct answer —
every interpolation invents or destroys matter and can create or erase mid-reaction state.
Holding the world fixed means a resize is **guaranteed** lossless: the simulation does not
observe the window at all. The cost is that a very wide window letterboxes rather than
revealing more world. Below 820 px the layout stacks the panel above the stage.

---

## Accessibility

- **Full keyboard operation.** Every control is a real focusable `button`, `input` or
  `select`, and the canvas itself is keyboard-paintable (see above).
- **Visible focus.** A `:focus-visible` outline is applied globally and is not suppressed
  anywhere.
- **Labels and state.** Palette and toggle buttons carry `aria-pressed`; the canvas has
  `role="application"` and an `aria-label` explaining its keyboard model; the search input
  has a label; every material button's `title` carries its full behaviour description.
- **Text summary.** The active scene's description is rendered as prose in an `aria-live`
  region, so the state of the world is available without seeing it.
- **Reduced motion.** `prefers-reduced-motion: reduce` is detected on load and can be
  toggled manually. It disables the decorative bloom pulse and the per-frame flame flicker,
  and cuts secondary particle spawning from 12 to 3 candidates per tick. It **does not touch
  any cell rule** — the simulation is bit-identical either way.
- **No unsafe flashing.** The only periodic full-screen modulation is the bloom pulse at
  ~0.35 Hz with a 5 % amplitude, far below the three-flashes-per-second threshold, and it is
  disabled entirely under reduced motion. Flame flicker is per-cell colour variation, not a
  full-field luminance change.

---

## Testing

```
node test/headless.mjs
```

87 assertions across 20 groups: material definitions, the attract scene's evolution over
seven seconds, every named reaction, absence of directional bias, the one-update-per-cell
guarantee, all four presets running 900 ticks, seeded determinism, the particle cap, brush /
line / eraser, every keyboard binding dispatched through the page's real listener, and the
render path in all view modes.

---

## Known behaviour worth expecting

- **The Volcano's grove burns out.** The fire front crosses the eastern stand in roughly
  twenty seconds and the wood does not grow back; the scene's perpetual engine after that is
  the lava/stone/steam cycle at the lake. Press `R` to restore it. The Terrarium is the
  scene built for a long-running, self-sustaining ecosystem.
- **The Volcano slowly buries itself.** A capped vent keeps erupting, so stone accumulates
  over minutes. That is the intended arc of a volcano rather than a steady state.
- **A large ice mass in a sealed tank will eventually freeze most of it.** The front is
  bounded per-source, but a big enough source has a big enough budget. This is physically
  reasonable and is not a runaway — the earlier world-consuming version is documented above
  and fixed.
- **Steam is lossy.** A flame quenched by water becomes a steam cell, and boiling clamps its
  latent draw. Material count is not strictly conserved across phase changes; the model
  targets legibility over conservation.
