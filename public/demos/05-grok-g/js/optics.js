/**
 * Lightweaver ray engine — pure geometry, no DOM.
 * World coordinates: x right, y down (canvas convention).
 */
(function (root) {
  "use strict";

  var EPS = 1e-8;
  var RAY_EPS = 0.85;
  var MAX_BOUNCES = 28;
  var MAX_RAYS = 220;
  var ATTEN_K = 0.00055;
  var MIN_ENERGY = 0.012;
  var BOARD_MARGIN = 2;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function hypot2(x, y) {
    return Math.hypot(x, y);
  }

  function normalize(x, y) {
    var L = Math.hypot(x, y);
    if (L < EPS) return { x: 1, y: 0 };
    return { x: x / L, y: y / L };
  }

  function maxChan(c) {
    return Math.max(c[0], c[1], c[2]);
  }

  function colorEnergy(c) {
    return c[0] + c[1] + c[2];
  }

  function scaleColor(c, s) {
    return [c[0] * s, c[1] * s, c[2] * s];
  }

  function mulColor(a, b) {
    return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  }

  function addColor(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function attenuate(color, dist) {
    var f = Math.exp(-Math.max(0, dist) * ATTEN_K);
    return scaleColor(color, f);
  }

  /**
   * Ray P + t D (D not necessarily unit) vs segment A→B.
   * Returns { t, u, x, y } or null.
   * t is distance along the ray if D is unit; caller should pass unit D.
   */
  function lineIntersect(px, py, dx, dy, ax, ay, bx, by, minT) {
    var vx = bx - ax;
    var vy = by - ay;
    var det = dx * vy - dy * vx;
    if (Math.abs(det) < 1e-12) return null;
    var sx = ax - px;
    var sy = ay - py;
    var t = (sx * vy - sy * vx) / det;
    var u = (sx * dy - sy * dx) / det;
    var lo = minT == null ? RAY_EPS : minT;
    if (t < lo || u < -1e-6 || u > 1 + 1e-6) return null;
    return { t: t, u: u, x: px + t * dx, y: py + t * dy };
  }

  /**
   * Reflect incident direction I off a surface with normal N.
   * Normal is flipped so it faces the incoming ray.
   */
  function reflect(ix, iy, nx, ny) {
    var i = normalize(ix, iy);
    var n = normalize(nx, ny);
    var dot = i.x * n.x + i.y * n.y;
    if (dot > 0) {
      n = { x: -n.x, y: -n.y };
      dot = -dot;
    }
    return {
      x: i.x - 2 * dot * n.x,
      y: i.y - 2 * dot * n.y,
    };
  }

  function rotateVec(x, y, ang) {
    var c = Math.cos(ang);
    var s = Math.sin(ang);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  function segmentNormal(ax, ay, bx, by) {
    return normalize(-(by - ay), bx - ax);
  }

  function pieceSegment(piece) {
    var half = (piece.length || 80) / 2;
    var c = Math.cos(piece.angle);
    var s = Math.sin(piece.angle);
    return {
      ax: piece.x - c * half,
      ay: piece.y - s * half,
      bx: piece.x + c * half,
      by: piece.y + s * half,
    };
  }

  function prismVertices(piece) {
    var r = piece.radius || 46;
    var verts = [];
    for (var i = 0; i < 3; i++) {
      var a = piece.angle + (i * Math.PI * 2) / 3 - Math.PI / 2;
      verts.push({
        x: piece.x + Math.cos(a) * r,
        y: piece.y + Math.sin(a) * r,
      });
    }
    return verts;
  }

  function pointInTriangle(px, py, v) {
    function sign(ax, ay, bx, by, cx, cy) {
      return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    }
    var b1 = sign(px, py, v[0].x, v[0].y, v[1].x, v[1].y) < 0;
    var b2 = sign(px, py, v[1].x, v[1].y, v[2].x, v[2].y) < 0;
    var b3 = sign(px, py, v[2].x, v[2].y, v[0].x, v[0].y) < 0;
    return b1 === b2 && b2 === b3;
  }

  function buildColliders(world) {
    var list = [];
    var i, s, p, w, t, n, verts, a, b;

    var W = world.width;
    var H = world.height;
    var borders = [
      { ax: 0, ay: 0, bx: W, by: 0 },
      { ax: W, ay: 0, bx: W, by: H },
      { ax: W, ay: H, bx: 0, by: H },
      { ax: 0, ay: H, bx: 0, by: 0 },
    ];
    for (i = 0; i < 4; i++) {
      b = borders[i];
      list.push({
        kind: "border",
        id: "border-" + i,
        ax: b.ax,
        ay: b.ay,
        bx: b.bx,
        by: b.by,
        nx: segmentNormal(b.ax, b.ay, b.bx, b.by).x,
        ny: segmentNormal(b.ax, b.ay, b.bx, b.by).y,
      });
    }

    var walls = world.walls || [];
    for (i = 0; i < walls.length; i++) {
      w = walls[i];
      n = segmentNormal(w.x1, w.y1, w.x2, w.y2);
      list.push({
        kind: "wall",
        id: w.id || "wall-" + i,
        ax: w.x1,
        ay: w.y1,
        bx: w.x2,
        by: w.y2,
        nx: n.x,
        ny: n.y,
      });
    }

    var pieces = world.pieces || [];
    for (i = 0; i < pieces.length; i++) {
      p = pieces[i];
      if (p.type === "prism") {
        verts = prismVertices(p);
        for (var e = 0; e < 3; e++) {
          a = verts[e];
          b = verts[(e + 1) % 3];
          n = segmentNormal(a.x, a.y, b.x, b.y);
          list.push({
            kind: "prism",
            id: p.id + "-e" + e,
            pieceId: p.id,
            edge: e,
            ax: a.x,
            ay: a.y,
            bx: b.x,
            by: b.y,
            nx: n.x,
            ny: n.y,
            piece: p,
          });
        }
        continue;
      }
      s = pieceSegment(p);
      n = segmentNormal(s.ax, s.ay, s.bx, s.by);
      list.push({
        kind: p.type,
        id: p.id,
        pieceId: p.id,
        ax: s.ax,
        ay: s.ay,
        bx: s.bx,
        by: s.by,
        nx: n.x,
        ny: n.y,
        piece: p,
        tint: p.tint || p.color,
      });
    }

    var sensors = world.sensors || [];
    for (i = 0; i < sensors.length; i++) {
      t = sensors[i];
      var hw = (t.w || 28) / 2;
      var hh = (t.h || 28) / 2;
      var box = [
        [t.x - hw, t.y - hh, t.x + hw, t.y - hh],
        [t.x + hw, t.y - hh, t.x + hw, t.y + hh],
        [t.x + hw, t.y + hh, t.x - hw, t.y + hh],
        [t.x - hw, t.y + hh, t.x - hw, t.y - hh],
      ];
      for (e = 0; e < 4; e++) {
        n = segmentNormal(box[e][0], box[e][1], box[e][2], box[e][3]);
        list.push({
          kind: "sensor",
          id: (t.id || "sensor-" + i) + "-e" + e,
          sensorId: t.id || "sensor-" + i,
          ax: box[e][0],
          ay: box[e][1],
          bx: box[e][2],
          by: box[e][3],
          nx: n.x,
          ny: n.y,
        });
      }
    }

    var targets = world.targets || [];
    for (i = 0; i < targets.length; i++) {
      t = targets[i];
      var rad = t.radius || 22;
      var segs = 10;
      for (e = 0; e < segs; e++) {
        var a0 = (e / segs) * Math.PI * 2;
        var a1 = ((e + 1) / segs) * Math.PI * 2;
        list.push({
          kind: "target",
          id: t.id + "-e" + e,
          targetId: t.id,
          ax: t.x + Math.cos(a0) * rad,
          ay: t.y + Math.sin(a0) * rad,
          bx: t.x + Math.cos(a1) * rad,
          by: t.y + Math.sin(a1) * rad,
          nx: Math.cos((a0 + a1) / 2),
          ny: Math.sin((a0 + a1) / 2),
          target: t,
        });
      }
    }

    return list;
  }

  function findHit(ray, colliders) {
    var best = null;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (ray.skipId && c.id === ray.skipId) continue;
      if (ray.skipPiece && c.pieceId && c.pieceId === ray.skipPiece) continue;
      var hit = lineIntersect(
        ray.x,
        ray.y,
        ray.dx,
        ray.dy,
        c.ax,
        c.ay,
        c.bx,
        c.by,
        RAY_EPS
      );
      if (!hit) continue;
      if (!best || hit.t < best.t) {
        best = {
          t: hit.t,
          x: hit.x,
          y: hit.y,
          u: hit.u,
          collider: c,
        };
      }
    }
    return best;
  }

  function pushBeam(beams, ray, x2, y2, colorEnd) {
    beams.push({
      x1: ray.x,
      y1: ray.y,
      x2: x2,
      y2: y2,
      color: ray.color.slice(),
      colorEnd: colorEnd || attenuate(ray.color, Math.hypot(x2 - ray.x, y2 - ray.y)),
      intensity: ray.intensity,
    });
  }

  function spawn(queue, x, y, dx, dy, color, bounces, skipId, skipPiece) {
    var d = normalize(dx, dy);
    if (maxChan(color) < MIN_ENERGY) return;
    queue.push({
      x: x + d.x * RAY_EPS,
      y: y + d.y * RAY_EPS,
      dx: d.x,
      dy: d.y,
      color: color,
      intensity: maxChan(color),
      bounces: bounces,
      skipId: skipId || null,
      skipPiece: skipPiece || null,
    });
  }

  function propagate(world) {
    var colliders = buildColliders(world);
    var beams = [];
    var targetHits = {};
    var sensorHits = {};
    var i, src, d;

    var targets = world.targets || [];
    for (i = 0; i < targets.length; i++) {
      targetHits[targets[i].id] = [0, 0, 0];
    }

    var queue = [];
    var sources = world.sources || [];
    for (i = 0; i < sources.length; i++) {
      src = sources[i];
      d = normalize(Math.cos(src.angle), Math.sin(src.angle));
      queue.push({
        x: src.x,
        y: src.y,
        dx: d.x,
        dy: d.y,
        color: src.color.slice(),
        intensity: src.intensity == null ? 1 : src.intensity,
        bounces: 0,
        skipId: null,
        skipPiece: null,
      });
    }

    var safety = 0;
    while (queue.length && beams.length < MAX_RAYS && safety < 800) {
      safety++;
      var ray = queue.shift();
      if (ray.bounces > MAX_BOUNCES) continue;
      if (maxChan(ray.color) < MIN_ENERGY) continue;

      var hit = findHit(ray, colliders);
      if (!hit) {
        var far = 1600;
        pushBeam(beams, ray, ray.x + ray.dx * far, ray.y + ray.dy * far);
        continue;
      }

      var dist = hit.t;
      var colEnd = attenuate(ray.color, dist);
      pushBeam(beams, ray, hit.x, hit.y, colEnd);

      var c = hit.collider;
      var kind = c.kind;

      if (kind === "wall" || kind === "border") {
        continue;
      }

      if (kind === "target") {
        var acc = targetHits[c.targetId];
        if (acc) {
          targetHits[c.targetId] = addColor(acc, colEnd);
        }
        continue;
      }

      if (kind === "sensor") {
        var sid = c.sensorId;
        sensorHits[sid] = addColor(sensorHits[sid] || [0, 0, 0], colEnd);
        continue;
      }

      if (kind === "mirror") {
        var r = reflect(ray.dx, ray.dy, c.nx, c.ny);
        spawn(queue, hit.x, hit.y, r.x, r.y, colEnd, ray.bounces + 1, c.id, c.pieceId);
        continue;
      }

      if (kind === "filter") {
        var tint = c.tint || [1, 0, 0];
        var filtered = mulColor(colEnd, tint);
        spawn(queue, hit.x, hit.y, ray.dx, ray.dy, filtered, ray.bounces + 1, c.id, c.pieceId);
        continue;
      }

      if (kind === "splitter") {
        var half = scaleColor(colEnd, 0.5);
        var rr = reflect(ray.dx, ray.dy, c.nx, c.ny);
        spawn(queue, hit.x, hit.y, rr.x, rr.y, half, ray.bounces + 1, c.id, c.pieceId);
        spawn(queue, hit.x, hit.y, ray.dx, ray.dy, half, ray.bounces + 1, c.id, c.pieceId);
        continue;
      }

      if (kind === "prism") {
        var spread = 0.32;
        var channels = [
          { rgb: [1, 0, 0], off: -spread },
          { rgb: [0, 1, 0], off: 0 },
          { rgb: [0, 0, 1], off: spread },
        ];
        var inward = { x: -c.nx, y: -c.ny };
        if (ray.dx * inward.x + ray.dy * inward.y < 0) {
          inward = { x: c.nx, y: c.ny };
        }
        var through = normalize(ray.dx + inward.x * 0.15, ray.dy + inward.y * 0.15);
        for (var k = 0; k < 3; k++) {
          var ch = channels[k];
          var energy = [colEnd[0] * ch.rgb[0], colEnd[1] * ch.rgb[1], colEnd[2] * ch.rgb[2]];
          if (maxChan(energy) < MIN_ENERGY) continue;
          var vd = rotateVec(through.x, through.y, ch.off);
          spawn(queue, hit.x, hit.y, vd.x, vd.y, energy, ray.bounces + 1, c.id, c.pieceId);
        }
        continue;
      }
    }

    return {
      beams: beams,
      targetHits: targetHits,
      sensorHits: sensorHits,
    };
  }

  function colorMatch(received, expected, minIntensity) {
    var recE = colorEnergy(received);
    var expE = colorEnergy(expected) || 1;
    if (recE < minIntensity) return false;
    var rn = [received[0] / recE, received[1] / recE, received[2] / recE];
    var en = [expected[0] / expE, expected[1] / expE, expected[2] / expE];
    var dist = Math.hypot(rn[0] - en[0], rn[1] - en[1], rn[2] - en[2]);
    return dist < 0.38;
  }

  function evaluate(world, trace) {
    var t = trace || propagate(world);
    var targets = world.targets || [];
    var allLit = true;
    var details = [];
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      var rec = t.targetHits[tg.id] || [0, 0, 0];
      var minI = tg.minIntensity == null ? 0.28 : tg.minIntensity;
      var ok = colorMatch(rec, tg.color, minI);
      if (!ok) allLit = false;
      details.push({
        id: tg.id,
        received: rec,
        expected: tg.color,
        ok: ok,
      });
    }
    var tripped = false;
    var sensors = world.sensors || [];
    for (i = 0; i < sensors.length; i++) {
      var s = sensors[i];
      var hitc = t.sensorHits[s.id] || [0, 0, 0];
      if (colorEnergy(hitc) > 0.05) tripped = true;
    }
    return {
      won: allLit && !tripped && targets.length > 0,
      allLit: allLit,
      sensorTripped: tripped,
      targets: details,
    };
  }

  var api = {
    EPS: EPS,
    RAY_EPS: RAY_EPS,
    MAX_BOUNCES: MAX_BOUNCES,
    lineIntersect: lineIntersect,
    reflect: reflect,
    normalize: normalize,
    rotateVec: rotateVec,
    pieceSegment: pieceSegment,
    prismVertices: prismVertices,
    pointInTriangle: pointInTriangle,
    segmentNormal: segmentNormal,
    buildColliders: buildColliders,
    propagate: propagate,
    evaluate: evaluate,
    colorMatch: colorMatch,
    colorEnergy: colorEnergy,
    maxChan: maxChan,
    attenuate: attenuate,
    clamp: clamp,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.LightweaverOptics = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
