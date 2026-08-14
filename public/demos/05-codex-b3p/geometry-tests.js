"use strict";

const assert = require("node:assert/strict");
const engine = require("./engine.js");
require("./levels.js");

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
}

{
  const hit = engine.lineIntersection(
    { x: 0, y: 0 }, { x: 1, y: 0 },
    { x: 5, y: -2 }, { x: 5, y: 2 }
  );
  assert.ok(hit, "perpendicular segments should intersect");
  approx(hit.point.x, 5);
  approx(hit.point.y, 0);
  approx(hit.t, 5);
}

{
  const miss = engine.lineIntersection(
    { x: 0, y: 0 }, { x: 1, y: 0 },
    { x: 5, y: 2 }, { x: 5, y: 4 }
  );
  assert.equal(miss, null, "ray should miss an offset segment");
}

{
  const reflected = engine.reflect({ x: 1, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
  approx(reflected.x, 0);
  approx(reflected.y, -1);
}

{
  const reflected = engine.reflect({ x: 0, y: 1 }, { x: 0, y: -1 });
  approx(reflected.x, 0);
  approx(reflected.y, -1);
}

for (const level of globalThis.LightLevels) {
  const solvedPieces = level.pieces.map(piece => ({ ...piece, ...(piece.solution || {}) }));
  const result = engine.propagate(level, solvedPieces);
  assert.ok(result.processed <= 180, `${level.name}: bounded ray processing`);
  assert.ok(result.won, `${level.name}: authored solution must satisfy every target`);
}

console.log(`Geometry checks passed: intersections, reflections, epsilon-bounded propagation, and ${globalThis.LightLevels.length} solvable levels.`);
