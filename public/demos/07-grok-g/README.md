# Kinetic Poster Foundry — Type as Physics

A local, file-open design toy. Type a phrase; the letterforms are sampled into a bounded node field and held by springs so the poster stays typographic while it moves.

Open `index.html` directly from disk. No network, packages, or remote fonts.

## Physical model

1. **Glyph sampling.** The current phrase is drawn onto an offscreen 1600×900 canvas with the selected system font stack, size, alignment, and margins. Visible pixels are read once and subsampled with a deterministic Mulberry32 seed (`0xF07E71E` mixed with phrase length and size). Density, viewport scale, and `prefers-reduced-motion` cap the node count (hard max 2200).
2. **Structure.** Nearby samples are linked in a spatial hash. Horizontal neighbors become *ribbon* springs; others become *web* springs. Signal Grid prefers axis-aligned links and snaps rest positions to a 4px lattice.
3. **Integration.** Each node is pulled toward its rest glyph coordinate (stiffness) and toward spring rest-lengths, then damped. Forces are not rebuilt every frame—only when phrase, font, layout, density, or margins change.
4. **Fields.** Pointer motion adds a local wind impulse. Click-drag adds a tangential vortex. Pointer-up injects an expanding ripple ring. Space applies a full-poster impulse. `R` eases nodes back toward rest.

Simulation and rendering live in poster space (always 1600×900). The on-screen canvas is CSS-fitted; editor chrome is DOM-only and never drawn into the poster.

## Controls

| Input | Action |
| --- | --- |
| Phrase / font / layout / align / density / margins | Rebuild the sample map |
| Stiffness, damping, trail, glow, palette, crop marks | Live, no resample |
| Pointer move | Local wind |
| Drag | Vortex |
| Release | Ripple |
| Space | Impulse |
| `R` | Smooth rest |
| `P` | Pause / resume |
| `1`–`4` | Curated presets |
| Export PNG | Download the current canvas as `kinetic-poster-foundry.png` at 1600×900 with no UI |

Empty phrase yields crop marks and ground only. Phrases longer than 80 characters are truncated; type is then scaled to the poster margins so structure stays readable.

## Presets

Each preset changes motion, line treatment, density, and composition—not only color.

1. **Electric ribbon** — Editorial serif, split composition, ribbon strokes, long trails, Voltage palette.
2. **Chrome pulse** — Grotesk one-liner, denser nodes, metallic links, a slow vertical pulse.
3. **Soft ink** — Left two-line serif, sparse blobs, multiply ink, no crop grid, Nocturne palette.
4. **Signal grid** — Mono two-line HUD, snapped lattice, dashed orthogonal links, Phosphor palette.

## Export

Export copies the live poster canvas into a fresh 1600×900 bitmap (`drawImage` of current pixels) and triggers a PNG download. Controls, live region, and dock are HTML overlays and are not part of that bitmap.

## Accessibility

Phrase, font, and sliders are labeled. A live region announces the current phrase, preset, pause state, and node count. Keyboard shortcuts are ignored while typing in the phrase field. Reduced motion lowers particle count, almost removes trails, and keeps deformation interactive but quieter.

## Files

- `index.html` — shell and controls
- `foundry.css` — compact dock
- `foundry.js` — sample, simulate, draw, export
- `README.md` — this note
