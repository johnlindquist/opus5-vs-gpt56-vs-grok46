(function () {
  "use strict";
  var SA = window.SandAlchemist;
  var canvas = document.getElementById("world");
  var ctx = canvas.getContext("2d", { alpha: false });
  var ghost = document.getElementById("brush-ghost");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SEED = 0xA13C3;
  var world = new SA.World(SEED);
  var preset = "volcano";
  world.loadPreset(preset);

  canvas.width = SA.COLS * SA.CELL;
  canvas.height = SA.ROWS * SA.CELL;

  var low = document.createElement("canvas");
  low.width = SA.COLS;
  low.height = SA.ROWS;
  var lctx = low.getContext("2d", { alpha: false });
  var image = lctx.createImageData(SA.COLS, SA.ROWS);
  var pix = image.data;
  for (var p = 0; p < pix.length; p += 4) pix[p + 3] = 255;
  ctx.imageSmoothingEnabled = false;

  var selected = SA.SAND;
  var brush = 4;
  var paused = false;
  var speed = 1;
  var eraseMode = false;
  var lastCell = null;
  var painting = false;
  var rightPaint = false;
  var frames = 0;
  var fps = 0;
  var fpsT = performance.now();
  var particles = [];
  var MAX_PARTICLES = reduced ? 48 : 220;

  function $(id) { return document.getElementById(id); }

  function materialForPaint() {
    return (eraseMode || rightPaint) ? SA.EMPTY : selected;
  }

  function pointerCell(ev) {
    var rect = canvas.getBoundingClientRect();
    var x = Math.floor((ev.clientX - rect.left) / rect.width * SA.COLS);
    var y = Math.floor((ev.clientY - rect.top) / rect.height * SA.ROWS);
    return { x: x, y: y };
  }

  function applyPaint(cell, shift) {
    var t = materialForPaint();
    if (shift && lastCell) world.line(lastCell.x, lastCell.y, cell.x, cell.y, t, brush);
    else world.paint(cell.x, cell.y, t, brush);
    lastCell = cell;
  }

  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    painting = true;
    rightPaint = e.button === 2;
    applyPaint(pointerCell(e), e.shiftKey);
  });
  canvas.addEventListener("pointermove", function (e) {
    var cell = pointerCell(e);
    updateGhost(e);
    if (painting) applyPaint(cell, e.shiftKey);
  });
  canvas.addEventListener("pointerup", function () { painting = false; rightPaint = false; });
  canvas.addEventListener("pointerleave", function () { ghost.classList.add("hidden"); });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    brush = Math.max(0, Math.min(18, brush + (e.deltaY > 0 ? -1 : 1)));
    updateMeters();
  }, { passive: false });

  function updateGhost(e) {
    var rect = canvas.getBoundingClientRect();
    var size = (brush * 2 + 1) * (rect.width / SA.COLS);
    ghost.style.width = size + "px";
    ghost.style.height = size + "px";
    ghost.style.left = (e.clientX - rect.left - size / 2) + "px";
    ghost.style.top = (e.clientY - rect.top - size / 2) + "px";
    ghost.classList.remove("hidden");
  }

  function spawnParticle(x, y, kind) {
    if (particles.length >= MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES + 1);
    particles.push({
      x: x * SA.CELL + 2,
      y: y * SA.CELL + 2,
      vx: (Math.random() - 0.5) * (kind === "ember" ? 0.8 : 0.4),
      vy: kind === "ember" ? -0.9 - Math.random() : -0.45,
      life: reduced ? 18 : 36,
      kind: kind
    });
  }

  function sampleParticles() {
    if (reduced) return;
    var type = world.type;
    var step = 17;
    var start = world.tick % step;
    for (var i = start; i < SA.COLS * SA.ROWS; i += step) {
      var t = type[i];
      if (t === SA.FIRE && particles.length < MAX_PARTICLES && (i % 5) === 0) {
        spawnParticle(i % SA.COLS, (i / SA.COLS) | 0, "ember");
      } else if (t === SA.STEAM && particles.length < MAX_PARTICLES && (i % 9) === 0) {
        spawnParticle(i % SA.COLS, (i / SA.COLS) | 0, "steam");
      }
    }
  }

  function render() {
    var type = world.type;
    var temp = world.temp;
    var salt = world.salt;
    var tick = world.tick;
    var colors = SA.COLORS;
    var cols = SA.COLS;
    var rows = SA.ROWS;
    var data = pix;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var t = type[i];
        var c = colors[t];
        var r = c[0], g = c[1], b = c[2];
        var heat = temp[i];
        if (t === SA.FIRE) {
          var flick = (SA.hash(x, y, tick, SEED) % 40);
          r = 255; g = 90 + flick; b = 30;
        } else if (t === SA.LAVA) {
          r = 255; g = 40 + (heat >> 3); b = 12;
        } else if (t === SA.STEAM) {
          var a = 0.35 + (heat - 120) / 400;
          r = (8 + r * a) | 0; g = (10 + g * a) | 0; b = (14 + b * a) | 0;
        } else if (t === SA.WATER && salt[i] > 20) {
          r = Math.min(255, r + (salt[i] >> 2));
          g = Math.min(255, g + (salt[i] >> 3));
          b = Math.min(255, b + 8);
        } else if (t === SA.STONE && heat > 150) {
          r = Math.min(255, r + ((heat - 150) >> 1));
          g = Math.min(255, g + ((heat - 150) >> 3));
        } else if (t === SA.EMPTY && heat > 160 && !reduced) {
          r = 18; g = 8; b = 8;
        }
        if (t && t !== SA.ICE && t !== SA.FIRE && heat > 170) {
          r = Math.min(255, r + ((heat - 170) >> 2));
        }
        if (t === SA.ICE) {
          b = Math.min(255, b + 10);
        }
        var pi = i << 2;
        data[pi] = r;
        data[pi + 1] = g;
        data[pi + 2] = b;
      }
    }
    lctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, canvas.width, canvas.height);

    if (!reduced) {
      ctx.save();
      for (var n = particles.length - 1; n >= 0; n--) {
        var q = particles[n];
        q.x += q.vx; q.y += q.vy; q.life--;
        if (q.life <= 0 || q.y < -4) {
          particles.splice(n, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, q.life / 40);
        ctx.fillStyle = q.kind === "ember" ? "#ffb35a" : "#d7e6ef";
        ctx.fillRect(q.x, q.y, 2, 2);
      }
      ctx.restore();
    } else {
      particles.length = 0;
    }
  }

  function updateMeters() {
    $("fps").textContent = String(fps);
    $("cells").textContent = String(world.activeCount());
    $("material").textContent = SA.NAMES[selected] + (eraseMode ? " (eraser)" : "");
    $("brush").textContent = String(brush * 2 + 1);
    $("seed").textContent = "0x" + SEED.toString(16).toUpperCase();
    $("speed-label").textContent = speed + "×";
    var info = SA.PRESETS[preset];
    $("preset-summary").textContent = info.title + " — " + info.summary;
    $("pause-btn").textContent = paused ? "Resume" : "Pause";
    $("pause-btn").setAttribute("aria-pressed", paused ? "true" : "false");
    document.querySelectorAll(".mat").forEach(function (btn) {
      btn.setAttribute("aria-pressed", Number(btn.dataset.type) === selected ? "true" : "false");
    });
  }

  function buildPalette() {
    var host = $("materials");
    host.innerHTML = "";
    SA.NAMES.forEach(function (name, id) {
      var btn = document.createElement("button");
      btn.className = "mat";
      btn.type = "button";
      btn.dataset.type = String(id);
      btn.dataset.name = name.toLowerCase();
      btn.setAttribute("aria-label", name);
      btn.innerHTML = '<span class="swatch" style="background:rgb(' + SA.COLORS[id].join(",") + ')"></span><small>' + name + "</small>";
      btn.addEventListener("click", function () {
        selected = id;
        eraseMode = id === SA.EMPTY;
        updateMeters();
      });
      host.appendChild(btn);
    });
  }

  $("mat-search").addEventListener("input", function (e) {
    var q = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".mat").forEach(function (btn) {
      btn.classList.toggle("hidden", q && btn.dataset.name.indexOf(q) === -1);
    });
  });

  $("pause-btn").addEventListener("click", function () { paused = !paused; updateMeters(); });
  $("step-btn").addEventListener("click", function () { world.step(); sampleParticles(); render(); updateMeters(); });
  $("clear-btn").addEventListener("click", function () { world.clear(); particles.length = 0; render(); updateMeters(); });
  $("reset-btn").addEventListener("click", function () { world.loadPreset(preset); particles.length = 0; render(); updateMeters(); });
  $("speed").addEventListener("input", function (e) { speed = Number(e.target.value); updateMeters(); });
  document.querySelectorAll("[data-preset]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      preset = btn.dataset.preset;
      world.loadPreset(preset);
      particles.length = 0;
      render();
      updateMeters();
    });
  });

  window.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
    if (e.code === "Space") { e.preventDefault(); paused = !paused; updateMeters(); }
    else if (e.key === ".") { world.step(); sampleParticles(); render(); updateMeters(); }
    else if (e.key === "r" || e.key === "R") { world.loadPreset(preset); particles.length = 0; render(); updateMeters(); }
    else if (e.key === "[") { brush = Math.max(0, brush - 1); updateMeters(); }
    else if (e.key === "]") { brush = Math.min(18, brush + 1); updateMeters(); }
    else if (e.key === "e" || e.key === "E") { eraseMode = !eraseMode; if (eraseMode) selected = SA.EMPTY; updateMeters(); }
    else if (e.key >= "1" && e.key <= "9") { selected = Number(e.key); eraseMode = false; updateMeters(); }
    else if (e.key === "0") { selected = SA.EMPTY; eraseMode = true; updateMeters(); }
  });

  buildPalette();
  updateMeters();
  render();

  function frame(now) {
    if (!paused) {
      var n = speed;
      while (n--) world.step();
      sampleParticles();
    }
    render();
    frames++;
    if (now - fpsT >= 500) {
      fps = Math.round(frames * 1000 / (now - fpsT));
      frames = 0;
      fpsT = now;
      updateMeters();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
