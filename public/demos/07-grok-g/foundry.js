(function () {
  "use strict";

  var POSTER_W = 1600;
  var POSTER_H = 900;
  var SAMPLE_SEED = 0xF07E71E;
  var MAX_PARTICLES = 2200;

  var FONTS = {
    editorial: 'Didot, "Bodoni MT", "Times New Roman", Times, serif',
    grotesk: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"Courier New", Courier, ui-monospace, monospace'
  };

  var PALETTES = {
    voltage: {
      bg: "#07080c",
      veil: "#0c1018",
      ink: "#f4fbff",
      a: "#5ce1ff",
      b: "#c084fc",
      dim: "rgba(92,225,255,0.18)",
      mark: "rgba(220,230,245,0.28)"
    },
    mercury: {
      bg: "#0b0d11",
      veil: "#141820",
      ink: "#eef3f8",
      a: "#cfd8e6",
      b: "#8ab4ff",
      dim: "rgba(180,200,230,0.16)",
      mark: "rgba(210,220,230,0.3)"
    },
    nocturne: {
      bg: "#100e0c",
      veil: "#1a1612",
      ink: "#f3eadc",
      a: "#d7c4a3",
      b: "#8a7360",
      dim: "rgba(215,196,163,0.16)",
      mark: "rgba(230,220,200,0.26)"
    },
    phosphor: {
      bg: "#050806",
      veil: "#0b140f",
      ink: "#d7ffe8",
      a: "#5dff9f",
      b: "#c8ff4a",
      dim: "rgba(93,255,159,0.14)",
      mark: "rgba(180,230,190,0.26)"
    }
  };

  var PRESETS = [
    {
      name: "Electric ribbon",
      treatment: "ribbon",
      palette: "voltage",
      font: "editorial",
      layout: "auto",
      align: "center",
      density: 1.05,
      stiffness: 0.1,
      damping: 0.84,
      trail: 0.5,
      glow: 0.82,
      margins: 100,
      marks: true
    },
    {
      name: "Chrome pulse",
      treatment: "chrome",
      palette: "mercury",
      font: "grotesk",
      layout: "one",
      align: "center",
      density: 1.28,
      stiffness: 0.14,
      damping: 0.88,
      trail: 0.22,
      glow: 0.64,
      margins: 88,
      marks: true
    },
    {
      name: "Soft ink",
      treatment: "ink",
      palette: "nocturne",
      font: "editorial",
      layout: "two",
      align: "left",
      density: 0.62,
      stiffness: 0.055,
      damping: 0.91,
      trail: 0.18,
      glow: 0.34,
      margins: 128,
      marks: false
    },
    {
      name: "Signal grid",
      treatment: "grid",
      palette: "phosphor",
      font: "mono",
      layout: "two",
      align: "left",
      density: 0.92,
      stiffness: 0.16,
      damping: 0.9,
      trail: 0.08,
      glow: 0.4,
      margins: 108,
      marks: true
    }
  ];

  var canvas = document.getElementById("poster");
  var ctx = canvas.getContext("2d", { alpha: false });
  var off = document.createElement("canvas");
  var offCtx = off.getContext("2d", { willReadFrequently: true });

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = {
    phrase: "FRONTIER / NIGHT",
    font: "editorial",
    layout: "auto",
    align: "center",
    density: reduced ? 0.48 : 1.05,
    stiffness: reduced ? 0.18 : 0.1,
    damping: reduced ? 0.93 : 0.84,
    trail: reduced ? 0.04 : 0.5,
    glow: reduced ? 0.28 : 0.82,
    margins: 100,
    palette: "voltage",
    marks: true,
    treatment: "ribbon",
    presetIndex: 0,
    paused: false,
    nodes: [],
    springs: [],
    ripples: [],
    wind: { x: 0, y: 0, px: POSTER_W * 0.5, py: POSTER_H * 0.5, active: false },
    vortex: { on: false, x: 0, y: 0 },
    pulse: 0,
    t: 0
  };

  var ui = {
    phrase: document.getElementById("phrase"),
    font: document.getElementById("font"),
    layout: document.getElementById("layout"),
    align: document.getElementById("align"),
    density: document.getElementById("density"),
    stiffness: document.getElementById("stiffness"),
    damping: document.getElementById("damping"),
    trail: document.getElementById("trail"),
    glow: document.getElementById("glow"),
    margins: document.getElementById("margins"),
    palette: document.getElementById("palette"),
    marks: document.getElementById("marks"),
    status: document.getElementById("status"),
    exportBtn: document.getElementById("export")
  };

  function mulberry32(a) {
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

  function posterPoint(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * POSTER_W,
      y: ((ev.clientY - rect.top) / rect.height) * POSTER_H
    };
  }

  function splitPhrase(raw, mode) {
    var text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    if (text.length > 80) text = text.slice(0, 80);
    if (mode === "one") return [text.replace(/\s*\/\s*/g, " ")];
    var slash = text.split(/\s*\/\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (mode === "two") {
      if (slash.length >= 2) return [slash[0], slash.slice(1).join(" ")];
      var words = text.split(" ");
      if (words.length >= 2) {
        var mid = Math.ceil(words.length / 2);
        return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
      }
      return [text, text];
    }
    if (slash.length >= 2) return [slash[0], slash.slice(1).join(" ")];
    return [text];
  }

  function fitFontSize(lines, family, margin, two) {
    var maxW = POSTER_W - margin * 2;
    var maxH = POSTER_H - margin * 2;
    var size = two ? 210 : 250;
    off.width = 8;
    off.height = 8;
    offCtx.font = "700 " + size + "px " + family;
    var widest = 0;
    for (var i = 0; i < lines.length; i++) {
      widest = Math.max(widest, offCtx.measureText(lines[i]).width);
    }
    if (widest > 1) size *= maxW / widest;
    var blockH = two ? size * 1.92 : size * 1.05;
    if (blockH > maxH) size *= maxH / blockH;
    return clamp(size, 42, two ? 240 : 300);
  }

  function sampleGlyphs() {
    var lines = splitPhrase(state.phrase, state.layout);
    state.nodes = [];
    state.springs = [];
    if (!lines.length) {
      announce();
      return;
    }

    var family = FONTS[state.font] || FONTS.editorial;
    var two = lines.length > 1;
    var margin = state.margins;
    var size = fitFontSize(lines, family, margin, two);
    var scale = Math.min(1, (canvas.clientWidth || POSTER_W) / 1100);
    var density = state.density * (reduced ? 0.55 : 1) * (0.72 + 0.28 * scale);
    var step = clamp(Math.round(5.2 / density), 2, 10);

    off.width = POSTER_W;
    off.height = POSTER_H;
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.clearRect(0, 0, POSTER_W, POSTER_H);
    offCtx.fillStyle = "#fff";
    offCtx.textBaseline = "alphabetic";
    offCtx.font = "700 " + size + "px " + family;
    try {
      if (state.font === "editorial") offCtx.letterSpacing = "-0.04em";
      else if (state.font === "mono") offCtx.letterSpacing = "0.04em";
      else offCtx.letterSpacing = "-0.02em";
    } catch (e) {}

    var lh = size * (two ? 0.92 : 1);
    var blockH = two ? lh * 1.12 + size * 0.78 : size;
    var top = (POSTER_H - blockH) * 0.46 + size * 0.82;
    if (state.treatment === "ink") top = (POSTER_H - blockH) * 0.42 + size * 0.82;
    if (state.treatment === "grid") top = margin + size * 0.86;

    for (var li = 0; li < lines.length; li++) {
      var w = offCtx.measureText(lines[li]).width;
      var x = POSTER_W * 0.5 - w * 0.5;
      if (state.align === "left") x = margin;
      if (state.align === "right") x = POSTER_W - margin - w;
      var y = top + li * (lh + size * 0.18);
      offCtx.fillText(lines[li], x, y);
    }

    var img = offCtx.getImageData(0, 0, POSTER_W, POSTER_H).data;
    var rng = mulberry32(SAMPLE_SEED ^ (state.phrase.length * 9973) ^ (Math.round(size) << 5));
    var pts = [];
    var jitter = state.treatment === "ink" ? 1.6 : 0.7;

    for (var y = 0; y < POSTER_H; y += step) {
      for (var x = 0; x < POSTER_W; x += step) {
        var a = img[(y * POSTER_W + x) * 4 + 3];
        if (a < 40) continue;
        if (rng() > 0.12 + density * 0.5 && a < 200) continue;
        pts.push({
          x: x + (rng() - 0.5) * jitter,
          y: y + (rng() - 0.5) * jitter,
          w: a / 255
        });
      }
    }

    if (pts.length > MAX_PARTICLES) {
      var keep = [];
      var stride = pts.length / MAX_PARTICLES;
      for (var k = 0; k < MAX_PARTICLES; k++) keep.push(pts[Math.floor(k * stride)]);
      pts = keep;
    }

    if (state.treatment === "grid") {
      for (var g = 0; g < pts.length; g++) {
        pts[g].x = Math.round(pts[g].x / 4) * 4;
        pts[g].y = Math.round(pts[g].y / 4) * 4;
      }
    }

    for (var n = 0; n < pts.length; n++) {
      var p = pts[n];
      state.nodes.push({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        rx: p.x,
        ry: p.y,
        w: p.w,
        row: Math.round(p.y / Math.max(3, step))
      });
    }

    connectNodes(step);
    announce();
  }

  function connectNodes(step) {
    var nodes = state.nodes;
    var cell = Math.max(8, step * 2.2);
    var buckets = Object.create(null);

    for (var i = 0; i < nodes.length; i++) {
      var cx = (nodes[i].rx / cell) | 0;
      var cy = (nodes[i].ry / cell) | 0;
      var key = cx + "," + cy;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(i);
    }

    var seen = Object.create(null);
    var maxDist = cell * (state.treatment === "ribbon" ? 2.8 : 2.2);
    var maxDist2 = maxDist * maxDist;
    var maxN = state.treatment === "ink" ? 2 : state.treatment === "grid" ? 3 : 4;

    function consider(a, b) {
      if (a === b) return;
      var lo = a < b ? a : b;
      var hi = a < b ? b : a;
      var id = lo + ":" + hi;
      if (seen[id]) return;
      var dx = nodes[a].rx - nodes[b].rx;
      var dy = nodes[a].ry - nodes[b].ry;
      var d2 = dx * dx + dy * dy;
      if (d2 < 4 || d2 > maxDist2) return;
      var gridish = Math.abs(dx) < 2.2 || Math.abs(dy) < 2.2;
      if (state.treatment === "grid" && !gridish && d2 > maxDist2 * 0.45) return;
      seen[id] = 1;
      var rest = Math.sqrt(d2);
      var kind = Math.abs(nodes[a].row - nodes[b].row) <= 1 && Math.abs(dx) > Math.abs(dy) ? "ribbon" : "web";
      state.springs.push({ a: a, b: b, rest: rest, kind: kind });
    }

    for (var i = 0; i < nodes.length; i++) {
      var nx = (nodes[i].rx / cell) | 0;
      var ny = (nodes[i].ry / cell) | 0;
      var found = 0;
      for (var oy = -1; oy <= 1 && found < maxN; oy++) {
        for (var ox = -1; ox <= 1 && found < maxN; ox++) {
          var list = buckets[(nx + ox) + "," + (ny + oy)];
          if (!list) continue;
          for (var j = 0; j < list.length && found < maxN; j++) {
            var other = list[j];
            if (other <= i) continue;
            var before = state.springs.length;
            consider(i, other);
            if (state.springs.length > before) found++;
          }
        }
      }
    }

    if (state.springs.length > nodes.length * 5) {
      state.springs.length = nodes.length * 5;
    }
  }

  function announce() {
    var preset = PRESETS[state.presetIndex].name;
    var phrase = state.phrase.trim() || "empty composition";
    var motion = state.paused ? "paused" : "live";
    ui.status.textContent = phrase + " — " + preset + " — " + motion + " — " + state.nodes.length + " nodes";
  }

  function applyForces(dt) {
    var nodes = state.nodes;
    var stiff = state.stiffness;
    var damp = state.damping;
    var treat = state.treatment;
    var wind = state.wind;
    var vortex = state.vortex;
    var pulse = Math.sin(state.t * 0.0018);
    state.pulse = pulse;

    var i, n, dx, dy, d2, f, dist, nx, ny, sp, a, b, rest, k;

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      dx = n.rx - n.x;
      dy = n.ry - n.y;
      n.vx += dx * stiff;
      n.vy += dy * stiff;

      if (treat === "chrome") {
        n.vy += pulse * 0.045 * n.w;
        n.vx += Math.sin((n.ry + state.t * 0.04) * 0.02) * 0.02;
      }

      if (wind.active) {
        dx = n.x - wind.px;
        dy = n.y - wind.py;
        d2 = dx * dx + dy * dy;
        f = 1400 / (d2 + 2800);
        n.vx += wind.x * f * 18;
        n.vy += wind.y * f * 18;
      }

      if (vortex.on) {
        dx = n.x - vortex.x;
        dy = n.y - vortex.y;
        d2 = dx * dx + dy * dy;
        f = 420 / (d2 + 900);
        n.vx += -dy * f;
        n.vy += dx * f;
        n.vx += dx * f * -0.12;
        n.vy += dy * f * -0.12;
      }
    }
    wind.x *= 0.86;
    wind.y *= 0.86;

    for (i = 0; i < state.ripples.length; i++) {
      var r = state.ripples[i];
      r.rad += dt * 0.62;
      r.life -= dt * 0.00115;
      var band = 28;
      for (k = 0; k < nodes.length; k++) {
        n = nodes[k];
        dx = n.x - r.x;
        dy = n.y - r.y;
        dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var ring = Math.abs(dist - r.rad);
        if (ring < band) {
          f = (1 - ring / band) * r.amp * 0.9;
          n.vx += (dx / dist) * f;
          n.vy += (dy / dist) * f;
        }
      }
    }
    state.ripples = state.ripples.filter(function (r) { return r.life > 0 && r.rad < 1400; });

    var springK = treat === "ink" ? 0.018 : treat === "grid" ? 0.04 : 0.028;
    for (i = 0; i < state.springs.length; i++) {
      sp = state.springs[i];
      a = nodes[sp.a];
      b = nodes[sp.b];
      dx = b.x - a.x;
      dy = b.y - a.y;
      dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      rest = sp.rest;
      f = (dist - rest) * springK;
      nx = dx / dist;
      ny = dy / dist;
      a.vx += nx * f;
      a.vy += ny * f;
      b.vx -= nx * f;
      b.vy -= ny * f;
    }

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n.vx *= damp;
      n.vy *= damp;
      if (reduced) {
        n.vx *= 0.85;
        n.vy *= 0.85;
      }
      n.x += n.vx * dt * 0.06;
      n.y += n.vy * dt * 0.06;
    }
  }

  function impulse() {
    var rng = mulberry32((Date.now() ^ SAMPLE_SEED) >>> 0);
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      var ang = rng() * Math.PI * 2;
      var mag = 4.2 + rng() * 7.5;
      n.vx += Math.cos(ang) * mag;
      n.vy += Math.sin(ang) * mag * 0.72;
    }
  }

  function restAll() {
    for (var i = 0; i < state.nodes.length; i++) {
      var n = state.nodes[i];
      n.vx *= 0.2;
      n.vy *= 0.2;
      n.x = lerp(n.x, n.rx, 0.28);
      n.y = lerp(n.y, n.ry, 0.28);
    }
  }

  function drawPoster(c, w, h, sx, sy) {
    var pal = PALETTES[state.palette] || PALETTES.voltage;
    var trail = reduced ? Math.min(state.trail, 0.06) : state.trail;
    var g = state.glow;
    var treat = state.treatment;
    var nodes = state.nodes;

    c.setTransform(sx, 0, 0, sy, 0, 0);

    if (trail < 0.04) {
      c.fillStyle = pal.bg;
      c.fillRect(0, 0, w, h);
    } else {
      c.fillStyle = pal.bg;
      c.globalAlpha = 1 - trail * 0.86;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    }

    var vg = c.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, pal.veil);
    vg.addColorStop(0.55, "rgba(0,0,0,0)");
    vg.addColorStop(1, pal.bg);
    c.globalAlpha = 0.55;
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;

    if (treat === "grid" || state.marks) {
      c.strokeStyle = pal.dim;
      c.lineWidth = 1;
      c.globalAlpha = treat === "grid" ? 0.22 : 0.08;
      var gs = treat === "grid" ? 28 : 40;
      c.beginPath();
      for (var gx = state.margins; gx < w - state.margins; gx += gs) {
        c.moveTo(gx, state.margins);
        c.lineTo(gx, h - state.margins);
      }
      for (var gy = state.margins; gy < h - state.margins; gy += gs) {
        c.moveTo(state.margins, gy);
        c.lineTo(w - state.margins, gy);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    c.save();
    c.globalCompositeOperation = treat === "ink" ? "source-over" : "lighter";

    if (treat === "ribbon" || treat === "chrome") {
      c.lineCap = "round";
      c.lineJoin = "round";
      for (var s = 0; s < state.springs.length; s++) {
        var sp = state.springs[s];
        if (treat === "ribbon" && sp.kind !== "ribbon" && s % 3 !== 0) continue;
        var a = nodes[sp.a];
        var b = nodes[sp.b];
        var speed = Math.abs(a.vx) + Math.abs(a.vy) + Math.abs(b.vx) + Math.abs(b.vy);
        c.strokeStyle = s % 2 ? pal.a : pal.b;
        c.globalAlpha = treat === "chrome" ? 0.16 + g * 0.12 : 0.12 + g * 0.22 + Math.min(0.2, speed * 0.01);
        c.lineWidth = treat === "chrome" ? 1.15 : 1.35 + a.w * 0.8;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.quadraticCurveTo((a.x + b.x) * 0.5 + (a.vy - b.vy) * 0.4, (a.y + b.y) * 0.5 - (a.vx - b.vx) * 0.4, b.x, b.y);
        c.stroke();
      }
    } else if (treat === "grid") {
      c.setLineDash([3, 7]);
      c.lineWidth = 1;
      for (var s2 = 0; s2 < state.springs.length; s2++) {
        var sp2 = state.springs[s2];
        var a2 = nodes[sp2.a];
        var b2 = nodes[sp2.b];
        c.strokeStyle = pal.a;
        c.globalAlpha = 0.22 + g * 0.15;
        c.beginPath();
        c.moveTo(a2.x, a2.y);
        c.lineTo(b2.x, b2.y);
        c.stroke();
      }
      c.setLineDash([]);
    } else {
      for (var s3 = 0; s3 < state.springs.length; s3++) {
        var sp3 = state.springs[s3];
        var a3 = nodes[sp3.a];
        var b3 = nodes[sp3.b];
        c.strokeStyle = pal.b;
        c.globalAlpha = 0.08 + g * 0.08;
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(a3.x, a3.y);
        c.lineTo(b3.x, b3.y);
        c.stroke();
      }
    }

    c.globalCompositeOperation = treat === "ink" ? "multiply" : "lighter";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var r = treat === "ink" ? 2.6 + n.w * 2.1 : treat === "grid" ? 1.35 : 1.15 + n.w * 1.1;
      if (treat === "chrome") r = 1.05 + n.w * 0.9;
      c.fillStyle = i % 5 === 0 ? pal.b : pal.ink;
      c.globalAlpha = 0.35 + n.w * 0.5 * (0.45 + g * 0.55);
      if (treat === "grid") {
        c.fillRect(n.x - r, n.y - r, r * 2, r * 2);
      } else {
        c.beginPath();
        c.arc(n.x, n.y, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    if (g > 0.05 && treat !== "ink") {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.08 * g;
      c.fillStyle = pal.a;
      for (var i2 = 0; i2 < nodes.length; i2 += 7) {
        var p = nodes[i2];
        c.beginPath();
        c.arc(p.x, p.y, 7 + g * 10, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    for (var ri = 0; ri < state.ripples.length; ri++) {
      var rp = state.ripples[ri];
      c.strokeStyle = pal.a;
      c.globalAlpha = Math.max(0, rp.life) * 0.35;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(rp.x, rp.y, rp.rad, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }

    if (state.marks) drawMarks(c, w, h, pal);

    c.fillStyle = pal.mark;
    c.globalAlpha = 0.7;
    c.font = '500 11px "Helvetica Neue", Helvetica, Arial, sans-serif';
    c.textAlign = "left";
    c.fillText("KINETIC POSTER FOUNDRY  ·  TYPE AS PHYSICS", state.margins, h - 28);
    c.textAlign = "right";
    c.fillText(PRESETS[state.presetIndex].name.toUpperCase(), w - state.margins, h - 28);
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawMarks(c, w, h, pal) {
    var m = 22;
    var len = 18;
    c.strokeStyle = pal.mark;
    c.lineWidth = 1;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.moveTo(m, m + len); c.lineTo(m, m); c.lineTo(m + len, m);
    c.moveTo(w - m - len, m); c.lineTo(w - m, m); c.lineTo(w - m, m + len);
    c.moveTo(m, h - m - len); c.lineTo(m, h - m); c.lineTo(m + len, h - m);
    c.moveTo(w - m - len, h - m); c.lineTo(w - m, h - m); c.lineTo(w - m, h - m - len);
    c.stroke();
    c.beginPath();
    c.moveTo(w * 0.5 - 8, m); c.lineTo(w * 0.5 + 8, m);
    c.moveTo(w * 0.5, m - 6); c.lineTo(w * 0.5, m + 6);
    c.moveTo(w * 0.5 - 8, h - m); c.lineTo(w * 0.5 + 8, h - m);
    c.moveTo(m, h * 0.5 - 8); c.lineTo(m, h * 0.5 + 8);
    c.moveTo(w - m, h * 0.5 - 8); c.lineTo(w - m, h * 0.5 + 8);
    c.stroke();
    c.globalAlpha = 1;
  }

  var last = 0;
  var needsClear = true;

  function frame(now) {
    var dt = last ? Math.min(32, now - last) : 16;
    last = now;
    state.t = now;
    if (!state.paused) applyForces(dt);
    if (needsClear) {
      ctx.fillStyle = (PALETTES[state.palette] || PALETTES.voltage).bg;
      ctx.fillRect(0, 0, POSTER_W, POSTER_H);
      needsClear = false;
    }
    drawPoster(ctx, POSTER_W, POSTER_H, 1, 1);
    requestAnimationFrame(frame);
  }

  function rebuild() {
    needsClear = true;
    sampleGlyphs();
  }

  function readControls() {
    state.phrase = ui.phrase.value;
    state.font = ui.font.value;
    state.layout = ui.layout.value;
    state.align = ui.align.value;
    state.density = parseFloat(ui.density.value);
    state.stiffness = parseFloat(ui.stiffness.value);
    state.damping = parseFloat(ui.damping.value);
    state.trail = parseFloat(ui.trail.value);
    state.glow = parseFloat(ui.glow.value);
    state.margins = parseFloat(ui.margins.value);
    state.palette = ui.palette.value;
    state.marks = ui.marks.checked;
  }

  function writeControls() {
    ui.phrase.value = state.phrase;
    ui.font.value = state.font;
    ui.layout.value = state.layout;
    ui.align.value = state.align;
    ui.density.value = String(state.density);
    ui.stiffness.value = String(state.stiffness);
    ui.damping.value = String(state.damping);
    ui.trail.value = String(state.trail);
    ui.glow.value = String(state.glow);
    ui.margins.value = String(state.margins);
    ui.palette.value = state.palette;
    ui.marks.checked = state.marks;
  }

  function applyPreset(index) {
    var p = PRESETS[index];
    if (!p) return;
    state.presetIndex = index;
    state.treatment = p.treatment;
    state.palette = p.palette;
    state.font = p.font;
    state.layout = p.layout;
    state.align = p.align;
    state.density = reduced ? p.density * 0.55 : p.density;
    state.stiffness = p.stiffness;
    state.damping = p.damping;
    state.trail = reduced ? Math.min(p.trail, 0.06) : p.trail;
    state.glow = p.glow;
    state.margins = p.margins;
    state.marks = p.marks;
    writeControls();
    document.querySelectorAll(".presets button").forEach(function (btn, i) {
      btn.classList.toggle("on", i === index);
    });
    rebuild();
  }

  function exportPng() {
    var out = document.createElement("canvas");
    out.width = POSTER_W;
    out.height = POSTER_H;
    var ox = out.getContext("2d");
    ox.drawImage(canvas, 0, 0);
    var a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "kinetic-poster-foundry.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  var rebuildTimer = 0;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      readControls();
      rebuild();
    }, 80);
  }

  ui.phrase.addEventListener("input", scheduleRebuild);
  ["font", "layout", "align", "density", "margins"].forEach(function (id) {
    ui[id].addEventListener("change", scheduleRebuild);
    ui[id].addEventListener("input", scheduleRebuild);
  });
  ["stiffness", "damping", "trail", "glow", "palette"].forEach(function (id) {
    ui[id].addEventListener("input", function () {
      readControls();
      announce();
    });
    ui[id].addEventListener("change", function () {
      readControls();
      needsClear = true;
      announce();
    });
  });
  ui.marks.addEventListener("change", function () {
    readControls();
    needsClear = true;
  });
  ui.exportBtn.addEventListener("click", exportPng);

  document.querySelectorAll(".presets button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyPreset(parseInt(btn.getAttribute("data-preset"), 10));
    });
  });

  canvas.addEventListener("pointermove", function (ev) {
    var p = posterPoint(ev);
    state.wind.x = (p.x - state.wind.px) * 0.35;
    state.wind.y = (p.y - state.wind.py) * 0.35;
    state.wind.px = p.x;
    state.wind.py = p.y;
    state.wind.active = true;
    if (state.vortex.on) {
      state.vortex.x = p.x;
      state.vortex.y = p.y;
    }
  });

  canvas.addEventListener("pointerdown", function (ev) {
    canvas.setPointerCapture(ev.pointerId);
    var p = posterPoint(ev);
    state.vortex.on = true;
    state.vortex.x = p.x;
    state.vortex.y = p.y;
    state.wind.px = p.x;
    state.wind.py = p.y;
  });

  canvas.addEventListener("pointerup", function (ev) {
    var p = posterPoint(ev);
    state.vortex.on = false;
    state.ripples.push({ x: p.x, y: p.y, rad: 12, life: 1, amp: 2.8 });
  });

  canvas.addEventListener("pointerleave", function () {
    state.wind.active = false;
    state.vortex.on = false;
  });

  window.addEventListener("keydown", function (ev) {
    var tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      if (ev.key === "Escape") ev.target.blur();
      return;
    }
    if (ev.code === "Space") {
      ev.preventDefault();
      impulse();
      return;
    }
    var k = ev.key.toLowerCase();
    if (k === "r") restAll();
    if (k === "p") {
      state.paused = !state.paused;
      announce();
    }
    if (k === "1" || k === "2" || k === "3" || k === "4") applyPreset(parseInt(k, 10) - 1);
  });

  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function (e) {
    reduced = e.matches;
    applyPreset(state.presetIndex);
  });

  applyPreset(0);
  ctx.fillStyle = PALETTES.voltage.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  drawPoster(ctx, POSTER_W, POSTER_H, 1, 1);
  requestAnimationFrame(frame);
})();
