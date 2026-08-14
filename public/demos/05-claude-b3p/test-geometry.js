/* Lightweaver — geometry and puzzle checks.
 *   node test-geometry.js
 * Pure functions only; nothing here touches the DOM.
 */
'use strict';

const E = require('./engine.js');
const DATA = require('./levels.js');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (extra ? '  → ' + extra : ''));
}
function near(name, got, want, tol) {
  tol = tol == null ? 1e-9 : tol;
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want} (±${tol})`);
}
function nearVec(name, got, want, tol) {
  tol = tol == null ? 1e-9 : tol;
  ok(name, Math.abs(got[0] - want[0]) <= tol && Math.abs(got[1] - want[1]) <= tol,
     `got [${got}], want [${want}]`);
}

// ------------------------------------------------------- ray ↔ segment
{
  // Head-on crossing at distance 5.
  let h = E.raySegment(0, 0, 1, 0, 5, -3, 5, 3);
  ok('rs: perpendicular crossing hits', !!h);
  near('rs: distance to crossing', h.t, 5);
  near('rs: midpoint of segment', h.u, 0.5);

  // Segment behind the ray must not register.
  ok('rs: segment behind origin misses', E.raySegment(0, 0, 1, 0, -5, -3, -5, 3) === null);

  // Ray passes above the segment's span.
  ok('rs: outside segment span misses', E.raySegment(0, 0, 1, 0, 5, 3, 5, 9) === null);

  // Parallel (collinear) — deliberately reported as a miss.
  ok('rs: parallel segment misses', E.raySegment(0, 0, 1, 0, 2, 0, 8, 0) === null);

  // Diagonal ray onto a horizontal segment.
  const s = Math.SQRT1_2;
  h = E.raySegment(0, 0, s, s, -10, 4, 10, 4);
  near('rs: diagonal hit distance', h.t, 4 * Math.SQRT2, 1e-12);

  // A hit exactly at the origin is rejected — this is the epsilon rule that
  // stops a reflected ray from re-colliding with the surface it just left.
  ok('rs: t=0 self-hit rejected', E.raySegment(5, 0, 1, 0, 5, -3, 5, 3) === null);
  // ...and one epsilon further along is accepted again.
  ok('rs: hit just past epsilon accepted', E.raySegment(5 - 1e-4, 0, 1, 0, 5, -3, 5, 3) !== null);

  // Endpoint inclusive at u = 0 and u = 1.
  ok('rs: endpoint u=0 counts', E.raySegment(0, 0, 1, 0, 5, 0, 5, 6) !== null);
  ok('rs: endpoint u=1 counts', E.raySegment(0, 0, 1, 0, 5, -6, 5, 0) !== null);
}

// ------------------------------------------------------------ ray ↔ circle
{
  near('rc: straight-on entry distance', E.rayCircle(0, 0, 1, 0, 10, 0, 3), 7, 1e-12);
  ok('rc: tangent miss', E.rayCircle(0, 0, 1, 0, 10, 5, 3) === null);
  near('rc: grazing hit', E.rayCircle(0, 0, 1, 0, 10, 3, 3), 10, 1e-9);
  ok('rc: circle behind ray misses', E.rayCircle(0, 0, 1, 0, -10, 0, 3) === null);
  near('rc: origin inside circle', E.rayCircle(10, 0, 1, 0, 10, 0, 3), 3, 1e-12);
}

// ----------------------------------------------------------------- reflection
{
  // Vertical wall (normal along -x) turns a rightward ray around.
  nearVec('refl: normal incidence reverses', E.reflect(1, 0, -1, 0), [-1, 0], 1e-12);

  // 45° mirror: rightward ray becomes downward.
  const f = E.segmentFrame(0, 0, 1, 1);
  let n = [f.nx, f.ny];
  if (1 * n[0] + 0 * n[1] > 0) n = [-n[0], -n[1]];
  nearVec('refl: 45° mirror sends +x to +y', E.reflect(1, 0, n[0], n[1]), [0, 1], 1e-12);

  // Grazing incidence is preserved, and reflection is length-preserving.
  const r = E.reflect(Math.SQRT1_2, Math.SQRT1_2, 0, -1);
  nearVec('refl: floor bounce flips y only', r, [Math.SQRT1_2, -Math.SQRT1_2], 1e-12);
  near('refl: unit length preserved', Math.hypot(r[0], r[1]), 1, 1e-12);

  // Angle in equals angle out about the normal.
  const d = [0.6, 0.8], nn = [0, -1];
  const rr = E.reflect(d[0], d[1], nn[0], nn[1]);
  near('refl: incident and exit angles match',
       -(d[0] * nn[0] + d[1] * nn[1]), rr[0] * nn[0] + rr[1] * nn[1], 1e-12);

  // Reflecting twice about the same normal is the identity.
  const twice = E.reflect(rr[0], rr[1], nn[0], nn[1]);
  nearVec('refl: involution', twice, d, 1e-12);
}

// ----------------------------------------------------------------- refraction
{
  // Straight-on entry is undeviated.
  nearVec('refr: normal incidence undeviated', E.refract(1, 0, -1, 0, 1 / 1.5), [1, 0], 1e-12);

  // Snell's law holds: n1 sin θ1 = n2 sin θ2.
  const n1 = 1, n2 = 1.5, eta = n1 / n2;
  const th1 = 0.6;
  const d = [Math.sin(th1), Math.cos(th1)];     // travelling +y into the surface
  const nrm = [0, -1];                          // faces the ray
  const out = E.refract(d[0], d[1], nrm[0], nrm[1], eta);
  const th2 = Math.asin(Math.abs(out[0]) / Math.hypot(out[0], out[1]));
  near('refr: obeys Snell', n1 * Math.sin(th1), n2 * Math.sin(th2), 1e-9);
  near('refr: output is unit length', Math.hypot(out[0], out[1]), 1, 1e-9);
  ok('refr: bends toward the normal entering glass', th2 < th1);

  // Total internal reflection past the critical angle.
  const crit = Math.asin(1 / 1.5);
  const big = crit + 0.15;
  const din = [Math.sin(big), Math.cos(big)];
  ok('refr: TIR beyond critical angle',
     E.refract(din[0], din[1], 0, -1, 1.5) === null);
  const small = crit - 0.15;
  ok('refr: transmits below critical angle',
     E.refract(Math.sin(small), Math.cos(small), 0, -1, 1.5) !== null);

  // Blue is bent harder than red — the whole basis of the prism level.
  const bendR = E.refract(d[0], d[1], nrm[0], nrm[1], 1 / E.IOR.r);
  const bendB = E.refract(d[0], d[1], nrm[0], nrm[1], 1 / E.IOR.b);
  ok('refr: blue deviates more than red', Math.abs(bendB[0]) < Math.abs(bendR[0]));
}

// ------------------------------------------------------------- attenuation
{
  near('atten: zero distance is lossless', E.attenuate(1, 0), 1, 1e-12);
  ok('atten: monotonically decreasing', E.attenuate(1, 100) > E.attenuate(1, 200));
  ok('atten: never negative', E.attenuate(1, 1e6) >= 0);
}

// ------------------------------------------------------------ piece geometry
{
  const e = E.pieceEndpoints({ x: 100, y: 100, angle: 0, len: 50 });
  nearVec('geom: horizontal endpoints', [e[0], e[1]], [75, 100], 1e-9);
  nearVec('geom: horizontal endpoints 2', [e[2], e[3]], [125, 100], 1e-9);

  const pts = E.prismPoints({ x: 0, y: 0, size: 10, angle: 0 });
  ok('geom: prism has 3 vertices', pts.length === 3);
  pts.forEach(function (p, i) {
    near('geom: prism vertex ' + i + ' on circumcircle', Math.hypot(p[0], p[1]), 10, 1e-9);
  });
  const area = Math.abs(
    (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) -
    (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1])) / 2;
  near('geom: prism is equilateral', area, 3 * Math.sqrt(3) / 4 * 100, 1e-9);
}

// ------------------------------------------------------------- engine traces
{
  // A ray bouncing between two parallel mirrors must terminate, not hang.
  const cage = {
    width: 400, height: 400,
    pieces: [
      // Emitter sits between the plates, so the ray is trapped and can only
      // stop because of the bounce cap / intensity floor.
      { id: 's', type: 'source', x: 200, y: 200, angle: 90, color: [1, 1, 1], intensity: 1 },
      { id: 'a', type: 'mirror', x: 200, y: 300, angle: 0, len: 300 },
      { id: 'b', type: 'mirror', x: 200, y: 100, angle: 0, len: 300 }
    ]
  };
  const t0 = Date.now();
  const res = E.trace(cage);
  ok('trace: mirror cage terminates', Date.now() - t0 < 2000);
  ok('trace: bounce cap respected', res.beams.every(b => b.depth <= E.MAX_BOUNCE));
  ok('trace: cage produced many bounces', res.beams.length > 5);
  ok('trace: no zero-length segments',
     res.beams.every(b => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) > 1e-3));

  // Determinism: identical input, byte-identical output.
  const a = JSON.stringify(E.trace(DATA.solved(DATA.LEVELS[4])).beams);
  const b = JSON.stringify(E.trace(DATA.solved(DATA.LEVELS[4])).beams);
  ok('trace: deterministic across runs', a === b);

  // Walls block.
  const blocked = {
    width: 400, height: 400,
    pieces: [
      { id: 's', type: 'source', x: 40, y: 200, angle: 0, color: [1, 0, 0], intensity: 1 },
      { id: 'w', type: 'wall', x: 200, y: 200, angle: 90, len: 200 },
      { id: 't', type: 'target', x: 340, y: 200, r: 20, color: [1, 0, 0], need: 0.2 }
    ]
  };
  const br = E.trace(blocked);
  ok('trace: wall blocks the beam', !E.evaluate(blocked, br).solved);
  ok('trace: beam stops at the wall', Math.abs(br.beams[0].x2 - 200) < 1e-6);

  // Splitter really makes two beams.
  const split = {
    width: 400, height: 400,
    pieces: [
      { id: 's', type: 'source', x: 40, y: 200, angle: 0, color: [1, 1, 1], intensity: 1 },
      { id: 'p', type: 'splitter', x: 200, y: 200, angle: 45, len: 100 }
    ]
  };
  ok('trace: splitter yields two children', E.trace(split).beams.length === 3);

  // Filter masks to one channel.
  const filt = {
    width: 400, height: 400,
    pieces: [
      { id: 's', type: 'source', x: 40, y: 200, angle: 0, color: [1, 1, 1], intensity: 1 },
      { id: 'f', type: 'filter', x: 200, y: 200, angle: 90, len: 100, channel: 'g' }
    ]
  };
  const fr = E.trace(filt).beams;
  nearVec('trace: filter passes only its channel', [fr[1].col[0], fr[1].col[2]], [0, 0], 1e-12);
  near('trace: filter keeps its own channel', fr[1].col[1], 1, 1e-12);

  // Prism disperses white into exactly three wavelengths.
  const disp = {
    width: 900, height: 600,
    pieces: [
      { id: 's', type: 'source', x: 40, y: 300, angle: 0, color: [1, 1, 1], intensity: 1 },
      { id: 'p', type: 'prism', x: 300, y: 300, size: 80, angle: 15 }
    ]
  };
  const dr = E.trace(disp).beams;
  const chans = new Set(dr.filter(b => b.col.filter(c => c > 0.5).length === 1)
                          .map(b => b.col[0] > 0.5 ? 'r' : b.col[1] > 0.5 ? 'g' : 'b'));
  ok('trace: prism separates R, G and B', chans.size === 3, [...chans].join(''));

  // Epsilon strategy: no child segment starts where its parent ended and
  // immediately re-hits the same surface (would show as a zero-length beam).
  const eps = E.trace(DATA.solved(DATA.LEVELS[0]));
  ok('trace: no degenerate self-collision',
     eps.beams.every(b => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) > 0.5));
}

// ------------------------------------------------------------ colour scoring
{
  const lvl = {
    width: 400, height: 400,
    pieces: [{ id: 't', type: 'target', x: 100, y: 100, r: 20, color: [1, 0, 0], need: 0.3 }]
  };
  const mk = acc => ({ targetHits: new Map([['t', acc]]), sensorHits: new Set() });

  ok('score: exact hue at full intensity lights', E.evaluate(lvl, mk([0.6, 0, 0])).solved);
  ok('score: correct hue but too dim stays dark', !E.evaluate(lvl, mk([0.1, 0, 0])).solved);
  ok('score: white light does not satisfy a red plate',
     !E.evaluate(lvl, mk([0.8, 0.8, 0.8])).solved);
  ok('score: heavy contamination rejected', !E.evaluate(lvl, mk([0.6, 0.35, 0])).solved);
  ok('score: trace contamination tolerated', E.evaluate(lvl, mk([0.6, 0.05, 0.05])).solved);

  const yl = {
    width: 400, height: 400,
    pieces: [{ id: 't', type: 'target', x: 100, y: 100, r: 20, color: [1, 1, 0], need: 0.3 }]
  };
  ok('score: red plus green makes amber', E.evaluate(yl, mk([0.5, 0.5, 0])).solved);
  ok('score: red alone is not amber', !E.evaluate(yl, mk([0.5, 0, 0])).solved);

  const sens = {
    width: 400, height: 400,
    pieces: [{ id: 't', type: 'target', x: 100, y: 100, r: 20, color: [1, 0, 0], need: 0.3 }]
  };
  const tripped = { targetHits: new Map([['t', [0.6, 0, 0]]]), sensorHits: new Set(['s1']) };
  ok('score: a tripped watcher voids the solve', !E.evaluate(sens, tripped).solved);
}

// -------------------------------------------------------------- the 5 levels
DATA.LEVELS.forEach(function (def, i) {
  const tag = 'level ' + def.id + ' (' + def.name + ')';

  const start = DATA.clone(def);
  const s0 = E.evaluate(start, E.trace(start));
  ok(tag + ': does not start solved', !s0.solved);

  const done = DATA.solved(def);
  const r = E.trace(done);
  const s1 = E.evaluate(done, r);
  ok(tag + ': published solution solves it', s1.solved,
     JSON.stringify(s1.targets.map(t => ({ id: t.id, lum: +t.lum.toFixed(3), match: +t.match.toFixed(3) }))));
  ok(tag + ': solution trips no watcher', !s1.violated);
  ok(tag + ': ray budget not exhausted', !r.budgetExhausted);
  ok(tag + ': every target comfortably above threshold',
     s1.targets.every(t => t.lum >= t.need));
  ok(tag + ': has three hint stages', Array.isArray(def.hints) && def.hints.length === 3);
  ok(tag + ': every solution id exists',
     Object.keys(def.solution).every(id => def.pieces.some(p => p.id === id)));
  ok(tag + ': has at least one interactive piece',
     def.pieces.some(p => p.move || p.spin));
  ok(tag + ': has a source and a target',
     def.pieces.some(p => p.type === 'source') && def.pieces.some(p => p.type === 'target'));

  // Stability: the solution must not be a knife edge. Nudge every solved
  // piece by ±1 unit / ±1° and require the trace to stay finite and sane.
  let stable = true;
  Object.keys(def.solution).forEach(function (id) {
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(function (dd) {
      const j = DATA.solved(def);
      const p = j.pieces.find(q => q.id === id);
      p.x += dd[0]; p.y += dd[1];
      if (p.angle != null) p.angle += dd[2];
      const rr = E.trace(j);
      if (rr.budgetExhausted) stable = false;
      if (rr.beams.some(b => !isFinite(b.x2) || !isFinite(b.y2))) stable = false;
    });
  });
  ok(tag + ': stable under 1-unit jitter', stable);
});

// Content requirements called out in the brief.
{
  const kinds = new Set();
  DATA.LEVELS.forEach(l => l.pieces.forEach(p => kinds.add(p.type)));
  ['source', 'mirror', 'wall', 'filter', 'splitter', 'prism', 'target', 'sensor']
    .forEach(k => ok('coverage: some level uses a ' + k, kinds.has(k)));

  ok('coverage: five levels', DATA.LEVELS.length === 5);
  ok('coverage: a level needs splitting or mixing',
     DATA.LEVELS.some(l => l.pieces.some(p => p.type === 'splitter' || p.type === 'prism')));
  ok('coverage: a level needs sensor avoidance',
     DATA.LEVELS.some(l => l.pieces.some(p => p.type === 'sensor')));
  ok('coverage: a level mixes two colours into one plate',
     DATA.LEVELS.some(l => l.pieces.some(p =>
       p.type === 'target' && p.color.filter(c => c > 0).length > 1)));
}

// ------------------------------------------------------------------- report
console.log('\nLightweaver geometry checks');
console.log('  passed: ' + pass);
console.log('  failed: ' + fail);
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('\nAll checks passed.\n');
