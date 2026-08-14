(function () {
  "use strict";

  var WORLD_W = 1600;
  var WORLD_H = 900;
  var DT = 1 / 60;
  var MAX_STEPS = 5;
  var GRID = 80;

  var PRESETS = [
    {
      name: "Tide Garden",
      blooms: 26,
      drifters: 48,
      hunters: 5,
      nutrient: 0.42,
      current: 0.18,
    },
    {
      name: "Deep Swarm",
      blooms: 18,
      drifters: 78,
      hunters: 4,
      nutrient: 0.5,
      current: 0.28,
    },
    {
      name: "Coral Hunt",
      blooms: 22,
      drifters: 40,
      hunters: 11,
      nutrient: 0.36,
      current: 0.22,
    },
  ];

  var CAPS = { blooms: 72, drifters: 110, hunters: 16, pulses: 48, beacons: 10, motes: 90 };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function SpatialHash(cell) {
    this.cell = cell;
    this.buckets = new Map();
  }

  SpatialHash.prototype.clear = function () {
    this.buckets.clear();
  };

  SpatialHash.prototype._key = function (x, y) {
    return ((x / this.cell) | 0) * 73856093 ^ ((y / this.cell) | 0) * 19349663;
  };

  SpatialHash.prototype.insert = function (e) {
    var k = this._key(e.x, e.y);
    var b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    b.push(e);
  };

  SpatialHash.prototype.query = function (x, y, r, out) {
    out.length = 0;
    var c = this.cell;
    var minX = ((x - r) / c) | 0;
    var maxX = ((x + r) / c) | 0;
    var minY = ((y - r) / c) | 0;
    var maxY = ((y + r) / c) | 0;
    var r2 = r * r;
    for (var gx = minX; gx <= maxX; gx++) {
      for (var gy = minY; gy <= maxY; gy++) {
        var b = this.buckets.get(gx * 73856093 ^ gy * 19349663);
        if (!b) continue;
        for (var i = 0; i < b.length; i++) {
          var e = b[i];
          var dx = e.x - x;
          var dy = e.y - y;
          if (dx * dx + dy * dy <= r2) out.push(e);
        }
      }
    }
    return out;
  };

  function Garden() {
    this.canvas = document.getElementById("garden");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.trail = document.createElement("canvas");
    this.tctx = this.trail.getContext("2d");
    this.seed = 20260813;
    this.presetIndex = 0;
    this.rng = mulberry32(this.seed);
    this.time = 0;
    this.paused = false;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.pulseCd = 0;
    this.dpr = 1;
    this.viewW = WORLD_W;
    this.viewH = WORLD_H;
    this.pointer = { x: WORLD_W * 0.5, y: WORLD_H * 0.5, down: false, moved: 0, id: null };
    this.hashBlooms = new SpatialHash(GRID);
    this.hashMob = new SpatialHash(GRID);
    this.tmp = [];
    this.blooms = [];
    this.drifters = [];
    this.hunters = [];
    this.pulses = [];
    this.beacons = [];
    this.motes = [];
    this.ngw = 40;
    this.ngh = 23;
    this.nutrient = new Float32Array(this.ngw * this.ngh);
    this.cvx = new Float32Array(this.ngw * this.ngh);
    this.cvy = new Float32Array(this.ngw * this.ngh);
    this.audio = null;
    this.audioWanted = false;
    this.statsTick = 0;
    this.stabCd = 0;
    this.acc = 0;
    this.lastTs = 0;
    this.running = false;
    this._bind();
    this.resize();
    this.regenerate(this.seed, 0, true);
    this.draw(0);
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this.loop);
  }

  Garden.prototype._bind = function () {
    var g = this;
    this.loop = function (ts) {
      g.frame(ts);
    };
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function (e) {
      g.reduced = e.matches;
    });
    window.addEventListener("resize", function () {
      g.resize();
    });
    var c = this.canvas;
    c.addEventListener("pointerdown", function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      c.setPointerCapture(ev.pointerId);
      g.pointer.id = ev.pointerId;
      g.pointer.down = true;
      g.pointer.moved = 0;
      g.syncPointer(ev);
      g.maybeAudio();
    });
    c.addEventListener("pointermove", function (ev) {
      var ox = g.pointer.x;
      var oy = g.pointer.y;
      g.syncPointer(ev);
      var dx = g.pointer.x - ox;
      var dy = g.pointer.y - oy;
      g.bendCurrent(g.pointer.x, g.pointer.y, dx, dy);
      if (g.pointer.down && ev.pointerId === g.pointer.id) {
        g.pointer.moved += Math.hypot(dx, dy);
        if (g.pointer.moved > 8) g.paintNutrient(g.pointer.x, g.pointer.y, dx, dy);
      }
    });
    function endPtr(ev) {
      if (ev.pointerId !== g.pointer.id) return;
      if (g.pointer.down && g.pointer.moved <= 8) g.plantBeacon(g.pointer.x, g.pointer.y);
      g.pointer.down = false;
      g.pointer.id = null;
    }
    c.addEventListener("pointerup", endPtr);
    c.addEventListener("pointercancel", endPtr);
    c.addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
    });
    window.addEventListener("keydown", function (ev) {
      if (ev.repeat && ev.code === "Space") return;
      if (ev.code === "Space") {
        ev.preventDefault();
        g.globalPulse();
      } else if (ev.key === "p" || ev.key === "P") {
        g.togglePause();
      } else if (ev.key === "r" || ev.key === "R") {
        g.reseed();
      } else if (ev.key === "1") g.loadPreset(0);
      else if (ev.key === "2") g.loadPreset(1);
      else if (ev.key === "3") g.loadPreset(2);
      g.maybeAudio();
    });
    document.getElementById("btn-pulse").addEventListener("click", function () {
      g.globalPulse();
      g.maybeAudio();
    });
    document.getElementById("btn-pause").addEventListener("click", function () {
      g.togglePause();
    });
    document.getElementById("btn-reseed").addEventListener("click", function () {
      g.reseed();
    });
    document.getElementById("btn-audio").addEventListener("click", function () {
      g.audioWanted = !g.audioWanted;
      this.setAttribute("aria-pressed", g.audioWanted ? "true" : "false");
      this.textContent = g.audioWanted ? "Sound on" : "Sound";
      if (g.audioWanted) g.maybeAudio();
      else if (g.audio) g.audio.mute();
    });
    ["btn-p1", "btn-p2", "btn-p3"].forEach(function (id, i) {
      document.getElementById(id).addEventListener("click", function () {
        g.loadPreset(i);
      });
    });
  };

  Garden.prototype.syncPointer = function (ev) {
    var r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - r.left) / r.width) * WORLD_W;
    this.pointer.y = ((ev.clientY - r.top) / r.height) * WORLD_H;
  };

  Garden.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, this.canvas.clientWidth);
    var h = Math.max(1, this.canvas.clientHeight);
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = (w * dpr) | 0;
    this.canvas.height = (h * dpr) | 0;
    this.trail.width = (WORLD_W * Math.min(dpr, 1.5)) | 0;
    this.trail.height = (WORLD_H * Math.min(dpr, 1.5)) | 0;
    this.tctx.setTransform(this.trail.width / WORLD_W, 0, 0, this.trail.height / WORLD_H, 0, 0);
  };

  Garden.prototype.rand = function (a, b) {
    return a + this.rng() * (b - a);
  };

  Garden.prototype.nidx = function (x, y) {
    var gx = clamp((x / WORLD_W) * this.ngw, 0, this.ngw - 0.001) | 0;
    var gy = clamp((y / WORLD_H) * this.ngh, 0, this.ngh - 0.001) | 0;
    return gy * this.ngw + gx;
  };

  Garden.prototype.sampleN = function (x, y) {
    return this.nutrient[this.nidx(x, y)];
  };

  Garden.prototype.sampleC = function (x, y) {
    var i = this.nidx(x, y);
    return { x: this.cvx[i], y: this.cvy[i] };
  };

  Garden.prototype.regenerate = function (seed, presetIndex, keepPreset) {
    this.seed = seed >>> 0;
    if (!keepPreset) this.presetIndex = presetIndex;
    this.rng = mulberry32(this.seed ^ ((this.presetIndex + 1) * 0x9e3779b9));
    var p = PRESETS[this.presetIndex];
    this.time = 0;
    this.pulseCd = 0;
    this.stabCd = 0;
    this.blooms.length = 0;
    this.drifters.length = 0;
    this.hunters.length = 0;
    this.pulses.length = 0;
    this.beacons.length = 0;
    this.motes.length = 0;
    this.tctx.setTransform(this.trail.width / WORLD_W, 0, 0, this.trail.height / WORLD_H, 0, 0);
    this.tctx.globalCompositeOperation = "source-over";
    this.tctx.fillStyle = "#000";
    this.tctx.fillRect(0, 0, WORLD_W, WORLD_H);

    var i;
    for (i = 0; i < this.nutrient.length; i++) {
      this.nutrient[i] = p.nutrient * (0.55 + this.rng() * 0.7);
      this.cvx[i] = (this.rng() - 0.5) * p.current;
      this.cvy[i] = (this.rng() - 0.5) * p.current * 0.6;
    }

    var nB = this.reduced ? Math.ceil(p.blooms * 0.55) : p.blooms;
    var nD = this.reduced ? Math.ceil(p.drifters * 0.5) : p.drifters;
    var nH = this.reduced ? Math.max(2, Math.ceil(p.hunters * 0.6)) : p.hunters;
    for (i = 0; i < nB; i++) this.blooms.push(this.mkBloom(true));
    for (i = 0; i < nD; i++) this.drifters.push(this.mkDrifter(true));
    for (i = 0; i < nH; i++) this.hunters.push(this.mkHunter(true));

    var moteN = this.reduced ? 36 : CAPS.motes;
    for (i = 0; i < moteN; i++) {
      this.motes.push({
        x: this.rand(0, WORLD_W),
        y: this.rand(0, WORLD_H),
        z: this.rand(0.25, 1),
        s: this.rand(0.6, 2.2),
        a: this.rand(0.04, 0.16),
        p: this.rand(0, Math.PI * 2),
      });
    }
    this.rebuildHash();
    this.updateHud();
    this.syncPresetButtons();
  };

  Garden.prototype.mkBloom = function (initial) {
    return {
      kind: "bloom",
      x: this.rand(60, WORLD_W - 60),
      y: this.rand(70, WORLD_H - 70),
      vx: this.rand(-6, 6),
      vy: this.rand(-4, 4),
      r: this.rand(10, 18),
      energy: initial ? this.rand(0.35, 0.9) : 0.25,
      phase: this.rand(0, Math.PI * 2),
      open: 0,
      pulseAge: this.rand(1.5, 6),
      life: 1,
      dormant: false,
      hue: this.rng() < 0.45 ? 0 : 1,
      lastSig: -99,
    };
  };

  Garden.prototype.mkDrifter = function (initial) {
    var a = this.rand(0, Math.PI * 2);
    return {
      kind: "drifter",
      x: this.rand(40, WORLD_W - 40),
      y: this.rand(40, WORLD_H - 40),
      vx: Math.cos(a) * this.rand(18, 42),
      vy: Math.sin(a) * this.rand(18, 42),
      energy: initial ? this.rand(0.2, 0.7) : 0.35,
      trail: [],
      life: 1,
      wob: this.rand(0, 10),
      lastSig: -99,
    };
  };

  Garden.prototype.mkHunter = function (initial) {
    var a = this.rand(0, Math.PI * 2);
    return {
      kind: "hunter",
      x: this.rand(80, WORLD_W - 80),
      y: this.rand(80, WORLD_H - 80),
      vx: Math.cos(a) * 30,
      vy: Math.sin(a) * 30,
      energy: initial ? this.rand(0.3, 0.8) : 0.4,
      hunger: this.rand(0.2, 1),
      life: 1,
      dash: 0,
      lastSig: -99,
    };
  };

  Garden.prototype.rebuildHash = function () {
    this.hashBlooms.clear();
    this.hashMob.clear();
    var i;
    for (i = 0; i < this.blooms.length; i++) this.hashBlooms.insert(this.blooms[i]);
    for (i = 0; i < this.drifters.length; i++) this.hashMob.insert(this.drifters[i]);
    for (i = 0; i < this.hunters.length; i++) this.hashMob.insert(this.hunters[i]);
  };

  Garden.prototype.wrap = function (e) {
    if (e.x < -20) e.x = WORLD_W + 20;
    if (e.x > WORLD_W + 20) e.x = -20;
    if (e.y < -20) e.y = WORLD_H + 20;
    if (e.y > WORLD_H + 20) e.y = -20;
  };

  Garden.prototype.bendCurrent = function (x, y, dx, dy) {
    var i = this.nidx(x, y);
    this.cvx[i] = clamp(this.cvx[i] + dx * 0.08, -2.4, 2.4);
    this.cvy[i] = clamp(this.cvy[i] + dy * 0.08, -2.4, 2.4);
    var gx = (x / WORLD_W) * this.ngw;
    var gy = (y / WORLD_H) * this.ngh;
    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) {
        var ix = (gx + ox) | 0;
        var iy = (gy + oy) | 0;
        if (ix < 0 || iy < 0 || ix >= this.ngw || iy >= this.ngh) continue;
        var k = iy * this.ngw + ix;
        this.cvx[k] = clamp(this.cvx[k] + dx * 0.03, -2.4, 2.4);
        this.cvy[k] = clamp(this.cvy[k] + dy * 0.03, -2.4, 2.4);
      }
    }
  };

  Garden.prototype.paintNutrient = function (x, y, dx, dy) {
    var i = this.nidx(x, y);
    this.nutrient[i] = clamp(this.nutrient[i] + 0.12, 0, 1.6);
    this.cvx[i] = clamp(this.cvx[i] + dx * 0.05, -2.6, 2.6);
    this.cvy[i] = clamp(this.cvy[i] + dy * 0.05, -2.6, 2.6);
  };

  Garden.prototype.plantBeacon = function (x, y) {
    if (this.beacons.length >= CAPS.beacons) this.beacons.shift();
    this.beacons.push({ x: x, y: y, life: 4.2, age: 0, emit: 0 });
    this.emitPulse(x, y, 28, 210, 0.7, 0);
    this.chime(x, y, 0);
  };

  Garden.prototype.emitPulse = function (x, y, r0, r1, strength, hue) {
    if (this.pulses.length >= CAPS.pulses) this.pulses.shift();
    this.pulses.push({
      x: x,
      y: y,
      r: r0,
      max: r1,
      s: strength,
      hue: hue,
      a: this.reduced ? 0.22 : 0.42,
    });
  };

  Garden.prototype.globalPulse = function () {
    if (this.pulseCd > 0) return;
    this.pulseCd = 4.2;
    var cx = WORLD_W * 0.5;
    var cy = WORLD_H * 0.5;
    this.emitPulse(cx, cy, 20, 920, 1, 0);
    var i;
    for (i = 0; i < this.blooms.length; i++) {
      var b = this.blooms[i];
      b.open = 1;
      b.energy = clamp(b.energy + 0.12, 0, 1.4);
      b.lastSig = this.time;
    }
    for (i = 0; i < this.drifters.length; i++) this.drifters[i].energy = clamp(this.drifters[i].energy + 0.06, 0, 1.4);
    this.chime(cx, cy, 1);
    this.updateHud();
  };

  Garden.prototype.togglePause = function () {
    this.paused = !this.paused;
    var btn = document.getElementById("btn-pause");
    btn.setAttribute("aria-pressed", this.paused ? "true" : "false");
    btn.textContent = this.paused ? "Resume" : "Pause";
  };

  Garden.prototype.reseed = function () {
    this.regenerate((this.seed + 1) >>> 0, this.presetIndex, true);
  };

  Garden.prototype.loadPreset = function (i) {
    this.presetIndex = i;
    this.regenerate(this.seed, i, true);
  };

  Garden.prototype.syncPresetButtons = function () {
    for (var i = 0; i < 3; i++) {
      document.getElementById("btn-p" + (i + 1)).setAttribute("aria-pressed", i === this.presetIndex ? "true" : "false");
    }
  };

  Garden.prototype.frame = function (ts) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    var dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (!this.paused) {
      this.acc += dt;
      var steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS) {
        this.step(DT);
        this.acc -= DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
    }
    this.draw(dt);
    this.statsTick += dt;
    if (this.statsTick > 0.2) {
      this.statsTick = 0;
      this.updateHud();
    }
  };

  Garden.prototype.step = function (dt) {
    this.time += dt;
    if (this.pulseCd > 0) this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.stepFields(dt);
    this.stepBeacons(dt);
    this.stepPulses(dt);
    this.rebuildHash();
    this.stepBlooms(dt);
    this.rebuildHash();
    this.stepDrifters(dt);
    this.stepHunters(dt);
    this.cull();
    this.stabilize();
  };

  Garden.prototype.stepFields = function (dt) {
    var base = PRESETS[this.presetIndex].nutrient;
    var n = this.nutrient;
    var vx = this.cvx;
    var vy = this.cvy;
    for (var i = 0; i < n.length; i++) {
      n[i] += (base * 0.72 - n[i]) * 0.04 * dt * 60 * 0.016;
      vx[i] *= 0.985;
      vy[i] *= 0.985;
    }
  };

  Garden.prototype.stepBeacons = function (dt) {
    for (var i = this.beacons.length - 1; i >= 0; i--) {
      var b = this.beacons[i];
      b.life -= dt;
      b.age += dt;
      b.emit -= dt;
      if (b.emit <= 0) {
        b.emit = 0.55;
        this.emitPulse(b.x, b.y, 12, 160, 0.55, 0);
        var cells = this.hashBlooms.query(b.x, b.y, 90, this.tmp);
        for (var j = 0; j < cells.length; j++) cells[j].energy = clamp(cells[j].energy + 0.08, 0, 1.5);
      }
      if (b.life <= 0) this.beacons.splice(i, 1);
    }
  };

  Garden.prototype.stepPulses = function (dt) {
    var t = this.time;
    for (var i = this.pulses.length - 1; i >= 0; i--) {
      var p = this.pulses[i];
      var prev = p.r;
      p.r += (90 + p.s * 140) * dt;
      p.a *= this.reduced ? 0.9 : 0.965;
      var band = 22;
      if (p.s > 0.18 && p.a > 0.05) {
        var hits = this.hashBlooms.query(p.x, p.y, p.r + 8, this.tmp);
        for (var j = 0; j < hits.length; j++) {
          var e = hits[j];
          var d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d > prev - 4 && d < p.r + band && t - e.lastSig > 0.55) {
            e.lastSig = t;
            e.open = Math.max(e.open, 0.7);
            e.energy = clamp(e.energy + 0.04 * p.s, 0, 1.5);
            if (p.s > 0.28 && this.pulses.length < CAPS.pulses) {
              this.emitPulse(e.x, e.y, 8, 90 + p.s * 40, p.s * 0.46, e.hue);
            }
          }
        }
        var mobs = this.hashMob.query(p.x, p.y, p.r + 8, []);
        for (var k = 0; k < mobs.length; k++) {
          var m = mobs[k];
          var md = Math.hypot(m.x - p.x, m.y - p.y);
          if (md > prev - 4 && md < p.r + band && t - m.lastSig > 0.4) {
            m.lastSig = t;
            if (m.kind === "drifter") m.energy = clamp(m.energy + 0.03 * p.s, 0, 1.4);
            if (m.kind === "hunter" && p.hue === 0) m.hunger = clamp(m.hunger + 0.08, 0, 1.5);
          }
        }
      }
      if (p.r >= p.max || p.a < 0.03) this.pulses.splice(i, 1);
    }
  };

  Garden.prototype.stepBlooms = function (dt) {
    var born = [];
    for (var i = 0; i < this.blooms.length; i++) {
      var b = this.blooms[i];
      var n = this.sampleN(b.x, b.y);
      var c = this.sampleC(b.x, b.y);
      b.vx += c.x * 8 * dt;
      b.vy += c.y * 8 * dt;
      b.vx *= 0.96;
      b.vy *= 0.96;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.wrap(b);
      b.phase += dt * (0.7 + b.energy);
      b.pulseAge -= dt;
      if (b.dormant) {
        b.energy += n * 0.15 * dt;
        if (b.energy > 0.22) b.dormant = false;
      } else {
        b.energy += (n * 0.22 - 0.045) * dt;
        this.nutrient[this.nidx(b.x, b.y)] = Math.max(0.02, n - 0.12 * dt);
      }
      if (b.energy > 0.55 && b.pulseAge <= 0) {
        b.open = 1;
        b.pulseAge = 3.2 + (1 - b.energy) * 3.5;
        this.emitPulse(b.x, b.y, 10, 140 + b.r * 3, 0.5 + b.energy * 0.25, b.hue);
        this.chime(b.x, b.y, b.hue);
        var near = this.hashMob.query(b.x, b.y, 70, []);
        for (var j = 0; j < near.length; j++) {
          if (near[j].kind === "drifter") {
            var take = Math.min(0.08, b.energy * 0.12);
            b.energy -= take;
            near[j].energy = clamp(near[j].energy + take * 1.4, 0, 1.5);
          }
        }
      }
      b.open = Math.max(0, b.open - dt * 0.85);
      if (b.energy > 1.15 && this.blooms.length + born.length < this.cap("blooms")) {
        b.energy -= 0.55;
        var nb = this.mkBloom(false);
        nb.x = b.x + this.rand(-40, 40);
        nb.y = b.y + this.rand(-40, 40);
        nb.energy = 0.3;
        born.push(nb);
      }
      if (b.energy < 0.04) {
        b.dormant = true;
        b.life -= dt * 0.15;
      } else b.life = Math.min(1, b.life + dt * 0.05);
      b.energy = clamp(b.energy, 0, 1.5);
    }
    for (i = 0; i < born.length; i++) this.blooms.push(born[i]);
  };

  Garden.prototype.cap = function (k) {
    var m = this.reduced ? 0.62 : 1;
    return Math.max(4, (CAPS[k] * m) | 0);
  };

  Garden.prototype.stepDrifters = function (dt) {
    var born = [];
    for (var i = 0; i < this.drifters.length; i++) {
      var d = this.drifters[i];
      d.wob += dt * 4;
      var blooms = this.hashBlooms.query(d.x, d.y, 210, []);
      var best = null;
      var bestS = -1;
      for (var j = 0; j < blooms.length; j++) {
        var bl = blooms[j];
        if (bl.dormant) continue;
        var sc = bl.energy / (12 + Math.hypot(bl.x - d.x, bl.y - d.y));
        if (sc > bestS) {
          bestS = sc;
          best = bl;
        }
      }
      var ax = 0;
      var ay = 0;
      if (best) {
        var dx = best.x - d.x;
        var dy = best.y - d.y;
        var dist = Math.hypot(dx, dy) || 1;
        ax += (dx / dist) * 46;
        ay += (dy / dist) * 46;
        if (dist < best.r + 28) {
          var sip = Math.min(0.55 * dt, best.energy * 0.85 * dt);
          best.energy -= sip;
          d.energy += sip * 1.85;
        }
      } else {
        ax += Math.cos(d.wob) * 12;
        ay += Math.sin(d.wob * 0.7) * 12;
      }
      var nLit = this.sampleN(d.x, d.y);
      if (nLit > 0.35) d.energy += (nLit - 0.3) * 0.12 * dt;
      var c = this.sampleC(d.x, d.y);
      ax += c.x * 90;
      ay += c.y * 90;
      var hunters = this.hashMob.query(d.x, d.y, 90, []);
      for (j = 0; j < hunters.length; j++) {
        if (hunters[j].kind !== "hunter") continue;
        var hx = d.x - hunters[j].x;
        var hy = d.y - hunters[j].y;
        var hd = Math.hypot(hx, hy) || 1;
        ax += (hx / hd) * 70;
        ay += (hy / hd) * 70;
      }
      d.vx += ax * dt;
      d.vy += ay * dt;
      var sp = Math.hypot(d.vx, d.vy);
      var maxs = 70 + d.energy * 40;
      if (sp > maxs) {
        d.vx = (d.vx / sp) * maxs;
        d.vy = (d.vy / sp) * maxs;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      this.wrap(d);
      d.energy -= 0.022 * dt;
      d.trail.push(d.x, d.y);
      var maxT = this.reduced ? 10 : 22;
      while (d.trail.length > maxT * 2) d.trail.splice(0, 2);
      if (d.energy > 1.12 && this.drifters.length + born.length < this.cap("drifters")) {
        d.energy -= 0.5;
        var nd = this.mkDrifter(false);
        nd.x = d.x + this.rand(-12, 12);
        nd.y = d.y + this.rand(-12, 12);
        nd.energy = 0.32;
        born.push(nd);
      }
      if (d.energy <= 0) {
        d.life -= dt * 0.8;
        this.nutrient[this.nidx(d.x, d.y)] = clamp(this.sampleN(d.x, d.y) + 0.08, 0, 1.6);
      } else d.life = 1;
    }
    for (i = 0; i < born.length; i++) this.drifters.push(born[i]);
  };

  Garden.prototype.stepHunters = function (dt) {
    var born = [];
    for (var i = 0; i < this.hunters.length; i++) {
      var h = this.hunters[i];
      h.hunger += dt * 0.12;
      h.dash = Math.max(0, h.dash - dt);
      var prey = this.hashMob.query(h.x, h.y, 240, []);
      var best = null;
      var bestS = -1;
      for (var j = 0; j < prey.length; j++) {
        var p = prey[j];
        if (p.kind !== "drifter") continue;
        var sc = p.energy / (8 + Math.hypot(p.x - h.x, p.y - h.y));
        if (sc > bestS) {
          bestS = sc;
          best = p;
        }
      }
      var ax = Math.cos(this.time + i) * 8;
      var ay = Math.sin(this.time * 0.7 + i) * 8;
      if (best) {
        var dx = best.x - h.x;
        var dy = best.y - h.y;
        var dist = Math.hypot(dx, dy) || 1;
        var boost = h.dash > 0 ? 2.2 : 1;
        ax += (dx / dist) * 58 * boost;
        ay += (dy / dist) * 58 * boost;
        if (dist < 18 && best.energy > 0.05) {
          var steal = Math.min(0.28 * dt * 6, best.energy * 0.45);
          best.energy -= steal;
          h.energy = clamp(h.energy + steal * 0.85, 0, 1.6);
          h.hunger = 0;
          h.dash = 0.35;
          this.emitPulse(h.x, h.y, 8, 110, 0.45, 2);
          var disrupted = this.hashBlooms.query(h.x, h.y, 80, []);
          for (var k = 0; k < disrupted.length; k++) {
            disrupted[k].open *= 0.4;
            disrupted[k].energy *= 0.92;
            disrupted[k].lastSig = this.time;
          }
          this.chime(h.x, h.y, 2);
        }
      }
      var c = this.sampleC(h.x, h.y);
      ax += c.x * 40;
      ay += c.y * 40;
      h.vx += ax * dt;
      h.vy += ay * dt;
      var sp = Math.hypot(h.vx, h.vy);
      var maxs = 95;
      if (sp > maxs) {
        h.vx = (h.vx / sp) * maxs;
        h.vy = (h.vy / sp) * maxs;
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      this.wrap(h);
      h.energy -= 0.03 * dt;
      if (h.energy > 1.25 && this.hunters.length + born.length < this.cap("hunters")) {
        h.energy -= 0.7;
        var nh = this.mkHunter(false);
        nh.x = h.x + this.rand(-20, 20);
        nh.y = h.y + this.rand(-20, 20);
        born.push(nh);
      }
      if (h.energy <= 0) h.life -= dt * 0.35;
      else h.life = 1;
    }
    for (i = 0; i < born.length; i++) this.hunters.push(born[i]);
  };

  Garden.prototype.cull = function () {
    this.blooms = this.blooms.filter(function (b) {
      return b.life > 0;
    });
    this.drifters = this.drifters.filter(function (d) {
      return d.life > 0;
    });
    this.hunters = this.hunters.filter(function (h) {
      return h.life > 0;
    });
    if (this.blooms.length > this.cap("blooms")) this.blooms.length = this.cap("blooms");
    if (this.drifters.length > this.cap("drifters")) this.drifters.length = this.cap("drifters");
    if (this.hunters.length > this.cap("hunters")) this.hunters.length = this.cap("hunters");
  };

  Garden.prototype.stabilize = function () {
    this.stabCd -= DT;
    if (this.stabCd > 0) return;
    this.stabCd = 0.5;
    var wantD = Math.max(14, (PRESETS[this.presetIndex].drifters * 0.45) | 0);
    var wantB = Math.max(10, (PRESETS[this.presetIndex].blooms * 0.5) | 0);
    if (this.blooms.length < wantB && this.blooms.length < this.cap("blooms")) this.blooms.push(this.mkBloom(false));
    if (this.drifters.length < wantD && this.drifters.length < this.cap("drifters")) this.drifters.push(this.mkDrifter(false));
    if (this.hunters.length < 2 && this.hunters.length < this.cap("hunters")) this.hunters.push(this.mkHunter(false));
  };

  Garden.prototype.totalEnergy = function () {
    var s = 0;
    var i;
    for (i = 0; i < this.blooms.length; i++) s += this.blooms[i].energy;
    for (i = 0; i < this.drifters.length; i++) s += this.drifters[i].energy;
    for (i = 0; i < this.hunters.length; i++) s += this.hunters[i].energy;
    return s;
  };

  Garden.prototype.updateHud = function () {
    document.getElementById("stat-blooms").textContent = String(this.blooms.length);
    document.getElementById("stat-drifters").textContent = String(this.drifters.length);
    document.getElementById("stat-hunters").textContent = String(this.hunters.length);
    document.getElementById("stat-energy").textContent = this.totalEnergy().toFixed(1);
    document.getElementById("stat-seed").textContent = String(this.seed);
    document.getElementById("stat-time").textContent = this.time.toFixed(1) + "s";
    document.getElementById("stat-preset").textContent = PRESETS[this.presetIndex].name;
    var pulseBtn = document.getElementById("btn-pulse");
    pulseBtn.disabled = this.pulseCd > 0;
    pulseBtn.textContent = this.pulseCd > 0 ? "Pulse " + this.pulseCd.toFixed(1) + "s" : "Pulse";
  };

  Garden.prototype.worldToView = function (ctx) {
    var dpr = this.dpr;
    var sx = (this.canvas.width / dpr) / WORLD_W;
    var sy = (this.canvas.height / dpr) / WORLD_H;
    var s = Math.max(sx, sy);
    var ox = ((this.canvas.width / dpr) - WORLD_W * s) * 0.5;
    var oy = ((this.canvas.height / dpr) - WORLD_H * s) * 0.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(ox, oy);
    ctx.scale(s, s);
  };

  Garden.prototype.draw = function () {
    var ctx = this.ctx;
    this.worldToView(ctx);
    this.drawBackdrop(ctx);
    this.drawNutrient(ctx);
    this.drawMotes(ctx, 0);
    this.fadeTrails();
    this.stampTrails();
    ctx.save();
    ctx.globalAlpha = this.reduced ? 0.55 : 0.85;
    ctx.drawImage(this.trail, 0, 0, WORLD_W, WORLD_H);
    ctx.restore();
    this.drawPulses(ctx);
    this.drawBeacons(ctx);
    this.drawBlooms(ctx);
    this.drawDrifters(ctx);
    this.drawHunters(ctx);
    this.drawMotes(ctx, 1);
    this.drawVignette(ctx);
  };

  Garden.prototype.drawBackdrop = function (ctx) {
    var g = ctx.createRadialGradient(WORLD_W * 0.5, WORLD_H * 0.42, 40, WORLD_W * 0.5, WORLD_H * 0.5, 980);
    g.addColorStop(0, "#072033");
    g.addColorStop(0.45, "#04101c");
    g.addColorStop(1, "#010308");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#04182c";
    for (var i = 0; i < 6; i++) {
      var x = ((i * 277 + this.time * 6) % (WORLD_W + 200)) - 100;
      ctx.beginPath();
      ctx.ellipse(x, 120 + i * 110, 280, 40, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Garden.prototype.drawNutrient = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var cw = WORLD_W / this.ngw;
    var ch = WORLD_H / this.ngh;
    for (var y = 0; y < this.ngh; y++) {
      for (var x = 0; x < this.ngw; x++) {
        var v = this.nutrient[y * this.ngw + x];
        if (v < 0.38) continue;
        var a = (v - 0.38) * 0.18;
        ctx.fillStyle = "rgba(150,255,90," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, 18 + v * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  Garden.prototype.drawMotes = function (ctx, layer) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      if ((layer === 0 && m.z > 0.55) || (layer === 1 && m.z <= 0.55)) continue;
      var par = (1.2 - m.z) * (this.reduced ? 4 : 10);
      var x = m.x + Math.sin(this.time * 0.15 + m.p) * par;
      var y = m.y + Math.cos(this.time * 0.11 + m.p) * par * 0.4;
      ctx.fillStyle = "rgba(180,230,255," + m.a + ")";
      ctx.beginPath();
      ctx.arc(x, y, m.s * m.z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Garden.prototype.fadeTrails = function () {
    var t = this.tctx;
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = "destination-out";
    t.fillStyle = this.reduced ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.085)";
    t.fillRect(0, 0, this.trail.width, this.trail.height);
    t.restore();
  };

  Garden.prototype.stampTrails = function () {
    var t = this.tctx;
    t.save();
    t.globalCompositeOperation = "lighter";
    t.lineJoin = "round";
    t.lineCap = "round";
    for (var i = 0; i < this.drifters.length; i++) {
      var d = this.drifters[i];
      var tr = d.trail;
      if (tr.length < 4) continue;
      t.beginPath();
      for (var k = 0; k < tr.length; k += 2) {
        var c = this.sampleC(tr[k], tr[k + 1]);
        var px = tr[k] + c.x * 14;
        var py = tr[k + 1] + c.y * 14;
        if (k === 0) t.moveTo(px, py);
        else t.lineTo(px, py);
      }
      var a = 0.18 + d.energy * 0.35;
      t.strokeStyle = "rgba(140,110,255," + a.toFixed(3) + ")";
      t.lineWidth = 1.6 + d.energy * 2.2;
      t.stroke();
    }
    t.restore();
  };

  Garden.prototype.drawPulses = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.pulses.length; i++) {
      var p = this.pulses[i];
      var col =
        p.hue === 2 ? "255,110,90" : p.hue === 1 ? "180,255,90" : "80,230,255";
      ctx.strokeStyle = "rgba(" + col + "," + (this.reduced ? p.a * 0.45 : p.a).toFixed(3) + ")";
      ctx.lineWidth = this.reduced ? 1 : 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Garden.prototype.drawBeacons = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.beacons.length; i++) {
      var b = this.beacons[i];
      var a = Math.min(1, b.life / 1.2) * 0.7;
      ctx.strokeStyle = "rgba(255,224,140," + a + ")";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + Math.sin(b.age * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,240,180," + (a * 0.5) + ")";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Garden.prototype.drawBlooms = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.blooms.length; i++) {
      var b = this.blooms[i];
      var open = 0.35 + b.open * 0.9;
      var petals = 6;
      var col = b.hue === 1 ? [198, 255, 106] : [62, 232, 255];
      var a = (b.dormant ? 0.18 : 0.38) * (0.55 + b.energy);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.phase * 0.15);
      for (var p = 0; p < petals; p++) {
        ctx.rotate((Math.PI * 2) / petals);
        ctx.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + a + ")";
        ctx.beginPath();
        ctx.ellipse(0, -b.r * open, b.r * 0.38, b.r * (0.7 + open * 0.55), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,240," + (0.25 + b.energy * 0.45) + ")";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2 + b.energy * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  Garden.prototype.drawDrifters = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.drifters.length; i++) {
      var d = this.drifters[i];
      var ang = Math.atan2(d.vy, d.vx);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(ang);
      var glow = 0.25 + d.energy * 0.5;
      ctx.fillStyle = "rgba(170,140,255," + glow + ")";
      ctx.beginPath();
      ctx.moveTo(8 + d.energy * 4, 0);
      ctx.quadraticCurveTo(-2, 4.5, -9, 0);
      ctx.quadraticCurveTo(-2, -4.5, 8 + d.energy * 4, 0);
      ctx.fill();
      ctx.fillStyle = "rgba(230,240,255," + (0.4 + d.energy * 0.4) + ")";
      ctx.beginPath();
      ctx.arc(2, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  Garden.prototype.drawHunters = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.hunters.length; i++) {
      var h = this.hunters[i];
      var ang = Math.atan2(h.vy, h.vx);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(255,107,90," + (0.4 + h.energy * 0.35) + ")";
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, 7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, -7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,210,140,0.7)";
      ctx.beginPath();
      ctx.arc(4, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  Garden.prototype.drawVignette = function (ctx) {
    var g = ctx.createRadialGradient(WORLD_W * 0.5, WORLD_H * 0.5, 280, WORLD_W * 0.5, WORLD_H * 0.5, 980);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  };

  Garden.prototype.maybeAudio = function () {
    if (!this.audioWanted) return;
    if (!this.audio) this.audio = new Synth();
    this.audio.unlock();
  };

  Garden.prototype.chime = function (x, y, hue) {
    if (this.audio && this.audioWanted) this.audio.chime(x / WORLD_W, hue);
  };

  function Synth() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
  }

  Synth.prototype.unlock = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.08;
      var filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      this.master.connect(filter);
      filter.connect(this.ctx.destination);
      this._drone();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.master) this.master.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.04);
    this.ready = true;
  };

  Synth.prototype.mute = function () {
    if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.ready = false;
  };

  Synth.prototype._drone = function () {
    var ctx = this.ctx;
    var freqs = [55, 82.4, 110];
    for (var i = 0; i < freqs.length; i++) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = freqs[i];
      g.gain.value = 0.18 / (i + 1);
      o.connect(g);
      g.connect(this.master);
      o.start();
    }
  };

  Synth.prototype.chime = function (pan, hue) {
    if (!this.ready || !this.ctx) return;
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.type = "sine";
    o.frequency.value = hue === 2 ? 196 : hue === 1 ? 392 : 523;
    g.gain.value = 0.0001;
    o.connect(g);
    if (p) {
      p.pan.value = clamp(pan * 2 - 1, -0.8, 0.8);
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    var t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.start(t);
    o.stop(t + 0.3);
  };

  window.SignalGarden = new Garden();
})();
