# Weather Dial — Tiny City Climate Toy

A local, self-contained miniature city. Open `index.html` directly from disk. No server, packages, or remote assets.

## What you are looking at

An isometric tabletop town with fourteen buildings, a three-by-three street grid, traffic lights, vehicles, pedestrians, trees, clouds, and a weather console styled like a brass climate instrument.

For the first ~12 seconds the city plays a short weather story on its own (dawn clear → cloud → rain → storm with lightning → fog → a calm summer afternoon). Touch any control, drag the city, or click a building/cloud to take over immediately.

## Climate model

Weather is a continuous dial through six named states: **Clear, Cloudy, Rain, Storm, Snow, Fog**. Neighboring states blend.

Temperature decides precipitation type:

- At or below ~0.8°C, wet weather falls as **snow**.
- Between that and ~3°C it becomes **sleet**.
- Warmer than that, the same dial setting produces **rain**.

Snow does not fall while the displayed temperature is hot. A snow-labelled dial in summer melts into rain; a rain or storm dial in a freeze becomes snow.

Season recolors trees, ground, and blossom/leaf litter. Time of day drives sky, window glow, headlights, and how many people stay out. Wind bends trees, advects clouds, rain, snow, fog, and autumn leaves. Rain darkens streets with specular streaks and grows puddles; snow packs onto roofs, ground, and canopies and melts when the air warms.

Storms emit occasional lightning with a long cooldown and a soft flash (skipped when `prefers-reduced-motion` is set). People hurry to doorways in heavy rain or storm and linger indoors at night. Vehicles slow on wet, snowy, or foggy streets and wait on red lights at intersections.

The simulation is seeded (`48291` by default). **Reset** rebuilds agents from that seed and replays the attract story.

## Controls

| Control | Action |
| --- | --- |
| Weather dial | Drag, or focus and use arrow keys, through the six climates |
| Temperature / wind / time / season / speed | Sliders on the console |
| Summer shower, Autumn gale, Winter night, Spring sunrise | Curated presets (keys `1`–`4`) |
| Pause | Freeze the clock (`Space`) |
| Reset | Restore seed and attract story (`R`) |
| Drag across the city | Paint a gust that shoves clouds, trees, rain, and loose particles |
| Click a cloud | Seed a local burst of precipitation |
| Click a building | Open a short information card |

A visually hidden live region announces weather, temperature, season, clock, wind, and how many people remain in the street.

## Files

- `index.html` — page shell and console
- `styles.css` — instrument layout
- `app.js` — city, weather, agents, and input
- `README.md` — this note

Resize keeps the current climate; only the camera scale changes. Particle and agent counts are capped. Reduced motion lowers particle budgets, lightning, and vehicle speed.
