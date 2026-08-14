# Kinetic Poster Foundry — Type as Physics

A dependency-free, direct-open Canvas 2D design toy. Open `index.html` in a current desktop browser; no build step, server, font download, or network connection is required.

## Physical model

The phrase is drawn into a 1600×900 offscreen canvas using the selected system-font stack. A deterministic seeded sampler visits visible alpha pixels and converts a bounded subset into nodes. Nearby nodes are connected into a typographic mesh. Each node keeps its sampled position as a home coordinate and is integrated with:

- a spring force toward its home coordinate;
- velocity damping;
- a subtle preset-specific ambient field;
- pointer wind, drag-vortex, impulse, and travelling ripple forces.

The sample map is rebuilt only when type geometry changes (phrase, font, density, size, margins, or layout), never on every frame. Particle counts scale down on smaller displays. Reduced-motion preferences use fewer nodes, nearly eliminate trails and ambient movement, and retain only restrained interactive deformation.

## Controls

- Move the pointer over the poster for a local wind field.
- Click and drag to twist the nodes into a vortex.
- Release the pointer to send a visible radial ripple.
- Press **Space** for a full-poster impulse.
- Press **R** to return the phrase smoothly to rest.
- Press **P** to pause or resume the simulation.
- Press **1–4** to choose Electric ribbon, Chrome pulse, Soft ink, or Signal grid.
- Use the compact editor for phrase, font stack, layout, alignment, palette, density, type size, spring stiffness, damping, trails, glow, margins, line weight, and guide grid.

Long phrases are capped to a practical poster length and automatically fitted inside the chosen margins. Auto layout balances longer copy over two lines; the explicit one-line, two-line, and staggered modes are also available. Empty input falls back to `TYPE SOMETHING` while leaving the input editable.

## Export

**Export PNG** renders the current local simulation state to a fresh, opaque 1600×900 canvas and downloads it as PNG. Editor controls are HTML overlays and are never included. The export uses only the local mask, current node positions, palette, trails-independent clean background, grid setting, and local Canvas APIs.

## Files

- `index.html` — complete application, styles, simulation, controls, and export.
- `README.md` — model and usage documentation.
- `battle-result.json` — delivery and verification record.
