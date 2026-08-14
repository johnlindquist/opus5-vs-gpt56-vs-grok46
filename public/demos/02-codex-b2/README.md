# Gravity Atelier

Gravity Atelier is a self-contained Canvas 2D orbital sandbox. Open `index.html`
directly in a modern browser; it has no build step, dependencies, remote assets, or
network requests.

## Controls

- Drag empty space to place and launch a new body. The arrow shows initial velocity
  and the dotted line previews a short, approximate trajectory.
- Click a body to track its live mass, radius, speed, circular-orbit speed, and
  distance from the system's primary star.
- Pause, then drag a non-fixed body to reposition it.
- `Shift` + primary drag, middle drag, or right drag empty space to pan.
- Mouse wheel or trackpad scroll zooms around the pointer.
- `Space` pauses/resumes; `.` advances one fixed physics step while paused.
- `[` and `]` decrease/increase time scale.
- `R` restores the current preset.
- `1`, `2`, and `3` load Stable System, Binary Stars, and Chaotic Slingshot.
- **Clear debris** removes collision fragments and other tiny bodies without
  resetting the major bodies.

## Physics and tradeoffs

The simulation uses pairwise Newtonian gravity and a fixed 1/60-unit timestep with
a velocity-Verlet (leapfrog-style) integrator. Rendering and physics state are
separate; frame time is clamped and the fixed-step accumulator is capped so a
backgrounded tab cannot cause a giant catch-up burst.

Close approaches use Plummer-style gravitational softening:

`distance² = dx² + dy² + 6²`

Acceleration and velocity are also capped as numerical safety rails. These choices
sacrifice exact close-encounter trajectories in exchange for a playable sandbox
that survives overlaps and extreme user launches.

Colliding bodies normally merge. Their new velocity is the mass-weighted average,
which approximately conserves linear momentum; volume-equivalent radii are combined
with a cube-root rule. High-relative-speed collisions between non-stars create up
to eight momentum-centered fragments instead. The total live body count is capped
at 90.

The initial systems and decorative star field use a deterministic xorshift32 random
generator. Preset 1 uses near-circular starting velocities and a fixed central
anchor, making it mostly stable while still allowing mutual perturbations. The
trajectory preview is intentionally approximate: it integrates the prospective
body against the current bodies held at their present positions, so it remains
fast and readable while dragging.

Reduced-motion preferences shorten trails and collision flashes, while orbital
motion remains active because it is the simulation's essential content.
