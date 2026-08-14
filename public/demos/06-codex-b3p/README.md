# Sand Alchemist

Sand Alchemist is a dependency-free Canvas 2D falling-sand laboratory. Open `index.html` directly in a modern browser; no server or build step is required.

## Controls

- Drag on the chamber to paint the selected material.
- Right-drag erases and suppresses the browser context menu.
- Shift-click or Shift-drag draws a straight line from the previous pointer point.
- Mouse wheel or `[` / `]` changes brush radius.
- Number keys `1`–`9` select Sand, Water, Stone, Wood, Plant, Fire, Oil, Ice, and Steam.
- The compact searchable palette selects every material, including Lava, Salt, and Eraser.
- `Space` pauses or resumes.
- `.` advances exactly one tick and pauses first if necessary.
- `R` restores the currently selected preset.
- Header controls provide pause/resume, step, reset, clear, and 0.25×–4× speed.

The status area reports rendered FPS, occupied-cell estimate, selected element, brush radius, and the deterministic preset seed.

## Materials and rules

1. **Sand** falls, slides down slopes, displaces liquids, and forms piles.
2. **Water** falls and spreads laterally. At 100° local temperature it becomes steam; sufficiently cold fresh water freezes.
3. **Stone** is immobile. Newly cooled lava stone remains visibly warm for a while.
4. **Wood** is structural and burns when fire or lava reaches it.
5. **Plant** burns easily. When a plant cell has both adjacent water and adjacent stone or sand, it can grow into nearby empty space.
6. **Fire** flickers upward, transfers heat, consumes wood, plants, and especially oil, and expires as its compact lifetime runs out.
7. **Oil** flows less widely than water, swaps upward through water so it floats, and burns aggressively.
8. **Ice** cools adjacent water. Heat raises its local temperature; above the melt threshold it becomes water.
9. **Steam** rises, drifts, cools, and condenses to water when cool, near ice, or after a long airborne lifetime.
10. **Lava** flows every third simulation tick, transfers intense heat, ignites fuels, flashes water or ice to steam, and cools to stone.
11. **Salt** falls like a powder and dissolves into adjacent water. Brine is tinted slightly warmer and has a simplified depressed freezing point of −18° instead of −3°.
12. **Empty space / Eraser** removes cells.

Temperature is stored per cell as a compact signed integer. Heat sources and ice exchange heat locally with their four immediate neighbors, while non-sources relax slowly toward room temperature.

## Presets

- **Volcano** (default): lava vent, lake, oil-fed wooden grove, growing plants, ice shelf, salt, sand, fire, and rising steam. It is designed to show several reactions during the first seven seconds.
- **Terrarium**: wet planted basin, bridge, oil pool, salt deposit, and warm lamp.
- **Oil Fire**: floating oil beneath a wooden planted platform, surrounded by water and sand banks.
- **Frozen Lake**: ice and supercooled water split by a lava intrusion, with salt channels and a small fire.

Each preset resets the deterministic xorshift random generator to its displayed seed.

## Simulation and performance

The world is a bounded 240×128 grid (30,720 cells), presented with nearest-neighbor scaling so cells remain legible. The grid dimensions stay fixed during window resizing, so the world is preserved exactly and only its display transform changes.

Every tick has two scans: buoyant fire/steam from top to bottom and other matter from bottom to top. Horizontal scan direction and movement preference alternate by tick and row/cell parity. A per-cell tick stamp prevents a moved or transformed cell from being updated repeatedly in the same tick.

The renderer writes one reusable 240×128 `ImageData` buffer, scales it to the visible canvas, and caps secondary particles at 420. There is no unbounded history. Under `prefers-reduced-motion`, decorative particles are capped at 90 and emitted less often; the cellular rules remain unchanged.

No external assets, fonts, frameworks, network requests, storage, or runtime dependencies are used.
