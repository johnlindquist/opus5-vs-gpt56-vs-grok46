(function () {
  "use strict";

  var O = window.LightweaverOptics;
  var L = window.LightweaverLevels;
  var STORE_KEY = "lightweaver-lab-v1";
  var ROT_STEP = (5 * Math.PI) / 180;
  var ROT_FINE = Math.PI / 180;
  var MOVE_STEP = 4;
  var MOVE_FINE = 1;
  var GRID = 8;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d", { alpha: false });

  var state = {
    levelIndex: 0,
    level: null,
    selected: null,
    trace: null,
    verdict: null,
    moves: 0,
    undo: [],
    redo: [],
    hintStage: -1,
    dragging: null,
    rotating: null,
    hover: null,
    won: false,
    celebrate: 0,
    demo: null,
    view: { x: 0, y: 0, s: 1, pad: 28 },
    save: loadSave(),
  };

  function loadSave() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { completed: {} };
      var parsed = JSON.parse(raw);
      return parsed && parsed.completed ? parsed : { completed: {} };
    } catch (e) {
      return { completed: {} };
    }
  }

  function writeSave() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.save));
    } catch (e) {}
  }

  function pieceById(id) {
    var pieces = state.level.pieces;
    for (var i = 0; i < pieces.length; i++) if (pieces[i].id === id) return pieces[i];
    return null;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state.level.pieces));
  }

  function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > 80) state.undo.shift();
    state.redo.length = 0;
  }

  function restorePieces(pieces) {
    state.level.pieces = JSON.parse(JSON.stringify(pieces));
    if (state.selected) {
      state.selected = pieceById(state.selected.id);
    }
    recompute();
  }

  function recompute() {
    state.trace = O.propagate(state.level);
    state.verdict = O.evaluate(state.level, state.trace);
    if (state.verdict.won && !state.won && !state.suppressWin) onWin();
    syncChrome();
  }

  function onWin() {
    state.won = true;
    state.celebrate = reduced ? 0 : 1;
    var id = state.level.id;
    var prev = state.save.completed[id];
    if (!prev || state.moves < prev.bestMoves) {
      state.save.completed[id] = { bestMoves: state.moves };
      writeSave();
    }
    document.getElementById("victory").classList.add("show");
    document.getElementById("victory-moves").textContent =
      state.moves + (state.moves === 1 ? " move" : " moves");
    toast("Laboratory aligned");
    renderLevelStrip();
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 1600);
  }

  function loadLevel(index, opts) {
    opts = opts || {};
    state.levelIndex = index;
    state.level = L.getLevel(index);
    state.selected = null;
    state.moves = 0;
    state.undo = [];
    state.redo = [];
    state.hintStage = -1;
    state.won = false;
    state.celebrate = 0;
    state.dragging = null;
    state.rotating = null;
    document.getElementById("victory").classList.remove("show");
    document.getElementById("hint-text").textContent = "Press H for a staged hint. The lab will not solve itself.";
    recompute();
    renderLevelStrip();
    if (!opts.skipDemo && index === 0 && state.level.demo && !reduced) startDemo(state.level.demo);
    else state.demo = null;
    canvas.focus({ preventScroll: true });
  }

  function startDemo(demo) {
    var p = pieceById(demo.pieceId);
    if (!p) return;
    p.angle = demo.fromAngle;
    recompute();
    state.demo = {
      pieceId: demo.pieceId,
      from: demo.fromAngle,
      to: demo.toAngle,
      t0: performance.now(),
      dur: demo.duration || 900,
    };
  }

  function cancelDemo() {
    state.demo = null;
  }

  function rgbStr(c, a) {
    var r = Math.round(O.clamp(c[0], 0, 1) * 255);
    var g = Math.round(O.clamp(c[1], 0, 1) * 255);
    var b = Math.round(O.clamp(c[2], 0, 1) * 255);
    return "rgba(" + r + "," + g + "," + b + "," + (a == null ? 1 : a) + ")";
  }

  function fitView() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(320, rect.width);
    var h = Math.max(320, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pad = 36;
    var availW = w - pad * 2;
    var availH = h - pad * 2;
    var s = Math.min(availW / L.WORLD_W, availH / L.WORLD_H);
    state.view.s = s;
    state.view.x = (w - L.WORLD_W * s) / 2;
    state.view.y = (h - L.WORLD_H * s) / 2;
    state.view.cssW = w;
    state.view.cssH = h;
  }

  function w2s(x, y) {
    return { x: state.view.x + x * state.view.s, y: state.view.y + y * state.view.s };
  }

  function s2w(x, y) {
    return { x: (x - state.view.x) / state.view.s, y: (y - state.view.y) / state.view.s };
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    var vx = bx - ax;
    var vy = by - ay;
    var l2 = vx * vx + vy * vy;
    var t = l2 < 1e-8 ? 0 : O.clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    var x = ax + t * vx;
    var y = ay + t * vy;
    return Math.hypot(px - x, py - y);
  }

  function pickPiece(wx, wy) {
    var best = null;
    var bestD = 18;
    var pieces = state.level.pieces;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var d;
      if (p.type === "prism") {
        d = Math.hypot(wx - p.x, wy - p.y);
        if (d < (p.radius || 46) + 8 && d < bestD + 20) {
          best = p;
          bestD = d;
        }
        continue;
      }
      var seg = O.pieceSegment(p);
      d = distToSeg(wx, wy, seg.ax, seg.ay, seg.bx, seg.by);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function handleAt(p, which) {
    var r = 54;
    var a = p.angle + (which === 0 ? 0 : Math.PI);
    return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
  }

  function pickHandle(wx, wy, p) {
    if (!p || !p.rotatable) return -1;
    for (var i = 0; i < 2; i++) {
      var h = handleAt(p, i);
      if (Math.hypot(wx - h.x, wy - h.y) < 12) return i;
    }
    return -1;
  }

  function drawBoard() {
    var w = state.view.cssW;
    var h = state.view.cssH;
    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, w, h);

    var origin = w2s(0, 0);
    var corner = w2s(L.WORLD_W, L.WORLD_H);
    var bw = corner.x - origin.x;
    var bh = corner.y - origin.y;

    var g = ctx.createRadialGradient(origin.x + bw * 0.5, origin.y + bh * 0.35, 20, origin.x + bw * 0.5, origin.y + bh * 0.5, bw * 0.72);
    g.addColorStop(0, "#141c2a");
    g.addColorStop(1, "#080a10");
    ctx.fillStyle = g;
    ctx.fillRect(origin.x, origin.y, bw, bh);

    ctx.strokeStyle = "rgba(201,163,106,0.35)";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(origin.x + 0.5, origin.y + 0.5, bw - 1, bh - 1);
    ctx.strokeStyle = "rgba(201,163,106,0.12)";
    ctx.strokeRect(origin.x + 6.5, origin.y + 6.5, bw - 13, bh - 13);

    ctx.save();
    ctx.beginPath();
    ctx.rect(origin.x, origin.y, bw, bh);
    ctx.clip();

    drawGrid(origin, bw, bh);
    drawWalls();
    drawSensors();
    drawBeams();
    drawSources();
    drawTargets();
    drawPieces();
    if (state.selected) drawSelection(state.selected);
    if (state.celebrate > 0 && !reduced) drawCelebrate();

    ctx.restore();
  }

  function drawGrid(origin, bw, bh) {
    ctx.save();
    ctx.strokeStyle = "rgba(140, 160, 190, 0.045)";
    ctx.lineWidth = 1;
    var step = 40 * state.view.s;
    var x, y;
    for (x = origin.x; x < origin.x + bw; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, origin.y);
      ctx.lineTo(x, origin.y + bh);
      ctx.stroke();
    }
    for (y = origin.y; y < origin.y + bh; y += step) {
      ctx.beginPath();
      ctx.moveTo(origin.x, y);
      ctx.lineTo(origin.x + bw, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWalls() {
    var walls = state.level.walls || [];
    ctx.lineCap = "butt";
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var a = w2s(w.x1, w.y1);
      var b = w2s(w.x2, w.y2);
      ctx.strokeStyle = "#2a241c";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#b0894a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawSensors() {
    var sensors = state.level.sensors || [];
    var tripped = state.verdict && state.verdict.sensorTripped;
    for (var i = 0; i < sensors.length; i++) {
      var s = sensors[i];
      var p = w2s(s.x, s.y);
      var rw = ((s.w || 28) / 2) * state.view.s;
      var rh = ((s.h || 28) / 2) * state.view.s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = tripped ? "#ff6b73" : "rgba(255,90,98,0.85)";
      ctx.fillStyle = tripped ? "rgba(255,70,80,0.28)" : "rgba(255,70,80,0.1)";
      ctx.lineWidth = 1.6;
      octagon(ctx, rw + 2, rh + 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-rw * 0.5, -rh * 0.5);
      ctx.lineTo(rw * 0.5, rh * 0.5);
      ctx.moveTo(rw * 0.5, -rh * 0.5);
      ctx.lineTo(-rw * 0.5, rh * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function octagon(c, rx, ry) {
    c.beginPath();
    var k = 0.41;
    c.moveTo(-rx * k, -ry);
    c.lineTo(rx * k, -ry);
    c.lineTo(rx, -ry * k);
    c.lineTo(rx, ry * k);
    c.lineTo(rx * k, ry);
    c.lineTo(-rx * k, ry);
    c.lineTo(-rx, ry * k);
    c.lineTo(-rx, -ry * k);
    c.closePath();
  }

  function drawBeams() {
    var beams = (state.trace && state.trace.beams) || [];
    var glow = reduced ? 0.45 : 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < beams.length; i++) {
        var b = beams[i];
        var a = w2s(b.x1, b.y1);
        var c = w2s(b.x2, b.y2);
        var energy = O.maxChan(b.color);
        var width, alpha;
        if (pass === 0) {
          width = (18 + energy * 10) * glow;
          alpha = 0.07 * energy * glow;
        } else if (pass === 1) {
          width = 6 + energy * 4;
          alpha = 0.28 * energy;
        } else {
          width = 1.7;
          alpha = 0.55 + energy * 0.4;
        }
        var grd = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
        grd.addColorStop(0, rgbStr(b.color, alpha));
        grd.addColorStop(1, rgbStr(b.colorEnd || b.color, alpha * 0.72));
        ctx.strokeStyle = grd;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSources() {
    var srcs = state.level.sources || [];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      var p = w2s(s.x, s.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = "#1b1f28";
      ctx.strokeStyle = rgbStr(s.color, 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-16, -10, 22, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgbStr(s.color, 0.95);
      ctx.beginPath();
      ctx.arc(8, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!reduced) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgbStr(s.color, 0.18);
        ctx.beginPath();
        ctx.arc(10, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawTargets() {
    var tgs = state.level.targets || [];
    var t = performance.now() / 1000;
    for (var i = 0; i < tgs.length; i++) {
      var tg = tgs[i];
      var p = w2s(tg.x, tg.y);
      var rec = state.trace ? state.trace.targetHits[tg.id] || [0, 0, 0] : [0, 0, 0];
      var ok = state.verdict && state.verdict.targets[i] && state.verdict.targets[i].ok;
      var r = (tg.radius || 22) * state.view.s;
      var pulse = reduced ? 0 : Math.sin(t * 3 + i) * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = rgbStr(tg.color, 0.85);
      ctx.lineWidth = 1.4;
      for (var ring = 3; ring >= 1; ring--) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.42 + ring * 0.22 + (ok ? pulse : 0)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = rgbStr(ok ? rec : tg.color, ok ? 0.55 : 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      if (ok) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgbStr(tg.color, 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.9 + pulse), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPieces() {
    var pieces = state.level.pieces;
    for (var i = 0; i < pieces.length; i++) drawPiece(pieces[i], pieces[i] === state.hover);
  }

  function drawPiece(p, hover) {
    if (p.type === "prism") {
      drawPrism(p, hover);
      return;
    }
    var seg = O.pieceSegment(p);
    var a = w2s(seg.ax, seg.ay);
    var b = w2s(seg.bx, seg.by);
    ctx.save();
    ctx.lineCap = "round";
    if (p.type === "mirror") {
      ctx.strokeStyle = hover ? "#f2efe8" : "#d9d4cc";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#8a7a55";
      ctx.lineWidth = 2;
      ctx.stroke();
      cap(a);
      cap(b);
    } else if (p.type === "filter") {
      ctx.strokeStyle = rgbStr(p.tint || [1, 0, 0], 0.18);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = rgbStr(p.tint || [1, 0, 0], 0.85);
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (p.type === "splitter") {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "#c5d2e0";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(230,240,255,0.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      diamond(w2s(p.x, p.y), 6);
    }
    if (!p.movable) {
      ctx.fillStyle = "rgba(201,163,106,0.7)";
      var c = w2s(p.x, p.y);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function cap(pt) {
    ctx.fillStyle = "#c9a36a";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function diamond(p, r) {
    ctx.fillStyle = "#e8f1ff";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawPrism(p, hover) {
    var verts = O.prismVertices(p);
    ctx.save();
    ctx.beginPath();
    var s0 = w2s(verts[0].x, verts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (var i = 1; i < 3; i++) {
      var s = w2s(verts[i].x, verts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    var c = w2s(p.x, p.y);
    var grd = ctx.createLinearGradient(c.x - 30, c.y - 20, c.x + 30, c.y + 24);
    grd.addColorStop(0, "rgba(255,80,90,0.22)");
    grd.addColorStop(0.5, "rgba(90,255,140,0.16)");
    grd.addColorStop(1, "rgba(80,140,255,0.22)");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = hover ? "#f7f3ea" : "rgba(220,230,240,0.8)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawSelection(p) {
    var c = w2s(p.x, p.y);
    ctx.save();
    ctx.strokeStyle = "rgba(240, 217, 168, 0.85)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 58 * state.view.s * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (p.rotatable) {
      for (var i = 0; i < 2; i++) {
        var h = handleAt(p, i);
        var hs = w2s(h.x, h.y);
        ctx.fillStyle = "#f0d9a8";
        ctx.beginPath();
        ctx.arc(hs.x, hs.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a2e16";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCelebrate() {
    var t = state.celebrate;
    var origin = w2s(L.WORLD_W / 2, L.WORLD_H / 2);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 18; i++) {
      var ang = (i / 18) * Math.PI * 2 + t * 2;
      var rad = 40 + t * 120;
      ctx.fillStyle = rgbStr([0.8, 0.7, 0.4], 0.12 * (1 - t));
      ctx.beginPath();
      ctx.arc(origin.x + Math.cos(ang) * rad, origin.y + Math.sin(ang) * rad, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function syncChrome() {
    document.getElementById("level-name").textContent = state.level.name;
    document.getElementById("level-sub").textContent = state.level.subtitle;
    document.getElementById("objective").textContent = state.level.objective;
    document.getElementById("move-count").textContent = String(state.moves);
    var best = state.save.completed[state.level.id];
    document.getElementById("best-count").textContent = best ? String(best.bestMoves) : "—";
    document.getElementById("btn-undo").disabled = state.undo.length === 0;
    document.getElementById("btn-redo").disabled = state.redo.length === 0;

    var box = document.getElementById("targets");
    box.innerHTML = "";
    var tgs = state.level.targets;
    for (var i = 0; i < tgs.length; i++) {
      var row = document.createElement("div");
      row.className = "target-row";
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = rgbStr(tgs[i].color, 1);
      sw.style.color = rgbStr(tgs[i].color, 1);
      var name = document.createElement("span");
      name.textContent = tgs[i].label || tgs[i].id;
      var pill = document.createElement("span");
      var ok = state.verdict && state.verdict.targets[i] && state.verdict.targets[i].ok;
      pill.className = "pill " + (ok ? "ok" : "bad");
      pill.textContent = ok ? "locked" : "dark";
      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(pill);
      box.appendChild(row);
    }
    var alarm = document.getElementById("sensor-status");
    if ((state.level.sensors || []).length) {
      alarm.hidden = false;
      alarm.textContent = state.verdict && state.verdict.sensorTripped ? "Sensor tripped — path illegal" : "Forbidden sensor is dark";
      alarm.style.color = state.verdict && state.verdict.sensorTripped ? "#ff6b73" : "#8b93a3";
    } else {
      alarm.hidden = true;
    }
  }

  function renderLevelStrip() {
    var strip = document.getElementById("levels");
    var buttons = strip.querySelectorAll("button[data-level]");
    for (var i = 0; i < buttons.length; i++) {
      var idx = Number(buttons[i].getAttribute("data-level"));
      var id = String(idx + 1);
      buttons[i].setAttribute("aria-current", idx === state.levelIndex ? "true" : "false");
      buttons[i].classList.toggle("done", !!state.save.completed[id]);
    }
  }

  function eventToWorld(ev) {
    var rect = canvas.getBoundingClientRect();
    return s2w(ev.clientX - rect.left, ev.clientY - rect.top);
  }

  function snapPos(p) {
    p.x = Math.round(p.x / GRID) * GRID;
    p.y = Math.round(p.y / GRID) * GRID;
  }

  function clampPiece(p) {
    var m = 28;
    p.x = O.clamp(p.x, m, L.WORLD_W - m);
    p.y = O.clamp(p.y, m, L.WORLD_H - m);
  }

  function applyMove(p, dx, dy) {
    if (!p.movable) return;
    p.x += dx;
    p.y += dy;
    clampPiece(p);
  }

  function applyRotate(p, da) {
    if (!p.rotatable) return;
    p.angle += da;
  }

  function commitAction() {
    state.moves += 1;
    recompute();
  }

  canvas.addEventListener("pointerdown", function (ev) {
    cancelDemo();
    canvas.setPointerCapture(ev.pointerId);
    var w = eventToWorld(ev);
    var p = state.selected;
    var h = p ? pickHandle(w.x, w.y, p) : -1;
    if (h >= 0) {
      pushUndo();
      state.rotating = {
        id: p.id,
        startAngle: p.angle,
        startMouse: Math.atan2(w.y - p.y, w.x - p.x),
      };
      return;
    }
    p = pickPiece(w.x, w.y);
    state.selected = p;
    if (p && p.movable) {
      pushUndo();
      state.dragging = { id: p.id, ox: w.x - p.x, oy: w.y - p.y, sx: p.x, sy: p.y, moved: false };
    }
    recompute();
  });

  canvas.addEventListener("pointermove", function (ev) {
    var w = eventToWorld(ev);
    state.hover = pickPiece(w.x, w.y);
    if (state.rotating) {
      var p = pieceById(state.rotating.id);
      var ang = Math.atan2(w.y - p.y, w.x - p.x);
      p.angle = state.rotating.startAngle + (ang - state.rotating.startMouse);
      if (!ev.shiftKey) p.angle = Math.round(p.angle / ROT_STEP) * ROT_STEP;
      recompute();
      return;
    }
    if (state.dragging) {
      var q = pieceById(state.dragging.id);
      q.x = w.x - state.dragging.ox;
      q.y = w.y - state.dragging.oy;
      if (!ev.shiftKey) snapPos(q);
      clampPiece(q);
      if (Math.hypot(q.x - state.dragging.sx, q.y - state.dragging.sy) > 0.5) state.dragging.moved = true;
      recompute();
    }
    canvas.style.cursor = state.hover && state.hover.movable ? "grab" : state.hover ? "pointer" : "crosshair";
  });

  function endPointer() {
    if (state.dragging || state.rotating) {
      var changed = true;
      if (state.dragging && !state.dragging.moved && state.undo.length) {
        var last = state.undo[state.undo.length - 1];
        var p = pieceById(state.dragging.id);
        var orig = last.filter(function (x) { return x.id === p.id; })[0];
        if (orig && orig.x === p.x && orig.y === p.y) changed = false;
      }
      if (changed) commitAction();
      else {
        state.undo.pop();
        recompute();
      }
    }
    state.dragging = null;
    state.rotating = null;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", function (ev) {
    if (!state.selected || !state.selected.rotatable) return;
    ev.preventDefault();
    cancelDemo();
    pushUndo();
    var dir = ev.deltaY > 0 ? 1 : -1;
    applyRotate(state.selected, dir * (ev.shiftKey ? ROT_FINE : ROT_STEP));
    commitAction();
  }, { passive: false });

  function onKey(ev) {
    var k = ev.key;
    if (k >= "1" && k <= "5") {
      loadLevel(Number(k) - 1);
      ev.preventDefault();
      return;
    }
    if (k === "z" || k === "Z") {
      undo();
      ev.preventDefault();
      return;
    }
    if (k === "y" || k === "Y") {
      redo();
      ev.preventDefault();
      return;
    }
    if (k === "r" || k === "R") {
      loadLevel(state.levelIndex, { skipDemo: true });
      toast("Level reset");
      ev.preventDefault();
      return;
    }
    if (k === "h" || k === "H") {
      hint();
      ev.preventDefault();
      return;
    }
    if (k === "Escape") {
      state.selected = null;
      document.getElementById("victory").classList.remove("show");
      recompute();
      return;
    }
    if (k === "Tab") {
      var list = state.level.pieces.filter(function (p) { return p.movable || p.rotatable; });
      if (!list.length) return;
      var idx = list.indexOf(state.selected);
      idx = ev.shiftKey ? idx - 1 : idx + 1;
      if (idx < 0) idx = list.length - 1;
      if (idx >= list.length) idx = 0;
      state.selected = list[idx];
      recompute();
      ev.preventDefault();
      return;
    }
    if (!state.selected) return;
    if (k === "q" || k === "Q") {
      cancelDemo();
      pushUndo();
      applyRotate(state.selected, ev.shiftKey ? -ROT_FINE : -ROT_STEP);
      commitAction();
      ev.preventDefault();
    } else if (k === "e" || k === "E") {
      cancelDemo();
      pushUndo();
      applyRotate(state.selected, ev.shiftKey ? ROT_FINE : ROT_STEP);
      commitAction();
      ev.preventDefault();
    } else if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      if (!state.selected.movable) return;
      cancelDemo();
      pushUndo();
      var step = ev.shiftKey ? MOVE_FINE : MOVE_STEP;
      if (k === "ArrowLeft") applyMove(state.selected, -step, 0);
      if (k === "ArrowRight") applyMove(state.selected, step, 0);
      if (k === "ArrowUp") applyMove(state.selected, 0, -step);
      if (k === "ArrowDown") applyMove(state.selected, 0, step);
      commitAction();
      ev.preventDefault();
    }
  }

  window.addEventListener("keydown", onKey);

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    state.suppressWin = true;
    restorePieces(state.undo.pop());
    state.suppressWin = false;
    state.moves = Math.max(0, state.moves - 1);
    state.won = !!(state.verdict && state.verdict.won);
    if (!state.won) document.getElementById("victory").classList.remove("show");
    syncChrome();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    restorePieces(state.redo.pop());
    state.moves += 1;
    syncChrome();
  }

  function hint() {
    var stages = state.level.hintStages || [];
    if (!stages.length) return;
    state.hintStage = Math.min(state.hintStage + 1, stages.length - 1);
    document.getElementById("hint-text").textContent = "Hint " + (state.hintStage + 1) + "/" + stages.length + " — " + stages[state.hintStage];
    var focus = ["m-red-2", "mix-top", "split-a", "prism-1", "m5-a"][state.levelIndex];
    if (focus) state.selected = pieceById(focus) || state.selected;
    recompute();
    toast("Hint " + (state.hintStage + 1));
  }

  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  document.getElementById("btn-reset").addEventListener("click", function () {
    loadLevel(state.levelIndex, { skipDemo: true });
    toast("Level reset");
  });
  document.getElementById("btn-hint").addEventListener("click", hint);
  document.getElementById("btn-next").addEventListener("click", function () {
    loadLevel((state.levelIndex + 1) % L.COUNT);
  });

  var strip = document.getElementById("levels");
  strip.querySelectorAll("button[data-level]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      loadLevel(Number(btn.getAttribute("data-level")));
    });
  });

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.demo) {
      var u = O.clamp((now - state.demo.t0) / state.demo.dur, 0, 1);
      var p = pieceById(state.demo.pieceId);
      if (p) {
        var e = 1 - Math.pow(1 - u, 3);
        p.angle = state.demo.from + (state.demo.to - state.demo.from) * e;
        recompute();
      }
      if (u >= 1) state.demo = null;
    }
    if (state.celebrate > 0 && !reduced) {
      state.celebrate = Math.min(1.2, state.celebrate + dt * 0.85);
      if (state.celebrate > 1.15) state.celebrate = 1.15;
    }
    drawBoard();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", function () {
    fitView();
  });

  fitView();
  loadLevel(0);
  requestAnimationFrame(frame);
})();
