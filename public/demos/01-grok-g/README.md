# Signal Garden

A local, direct-open bioluminescent ecosystem. Open `index.html` in a browser — no build, server, or network.

## What you are looking at

Dark water, living light, and a quiet instrument.

- **Blooms** (cyan / lime) stay nearly still, drink the lime nutrient field, and periodically open into petal rings that send signal waves.
- **Drifters** (violet teardrops) hunt those blooms, ferry energy, and leave current-bent trails. Full drifters split; empty ones fade into nutrient.
- **Hunters** (coral chevrons) are rarer. They chase bright drifters and scramble nearby bloom signals on contact.

Energy is visible: brighter cores, longer trails, and more frequent rings mean more stored light.

## Controls

| Input | Action |
| --- | --- |
| Pointer move | Bends nearby trails like a current |
| Click / tap | Plants a temporary signal beacon |
| Click-drag | Paints a nutrient current |
| Space or Pulse | Global pulse (cooldown) |
| `P` or Pause | Pause / resume |
| `R` or Reseed | Next deterministic seed |
| `1` `2` `3` | Tide Garden, Deep Swarm, Coral Hunt |
| Sound | Optional Web Audio after a gesture — never required |

## Determinism

The world is built from a 32-bit seed (Mulberry32) and a fixed `1/60s` simulation step. The same seed and preset always recreate the same initial layout. Pointer input, beacons, and audio are live and do not need to be deterministic.

## Files

- `index.html` — document, HUD, accessible scene description
- `garden.css` — overlay layout
- `garden.js` — simulation, spatial hash, renderer, optional audio
- `README.md` — this file

## Notes

`prefers-reduced-motion: reduce` shortens trails, dims flashes, and lowers population while keeping the three classes and the same controls.
