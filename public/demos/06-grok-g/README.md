# Sand Alchemist

A local, framework-free falling-sand laboratory. Open `index.html` directly from disk. No remote fonts, CDNs, or packages.

## World

- Grid: **400 × 225** cells (90,000 sites) drawn at **4 CSS pixels** into a **1600 × 900** canvas.
- State per cell: `type`, `temp` (0–255, ambient 118), `aux` (lifetime / fuel), `salt` (dissolved load).
- Resize: the grid never resamples. The canvas letterboxes with `object-fit`-style CSS (`width/height: 100%` inside a 16:9 stage). The world is preserved exactly.
- Seed: **0xA13C3**. Presets are deterministic functions of that seed.

## Update order

1. **Movement** — powders and liquids scan **bottom → top**; gases scan **top → bottom**. Horizontal scan direction **flips every tick** to avoid a permanent left/right bias. A `moved` stamp means a particle is written at most once per pass.
2. **Heat** — a separate buffer (`tempNext`) writes each cell once from its previous temperature and four-neighbors. Fire/lava/ice clamp their source temperature before mixing. Documented extra pass, not a second movement write.
3. **Reactions** — one scan; newly created fire/steam/ice is `reacted` so chains cannot consume a forest in a single tick.

Lava only **moves** every third tick (slow flow) but still heats and reacts every tick.

## Materials

| Material | Motion | Rules |
| --- | --- | --- |
| Empty | — | Ambient heat sink. |
| Sand | Powder | Falls and piles; sinks through water, oil, steam, fire. |
| Water | Fast liquid | Seeks lower space (down, diagonal, then sideways up to 4). Boils to steam when hot; freezes to ice when cold unless salty. |
| Stone | Static | Cooling lava becomes stone. Hot stone glows. |
| Wood | Static | Ignites from fire or lava; long burn life. |
| Plant | Static / growth | Grows upward into empty/steam when adjacent to water and rooted on sand, stone, ash, wood, or plant. Burns quickly. |
| Fire | Flicker / rise | Consumes wood, plant, oil; melts ice; expires to empty or ash. |
| Oil | Liquid | Floats on water (swaps upward). Ignites aggressively. |
| Ice | Static | Cools and can freeze nearby low-salt water. Melts to water near heat. |
| Steam | Gas | Rises; condenses to water in cool air; vents at the top of the world. |
| Lava | Slow liquid | Ignites fuels, flash-boils water/ice to steam, cools into stone, rarely remelts sand. |
| Salt | Powder | Dissolves into water, raising salinity. Saline water (`salt ≥ 40–50`) resists freezing. |
| Ash | Powder | Optional residue from spent fire. |

## Controls

- **Paint** with the primary pointer; **right-click** erases (context menu blocked on the canvas).
- **Wheel** or **[ ]** change brush radius (1–37 cell diameter).
- **Shift** draws a Bresenham line from the previous paint cell.
- **1–9** select Sand through Steam; **0** / **E** empty-eraser. Lava, Salt, Ash, Empty also sit in the searchable palette.
- **Space** pause/resume; **.** one tick while you can also press Step; **R** reloads the active preset.
- Toolbar: Pause, Step, Clear, Reset, speed 1–4 ticks per frame.
- Presets: **Volcano** (default attract scene), **Terrarium**, **Oil fire**, **Frozen lake**.

## Visuals and accessibility

- Dark brass-framed terrarium, compact swatch palette, live FPS / active-cell / material / brush / seed meters.
- Heat tints, cooling-stone glow, fire flicker, bounded ember/steam overlays (cap 220, or 48 if `prefers-reduced-motion`). Reduced motion also skips decorative empty-cell heat haze. Cell rules do not change.
- Keyboard operation, `:focus-visible` rings, labeled buttons, and a live **preset summary**.
- Fire flicker is luminance jitter, not a full-screen flash.

## Performance

- Simulation is typed arrays; render is a 400×225 `ImageData` blit scaled with `imageSmoothingEnabled = false`.
- Overlay particles are capped and sampled sparsely.
- Default speed is 1 tick/frame, comfortable on the 90k grid in current desktop browsers.

## Files

- `index.html` — shell
- `styles.css` — laboratory chrome
- `engine.js` — grid, reactions, presets, Node self-test
- `app.js` — pointer/keyboard UI and renderer
