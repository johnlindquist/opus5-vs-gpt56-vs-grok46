# Weather Dial — Tiny City Climate Toy

`index.html` is a self-contained, direct-open Canvas 2D city diorama. No server, package install, remote font, map, image, or runtime dependency is required.

Open `index.html` in a modern browser. The first sixteen seconds form a deterministic miniature weather story—summer rain, a storm, winter snow, autumn fog, then a calm spring cloud deck—before the scene settles. Using any control ends the attract sequence immediately.

## Controls

- Choose **Clear, Cloudy, Rain, Storm, Snow, or Fog** on the weather dial.
- Adjust temperature, wind strength and direction, clock time, season, and simulation speed.
- Use the four preset buttons for **Summer shower**, **Autumn gale**, **Winter night**, and **Spring sunrise**.
- Drag across the city to paint a gust through precipitation, clouds, foliage, and loose leaves.
- Select a cloud to seed a short local rain or snow burst.
- Select a building to read its miniature information card.
- Press `1`–`4` for the four presets, `Space` to pause, and `R` to reset the deterministic seed and attract sequence.

## Simulation notes

The displayed temperature determines precipitation: rain and storm moisture becomes snow near freezing, while choosing Snow automatically moves the temperature below freezing. Wet roads gain puddles and light streaks; snow accumulates on the terrain, roads, trees, and roofs, then melts above freezing. Tiny residents move toward shelters in severe weather. Traffic alternates at intersections, windows and street lamps follow the clock, seasonal plants change color and fullness, and the shown wind direction bends vegetation and carries weather.

Particle pools, local bursts, and gust trails are bounded. Resizing preserves the current settings. Reduced-motion preferences lower precipitation density, traffic speed, and lightning intensity. The canvas is keyboard-focusable, every console control is labeled, and an assistive live status summarizes the active city state.
