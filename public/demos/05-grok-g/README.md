# Lightweaver — Mirror Lab Puzzle

A local optical bench. Open `index.html` directly from disk (double-click or `file://`). No server, packages, or remote assets.

## Controls

| Action | Input |
| --- | --- |
| Select | Click an optic |
| Drag | Pointer on a free piece |
| Rotate | Orbit handles, mouse wheel, `Q` / `E` |
| Fine rotate / move | Hold `Shift` (1° / 1 px) |
| Nudge | Arrow keys (4 px, or 1 px with Shift) |
| Undo / redo | `Z` / `Y` |
| Reset level | `R` |
| Staged hint | `H` (never auto-solves) |
| Load level | `1`–`5` or the masthead strip |
| Cycle pieces | `Tab` / `Shift+Tab` |
| Deselect | `Escape` |

Visible focus rings sit on the level buttons, tool buttons, skip link, canvas, and victory action. Control labels are in the footer and on each button (`aria-label` / `aria-keyshortcuts`).

Completed laboratories and best move counts persist in `localStorage` under `lightweaver-lab-v1`.

Reduced-motion preference disables the intro demonstration, beam-adjacent pulse, and victory motes. Beam geometry still updates every frame.

## Optical assumptions

World space is a fixed **1000 × 620** bench. The canvas letterboxes on resize; piece coordinates never change with the window.

Rays are half-lines. Each step finds the nearest **line-segment** hit among mirrors, filters, splitters, prism edges, walls, board borders, circular target rims, and rectangular sensors.

- **Mirrors** reflect with \(\mathbf{R} = \mathbf{I} - 2(\mathbf{I}\cdot\mathbf{N})\mathbf{N}\). The surface normal is flipped so it faces the incoming ray.
- **Filters** multiply the beam RGB by the plate tint (a channel gate).
- **Splitters** emit a reflected copy and a transmitted copy, each at half energy.
- **Prisms** disperse on first contact: residual red, green, and blue leave at a fixed angular spread about a slightly inward-biased through direction.
- **Walls and borders** absorb.
- **Targets** absorb and accumulate color; they do not continue the ray.
- **Sensors** absorb. Any sensor energy above a small floor makes the lab illegal even if targets are fed.

Intensity falls as \(\exp(-0.00055 \cdot d)\) along each segment. Victory requires every target’s accumulated RGB, after attenuation, to match the expected chromaticity (normalized Euclidean distance \(< 0.38\)) and to exceed that target’s `minIntensity`.

Bounce cap is 28. Global ray cap is 220. A spawn offset of **0.85 world units** plus a skip of the last collider id (and prism/piece id) prevents a reflected or transmitted ray from immediately colliding with the same surface.

Parallel mirrors cannot loop forever: the bounce cap ends the chain.

## Level format

Levels live in `js/levels.js` as plain data. The ray engine in `js/optics.js` does not own puzzles.

```text
{
  id, name, subtitle, objective, hintStages[],
  demo?: { pieceId, fromAngle, toAngle, duration },
  walls:    [{ id, x1, y1, x2, y2 }],
  sources:  [{ id, x, y, angle, color: [r,g,b], label }],
  pieces:   [{ id, type, x, y, angle, length|radius, tint?, movable, rotatable }],
  targets:  [{ id, x, y, color, radius, minIntensity, label }],
  sensors:  [{ id, x, y, w, h }]
}
```

`type` is `mirror` | `filter` | `splitter` | `prism`. Angles are radians, canvas convention (y down, 0 = east). Filters use `tint` as a per-channel multiplier.

The default laboratory is level 1: teal is already locked, crimson still needs the free lower mirror. A short non-blocking rotation demonstrates one legal fold, then the bench is fully interactive.

Level 2 requires additive yellow (red + green). Level 3 requires a splitter and chromatic filters. Level 4 requires a prism fan. Level 5 requires routing around a forbidden sensor.

## Tests

```sh
node tests/optics.test.cjs
```

The script loads the engine through a VM sandbox (this tree may sit under a `"type": "module"` parent) and checks intersection, epsilon skipping, 45° reflection, loop caps, filters, splitters, and known solutions for all five labs.

## Files

- `index.html` — entry
- `css/style.css` — chrome
- `js/optics.js` — deterministic ray engine
- `js/levels.js` — five handcrafted benches
- `js/app.js` — interaction, undo, persistence, canvas draw
- `tests/optics.test.cjs` — geometry tests
