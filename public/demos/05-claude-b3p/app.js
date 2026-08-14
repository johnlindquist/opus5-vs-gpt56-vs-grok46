/* Lightweaver — presentation and interaction.
 * Owns the canvas, the input model, history and persistence.
 * All optics live in engine.js; this file never computes a reflection.
 */
(function () {
  'use strict';

  var E = window.LW, DATA = window.LW_LEVELS;
  var W = E.BOARD_W, H = E.BOARD_H;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STORE_KEY = 'lightweaver.progress.v1';

  // ------------------------------------------------------------------ state
  var S = {
    index: 0,
    level: null,
    trace: null,
    verdict: null,
    history: [],
    hIndex: 0,
    moves: 0,
    hintStage: 0,
    selected: null,       // piece id
    drag: null,           // {mode:'move'|'spin', id, ...}
    celebrate: -1,        // timestamp of victory
    particles: [],
    demo: null,
    lastTag: '', lastTagTime: 0,
    progress: loadProgress()
  };

  var cv = document.getElementById('board');
  var ctx = cv.getContext('2d', { alpha: false });
  var stage = document.getElementById('stage');
  var scale = 1;

  // ------------------------------------------------------------ persistence
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S.progress)); } catch (err) { /* file:// or private mode */ }
  }

  // ------------------------------------------------------------------ level
  function loadLevel(i, opts) {
    opts = opts || {};
    S.index = ((i % DATA.LEVELS.length) + DATA.LEVELS.length) % DATA.LEVELS.length;
    S.level = DATA.clone(DATA.LEVELS[S.index]);
    S.history = [snapshot()];
    S.hIndex = 0;
    S.moves = 0;
    S.hintStage = 0;
    S.selected = firstInteractive();
    S.celebrate = -1;
    S.particles.length = 0;
    S.demo = null;
    S.lastTag = '';
    hideVictory();
    retrace();
    syncChrome();
    if (!opts.silent) toast(S.level.name + ' — ' + interactiveCount() + ' pieces in play');
    if (S.level.demo && !opts.noDemo) queueDemo();
  }

  function interactive() {
    return S.level.pieces.filter(function (p) { return p.move || p.spin; });
  }
  function interactiveCount() { return interactive().length; }
  function firstInteractive() {
    var list = interactive();
    return list.length ? list[0].id : null;
  }
  function byId(id) {
    for (var i = 0; i < S.level.pieces.length; i++) if (S.level.pieces[i].id === id) return S.level.pieces[i];
    return null;
  }

  function snapshot() {
    return S.level.pieces.map(function (p) {
      return { id: p.id, x: p.x, y: p.y, angle: p.angle || 0 };
    });
  }
  function applySnapshot(snap) {
    for (var i = 0; i < snap.length; i++) {
      var p = byId(snap[i].id);
      if (!p) continue;
      p.x = snap[i].x; p.y = snap[i].y;
      if (p.angle != null) p.angle = snap[i].angle;
    }
  }
  function sameSnapshot(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (Math.abs(a[i].x - b[i].x) > 1e-6 || Math.abs(a[i].y - b[i].y) > 1e-6 ||
          Math.abs(a[i].angle - b[i].angle) > 1e-6) return false;
    }
    return true;
  }

  /**
   * Record the current arrangement. `tag` lets a burst of keyboard nudges on
   * one piece collapse into a single move instead of one move per keypress.
   */
  function commit(tag) {
    var snap = snapshot();
    if (sameSnapshot(snap, S.history[S.hIndex])) return;
    var now = Date.now();
    var coalesce = tag && tag === S.lastTag && (now - S.lastTagTime) < 700 && S.hIndex > 0;
    if (coalesce) {
      S.history[S.hIndex] = snap;
    } else {
      S.history.length = S.hIndex + 1;
      S.history.push(snap);
      S.hIndex++;
      S.moves++;
    }
    S.lastTag = tag || '';
    S.lastTagTime = now;
    retrace();
    syncChrome();
  }

  function undo() {
    if (S.hIndex === 0) { toast('Nothing to undo'); return; }
    S.hIndex--; applySnapshot(S.history[S.hIndex]);
    S.moves++; S.lastTag = '';
    retrace(); syncChrome(); toast('Undo');
  }
  function redo() {
    if (S.hIndex >= S.history.length - 1) { toast('Nothing to redo'); return; }
    S.hIndex++; applySnapshot(S.history[S.hIndex]);
    S.moves++; S.lastTag = '';
    retrace(); syncChrome(); toast('Redo');
  }

  // ------------------------------------------------------------------ trace
  function retrace() {
    S.trace = E.trace(S.level);
    var wasSolved = S.verdict && S.verdict.solved;
    S.verdict = E.evaluate(S.level, S.trace);
    if (S.verdict.solved && !wasSolved) onSolved();
    if (!S.verdict.solved && wasSolved) hideVictory();
  }

  function onSolved() {
    var id = S.level.id;
    var rec = S.progress[id] || { best: Infinity };
    var best = Math.min(rec.best == null ? Infinity : rec.best, S.moves);
    S.progress[id] = { solved: true, best: best };
    saveProgress();
    S.celebrate = performance.now();
    if (!reduceMotion) spawnParticles();
    showVictory(best);
    syncChrome();
  }

  function spawnParticles() {
    S.particles.length = 0;
    var targets = S.level.pieces.filter(function (p) { return p.type === 'target'; });
    for (var t = 0; t < targets.length; t++) {
      var tg = targets[t];
      for (var i = 0; i < 46; i++) {
        var a = (i / 46) * Math.PI * 2 + t;
        var sp = 60 + ((i * 37) % 130);
        S.particles.push({
          x: tg.x, y: tg.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          life: 1, col: tg.color
        });
      }
    }
  }

  // ------------------------------------------------------------------ chrome
  var el = {
    strip: document.getElementById('levelStrip'),
    name: document.getElementById('lvName'),
    obj: document.getElementById('lvObjective'),
    targets: document.getElementById('targetList'),
    alarm: document.getElementById('alarm'),
    moves: document.getElementById('statMoves'),
    best: document.getElementById('statBest'),
    solved: document.getElementById('statSolved'),
    selName: document.getElementById('selName'),
    selPos: document.getElementById('selPos'),
    selAngle: document.getElementById('selAngle'),
    hint: document.getElementById('hintText'),
    toast: document.getElementById('toast'),
    victory: document.getElementById('victory'),
    vMoves: document.getElementById('vMoves'),
    vBest: document.getElementById('vBest'),
    vTitle: document.getElementById('victoryTitle'),
    vLine: document.getElementById('victoryLine')
  };

  var LABELS = {
    mirror: 'Mirror', wall: 'Wall', filter: 'Filter', splitter: 'Splitter',
    prism: 'Prism', source: 'Source', target: 'Target', sensor: 'Watcher'
  };
  function pieceLabel(p) {
    if (!p) return 'none';
    var extra = p.type === 'filter' ? ' ' + p.channel.toUpperCase() : '';
    return LABELS[p.type] + extra + ' · ' + p.id;
  }
  function colorName(c) {
    if (c[0] && c[1] && c[2]) return 'White';
    if (c[0] && c[1]) return 'Amber';
    if (c[0] && c[2]) return 'Magenta';
    if (c[1] && c[2]) return 'Cyan';
    if (c[0]) return 'Red';
    if (c[1]) return 'Green';
    return 'Blue';
  }
  function cssColor(c, a) {
    var r = Math.min(255, c[0] * 255 + 34) | 0;
    var g = Math.min(255, c[1] * 246 + 30) | 0;
    var b = Math.min(255, c[2] * 255 + 44) | 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function buildStrip() {
    el.strip.innerHTML = '';
    DATA.LEVELS.forEach(function (lv, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = lv.id;
      b.title = lv.name;
      b.setAttribute('aria-label', 'Level ' + lv.id + ': ' + lv.name);
      b.addEventListener('click', function () { loadLevel(i); cv.focus(); });
      el.strip.appendChild(b);
    });
  }

  function syncChrome() {
    var lv = S.level;
    el.name.textContent = lv.id + '. ' + lv.name;
    el.obj.textContent = lv.objective;

    var kids = el.strip.children;
    for (var i = 0; i < kids.length; i++) {
      var rec = S.progress[DATA.LEVELS[i].id];
      kids[i].setAttribute('aria-current', i === S.index ? 'true' : 'false');
      kids[i].classList.toggle('done', !!(rec && rec.solved));
    }

    el.targets.innerHTML = '';
    S.verdict.targets.forEach(function (t) {
      var p = byId(t.id);
      var li = document.createElement('li');
      li.className = t.lit ? 'lit' : '';
      li.style.color = cssColor(p.color, 1);
      var frac = Math.max(0, Math.min(1, t.lum / Math.max(t.need, 0.001)));
      li.innerHTML =
        '<span class="dot"></span>' +
        '<span class="nm">' + colorName(p.color) + ' plate</span>' +
        '<span class="meter"><i style="width:' + (frac * 100).toFixed(0) + '%"></i></span>';
      li.title = 'radiance ' + t.lum.toFixed(2) + ' / needs ' + t.need.toFixed(2) +
                 ' · hue match ' + (t.match * 100).toFixed(0) + '%';
      el.targets.appendChild(li);
    });
    el.alarm.hidden = !S.verdict.violated;

    el.moves.textContent = S.moves;
    var rec = S.progress[lv.id];
    el.best.textContent = rec && rec.best != null && isFinite(rec.best) ? rec.best : '—';
    var done = DATA.LEVELS.filter(function (l) { var r = S.progress[l.id]; return r && r.solved; }).length;
    el.solved.textContent = done + '/' + DATA.LEVELS.length;

    var sel = byId(S.selected);
    el.selName.textContent = pieceLabel(sel);
    el.selPos.textContent = sel ? Math.round(sel.x) + ', ' + Math.round(sel.y) : '—';
    el.selAngle.textContent = sel && sel.angle != null ? (((sel.angle % 360) + 360) % 360).toFixed(0) + '°' : '—';
  }

  var toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2000);
  }

  function showVictory(best) {
    el.vMoves.textContent = S.moves;
    el.vBest.textContent = isFinite(best) ? best : S.moves;
    el.vTitle.textContent = S.level.name + ' solved';
    el.vLine.textContent = S.verdict.targets.length +
      (S.verdict.targets.length === 1 ? ' plate at full radiance.' : ' plates at full radiance.');
    el.victory.hidden = false;
  }
  function hideVictory() { el.victory.hidden = true; }

  // ------------------------------------------------------------------- hint
  function hint() {
    S.hintStage = Math.min(3, S.hintStage + 1);
    el.hint.classList.add('active');
    el.hint.textContent = 'Hint ' + S.hintStage + '/3 — ' + S.level.hints[S.hintStage - 1];
    if (S.hintStage === 2 && S.level.hintPiece) toast('Highlighting ' + pieceLabel(byId(S.level.hintPiece)));
    if (S.hintStage === 3) toast('Ghost overlay shown — you still have to place it');
  }

  // ------------------------------------------------------------------- demo
  function queueDemo() {
    var p = byId(S.level.demo.piece);
    if (!p) return;
    // Under reduced motion the move still happens — it just snaps instead of
    // sweeping, so the board is never mid-tween.
    S.demo = {
      piece: p, from: p.angle, to: S.level.demo.angle,
      start: performance.now() + 1100, dur: reduceMotion ? 1 : 640
    };
  }
  function cancelDemo() {
    if (S.demo) { S.demo = null; }
  }
  function stepDemo(now) {
    if (!S.demo) return;
    var d = S.demo;
    if (now < d.start) return;
    var k = Math.min(1, (now - d.start) / d.dur);
    var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    d.piece.angle = d.from + (d.to - d.from) * e;
    if (k >= 1) {
      S.demo = null;
      commit('demo');
      toast('Auto-demo: rotated ' + pieceLabel(d.piece) + ' — your turn');
    } else {
      retrace();
    }
  }

  // ------------------------------------------------------------------ layout
  function resize() {
    var pad = 18;
    var aw = stage.clientWidth - pad * 2;
    var ah = stage.clientHeight - pad * 2;
    scale = Math.max(0.2, Math.min(aw / W, ah / H));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = (W * scale) + 'px';
    cv.style.height = (H * scale) + 'px';
    cv.width = Math.round(W * scale * dpr);
    cv.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function toLogical(ev) {
    var r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale };
  }

  // ----------------------------------------------------------------- picking
  function distToSegment(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay;
    var L2 = vx * vx + vy * vy;
    var t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  function handlePos(p) {
    var d = (p.type === 'prism' ? p.size : p.len / 2) + 30;
    var a = E.rad(p.angle || 0);
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
  }

  function pick(pt) {
    var list = interactive();
    // Handles win over bodies so a knob near another piece stays grabbable.
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      if (!p.spin) continue;
      var h = handlePos(p);
      if (Math.hypot(pt.x - h.x, pt.y - h.y) < 16) return { piece: p, mode: 'spin' };
    }
    for (var j = list.length - 1; j >= 0; j--) {
      var q = list[j];
      if (q.type === 'prism') {
        if (Math.hypot(pt.x - q.x, pt.y - q.y) < q.size * 0.85) return { piece: q, mode: q.move ? 'move' : 'spin' };
      } else {
        var e = E.pieceEndpoints(q);
        if (distToSegment(pt.x, pt.y, e[0], e[1], e[2], e[3]) < 16) {
          return { piece: q, mode: q.move ? 'move' : 'spin' };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ input
  cv.addEventListener('pointerdown', function (ev) {
    cv.focus();
    cancelDemo();
    var pt = toLogical(ev);
    var hit = pick(pt);
    if (!hit) { S.selected = null; syncChrome(); draw(); return; }
    S.selected = hit.piece.id;
    cv.setPointerCapture(ev.pointerId);
    S.drag = {
      mode: hit.mode, piece: hit.piece,
      ox: pt.x - hit.piece.x, oy: pt.y - hit.piece.y,
      a0: Math.atan2(pt.y - hit.piece.y, pt.x - hit.piece.x) - E.rad(hit.piece.angle || 0),
      before: snapshot()
    };
    syncChrome(); draw();
    ev.preventDefault();
  });

  cv.addEventListener('pointermove', function (ev) {
    if (!S.drag) {
      var hit = pick(toLogical(ev));
      cv.style.cursor = hit ? (hit.mode === 'spin' ? 'grab' : 'move') : 'crosshair';
      return;
    }
    var pt = toLogical(ev);
    var p = S.drag.piece;
    if (S.drag.mode === 'move') {
      var nx = pt.x - S.drag.ox, ny = pt.y - S.drag.oy;
      if (!ev.altKey) { nx = Math.round(nx / 5) * 5; ny = Math.round(ny / 5) * 5; }
      p.x = E.clamp(nx, 40, W - 40);
      p.y = E.clamp(ny, 40, H - 40);
    } else {
      var a = Math.atan2(pt.y - p.y, pt.x - p.x) - S.drag.a0;
      var deg = a * 180 / Math.PI;
      var step = ev.shiftKey ? 1 : 5;
      p.angle = Math.round(deg / step) * step;
    }
    retrace(); syncChrome();
    ev.preventDefault();
  });

  function endDrag(ev) {
    if (!S.drag) return;
    var moved = !sameSnapshot(snapshot(), S.drag.before);
    S.drag = null;
    if (moved) commit(null);
    if (ev && cv.hasPointerCapture && ev.pointerId != null) {
      try { cv.releasePointerCapture(ev.pointerId); } catch (err) { /* already released */ }
    }
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  cv.addEventListener('wheel', function (ev) {
    var hit = pick(toLogical(ev));
    if (!hit || !hit.piece.spin) return;
    cancelDemo();
    S.selected = hit.piece.id;
    var step = ev.shiftKey ? 1 : 5;
    hit.piece.angle = (hit.piece.angle || 0) + (ev.deltaY > 0 ? step : -step);
    retrace(); commit('wheel:' + hit.piece.id);
    ev.preventDefault();
  }, { passive: false });

  function cycleSelection(dir) {
    var list = interactive();
    if (!list.length) return;
    var i = list.findIndex(function (p) { return p.id === S.selected; });
    i = (i + dir + list.length) % list.length;
    S.selected = list[i].id;
    syncChrome();
    toast('Selected ' + pieceLabel(list[i]));
  }

  window.addEventListener('keydown', function (ev) {
    var tag = ev.target && ev.target.tagName;
    if (tag === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) return;
    var k = ev.key;

    if (k >= '1' && k <= '5') { cancelDemo(); loadLevel(Number(k) - 1); ev.preventDefault(); return; }

    switch (k.toLowerCase()) {
      case 'z': cancelDemo(); undo(); ev.preventDefault(); return;
      case 'y': cancelDemo(); redo(); ev.preventDefault(); return;
      case 'r': cancelDemo(); loadLevel(S.index, { noDemo: true }); toast('Level reset'); ev.preventDefault(); return;
      case 'h': cancelDemo(); hint(); ev.preventDefault(); return;
    }

    if (k === 'Tab') { cycleSelection(ev.shiftKey ? -1 : 1); ev.preventDefault(); return; }

    var p = byId(S.selected);
    if (!p) return;

    if (k.toLowerCase() === 'q' || k.toLowerCase() === 'e') {
      if (!p.spin) { toast(pieceLabel(p) + ' does not rotate'); return; }
      cancelDemo();
      var step = ev.shiftKey ? 5 : 15;
      p.angle = (p.angle || 0) + (k.toLowerCase() === 'q' ? -step : step);
      retrace(); commit('rot:' + p.id);
      ev.preventDefault(); return;
    }

    var dx = 0, dy = 0;
    if (k === 'ArrowLeft') dx = -1; else if (k === 'ArrowRight') dx = 1;
    else if (k === 'ArrowUp') dy = -1; else if (k === 'ArrowDown') dy = 1;
    if (dx || dy) {
      if (!p.move) { toast(pieceLabel(p) + ' is fixed in place'); ev.preventDefault(); return; }
      cancelDemo();
      var d = ev.shiftKey ? 1 : 5;
      p.x = E.clamp(p.x + dx * d, 40, W - 40);
      p.y = E.clamp(p.y + dy * d, 40, H - 40);
      retrace(); commit('mov:' + p.id);
      ev.preventDefault();
    }
  });

  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);
  document.getElementById('btnReset').addEventListener('click', function () {
    loadLevel(S.index, { noDemo: true }); toast('Level reset');
  });
  document.getElementById('btnHint').addEventListener('click', hint);
  document.getElementById('btnPrevSel').addEventListener('click', function () { cycleSelection(-1); });
  document.getElementById('btnNextSel').addEventListener('click', function () { cycleSelection(1); });
  document.getElementById('btnNext').addEventListener('click', function () {
    loadLevel(S.index + 1); cv.focus();
  });
  document.getElementById('btnStay').addEventListener('click', function () { hideVictory(); cv.focus(); });

  // ---------------------------------------------------------------- drawing
  function rr(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawBoard(t) {
    var g = ctx.createRadialGradient(W * 0.5, H * 0.34, 40, W * 0.5, H * 0.5, W * 0.78);
    g.addColorStop(0, '#141a28');
    g.addColorStop(0.55, '#0b0e16');
    g.addColorStop(1, '#06080e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,150,200,0.035)';
    ctx.beginPath();
    for (var x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (var y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,150,200,0.07)';
    ctx.beginPath();
    for (var x2 = 200; x2 < W; x2 += 200) { ctx.moveTo(x2, 0); ctx.lineTo(x2, H); }
    for (var y2 = 200; y2 < H; y2 += 200) { ctx.moveTo(0, y2); ctx.lineTo(W, y2); }
    ctx.stroke();

    // Brass corner brackets — instrument frame.
    ctx.strokeStyle = 'rgba(217,176,113,0.42)';
    ctx.lineWidth = 2;
    var m = 16, L = 46;
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * L, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * L);
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(139,149,168,0.5)';
    ctx.font = '600 11px ' + 'ui-monospace, Menlo, monospace';
    ctx.fillText('LEVEL ' + S.level.id + ' · ' + S.level.name.toUpperCase(), 30, H - 26);
    ctx.textAlign = 'right';
    ctx.fillText(S.trace.beams.length + ' SEGMENTS · ' + S.moves + ' MOVES', W - 30, H - 26);
    ctx.textAlign = 'left';
  }

  function drawTargets(t) {
    S.level.pieces.forEach(function (p) {
      if (p.type !== 'target') return;
      var v = S.verdict.targets.find(function (q) { return q.id === p.id; }) || { lit: false, lum: 0, need: 1 };
      var col = cssColor(p.color, 1);
      var pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 620 + p.x);

      ctx.save();
      ctx.translate(p.x, p.y);

      // socket — an unlit plate still advertises the colour it wants
      ctx.beginPath(); ctx.arc(0, 0, p.r + 13, 0, 6.2832);
      ctx.fillStyle = 'rgba(8,10,16,0.92)'; ctx.fill();
      ctx.lineWidth = v.lit ? 2.4 : 2;
      ctx.strokeStyle = v.lit ? col : cssColor(p.color, 0.62); ctx.stroke();

      // rotating aperture blades
      var spin = reduceMotion ? 0 : t / 2600;
      ctx.rotate(spin * (v.lit ? 2.4 : 1));
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3;
        var rr2 = p.r * (v.lit ? 0.86 : 0.66);
        if (i === 0) ctx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
        else ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      }
      ctx.closePath();
      ctx.fillStyle = v.lit ? cssColor(p.color, 0.30 + 0.18 * pulse) : cssColor(p.color, 0.14);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = v.lit ? col : cssColor(p.color, 0.5);
      ctx.stroke();
      ctx.restore();

      // permanent low halo so the plate reads as a colour, not a grey socket
      if (!v.lit) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var dg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
        dg.addColorStop(0, cssColor(p.color, 0.13));
        dg.addColorStop(1, cssColor(p.color, 0));
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      // fill arc: how close the plate is to its threshold
      var frac = Math.max(0, Math.min(1, v.lum / Math.max(v.need, 0.001)));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 19, -Math.PI / 2, -Math.PI / 2 + frac * 6.2832);
      ctx.lineWidth = 3;
      ctx.strokeStyle = v.lit ? col : cssColor(p.color, 0.4);
      ctx.stroke();
      ctx.restore();

      if (v.lit) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (2.8 + pulse * 0.5));
        g.addColorStop(0, cssColor(p.color, 0.5));
        g.addColorStop(1, cssColor(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.4, 0, 6.2832); ctx.fill();
        ctx.restore();

        // victory shockwave
        if (S.celebrate > 0) {
          var age = (t - S.celebrate) / 1000;
          if (age < 1.6) {
            ctx.save();
            ctx.strokeStyle = cssColor(p.color, Math.max(0, 0.7 - age / 1.6));
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r + age * 190, 0, 6.2832); ctx.stroke();
            ctx.restore();
          }
        }
      }
    });
  }

  function drawSensors(t) {
    S.level.pieces.forEach(function (p) {
      if (p.type !== 'sensor') return;
      var tripped = S.trace.sensorHits.has(p.id);
      var pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / (tripped ? 150 : 900));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3 + Math.PI / 6;
        var x = Math.cos(a) * p.r, y = Math.sin(a) * p.r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = tripped ? 'rgba(120,20,24,' + (0.5 + pulse * 0.4) + ')' : 'rgba(28,18,20,0.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = tripped ? 'rgba(255,110,110,1)' : 'rgba(190,90,90,' + (0.45 + pulse * 0.25) + ')';
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.3, 0, 6.2832);
      ctx.fillStyle = tripped ? '#ffd9d9' : 'rgba(255,140,140,' + (0.35 + pulse * 0.35) + ')';
      ctx.fill();
      if (tripped) {
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 3);
        g.addColorStop(0, 'rgba(255,70,70,0.42)');
        g.addColorStop(1, 'rgba(255,70,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, p.r * 3, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    });
  }

  function withPiece(p, fn) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(E.rad(p.angle || 0));
    fn();
    ctx.restore();
  }

  function drawPieces(t) {
    S.level.pieces.forEach(function (p) {
      if (p.type === 'wall') {
        withPiece(p, function () {
          var L = p.len, h = 9;
          rr(-L / 2, -h, L, h * 2, 4);
          ctx.fillStyle = '#161b26'; ctx.fill();
          ctx.strokeStyle = '#2b3345'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = 'rgba(120,140,175,0.16)'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (var x = -L / 2 - 20; x < L / 2 + 20; x += 11) { ctx.moveTo(x, -h); ctx.lineTo(x + 12, h); }
          ctx.stroke();
          ctx.restore();
          [-L / 2 + 6, L / 2 - 6].forEach(function (x) {
            ctx.beginPath(); ctx.arc(x, 0, 2.6, 0, 6.2832);
            ctx.fillStyle = 'rgba(217,176,113,0.55)'; ctx.fill();
          });
        });
      } else if (p.type === 'mirror') {
        withPiece(p, function () {
          var L = p.len;
          rr(-L / 2, -5.5, L, 11, 5);
          var g = ctx.createLinearGradient(0, -5.5, 0, 5.5);
          g.addColorStop(0, '#f2f7ff'); g.addColorStop(0.45, '#aebbd0');
          g.addColorStop(0.5, '#5c6a80'); g.addColorStop(1, '#20263300');
          ctx.fillStyle = '#2a3244'; ctx.fill();
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = 'rgba(230,240,255,0.75)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-L / 2 + 3, -2.6); ctx.lineTo(L / 2 - 3, -2.6);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; ctx.stroke();
          [-L / 2, L / 2].forEach(function (x) {
            ctx.beginPath(); ctx.arc(x, 0, 6, 0, 6.2832);
            var bg = ctx.createRadialGradient(x - 2, -2, 0, x, 0, 7);
            bg.addColorStop(0, '#f2d9a8'); bg.addColorStop(1, '#6d552f');
            ctx.fillStyle = bg; ctx.fill();
            ctx.strokeStyle = '#2a2114'; ctx.lineWidth = 1; ctx.stroke();
          });
        });
      } else if (p.type === 'splitter') {
        withPiece(p, function () {
          var L = p.len;
          rr(-L / 2, -5, L, 10, 4);
          var g = ctx.createLinearGradient(0, -5, 0, 5);
          g.addColorStop(0, 'rgba(210,235,255,0.55)');
          g.addColorStop(0.5, 'rgba(120,170,215,0.28)');
          g.addColorStop(1, 'rgba(200,225,255,0.45)');
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = 'rgba(190,225,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (var x = -L / 2; x < L / 2; x += 9) { ctx.moveTo(x, -5); ctx.lineTo(x + 5, 5); }
          ctx.stroke(); ctx.restore();
          [-L / 2, L / 2].forEach(function (x) {
            ctx.beginPath(); ctx.arc(x, 0, 5.5, 0, 6.2832);
            ctx.fillStyle = '#39424f'; ctx.fill();
            ctx.strokeStyle = '#8fa2ba'; ctx.lineWidth = 1; ctx.stroke();
          });
        });
      } else if (p.type === 'filter') {
        var fc = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1] }[p.channel];
        withPiece(p, function () {
          var L = p.len;
          rr(-L / 2, -6, L, 12, 3);
          var g = ctx.createLinearGradient(0, -6, 0, 6);
          g.addColorStop(0, cssColor(fc, 0.5));
          g.addColorStop(0.5, cssColor(fc, 0.22));
          g.addColorStop(1, cssColor(fc, 0.5));
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = cssColor(fc, 0.85); ctx.lineWidth = 1.2; ctx.stroke();
          [-L / 2 - 2, L / 2 - 6].forEach(function (x) {
            rr(x, -9, 8, 18, 2);
            ctx.fillStyle = '#39424f'; ctx.fill();
            ctx.strokeStyle = '#7d8ca3'; ctx.lineWidth = 1; ctx.stroke();
          });
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '600 9px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(p.channel.toUpperCase(), 0, 3);
          ctx.textAlign = 'left';
        });
      } else if (p.type === 'prism') {
        var pts = E.prismPoints(p);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        var pg = ctx.createLinearGradient(p.x - p.size, p.y - p.size, p.x + p.size, p.y + p.size);
        pg.addColorStop(0, 'rgba(220,240,255,0.22)');
        pg.addColorStop(0.5, 'rgba(150,200,240,0.10)');
        pg.addColorStop(1, 'rgba(255,240,255,0.20)');
        ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = 'rgba(205,232,255,0.8)'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(p.x, p.y);
        ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(p.x, p.y);
        ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'source') {
        withPiece(p, function () {
          rr(-30, -15, 40, 30, 7);
          var g = ctx.createLinearGradient(0, -15, 0, 15);
          g.addColorStop(0, '#3d4657'); g.addColorStop(0.5, '#232a38'); g.addColorStop(1, '#141a24');
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = '#525d70'; ctx.lineWidth = 1.4; ctx.stroke();
          rr(-34, -8, 6, 16, 2); ctx.fillStyle = '#8a6f45'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(10, -13); ctx.lineTo(21, -7); ctx.lineTo(21, 7); ctx.lineTo(10, 13);
          ctx.closePath();
          ctx.fillStyle = '#2c3444'; ctx.fill();
          ctx.strokeStyle = '#68748a'; ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          var eg = ctx.createRadialGradient(20, 0, 0, 20, 0, 26);
          eg.addColorStop(0, cssColor(p.color, 0.95));
          eg.addColorStop(1, cssColor(p.color, 0));
          ctx.fillStyle = eg;
          ctx.beginPath(); ctx.arc(20, 0, 26, 0, 6.2832); ctx.fill();
        });
      }
    });
  }

  var PASSES = [
    { w: 17, a: 0.085 },
    { w: 7.5, a: 0.20 },
    { w: 2.4, a: 0.95 }
  ];

  function drawBeams(t) {
    var flicker = reduceMotion ? 1 : 0.96 + 0.04 * Math.sin(t / 240);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var pi = 0; pi < PASSES.length; pi++) {
      var pass = PASSES[pi];
      ctx.lineWidth = pass.w;
      for (var i = 0; i < S.trace.beams.length; i++) {
        var b = S.trace.beams[i];
        var g = ctx.createLinearGradient(b.x1, b.y1, b.x2, b.y2);
        g.addColorStop(0, cssColor(b.col, Math.min(1, b.i0 * pass.a * flicker)));
        g.addColorStop(1, cssColor(b.col, Math.min(1, b.i1 * pass.a * flicker)));
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      }
    }
    // interaction sparks at every bounce / split point
    for (var j = 0; j < S.trace.beams.length; j++) {
      var bb = S.trace.beams[j];
      if (!bb.depth) continue;
      var rg = ctx.createRadialGradient(bb.x1, bb.y1, 0, bb.x1, bb.y1, 16);
      rg.addColorStop(0, cssColor(bb.col, Math.min(0.7, bb.i0 * 0.7)));
      rg.addColorStop(1, cssColor(bb.col, 0));
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(bb.x1, bb.y1, 16, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function drawSelection(t) {
    var p = byId(S.selected);
    if (!p) return;
    var dash = reduceMotion ? 0 : (t / 34) % 12;
    ctx.save();
    ctx.strokeStyle = 'rgba(111,227,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -dash;
    if (p.type === 'prism') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size + 12, 0, 6.2832); ctx.stroke();
    } else {
      withPiece(p, function () {
        rr(-p.len / 2 - 10, -16, p.len + 20, 32, 10);
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);
    if (p.spin) {
      var h = handlePos(p);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y);
      ctx.strokeStyle = 'rgba(111,227,255,0.35)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, 9, 0, 6.2832);
      ctx.fillStyle = 'rgba(16,22,32,0.95)'; ctx.fill();
      ctx.strokeStyle = 'rgba(111,227,255,1)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, 6.2832);
      ctx.fillStyle = 'rgba(111,227,255,1)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawHint(t) {
    if (S.hintStage >= 2 && S.level.hintPiece) {
      var hp = byId(S.level.hintPiece);
      if (hp) {
        var pulse = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t / 300);
        ctx.save();
        ctx.strokeStyle = 'rgba(217,176,113,' + (0.35 + pulse * 0.5) + ')';
        ctx.lineWidth = 2.5;
        var rad = (hp.type === 'prism' ? hp.size : (hp.len ? hp.len / 2 : hp.r || 20)) + 22 + pulse * 6;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, rad, 0, 6.2832); ctx.stroke();
        ctx.restore();
      }
    }
    if (S.hintStage >= 3) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(217,176,113,0.75)';
      ctx.lineWidth = 2;
      Object.keys(S.level.solution).forEach(function (id) {
        var s = S.level.solution[id], p = byId(id);
        if (!p) return;
        var gx = s.x != null ? s.x : p.x, gy = s.y != null ? s.y : p.y;
        var ga = s.angle != null ? s.angle : (p.angle || 0);
        ctx.save();
        ctx.translate(gx, gy); ctx.rotate(E.rad(ga));
        if (p.type === 'prism') {
          var q = { x: 0, y: 0, size: p.size, angle: 0 };
          var pts = E.prismPoints(q);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(pts[1][0], pts[1][1]);
          ctx.lineTo(pts[2][0], pts[2][1]);
          ctx.closePath(); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(-p.len / 2, 0); ctx.lineTo(p.len / 2, 0); ctx.stroke();
        }
        ctx.restore();
      });
      ctx.restore();
    }
  }

  var lastT = 0;
  function drawParticles(t) {
    if (!S.particles.length) return;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = S.particles.length - 1; i >= 0; i--) {
      var q = S.particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vy += 210 * dt; q.vx *= 0.985;
      q.life -= dt * 0.65;
      if (q.life <= 0) { S.particles.splice(i, 1); continue; }
      ctx.fillStyle = cssColor(q.col, q.life * 0.85);
      ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function draw(t) {
    t = t || performance.now();
    drawBoard(t);
    drawTargets(t);
    drawSensors(t);
    drawPieces(t);
    drawBeams(t);
    drawHint(t);
    drawSelection(t);
    drawParticles(t);
    lastT = t;
  }

  function frame(t) {
    stepDemo(t);
    draw(t);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------- boot
  buildStrip();
  resize();
  // #2 … #5 opens straight into that level — handy for linking and for QA.
  var fromHash = parseInt((location.hash || '').replace('#', ''), 10);
  var startAt = (fromHash >= 1 && fromHash <= DATA.LEVELS.length) ? fromHash - 1 : 0;
  loadLevel(startAt, { silent: true });
  requestAnimationFrame(frame);
  cv.focus();
  setTimeout(function () { toast('Drag the mirrors · Q/E rotate · H for a hint'); }, 400);
})();
