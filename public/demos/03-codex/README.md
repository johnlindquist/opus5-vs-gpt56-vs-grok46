# Neon Courier — One-Button Rooftop Heist

`index.html` is a dependency-free Canvas 2D arcade game. Open it directly in a modern browser; no server or build step is needed.

## Rules

You are a courier carrying stolen data across an endless sequence of rain-soaked rooftops. The courier runs automatically.

- Tap while grounded to jump.
- Hold briefly while grounded, then release, for a higher jump.
- Tap while airborne when the dash indicator is ready to dash forward.
- Clear gaps, rooftop equipment, moving barriers, and patrol drones.
- Dash through magenta `NOIR` signs. Other hazards end the run.
- Passing dangerously close to a hazard earns a near-miss bonus, increases the combo, and briefly emphasizes the moment.
- Speed and procedural difficulty rise gradually with distance.
- After a crash, tap once to restart immediately.

The deterministic daily seed shown in the HUD produces the same procedural sequence for that local calendar day. Best score persists in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| `Space`, pointer press, or touch | Jump / charge jump / air dash / restart |
| `P` | Pause or resume |
| `R` | Restart with the current daily seed |
| `M` | Toggle generated Web Audio sound |

The focusable game surface has a visible keyboard-focus outline. Concise instructions and state changes are exposed to assistive technology. If `prefers-reduced-motion` is enabled, rain density, trails, flashes, and shake are reduced without changing gameplay timing or collision rules.

## Architecture

The game uses a fixed 1600×900 logical coordinate system and scales it into the current viewport, so resizing never mutates simulation coordinates. A fixed 120 Hz gameplay timestep is fed by a bounded animation-frame delta. Update and rendering paths are separate.

The level generator chooses from a curated rooftop-pattern set using a date-derived seeded PRNG. It assembles gaps, elevation changes, low and high obstacles, breakable signs, drones, and laterally moving hazards. Old platforms, hazards, and particles are culled, and all decorative collections are bounded.

Collision uses inset player and hazard hitboxes for readable, fair silhouettes. Roof landing checks sweep the feet from the previous to current position, while hazard checks use a swept bounding box so fast dashes cannot tunnel through thin geometry. The movement model includes 110 ms coyote time, a 140 ms jump buffer, one restored air dash per landing, charge jumps, near misses, and gradual speed scaling.

Attract mode is a real automated run through the same action functions and collision rules used in play. The first player input resets the seed and begins a clean playable run.
