# Kinetic Poster Foundry — Type as Physics

A local design toy: you type a phrase, and the letterforms become a physical poster
made of sampled nodes, structural springs, wind, vortices and light.

**Open `index.html` directly from disk.** No server, no build step, no dependencies,
no network requests, no fonts or images beyond what your operating system already has.

---

## The physical model

### 1. Type → mask → nodes

Every rebuild runs the same deterministic pipeline:

1. **Compose.** The phrase is split on `/`, `|` or newlines into lines. The chosen
   layout mode decides whether they stack, offset, justify, or collapse to one line.
   A font size is solved so the block fits exactly inside the poster margins — it is
   fitted to *both* the content width and the content height, so margins and
   alignment genuinely re-compose the page rather than just nudging it.
2. **Render offscreen.** The composed lines are drawn glyph by glyph (with per-font
   tracking, and per-character justification spacing in Justified mode) onto a hidden
   1600×900 canvas.
3. **Sample.** `getImageData` gives an alpha mask. A coarse lattice pass estimates the
   inked area, and the sampling step is derived from it: `step = sqrt(area / budget)`.
   That keeps the node count roughly constant whether the phrase is `HI` or a
   four-line paragraph. Sample points are jittered by a seeded PRNG (mulberry32,
   seed `0x5eed1234`), so the same phrase always produces the same poster.
4. **Classify.** Each node probes the mask one step away in four directions. If any
   probe lands outside the glyph, the node is a **contour** node; otherwise it is an
   **interior** node. This single bit is what keeps the type crisp: contour nodes are
   bright, densely linked and mobile; interior nodes are dim, sparsely linked and
   stiffer. Letterforms read as letterforms instead of as a hairball.

### 2. Structure

Nodes are linked through a spatial hash into short springs at their sampled rest
length. Contour nodes get the full degree budget so the outline forms continuous
filaments; interior nodes get less, which leaves counters (the holes in `O`, `R`,
`G`) open. Links are grouped once per rebuild into
`[8 colour buckets + accent] × [interior | contour]` batches, so a whole class of
links is stroked with one path and one style change per frame.

### 3. Forces

Per node, per frame:

| Force | Behaviour |
| --- | --- |
| **Home spring** | Pulls each node toward its typographic position. Interior nodes use 1.6× the stiffness, so the letter body holds while the edge dances. |
| **Link spring** | Soft distance constraint at the sampled rest length — this is what preserves local letter structure under heavy deformation. |
| **Ambient flow** | A cheap deterministic sin/cos field, so the very first frame is already alive without any input. |
| **Wind** | Pointer *velocity* injected into a radius around the cursor, falling off quadratically. Moving the mouse blows the type around; a still mouse does nothing. |
| **Vortex** | While dragging: a tangential force around the pointer plus a slight inward draw, so the type twists rather than merely orbiting. Strength scales with drag distance; direction follows the drag's rotational sense. |
| **Ripple** | A travelling Gaussian ring (`exp(-((d - age·speed)/width)²)`) pushing radially outward, emitted on pointer release and on impulse, decaying over its lifetime. |
| **Impulse** | A one-shot radial velocity kick from the poster centre with seeded per-node variation, plus a ripple. |
| **Damping** | Velocity multiplied by `damping^dt`, then speed-clamped, with a soft containment force outside the poster bounds. |

Integration is semi-implicit Euler on a normalised timestep (1.0 = one 60 Hz frame),
clamped so a tab-switch stall cannot explode the simulation.

`R` (rest) temporarily multiplies home stiffness by 2.4 and caps damping, so the
phrase glides back into its typographic form instead of snapping.

### 4. Light

Everything is drawn onto a fixed 1600×900 stage. Trails come from fading the stage
toward its background gradient with a partial-alpha fill rather than clearing it —
so *trail* is literally "how little of the previous frame is erased". Glow is a wide,
low-alpha bloom pass under a thin bright core pass, drawn with `lighter` compositing
on dark palettes and `source-over` on light ones. Links are split into two energy
tiers per frame, so fast-moving links read as hot filaments.

---

## Controls

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Full-poster impulse |
| `R` | Return the type smoothly to rest |
| `P` | Pause / resume |
| `1` – `4` | Curated presets |

Keys are ignored while a text field or select has focus, so typing a phrase never
fires an impulse.

### Pointer

- **Move** — local wind field follows the cursor.
- **Drag** — vortex; bends and twists the type around the pointer.
- **Release** — a visible ripple travels out through the composition.

### Panel

`Phrase` (use `/` for a line break) · `Font stack` (five system stacks) ·
`Layout` (Stacked / Offset split / Justified block / Single line) · `Alignment` ·
`Margins` · `Density` · `Stiffness` · `Damping` · `Trail` · `Glow` · `Palette`
(six) · `Crop marks & grid` · `Export PNG` · `Rest` · `Pause`.

Editing the phrase is debounced and rebuilds only the sample map — the page layout,
focus and caret are untouched.

---

## Presets

Each preset changes composition, motion and line treatment, not just colour.

| # | Preset | Composition | Motion | Line treatment |
| --- | --- | --- | --- | --- |
| 1 | **Electric ribbon** | Stacked, centred, 10% margins | Loose springs, long trails | Glowing filament mesh, heavy bloom, bright contour |
| 2 | **Chrome pulse** | Offset split, left, 12% margins | Stiff and quick, medium trails | Sparse silver stipple, near-invisible interior, a specular band sweeping across the type |
| 3 | **Soft ink** | Justified block, 15% margins | Slow, heavily damped, minimal trails | Round soft strokes on warm paper, no bloom, filled interior |
| 4 | **Signal grid** | Single line, left, 7% margins | Very stiff, snappy | Dense orthogonal (L-shaped) connectors plus scanlines |

---

## Export

**Export PNG** downloads exactly 1600 × 900 pixels.

The visible canvas *is* the poster stage — the simulation renders into a fixed
1600×900 design space and CSS only scales it for display. So export is a direct
`toBlob` of the current canvas: it contains the live poster state and nothing else.
The editor UI is ordinary DOM and can never appear in the file. Crop marks, grid and
the caption line are part of the poster and export with it; switch off
*Crop marks & grid* first for a bare composition.

---

## Edge cases

- **Empty phrase** — the poster becomes an empty composition: crop marks, a centred
  hairline rule and a quiet `TYPE A PHRASE TO BUILD THE POSTER` note. No nodes, no
  errors, still interactive.
- **Very long phrase** — clipped to 140 characters, word-wrapped to at most four
  lines, and the fitted size never drops below 22px. Density is unchanged because the
  node budget is area-derived, not glyph-derived.
- **Small screens** — the node budget drops (4200 → 2600 → 1500 by viewport width),
  and the layout stacks the panel under the canvas.
- **Reduced motion** — `prefers-reduced-motion` halves the node count, clamps trails
  to 0.12, damps ambient flow and impulse amplitude to about a third, and shows a
  badge. The poster stays static-ish but wind, vortex and ripple still deform it.

---

## Architecture

| File | Role |
| --- | --- |
| `index.html` | Markup and controls only |
| `styles.css` | Editor chrome |
| `engine.js` | Typography, sampling, physics and rendering. Knows nothing about the UI; the host injects the canvas factory, so the same code runs headless. |
| `app.js` | DOM wiring, animation loop, input, export |
| `check.cjs` | Headless simulation harness (42 checks) |
| `audit.mjs` | Static audit: no remote references, DOM wiring, labels (18 checks) |
| `checks/` | Two browser probe pages plus their captured output |

The sample map is rebuilt only when the phrase, font, layout, alignment, margins or
density change — never per frame. Light and palette controls recolour without
resampling.

## Running the checks

```sh
node check.cjs     # simulation: sampling, springs, presets, edge cases
node audit.mjs     # static: no network refs, DOM wiring, accessibility affordances
```

The two pages in `checks/` are opened in a browser (they were verified with headless
Chrome) — `preset-probe.html` renders all four presets mid-interaction side by side,
and `app-probe.html` drives the real editor and prints the PNG export dimensions,
keyboard results, focus behaviour and console-error count on top of the page.
