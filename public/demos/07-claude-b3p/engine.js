/* Kinetic Poster Foundry — simulation engine.
 *
 * Pure-ish module: it knows about canvases and math, nothing about the editor UI.
 * The host injects a canvas factory so the same code runs in a browser and in the
 * Node check harness (check.js).
 *
 * Poster space is a fixed 1600x900 design grid. Everything — sampling, physics,
 * rendering — happens in that space, on an offscreen "stage" canvas. The visible
 * canvas is just a scaled blit of the stage, and PNG export is the stage itself,
 * so the exported file is exactly the current local canvas state at 1600x900.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KPFEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var POSTER_W = 1600;
  var POSTER_H = 900;
  var SEED = 0x5eed1234;
  var MAX_PHRASE = 140;
  var HARD_NODE_CAP = 7000;

  /* ------------------------------------------------------------------ utils */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mixRgb(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }

  /* ------------------------------------------------------------- typography */

  var FONT_STACKS = {
    grotesk: {
      label: 'Neo-grotesk',
      css: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
      weight: 800, tracking: -0.015, capRatio: 0.72
    },
    condensed: {
      label: 'Condensed display',
      css: 'Impact, Haettenschweiler, "Arial Narrow", "Liberation Sans Narrow", sans-serif',
      weight: 400, tracking: 0.005, capRatio: 0.74
    },
    serif: {
      label: 'Editorial serif',
      css: '"Times New Roman", Times, Georgia, "Liberation Serif", serif',
      weight: 700, tracking: 0.0, capRatio: 0.70
    },
    mono: {
      label: 'Technical mono',
      css: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      weight: 700, tracking: 0.02, capRatio: 0.68
    },
    geometric: {
      label: 'Geometric',
      css: '"Avenir Next", Avenir, Futura, "Century Gothic", "Trebuchet MS", sans-serif',
      weight: 700, tracking: 0.01, capRatio: 0.71
    }
  };

  var LEADING = { stack: 0.84, offset: 0.93, justify: 1.02, single: 1.0 };

  /* ---------------------------------------------------------------- palette */

  var PALETTES = {
    frontier: { label: 'Frontier night', light: false, bg: '#05070d', bg2: '#101a2b',
      stops: ['#4de6ff', '#6f74ff', '#ff4d9d'], accent: '#eaf7ff' },
    chrome: { label: 'Chrome', light: false, bg: '#07080a', bg2: '#171b21',
      stops: ['#e8f0f8', '#8ea3ba', '#5b6b7d'], accent: '#ffffff' },
    ink: { label: 'Ink on paper', light: true, bg: '#f1ede3', bg2: '#e2dccd',
      stops: ['#151a24', '#33425f', '#9c2b25'], accent: '#0d1017' },
    signal: { label: 'Signal green', light: false, bg: '#030f08', bg2: '#07231a',
      stops: ['#38ff92', '#0fd8ff', '#d8ff52'], accent: '#c8ffe0' },
    ember: { label: 'Ember', light: false, bg: '#0c0503', bg2: '#231005',
      stops: ['#ff7a18', '#ffc23d', '#ff3b30'], accent: '#fff2d8' },
    vapor: { label: 'Vapor', light: false, bg: '#090713', bg2: '#1b1533',
      stops: ['#b98cff', '#4ee2ff', '#ff9de0'], accent: '#f2ebff' }
  };

  var COLOR_BUCKETS = 8; // + 1 accent bucket

  /* ---------------------------------------------------------------- presets */

  var PRESETS = [
    {
      key: 'electric', name: 'Electric ribbon',
      state: {
        palette: 'frontier', layout: 'stack', align: 'center', margin: 0.10,
        density: 1.0, stiffness: 0.09, damping: 0.90, trail: 0.82, glow: 0.80, marks: true
      },
      mode: {
        line: 'ribbon', linkWidth: 1.15, coreAlpha: 0.62, dot: 1.15, dotAlpha: 0.45,
        degree: 4, reach: 2.0, densityMul: 1.0, flow: 0.085, vortex: 1.0, wind: 1.0,
        interiorLink: 0.30, interiorDot: 0.26
      }
    },
    {
      key: 'chrome', name: 'Chrome pulse',
      state: {
        palette: 'chrome', layout: 'offset', align: 'left', margin: 0.12,
        density: 0.85, stiffness: 0.145, damping: 0.83, trail: 0.55, glow: 0.62, marks: true
      },
      mode: {
        line: 'chrome', linkWidth: 0.85, coreAlpha: 0.78, dot: 2.0, dotAlpha: 1.0,
        degree: 3, reach: 1.95, densityMul: 0.9, flow: 0.03, vortex: 1.25, wind: 0.85, pulse: true,
        interiorLink: 0.13, interiorDot: 0.09
      }
    },
    {
      key: 'ink', name: 'Soft ink',
      state: {
        palette: 'ink', layout: 'justify', align: 'center', margin: 0.15,
        density: 0.8, stiffness: 0.05, damping: 0.935, trail: 0.16, glow: 0.0, marks: true
      },
      mode: {
        line: 'ink', linkWidth: 2.6, coreAlpha: 0.20, dot: 2.4, dotAlpha: 0.42,
        degree: 4, reach: 2.3, densityMul: 0.72, flow: 0.09, vortex: 0.8, wind: 1.2,
        interiorLink: 0.5, interiorDot: 0.42
      }
    },
    {
      key: 'signal', name: 'Signal grid',
      state: {
        palette: 'signal', layout: 'single', align: 'left', margin: 0.07,
        density: 1.25, stiffness: 0.2, damping: 0.79, trail: 0.35, glow: 0.46, marks: true
      },
      mode: {
        line: 'orthogonal', linkWidth: 0.95, coreAlpha: 0.72, dot: 1.8, dotAlpha: 1.0,
        degree: 3, reach: 2.55, densityMul: 1.3, flow: 0.02, vortex: 0.7, wind: 0.7, scanlines: true,
        interiorLink: 0.34, interiorDot: 0.30
      }
    }
  ];

  function defaultState() {
    var s = {
      phrase: 'FRONTIER / NIGHT',
      fontStack: 'grotesk',
      preset: 0
    };
    var p = PRESETS[0].state;
    for (var k in p) s[k] = p[k];
    return s;
  }

  /* ------------------------------------------------------------------ build */

  function splitPhrase(phrase, layoutMode) {
    var clean = String(phrase == null ? '' : phrase).slice(0, MAX_PHRASE);
    var parts = clean.split(/[\n\/|]+/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 0; });
    if (!parts.length) return [];
    if (layoutMode === 'single') return [parts.join(' ')];

    // Wrap over-long segments so very long phrases stay composed instead of
    // collapsing to unreadable 8px type.
    var maxChars = 17;
    var lines = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.length <= maxChars) { lines.push(p); continue; }
      var words = p.split(' ');
      var cur = '';
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (!cur.length) { cur = word; }
        else if (cur.length + 1 + word.length <= maxChars) { cur += ' ' + word; }
        else { lines.push(cur); cur = word; }
      }
      if (cur.length) lines.push(cur);
    }
    // A poster is not a paragraph: cap at four lines, folding the rest into the last.
    if (lines.length > 4) lines = lines.slice(0, 3).concat([lines.slice(3).join(' ')]);
    return lines;
  }

  function measureLine(ctx, text, size, tracking) {
    var w = ctx.measureText(text).width;
    if (text.length > 1) w += tracking * size * (text.length - 1);
    return w;
  }

  function computeLayout(ctx, st) {
    var font = FONT_STACKS[st.fontStack] || FONT_STACKS.grotesk;
    var lines = splitPhrase(st.phrase, st.layout);
    var m = clamp(st.margin, 0.04, 0.26);
    var mx = POSTER_W * m;
    var my = POSTER_H * m;
    var box = { x: mx, y: my, w: POSTER_W - mx * 2, h: POSTER_H - my * 2 };
    if (!lines.length) return { lines: [], empty: true, box: box, font: font, size: 0, draws: [] };

    var lead = LEADING[st.layout] || 1.0;
    var n = lines.length;
    var justify = st.layout === 'justify';

    ctx.font = font.weight + ' 100px ' + font.css;
    var w100 = lines.map(function (l) { return Math.max(1, measureLine(ctx, l, 100, font.tracking)); });
    var maxW100 = Math.max.apply(null, w100);

    var indent = st.layout === 'offset' ? 0.14 : 0;
    var usableW = box.w * (1 - indent * (n - 1));

    var sizeW = (usableW / maxW100) * 100;
    var sizeH = box.h / ((n - 1) * lead + font.capRatio);
    var size = Math.min(justify ? sizeW * 1.7 : sizeW, sizeH);
    size = clamp(size, 22, 470);

    var blockH = (n - 1) * lead * size + font.capRatio * size;
    var top = box.y + (box.h - blockH) / 2 - POSTER_H * 0.008;

    ctx.font = font.weight + ' ' + size + 'px ' + font.css;

    var draws = [];
    for (var i = 0; i < n; i++) {
      var text = lines[i];
      var natural = measureLine(ctx, text, size, font.tracking);
      var extra = 0;
      var lineW = natural;
      if (justify && text.length > 1) {
        var target = box.w;
        extra = clamp((target - natural) / (text.length - 1), -size * 0.06, size * 0.42);
        lineW = natural + extra * (text.length - 1);
      }
      var x;
      if (st.align === 'left') x = box.x;
      else if (st.align === 'right') x = box.x + box.w - lineW;
      else x = box.x + (box.w - lineW) / 2;
      x += indent * box.w * i;
      x = clamp(x, box.x - size * 0.05, box.x + Math.max(0, box.w - lineW) + size * 0.05);

      draws.push({
        text: text, x: x, y: top + font.capRatio * size + i * lead * size,
        extra: extra, width: lineW
      });
    }
    return { lines: lines, empty: false, box: box, font: font, size: size, draws: draws };
  }

  function paintText(ctx, L, fill) {
    ctx.fillStyle = fill;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = L.font.weight + ' ' + L.size + 'px ' + L.font.css;
    var track = L.font.tracking * L.size;
    for (var i = 0; i < L.draws.length; i++) {
      var d = L.draws[i];
      var x = d.x;
      for (var c = 0; c < d.text.length; c++) {
        var ch = d.text.charAt(c);
        ctx.fillText(ch, x, d.y);
        x += ctx.measureText(ch).width + track + d.extra;
      }
    }
  }

  /* ----------------------------------------------------------------- engine */

  function createFoundry(env) {
    var makeCanvas = env.makeCanvas;
    // The host may hand us the visible canvas as the stage, so the frame the user
    // sees and the frame that gets exported are literally the same pixels.
    var stage = env.stage || makeCanvas(POSTER_W, POSTER_H);
    stage.width = POSTER_W; stage.height = POSTER_H;
    var g = stage.getContext('2d');
    var sampleCv = makeCanvas(POSTER_W, POSTER_H);
    var sg = sampleCv.getContext('2d', { willReadFrequently: true });

    var st = defaultState();
    var reduced = !!env.reducedMotion;

    // node arrays (rebuilt only on structural change)
    var count = 0;
    var px = new Float32Array(0), py = new Float32Array(0);
    var vx = new Float32Array(0), vy = new Float32Array(0);
    var hx = new Float32Array(0), hy = new Float32Array(0);
    var bucket = new Uint8Array(0);
    var edge = new Uint8Array(0);   // 1 = node sits on the glyph contour
    var linkA = new Int32Array(0), linkB = new Int32Array(0), linkRest = new Float32Array(0);
    var linkCount = 0;
    var linkOrder = [];        // link indices grouped by colour bucket
    var nodeOrder = [];        // node indices grouped by colour bucket
    var sampleStep = 6;
    var layoutInfo = null;
    var lastBuild = { ok: false, note: '' };

    var colors = [];
    var bgGrad = null;
    var scanPattern = null;

    // interaction state
    var pointer = { x: POSTER_W / 2, y: POSTER_H / 2, px: POSTER_W / 2, py: POSTER_H / 2, vx: 0, vy: 0, inside: false, down: false, dragX: 0, dragY: 0, spin: 0 };
    var ripples = [];
    var restUntil = 0;
    var time = 0;
    var pulsePhase = 0;

    function mode() { return PRESETS[clamp(st.preset | 0, 0, PRESETS.length - 1)].mode; }
    function palette() { return PALETTES[st.palette] || PALETTES.frontier; }

    /* ------------------------------------------------------------- colours */

    function buildColors() {
      var pal = palette();
      var s = pal.stops.map(hexToRgb);
      colors = [];
      for (var i = 0; i < COLOR_BUCKETS; i++) {
        var t = i / (COLOR_BUCKETS - 1);
        var c = t < 0.5 ? mixRgb(s[0], s[1], t * 2) : mixRgb(s[1], s[2], (t - 0.5) * 2);
        colors.push(c);
      }
      colors.push(hexToRgb(pal.accent));
      bgGrad = g.createLinearGradient(0, 0, POSTER_W * 0.85, POSTER_H);
      var b1 = hexToRgb(pal.bg), b2 = hexToRgb(pal.bg2);
      bgGrad.addColorStop(0, rgba(mixRgb(b1, b2, 0.55), 1));
      bgGrad.addColorStop(0.55, rgba(b1, 1));
      bgGrad.addColorStop(1, rgba(mixRgb(b1, b2, 0.28), 1));
      scanPattern = null;
    }

    /* ------------------------------------------------------------ sampling */

    function nodeCap() {
      var vw = env.viewportWidth ? env.viewportWidth() : 1600;
      var base = vw < 720 ? 1500 : vw < 1100 ? 2600 : 4200;
      var cap = base * st.density * mode().densityMul * (reduced ? 0.5 : 1);
      return clamp(Math.round(cap), 220, HARD_NODE_CAP);
    }

    function build() {
      var rnd = mulberry32(SEED);
      layoutInfo = computeLayout(sg, st);

      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalCompositeOperation = 'source-over';
      sg.clearRect(0, 0, POSTER_W, POSTER_H);

      if (layoutInfo.empty) {
        count = 0; linkCount = 0; linkOrder = []; nodeOrder = [];
        lastBuild = { ok: true, note: 'empty', nodes: 0, links: 0 };
        return lastBuild;
      }

      paintText(sg, layoutInfo, '#ffffff');
      var img = sg.getImageData(0, 0, POSTER_W, POSTER_H);
      var data = img.data;

      // area estimate on a coarse lattice, then derive a deterministic step
      var area = 0;
      for (var yy = 0; yy < POSTER_H; yy += 4) {
        var row = yy * POSTER_W;
        for (var xx = 0; xx < POSTER_W; xx += 4) {
          if (data[(row + xx) * 4 + 3] > 140) area += 16;
        }
      }
      var cap = nodeCap();
      if (area < 16) {
        count = 0; linkCount = 0; linkOrder = []; nodeOrder = [];
        lastBuild = { ok: true, note: 'blank', nodes: 0, links: 0 };
        return lastBuild;
      }
      var step = clamp(Math.round(Math.sqrt(area / cap)), 2, 26);
      sampleStep = step;

      var xs = [], ys = [], es = [];
      var jit = step * 0.34;
      var probe = Math.max(2, Math.round(step * 0.9));
      function alphaAt(ax, ay) {
        if (ax < 0 || ay < 0 || ax >= POSTER_W || ay >= POSTER_H) return 0;
        return data[(ay * POSTER_W + ax) * 4 + 3];
      }
      for (var y = 1; y < POSTER_H; y += step) {
        for (var x = 1; x < POSTER_W; x += step) {
          var jx = Math.round(x + (rnd() * 2 - 1) * jit);
          var jy = Math.round(y + (rnd() * 2 - 1) * jit);
          if (jx < 0 || jy < 0 || jx >= POSTER_W || jy >= POSTER_H) { jx = x; jy = y; }
          var a = data[(jy * POSTER_W + jx) * 4 + 3];
          if (a < 140) {
            a = data[(y * POSTER_W + x) * 4 + 3];
            if (a < 140) continue;
            jx = x; jy = y;
          }
          xs.push(jx); ys.push(jy);
          es.push(
            alphaAt(jx - probe, jy) < 140 || alphaAt(jx + probe, jy) < 140 ||
            alphaAt(jx, jy - probe) < 140 || alphaAt(jx, jy + probe) < 140 ? 1 : 0
          );
          if (xs.length >= HARD_NODE_CAP) break;
        }
        if (xs.length >= HARD_NODE_CAP) break;
      }

      count = xs.length;
      px = new Float32Array(count); py = new Float32Array(count);
      vx = new Float32Array(count); vy = new Float32Array(count);
      hx = new Float32Array(count); hy = new Float32Array(count);
      bucket = new Uint8Array(count);
      edge = new Uint8Array(count);
      for (var e0 = 0; e0 < count; e0++) edge[e0] = es[e0];

      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      var i;
      for (i = 0; i < count; i++) {
        if (xs[i] < minX) minX = xs[i];
        if (xs[i] > maxX) maxX = xs[i];
        if (ys[i] < minY) minY = ys[i];
        if (ys[i] > maxY) maxY = ys[i];
      }
      var spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);

      // Rebuilds "assemble": nodes spawn scattered and spring into the letterform.
      var spread = reduced ? 7 : 30;
      for (i = 0; i < count; i++) {
        hx[i] = xs[i]; hy[i] = ys[i];
        px[i] = xs[i] + (rnd() * 2 - 1) * spread;
        py[i] = ys[i] + (rnd() * 2 - 1) * spread * 1.6;
        vx[i] = 0; vy[i] = 0;
        var t = 0.74 * ((xs[i] - minX) / spanX) + 0.26 * (1 - (ys[i] - minY) / spanY);
        var b = clamp(Math.floor(t * (COLOR_BUCKETS - 0.001)), 0, COLOR_BUCKETS - 1);
        bucket[i] = rnd() < 0.045 ? COLOR_BUCKETS : b;
      }

      buildLinks(step);
      groupByBucket();
      lastBuild = { ok: true, note: '', nodes: count, links: linkCount };
      return lastBuild;
    }

    function buildLinks(step) {
      var md = mode();
      var reach = step * md.reach;
      var reach2 = reach * reach;
      var cell = Math.max(4, reach);
      var cols = Math.ceil(POSTER_W / cell) + 1;
      var grid = new Map();
      var i, key;
      for (i = 0; i < count; i++) {
        key = ((hy[i] / cell) | 0) * cols + ((hx[i] / cell) | 0);
        var arr = grid.get(key);
        if (arr) arr.push(i); else grid.set(key, [i]);
      }
      var maxLinks = Math.min(count * md.degree, 26000);
      var A = new Int32Array(maxLinks), B = new Int32Array(maxLinks), R = new Float32Array(maxLinks);
      var deg = new Uint8Array(count);
      // Contour nodes get the full degree budget so the letterform edge stays a
      // crisp continuous filament; interior nodes get less, which keeps the
      // counters open instead of filling with scribble.
      var lim = new Uint8Array(count);
      for (i = 0; i < count; i++) lim[i] = edge[i] ? md.degree : Math.max(1, md.degree - 2);
      var nl = 0;
      for (i = 0; i < count && nl < maxLinks; i++) {
        if (deg[i] >= lim[i]) continue;
        var cx = (hx[i] / cell) | 0, cy = (hy[i] / cell) | 0;
        for (var oy = -1; oy <= 1 && deg[i] < lim[i]; oy++) {
          for (var ox = -1; ox <= 1 && deg[i] < lim[i]; ox++) {
            var bucketArr = grid.get((cy + oy) * cols + (cx + ox));
            if (!bucketArr) continue;
            for (var k = 0; k < bucketArr.length; k++) {
              var j = bucketArr[k];
              if (j <= i) continue;
              if (deg[i] >= lim[i] || deg[j] >= lim[j]) continue;
              // prefer edge-to-edge chaining
              if (edge[i] !== edge[j] && deg[i] > 0) continue;
              var dx = hx[j] - hx[i], dy = hy[j] - hy[i];
              var d2 = dx * dx + dy * dy;
              if (d2 > reach2 || d2 < 0.5) continue;
              A[nl] = i; B[nl] = j; R[nl] = Math.sqrt(d2);
              deg[i]++; deg[j]++; nl++;
              if (nl >= maxLinks) break;
            }
          }
        }
      }
      linkA = A; linkB = B; linkRest = R; linkCount = nl;
    }

    // Groups are [colour bucket] x [interior|contour] so a whole class of nodes
    // or links can be stroked with one path and one style change per frame.
    var NB = COLOR_BUCKETS + 1;

    function groupByBucket() {
      var b;
      nodeOrder = []; linkOrder = [];
      for (b = 0; b < NB * 2; b++) { nodeOrder.push([]); linkOrder.push([]); }
      for (var i = 0; i < count; i++) nodeOrder[bucket[i] + (edge[i] ? NB : 0)].push(i);
      for (var l = 0; l < linkCount; l++) {
        var a = linkA[l], c = linkB[l];
        linkOrder[bucket[a] + (edge[a] && edge[c] ? NB : 0)].push(l);
      }
    }

    /* ------------------------------------------------------------- physics */

    function step(dt) {
      dt = clamp(dt, 0.35, 2.2);
      time += dt / 60;
      pulsePhase = (pulsePhase + dt * 0.0042) % 1;

      // decay ripples
      for (var r = ripples.length - 1; r >= 0; r--) {
        ripples[r].age += dt;
        if (ripples[r].age > ripples[r].life) ripples.splice(r, 1);
      }
      if (!count) { pointer.vx *= 0.8; pointer.vy *= 0.8; return; }

      var md = mode();
      var motion = reduced ? 0.34 : 1;
      var resting = restUntil > 0;
      if (resting) restUntil = Math.max(0, restUntil - dt);

      var k = st.stiffness * (resting ? 2.4 : 1);
      var kl = st.stiffness * 0.55;
      var damp = Math.pow(resting ? Math.min(st.damping, 0.86) : st.damping, dt);
      var flowAmp = md.flow * motion * (resting ? 0.15 : 1);

      var i, dx, dy, d2, d, f;

      // structural link springs keep the letterform's local topology
      for (var l = 0; l < linkCount; l++) {
        var a = linkA[l], b = linkB[l];
        dx = px[b] - px[a]; dy = py[b] - py[a];
        d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        f = ((d - linkRest[l]) / d) * kl * 0.5 * dt;
        var fx = dx * f, fy = dy * f;
        vx[a] += fx; vy[a] += fy;
        vx[b] -= fx; vy[b] -= fy;
      }

      // pointer wind
      var wantWind = pointer.inside && !pointer.down;
      var windR = 250, windR2 = windR * windR;
      var windK = 0.10 * md.wind * motion;
      var pvx = pointer.vx, pvy = pointer.vy;
      var windOn = wantWind && (Math.abs(pvx) + Math.abs(pvy) > 0.12);

      // vortex
      var vortexOn = pointer.down;
      var vortR = 330, vortR2 = vortR * vortR;
      var dragLen = Math.min(1.6, Math.hypot(pointer.x - pointer.dragX, pointer.y - pointer.dragY) / 260);
      var vortK = 0.42 * md.vortex * motion * (0.55 + dragLen);
      var spin = pointer.spin >= 0 ? 1 : -1;

      for (i = 0; i < count; i++) {
        // spring toward typographic home
        var ki = edge[i] ? k : k * 1.6;
        dx = hx[i] - px[i]; dy = hy[i] - py[i];
        vx[i] += dx * ki * dt;
        vy[i] += dy * ki * dt;

        // ambient flow so the first frame is already alive
        if (flowAmp > 0) {
          var ax = hx[i] * 0.0075, ay = hy[i] * 0.0122;
          vx[i] += Math.sin(ay + time * 0.62) * Math.cos(ax * 0.8 - time * 0.31) * flowAmp * dt;
          vy[i] += Math.cos(ax + time * 0.47) * Math.sin(ay * 0.7 + time * 0.24) * flowAmp * 0.75 * dt;
        }

        if (windOn) {
          dx = px[i] - pointer.x; dy = py[i] - pointer.y;
          d2 = dx * dx + dy * dy;
          if (d2 < windR2) {
            f = (1 - d2 / windR2);
            f *= f * windK * dt;
            vx[i] += pvx * f;
            vy[i] += pvy * f;
          }
        }

        if (vortexOn) {
          dx = px[i] - pointer.x; dy = py[i] - pointer.y;
          d2 = dx * dx + dy * dy;
          if (d2 < vortR2 && d2 > 1) {
            d = Math.sqrt(d2);
            var fall = (1 - d / vortR);
            fall *= fall;
            var tk = vortK * fall * dt;
            vx[i] += (-dy / d) * tk * spin * 26;
            vy[i] += (dx / d) * tk * spin * 26;
            // slight inward draw twists the type instead of only orbiting it
            vx[i] -= (dx / d) * tk * 6;
            vy[i] -= (dy / d) * tk * 6;
          }
        }

        for (var q = 0; q < ripples.length; q++) {
          var rp = ripples[q];
          dx = px[i] - rp.x; dy = py[i] - rp.y;
          d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          var ring = rp.age * rp.speed;
          var off = (d - ring) / rp.width;
          if (off > -3 && off < 3) {
            var amp = Math.exp(-off * off) * rp.strength * (1 - rp.age / rp.life) * motion * dt;
            vx[i] += (dx / d) * amp;
            vy[i] += (dy / d) * amp;
          }
        }

        vx[i] *= damp; vy[i] *= damp;

        // soft containment so nothing escapes the poster
        var ox2 = px[i] < -80 ? -80 - px[i] : px[i] > POSTER_W + 80 ? POSTER_W + 80 - px[i] : 0;
        var oy2 = py[i] < -80 ? -80 - py[i] : py[i] > POSTER_H + 80 ? POSTER_H + 80 - py[i] : 0;
        vx[i] += ox2 * 0.02 * dt; vy[i] += oy2 * 0.02 * dt;

        var sp = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp > 3600) { var s = 60 / Math.sqrt(sp); vx[i] *= s; vy[i] *= s; }

        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
      }

      pointer.vx *= Math.pow(0.72, dt);
      pointer.vy *= Math.pow(0.72, dt);
    }

    /* ------------------------------------------------------------ rendering */

    function fadeBackground() {
      var alpha = st.trail <= 0.005 ? 1 : clamp(0.035 + Math.pow(1 - st.trail, 1.7) * 0.95, 0.035, 1);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
      g.fillStyle = bgGrad;
      g.fillRect(0, 0, POSTER_W, POSTER_H);
      g.globalAlpha = 1;
    }

    function strokeLinks() {
      var md = mode();
      var pal = palette();
      var additive = !pal.light;
      var glow = st.glow;
      var orth = md.line === 'orthogonal';
      var passes = [];
      if (glow > 0.01) {
        passes.push({ w: md.linkWidth * (2.6 + glow * 8), a: 0.02 + glow * 0.075, bloom: true });
      }
      passes.push({ w: md.linkWidth, a: md.coreAlpha, bloom: false });

      for (var p = 0; p < passes.length; p++) {
        var pass = passes[p];
        g.globalCompositeOperation = pass.bloom || additive ? (additive ? 'lighter' : 'source-over') : 'source-over';
        g.lineCap = md.line === 'ink' ? 'round' : 'butt';
        g.lineJoin = 'round';
        for (var b = 0; b < NB * 2; b++) {
          var list = linkOrder[b];
          if (!list || !list.length) continue;
          var onEdge = b >= NB;
          var col = colors[b % NB];
          var em = onEdge ? 1.3 : (md.interiorLink == null ? 0.30 : md.interiorLink);
          // two energy tiers: fast links read as hot filaments
          for (var tier = 0; tier < 2; tier++) {
            g.beginPath();
            var any = false;
            for (var n = 0; n < list.length; n++) {
              var l = list[n];
              var i = linkA[l], j = linkB[l];
              var e = Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(vx[j]) + Math.abs(vy[j]);
              var hot = e > 1.6 ? 1 : 0;
              if (hot !== tier) continue;
              any = true;
              if (orth) {
                var mx = px[j], my = py[i];
                g.moveTo(px[i], py[i]); g.lineTo(mx, my); g.lineTo(px[j], py[j]);
              } else {
                g.moveTo(px[i], py[i]); g.lineTo(px[j], py[j]);
              }
            }
            if (!any) continue;
            g.strokeStyle = rgba(col, clamp(pass.a * em * (tier ? 1.25 : 0.85), 0, 1));
            g.lineWidth = pass.w * (tier ? 1.9 : 1) * (onEdge ? 1 : 0.85);
            g.stroke();
          }
        }
      }
      g.globalCompositeOperation = 'source-over';
    }

    function paintNodes() {
      var md = mode();
      var pal = palette();
      g.globalCompositeOperation = pal.light ? 'source-over' : 'lighter';
      var round = md.line === 'ink' || md.line === 'chrome';
      var base = md.dot * (sampleStep > 9 ? 1.35 : 1);
      for (var b = 0; b < NB * 2; b++) {
        var list = nodeOrder[b];
        if (!list || !list.length) continue;
        var onEdge = b >= NB;
        var size = base * (onEdge ? 1.15 : 0.8);
        var dm = onEdge ? 1.2 : (md.interiorDot == null ? 0.26 : md.interiorDot);
        g.fillStyle = rgba(colors[b % NB], clamp(md.dotAlpha * dm, 0, 1));
        if (round) {
          g.beginPath();
          for (var n = 0; n < list.length; n++) {
            var i = list[n];
            g.moveTo(px[i] + size, py[i]);
            g.arc(px[i], py[i], size, 0, 6.2831853);
          }
          g.fill();
        } else {
          for (var m = 0; m < list.length; m++) {
            var q = list[m];
            g.fillRect(px[q] - size * 0.5, py[q] - size * 0.5, size, size);
          }
        }
      }
      g.globalCompositeOperation = 'source-over';
    }

    function paintPulse() {
      // Chrome pulse: a specular band sweeps across the letterform.
      var pal = palette();
      var bandX = (pulsePhase * 1.5 - 0.25) * POSTER_W;
      var half = 130;
      g.globalCompositeOperation = pal.light ? 'source-over' : 'lighter';
      var acc = colors[COLOR_BUCKETS];
      for (var i = 0; i < count; i++) {
        var d = Math.abs(hx[i] - bandX);
        if (d > half) continue;
        var a = (1 - d / half);
        a *= a * 0.9;
        g.fillStyle = rgba(acc, a * 0.55);
        g.fillRect(px[i] - 1.4, py[i] - 1.4, 2.8, 2.8);
      }
      g.globalCompositeOperation = 'source-over';
    }

    function paintScanlines() {
      if (!scanPattern) {
        var pc = makeCanvas(4, 4);
        var pcx = pc.getContext('2d');
        pcx.clearRect(0, 0, 4, 4);
        pcx.fillStyle = 'rgba(0,0,0,0.30)';
        pcx.fillRect(0, 2, 4, 2);
        scanPattern = g.createPattern(pc, 'repeat');
      }
      if (!scanPattern) return;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.34;
      g.fillStyle = scanPattern;
      g.fillRect(0, 0, POSTER_W, POSTER_H);
      g.globalAlpha = 1;
    }

    function paintRipples() {
      if (!ripples.length) return;
      var pal = palette();
      g.globalCompositeOperation = pal.light ? 'source-over' : 'lighter';
      for (var i = 0; i < ripples.length; i++) {
        var rp = ripples[i];
        var rad = rp.age * rp.speed;
        var a = (1 - rp.age / rp.life);
        g.strokeStyle = rgba(colors[COLOR_BUCKETS], a * a * 0.30);
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(rp.x, rp.y, rad, 0, 6.2831853);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }

    function paintMarks() {
      if (!st.marks || !layoutInfo) return;
      var pal = palette();
      var box = layoutInfo.box;
      var ink = hexToRgb(pal.accent);
      var faint = rgba(ink, pal.light ? 0.30 : 0.22);
      var hair = rgba(ink, pal.light ? 0.13 : 0.085);

      g.globalCompositeOperation = 'source-over';
      g.lineWidth = 1;

      // column grid
      g.strokeStyle = hair;
      g.beginPath();
      for (var c = 1; c < 4; c++) {
        var x = Math.round(box.x + (box.w / 4) * c) + 0.5;
        g.moveTo(x, box.y); g.lineTo(x, box.y + box.h);
      }
      var midY = Math.round(box.y + box.h / 2) + 0.5;
      g.moveTo(box.x, midY); g.lineTo(box.x + box.w, midY);
      g.stroke();

      // crop marks
      g.strokeStyle = faint;
      var t = 22;
      var corners = [[box.x, box.y, 1, 1], [box.x + box.w, box.y, -1, 1],
                     [box.x, box.y + box.h, 1, -1], [box.x + box.w, box.y + box.h, -1, -1]];
      g.beginPath();
      for (var k = 0; k < corners.length; k++) {
        var cn = corners[k];
        var cx = Math.round(cn[0]) + 0.5, cy = Math.round(cn[1]) + 0.5;
        g.moveTo(cx, cy); g.lineTo(cx + t * cn[2], cy);
        g.moveTo(cx, cy); g.lineTo(cx, cy + t * cn[3]);
      }
      g.stroke();

      // caption furniture
      var pr = PRESETS[clamp(st.preset | 0, 0, PRESETS.length - 1)];
      var label = 'KINETIC POSTER FOUNDRY';
      var right = pr.name.toUpperCase() + ' · ' + (FONT_STACKS[st.fontStack] || FONT_STACKS.grotesk).label.toUpperCase();
      g.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
      g.fillStyle = rgba(ink, pal.light ? 0.55 : 0.42);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      var by = POSTER_H - Math.max(26, box.y * 0.42);
      g.fillText(label, box.x, by);
      g.textAlign = 'right';
      g.fillText(right, box.x + box.w, by);
      g.textAlign = 'left';
      g.beginPath();
      g.strokeStyle = hair;
      g.moveTo(box.x, by + 8.5); g.lineTo(box.x + box.w, by + 8.5);
      g.stroke();

      if (layoutInfo.empty) {
        g.strokeStyle = faint;
        g.beginPath();
        var ey = Math.round(POSTER_H / 2) + 0.5;
        g.moveTo(box.x, ey); g.lineTo(box.x + box.w, ey);
        g.stroke();
        g.font = '500 13px ui-monospace, Menlo, Consolas, monospace';
        g.fillStyle = rgba(ink, 0.5);
        g.textAlign = 'center';
        g.fillText('TYPE A PHRASE TO BUILD THE POSTER', POSTER_W / 2, ey - 18);
        g.textAlign = 'left';
      }
    }

    function paintVignette() {
      var pal = palette();
      if (pal.light) return;
      var vg = g.createRadialGradient(POSTER_W * 0.5, POSTER_H * 0.48, POSTER_H * 0.25,
                                      POSTER_W * 0.5, POSTER_H * 0.5, POSTER_W * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = vg;
      g.fillRect(0, 0, POSTER_W, POSTER_H);
    }

    function render() {
      var md = mode();
      fadeBackground();
      if (count) {
        strokeLinks();
        paintNodes();
        if (md.pulse) paintPulse();
      }
      paintRipples();
      if (md.scanlines && st.marks) paintScanlines();
      paintVignette();
      paintMarks();
    }

    /* -------------------------------------------------------------- events */

    var STRUCTURAL = { phrase: 1, fontStack: 1, layout: 1, align: 1, margin: 1, density: 1 };

    function setState(patch, opts) {
      var rebuild = false, recolor = false;
      for (var key in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        var val = patch[key];
        if (key === 'phrase') val = String(val == null ? '' : val).slice(0, MAX_PHRASE);
        if (st[key] === val) continue;
        st[key] = val;
        if (STRUCTURAL[key]) rebuild = true;
        if (key === 'palette') recolor = true;
        if (key === 'preset') { rebuild = true; recolor = true; }
      }
      if (opts && opts.force) { rebuild = true; recolor = true; }
      if (recolor) buildColors();
      if (rebuild) build();
      return { rebuilt: rebuild, nodes: count, links: linkCount };
    }

    function applyPreset(index) {
      var i = clamp(index | 0, 0, PRESETS.length - 1);
      var patch = { preset: i };
      var ps = PRESETS[i].state;
      for (var k in ps) patch[k] = ps[k];
      setState(patch);
      return PRESETS[i];
    }

    function movePointer(x, y) {
      pointer.px = pointer.x; pointer.py = pointer.y;
      pointer.x = x; pointer.y = y;
      pointer.vx = pointer.vx * 0.4 + (x - pointer.px) * 0.6;
      pointer.vy = pointer.vy * 0.4 + (y - pointer.py) * 0.6;
      pointer.inside = true;
      if (pointer.down) {
        var cross = (pointer.x - pointer.dragX) * (y - pointer.py) - (pointer.y - pointer.dragY) * (x - pointer.px);
        pointer.spin = pointer.spin * 0.9 + (cross >= 0 ? 0.1 : -0.1);
      }
    }
    function pointerDown(x, y) {
      movePointer(x, y);
      pointer.down = true;
      pointer.dragX = x; pointer.dragY = y;
      pointer.spin = 1;
    }
    function pointerUp() {
      if (!pointer.down) return;
      pointer.down = false;
      addRipple(pointer.x, pointer.y, reduced ? 1.1 : 2.6);
    }
    function pointerLeave() { pointer.inside = false; pointer.vx = 0; pointer.vy = 0; }

    function addRipple(x, y, strength) {
      ripples.push({ x: x, y: y, age: 0, life: 78, speed: 15.5, width: 95, strength: strength });
      if (ripples.length > 6) ripples.shift();
    }

    function impulse() {
      var rnd = mulberry32(SEED ^ 0x77);
      var cx = POSTER_W / 2, cy = POSTER_H / 2;
      var amp = reduced ? 1.6 : 5.2;
      for (var i = 0; i < count; i++) {
        var dx = px[i] - cx, dy = py[i] - cy;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var s = amp * (0.55 + rnd() * 0.9);
        vx[i] += (dx / d) * s;
        vy[i] += (dy / d) * s - amp * 0.35;
      }
      addRipple(cx, cy, reduced ? 1.2 : 3.0);
    }

    function rest() {
      restUntil = 70;
      ripples.length = 0;
      pointer.down = false;
      pointer.vx = 0; pointer.vy = 0;
    }

    buildColors();
    build();

    return {
      POSTER_W: POSTER_W, POSTER_H: POSTER_H,
      stage: stage,
      state: st,
      presets: PRESETS,
      palettes: PALETTES,
      fonts: FONT_STACKS,
      setState: setState,
      applyPreset: applyPreset,
      rebuild: function () { return build(); },
      step: step,
      render: render,
      movePointer: movePointer,
      pointerDown: pointerDown,
      pointerUp: pointerUp,
      pointerLeave: pointerLeave,
      impulse: impulse,
      ripple: addRipple,
      rest: rest,
      setReducedMotion: function (v) { reduced = !!v; build(); },
      info: function () {
        return {
          nodes: count, links: linkCount, step: sampleStep,
          lines: layoutInfo ? layoutInfo.lines.slice() : [],
          size: layoutInfo ? Math.round(layoutInfo.size) : 0,
          empty: !!(layoutInfo && layoutInfo.empty),
          note: lastBuild.note,
          preset: PRESETS[clamp(st.preset | 0, 0, PRESETS.length - 1)].name,
          reduced: reduced
        };
      },
      _debug: { nodes: function () { return { count: count, px: px, py: py, vx: vx, vy: vy, hx: hx, hy: hy }; } }
    };
  }

  return {
    POSTER_W: POSTER_W,
    POSTER_H: POSTER_H,
    PRESETS: PRESETS,
    PALETTES: PALETTES,
    FONT_STACKS: FONT_STACKS,
    splitPhrase: splitPhrase,
    computeLayout: computeLayout,
    defaultState: defaultState,
    createFoundry: createFoundry
  };
});
