# Lightweaver — Mirror Lab

An optical puzzle you play by moving glass and metal around a dark instrument
board. Rotate mirrors, slide prisms, split beams and filter channels until every
coloured plate reaches its threshold — without letting a ray brush a watcher.

Open `index.html` directly from disk. No build step, no server, no network, no
dependencies, no fonts beyond the ones already on your machine.

```
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

`index.html#3` opens straight into level 3 (any level number works).

---

## Controls

| Input | Action |
| --- | --- |
| **Drag** a piece | Move it (snaps to a 5-unit grid; hold **Alt** for free placement) |
| **Drag the cyan knob** | Rotate the selected piece (snaps to 5°; **Shift** for 1°) |
| **Wheel** over a piece | Rotate it by 5° (**Shift**: 1°) |
| **Q** / **E** | Rotate the selection by 15° (**Shift**: 5°) |
| **← ↑ ↓ →** | Nudge the selection by 5 units (**Shift**: 1 unit) |
| **Tab** / **Shift+Tab** | Cycle through the interactive pieces |
| **Z** / **Y** | Undo / redo |
| **R** | Reset the level |
| **H** | Next hint stage (three stages; never auto-solves) |
| **1** – **5** | Load a level |

Every keyboard action has a labelled button or list entry in the side panel, the
canvas carries an `aria-label` describing the scheme, and the canvas and all
buttons show a visible focus ring. A rapid burst of `Q`/`E` or arrow presses on
one piece within 700 ms counts as a single move, so precision nudging is not
punished by the move counter.

The board opens on level 1 in a partially-solved state: the upper mirror is
already aimed, the lower one is not. About a second in, the game rotates that
lower mirror one notch on its own to show that pieces turn — a single legal,
undoable move. It blocks nothing; touch any control and the demo is cancelled.

---

## Optical model and its assumptions

All optics live in `engine.js`. It is pure, deterministic and DOM-free — the
same level object always produces byte-identical output, which is what makes the
test script meaningful.

**Ray marching.** Each ray is `{origin, unit direction, colour, intensity,
depth}`. The scene is flattened into a flat list of line segments and a ray is
tested against all of them, nearest hit wins. The board is a few dozen segments,
so a linear sweep beats any acceleration structure and keeps ordering exact. A
LIFO stack drains the work list; sources are seeded in declaration order.

**Intersection.** `raySegment` solves `o + t·d = a + u·(b−a)` by Cramer's rule
and accepts only `t > 1e-6` with `u ∈ [0,1]`. Parallel and collinear cases are
reported as misses by design — a beam travelling exactly along a mirror's face
passes it rather than grazing it forever.

**Epsilon strategy.** Two independent guards stop a reflected ray from
immediately re-colliding with the surface it just left: the parametric
`t > 1e-6` rejection above, and a geometric push of `0.06` units along the *new*
direction before the child ray is queued. Pushing along the outgoing direction
rather than the normal keeps grazing reflections stable.

**Reflection.** `d − 2(d·n)n` about the surface normal, where the normal is
flipped when needed so it always faces the incoming ray. Mirrors reflect on both
faces and keep 97% of the light.

**Refraction and dispersion.** Prisms are equilateral glass triangles. Crossings
use Snell's law in vector form with total internal reflection when
`sin²θt > 1`. Refractive index is per channel — R 1.468, G 1.520, B 1.578 — so a
white ray entering the glass splits into three coloured rays that fan apart and
diverge further on exit. Once a ray has a wavelength it keeps it for life.
Whether a crossing is an entry or an exit is decided by the sign of the ray
against the edge's outward normal (outward = away from the centroid).

**Other elements.**

- *Splitter* — half-silvered plate: one reflected child and one transmitted
  child, each at 50% intensity.
- *Filter* — masks the colour to a single channel and keeps 95% of the
  intensity. A ray with nothing left to pass is absorbed.
- *Wall* — absorbs. The board rectangle itself is four implicit walls, so no ray
  can escape and run forever.
- *Target* and *sensor* — circular detectors, not surfaces. Beams pass straight
  through them and register on the way past; that is exactly why a watcher can
  be tripped by a beam that was only passing by.

**Brightness.** Intensity falls off as `exp(−distance / 3000)` in board units.
Each drawn segment carries both its start and end intensity so the renderer can
stroke a gradient; the visible dimming down a long beam is the actual physical
attenuation, not decoration. Rays below 0.045 intensity are dropped.

**Termination.** Three independent caps: 22 bounces per ray, 600 segments per
scene, and the intensity floor. A ray bouncing between two parallel mirrors
terminates on the bounce cap; the test suite asserts this.

**Winning.** A plate is lit when *both* conditions hold:

1. **Intensity** — its accumulated radiance clears the plate's `need`.
2. **Colour** — the cosine similarity between the accumulated `[r,g,b]` vector
   and the plate's colour is ≥ 0.965.

Radiance accumulates additively across beams, so an amber plate is genuinely
satisfied by a red beam and a green beam arriving together, and a red plate is
*not* satisfied by white light — white's hue vector is too far off. A level is
solved when every plate is lit and no watcher has been tripped.

---

## Level format

Levels are data only, in `levels.js`. Nothing there knows how a ray behaves, and
the engine reads nothing from a level except the fields below.

```js
{
  id: 1,
  name: 'First Light',
  objective: 'Shown on the card in the side panel.',
  width: 1200, height: 760,        // logical board units; the view scales, the
                                   // geometry never does
  pieces: [ /* see table */ ],
  solution: { m2: { x: 900, y: 560, angle: 135 } },  // one known-good pose
  hints: ['stage 1', 'stage 2', 'stage 3'],
  hintPiece: 'm2',                 // highlighted from hint stage 2
  demo: { piece: 'm2', angle: 120 }  // optional one-move opening flourish
}
```

| `type` | Fields | Behaviour |
| --- | --- | --- |
| `source` | `x, y, angle, color:[r,g,b], intensity, nozzle` | Emits one ray |
| `mirror` | `x, y, angle, len` | Reflects on both faces |
| `wall` | `x, y, angle, len` | Absorbs |
| `filter` | `x, y, angle, len, channel:'r'\|'g'\|'b'` | Transmits one channel |
| `splitter` | `x, y, angle, len` | 50% reflected + 50% transmitted |
| `prism` | `x, y, angle, size` | Equilateral glass; disperses white |
| `target` | `x, y, r, color:[r,g,b], need` | Plate to light |
| `sensor` | `x, y, r` | Watcher; any ray crossing it voids the solve |

Angles are degrees, clockwise, `0` = screen right. Add `move: true` and/or
`spin: true` to make a piece interactive; anything without them is scenery.

`solution` is used by the geometry tests to prove the level is winnable and by
hint stage 3 to draw a dashed ghost. Every start angle sits on the same 15°
lattice as its solution, so `Q`/`E` alone can always reach the answer.

### The five levels

1. **First Light** — two mirrors, one ruby plate. The vocabulary lesson.
2. **Split Decision** — one white beam through a half-silvered plate; each
   branch runs through its own filter to a differently-coloured plate.
   *Requires splitting.*
3. **Spectrum** — slide and rotate a prism into the white beam so the fan of
   red, green and blue lands on three plates at once. *Requires dispersion.*
4. **Silent Corridor** — the obvious return lane runs straight through a
   watcher. Route underneath it instead. *Requires sensor avoidance.*
5. **Grand Weave** — three sources. Red and green must arrive at the same plate
   to make amber, the white beam must be split and filtered down to blue, and
   the stray transmitted half has to be caught by a movable shutter before it
   reaches the watcher. *Requires mixing, splitting and avoidance.*

---

## Running the checks

```
node test-geometry.js     # or: npm test
```

121 assertions, no dependencies. They cover:

- **Line intersection** — distance and parameter correctness, segments behind
  the ray, misses outside the span, parallel rejection, endpoint inclusivity,
  and both halves of the epsilon rule (a `t=0` self-hit is rejected, a hit one
  epsilon later is accepted).
- **Ray/circle** — entry distance, tangency, grazing, origin-inside.
- **Reflection** — normal incidence, the 45° case, angle-in = angle-out about
  the normal, length preservation, and involution.
- **Refraction** — Snell's law verified numerically, unit output, bending toward
  the normal, total internal reflection either side of the critical angle, and
  that blue deviates more than red.
- **Engine behaviour** — a two-mirror cage terminates on the bounce cap, traces
  are deterministic across runs, walls block, splitters emit two children,
  filters mask to one channel, a prism yields exactly three wavelengths, and no
  segment is degenerate.
- **Scoring** — dim light fails, white fails a red plate, contaminated hues
  fail, red + green satisfies amber, a tripped watcher voids the solve.
- **Every level** — does not start solved, its published solution *does* solve
  it without tripping a watcher, no target is scraping its threshold, the ray
  budget is not exhausted, and the solve survives ±1 unit / ±1° jitter on every
  solution piece.

---

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup and panel chrome; loads the three scripts as classic scripts so `file://` works |
| `styles.css` | Instrument shell |
| `engine.js` | Ray engine and scoring. Pure, deterministic, DOM-free |
| `levels.js` | The five puzzles. Data only |
| `app.js` | Canvas rendering, input, history, persistence |
| `test-geometry.js` | The check suite above |
| `package.json` | Local manifest so Node loads the scripts as CommonJS. No dependencies |

---

## Notes

- **Reduced motion.** With `prefers-reduced-motion: reduce`, glow pulsing,
  aperture spin, beam flicker, dashed-marquee animation and the victory particle
  burst are all switched off, and the opening demo snaps instead of sweeping.
  Ray tracing, beam gradients and every readout keep updating exactly as before.
- **Resizing** changes only the scale factor. Puzzle geometry is stored in fixed
  logical units and never touched.
- **Progress** (solved levels and best move counts) is kept in `localStorage`
  under `lightweaver.progress.v1`, and works from `file://`. If storage is
  unavailable the game runs normally and simply forgets between sessions.
- **Performance.** Rays are re-traced only when a piece actually changes —
  including on every pointer move during a drag, so beams follow the piece
  continuously. The render loop redraws each frame for the glow animation.
