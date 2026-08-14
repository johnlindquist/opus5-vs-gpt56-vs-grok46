# Neon Courier — One-Button Rooftop Heist

Build a polished, highly replayable one-button arcade game called “Neon Courier.” The player is a courier sprinting across rooftops in a rain-soaked neon city while carrying stolen data.

You are working in an empty isolated directory. Build the complete artifact now. Do not merely describe it.

## Product goal

Create a direct-open local game with immediate motion and visual payoff. At a 1600×900 viewport, the title, character, rooftops, rain, skyline, and current objective should be unmistakable within five seconds.

Use Canvas 2D and ordinary browser APIs. No external files beyond the local project, no framework, and no dependency.

## Core game

The courier runs automatically from left to right. The sole action button is Space, pointer press, or touch:

- Tap while grounded: jump.
- Tap while airborne with charge available: dash toward the current movement direction.
- Hold briefly while grounded: charge a higher jump, with a visible but compact charge cue.
- Tap after a crash: restart immediately.

The game must include:

- Procedurally assembled rooftop segments from a curated set.
- Gaps, low obstacles, high obstacles, drones, breakable signs, and moving hazards.
- Collision rules that feel fair.
- Coyote time and jump buffering.
- A near-miss system.
- Score, distance, combo, best score, and current speed.
- Difficulty that rises gradually rather than spiking at once.
- A dramatic slow-motion or visual emphasis on close calls.
- A clear game-over state and instant restart.
- A deterministic daily-style seed shown in the UI.
- Local best-score persistence using `localStorage`.

## Attract mode

Before the first input, run an automated attract sequence using the same game rules. It should demonstrate jumps and dashes rather than showing a static title screen. On the first user input, transition cleanly into a fresh playable run.

The attract sequence must make the automated seven-second screenshot useful.

## Visual direction

Aim for a stylish animated graphic-novel look:

- Deep city layers with parallax.
- Rain streaks, mist, windows, signs, antennae, and occasional lightning.
- Strong readable silhouettes.
- Cyan, magenta, amber, and red accents against dark architecture.
- A courier animation with at least run, jump, dash, stumble, and crash poses.
- Speed lines and controlled screen shake.
- Rooftop geometry that remains readable despite visual effects.
- A compact HUD and tasteful title treatment.
- No copyrighted characters or borrowed logos.

Audio may be generated after user input with Web Audio, but no audio is required for completeness and no blocking audio prompt is allowed.

## Controls and accessibility

- Space, pointer, and touch must all work.
- `P` pauses.
- `R` restarts.
- `M` toggles generated sound if sound exists.
- Visible keyboard focus is required.
- Respect reduced motion by reducing screen shake, flashes, rain density, and trail length without changing collision timing.
- Provide concise accessible instructions and current-state text.

## Engineering expectations

- Use a fixed gameplay timestep or another bounded-delta strategy.
- Separate update and render logic.
- Do not allow the player to tunnel through thin obstacles at high speed.
- Recycle or discard old level segments.
- Keep memory and entity counts bounded.
- Resize without corrupting collision coordinates.
- Avoid recurring console errors.

## Acceptance checklist

The result is complete only when:

- `index.html` launches directly from disk.
- Attract mode is animated and representative.
- A complete playable run is possible with one action button.
- Jump buffering, coyote time, dash, hazards, scoring, combo, difficulty, game over, and restart work.
- The skyline and rooftop layers visibly parallax.
- Best score persists locally.
- Reduced-motion mode remains playable.
- No remote runtime reference exists.
- `README.md` explains rules, controls, and architecture.

## Non-negotiable delivery contract

Work only inside the current directory. Do not inspect, read, or write parent or sibling directories. Do not use the network except for the model session already in progress. Do not install packages. Do not create a deployment, publish anything, push anything, initialize Git, or leave a server or background process running. Do not create symlinks. Use only local files and built-in browser, Bun, or Node APIs.

Before finishing, run reasonable local checks. Then create `battle-result.json` with exactly this shape:

```json
{
  "schema_version": 1,
  "status": "complete",
  "title": "Neon Courier — One-Button Rooftop Heist",
  "kind": "visual",
  "entrypoint": "index.html",
  "artifacts": [
    "index.html",
    "README.md"
  ],
  "checks": [
    {
      "name": "descriptive check name",
      "command": "exact command you ran",
      "status": "passed",
      "details": "what the check established"
    }
  ],
  "summary": "A concise description of the finished artifact.",
  "known_issues": []
}
```

List every important local file in artifacts. Every recorded check must be one you actually ran. If any required acceptance item remains unmet, set status to incomplete, mark the relevant check failed or not_run, and describe the issue honestly. Do not claim completion merely because files exist.
