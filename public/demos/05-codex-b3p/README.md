# Lightweaver — Mirror Lab Puzzle

Lightweaver is a dependency-free Canvas 2D optical puzzle. Open `index.html` directly in a modern browser; no server, build step, package, font, or network connection is required.

## Controls

- Drag a cyan-centered optical piece to move it. Rays update continuously.
- Use the mouse wheel over the board, or press `Q` / `E`, to rotate the selected piece by 7.5°.
- Use the arrow keys to nudge the selected piece by 2 geometry units. Hold Shift for 10-unit nudges.
- Press `Z` to undo, `Y` to redo, `R` to reset, and `H` for staged hints.
- Press `1` through `5` to load a level.
- Click the numbered level strip to switch experiments.

The board is keyboard focusable and all controls have visible labels and focus states. Reduced-motion preferences disable the continuous celebration/target animation while leaving live ray updates intact.

## Optical assumptions

The simulation operates in a fixed 1200×680 geometry which is scaled only for display, so resizing cannot alter solutions.

- Rays use deterministic ray/line-segment intersection against all optical surfaces and walls.
- Mirrors use vector reflection across the segment’s surface normal.
- A small `0.08` geometry-unit epsilon advances spawned rays beyond a hit, preventing immediate self-collision.
- Rays are bounded to 18 interactions and 180 total spawned rays, preventing reflection/split loops.
- Intensity attenuates with distance and at every optical interaction.
- Filters preserve only their selected RGB channel.
- Splitters produce a transmitted ray and a reflected ray, each carrying 47% of incoming energy.
- Prisms split an incident ray into red, green, and blue rays with deterministic angular dispersion.
- Walls terminate rays. Forbidden sensors record crossings without blocking them.
- Targets accumulate incident channel energy. Victory requires every target’s specified channels to meet its threshold, unwanted channels to remain below tolerance, and no forbidden sensor to be exposed.

Level 2 requires splitting and filtering. Level 3 requires prism dispersion. Level 4 requires routing around a forbidden sensor. Level 5 requires mixing independent red and blue rays at one receiver.

## Level format

Puzzle definitions live separately in `levels.js`. Each level has this shape:

```js
{
  id: "stable-id",
  name: "Display name",
  objective: "Player-facing goal",
  hint: ["broad hint", "specific hint", "final nudge"],
  sources: [{ id, x, y, angle, color: { r, g, b } }],
  targets: [{ id, x, y, radius, required: ["r"], threshold, label }],
  walls: [{ id, type: "wall", x, y, length, angle }],
  sensors: [{ id, type: "sensor", x, y, length, angle, threshold }],
  pieces: [{ id, type, x, y, length, angle, movable, channel, solution }]
}
```

Angles are radians. Mirror, filter, splitter, prism, wall, sensor, source, and target coordinates all use board geometry units. `solution` is test metadata used only by the local verification script; it is never read by the game.

## Files and checks

- `engine.js` — pure vector geometry, intersection, reflection, and ray propagation.
- `levels.js` — five handcrafted puzzle definitions.
- `app.js` — rendering, interaction, history, hints, persistence, and victory behavior.
- `styles.css` — responsive instrument UI and reduced-motion treatment.
- `geometry-tests.js` — pure-function and authored-solution tests.

Run the tests with:

```sh
node geometry-tests.js
```

Completion and best move counts are stored locally under the `lightweaver-progress` localStorage key.
