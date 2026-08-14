/* Neon Courier — One-Button Rooftop Heist
   Canvas 2D, fixed timestep, no remote resources. */
(function () {
  "use strict";

  const W = 1600;
  const H = 900;
  const FIXED = 1 / 120;
  const MAX_FRAME = 0.05;
  const STORAGE_KEY = "neon-courier-best-v1";
  const ATTRACT_SEED = 0x4e0c00e1;

  const GRAVITY = 2350;
  const RUN_BASE = 340;
  const RUN_MAX = 560;
  const JUMP_V = -780;
  const JUMP_CHARGED = -1020;
  const DASH_TIME = 0.16;
  const DASH_SPEED = 920;
  const COYOTE = 0.09;
  const BUFFER = 0.12;
  const CHARGE_MAX = 0.38;
  const TAP_HOLD = 0.09;
  const PLAYER_W = 26;
  const PLAYER_H = 48;
  const HURT_INSET = 4;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const srStatus = document.getElementById("sr-status");

  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function dailySeedLabel() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + m + day;
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function loadBest() {
    try {
      const n = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
      return Number.isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch (e) {
      /* file:// privacy modes may block storage */
    }
  }

  const input = {
    down: false,
    pressed: false,
    released: false,
    pause: false,
    restart: false,
    mute: false,
  };

  let audio = {
    enabled: false,
    muted: false,
    ctx: null,
  };

  function ensureAudio() {
    if (audio.ctx || audio.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.enabled = true;
    } catch (e) {
      audio.enabled = false;
    }
  }

  function beep(freq, dur, type, gain) {
    if (!audio.enabled || audio.muted || !audio.ctx) return;
    const c = audio.ctx;
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.value = gain || 0.04;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  const state = {
    mode: "attract",
    paused: false,
    seedLabel: dailySeedLabel(),
    seedNum: ATTRACT_SEED,
    rng: mulberry32(ATTRACT_SEED),
    time: 0,
    camX: 0,
    camY: 0,
    shake: 0,
    timeScale: 1,
    slowT: 0,
    nearMissFlash: 0,
    lightning: 0,
    lightningT: 6,
    speedMul: 1,
    distance: 0,
    score: 0,
    combo: 0,
    comboT: 0,
    best: loadBest(),
    platforms: [],
    hazards: [],
    decals: [],
    particles: [],
    rain: [],
    genX: 0,
    genIndex: 0,
    objective: "DELIVER THE PACKET",
    crashed: false,
    crashT: 0,
    goAlpha: 0,
    titlePulse: 0,
    srTimer: 0,
  };

  const player = {
    x: 120,
    y: 400,
    vx: RUN_BASE,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    grounded: false,
    coyote: 0,
    buffer: 0,
    charge: 0,
    charging: false,
    holdT: 0,
    dashAvail: true,
    dashing: false,
    dashT: 0,
    pose: "run",
    anim: 0,
    trail: [],
    alive: true,
    stumble: 0,
    rot: 0,
    facing: 1,
  };

  function resetWorld(seedNum, mode) {
    state.mode = mode;
    state.paused = false;
    state.seedNum = seedNum;
    state.rng = mulberry32(seedNum);
    state.time = 0;
    state.camX = 0;
    state.camY = 0;
    state.shake = 0;
    state.timeScale = 1;
    state.slowT = 0;
    state.nearMissFlash = 0;
    state.lightning = 0;
    state.lightningT = 4 + state.rng() * 6;
    state.speedMul = 1;
    state.distance = 0;
    state.score = 0;
    state.combo = 0;
    state.comboT = 0;
    state.platforms.length = 0;
    state.hazards.length = 0;
    state.decals.length = 0;
    state.particles.length = 0;
    state.genX = 0;
    state.genIndex = 0;
    state.objective = "SPRINT THE RIDGELINE";
    state.crashed = false;
    state.crashT = 0;
    state.goAlpha = 0;
    player.x = 180;
    player.y = 420;
    player.vx = RUN_BASE;
    player.vy = 0;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
    player.charge = 0;
    player.charging = false;
    player.holdT = 0;
    player.dashAvail = true;
    player.dashing = false;
    player.dashT = 0;
    player.pose = "run";
    player.anim = 0;
    player.trail.length = 0;
    player.alive = true;
    player.stumble = 0;
    player.rot = 0;
    seedRain();
    buildPrologue();
    while (state.genX < player.x + W * 2.2) spawnSegment();
    snapPlayerToGround();
  }

  function difficulty() {
    return 1 - Math.exp(-state.distance / 5200);
  }

  function runSpeed() {
    return lerp(RUN_BASE, RUN_MAX, difficulty()) * (player.dashing ? 1 : 1);
  }

  function seedRain() {
    const n = reducedMotion ? 36 : 120;
    state.rain.length = 0;
    for (let i = 0; i < n; i++) {
      state.rain.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.5 + Math.random(),
        len: 10 + Math.random() * 18,
      });
    }
  }

  function addPlat(x, y, w, h, kind) {
    state.platforms.push({ x, y, w, h: h || 28, kind: kind || "roof" });
  }

  function addHaz(h) {
    state.hazards.push(h);
  }

  function addDecal(d) {
    state.decals.push(d);
  }

  function decorateRoof(x, y, w) {
    const rng = state.rng;
    const n = 1 + (rng() * 3) | 0;
    for (let i = 0; i < n; i++) {
      const dx = x + 30 + rng() * Math.max(10, w - 60);
      addDecal({
        type: rng() < 0.5 ? "antenna" : "vent",
        x: dx,
        y: y,
        h: 18 + rng() * 34,
        w: 6 + rng() * 10,
      });
    }
    if (rng() < 0.45) {
      addDecal({
        type: "sign",
        x: x + w * (0.2 + rng() * 0.5),
        y: y - 70 - rng() * 40,
        w: 70 + rng() * 50,
        hue: rng() < 0.5 ? "cyan" : "magenta",
        label: rng() < 0.5 ? "NITE" : "GRID",
      });
    }
  }

  function buildPrologue() {
    const y = 620;
    addPlat(0, y, 980, 220, "start");
    decorateRoof(80, y, 800);
    addPlat(1080, y - 20, 420, 240);
    decorateRoof(1100, y - 20, 380);
    addHaz({
      type: "crate",
      x: 1280,
      y: y - 20 - 32,
      w: 36,
      h: 32,
      solid: true,
    });
    addPlat(1640, y + 10, 520, 220);
    decorateRoof(1660, y + 10, 480);
    addHaz({
      type: "signBreak",
      x: 1988,
      y: y + 10 - 74,
      w: 18,
      h: 74,
      hp: 1,
    });
    addPlat(2300, y - 40, 640, 260);
    decorateRoof(2320, y - 40, 600);
    addHaz({
      type: "drone",
      x: 2680,
      y: y - 250,
      w: 28,
      h: 20,
      ox: 2680,
      oy: y - 250,
      phase: 0.4,
      amp: 28,
    });
    addHaz({
      type: "mover",
      x: 2480,
      y: y - 40 - 22,
      w: 54,
      h: 22,
      x0: 2420,
      x1: 2780,
      dir: 1,
      spd: 90,
    });
    state.genX = 2940;
    state.genIndex = 4;
  }

  function spawnSegment() {
    const rng = state.rng;
    const d = difficulty();
    const yBase = 520 + Math.sin(state.genIndex * 0.7) * 50 + (rng() - 0.5) * 70;
    const y = clamp(yBase, 430, 700);
    const kinds = ["flat", "gap", "crates", "high", "drone", "signs", "mixed"];
    let kind = kinds[(rng() * kinds.length) | 0];
    if (state.genIndex < 2) kind = "flat";
    const gap = 70 + d * 110 + rng() * 30;
    let width = 380 + rng() * 280;

    if (kind === "gap") {
      const left = 220 + rng() * 120;
      addPlat(state.genX, y, left, 200);
      decorateRoof(state.genX, y, left);
      const right = 300 + rng() * 200;
      addPlat(state.genX + left + gap, y + (rng() - 0.5) * 50, right, 200);
      decorateRoof(state.genX + left + gap, y, right);
      width = left + gap + right;
    } else if (kind === "crates") {
      addPlat(state.genX, y, width, 200);
      decorateRoof(state.genX, y, width);
      const count = 1 + (rng() * (1 + d * 2)) | 0;
      for (let i = 0; i < count; i++) {
        const cx = state.genX + 80 + i * (90 + rng() * 50);
        if (cx < state.genX + width - 50) {
          addHaz({
            type: "crate",
            x: cx,
            y: y - 30 - (rng() < 0.3 ? 10 : 0),
            w: 34 + rng() * 10,
            h: 28 + rng() * 10,
            solid: true,
          });
        }
      }
    } else if (kind === "high") {
      addPlat(state.genX, y, width, 200);
      decorateRoof(state.genX, y, width);
      addHaz({
        type: "high",
        x: state.genX + width * (0.35 + rng() * 0.25),
        y: y - 86,
        w: 26,
        h: 86,
        solid: true,
      });
    } else if (kind === "drone") {
      addPlat(state.genX, y, width, 200);
      decorateRoof(state.genX, y, width);
      const n = 1 + (d > 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const dx = state.genX + 120 + i * 160 + rng() * 80;
        addHaz({
          type: "drone",
          x: dx,
          y: y - 90 - rng() * 70,
          w: 28,
          h: 20,
          ox: dx,
          oy: y - 90 - rng() * 40,
          phase: rng() * Math.PI * 2,
          amp: 30 + rng() * 40,
        });
      }
    } else if (kind === "signs") {
      addPlat(state.genX, y, width * 0.45, 200);
      const g = 90 + d * 70;
      addPlat(state.genX + width * 0.45 + g, y, width * 0.5, 200);
      addHaz({
        type: "signBreak",
        x: state.genX + width * 0.45 + g * 0.45,
        y: y - 80,
        w: 18,
        h: 80,
        hp: 1,
      });
      width = width + g;
    } else if (kind === "mixed") {
      addPlat(state.genX, y, width, 200);
      decorateRoof(state.genX, y, width);
      addHaz({
        type: "crate",
        x: state.genX + 90,
        y: y - 32,
        w: 36,
        h: 32,
        solid: true,
      });
      addHaz({
        type: "mover",
        x: state.genX + 200,
        y: y - 20,
        w: 50,
        h: 20,
        x0: state.genX + 180,
        x1: state.genX + width - 80,
        dir: 1,
        spd: 70 + d * 80,
      });
      if (rng() < 0.6) {
        addHaz({
          type: "drone",
          x: state.genX + width * 0.7,
          y: y - 120,
          w: 28,
          h: 20,
          ox: state.genX + width * 0.7,
          oy: y - 120,
          phase: rng(),
          amp: 40,
        });
      }
    } else {
      addPlat(state.genX, y, width, 200);
      decorateRoof(state.genX, y, width);
      if (rng() < 0.35) {
        addHaz({
          type: "crate",
          x: state.genX + width * 0.55,
          y: y - 30,
          w: 32,
          h: 30,
          solid: true,
        });
      }
    }

    state.genX += width + 8;
    state.genIndex++;
  }

  function recycle() {
    const cut = state.camX - 500;
    state.platforms = state.platforms.filter((p) => p.x + p.w > cut);
    state.hazards = state.hazards.filter((h) => h.x + h.w > cut && !h.dead);
    state.decals = state.decals.filter((d) => d.x + (d.w || 20) > cut);
    if (state.particles.length > 180) {
      state.particles.splice(0, state.particles.length - 140);
    }
    while (state.genX < state.camX + W * 2.4 && state.platforms.length < 48) {
      spawnSegment();
    }
  }

  function snapPlayerToGround() {
    const feet = player.y + player.h;
    let best = null;
    for (let i = 0; i < state.platforms.length; i++) {
      const p = state.platforms[i];
      if (player.x + player.w > p.x && player.x < p.x + p.w) {
        if (!best || p.y < best.y) best = p;
      }
    }
    if (best) {
      player.y = best.y - player.h;
      player.grounded = true;
      player.vy = 0;
    }
  }

  function platformAt(x, y, w, h, vy) {
    let hit = null;
    for (let i = 0; i < state.platforms.length; i++) {
      const p = state.platforms[i];
      if (x + w > p.x + 4 && x < p.x + p.w - 4) {
        const feet = y + h;
        if (vy >= 0 && feet >= p.y && feet <= p.y + 22 && y < p.y) {
          if (!hit || p.y < hit.y) hit = p;
        }
      }
    }
    return hit;
  }

  function hurtbox() {
    return {
      x: player.x + HURT_INSET,
      y: player.y + 6,
      w: player.w - HURT_INSET * 2,
      h: player.h - 10,
    };
  }

  function spawnBurst(x, y, color, n) {
    const count = reducedMotion ? Math.min(6, n) : n;
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 260,
        vy: -40 - Math.random() * 220,
        life: 0.35 + Math.random() * 0.4,
        max: 0.7,
        color,
        s: 2 + Math.random() * 3,
      });
    }
  }

  function triggerNearMiss() {
    if (state.nearMissFlash > 0.12) return;
    state.combo += 1;
    state.comboT = 2.2;
    state.score += 40 * state.combo;
    state.nearMissFlash = 0.28;
    player.stumble = 0.18;
    if (!reducedMotion) {
      state.slowT = Math.max(state.slowT, 0.22);
      state.shake = Math.max(state.shake, 7);
    } else {
      state.slowT = Math.max(state.slowT, 0.08);
    }
    beep(880, 0.07, "square", 0.03);
    beep(1320, 0.09, "triangle", 0.025);
  }

  function crash() {
    if (!player.alive) return;
    player.alive = false;
    state.crashed = true;
    state.crashT = 0;
    player.pose = "crash";
    player.vy = -320;
    player.vx *= 0.35;
    player.dashing = false;
    state.shake = reducedMotion ? 4 : 16;
    spawnBurst(player.x + player.w / 2, player.y + player.h / 2, "#ff4d6d", 22);
    beep(110, 0.35, "sawtooth", 0.06);
    if (state.mode === "play") {
      if (state.score > state.best) {
        state.best = state.score | 0;
        saveBest(state.best);
      }
    }
    announce("Crashed. Score " + (state.score | 0) + ". Tap to restart.");
  }

  function doJump(power) {
    player.vy = power;
    player.grounded = false;
    player.coyote = 0;
    player.charging = false;
    player.charge = 0;
    player.holdT = 0;
    player.pose = "jump";
    player.dashAvail = true;
    spawnBurst(player.x + 8, player.y + player.h, "#5ef2ff", 8);
    beep(power < -900 ? 420 : 340, 0.08, "square", 0.04);
  }

  function doDash() {
    if (!player.dashAvail || player.grounded || !player.alive) return false;
    player.dashAvail = false;
    player.dashing = true;
    player.dashT = DASH_TIME;
    player.pose = "dash";
    player.vy = Math.min(player.vy, -40) * 0.35 - 80;
    spawnBurst(player.x, player.y + 20, "#ff2bd6", 12);
    beep(640, 0.1, "sawtooth", 0.045);
    return true;
  }

  function handleActionPress() {
    if (state.mode === "attract") {
      ensureAudio();
      resetWorld(hashString(state.seedLabel), "play");
      announce("Run started. Jump with space or tap. Hold to charge.");
      return;
    }
    if (state.paused) return;
    if (state.crashed) {
      ensureAudio();
      resetWorld(hashString(state.seedLabel), "play");
      announce("New run.");
      return;
    }
    ensureAudio();
    if (player.grounded || player.coyote > 0) {
      player.charging = true;
      player.holdT = 0;
      player.charge = 0;
    } else if (player.dashAvail) {
      doDash();
    } else {
      player.buffer = BUFFER;
    }
  }

  function handleActionRelease() {
    if (state.mode !== "play" || state.paused || state.crashed) return;
    if (!player.charging) return;
    const charged = player.holdT >= TAP_HOLD;
    const t = charged ? clamp(player.charge, 0, 1) : 0;
    const power = lerp(JUMP_V, JUMP_CHARGED, t);
    if (player.grounded || player.coyote > 0) doJump(power);
    else player.buffer = BUFFER;
    player.charging = false;
    player.charge = 0;
    player.holdT = 0;
  }

  function nextThreat() {
    let best = null;
    let bestX = 1e9;
    const px = player.x + player.w;
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      if (h.dead) continue;
      if (h.x + h.w > px && h.x < bestX && h.x < px + 700) {
        best = h;
        bestX = h.x;
      }
    }
    const plats = state.platforms.slice().sort(function (a, b) {
      return a.x - b.x;
    });
    for (let i = 0; i < plats.length - 1; i++) {
      const p = plats[i];
      const next = plats[i + 1];
      const gapStart = p.x + p.w;
      const gap = next.x - gapStart;
      if (gap > 48 && gapStart > px && gapStart < bestX && gapStart < px + 700) {
        best = { type: "gap", x: gapStart, w: gap, y: p.y, h: 8, gap: gap };
        bestX = gapStart;
      }
    }
    return best;
  }

  function attractThink() {
    if (!player.alive) {
      if (state.crashT > 0.8) resetWorld(ATTRACT_SEED, "attract");
      return;
    }
    const threat = nextThreat();
    const px = player.x + player.w;
    if (!threat) {
      if (player.charging) {
        player.charging = false;
        if (player.grounded) doJump(JUMP_V);
      }
      return;
    }
    const dist = threat.x - px;
    const speed = Math.max(player.vx, 1);
    const eta = dist / speed;

    if (threat.type === "gap") {
      const needCharge = threat.gap > 130;
      if (player.grounded) {
        if (needCharge && eta < 0.55 && eta > 0.08) {
          player.charging = true;
          player.holdT += FIXED;
          player.charge = clamp(player.holdT / CHARGE_MAX, 0, 1);
          if (eta < 0.16) {
            doJump(lerp(JUMP_V, JUMP_CHARGED, player.charge));
          }
        } else if (eta < 0.28 && eta > 0.02) {
          doJump(needCharge ? JUMP_CHARGED : JUMP_V);
        }
      } else if (player.dashAvail && eta < 0.12 && player.vy > -40) {
        doDash();
      }
    } else if (threat.type === "crate" || threat.type === "mover") {
      if (player.grounded && eta < 0.32 && eta > 0.02) doJump(JUMP_V);
    } else if (threat.type === "high") {
      if (player.grounded && eta < 0.5 && eta > 0.1) {
        player.charging = true;
        player.holdT += FIXED;
        player.charge = 1;
        if (eta < 0.22) doJump(JUMP_CHARGED);
      } else if (!player.grounded && player.dashAvail && dist < 70) {
        doDash();
      }
    } else if (threat.type === "signBreak") {
      if (player.grounded && eta < 0.34) doJump(JUMP_V);
      if (!player.grounded && player.dashAvail && dist < 90) doDash();
    } else if (threat.type === "drone") {
      const dy = Math.abs(threat.y - (player.y + 10));
      if (player.grounded && eta < 0.34 && dy < 100) doJump(JUMP_V);
      if (!player.grounded && player.dashAvail && dist < 110 && dy < 70) doDash();
    }
  }

  function updateHazards(dt) {
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      if (h.dead) continue;
      if (h.type === "drone") {
        h.phase += dt * 2.2;
        h.x = h.ox + Math.sin(h.phase) * 10;
        h.y = h.oy + Math.sin(h.phase * 1.7) * h.amp;
      } else if (h.type === "mover") {
        h.x += h.dir * h.spd * dt;
        if (h.x < h.x0) {
          h.x = h.x0;
          h.dir = 1;
        }
        if (h.x > h.x1) {
          h.x = h.x1;
          h.dir = -1;
        }
      }
    }
  }

  function collideHazards() {
    const hb = hurtbox();
    const pad = player.dashing ? 2 : 0;
    for (let i = 0; i < state.hazards.length; i++) {
      const h = state.hazards[i];
      if (h.dead) continue;
      if (
        (h.type === "crate" || h.type === "mover" || h.type === "high") &&
        player.vy >= 0 &&
        player.x + player.w > h.x + 4 &&
        player.x < h.x + h.w - 4
      ) {
        const feet = player.y + player.h;
        if (feet >= h.y && feet <= h.y + 16 && player.y < h.y) {
          player.y = h.y - player.h;
          player.vy = 0;
          player.grounded = true;
          player.dashAvail = true;
          player.dashing = false;
          continue;
        }
      }
      const hit = aabb(hb.x, hb.y, hb.w, hb.h, h.x + pad, h.y, h.w - pad * 2, h.h);
      if (hit) {
        if (h.type === "signBreak" && (player.dashing || player.vy < -200)) {
          h.dead = true;
          h.hp = 0;
          state.combo += 1;
          state.comboT = 2.2;
          state.score += 70 * state.combo;
          spawnBurst(h.x + 8, h.y + 20, "#ff2bd6", 16);
          beep(520, 0.08, "square", 0.04);
          continue;
        }
        if (h.type === "drone" && player.dashing) {
          h.dead = true;
          state.combo += 1;
          state.comboT = 2.2;
          state.score += 90 * state.combo;
          spawnBurst(h.x + 14, h.y + 10, "#ff4d6d", 14);
          beep(700, 0.07, "square", 0.035);
          continue;
        }
        crash();
        return;
      }
      const near = aabb(
        hb.x - 16,
        hb.y - 10,
        hb.w + 32,
        hb.h + 18,
        h.x,
        h.y,
        h.w,
        h.h
      );
      if (near && !hit && player.alive && h.x + h.w > player.x) {
        const closeY = Math.abs(hb.y + hb.h / 2 - (h.y + h.h / 2)) < h.h * 0.9 + 24;
        if (closeY) {
          h._near = (h._near || 0) + 1;
          if (h._near === 2) triggerNearMiss();
        }
      }
    }
  }

  function updatePlayer(dt) {
    if (!player.alive) {
      player.vy += GRAVITY * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.rot += 7 * dt;
      player.anim += dt;
      player.pose = "crash";
      return;
    }

    const target = runSpeed();
    if (player.dashing) {
      player.dashT -= dt;
      player.vx = DASH_SPEED;
      if (player.dashT <= 0) {
        player.dashing = false;
        player.vx = target;
      }
    } else {
      player.vx = target;
    }

    if (player.charging && player.grounded) {
      player.holdT += dt;
      player.charge = clamp(player.holdT / CHARGE_MAX, 0, 1);
    }

    if (player.buffer > 0) player.buffer -= dt;
    if (player.coyote > 0) player.coyote -= dt;
    if (player.stumble > 0) player.stumble -= dt;

    const wasGround = player.grounded;
    player.grounded = false;

    player.vy += GRAVITY * dt;
    if (player.vy > 1400) player.vy = 1400;

    const dx = player.vx * dt;
    const dy = player.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
    const sx = dx / steps;
    const sy = dy / steps;

    for (let s = 0; s < steps; s++) {
      player.x += sx;
      player.y += sy;
      const land = platformAt(player.x, player.y, player.w, player.h, player.vy);
      if (land) {
        player.y = land.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.dashAvail = true;
        player.dashing = false;
        player.rot = 0;
        if (player.buffer > 0 && !player.charging) {
          player.buffer = 0;
          doJump(JUMP_V);
          player.grounded = false;
        }
        break;
      }
    }

    if (wasGround && !player.grounded) player.coyote = COYOTE;
    if (player.grounded && player.charging && player.holdT > CHARGE_MAX + 0.35) {
      doJump(JUMP_CHARGED);
    }

    if (player.y > H + 80) crash();

    player.anim += dt * (player.dashing ? 18 : player.grounded ? 10 : 4);
    if (!player.alive) player.pose = "crash";
    else if (player.dashing) player.pose = "dash";
    else if (!player.grounded) player.pose = "jump";
    else if (player.stumble > 0) player.pose = "stumble";
    else player.pose = "run";

    if (!reducedMotion || player.dashing) {
      const maxTrail = reducedMotion ? 4 : 10;
      player.trail.push({ x: player.x, y: player.y, t: 0.18, pose: player.pose });
      if (player.trail.length > maxTrail) player.trail.shift();
    }
    for (let i = player.trail.length - 1; i >= 0; i--) {
      player.trail[i].t -= dt;
      if (player.trail[i].t <= 0) player.trail.splice(i, 1);
    }
  }

  function updateObjective() {
    const t = nextThreat();
    if (!t) {
      state.objective = "DELIVER THE PACKET";
      return;
    }
    const map = {
      gap: "LEAP THE VOID",
      crate: "VAULT THE CRATE",
      high: "CLEAR THE MAST",
      drone: "THREAD THE DRONE",
      signBreak: "SMASH THE SIGN",
      mover: "TIME THE SWEEP",
    };
    state.objective = map[t.type] || "DELIVER THE PACKET";
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 800 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updateRain(dt) {
    const wind = 220 + player.vx * 0.35;
    for (let i = 0; i < state.rain.length; i++) {
      const r = state.rain[i];
      r.x -= wind * r.z * dt;
      r.y += (980 * r.z) * dt;
      if (r.y > H) {
        r.y = -20;
        r.x = (r.x + W * 2) % (W + 200) - 40;
      }
      if (r.x < -40) r.x += W + 80;
    }
  }

  function update(dt) {
    if (state.paused && state.mode === "play") return;

    const ts = state.slowT > 0 ? (reducedMotion ? 0.72 : 0.42) : 1;
    state.timeScale = ts;
    const gdt = dt * ts;
    state.time += gdt;
    if (state.slowT > 0) state.slowT -= dt;
    if (state.nearMissFlash > 0) state.nearMissFlash -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);
    state.titlePulse += dt;

    state.lightningT -= dt;
    if (state.lightningT <= 0) {
      state.lightning = reducedMotion ? 0.08 : 0.18;
      state.lightningT = 7 + Math.random() * 9;
      if (!reducedMotion) state.shake = Math.max(state.shake, 5);
    }
    if (state.lightning > 0) state.lightning -= dt;

    if (state.mode === "attract") attractThink();

    updateHazards(gdt);
    updatePlayer(gdt);
    if (player.alive) collideHazards();

    state.distance = Math.max(state.distance, (player.x - 180) / 10);
    if (player.alive && state.mode === "play") {
      state.score += gdt * (12 + difficulty() * 18) * (1 + state.combo * 0.15);
    }
    if (state.comboT > 0) {
      state.comboT -= gdt;
      if (state.comboT <= 0) state.combo = 0;
    }

    state.camX = lerp(state.camX, player.x - 380, 0.14);
    state.camY = lerp(state.camY, clamp(player.y - 420, -80, 120), 0.08);

    updateObjective();
    updateParticles(gdt);
    updateRain(dt);
    recycle();

    if (state.crashed) {
      state.crashT += dt;
      state.goAlpha = clamp(state.crashT * 2.2, 0, 1);
    }

    state.srTimer += dt;
    if (state.srTimer > 2.5) {
      state.srTimer = 0;
      if (state.mode === "play" && player.alive) {
        announce(
          "Score " +
            (state.score | 0) +
            ", distance " +
            (state.distance | 0) +
            ", " +
            state.objective
        );
      }
    }
  }

  function announce(msg) {
    if (!srStatus) return;
    srStatus.textContent = msg;
  }

  function wx(x) {
    return x - state.camX;
  }
  function wy(y) {
    return y - state.camY;
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07061a");
    g.addColorStop(0.45, "#120c28");
    g.addColorStop(0.72, "#1a1030");
    g.addColorStop(1, "#0a0814");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,43,214,0.08)";
    ctx.fillRect(0, 120, W, 3);
    ctx.fillStyle = "rgba(94,242,255,0.07)";
    ctx.fillRect(0, 260, W, 2);

    if (!reducedMotion) {
      ctx.fillStyle = "rgba(180,210,255,0.35)";
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 197 + state.camX * 0.02) % W);
        const sy = (i * 53) % 280;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }
  }

  function drawSkyline(factor, yBase, color, variance, count) {
    ctx.fillStyle = color;
    const span = 140;
    const offset = -((state.camX * factor) % span);
    ctx.beginPath();
    ctx.moveTo(offset - 40, H);
    for (let i = -1; i < count; i++) {
      const x = offset + i * span;
      const seed = Math.abs(Math.sin((Math.floor((state.camX * factor + i * span) / span)) * 12.9898) * 43758.5453);
      const u = seed - Math.floor(seed);
      const bh = yBase - u * variance;
      const bw = 70 + u * 50;
      ctx.lineTo(x, bh + 80);
      ctx.lineTo(x, bh);
      ctx.lineTo(x + bw * 0.25, bh);
      ctx.lineTo(x + bw * 0.25, bh - 40 - u * 80);
      ctx.lineTo(x + bw * 0.45, bh - 40 - u * 80);
      ctx.lineTo(x + bw * 0.45, bh);
      ctx.lineTo(x + bw, bh);
      ctx.lineTo(x + bw, bh + 90);
    }
    ctx.lineTo(W + 40, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 196, 90, 0.14)";
    for (let i = -1; i < count; i++) {
      const x = offset + i * span + 18;
      const seed = Math.abs(Math.sin((Math.floor((state.camX * factor + i * span) / span)) * 19.17) * 221.7);
      const u = seed - Math.floor(seed);
      if (u > 0.35) {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 3; c++) {
            if (((r + c + (i | 0)) & 1) === 0) continue;
            ctx.fillRect(x + c * 10, yBase - 70 + r * 14, 5, 8);
          }
        }
      }
    }
  }

  function drawMist() {
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, "rgba(10,8,24,0)");
    g.addColorStop(1, "rgba(8,10,28,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRain() {
    ctx.strokeStyle = reducedMotion ? "rgba(170,210,255,0.18)" : "rgba(190,220,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < state.rain.length; i++) {
      const r = state.rain[i];
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.len * 0.35, r.y + r.len);
    }
    ctx.stroke();
  }

  function drawPlatform(p) {
    const x = wx(p.x);
    const y = wy(p.y);
    if (x > W + 40 || x + p.w < -40) return;
    ctx.fillStyle = "#141826";
    ctx.fillRect(x, y, p.w, H);
    ctx.fillStyle = "#1d2438";
    ctx.fillRect(x, y, p.w, 18);
    ctx.fillStyle = "#5ef2ff";
    ctx.fillRect(x, y, p.w, 3);
    ctx.fillStyle = "#ff2bd6";
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, y + 3, p.w, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,196,90,0.16)";
    const cols = Math.max(2, (p.w / 46) | 0);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 8; r++) {
        if ((c + r) % 2 === 0) continue;
        ctx.fillRect(x + 12 + c * 46, y + 36 + r * 28, 10, 14);
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 1, y + 1, p.w - 2, 40);
  }

  function drawDecal(d) {
    const x = wx(d.x);
    const y = wy(d.y);
    if (x > W + 60 || x < -80) return;
    if (d.type === "antenna") {
      ctx.strokeStyle = "#8aa0c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - d.h);
      ctx.lineTo(x + 8, y - d.h + 6);
      ctx.stroke();
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.arc(x, y - d.h, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === "vent") {
      ctx.fillStyle = "#2a3148";
      ctx.fillRect(x, y - 14, d.w, 14);
      ctx.fillStyle = "#0d1018";
      ctx.fillRect(x + 2, y - 11, d.w - 4, 3);
    } else if (d.type === "sign") {
      ctx.fillStyle = d.hue === "cyan" ? "rgba(94,242,255,0.8)" : "rgba(255,43,214,0.8)";
      ctx.fillRect(x, y, d.w, 22);
      ctx.fillStyle = "#05040a";
      ctx.font = "700 12px Segoe UI, sans-serif";
      ctx.fillText(d.label, x + 8, y + 15);
    }
  }

  function drawHazard(h) {
    if (h.dead) return;
    const x = wx(h.x);
    const y = wy(h.y);
    if (x > W + 40 || x < -60) return;
    if (h.type === "crate") {
      ctx.fillStyle = "#2b334c";
      ctx.fillRect(x, y, h.w, h.h);
      ctx.strokeStyle = "#5ef2ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, h.w, h.h);
      ctx.strokeStyle = "#ffbf5e";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + h.w - 4, y + h.h - 4);
      ctx.stroke();
    } else if (h.type === "high") {
      ctx.fillStyle = "#1a2030";
      ctx.fillRect(x, y, h.w, h.h);
      ctx.fillStyle = "#ff4d6d";
      ctx.fillRect(x, y, h.w, 6);
      ctx.fillRect(x + 6, y + 14, 6, h.h - 20);
    } else if (h.type === "drone") {
      ctx.fillStyle = "#14141c";
      ctx.beginPath();
      ctx.ellipse(x + 14, y + 10, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff4d6d";
      ctx.fillRect(x + 8, y + 6, 12, 4);
      ctx.fillStyle = "rgba(255,77,109,0.35)";
      ctx.beginPath();
      ctx.arc(x + 14, y + 22, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5ef2ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 8);
      ctx.lineTo(x + 34, y + 8);
      ctx.stroke();
    } else if (h.type === "signBreak") {
      ctx.fillStyle = "#ff2bd6";
      ctx.fillRect(x, y, h.w, h.h);
      ctx.fillStyle = "#05040a";
      ctx.fillRect(x + 4, y + 10, 10, h.h - 20);
      ctx.fillStyle = "#5ef2ff";
      ctx.fillRect(x - 8, y - 6, h.w + 16, 6);
    } else if (h.type === "mover") {
      ctx.fillStyle = "#3a2a18";
      ctx.fillRect(x, y, h.w, h.h);
      ctx.fillStyle = "#ffbf5e";
      ctx.fillRect(x, y, h.w, 3);
      ctx.fillRect(x + 6, y + 8, 8, 8);
      ctx.fillRect(x + h.w - 16, y + 8, 8, 8);
    }
  }

  function drawCourierAt(x, y, pose, alpha, rot) {
    ctx.save();
    ctx.translate(x + player.w / 2, y + player.h / 2);
    ctx.rotate(rot || 0);
    ctx.globalAlpha = alpha;
    const t = player.anim;
    const run = Math.sin(t * 2.2);
    ctx.fillStyle = "#07070c";
    ctx.strokeStyle = "#5ef2ff";
    ctx.lineWidth = 2;

    if (pose === "dash") {
      ctx.scale(1.25, 0.78);
    } else if (pose === "jump") {
      ctx.rotate(-0.15);
    } else if (pose === "stumble") {
      ctx.rotate(0.2);
    } else if (pose === "crash") {
      ctx.rotate(player.rot);
    }

    ctx.fillStyle = "#0b0d14";
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(12, 8);
    ctx.lineTo(14, 22);
    ctx.lineTo(-16, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ff2bd6";
    ctx.fillRect(4, 2, 10, 12);
    ctx.fillStyle = "#ffe38a";
    ctx.fillRect(6, 4, 6, 4);

    ctx.fillStyle = "#12141c";
    ctx.fillRect(-8, -18, 16, 18);
    ctx.fillStyle = "#5ef2ff";
    ctx.fillRect(-6, -12, 12, 5);
    ctx.fillStyle = "#0a0c12";
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.lineTo(8, -22);
    ctx.lineTo(10, -10);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d7f7ff";
    ctx.stroke();

    ctx.strokeStyle = "#8aa0c8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (pose === "run") {
      ctx.moveTo(-4, 22);
      ctx.lineTo(-8 + run * 10, 34);
      ctx.moveTo(4, 22);
      ctx.lineTo(8 - run * 10, 34);
    } else if (pose === "jump") {
      ctx.moveTo(-6, 18);
      ctx.lineTo(-12, 8);
      ctx.moveTo(6, 20);
      ctx.lineTo(10, 30);
    } else if (pose === "dash") {
      ctx.moveTo(-10, 16);
      ctx.lineTo(-28, 18);
      ctx.moveTo(8, 16);
      ctx.lineTo(22, 14);
    } else if (pose === "stumble") {
      ctx.moveTo(-2, 22);
      ctx.lineTo(-16, 30);
      ctx.moveTo(6, 22);
      ctx.lineTo(12, 34);
    } else {
      ctx.moveTo(-6, 16);
      ctx.lineTo(-18, 8);
      ctx.moveTo(6, 16);
      ctx.lineTo(16, 24);
    }
    ctx.stroke();

    ctx.strokeStyle = "#5ef2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.lineTo(pose === "dash" ? 26 : 16, pose === "jump" ? -12 : 4);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPlayer() {
    const maxTrail = reducedMotion ? 3 : player.trail.length;
    for (let i = 0; i < maxTrail; i++) {
      const tr = player.trail[i];
      if (!tr) continue;
      drawCourierAt(wx(tr.x), wy(tr.y), tr.pose, tr.t * 1.6, 0);
    }
    drawCourierAt(wx(player.x), wy(player.y), player.pose, 1, player.alive ? 0 : player.rot);

    if (player.charging && player.alive) {
      const cx = wx(player.x) + player.w / 2;
      const cy = wy(player.y) - 14;
      ctx.strokeStyle = "rgba(215,247,255,0.25)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = player.charge > 0.85 ? "#ff2bd6" : "#5ef2ff";
      ctx.beginPath();
      ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.charge);
      ctx.stroke();
    }

    if (player.dashing && !reducedMotion) {
      ctx.strokeStyle = "rgba(255,43,214,0.45)";
      ctx.lineWidth = 2;
      const px = wx(player.x);
      const py = wy(player.y) + 20;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(px - 20 - i * 18, py - 10 + i * 5);
        ctx.lineTo(px - 50 - i * 22, py - 10 + i * 5);
      }
      ctx.stroke();
    }
  }

  function drawParticles() {
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(wx(p.x), wy(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(5,4,10,0.45)";
    ctx.fillRect(20, 18, 430, 118);
    ctx.strokeStyle = "rgba(94,242,255,0.35)";
    ctx.strokeRect(20.5, 18.5, 429, 117);

    ctx.fillStyle = "#5ef2ff";
    ctx.font = "700 18px Segoe UI, sans-serif";
    ctx.letterSpacing = "0.28em";
    ctx.fillText("NEON COURIER", 36, 46);
    ctx.letterSpacing = "0";
    ctx.fillStyle = "#ff2bd6";
    ctx.font = "600 11px Segoe UI, sans-serif";
    ctx.fillText("ONE-BUTTON ROOFTOP HEIST", 36, 64);

    ctx.fillStyle = "#d7f7ff";
    ctx.font = "600 13px Segoe UI, sans-serif";
    const spd = (runSpeed() / 10).toFixed(1);
    ctx.fillText("SCORE " + (state.score | 0), 36, 88);
    ctx.fillText("DIST " + (state.distance | 0) + "m", 168, 88);
    ctx.fillText("BEST " + (state.best | 0), 300, 88);
    ctx.fillStyle = "#ffbf5e";
    ctx.fillText("COMBO x" + state.combo, 36, 110);
    ctx.fillStyle = "#5ef2ff";
    ctx.fillText("SPD " + spd, 168, 110);
    ctx.fillStyle = "#8aa0c8";
    ctx.fillText("SEED " + state.seedLabel, 300, 110);

    ctx.fillStyle = "rgba(5,4,10,0.5)";
    ctx.fillRect(W - 430, 18, 410, 64);
    ctx.strokeStyle = "rgba(255,43,214,0.35)";
    ctx.strokeRect(W - 429.5, 18.5, 409, 63);
    ctx.fillStyle = "#ffe38a";
    ctx.font = "700 16px Segoe UI, sans-serif";
    ctx.fillText(state.objective, W - 414, 46);
    ctx.fillStyle = "#8aa0c8";
    ctx.font = "12px Segoe UI, sans-serif";
    const hint =
      state.mode === "attract"
        ? "DEMO  ·  SPACE / TAP TO HIJACK THE RUN"
        : player.dashAvail && !player.grounded
          ? "AIR DASH READY"
          : player.grounded
            ? "TAP JUMP  ·  HOLD CHARGE"
            : "IN AIR";
    ctx.fillText(hint, W - 414, 66);

    if (state.mode === "attract") {
      const a = 0.55 + Math.sin(state.titlePulse * 3) * 0.25;
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(5,4,10,0.55)";
      ctx.fillRect(W / 2 - 280, H - 120, 560, 72);
      ctx.strokeStyle = "#5ef2ff";
      ctx.strokeRect(W / 2 - 279.5, H - 119.5, 559, 71);
      ctx.fillStyle = "#d7f7ff";
      ctx.font = "700 22px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PRESS SPACE  ·  CLICK  ·  TAP", W / 2, H - 76);
      ctx.font = "13px Segoe UI, sans-serif";
      ctx.fillStyle = "#8aa0c8";
      ctx.fillText("Jump · Charge · Dash  —  steal the night", W / 2, H - 54);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    if (state.paused && state.mode === "play") {
      ctx.fillStyle = "rgba(5,4,10,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#5ef2ff";
      ctx.font = "700 48px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.font = "16px Segoe UI, sans-serif";
      ctx.fillStyle = "#d7f7ff";
      ctx.fillText("P to resume  ·  R to restart", W / 2, H / 2 + 36);
      ctx.textAlign = "left";
    }

    if (state.crashed && state.mode === "play") {
      ctx.globalAlpha = state.goAlpha * 0.62;
      ctx.fillStyle = "#12040c";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = state.goAlpha;
      ctx.fillStyle = "#ff4d6d";
      ctx.font = "700 54px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PACKET LOST", W / 2, H / 2 - 20);
      ctx.fillStyle = "#d7f7ff";
      ctx.font = "20px Segoe UI, sans-serif";
      ctx.fillText("SCORE " + (state.score | 0) + "   BEST " + (state.best | 0), W / 2, H / 2 + 24);
      ctx.font = "16px Segoe UI, sans-serif";
      ctx.fillStyle = "#5ef2ff";
      ctx.fillText("TAP / SPACE / CLICK TO RESTART", W / 2, H / 2 + 58);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "rgba(215,247,255,0.55)";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.fillText(
      "P pause   R restart   M sound" + (audio.muted ? " (off)" : "") + (reducedMotion ? "   reduced motion" : ""),
      24,
      H - 18
    );
    ctx.restore();
  }

  function drawSpeedLines() {
    if (reducedMotion) return;
    if (player.vx < 420 && !player.dashing) return;
    ctx.strokeStyle = "rgba(215,247,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const y = 80 + i * 64;
      const x = (i * 140 + state.time * 900) % W;
      ctx.moveTo(W - x, y);
      ctx.lineTo(W - x - 80, y + 6);
    }
    ctx.stroke();
  }

  function render() {
    let sx = 0;
    let sy = 0;
    if (state.shake > 0 && !reducedMotion) {
      sx = (Math.random() - 0.5) * state.shake;
      sy = (Math.random() - 0.5) * state.shake;
    }
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    drawSky();
    drawSkyline(0.12, 430, "#0b1020", 90, 16);
    drawSkyline(0.28, 500, "#12182c", 110, 14);
    drawSkyline(0.48, 560, "#182036", 80, 12);
    drawMist();
    drawRain();

    if (state.lightning > 0) {
      ctx.fillStyle = "rgba(200,230,255," + state.lightning * (reducedMotion ? 0.25 : 0.55) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    for (let i = 0; i < state.platforms.length; i++) drawPlatform(state.platforms[i]);
    for (let i = 0; i < state.decals.length; i++) drawDecal(state.decals[i]);
    for (let i = 0; i < state.hazards.length; i++) drawHazard(state.hazards[i]);
    drawParticles();
    drawSpeedLines();
    drawPlayer();

    if (state.nearMissFlash > 0) {
      ctx.strokeStyle = "rgba(94,242,255," + state.nearMissFlash * 1.6 + ")";
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, W - 20, H - 20);
      ctx.fillStyle = "rgba(94,242,255," + state.nearMissFlash * 0.08 + ")";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vg = ctx.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 980);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    drawHud();
  }

  let acc = 0;
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt;
    const steps = 8;
    let n = 0;
    while (acc >= FIXED && n < steps) {
      update(FIXED);
      acc -= FIXED;
      n++;
    }
    if (n === steps) acc = 0;
    render();
    requestAnimationFrame(frame);
  }

  function bind() {
    function down(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!input.down) {
        input.down = true;
        handleActionPress();
      }
    }
    function up(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (input.down) {
        input.down = false;
        handleActionRelease();
      }
    }

    canvas.addEventListener("pointerdown", function (e) {
      canvas.focus();
      down(e);
    });
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("pointerup", function () {
      if (input.down) up();
    });

    window.addEventListener("keydown", function (e) {
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) down(e);
      } else if (e.code === "KeyP") {
        if (state.mode === "play" && !state.crashed) {
          state.paused = !state.paused;
          announce(state.paused ? "Paused." : "Resumed.");
        }
      } else if (e.code === "KeyR") {
        e.preventDefault();
        ensureAudio();
        resetWorld(hashString(state.seedLabel), "play");
        announce("Restarted.");
      } else if (e.code === "KeyM") {
        audio.muted = !audio.muted;
        if (!audio.muted) ensureAudio();
        announce(audio.muted ? "Sound off." : "Sound on.");
      }
    });
    window.addEventListener("keyup", function (e) {
      if (e.code === "Space") {
        e.preventDefault();
        up(e);
      }
    });

    canvas.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  }

  resetWorld(ATTRACT_SEED, "attract");
  bind();
  canvas.focus();
  announce("Attract mode. Neon Courier demo running. Press space or tap to play.");
  globalThis.__NC_SNAP = function () {
    return {
      t: Math.round(state.time * 100) / 100,
      x: Math.round(player.x),
      y: Math.round(player.y),
      pose: player.pose,
      alive: player.alive,
      grounded: player.grounded,
      dash: player.dashAvail,
      crashed: state.crashed,
      obj: state.objective,
      combo: state.combo,
    };
  };
  requestAnimationFrame(frame);
})();
