# Signal Garden

**Signal Garden — Bioluminescent Ecosystem Synth** is a self-contained Canvas 2D artwork that behaves like a living visual instrument. It uses no packages, frameworks, fonts, images, CDNs, network requests, or build step.

## Open it

Open `index.html` directly in a modern desktop or mobile browser. The simulation starts automatically and works from a `file://` URL.

## Read the ecosystem

- **Blooms** are lime, petaled organisms anchored in loose depth bands. Nutrient motes curve into them; fed blooms open, glow, reproduce, and share signal pulses. Depleted blooms become dim and dormant before dying.
- **Drifters** are cyan, tadpole-like swimmers with luminous trails. They seek active blooms, take visible energy along dotted feeding paths, carry it through the garden, and reproduce when energized.
- **Hunters** are rarer coral, arrow-shaped organisms. They pursue the brightest nearby drifters, steal energy, and emit coral disruption rings that scramble drifter movement.
- Expanding rings are signals. When a ring reaches another organism, that organism lights up and may relay the pulse.

The ecosystem uses a spatial hash for local searches and strict population caps. A slow background nutrient flux and minimum-population recovery keep the garden in a stable long-running attract state.

## Controls

| Input | Effect |
| --- | --- |
| Move pointer | Bend nearby drifter trails like a current |
| Click / tap | Plant a temporary ultraviolet signal beacon |
| Click-drag / touch-drag | Paint a nutrient current |
| `Space` | Emit a global pulse (8-second visible cooldown) |
| `P` | Pause or resume |
| `R` | Regenerate with the next deterministic seed |
| `1`, `2`, `3` | Switch among Luminous Shelf, Violet Trench, and Coral Surge |

All on-screen controls are keyboard reachable and have visible focus states.

## Technical notes

- Deterministic Mulberry32 seeded random generation
- Fixed 1/60-second simulation timestep with catch-up protection
- Canvas resolution tracks viewport size and device pixel ratio without resetting the world
- Pointer Events support mouse, pen, and touch
- `prefers-reduced-motion` reduces population, trail persistence, glow, and pulse effects while preserving all behaviors
- Canvas is backed by a concise screen-reader description and live text status readouts
- Entity counts and pulse history are capped to prevent runaway load

Different presets intentionally derive deterministic worlds from the displayed base seed. Pressing `R` advances the base seed by a fixed amount; reloading returns to seed `40731`.
