/* Lightweaver — ray engine.
 * Pure, deterministic optics. No DOM, no globals beyond the LW namespace.
 * Loadable as a classic script (file://) or via require() in Node.
 */
(function (root, factory) {
  var api = factory();
  root.LW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var EPS = 1e-6;          // parametric epsilon: ignore hits at the ray origin
  var PUSH = 0.06;         // geometric push-off along the new direction
  var FALLOFF = 3000;      // distance attenuation length (board units)
  var MIN_I = 0.045;       // beams dimmer than this are dropped
  var MAX_BOUNCE = 22;     // per-ray depth cap
  var MAX_SEGMENTS = 600;  // whole-scene segment cap (infinite-loop backstop)

  var BOARD_W = 1200, BOARD_H = 760;

  // Refractive index per channel — the dispersion that makes a prism a prism.
  var IOR = { r: 1.468, g: 1.520, b: 1.578 };
  var CHANNEL_VEC = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1] };

  // ------------------------------------------------------------ small helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rad(deg) { return deg * Math.PI / 180; }
  function norm3(c) {
    var m = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
    return m < 1e-9 ? [0, 0, 0] : [c[0] / m, c[1] / m, c[2] / m];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function attenuate(i0, dist) { return i0 * Math.exp(-dist / FALLOFF); }

  // -------------------------------------------------------- pure intersection
  /**
   * Ray (o, d) against segment a→b. `d` need not be normalized, but every
   * caller here passes a unit vector so `t` is a true distance.
   * Returns {t, u} with t > EPS and u in [0,1], or null.
   */
  function raySegment(ox, oy, dx, dy, ax, ay, bx, by) {
    var ex = bx - ax, ey = by - ay;
    var den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return null;        // parallel / degenerate
    var qx = ax - ox, qy = ay - oy;
    var t = (qx * ey - qy * ex) / den;
    var u = (qx * dy - qy * dx) / den;
    if (t <= EPS || u < 0 || u > 1) return null;
    return { t: t, u: u };
  }

  /** Ray (o, unit d) against circle. Returns nearest t >= 0 or null. */
  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    var mx = ox - cx, my = oy - cy;
    var b = mx * dx + my * dy;
    var c = mx * mx + my * my - r * r;
    if (c > 0 && b > 0) return null;               // outside, pointing away
    var disc = b * b - c;
    if (disc < 0) return null;
    var s = Math.sqrt(disc);
    var t = -b - s;
    if (t < 0) t = -b + s;
    return t < 0 ? null : t;
  }

  /** Mirror reflection about a unit normal: d - 2(d·n)n. */
  function reflect(dx, dy, nx, ny) {
    var k = 2 * (dx * nx + dy * ny);
    return [dx - k * nx, dy - k * ny];
  }

  /**
   * Snell refraction. `n` must face against `d` (n·d < 0); `eta` = n_in/n_out.
   * Returns null on total internal reflection.
   */
  function refract(dx, dy, nx, ny, eta) {
    var cosi = -(dx * nx + dy * ny);
    var sin2t = eta * eta * (1 - cosi * cosi);
    if (sin2t > 1) return null;                    // TIR
    var k = eta * cosi - Math.sqrt(1 - sin2t);
    return [eta * dx + k * nx, eta * dy + k * ny];
  }

  /** Unit normal of segment a→b (left-hand side), plus its unit direction. */
  function segmentFrame(ax, ay, bx, by) {
    var ex = bx - ax, ey = by - ay;
    var L = Math.hypot(ex, ey) || 1;
    return { dx: ex / L, dy: ey / L, nx: -ey / L, ny: ex / L, len: L };
  }

  // ------------------------------------------------------------ piece geometry
  function pieceEndpoints(p) {
    var h = p.len / 2, c = Math.cos(rad(p.angle)), s = Math.sin(rad(p.angle));
    return [p.x - c * h, p.y - s * h, p.x + c * h, p.y + s * h];
  }

  /** Equilateral triangle, centroid at (x,y), circumradius `size`. */
  function prismPoints(p) {
    var pts = [];
    for (var i = 0; i < 3; i++) {
      var a = rad(p.angle) + i * 2 * Math.PI / 3 - Math.PI / 2;
      pts.push([p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size]);
    }
    return pts;
  }

  var SURFACE_TYPES = { mirror: 1, wall: 1, filter: 1, splitter: 1 };

  /**
   * Flatten a level's pieces into a surface list. The board is small (a few
   * dozen segments), so a linear sweep is faster than any acceleration
   * structure and keeps the trace exactly deterministic.
   */
  function buildSurfaces(level) {
    var out = [];
    var pieces = level.pieces;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (SURFACE_TYPES[p.type]) {
        var e = pieceEndpoints(p);
        out.push({ kind: p.type, piece: p, x1: e[0], y1: e[1], x2: e[2], y2: e[3] });
      } else if (p.type === 'prism') {
        var pts = prismPoints(p);
        for (var k = 0; k < 3; k++) {
          var a = pts[k], b = pts[(k + 1) % 3];
          out.push({
            kind: 'prism', piece: p, x1: a[0], y1: a[1], x2: b[0], y2: b[1],
            cx: p.x, cy: p.y
          });
        }
      }
    }
    // Board frame — absorbs anything that escapes, so no ray runs forever.
    var W = level.width || BOARD_W, H = level.height || BOARD_H;
    var frame = [[0, 0, W, 0], [W, 0, W, H], [W, H, 0, H], [0, H, 0, 0]];
    for (var f = 0; f < 4; f++) {
      out.push({
        kind: 'wall', piece: null, border: true,
        x1: frame[f][0], y1: frame[f][1], x2: frame[f][2], y2: frame[f][3]
      });
    }
    return out;
  }

  // ------------------------------------------------------------------- tracing
  function channelsOf(col) {
    var out = [];
    if (col[0] > 0.2) out.push('r');
    if (col[1] > 0.2) out.push('g');
    if (col[2] > 0.2) out.push('b');
    return out;
  }

  /**
   * Trace every source in `level`.
   * Returns { beams, targetHits, sensorHits, budgetExhausted }.
   *  beams:      drawable segments with start/end intensity for a gradient
   *  targetHits: Map(targetId -> [r,g,b] accumulated radiance)
   *  sensorHits: Set(sensorId) of forbidden sensors that were crossed
   */
  function trace(level, opts) {
    opts = opts || {};
    var maxBounce = opts.maxBounce || MAX_BOUNCE;
    var maxSegments = opts.maxSegments || MAX_SEGMENTS;

    var surfaces = buildSurfaces(level);
    var detectors = [];
    for (var i = 0; i < level.pieces.length; i++) {
      var p = level.pieces[i];
      if (p.type === 'target' || p.type === 'sensor') detectors.push(p);
    }

    var beams = [];
    var targetHits = new Map();
    var sensorHits = new Set();
    var stack = [];

    // Sources are pushed in declaration order and the stack is drained
    // LIFO — same input, same output, every time.
    for (var s = 0; s < level.pieces.length; s++) {
      var src = level.pieces[s];
      if (src.type !== 'source') continue;
      var d = [Math.cos(rad(src.angle)), Math.sin(rad(src.angle))];
      stack.push({
        x: src.x + d[0] * (src.nozzle || 20),
        y: src.y + d[1] * (src.nozzle || 20),
        dx: d[0], dy: d[1],
        col: src.color.slice(),
        I: src.intensity == null ? 1 : src.intensity,
        depth: 0, wl: src.wl || null, inPrism: null
      });
    }

    var exhausted = false;
    while (stack.length) {
      if (beams.length >= maxSegments) { exhausted = true; break; }
      var ray = stack.pop();
      if (ray.depth > maxBounce || ray.I < MIN_I) continue;

      // --- nearest surface ------------------------------------------------
      var best = null, bestT = Infinity;
      for (var q = 0; q < surfaces.length; q++) {
        var sf = surfaces[q];
        var hit = raySegment(ray.x, ray.y, ray.dx, ray.dy, sf.x1, sf.y1, sf.x2, sf.y2);
        if (hit && hit.t < bestT) { bestT = hit.t; best = sf; }
      }
      if (!best) continue;                      // frame guarantees this is rare

      var ex = ray.x + ray.dx * bestT, ey = ray.y + ray.dy * bestT;
      var endI = attenuate(ray.I, bestT);

      beams.push({
        x1: ray.x, y1: ray.y, x2: ex, y2: ey,
        col: ray.col, i0: ray.I, i1: endI, depth: ray.depth
      });

      // --- detectors crossed along this segment ---------------------------
      for (var di = 0; di < detectors.length; di++) {
        var det = detectors[di];
        var dt = rayCircle(ray.x, ray.y, ray.dx, ray.dy, det.x, det.y, det.r || 18);
        if (dt === null || dt > bestT) continue;
        if (det.type === 'sensor') { sensorHits.add(det.id); continue; }
        var hi = attenuate(ray.I, dt);
        var acc = targetHits.get(det.id) || [0, 0, 0];
        acc[0] += ray.col[0] * hi; acc[1] += ray.col[1] * hi; acc[2] += ray.col[2] * hi;
        targetHits.set(det.id, acc);
      }

      var fr = segmentFrame(best.x1, best.y1, best.x2, best.y2);
      // Normal facing the incoming ray.
      var nx = fr.nx, ny = fr.ny;
      if (ray.dx * nx + ray.dy * ny > 0) { nx = -nx; ny = -ny; }

      var child = { x: ex, y: ey, depth: ray.depth + 1, wl: ray.wl, inPrism: ray.inPrism };

      if (best.kind === 'wall') {
        continue;                                // absorbed
      }

      if (best.kind === 'mirror') {
        var r = reflect(ray.dx, ray.dy, nx, ny);
        push(stack, child, r[0], r[1], ray.col, endI * 0.97);
        continue;
      }

      if (best.kind === 'splitter') {
        var rr = reflect(ray.dx, ray.dy, nx, ny);
        push(stack, child, rr[0], rr[1], ray.col, endI * 0.5);
        push(stack, child, ray.dx, ray.dy, ray.col, endI * 0.5);
        continue;
      }

      if (best.kind === 'filter') {
        var mask = CHANNEL_VEC[best.piece.channel] || [1, 1, 1];
        var out = [ray.col[0] * mask[0], ray.col[1] * mask[1], ray.col[2] * mask[2]];
        if (out[0] + out[1] + out[2] < 0.05) continue;   // fully absorbed
        push(stack, child, ray.dx, ray.dy, out, endI * 0.95);
        continue;
      }

      if (best.kind === 'prism') {
        // Outward normal points away from the centroid; that tells us whether
        // this crossing is an entry or an exit.
        var ox = (best.x1 + best.x2) / 2 - best.cx;
        var oy = (best.y1 + best.y2) / 2 - best.cy;
        var outward = (fr.nx * ox + fr.ny * oy) >= 0 ? [fr.nx, fr.ny] : [-fr.nx, -fr.ny];
        var entering = (ray.dx * outward[0] + ray.dy * outward[1]) < 0;
        var faceN = entering ? [-outward[0], -outward[1]] : outward;
        // faceN must oppose the ray for refract(); flip if numerics disagree.
        if (ray.dx * faceN[0] + ray.dy * faceN[1] > 0) { faceN = [-faceN[0], -faceN[1]]; }

        var wls = ray.wl ? [ray.wl] : channelsOf(ray.col);
        if (!wls.length) continue;
        var share = ray.wl ? 1 : 1 / Math.max(1, wls.length * 0.62);  // keep rays readable

        for (var w = 0; w < wls.length; w++) {
          var wl = wls[w];
          var n = IOR[wl];
          var eta = entering ? 1 / n : n;
          var rf = refract(ray.dx, ray.dy, faceN[0], faceN[1], eta);
          var kid = {
            x: ex, y: ey, depth: ray.depth + 1, wl: wl,
            inPrism: entering ? best.piece : null
          };
          if (!rf) {
            // Total internal reflection keeps the ray inside the glass.
            var tir = reflect(ray.dx, ray.dy, faceN[0], faceN[1]);
            kid.inPrism = best.piece;
            push(stack, kid, tir[0], tir[1], CHANNEL_VEC[wl], endI * 0.92 * share);
          } else {
            push(stack, kid, rf[0], rf[1], CHANNEL_VEC[wl], endI * 0.94 * share);
          }
        }
        continue;
      }
    }

    return { beams: beams, targetHits: targetHits, sensorHits: sensorHits, budgetExhausted: exhausted };
  }

  /**
   * Emit a child ray. The origin is nudged PUSH units along the *new*
   * direction so the ray can never re-hit the surface it just left, and the
   * parametric EPS in raySegment catches whatever the nudge misses.
   */
  function push(stack, base, dx, dy, col, I) {
    if (I < MIN_I) return;
    var L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    stack.push({
      x: base.x + dx * PUSH, y: base.y + dy * PUSH,
      dx: dx, dy: dy, col: col.slice(), I: I,
      depth: base.depth, wl: base.wl, inPrism: base.inPrism
    });
  }

  // ---------------------------------------------------------------- victory
  var COLOR_TOLERANCE = 0.965;   // cosine similarity between hue vectors

  /**
   * Score a traced result against the level's targets.
   * A target is lit only when both hue *and* intensity clear the bar.
   */
  function evaluate(level, res) {
    var targets = [], ok = true;
    for (var i = 0; i < level.pieces.length; i++) {
      var p = level.pieces[i];
      if (p.type !== 'target') continue;
      var acc = res.targetHits.get(p.id) || [0, 0, 0];
      var lum = Math.max(acc[0], acc[1], acc[2]);
      var need = p.need == null ? 0.32 : p.need;
      var match = dot3(norm3(acc), norm3(p.color));
      var lit = lum >= need && match >= COLOR_TOLERANCE;
      targets.push({ id: p.id, lit: lit, lum: lum, match: match, need: need, acc: acc });
      if (!lit) ok = false;
    }
    var violated = res.sensorHits.size > 0;
    return { targets: targets, solved: ok && !violated && targets.length > 0, violated: violated };
  }

  return {
    EPS: EPS, PUSH: PUSH, FALLOFF: FALLOFF, IOR: IOR,
    BOARD_W: BOARD_W, BOARD_H: BOARD_H,
    MAX_BOUNCE: MAX_BOUNCE, COLOR_TOLERANCE: COLOR_TOLERANCE,
    clamp: clamp, rad: rad, norm3: norm3, dot3: dot3, attenuate: attenuate,
    raySegment: raySegment, rayCircle: rayCircle,
    reflect: reflect, refract: refract, segmentFrame: segmentFrame,
    pieceEndpoints: pieceEndpoints, prismPoints: prismPoints,
    buildSurfaces: buildSurfaces, trace: trace, evaluate: evaluate
  };
});
