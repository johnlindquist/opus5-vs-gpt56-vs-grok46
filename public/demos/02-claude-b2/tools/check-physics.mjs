/*
 * Offline physics check for Gravity Atelier.
 *
 * index.html keeps its simulation core free of DOM access and publishes it on
 * globalThis, so the same code that runs in the browser can be evaluated
 * headlessly here. Nothing is stubbed or re-implemented: this file executes
 * the shipped script verbatim.
 *
 *   node tools/check-physics.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('no inline <script> block found in index.html');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'index.html#script' });

const GA = sandbox.GravityAtelier;
if (!GA) throw new Error('index.html did not export GravityAtelier');

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const detail = fn();
    pass++;
    console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const { World, PRESETS, makeRng, G, DT, MAX_BODIES, circularVelocity } = GA;

console.log('\nGravity Atelier — physics checks\n');

/* ------------------------------------------------------------------ */
check('seeded RNG is deterministic and independent of Math.random', () => {
  const a = makeRng(12345), b = makeRng(12345), c = makeRng(12346);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());
  assert(seqA.every((v, i) => v === seqB[i]), 'same seed produced different sequences');
  assert(seqA.some((v, i) => v !== seqC[i]), 'different seeds produced identical sequences');
  assert(seqA.every((v) => v >= 0 && v < 1), 'values outside [0,1)');
  return `first value ${seqA[0].toFixed(6)}`;
});

/* ------------------------------------------------------------------ */
check('presets rebuild bit-identically from their seed', () => {
  for (const key of Object.keys(PRESETS)) {
    const p = PRESETS[key];
    const w1 = p.build(p.seed);
    const w2 = p.build(p.seed);
    for (let i = 0; i < 1200; i++) { w1.step(DT); w2.step(DT); }
    assert(w1.bodies.length === w2.bodies.length, `${key}: body count diverged`);
    for (let i = 0; i < w1.bodies.length; i++) {
      assert(w1.bodies[i].x === w2.bodies[i].x && w1.bodies[i].y === w2.bodies[i].y,
        `${key}: body ${i} diverged after 10 s`);
    }
  }
  return 'stable, binary, chaos identical after 10 s';
});

/* ------------------------------------------------------------------ */
check('stable preset stays coherent for 60 s of simulated time', () => {
  const p = PRESETS.stable;
  const w = p.build(p.seed);
  const majorsAtStart = w.bodies.filter((b) => b.kind !== 'debris').length;
  const star = w.bodies.find((b) => b.kind === 'star');
  const start = w.bodies
    .filter((b) => b.kind !== 'debris' && b.kind !== 'star')
    .map((b) => ({ id: b.id, r: Math.hypot(b.x - star.x, b.y - star.y) }));

  for (let i = 0; i < 60 / DT; i++) w.step(DT);

  const majorsAtEnd = w.bodies.filter((b) => b.kind !== 'debris').length;
  assert(majorsAtEnd === majorsAtStart,
    `major bodies changed ${majorsAtStart} -> ${majorsAtEnd} (collapse or ejection)`);
  assert(w.bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y) &&
    Number.isFinite(b.vx) && Number.isFinite(b.vy)), 'non-finite state appeared');

  let worst = 0;
  for (const s of start) {
    const b = w.bodies.find((x) => x.id === s.id);
    assert(b, `body ${s.id} vanished`);
    const r = Math.hypot(b.x - star.x, b.y - star.y);
    worst = Math.max(worst, Math.abs(r - s.r) / s.r);
  }
  assert(worst < 0.25, `orbital radius drifted ${(worst * 100).toFixed(1)}% (want < 25%)`);
  return `${majorsAtEnd} major bodies intact, max radius drift ${(worst * 100).toFixed(1)}%`;
});

/* ------------------------------------------------------------------ */
check('two-body circular orbit closes on itself (integrator accuracy)', () => {
  const w = new World(7);
  const star = w.add({ name: 'S', kind: 'star', m: 333000, x: 0, y: 0 });
  const v = circularVelocity(star.m, 200);
  const p = w.add({ name: 'P', kind: 'planet', m: 1, x: 200, y: 0, vx: 0, vy: v });
  const period = (2 * Math.PI * 200) / v;
  const n = Math.round(period / DT);
  for (let i = 0; i < n; i++) w.step(DT);
  const err = Math.hypot(p.x - 200, p.y - 0) / 200;
  assert(err < 0.02, `after one period the body is ${(err * 100).toFixed(2)}% off (want < 2%)`);
  return `period ${period.toFixed(2)} s, closure error ${(err * 100).toFixed(3)}%`;
});

/* ------------------------------------------------------------------ */
check('gravity alone conserves total linear momentum', () => {
  // A drifting, collision-free five-body system: the net momentum is large
  // and non-zero, so any asymmetry in the pair loop would show immediately.
  const w = new World(4242);
  const star = w.add({ name: 'S', kind: 'star', m: 333000, x: 0, y: 0, vx: 17, vy: -9 });
  const rs = [140, 230, 340, 470];
  for (let i = 0; i < rs.length; i++) {
    const v = circularVelocity(star.m, rs[i]);
    const a = (i * 1.7) % (Math.PI * 2);
    w.add({
      name: 'P' + i, kind: 'planet', m: [40, 900, 120, 6][i],
      x: Math.cos(a) * rs[i], y: Math.sin(a) * rs[i],
      vx: star.vx - Math.sin(a) * v, vy: star.vy + Math.cos(a) * v
    });
  }
  const before = w.totalMomentum();
  for (let i = 0; i < 30 / DT; i++) w.step(DT);
  const after = w.totalMomentum();
  assert(w.collisionCount === 0, 'test system unexpectedly collided');
  const drift = Math.hypot(after.x - before.x, after.y - before.y) / Math.hypot(before.x, before.y);
  assert(drift < 1e-12, `momentum drifted by ${drift.toExponential(2)} over 30 s`);
  return `relative drift ${drift.toExponential(2)} over 3600 steps`;
});

/* ------------------------------------------------------------------ */
check('merge conserves mass and momentum', () => {
  const w = new World(99);
  const a = w.add({ name: 'A', kind: 'planet', m: 400, x: -6, y: 0, vx: 40, vy: 5 });
  const b = w.add({ name: 'B', kind: 'planet', m: 90, x: 6, y: 0, vx: -20, vy: -12 });
  const mBefore = w.totalMass();
  const pBefore = w.totalMomentum();
  const nBefore = w.bodies.length;
  w.step(DT);
  assert(w.mergeCount === 1, `expected exactly one merge, got ${w.mergeCount}`);
  assert(w.bodies.length === nBefore - 1, 'body count did not drop by one');
  const pAfter = w.totalMomentum();
  assert(near(w.totalMass(), mBefore, 1e-9), 'mass not conserved');
  assert(near(pAfter.x, pBefore.x, 1e-6 * Math.abs(pBefore.x) + 1e-6), 'px not conserved');
  assert(near(pAfter.y, pBefore.y, 1e-6 * Math.abs(pBefore.y) + 1e-6), 'py not conserved');
  void a; void b;
  return `mass ${mBefore} -> ${w.totalMass()}, |dp| ~ ${Math.hypot(pAfter.x - pBefore.x, pAfter.y - pBefore.y).toExponential(1)}`;
});

/* ------------------------------------------------------------------ */
check('high-speed impact fragments and still conserves mass and momentum', () => {
  const w = new World(1234);
  w.add({ name: 'A', kind: 'planet', m: 900, x: -8, y: 0, vx: 260, vy: 0 });
  w.add({ name: 'B', kind: 'planet', m: 500, x: 8, y: 0, vx: -140, vy: 30 });
  const mBefore = w.totalMass();
  const pBefore = w.totalMomentum();
  w.step(DT);
  assert(w.collisionCount === 1, 'expected one collision');
  assert(w.bodies.length > 2, `expected shards, got ${w.bodies.length} bodies`);
  const pAfter = w.totalMomentum();
  const dp = Math.hypot(pAfter.x - pBefore.x, pAfter.y - pBefore.y);
  const rel = dp / Math.hypot(pBefore.x, pBefore.y);
  assert(near(w.totalMass(), mBefore, 1e-8 * mBefore), 'mass not conserved through fragmentation');
  assert(rel < 1e-9, `momentum drifted ${rel.toExponential(2)} through fragmentation`);
  return `${w.bodies.length} bodies after impact, relative |dp| ${rel.toExponential(2)}`;
});

/* ------------------------------------------------------------------ */
check('momentum survives the step AFTER a collision (Verlet hand-off)', () => {
  // Regression: the surviving body used to start the next step with an
  // acceleration computed against a partner that no longer existed, so the
  // unpaired half-kick injected momentum one step after every merge.
  const w = PRESETS.stable.build(PRESETS.stable.seed);
  const star = w.bodies.find((b) => b.kind === 'star');
  w.add({ name: 'Impactor', kind: 'planet', m: 5000, x: star.x + 260, y: star.y, vx: -140, vy: 0 });
  const before = w.totalMomentum();
  const mBefore = w.totalMass();
  let worst = 0, prev = before;
  for (let i = 0; i < 900; i++) {
    w.step(DT);
    const now = w.totalMomentum();
    worst = Math.max(worst, Math.hypot(now.x - prev.x, now.y - prev.y));
    prev = now;
  }
  assert(w.collisionCount > 0, 'the impactor never hit anything');
  const rel = worst / Math.hypot(before.x, before.y);
  assert(near(w.totalMass(), mBefore, 1e-9 * mBefore), 'mass changed');
  assert(rel < 1e-9, `largest single-step momentum jump was ${rel.toExponential(2)} of |p|`);
  return `${w.collisionCount} collision(s), worst single-step |dp|/|p| ${rel.toExponential(2)}`;
});

check('zero-impact-parameter flyby stays bounded (softening + clamps)', () => {
  // Worst case for an unsoftened 1/r^2 kernel: a point mass fired dead
  // through the centre of a star. Radii are 0 so no merge can rescue it.
  const w = new World(5);
  w.add({ name: 'S', kind: 'star', m: 200000, r: 0, x: 0, y: 0 });
  const probe = w.add({ name: 'P', kind: 'planet', m: 1, r: 0, x: -300, y: 0, vx: 200, vy: 0 });
  let peak = 0;
  for (let i = 0; i < 1200; i++) {
    w.step(DT);
    if (!w.bodies.includes(probe)) break;
    peak = Math.max(peak, Math.hypot(probe.vx, probe.vy));
    assert(Number.isFinite(probe.x) && Number.isFinite(probe.vx),
      `non-finite state at step ${i}`);
  }
  assert(peak <= 6000, `peak speed ${peak} exceeded the MAX_SPEED clamp`);
  assert(peak > 200, 'the probe was not actually accelerated — test is not exercising the kernel');

  // And the degenerate case: two coincident zero-radius points.
  const w2 = new World(6);
  const a = w2.add({ name: 'A', kind: 'planet', m: 5000, r: 0, x: 0, y: 0 });
  w2.add({ name: 'B', kind: 'planet', m: 5000, r: 0, x: 0, y: 0 });
  for (let i = 0; i < 240; i++) w2.step(DT);
  assert(Number.isFinite(a.x) && Number.isFinite(a.vx), 'coincident points produced NaN');
  return `peak flyby speed ${peak.toFixed(0)} (cap 6000), coincident points finite`;
});

/* ------------------------------------------------------------------ */
check('body count is capped and debris can be cleared without losing majors', () => {
  const w = new World(3);
  w.add({ name: 'S', kind: 'star', m: 333000, x: 0, y: 0 });
  for (let i = 0; i < MAX_BODIES + 80; i++) {
    w.add({ name: 'd' + i, kind: 'debris', m: 0.3, x: 900 + i * 12, y: 0, vx: 0, vy: 1 });
  }
  assert(w.bodies.length <= MAX_BODIES, `body count ${w.bodies.length} exceeded cap ${MAX_BODIES}`);
  const major = w.add({ name: 'Big', kind: 'planet', m: 2000, x: 400, y: 0, vx: 0, vy: 40 });
  const removed = w.clearDebris();
  assert(removed > 0, 'clearDebris removed nothing');
  assert(w.bodies.some((x) => x.id === major.id), 'clearDebris removed a major body');
  assert(w.bodies.some((x) => x.kind === 'star'), 'clearDebris removed the star');
  return `capped at ${MAX_BODIES}, cleared ${removed} fragments, majors intact`;
});

/* ------------------------------------------------------------------ */
check('binary and chaos presets survive 60 s without non-finite state', () => {
  const notes = [];
  for (const key of ['binary', 'chaos']) {
    const p = PRESETS[key];
    const w = p.build(p.seed);
    for (let i = 0; i < 60 / DT; i++) w.step(DT);
    assert(w.bodies.length > 0, `${key}: everything vanished`);
    assert(w.bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.vx)),
      `${key}: non-finite state`);
    assert(w.bodies.some((b) => b.kind === 'star'), `${key}: lost all stars`);
    notes.push(`${key}: ${w.bodies.length} bodies, ${w.collisionCount} collisions`);
  }
  return notes.join(' · ');
});

/* ------------------------------------------------------------------ */
check('chaos preset unwinds gradually rather than collapsing at once', () => {
  const p = PRESETS.chaos;
  const w = p.build(p.seed);
  const n0 = w.bodies.length;
  while (w.time < 5) w.step(DT);
  const at5 = w.bodies.length;
  while (w.time < 30) w.step(DT);
  const at30 = w.bodies.length;
  while (w.time < 60) w.step(DT);
  const at60 = w.bodies.length;
  assert(at5 >= n0 - 2, `lost ${n0 - at5} bodies in the first 5 s — too violent`);
  assert(at30 >= 6, `only ${at30} bodies left at 30 s`);
  assert(at60 >= 4, `only ${at60} bodies left at 60 s`);
  assert(w.collisionCount >= 4, `only ${w.collisionCount} collisions — not actually chaotic`);
  return `${n0} -> ${at5} @5s -> ${at30} @30s -> ${at60} @60s, ${w.collisionCount} collisions`;
});

check('binary pair stays bound for 60 s', () => {
  const p = PRESETS.binary;
  const w = p.build(p.seed);
  const stars = w.bodies.filter((b) => b.kind === 'star');
  assert(stars.length === 2, 'expected two stars');
  const sep0 = Math.hypot(stars[0].x - stars[1].x, stars[0].y - stars[1].y);
  let min = Infinity, max = 0;
  for (let i = 0; i < 60 / DT; i++) {
    w.step(DT);
    const d = Math.hypot(stars[0].x - stars[1].x, stars[0].y - stars[1].y);
    min = Math.min(min, d); max = Math.max(max, d);
  }
  assert(max < sep0 * 1.3 && min > sep0 * 0.7,
    `separation ranged ${min.toFixed(1)}–${max.toFixed(1)} from ${sep0.toFixed(1)}`);
  return `separation held ${min.toFixed(1)}–${max.toFixed(1)} Mm (start ${sep0.toFixed(1)})`;
});

/* ------------------------------------------------------------------ */
check('trail buffers are fixed-size ring buffers (no unbounded growth)', () => {
  const p = PRESETS.stable;
  const w = p.build(p.seed);
  const b = w.bodies.find((x) => x.kind === 'planet');
  const cap = b.trail.length;
  for (let i = 0; i < 40 / DT; i++) w.step(DT);
  assert(b.trail.length === cap, 'trail array reallocated');
  assert(b.trailCount <= b.trailCap, 'trail count exceeded capacity');
  assert(b.trailCount === b.trailCap, 'trail never filled');
  return `${b.trailCap} samples, ${cap} floats, constant`;
});

/* ------------------------------------------------------------------ */
check('G and DT are the documented values', () => {
  assert(near(G, 5.706, 1e-9), `G is ${G}`);
  assert(near(DT, 1 / 120, 1e-12), `DT is ${DT}`);
  return `G = ${G}, dt = 1/${Math.round(1 / DT)} s`;
});

console.log(`\n${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`  failed: ${f}`);
  process.exit(1);
}
