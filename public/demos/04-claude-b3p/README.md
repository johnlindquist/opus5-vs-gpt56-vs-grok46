# Weather Dial — Tiny City Climate Toy

An animated isometric tabletop city that answers to a physical-feeling climate console.
Turn the dial from **clear** through **cloudy, rain, storm, snow** and **fog**, push the
temperature around, swing the wind, roll the clock through a day and the calendar through
the seasons — the city reacts: windows light up, traffic slows on wet tar, people run for
awnings, trees bend downwind and lose their leaves, puddles bloom, snow settles.

**Open `index.html` directly from disk.** No build step, no server, no packages, no network.
Everything is Canvas 2D, SVG, DOM and arithmetic in one self-contained file.

---

## The attract scene

For the first ~30 seconds the toy runs its own weather story with no input needed:

> drizzly summer morning → steady rain → midday squall with lightning → clearing afternoon →
> evening fog rolling in → cold night snowfall → clear frozen midnight

Touching anything (drag, click, dial, slider, key) hands control over immediately; otherwise
the story finishes and settles into a controllable state. Reset (`R`) does **not** replay it.

---

## Controls

### Weather console (right-hand panel)

| Control | What it does |
| --- | --- |
| **Weather dial** | Circular dial sweeping 0→5 through clear · cloudy · rain · storm · snow · fog. Drag it, or focus it and use `←` `→` (`Shift` for whole steps, `Home`/`End` for the ends). States blend continuously, so 2.4 is "rain leaning stormy". |
| **State buttons** | Snap straight to one of the six named states. |
| **Temperature** | −20 °C … 40 °C. Decides the *phase* of precipitation, tints the grass, melts snow, freezes the park pond, and changes how quickly people head indoors. |
| **Time of day** | 0–24 h. Drives sky gradient, sun/moon arc, shadow length and direction, star field, window lighting, street lamps and headlights. The clock also advances on its own (one full day ≈ 260 s at 1× speed). |
| **Season** | Spring → Summer → Autumn → Winter (continuous, wraps). Changes grass and foliage colour and strips the broadleaf trees bare in late autumn. |
| **Wind direction** | Compass heading the wind blows *from*, with a live needle showing where it is blowing *to*. |
| **Wind strength** | 0–90 km/h. Slants rain, drives cloud drift, bends trees, and above ~42 km/h pushes pedestrians towards cover. |
| **Speed** | 0–3× simulation rate. |
| **Pause / Reset** | Freeze the sim; or restore the default deterministic morning. |
| **Seed + Rebuild** | Any text seed deterministically regenerates the entire city — blocks, silhouettes, names, trees, traffic. Same seed ⇒ identical city. |
| **Calm mode** | Fewer particles, slower traffic, dimmer and rarer lightning. Auto-enabled when the OS reports `prefers-reduced-motion`. |
| **City status** | A live text summary (also an ARIA live region) of weather, temperature, wind, time, season, lit windows, moving vehicles, people taking cover, and ground wetness/snow cover. |

### Presets

| Key | Preset |
| --- | --- |
| `1` | **Summer shower** — warm rain, mid-afternoon |
| `2` | **Autumn gale** — storm, 66 km/h, leaves flying |
| `3` | **Winter night** — snowfall at −6 °C, 22:30 |
| `4` | **Spring sunrise** — clearing sky, 06:15 |

### Direct interaction with the city

- **Drag across the diorama** — paints a gust: clouds shove downwind, rain and snow are blown
  sideways, trees whip, and loose debris kicks up (autumn leaves, winter snow puffs, summer dust).
  A soft streak traces where you dragged.
- **Click a cloud** — seeds a localised burst of precipitation directly under it (and nudges the
  dial up to at least drizzle so the burst has something to fall from).
- **Click a building** — opens a small card: name, use, floors, height, footprint, how many
  windows are lit right now, occupants, and what the roof is doing in the current weather.
  `Esc` or a click on empty ground closes it.
- **Keys** — `1`–`4` presets · `Space` pause · `R` reset · `Esc` close card.

---

## What the simulation actually models

**City.** A 16×16 tile plate with three avenues each way. Blocks between them hold ~20 buildings
(flat, tiered, gabled, domed and spired silhouettes, plus roof tanks and vents), three of the
blocks are parks with a pond, and the rest carry street trees, lamps and traffic signals — all
generated deterministically from the seed.

**Windows.** Every façade window has a fixed random rank plus a slow flicker phase. The lit
fraction is a function of ambient light (about 10 % at noon, 74 % deep at night, higher in storm
and fog). The set is re-evaluated a couple of times a second and baked into two `Path2D`s per
building, so a whole tower is two fills per frame. Lit glass is re-drawn *after* the night-tint
pass in `lighter` mode, which is what makes the little windows glow warm.

**Traffic.** Vehicles run in right-hand lanes along the avenues with a 14-second signal cycle
(6 s east–west green, 1 s amber, 6 s north–south green, 1 s amber). They brake for the stop line
on red, keep a following distance behind the car ahead, occasionally turn at a green intersection,
and lose grip — i.e. top speed — as the road gets wet, snowy or foggy. Headlights and tail lights
come on with darkness, fog and storm.

**People.** Tiny agents walk the sidewalks and turn corners. Each has a personal tolerance for bad
weather; once rain intensity, storm strength or wind exceed it they break off and walk to the
nearest building doorway, wait it out, then return to the pavement when it eases. In liquid rain
the ones still outside put up umbrellas that tilt with the wind. Cold and rain also make everyone
walk faster.

**Trees.** Broadleaf and conifer, swaying at individual frequencies. Bend is proportional to wind
strength and points along the *screen-projected* wind vector, so they lean the way the compass
says. Foliage colour follows the season; late autumn strips broadleaves to bare branches, and snow
caps canopies and branches once it is settling.

**Precipitation.** One bounded pool (hard cap 1500 particles, ~34 % of that in calm mode)
simulated in world space with wind advection, per-flake wander for snow, and gust impulses.
The **phase always follows the displayed temperature**: ≤ 0.5 °C snow, 0.5–3 °C sleet, above that
rain — so selecting *Snow* at 20 °C rains, and flakes already in the air melt out within a third
of a second if you crank the temperature up. Selecting the snow detent when it is warm drops the
thermostat to −3 °C so the state stays coherent.

**Ground.** Rain raises a global wetness value: the tar darkens, a sheen gradient appears, puddles
grow on fixed low spots, drops throw expanding splash rings, and warm window light smears down
onto the wet road as reflection. Wetness dries off faster when it is warm and windy. Snow
accumulates per tile (a 16×16 depth grid) where flakes land, plus a separate roof/canopy depth,
and melts at a rate proportional to temperature above 0 °C.

**Sky and light.** An eleven-stop keyframed sky gradient over the 24-hour clock, greyed and
darkened by cloud cover and storm strength; sun and moon travel an arc with a glow halo; stars
fade in at night when the sky is not overcast. Cloud cover scales how many of the 15 clouds are
drawn and how heavy their soft ground shadows are. Shadow direction and length come from the sun's
altitude and side of noon. A single `multiply` pass tints the whole scene for night, then a
`lighter` pass adds every warm light source on top.

**Storms.** Above dial position ~3.5 lightning arms: a jagged bolt from a random cloud plus a
brief screen flash, with a minimum 4-second cooldown and capped flash alpha (much dimmer and
rarer in calm mode) so it never becomes a strobe.

---

## Engineering notes

- **Bounded work.** ≤ 1500 particles, ~20 vehicles, 42 people, ~90 trees, 15 clouds, ≤ 220
  splashes, ≤ 26 live gusts, ≤ 40 drag streaks. Nothing grows without a cap.
- **Little per-frame DOM.** The console text is refreshed at ~7 Hz and the status line every
  2.2 s; everything else is canvas.
- **Resize.** A `ResizeObserver` marks the layout dirty; the next frame recomputes tile size,
  origin and window geometry. World state — including your weather selection, accumulated snow and
  wetness — is untouched.
- **Determinism.** All city generation runs through a seeded `mulberry32` PRNG keyed by an FNV-1a
  hash of the seed string. `Reset` restores the documented default state; `Rebuild` regenerates the
  city from the seed box. Weather evolution afterwards uses ordinary randomness for individual
  raindrops, which does not affect layout.
- **Accessibility.** The canvas is focusable and labelled; the dial is a real `role="slider"` with
  arrow-key control and a spoken value; every input has a visible label and a live value readout;
  focus rings are explicit; the status panel is an ARIA live region describing the city and weather
  without relying on sight; `prefers-reduced-motion` (or the Calm mode checkbox) reduces particles,
  lightning intensity and vehicle speed.
- **Layout.** Side console at ≥ 900 px wide, stacked below the stage on narrower screens. The
  diorama always scales to fit its stage box, so it stays readable at 1600×900 and well below.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire toy — markup, styling, simulation and rendering. |
| `README.md` | This document. |
| `smoke-test.mjs` | Headless check: runs the real inline script against DOM/Canvas stubs, drives ~2000 frames and synthetic input, and asserts 34 behaviours (state distinctness, presets, snow/rain coherence, sheltering, particle bounds, gusts, cloud seeding, building cards, keyboard, determinism, resize). Run with `node smoke-test.mjs`. |
| `battle-result.json` | Delivery manifest with the checks that were run. |
