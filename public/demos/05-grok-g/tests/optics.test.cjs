"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

function loadScript(rel) {
  var code = fs.readFileSync(path.join(__dirname, rel), "utf8");
  var ctx = {
    console: console,
    module: { exports: {} },
    exports: {},
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx, { filename: rel });
  return ctx.module.exports && Object.keys(ctx.module.exports).length
    ? ctx.module.exports
    : ctx.LightweaverOptics || ctx.LightweaverLevels;
}

var optics = loadScript("../js/optics.js");
var levels = loadScript("../js/levels.js");

var failed = 0;
var passed = 0;

function assert(cond, name) {
  if (cond) {
    passed++;
    console.log("  pass  " + name);
  } else {
    failed++;
    console.log("  FAIL  " + name);
  }
}

function almost(a, b, eps) {
  return Math.abs(a - b) < (eps == null ? 1e-6 : eps);
}

console.log("Lightweaver geometry tests");

(function intersectPerpendicular() {
  var h = optics.lineIntersect(0, 0, 1, 0, 10, -5, 10, 5, 0.01);
  assert(h && almost(h.x, 10, 1e-6) && almost(h.y, 0, 1e-6), "horizontal ray hits vertical segment");
  assert(h && almost(h.t, 10, 1e-6), "intersection distance is 10");
})();

(function intersectMiss() {
  var h = optics.lineIntersect(0, 0, 1, 0, 10, 2, 10, 8, 0.01);
  assert(h == null, "ray misses a segment above it");
})();

(function intersectBehind() {
  var h = optics.lineIntersect(0, 0, 1, 0, -10, -5, -10, 5, 0.01);
  assert(h == null, "does not report an intersection behind the ray origin");
})();

(function epsilonSkip() {
  var h = optics.lineIntersect(10, 0, 1, 0, 10, -5, 10, 5, 0.85);
  assert(h == null, "epsilon minT skips the surface the ray is spawned on");
})();

(function colinearParallel() {
  var h = optics.lineIntersect(0, 0, 1, 0, 0, 1, 10, 1, 0.01);
  assert(h == null, "parallel non-overlapping segments do not intersect");
})();

(function reflect45() {
  var r = optics.reflect(1, 0, -Math.SQRT1_2, Math.SQRT1_2);
  assert(almost(r.x, 0, 1e-6) && almost(r.y, 1, 1e-6), "right-going ray off 45° mirror reflects down");
})();

(function reflectMinus45() {
  var r = optics.reflect(1, 0, Math.SQRT1_2, Math.SQRT1_2);
  assert(almost(r.x, 0, 1e-6) && almost(r.y, -1, 1e-6), "right-going ray off -45° mirror reflects up");
})();

(function reflectNormalFlip() {
  var r1 = optics.reflect(1, 0, 0, 1);
  var r2 = optics.reflect(1, 0, 0, -1);
  assert(almost(r1.x, 1, 1e-6) && almost(r1.y, 0, 1e-6), "parallel incidence on horizontal surface keeps direction");
  assert(almost(r2.x, 1, 1e-6) && almost(r2.y, 0, 1e-6), "flipped normal yields the same parallel reflection");
})();

(function bounceLoopGuard() {
  var world = {
    width: 200,
    height: 200,
    sources: [{ id: "s", x: 40, y: 100, angle: 0, color: [1, 0, 0] }],
    pieces: [
      { id: "a", type: "mirror", x: 160, y: 100, angle: Math.PI / 2, length: 80 },
      { id: "b", type: "mirror", x: 40, y: 100, angle: Math.PI / 2, length: 80 },
    ],
    walls: [],
    targets: [],
    sensors: [],
  };
  var t = optics.propagate(world);
  assert(t.beams.length > 4 && t.beams.length <= 220, "parallel mirrors terminate via bounce cap, not an infinite loop");
})();

(function filterChannel() {
  var world = {
    width: 400,
    height: 200,
    sources: [{ id: "s", x: 20, y: 100, angle: 0, color: [1, 1, 1] }],
    pieces: [{ id: "f", type: "filter", x: 120, y: 100, angle: Math.PI / 2, length: 60, tint: [1, 0, 0] }],
    walls: [],
    targets: [{ id: "t", x: 300, y: 100, color: [1, 0, 0], radius: 20, minIntensity: 0.15 }],
    sensors: [],
  };
  var ev = optics.evaluate(world);
  assert(ev.won, "white through red filter lights a red target");
  assert(ev.targets[0].received[1] < 0.05 && ev.targets[0].received[2] < 0.05, "green and blue are stripped");
})();

(function splitterForks() {
  var world = {
    width: 400,
    height: 300,
    sources: [{ id: "s", x: 20, y: 80, angle: 0, color: [1, 0, 0] }],
    pieces: [{ id: "sp", type: "splitter", x: 140, y: 80, angle: Math.PI / 4, length: 70 }],
    walls: [],
    targets: [
      { id: "east", x: 320, y: 80, color: [1, 0, 0], radius: 18, minIntensity: 0.12 },
      { id: "south", x: 140, y: 240, color: [1, 0, 0], radius: 18, minIntensity: 0.12 },
    ],
    sensors: [],
  };
  var ev = optics.evaluate(world);
  assert(ev.won, "splitter feeds both transmitted and reflected targets");
})();

(function levelsEmitBeams() {
  for (var i = 0; i < levels.COUNT; i++) {
    var lvl = levels.getLevel(i);
    var t = optics.propagate(lvl);
    assert(t.beams.length >= 2, "level " + lvl.id + " emits visible beams (" + t.beams.length + ")");
  }
})();

(function solutions() {
  function setAngle(lvl, id, a) {
    lvl.pieces.filter(function (p) { return p.id === id; })[0].angle = a;
  }
  function setPos(lvl, id, x, y) {
    var p = lvl.pieces.filter(function (q) { return q.id === id; })[0];
    p.x = x;
    p.y = y;
  }

  var l = levels.getLevel(0);
  setAngle(l, "m-red-2", Math.PI / 4);
  assert(optics.evaluate(l).won, "level 1 solved at 45° lower mirror");

  l = levels.getLevel(1);
  setAngle(l, "mix-top", Math.PI / 4);
  setAngle(l, "mix-bot", -Math.PI / 4);
  assert(optics.evaluate(l).won, "level 2 solved by mixing red and green onto gold");

  l = levels.getLevel(2);
  setAngle(l, "split-a", Math.PI / 4);
  setAngle(l, "fil-red", Math.PI / 2);
  setAngle(l, "fil-green", 0);
  setAngle(l, "fold-g", Math.PI / 4);
  assert(optics.evaluate(l).won, "level 3 solved by splitter plus channel filters");

  l = levels.getLevel(3);
  setAngle(l, "prism-1", (-30 * Math.PI) / 180);
  assert(optics.evaluate(l).won, "level 4 solved by prism dispersion");

  l = levels.getLevel(4);
  setAngle(l, "m5-a", -Math.PI / 4);
  setAngle(l, "m5-b", -Math.PI / 4);
  setAngle(l, "m5-c", Math.PI / 4);
  setPos(l, "split-trap", 400, 280);
  var ev = optics.evaluate(l);
  assert(ev.won && !ev.sensorTripped, "level 5 solved without tripping the sensor");
})();

(function introUnsolved() {
  var l = levels.getLevel(0);
  var t = optics.propagate(l);
  var ev = optics.evaluate(l);
  assert(!ev.won, "level 1 default board is not already solved");
  assert(t.beams.length >= 4, "level 1 default board shows multiple beam segments");
})();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
