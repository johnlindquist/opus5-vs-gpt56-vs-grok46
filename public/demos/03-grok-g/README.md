# Neon Courier — One-Button Rooftop Heist

A direct-open Canvas 2D arcade runner. Open `index.html` from disk. No build step, no network, no dependencies.

You are a courier sprinting left-to-right across a rain-soaked neon city with stolen data. There is one action: **Space**, **click/pointer**, or **touch**.

## Rules

- The courier runs automatically.
- **Tap while grounded:** jump.
- **Hold briefly while grounded:** charge a higher jump. A compact ring above the courier fills as you charge.
- **Tap while airborne** (dash available): dash in the run direction. Dashing smashes breakable neon signs and stretches a gap-cross.
- **Tap after a crash:** immediate restart.
- Coyote time lets you jump shortly after leaving a roof. Jump buffering stores an early tap so it fires on landing.
- Near-misses (skimming drones, masts, crates, or signs) raise combo, add score, and trigger a brief slow-motion emphasis.
- Difficulty ramps with distance: speed, gap width, and hazard density rise gradually.
- The UTC date seed (`YYYYMMDD`) is shown in the HUD. Playable runs use that daily seed. Attract mode uses a fixed cinematic seed so the opening always demonstrates a jump and a dash.

## Controls

| Input | Action |
| --- | --- |
| Space / click / tap | Jump, charge, dash, or restart |
| `P` | Pause / resume (play mode) |
| `R` | Restart a playable run |
| `M` | Mute / unmute generated Web Audio (audio starts only after the first action) |

Keyboard focus is visible on the canvas (`:focus-visible`). Screen-reader copy lives in `#instructions` and `#sr-status` (`aria-live`). `prefers-reduced-motion: reduce` cuts shake, lightning intensity, rain density, and trails without changing hurtboxes, coyote time, or buffer windows.

## Scoring

- Passive score ticks with distance and speed.
- Combo multiplies near-miss and sign-break bonuses.
- Combo decays if you stop threading hazards.
- Best score is stored in `localStorage` under `neon-courier-best-v1`.

HUD shows score, distance (meters), combo, best, current speed, seed, and a live objective (`LEAP THE VOID`, `SMASH THE SIGN`, and similar).

## Architecture

- `index.html` — canvas stage, accessible instructions, script tag.
- `styles.css` — letterboxed dark stage and focus treatment.
- `game.js` — IIFE with a **fixed 120 Hz gameplay step** and a separate render path.
  - World units are independent of CSS size. The canvas backing store stays **1600×900**; collision never uses display pixels.
  - Movement is **substep swept** so thin signs cannot be tunneled at dash speed.
  - Rooftop segments are assembled from a prologue plus seeded templates (gaps, crates, masts, drones, breakable signs, movers). Old segments past the camera are discarded; generation stays bounded.
  - Attract mode runs the same physics with a look-ahead controller, then yields to a fresh daily-seeded run on first input.
  - Web Audio beeps are created only after user input; there is no autoplay prompt.

## Attract mode

Before the first input the courier is already moving. The opening rooftops force a vault and a mid-gap dash so a short capture shows title, character, rain, skyline parallax, rooftops, and a live objective.

## Completeness

Open `index.html` locally. No server required. If a browser blocks `localStorage` on `file://`, the run still plays; best score simply will not persist.
