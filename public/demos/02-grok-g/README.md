# Gravity Atelier

A local, dependency-free orbital sandbox. Open `index.html` directly from disk in a modern browser (no server required).

## Controls

| Input | Action |
| --- | --- |
| Drag empty space | Place a body at the press point and launch it along the drag vector. A velocity arrow and dashed short-horizon trajectory appear before release. |
| Click a body | Select it. The glass panel shows name, mass, velocity components, orbital speed, and distance to the primary star. |
| Drag a body while paused | Reposition it; velocity is kept. |
| Drag a body while running | Grab and throw; release velocity follows the pointer. |
| Right-drag, middle-drag, Alt-drag, or Shift-drag | Pan the camera. |
| Mouse wheel / trackpad | Zoom around the pointer. |
| `Space` | Pause / resume. |
| `.` | Advance one fixed timestep while paused. |
| `[` / `]` | Decrease / increase time scale (×0.125 … ×8). |
| `R` | Restore the current preset. |
| `1` / `2` / `3` | Load **Stable system**, **Binary stars**, or **Chaotic slingshot**. |
| Clear debris | Remove tiny fragments and low-mass debris without resetting major worlds. |

The canvas is keyboard-focusable. Controls in the bottom instrument bar are buttons with visible focus rings. A skip link and a screen-reader description of the sandbox are included.

## Presets

All presets are built from a **deterministic mulberry32** generator (not `Math.random` for world construction). Seeded orbital trails are filled along the initial arcs so the first frame already shows luminous paths.

1. **Stable system** (`1`, seed 42) — pinned star Atria with five planets and a close moon. Tuned to stay coherent for well over thirty seconds.
2. **Binary stars** (`2`, seed 77) — Helios A/B on a two-body orbit with circumbinary / circumstellar planets.
3. **Chaotic slingshot** (`3`, seed 13) — a pinned massive star, a heavy Jove, and two hyperbolic visitors meant to graze, whip, and scatter.

## Physics

- **Force law.** Pairwise Newtonian gravity with **Plummer softening**:
  \(a_{i\leftarrow j} = G m_j\, r_{ij} / (|r|^2 + \varepsilon^2)^{3/2}\),
  where \(\varepsilon = 0.55(R_i + R_j)\). Softening keeps the force finite when two bodies nearly overlap and is the documented minimum-distance strategy.
- **Integrator.** Velocity Verlet at a **fixed** \(dt = 1/96\) s of simulation time. Wall-clock catch-up is capped at six substeps per animation frame. Returning from a backgrounded tab zeroes the accumulator so a huge paused `delta` is never dumped into the world.
- **Collisions.** Overlap at \(\approx 0.92(R_i+R_j)\) triggers a response. Momentum is conserved in the merged (or fragment barycenter) velocity \(v = (m_1 v_1 + m_2 v_2)/m\). Low-energy or star-involving contacts **merge** (volume-equivalent radius). Violent planet–planet contacts **fragment** into a few debris bodies with a perpendicular kick, plus shock rings and spark debris. Body count is capped at 72; speeds and positions are clamped.
- **Pinned stars.** The primary in presets 1 and 3 is pinned so the camera’s origin stays a useful instrument origin without a slow barycenter walk. Binary stars are free.
- **Tradeoffs.** Softening slightly lowers central force versus a true \(1/r^2\) law, so circular-orbit speeds use the softened centripetal match. Trails are sampled every two steps into a preallocated ring buffer (no large per-frame allocations). The trajectory preview integrates a ghost particle against the *current* field only — it does not predict other bodies moving. Fragmentation is a visual/playable rule, not a hydro model.

## Motion preferences

If `prefers-reduced-motion: reduce` is set, trails are shortened, shock rings fade faster, and collision flashes are quieter. Orbital integration is unchanged.

## Files

- `index.html` — document, instrument chrome, and styles (system fonts only).
- `app.js` — simulation, rendering, and input.
- `README.md` — this note.

No remote scripts, fonts, or images are referenced.
