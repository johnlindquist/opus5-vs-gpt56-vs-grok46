"use strict";

/**
 * Gravity Atelier — 2D n-body sandbox
 *
 * Gravity uses Plummer softening: acceleration on i from j is
 *   a = G * m_j * r_ij / (|r|^2 + eps^2)^(3/2)
 * with eps derived from the pair radii. This keeps forces finite when
 * bodies nearly overlap and avoids the 1/r^2 singularity.
 *
 * Integrator: velocity Verlet at a fixed dt (1/96 s of simulation time).
 * Wall-clock catch-up is capped so a backgrounded tab cannot dump a huge
 * accumulated delta into the world.
 */

var G = 92;
var SOFTEN_K = 0.55;
var DT = 1 / 96;
var MAX_STEPS_PER_FRAME = 6;
var MAX_BODIES = 72;
var MAX_SPEED = 2200;
var MAX_POS = 80000;
var TRAIL_MAX = 168;
var TRAIL_MAX_REDUCED = 28;
var TRAIL_SAMPLE = 2;
var DEBRIS_MASS = 9;
var STAR_MASS = 420;
var THROW_SCALE = 2.15;
var PREVIEW_STEPS = 90;
var SCALES = [0.125, 0.25, 0.5, 1, 2, 4, 8];

var NAME_STEMS = [
  "Lyra", "Vesper", "Kepler", "Io", "Callisto", "Ash", "Nereid",
  "Halo", "Rhea", "Pallas", "Vela", "Mira", "Cygnus", "Solace",
  "Ember", "Frost", "Orion", "Thebe", "Calypso", "Dione"
];

function mulberry32(seed) {
  var a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function hypot2(x, y) {
  return x * x + y * y;
}

function circularSpeed(centralMass, r, eps) {
  var r2 = r * r;
  var d2 = r2 + eps * eps;
  var g = G * centralMass * r / Math.pow(d2, 1.5);
  return Math.sqrt(Math.max(0, g * r));
}

function volumeRadius(r1, r2) {
  return Math.cbrt(r1 * r1 * r1 + r2 * r2 * r2);
}

function makeBody(opts) {
  var trailCap = opts.trailCap || TRAIL_MAX;
  return {
    id: opts.id,
    name: opts.name,
    x: opts.x,
    y: opts.y,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    ax: 0,
    ay: 0,
    mass: opts.mass,
    radius: opts.radius,
    hue: opts.hue,
    sat: opts.sat == null ? 42 : opts.sat,
    lit: opts.lit == null ? 58 : opts.lit,
    kind: opts.kind || "planet",
    pinned: !!opts.pinned,
    trailX: new Float32Array(trailCap),
    trailY: new Float32Array(trailCap),
    trailLen: 0,
    trailCap: trailCap,
    trailHead: 0,
    trailSkip: 0,
    alive: true
  };
}

function resetTrail(body) {
  body.trailLen = 0;
  body.trailHead = 0;
  body.trailSkip = 0;
}

function pushTrail(body, reduced) {
  var cap = reduced ? Math.min(body.trailCap, TRAIL_MAX_REDUCED) : body.trailCap;
  body.trailSkip++;
  if (body.trailSkip < TRAIL_SAMPLE) return;
  body.trailSkip = 0;
  body.trailX[body.trailHead] = body.x;
  body.trailY[body.trailHead] = body.y;
  body.trailHead = (body.trailHead + 1) % cap;
  if (body.trailLen < cap) body.trailLen++;
}

function seedOrbitalTrail(body, cx, cy, radius, angle, reduced) {
  var cap = reduced ? Math.min(body.trailCap, TRAIL_MAX_REDUCED) : body.trailCap;
  var n = cap;
  var span = 1.15;
  resetTrail(body);
  for (var i = 0; i < n; i++) {
    var t = (i + 1) / n;
    var a = angle - span * (1 - t);
    body.trailX[i] = cx + Math.cos(a) * radius;
    body.trailY[i] = cy + Math.sin(a) * radius;
  }
  body.trailLen = n;
  body.trailHead = 0;
}

function pairSoftening(a, b) {
  return SOFTEN_K * (a.radius + b.radius);
}

function World(seed) {
  this.seed = seed;
  this.rng = mulberry32(seed);
  this.bodies = [];
  this.nextId = 1;
  this.time = 0;
  this.collisions = 0;
  this.shocks = [];
  this.debrisFx = [];
  this.primaryId = 0;
}

World.prototype.allocId = function () {
  return this.nextId++;
};

World.prototype.add = function (opts) {
  if (this.bodies.length >= MAX_BODIES) return null;
  opts.id = this.allocId();
  var b = makeBody(opts);
  this.bodies.push(b);
  return b;
};

World.prototype.primary = function () {
  var best = null;
  var i;
  for (i = 0; i < this.bodies.length; i++) {
    var b = this.bodies[i];
    if (!b.alive) continue;
    if (b.id === this.primaryId) return b;
    if (!best || b.mass > best.mass) best = b;
  }
  return best;
};

World.prototype.computeAccel = function () {
  var bodies = this.bodies;
  var n = bodies.length;
  var i, j, a, b, dx, dy, r2, eps, d2, inv, inv3, s, f;
  for (i = 0; i < n; i++) {
    bodies[i].ax = 0;
    bodies[i].ay = 0;
  }
  for (i = 0; i < n; i++) {
    a = bodies[i];
    if (!a.alive) continue;
    for (j = i + 1; j < n; j++) {
      b = bodies[j];
      if (!b.alive) continue;
      dx = b.x - a.x;
      dy = b.y - a.y;
      r2 = dx * dx + dy * dy;
      eps = pairSoftening(a, b);
      d2 = r2 + eps * eps;
      inv = 1 / Math.sqrt(d2);
      inv3 = inv * inv * inv;
      s = G * inv3;
      if (!a.pinned) {
        f = s * b.mass;
        a.ax += dx * f;
        a.ay += dy * f;
      }
      if (!b.pinned) {
        f = s * a.mass;
        b.ax -= dx * f;
        b.ay -= dy * f;
      }
    }
  }
};

World.prototype.integrate = function (dt) {
  var bodies = this.bodies;
  var n = bodies.length;
  var i, b, ax0, ay0;
  this.computeAccel();
  for (i = 0; i < n; i++) {
    b = bodies[i];
    if (!b.alive || b.pinned) continue;
    ax0 = b.ax;
    ay0 = b.ay;
    b.x += b.vx * dt + 0.5 * ax0 * dt * dt;
    b.y += b.vy * dt + 0.5 * ay0 * dt * dt;
    b._ax0 = ax0;
    b._ay0 = ay0;
  }
  this.computeAccel();
  for (i = 0; i < n; i++) {
    b = bodies[i];
    if (!b.alive || b.pinned) continue;
    b.vx += 0.5 * (b._ax0 + b.ax) * dt;
    b.vy += 0.5 * (b._ay0 + b.ay) * dt;
    var sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > MAX_SPEED * MAX_SPEED) {
      var sp = Math.sqrt(sp2);
      b.vx = (b.vx / sp) * MAX_SPEED;
      b.vy = (b.vy / sp) * MAX_SPEED;
    }
    if (!isFinite(b.x) || !isFinite(b.y) || hypot2(b.x, b.y) > MAX_POS * MAX_POS) {
      b.alive = false;
    }
  }
};

World.prototype.spawnShock = function (x, y, radius, energy) {
  this.shocks.push({
    x: x,
    y: y,
    r: radius,
    max: radius * (2.4 + Math.min(4, energy * 0.02)),
    life: 1,
    energy: energy
  });
};

World.prototype.spawnDebrisFx = function (x, y, vx, vy, n, rng) {
  var i;
  for (i = 0; i < n && this.debrisFx.length < 220; i++) {
    var ang = rng() * Math.PI * 2;
    var spd = 18 + rng() * 90;
    this.debrisFx.push({
      x: x,
      y: y,
      vx: vx * 0.25 + Math.cos(ang) * spd,
      vy: vy * 0.25 + Math.sin(ang) * spd,
      life: 0.7 + rng() * 0.5,
      r: 0.8 + rng() * 1.6
    });
  }
};

World.prototype.mergeBodies = function (a, b, rng) {
  if (a.mass < b.mass) {
    var tmp = a;
    a = b;
    b = tmp;
  }
  var m = a.mass + b.mass;
  var mx = (a.mass * a.x + b.mass * b.x) / m;
  var my = (a.mass * a.y + b.mass * b.y) / m;
  var energy = Math.sqrt(hypot2(a.vx - b.vx, a.vy - b.vy)) * 0.2 + 8;
  if (!a.pinned && !b.pinned) {
    a.vx = (a.mass * a.vx + b.mass * b.vx) / m;
    a.vy = (a.mass * a.vy + b.mass * b.vy) / m;
    a.x = mx;
    a.y = my;
  } else if (a.pinned) {
    /* pinned body keeps seat; infalling mass still contributes momentum visually via shock */
  } else {
    a.x = mx;
    a.y = my;
    a.vx = (a.mass * a.vx + b.mass * b.vx) / m;
    a.vy = (a.mass * a.vy + b.mass * b.vy) / m;
    a.pinned = b.pinned;
  }
  a.mass = m;
  a.radius = volumeRadius(a.radius, b.radius);
  if (b.kind === "star" || a.mass >= STAR_MASS) a.kind = "star";
  if (a.kind === "star") {
    a.hue = 42;
    a.sat = 88;
    a.lit = 72;
  }
  b.alive = false;
  this.spawnShock(mx, my, a.radius, energy);
  this.spawnDebrisFx(mx, my, a.vx, a.vy, 10, rng);
  this.collisions++;
};

World.prototype.fragment = function (a, b, rng) {
  var m = a.mass + b.mass;
  var mx = (a.mass * a.x + b.mass * b.x) / m;
  var my = (a.mass * a.y + b.mass * b.y) / m;
  var mvx = (a.mass * a.vx + b.mass * b.vx) / m;
  var mvy = (a.mass * a.vy + b.mass * b.vy) / m;
  var relx = a.vx - b.vx;
  var rely = a.vy - b.vy;
  var pieces = 3;
  var leftover = m;
  var i;
  var created = [];
  a.alive = false;
  b.alive = false;
  this.spawnShock(mx, my, Math.max(a.radius, b.radius) * 1.4, 18);
  this.spawnDebrisFx(mx, my, mvx, mvy, 16, rng);
  for (i = 0; i < pieces; i++) {
    var frac = i === pieces - 1 ? leftover : leftover * (0.28 + rng() * 0.22);
    leftover -= frac;
    if (frac < 2) continue;
    var ang = rng() * Math.PI * 2;
    var kick = 22 + rng() * 48;
    var r = Math.max(2.2, Math.cbrt(frac) * 1.15);
    var child = this.add({
      name: NAME_STEMS[(this.nextId + i) % NAME_STEMS.length] + "-" + ((this.nextId + i) % 9),
      x: mx + Math.cos(ang) * (r + 2),
      y: my + Math.sin(ang) * (r + 2),
      vx: mvx + Math.cos(ang) * kick + relx * 0.12,
      vy: mvy + Math.sin(ang) * kick + rely * 0.12,
      mass: frac,
      radius: r,
      hue: (a.hue + b.hue) * 0.5 + (rng() - 0.5) * 24,
      sat: 36,
      lit: 62,
      kind: "debris",
      trailCap: TRAIL_MAX
    });
    if (child) created.push(child);
  }
  this.collisions++;
  return created;
};

World.prototype.resolveCollisions = function (rng) {
  var bodies = this.bodies;
  var n = bodies.length;
  var i, j, a, b, dx, dy, dist, min;
  for (i = 0; i < n; i++) {
    a = bodies[i];
    if (!a.alive) continue;
    for (j = i + 1; j < n; j++) {
      b = bodies[j];
      if (!b.alive) continue;
      dx = b.x - a.x;
      dy = b.y - a.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      min = a.radius + b.radius;
      if (dist >= min * 0.92 && dist > 0.0001) continue;
      var relx = a.vx - b.vx;
      var rely = a.vy - b.vy;
      var vrel = Math.sqrt(relx * relx + rely * rely);
      var mu = (a.mass * b.mass) / (a.mass + b.mass);
      var ke = 0.5 * mu * vrel * vrel;
      var bind = (G * a.mass * b.mass) / Math.max(min, 1);
      var bothDebris = a.kind === "debris" && b.kind === "debris";
      var hasStar = a.kind === "star" || b.kind === "star";
      var violent = !hasStar && ke > bind * 0.7 && Math.min(a.mass, b.mass) > 14 && !a.pinned && !b.pinned && !bothDebris;
      if (violent && this.bodies.length < MAX_BODIES - 2) {
        this.fragment(a, b, rng);
      } else {
        this.mergeBodies(a, b, rng);
      }
    }
  }
};

World.prototype.compact = function () {
  var src = this.bodies;
  var dst = [];
  var i;
  for (i = 0; i < src.length; i++) {
    if (src[i].alive) dst.push(src[i]);
  }
  this.bodies = dst;
};

World.prototype.clearDebris = function () {
  var i, b, primary;
  primary = this.primary();
  for (i = 0; i < this.bodies.length; i++) {
    b = this.bodies[i];
    if (b.kind === "debris" || (b.mass < DEBRIS_MASS && b !== primary && b.kind !== "star")) {
      b.alive = false;
    }
  }
  this.compact();
};

World.prototype.step = function (dt, reduced, rng) {
  this.integrate(dt);
  this.resolveCollisions(rng);
  this.compact();
  this.time += dt;
  var i, b, s, fx;
  for (i = 0; i < this.bodies.length; i++) {
    b = this.bodies[i];
    pushTrail(b, reduced);
  }
  for (i = this.shocks.length - 1; i >= 0; i--) {
    s = this.shocks[i];
    s.life -= reduced ? 0.12 : 0.045;
    s.r += (s.max - s.r) * 0.12;
    if (s.life <= 0) this.shocks.splice(i, 1);
  }
  for (i = this.debrisFx.length - 1; i >= 0; i--) {
    fx = this.debrisFx[i];
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
    fx.life -= reduced ? 0.08 : 0.035;
    if (fx.life <= 0) this.debrisFx.splice(i, 1);
  }
};

function orbitAround(world, parent, dist, angle, mass, radius, name, hue, kind, reduced) {
  var eps = SOFTEN_K * (parent.radius + radius);
  var spd = circularSpeed(parent.mass, dist, eps);
  var ca = Math.cos(angle);
  var sa = Math.sin(angle);
  var b = world.add({
    name: name,
    x: parent.x + ca * dist,
    y: parent.y + sa * dist,
    vx: parent.vx - sa * spd,
    vy: parent.vy + ca * spd,
    mass: mass,
    radius: radius,
    hue: hue,
    kind: kind || "planet"
  });
  if (b) seedOrbitalTrail(b, parent.x, parent.y, dist, angle, reduced);
  return b;
}

function loadPreset(id, reduced) {
  var world;
  var star, starB, p, moon;
  if (id === 2) {
    world = new World(77);
    var m1 = 720;
    var m2 = 480;
    var sep = 210;
    var tot = m1 + m2;
    var rA = 20;
    var rB = 16;
    var epsBin = SOFTEN_K * (rA + rB);
    var vRel = circularSpeed(tot, sep, epsBin);
    var x1 = -sep * m2 / tot;
    var x2 = sep * m1 / tot;
    star = world.add({
      name: "Helios A",
      x: x1,
      y: 0,
      vx: 0,
      vy: -vRel * m2 / tot,
      mass: m1,
      radius: rA,
      hue: 38,
      sat: 90,
      lit: 74,
      kind: "star"
    });
    starB = world.add({
      name: "Helios B",
      x: x2,
      y: 0,
      vx: 0,
      vy: vRel * m1 / tot,
      mass: m2,
      radius: rB,
      hue: 18,
      sat: 82,
      lit: 68,
      kind: "star"
    });
    world.primaryId = star.id;
    var bary = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      mass: tot,
      radius: rA
    };
    orbitAround(world, bary, 420, 0.55, 16, 5.8, "Iris", 198, "planet", reduced);
    orbitAround(world, bary, 560, 2.8, 11, 4.8, "Nix", 250, "planet", reduced);
    orbitAround(world, star, 58, 1.2, 6.5, 3.6, "Cinder", 22, "planet", reduced);
    return { world: world, name: "Binary stars" };
  }
  if (id === 3) {
    world = new World(13);
    star = world.add({
      name: "Anchor",
      x: 0,
      y: 0,
      mass: 1100,
      radius: 26,
      hue: 44,
      sat: 92,
      lit: 76,
      kind: "star",
      pinned: true
    });
    world.primaryId = star.id;
    var jove = orbitAround(world, star, 268, 0.15, 95, 13, "Jove", 32, "planet", reduced);
    orbitAround(world, star, 118, 2.2, 14, 5.5, "Vesta", 210, "planet", reduced);
    var comet = world.add({
      name: "Sling",
      x: -440,
      y: 86,
      vx: 92,
      vy: 6,
      mass: 7.5,
      radius: 3.6,
      hue: 190,
      sat: 20,
      lit: 78,
      kind: "planet"
    });
    if (comet) {
      seedOrbitalTrail(comet, comet.x - 40, comet.y + 8, 8, 0, reduced);
      comet.trailLen = Math.min(24, comet.trailCap);
    }
    var stray = world.add({
      name: "Whip",
      x: 310,
      y: -240,
      vx: -22,
      vy: 90,
      mass: 8.5,
      radius: 3.8,
      hue: 8,
      sat: 55,
      lit: 64,
      kind: "planet"
    });
    if (jove && stray) {
      /* trails already seeded for bound worlds */
    }
    return { world: world, name: "Chaotic slingshot" };
  }
  world = new World(42);
  star = world.add({
    name: "Atria",
    x: 0,
    y: 0,
    mass: 1000,
    radius: 28,
    hue: 42,
    sat: 94,
    lit: 78,
    kind: "star",
    pinned: true
  });
  world.primaryId = star.id;
  orbitAround(world, star, 108, 0.35, 7, 3.5, "Ember", 18, "planet", reduced);
  orbitAround(world, star, 178, 1.85, 14, 5.8, "Vesper", 200, "planet", reduced);
  orbitAround(world, star, 268, 3.55, 20, 6.8, "Lyra", 132, "planet", reduced);
  orbitAround(world, star, 372, 5.2, 52, 12.8, "Juno", 36, "planet", reduced);
  orbitAround(world, star, 498, 0.95, 18, 7.6, "Frost", 198, "planet", reduced);
  return { world: world, name: "Stable system" };
}

function previewTrajectory(world, x, y, vx, vy, mass, radius, steps) {
  var pts = [];
  var px = x;
  var py = y;
  var pvx = vx;
  var pvy = vy;
  var s;
  var bodies = world.bodies;
  var n = bodies.length;
  var i, b, dx, dy, r2, eps, d2, inv3, ax, ay;
  for (s = 0; s < steps; s++) {
    ax = 0;
    ay = 0;
    for (i = 0; i < n; i++) {
      b = bodies[i];
      if (!b.alive) continue;
      dx = b.x - px;
      dy = b.y - py;
      r2 = dx * dx + dy * dy;
      eps = SOFTEN_K * (b.radius + radius);
      d2 = r2 + eps * eps;
      inv3 = 1 / Math.pow(d2, 1.5);
      ax += G * b.mass * dx * inv3;
      ay += G * b.mass * dy * inv3;
    }
    pvx += ax * DT;
    pvy += ay * DT;
    px += pvx * DT;
    py += pvy * DT;
    if ((s & 1) === 0) pts.push(px, py);
    if (!isFinite(px) || hypot2(px, py) > MAX_POS * MAX_POS) break;
  }
  return pts;
}

function simulatePreset(id, seconds) {
  var pack = loadPreset(id, false);
  var world = pack.world;
  var steps = Math.ceil(seconds / DT);
  var i;
  for (i = 0; i < steps; i++) {
    world.step(DT, false, world.rng);
  }
  var stats = {
    bodies: world.bodies.length,
    time: world.time,
    nan: false,
    escaped: 0,
    maxR: 0
  };
  for (i = 0; i < world.bodies.length; i++) {
    var b = world.bodies[i];
    if (!isFinite(b.x) || !isFinite(b.vx)) stats.nan = true;
    var r = Math.sqrt(hypot2(b.x, b.y));
    if (r > stats.maxR) stats.maxR = r;
    if (r > 4000) stats.escaped++;
  }
  return stats;
}

var App = {
  canvas: null,
  ctx: null,
  stars: null,
  starCtx: null,
  world: null,
  presetId: 1,
  paused: false,
  scaleIndex: 3,
  camX: 0,
  camY: 0,
  zoom: 1.15,
  dpr: 1,
  reduced: false,
  selectedId: 0,
  pointer: { x: 0, y: 0, down: false, button: 0, mode: "", sx: 0, sy: 0, wx: 0, wy: 0, lastWx: 0, lastWy: 0, body: null },
  acc: 0,
  lastTs: 0,
  spawn: null,
  ui: {},
  starSeed: 99
};

function timeScale() {
  return SCALES[App.scaleIndex];
}

function resize() {
  var c = App.canvas;
  var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  App.dpr = dpr;
  var w = c.clientWidth;
  var h = c.clientHeight;
  c.width = Math.max(1, Math.floor(w * dpr));
  c.height = Math.max(1, Math.floor(h * dpr));
  paintStarfield(w, h, dpr);
}

function paintStarfield(cssW, cssH, dpr) {
  var c = App.stars;
  c.width = Math.max(1, Math.floor(cssW * dpr));
  c.height = Math.max(1, Math.floor(cssH * dpr));
  var ctx = App.starCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#07090f";
  ctx.fillRect(0, 0, cssW, cssH);
  var rng = mulberry32(App.starSeed);
  var i, x, y, r, a;
  for (i = 0; i < 420; i++) {
    x = rng() * cssW;
    y = rng() * cssH;
    r = rng() < 0.08 ? 1.2 : 0.55;
    a = 0.18 + rng() * 0.55;
    ctx.fillStyle = "rgba(230, 228, 220," + a + ")";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (i = 0; i < 3; i++) {
    var gx = rng() * cssW;
    var gy = rng() * cssH;
    var rad = 80 + rng() * 140;
    var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    g.addColorStop(0, "rgba(40, 52, 90, 0.16)");
    g.addColorStop(1, "rgba(40, 52, 90, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  }
}

function worldFromEvent(ev) {
  var rect = App.canvas.getBoundingClientRect();
  var sx = ev.clientX - rect.left;
  var sy = ev.clientY - rect.top;
  return {
    sx: sx,
    sy: sy,
    x: App.camX + (sx - rect.width / 2) / App.zoom,
    y: App.camY + (sy - rect.height / 2) / App.zoom
  };
}

function screenFromWorld(x, y) {
  var rect = App.canvas.getBoundingClientRect();
  return {
    x: (x - App.camX) * App.zoom + rect.width / 2,
    y: (y - App.camY) * App.zoom + rect.height / 2
  };
}

function hitBody(wx, wy) {
  var best = null;
  var bestD = 1e15;
  var i, b, d, pad;
  for (i = 0; i < App.world.bodies.length; i++) {
    b = App.world.bodies[i];
    d = Math.sqrt(hypot2(b.x - wx, b.y - wy));
    pad = Math.max(b.radius + 4 / App.zoom, 10 / App.zoom);
    if (d < pad && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function applyPreset(id) {
  App.presetId = id;
  var pack = loadPreset(id, App.reduced);
  App.world = pack.world;
  App.selectedId = 0;
  var i, b;
  for (i = 0; i < App.world.bodies.length; i++) {
    b = App.world.bodies[i];
    if (b.kind === "planet") {
      App.selectedId = b.id;
      break;
    }
  }
  App.camX = 0;
  App.camY = 0;
  App.zoom = id === 2 ? 0.82 : id === 3 ? 0.9 : 1.02;
  App.acc = 0;
  App.spawn = null;
  syncPresetButtons();
  updateInspect();
}

function syncPresetButtons() {
  App.ui.p1.setAttribute("aria-pressed", App.presetId === 1 ? "true" : "false");
  App.ui.p2.setAttribute("aria-pressed", App.presetId === 2 ? "true" : "false");
  App.ui.p3.setAttribute("aria-pressed", App.presetId === 3 ? "true" : "false");
}

function setPaused(v) {
  App.paused = v;
  App.ui.pause.setAttribute("aria-pressed", v ? "true" : "false");
  App.ui.pause.innerHTML = v ? "Resume <kbd>Space</kbd>" : "Pause <kbd>Space</kbd>";
  App.ui.timeChip.dataset.paused = v ? "true" : "false";
  updateTimeChip();
}

function updateTimeChip() {
  var label = App.paused ? "Paused" : "Time ×" + timeScale().toFixed(2);
  App.ui.timeChip.textContent = label;
}

function updateScaleLegend() {
  var px = 80;
  var world = px / App.zoom;
  App.ui.scaleLabel.textContent = world >= 10 ? world.toFixed(0) + " u" : world.toFixed(1) + " u";
}

function fmt(n, d) {
  if (!isFinite(n)) return "—";
  var p = Math.pow(10, d);
  return (Math.round(n * p) / p).toFixed(d);
}

function updateInspect() {
  var b = null;
  var i;
  for (i = 0; i < App.world.bodies.length; i++) {
    if (App.world.bodies[i].id === App.selectedId) {
      b = App.world.bodies[i];
      break;
    }
  }
  if (!b) {
    App.ui.inspectEmpty.hidden = false;
    App.ui.inspectKv.hidden = true;
    return;
  }
  App.ui.inspectEmpty.hidden = true;
  App.ui.inspectKv.hidden = false;
  var primary = App.world.primary();
  var dist = primary ? Math.sqrt(hypot2(b.x - primary.x, b.y - primary.y)) : 0;
  var spd = Math.sqrt(hypot2(b.vx, b.vy));
  App.ui.fName.textContent = b.name;
  App.ui.fMass.textContent = fmt(b.mass, 2);
  App.ui.fVel.textContent = fmt(b.vx, 1) + ", " + fmt(b.vy, 1);
  App.ui.fSpeed.textContent = fmt(spd, 2);
  App.ui.fDist.textContent = fmt(dist, 1);
}

function launchMassFromDrag(len) {
  return clamp(6 + len * 0.045, 6, 36);
}

function launchRadius(mass) {
  return Math.max(3.2, Math.cbrt(mass) * 1.35);
}

function onPointerDown(ev) {
  App.canvas.focus();
  var p = worldFromEvent(ev);
  App.pointer.down = true;
  App.pointer.button = ev.button;
  App.pointer.sx = p.sx;
  App.pointer.sy = p.sy;
  App.pointer.wx = p.x;
  App.pointer.wy = p.y;
  App.pointer.lastWx = p.x;
  App.pointer.lastWy = p.y;
  var hit = hitBody(p.x, p.y);
  if (ev.button === 2 || ev.button === 1 || ev.altKey || ev.shiftKey) {
    App.pointer.mode = "pan";
    App.canvas.classList.add("panning");
    ev.preventDefault();
    return;
  }
  if (hit) {
    App.pointer.mode = "body";
    App.pointer.body = hit;
    App.selectedId = hit.id;
    App.canvas.classList.add("grabbing");
    updateInspect();
    return;
  }
  App.pointer.mode = "spawn";
  App.canvas.classList.add("spawning");
  App.spawn = { x: p.x, y: p.y, vx: 0, vy: 0, mass: 10, radius: 4.2, pts: [] };
}

function onPointerMove(ev) {
  var p = worldFromEvent(ev);
  App.pointer.x = p.x;
  App.pointer.y = p.y;
  if (!App.pointer.down) return;
  if (App.pointer.mode === "pan") {
    var dx = p.sx - App.pointer.sx;
    var dy = p.sy - App.pointer.sy;
    App.camX -= dx / App.zoom;
    App.camY -= dy / App.zoom;
    App.pointer.sx = p.sx;
    App.pointer.sy = p.sy;
    return;
  }
  if (App.pointer.mode === "body" && App.pointer.body && App.pointer.body.alive) {
    var b = App.pointer.body;
    if (App.paused) {
      b.x = p.x;
      b.y = p.y;
    } else {
      b.x = p.x;
      b.y = p.y;
      b.vx = (p.x - App.pointer.lastWx) / DT * 0.35;
      b.vy = (p.y - App.pointer.lastWy) / DT * 0.35;
    }
    App.pointer.lastWx = p.x;
    App.pointer.lastWy = p.y;
    return;
  }
  if (App.pointer.mode === "spawn" && App.spawn) {
    App.spawn.vx = (p.x - App.spawn.x) * THROW_SCALE;
    App.spawn.vy = (p.y - App.spawn.y) * THROW_SCALE;
    var len = Math.sqrt(hypot2(p.x - App.spawn.x, p.y - App.spawn.y));
    App.spawn.mass = launchMassFromDrag(len);
    App.spawn.radius = launchRadius(App.spawn.mass);
    App.spawn.pts = previewTrajectory(
      App.world,
      App.spawn.x,
      App.spawn.y,
      App.spawn.vx,
      App.spawn.vy,
      App.spawn.mass,
      App.spawn.radius,
      PREVIEW_STEPS
    );
  }
}

function onPointerUp(ev) {
  if (!App.pointer.down) return;
  var p = worldFromEvent(ev);
  var moved = Math.hypot(p.sx - App.pointer.sx, p.sy - App.pointer.sy);
  if (App.pointer.mode === "spawn" && App.spawn) {
    if (moved > 8) {
      var hue = (App.world.rng() * 260) | 0;
      var stem = NAME_STEMS[(App.world.nextId * 3) % NAME_STEMS.length];
      App.world.add({
        name: stem + " " + App.world.nextId,
        x: App.spawn.x,
        y: App.spawn.y,
        vx: App.spawn.vx,
        vy: App.spawn.vy,
        mass: App.spawn.mass,
        radius: App.spawn.radius,
        hue: hue,
        kind: "planet"
      });
    }
  }
  App.pointer.down = false;
  App.pointer.mode = "";
  App.pointer.body = null;
  App.spawn = null;
  App.canvas.classList.remove("panning", "spawning", "grabbing");
}

function onWheel(ev) {
  ev.preventDefault();
  var p = worldFromEvent(ev);
  var factor = ev.deltaY > 0 ? 0.9 : 1.1;
  if (ev.deltaMode === 1) factor = ev.deltaY > 0 ? 0.92 : 1.08;
  var next = clamp(App.zoom * factor, 0.12, 6.5);
  App.camX = p.x - (p.sx - App.canvas.getBoundingClientRect().width / 2) / next;
  App.camY = p.y - (p.sy - App.canvas.getBoundingClientRect().height / 2) / next;
  App.zoom = next;
  updateScaleLegend();
}

function bumpScale(dir) {
  App.scaleIndex = clamp(App.scaleIndex + dir, 0, SCALES.length - 1);
  updateTimeChip();
}

function onKey(ev) {
  if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
  if (ev.code === "Space") {
    ev.preventDefault();
    setPaused(!App.paused);
  } else if (ev.key === ".") {
    ev.preventDefault();
    if (App.paused) App.world.step(DT, App.reduced, App.world.rng);
  } else if (ev.key === "[") {
    bumpScale(-1);
  } else if (ev.key === "]") {
    bumpScale(1);
  } else if (ev.key === "r" || ev.key === "R") {
    applyPreset(App.presetId);
  } else if (ev.key === "1") {
    applyPreset(1);
  } else if (ev.key === "2") {
    applyPreset(2);
  } else if (ev.key === "3") {
    applyPreset(3);
  }
}

function bodyFill(b) {
  if (b.kind === "star") return "hsla(" + b.hue + ", " + b.sat + "%, " + b.lit + "%, 1)";
  return "hsla(" + b.hue + ", " + b.sat + "%, " + b.lit + "%, 1)";
}

function drawTrails(ctx) {
  var bodies = App.world.bodies;
  var i, b, k, idx, cap, x, y, nx, ny, spd, alpha;
  var reduced = App.reduced;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (i = 0; i < bodies.length; i++) {
    b = bodies[i];
    if (b.trailLen < 2) continue;
    cap = reduced ? Math.min(b.trailCap, TRAIL_MAX_REDUCED) : b.trailCap;
    ctx.beginPath();
    for (k = 0; k < b.trailLen; k++) {
      idx = (b.trailHead - b.trailLen + k + cap * 4) % cap;
      x = b.trailX[idx];
      y = b.trailY[idx];
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    spd = Math.sqrt(hypot2(b.vx, b.vy));
    alpha = reduced ? 0.22 : 0.42;
    ctx.strokeStyle = "hsla(" + (210 - Math.min(90, spd * 0.35)) + ", 70%, 72%, " + alpha + ")";
    ctx.lineWidth = b.kind === "star" ? 1.8 / App.zoom : Math.max(0.7, b.radius * 0.18) / Math.sqrt(App.zoom);
    ctx.stroke();
  }
}

function drawBody(ctx, b, t) {
  var g;
  if (b.kind === "star") {
    var corona = b.radius * (3.4 + Math.sin(t * 1.4) * 0.12);
    g = ctx.createRadialGradient(b.x, b.y, b.radius * 0.2, b.x, b.y, corona);
    g.addColorStop(0, "hsla(" + b.hue + ", 100%, 92%, 0.95)");
    g.addColorStop(0.35, "hsla(" + b.hue + ", 92%, 62%, 0.45)");
    g.addColorStop(1, "hsla(" + b.hue + ", 80%, 50%, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, corona, 0, Math.PI * 2);
    ctx.fill();
  }
  g = ctx.createRadialGradient(
    b.x - b.radius * 0.32,
    b.y - b.radius * 0.38,
    b.radius * 0.1,
    b.x,
    b.y,
    b.radius
  );
  g.addColorStop(0, "hsla(" + b.hue + ", " + Math.min(100, b.sat + 12) + "%, " + Math.min(92, b.lit + 22) + "%, 1)");
  g.addColorStop(0.55, bodyFill(b));
  g.addColorStop(1, "hsla(" + b.hue + ", " + b.sat + "%, " + Math.max(8, b.lit - 28) + "%, 1)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius * 0.98, 0, Math.PI * 2);
  ctx.strokeStyle = "hsla(" + b.hue + ", 50%, 82%, 0.55)";
  ctx.lineWidth = Math.max(0.6, 1.4 / App.zoom);
  ctx.stroke();
  if (b.id === App.selectedId) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 5 / App.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(240, 217, 168, 0.85)";
    ctx.lineWidth = 1.2 / App.zoom;
    ctx.setLineDash([4 / App.zoom, 3 / App.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawInstrumentGrid(ctx) {
  var i, r;
  ctx.strokeStyle = "rgba(212, 180, 131, 0.07)";
  ctx.lineWidth = 1 / App.zoom;
  for (i = 1; i <= 6; i++) {
    r = 80 * i;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-520, 0);
  ctx.lineTo(520, 0);
  ctx.moveTo(0, -520);
  ctx.lineTo(0, 520);
  ctx.stroke();
}

function drawSpawn(ctx) {
  var s = App.spawn;
  if (!s) return;
  var i;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(143, 212, 232, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 217, 168, 0.9)";
  ctx.lineWidth = 1.2 / App.zoom;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x + s.vx / THROW_SCALE, s.y + s.vy / THROW_SCALE);
  ctx.strokeStyle = "rgba(232, 184, 109, 0.95)";
  ctx.lineWidth = 1.6 / App.zoom;
  ctx.stroke();
  if (s.pts && s.pts.length > 2) {
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    for (i = 0; i < s.pts.length; i += 2) {
      ctx.lineTo(s.pts[i], s.pts[i + 1]);
    }
    ctx.strokeStyle = "rgba(143, 212, 232, 0.55)";
    ctx.setLineDash([5 / App.zoom, 4 / App.zoom]);
    ctx.lineWidth = 1 / App.zoom;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawShocks(ctx) {
  var i, s, a;
  for (i = 0; i < App.world.shocks.length; i++) {
    s = App.world.shocks[i];
    a = App.reduced ? s.life * 0.18 : s.life * 0.55;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 214, 170, " + a + ")";
    ctx.lineWidth = (2.4 * s.life) / App.zoom;
    ctx.stroke();
  }
  for (i = 0; i < App.world.debrisFx.length; i++) {
    s = App.world.debrisFx[i];
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220, 200, 170, " + (s.life * 0.7) + ")";
    ctx.fill();
  }
}

function render(ts) {
  var canvas = App.canvas;
  var ctx = App.ctx;
  var cssW = canvas.clientWidth;
  var cssH = canvas.clientHeight;
  var dtMs = App.lastTs ? ts - App.lastTs : 16.6;
  if (dtMs > 250) dtMs = 250;
  App.lastTs = ts;
  if (!App.paused) {
    App.acc += (dtMs / 1000) * timeScale();
    var guard = 0;
    while (App.acc >= DT && guard < MAX_STEPS_PER_FRAME) {
      App.world.step(DT, App.reduced, App.world.rng);
      App.acc -= DT;
      guard++;
    }
    if (guard === MAX_STEPS_PER_FRAME) App.acc = 0;
  } else {
    App.acc = 0;
  }

  ctx.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
  ctx.drawImage(App.stars, 0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(App.zoom, App.zoom);
  ctx.translate(-App.camX, -App.camY);

  drawInstrumentGrid(ctx);
  drawTrails(ctx);
  drawShocks(ctx);
  drawSpawn(ctx);
  var i, b;
  for (i = 0; i < App.world.bodies.length; i++) {
    b = App.world.bodies[i];
    drawBody(ctx, b, ts / 1000);
  }
  ctx.restore();
  updateInspect();
  requestAnimationFrame(render);
}

function bindUi() {
  App.ui.pause = document.getElementById("btn-pause");
  App.ui.step = document.getElementById("btn-step");
  App.ui.slower = document.getElementById("btn-slower");
  App.ui.faster = document.getElementById("btn-faster");
  App.ui.reset = document.getElementById("btn-reset");
  App.ui.p1 = document.getElementById("btn-p1");
  App.ui.p2 = document.getElementById("btn-p2");
  App.ui.p3 = document.getElementById("btn-p3");
  App.ui.clear = document.getElementById("btn-clear");
  App.ui.timeChip = document.getElementById("time-chip");
  App.ui.scaleLabel = document.getElementById("scale-label");
  App.ui.inspectEmpty = document.getElementById("inspect-empty");
  App.ui.inspectKv = document.getElementById("inspect-kv");
  App.ui.fName = document.getElementById("f-name");
  App.ui.fMass = document.getElementById("f-mass");
  App.ui.fVel = document.getElementById("f-vel");
  App.ui.fSpeed = document.getElementById("f-speed");
  App.ui.fDist = document.getElementById("f-dist");

  App.ui.pause.addEventListener("click", function () { setPaused(!App.paused); });
  App.ui.step.addEventListener("click", function () {
    if (App.paused) App.world.step(DT, App.reduced, App.world.rng);
  });
  App.ui.slower.addEventListener("click", function () { bumpScale(-1); });
  App.ui.faster.addEventListener("click", function () { bumpScale(1); });
  App.ui.reset.addEventListener("click", function () { applyPreset(App.presetId); });
  App.ui.p1.addEventListener("click", function () { applyPreset(1); });
  App.ui.p2.addEventListener("click", function () { applyPreset(2); });
  App.ui.p3.addEventListener("click", function () { applyPreset(3); });
  App.ui.clear.addEventListener("click", function () { App.world.clearDebris(); });
}

function boot() {
  App.canvas = document.getElementById("stage");
  App.ctx = App.canvas.getContext("2d");
  App.stars = document.createElement("canvas");
  App.starCtx = App.stars.getContext("2d");
  App.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  bindUi();
  applyPreset(1);
  resize();
  updateScaleLegend();
  updateTimeChip();

  window.addEventListener("resize", function () {
    resize();
    updateScaleLegend();
  });
  App.canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  App.canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  App.canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", function () {
    App.acc = 0;
    App.lastTs = 0;
  });
  requestAnimationFrame(render);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadPreset: loadPreset,
    simulatePreset: simulatePreset,
    previewTrajectory: previewTrajectory,
    DT: DT,
    G: G
  };
}
