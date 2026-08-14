# Neon Courier — One-Button Rooftop Heist

A polished, replayable one-button arcade runner. You are a courier sprinting
across the rooftops of a rain-soaked neon city with stolen data in your satchel.

**Open `index.html` directly from disk.** No server, no build step, no
dependencies, no network access. Everything — game, art, audio, HUD — is
generated at runtime by a single inline script using Canvas 2D and ordinary
browser APIs.

---

## Playing

The courier runs to the right on her own. You have exactly one action button:
**Space**, a **pointer press**, or a **touch**.

| Input | Situation | Result |
| --- | --- | --- |
| Tap | Grounded | Jump |
| Hold, then release | Grounded | Charged jump (up to ~33% higher) |
| Tap | Airborne, dash available | Dash forward |
| Tap | Airborne, dash spent | Buffered — the jump fires the instant you land |
| Tap | After a crash | Restart immediately |

Other keys: **P** pause · **R** restart · **M** toggle generated sound.
The four on-screen buttons (Pause / Restart / Sound / Reduced motion) are
keyboard reachable with a visible focus ring.

### Rules

- **Gaps** between rooftops. Jump them; charge the jump for the wide ones.
- **Crates** — low obstacles. Hop over.
- **Overhead gantries** — the clearance is deliberately narrower than the
  courier is tall. *Do not jump*; stay grounded and run underneath.
- **Breakable neon signs** — too tall to clear with a plain jump. Either dash
  through them (fast, scores, builds combo) or clear them with a full charged
  jump. Hitting one without dashing ends the run.
- **Drones** hover and bob on a sine path; **sweepers** patrol a rooftop rail.
- **Near misses** — squeezing past a hazard within 34px scores a bonus and
  raises your combo. Inside 16px it is a **close call**: the game drops into
  slow motion with a flash and a shake.
- **Combo** decays 3.2s after your last near miss or sign smash. It multiplies
  everything, including the checkpoint bonuses.
- **Data drops** — reaching each checkpoint distance banks a combo-scaled bonus.

Score, distance, best score, current speed, combo, the heat (difficulty) ribbon
and the daily seed are all on the HUD. Difficulty rises smoothly with distance:
gaps widen, rooftop height changes grow, and more hazard templates unlock.
Run speed ramps from 400 px/s to a 880 px/s cap.

### Daily seed

The rooftop course is generated from a deterministic seed derived from the
calendar date, shown in the HUD as `YYYY-MM-DD · XXXXXX`. Everyone playing on
the same day gets the same city. Attract mode always replays that exact seed;
each subsequent run mixes in an attempt counter so repeat runs are not
identical, while the day's seed stays the recognisable course.

Your best score and best distance persist in `localStorage` under
`neon-courier.v1`. If storage is unavailable (private browsing, disabled
cookies) the game silently keeps playing without persistence.

## Attract mode

Before you touch anything, an automated demo courier plays a real run using the
**same rules and the same one-button interface** — it presses and releases the
same virtual button you do, with no special privileges. It demonstrates jumps,
charged jumps, dashes and sign smashes. The first input transitions cleanly into
a fresh playable run. If the demo courier wipes out, attract mode restarts
itself after a beat.

## Accessibility

- Space, pointer and touch are all first-class inputs.
- The canvas is focusable (`tabindex="0"`) with an `aria-label` describing the
  controls, plus a visually-hidden rules paragraph and a `role="status"` live
  region announcing run starts, checkpoints and crash summaries.
- `prefers-reduced-motion` is honoured automatically, and can be toggled
  manually with the **Reduced motion** button. It thins the rain (260 → 90
  drops), damps screen shake, cuts flashes and lightning, shortens dash trails
  and shortens slow-motion — **without changing any collision timing**, so the
  game plays identically.
- Audio only exists after you ask for it (`M` or the Sound button). There is no
  blocking audio prompt and no audio is required for completeness.

---

## Architecture

Everything lives in `index.html` as one inline `<script>`. That is deliberate:
ES modules cannot be loaded over `file://` without a server, and the brief calls
for a file you can double-click.

```
RNG          mulberry32 + FNV-1a string hash; the daily label seeds everything
World        procedural rooftop assembly from 8 curated segment templates
Player       fixed-timestep physics: coyote time, jump buffer, charge, dash
Game         update loop, hazard resolution, near-miss/slow-mo director, scoring
Bot          attract-mode controller (drives rawPress/rawRelease only)
Renderer     pure draw: parallax city, rain, rooftops, courier poses, HUD
bootstrap    canvas sizing, input wiring, the rAF loop
```

**Update and render are fully separated.** `Game.update(dt)` never touches the
canvas; `Renderer.draw(ctx, dt)` never mutates simulation state. The renderer
holds only its own animation clock and the deterministic city layout.

### Fixed timestep

The main loop accumulates real time and steps the simulation at a fixed
`DT = 1/120s`. Frame delta is clamped to 250ms and the catch-up loop is capped
at 40 steps, so a backgrounded tab or a slow frame cannot cause a spiral of
death. Ambience (rain, shake decay, lightning) advances on wall-clock time so
the city keeps breathing during slow motion.

### Collision, and why nothing tunnels

Each physics tick subdivides movement so that no sub-step moves more than 5px,
capped at 24 sub-steps. Within a sub-step:

1. Move horizontally, then resolve against the rooftop line.
   - Feet **≤ 26px** inside a roof → vault onto it (ledge forgiveness; this also
     rescues an airborne courier clipping the corner of the next building).
   - Feet **> 26px** inside → that is a wall face: back out and crash.
   - Grounded with the surface **≤ 22px** below → follow it down, so small
     height changes read as steps instead of brief falls.
2. Move vertically and test for a landing, comparing the previous and current
   foot position against every overlapping rooftop.

This resolution is unconditional — it does not depend on being grounded — which
is what stops a dashing courier at 2000 px/s from slipping inside a building.
Hazards use plain AABB tests each tick against a small window of nearby
entities, which is safe because their own motion is slow.

### Level streaming and memory

Segments are generated ahead of the camera (`ensure`) and dropped behind it
(`cull`), which also compacts the hazard array in place. Steady state is about
10 rooftops and 10 hazards regardless of run length. Particles live in a
pre-allocated 420-slot pool that is compacted, never grown. Rain is a fixed
array of drops that wrap around. Nothing in the game allocates without bound.

### Resize

Gameplay always happens in a virtual 1600×900 space. The canvas backing store
follows the element size and device pixel ratio, and the renderer applies a
letterboxed scale transform. Because world coordinates never depend on the
viewport, resizing cannot disturb collision geometry — `check.mjs` and
`browser-check.mjs` both assert this across extreme aspect ratios.

---

## Local checks

Two suites, both runnable offline:

```sh
node check.mjs           # 52 assertions, headless
node browser-check.mjs   # 18 assertions in real Chrome
node browser-check.mjs --shot attract.png   # ...and save a 7s attract screenshot
```

`check.mjs` extracts the inline script from `index.html` and boots it against a
minimal DOM/Canvas stub, then drives the **real** simulation and the **real**
renderer. Nothing in it re-implements game logic. It covers attract-mode
survival and variety, a bot-played 120-second run with restarts, coyote time,
jump buffering, charge, dash, sign breaking (and that the same approach without
a dash is fatal), determinism of the seed, `localStorage` persistence, entity
and particle bounds, resize safety, reduced-motion playability, and that the
renderer is exception-free in every mode.

`browser-check.mjs` drives the page in local Chrome over the DevTools Protocol
with genuine key and pointer events, exercising the rAF render loop, P/R/M,
device-metrics resizes, focusable controls, the live region, and a clean
console. It skips gracefully if no Chrome/Chromium is installed.

Both suites are run against the exact file shipped here; see `battle-result.json`.

## Notes

- All art is drawn procedurally. There are no image, font or audio files, no
  copyrighted characters and no borrowed logos.
- `grep` the file: there is no `http://`, `https://`, `fetch`, `XMLHttpRequest`
  or `WebSocket` reference in the runtime.
