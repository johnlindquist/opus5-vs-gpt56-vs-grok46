(function () {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const engine = window.LightEngine;
  const levels = window.LightLevels;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);

  const state = {
    levelIndex: 0, pieces: [], selectedId: null, drag: null,
    undo: [], redo: [], moves: 0, hintStage: 0, result: null,
    won: false, wonAt: 0, pulse: 0
  };

  const typeInfo = {
    mirror: ["Mirror", "Reflects light symmetrically across its polished face."],
    filter: ["Channel filter", "Transmits its marked color channel and absorbs the others."],
    splitter: ["Beam splitter", "Divides energy between transmitted and reflected paths."],
    prism: ["Dispersive prism", "Separates white light into red, green, and blue rays."]
  };
  const channelHex = { r: "#ff4e51", g: "#52ff9a", b: "#4da1ff" };

  function copyPieces(pieces) { return pieces.map(p => ({ ...p, solution: p.solution ? { ...p.solution } : undefined })); }
  function selected() { return state.pieces.find(p => p.id === state.selectedId); }
  function rgb(c, alpha = 1) {
    const max = Math.max(1, c.r, c.g, c.b);
    return `rgba(${Math.round(255 * c.r / max)},${Math.round(255 * c.g / max)},${Math.round(255 * c.b / max)},${alpha})`;
  }
  function energy(c) { return Math.max(c.r, c.g, c.b); }
  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function angleDeg(a) { return Math.round(a * 180 / Math.PI); }
  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function clampPiece(p) { p.x = Math.max(70, Math.min(W - 70, p.x)); p.y = Math.max(65, Math.min(H - 65, p.y)); }

  function loadLevel(index) {
    state.levelIndex = (index + levels.length) % levels.length;
    const level = levels[state.levelIndex];
    state.pieces = copyPieces(level.pieces);
    state.selectedId = state.pieces.find(p => p.movable)?.id || null;
    state.undo = []; state.redo = []; state.moves = 0; state.hintStage = 0; state.won = false;
    $("victory").classList.remove("show");
    updateStaticUI();
    recompute();
    canvas.focus({ preventScroll: true });
  }

  function updateStaticUI() {
    const level = levels[state.levelIndex];
    $("levelNumber").textContent = String(state.levelIndex + 1).padStart(2, "0");
    $("levelName").textContent = level.name;
    $("objective").textContent = level.objective;
    document.querySelectorAll(".level-btn").forEach((b, i) => b.classList.toggle("active", i === state.levelIndex));
    updateMoveUI();
    updateInspector();
  }

  function updateMoveUI() { $("moveCount").textContent = String(state.moves).padStart(2, "0"); }
  function updateInspector() {
    const p = selected();
    const label = $("selectionLabel");
    if (!p) {
      $("selectedName").textContent = "None"; $("angleValue").textContent = "—";
      $("selectedDescription").textContent = "Click a movable optic to inspect it.";
      label.classList.remove("visible");
      return;
    }
    const info = typeInfo[p.type] || [p.type, ""];
    $("selectedName").textContent = info[0];
    $("angleValue").textContent = `${angleDeg(p.angle || 0)}°`;
    $("dialLine").style.transform = `rotate(${angleDeg(p.angle || 0)}deg)`;
    $("selectedDescription").textContent = p.type === "filter" ? `${info[1]} Current channel: ${p.channel.toUpperCase()}.` : info[1];
    const shellRect = $("boardShell").getBoundingClientRect();
    label.textContent = `${p.id.toUpperCase()} · ${angleDeg(p.angle || 0)}°`;
    label.style.left = `${p.x / W * shellRect.width}px`;
    label.style.top = `${p.y / H * shellRect.height}px`;
    label.classList.add("visible");
  }

  function recompute(allowVictory = true) {
    state.result = engine.propagate(levels[state.levelIndex], state.pieces);
    updateTargetUI();
    if (allowVictory && state.result.won && !state.won) completeLevel();
  }

  function updateTargetUI() {
    if (!state.result) return;
    $("targetList").innerHTML = state.result.targetStates.map(t => {
      const c = targetColor(t);
      return `<span class="target-chip ${t.lit ? "lit" : ""}" style="--c:${c}"><i></i>${t.label} ${t.lit ? "LOCK" : "OPEN"}</span>`;
    }).join("");
    const forbidden = Object.keys(state.result.forbiddenHits).length > 0;
    $("statusText").textContent = forbidden ? "Warning / forbidden sensor exposed" : `Ray engine stable / ${state.result.segments.length} paths`;
  }

  function completeLevel() {
    state.won = true; state.wonAt = performance.now();
    const stored = readProgress();
    const key = levels[state.levelIndex].id;
    stored[key] = stored[key] ? Math.min(stored[key], state.moves) : state.moves;
    try { localStorage.setItem("lightweaver-progress", JSON.stringify(stored)); } catch (_) {}
    $("victoryMoves").textContent = `${state.moves} move${state.moves === 1 ? "" : "s"} · best ${stored[key]}`;
    setTimeout(() => $("victory").classList.add("show"), reducedMotion ? 50 : 550);
    buildLevelStrip();
  }

  function readProgress() {
    try { return JSON.parse(localStorage.getItem("lightweaver-progress") || "{}"); } catch (_) { return {}; }
  }

  function buildLevelStrip() {
    const progress = readProgress();
    $("levelStrip").innerHTML = levels.map((l, i) =>
      `<button class="level-btn ${i === state.levelIndex ? "active" : ""} ${progress[l.id] !== undefined ? "complete" : ""}" data-level="${i}" aria-label="Load level ${i + 1}: ${l.name}" title="${l.name}${progress[l.id] !== undefined ? ` · best ${progress[l.id]}` : ""}">${i + 1}</button>`
    ).join("");
    document.querySelectorAll(".level-btn").forEach(btn => btn.addEventListener("click", () => loadLevel(+btn.dataset.level)));
  }

  function snapshot() { return { pieces: copyPieces(state.pieces), selectedId: state.selectedId }; }
  function restore(snap) { state.pieces = copyPieces(snap.pieces); state.selectedId = snap.selectedId; recompute(); updateInspector(); }
  function commit(before) {
    const after = JSON.stringify(state.pieces.map(p => [p.id, p.x, p.y, p.angle]));
    const prior = JSON.stringify(before.pieces.map(p => [p.id, p.x, p.y, p.angle]));
    if (after === prior) return;
    state.undo.push(before); if (state.undo.length > 80) state.undo.shift();
    state.redo = []; state.moves++; updateMoveUI();
  }
  function undo() {
    if (!state.undo.length || state.won) return;
    state.redo.push(snapshot()); restore(state.undo.pop()); state.moves = Math.max(0, state.moves - 1); updateMoveUI(); showToast("Move undone");
  }
  function redo() {
    if (!state.redo.length || state.won) return;
    state.undo.push(snapshot()); restore(state.redo.pop()); state.moves++; updateMoveUI(); showToast("Move restored");
  }

  let toastTimer;
  function showToast(text) {
    const toast = $("toast"); toast.textContent = text; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }
  function giveHint() {
    const hints = levels[state.levelIndex].hint;
    showToast(`Hint ${Math.min(state.hintStage + 1, hints.length)}/${hints.length}: ${hints[Math.min(state.hintStage, hints.length - 1)]}`);
    state.hintStage = Math.min(state.hintStage + 1, hints.length - 1);
  }

  function hitPiece(point) {
    let best = null, bestD = 50;
    for (const p of state.pieces) {
      if (!p.movable) continue;
      const d = Math.hypot(point.x - p.x, point.y - p.y);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", e => {
    if (state.won) return;
    const point = pointFromEvent(e), p = hitPiece(point);
    if (!p) { state.selectedId = null; updateInspector(); return; }
    state.selectedId = p.id;
    state.drag = { pointerId: e.pointerId, dx: point.x - p.x, dy: point.y - p.y, before: snapshot() };
    canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging"); updateInspector();
  });
  canvas.addEventListener("pointermove", e => {
    if (!state.drag || e.pointerId !== state.drag.pointerId) return;
    const p = selected(), point = pointFromEvent(e); if (!p) return;
    p.x = Math.round((point.x - state.drag.dx) / 2) * 2;
    p.y = Math.round((point.y - state.drag.dy) / 2) * 2;
    clampPiece(p); recompute(false); updateInspector();
  });
  function endDrag(e) {
    if (!state.drag || e.pointerId !== state.drag.pointerId) return;
    commit(state.drag.before); state.drag = null; canvas.classList.remove("dragging"); recompute(); updateInspector();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", e => {
    const p = selected(); if (!p || state.won) return;
    e.preventDefault(); const before = snapshot();
    p.angle = normalizeAngle((p.angle || 0) + (e.deltaY > 0 ? Math.PI / 24 : -Math.PI / 24));
    commit(before); recompute(); updateInspector();
  }, { passive: false });

  window.addEventListener("keydown", e => {
    if (["INPUT", "BUTTON"].includes(document.activeElement?.tagName) && e.key !== "Enter") return;
    if (/^[1-5]$/.test(e.key)) { loadLevel(+e.key - 1); return; }
    const k = e.key.toLowerCase();
    if (k === "z") return undo();
    if (k === "y") return redo();
    if (k === "r") return loadLevel(state.levelIndex);
    if (k === "h") return giveHint();
    if (e.key === "Enter" && state.won) return loadLevel(state.levelIndex + 1);
    const p = selected(); if (!p || state.won) return;
    const handled = ["q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k);
    if (!handled) return;
    e.preventDefault(); const before = snapshot();
    if (k === "q") p.angle = normalizeAngle((p.angle || 0) - Math.PI / 24);
    if (k === "e") p.angle = normalizeAngle((p.angle || 0) + Math.PI / 24);
    const step = e.shiftKey ? 10 : 2;
    if (k === "arrowup") p.y -= step; if (k === "arrowdown") p.y += step;
    if (k === "arrowleft") p.x -= step; if (k === "arrowright") p.x += step;
    clampPiece(p); commit(before); recompute(); updateInspector();
  });

  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("hintBtn").addEventListener("click", giveHint);
  $("resetBtn").addEventListener("click", () => loadLevel(state.levelIndex));
  $("nextLevel").addEventListener("click", () => loadLevel(state.levelIndex + 1));
  window.addEventListener("resize", updateInspector);

  function targetColor(t) {
    const req = t.required || [];
    if (req.includes("r") && req.includes("b")) return "#e85dff";
    if (req.length === 3) return "#ffffff";
    return channelHex[req[0]] || "#ffffff";
  }

  function drawBackground() {
    ctx.fillStyle = "#071013"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(126,181,179,.065)"; ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(126,181,179,.12)";
    for (let x = 40; x < W; x += 200) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 20; y < H; y += 200) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = "rgba(119,248,232,.2)";
    for (let x = 40; x < W; x += 40) for (let y = 20; y < H; y += 40) ctx.fillRect(x - .5, y - .5, 1, 1);
  }

  function drawBeams() {
    if (!state.result) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const seg of state.result.segments) {
      const power = Math.min(1, energy(seg.colorA));
      ctx.strokeStyle = rgb(seg.colorA, .055 * power); ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y); ctx.stroke();
    }
    for (const seg of state.result.segments) {
      const power = Math.min(1, energy(seg.colorA));
      const grad = ctx.createLinearGradient(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      grad.addColorStop(0, rgb(seg.colorA, .82 * power)); grad.addColorStop(1, rgb(seg.colorB, .35 * power));
      ctx.strokeStyle = grad; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y); ctx.stroke();
      ctx.strokeStyle = rgb(seg.colorA, .9); ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSource(s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    const glow = ctx.createRadialGradient(0,0,2,0,0,30); glow.addColorStop(0,rgb(s.color,.55));glow.addColorStop(1,rgb(s.color,0));
    ctx.fillStyle=glow;ctx.fillRect(-30,-30,60,60);
    ctx.fillStyle="#101d20";ctx.strokeStyle="rgba(189,229,224,.42)";ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-25,-17,35,34,5);ctx.fill();ctx.stroke();
    ctx.fillStyle=rgb(s.color,.95);ctx.fillRect(8,-5,15,10);ctx.fillStyle="#eaffff";ctx.fillRect(19,-2,7,4);
    ctx.restore();
  }

  function drawTarget(t, index) {
    const stateT = state.result?.targetStates.find(x => x.id === t.id);
    const c = targetColor(t), lit = stateT?.lit;
    ctx.save();ctx.translate(t.x,t.y);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(state.pulse * .002 + index) * .06;
    ctx.scale(pulse,pulse);ctx.strokeStyle=lit?c:"rgba(190,218,214,.34)";ctx.lineWidth=lit?3:1.5;
    ctx.shadowColor=c;ctx.shadowBlur=lit?24:7;
    ctx.beginPath();ctx.arc(0,0,(t.radius||20)+8,0,Math.PI*2);ctx.stroke();
    ctx.rotate(Math.PI/4);ctx.strokeRect(-14,-14,28,28);ctx.rotate(-Math.PI/4);
    ctx.fillStyle=lit?c:"rgba(7,15,17,.8)";ctx.globalAlpha=lit?.65:.8;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle="rgba(190,218,214,.55)";ctx.font="9px Consolas";ctx.textAlign="center";ctx.fillText(t.label,0,46);
    ctx.restore();
  }

  function drawWall(wall) {
    const s=engine.segmentFor(wall);ctx.strokeStyle="rgba(104,132,133,.35)";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(s.a.x,s.a.y);ctx.lineTo(s.b.x,s.b.y);ctx.stroke();
    ctx.strokeStyle="rgba(192,220,216,.18)";ctx.lineWidth=1;ctx.stroke();
  }

  function drawSensor(sensor) {
    const s=engine.segmentFor(sensor), hit=state.result?.forbiddenHits[sensor.id];
    ctx.save();ctx.strokeStyle=hit?"rgba(255,75,75,.85)":"rgba(231,164,79,.5)";ctx.lineWidth=12;ctx.setLineDash([4,7]);
    ctx.shadowColor=hit?"#ff4343":"#e3a550";ctx.shadowBlur=hit?18:5;ctx.beginPath();ctx.moveTo(s.a.x,s.a.y);ctx.lineTo(s.b.x,s.b.y);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle=hit?"#ff6969":"#b99058";ctx.font="9px Consolas";ctx.textAlign="center";ctx.fillText(hit?"SENSOR TRIPPED":"FORBIDDEN SENSOR",sensor.x,sensor.y-sensor.length/2-14);ctx.restore();
  }

  function opticPath(p) {
    const len=p.length||90;
    if(p.type==="prism"){ctx.beginPath();ctx.moveTo(-len*.46,len*.42);ctx.lineTo(0,-len*.48);ctx.lineTo(len*.46,len*.42);ctx.closePath();return;}
    ctx.beginPath();ctx.roundRect(-len/2,-8,len,16,5);
  }

  function drawPiece(p) {
    const active=p.id===state.selectedId;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle||0);
    if(active){ctx.strokeStyle="rgba(119,248,232,.24)";ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(0,0,57,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(p.type==="mirror"){
      ctx.shadowColor="#aefef3";ctx.shadowBlur=active?15:5;ctx.fillStyle="#152226";opticPath(p);ctx.fill();
      const len=p.length||90;const grad=ctx.createLinearGradient(-len/2,0,len/2,0);grad.addColorStop(0,"#4e6869");grad.addColorStop(.5,"#effffd");grad.addColorStop(1,"#526a6a");
      ctx.strokeStyle=grad;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-len/2,-4);ctx.lineTo(len/2,-4);ctx.stroke();
      ctx.strokeStyle="rgba(44,67,69,.9)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-len/2,5);ctx.lineTo(len/2,5);ctx.stroke();
    } else if(p.type==="filter"){
      const c=channelHex[p.channel];ctx.shadowColor=c;ctx.shadowBlur=active?18:8;ctx.fillStyle=c+"33";ctx.strokeStyle=c;ctx.lineWidth=2;opticPath(p);ctx.fill();ctx.stroke();
      ctx.fillStyle=c;ctx.globalAlpha=.65;for(let x=-p.length/2+10;x<p.length/2;x+=12)ctx.fillRect(x,-5,2,10);
    } else if(p.type==="splitter"){
      ctx.shadowColor="#9fffe9";ctx.shadowBlur=active?18:8;ctx.fillStyle="rgba(141,243,225,.15)";ctx.strokeStyle="rgba(205,255,246,.8)";ctx.lineWidth=2;opticPath(p);ctx.fill();ctx.stroke();
      ctx.strokeStyle="rgba(119,248,232,.45)";ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(-p.length/2+6,0);ctx.lineTo(p.length/2-6,0);ctx.stroke();ctx.setLineDash([]);
    } else if(p.type==="prism"){
      ctx.shadowColor="#9fffe9";ctx.shadowBlur=active?20:9;const g=ctx.createLinearGradient(-45,-35,45,35);g.addColorStop(0,"rgba(99,179,255,.18)");g.addColorStop(.5,"rgba(191,255,240,.35)");g.addColorStop(1,"rgba(255,104,130,.18)");
      ctx.fillStyle=g;ctx.strokeStyle="rgba(205,255,246,.75)";ctx.lineWidth=2;opticPath(p);ctx.fill();ctx.stroke();
    }
    ctx.shadowBlur=0;if(p.movable){ctx.fillStyle=active?"#77f8e8":"#668688";ctx.beginPath();ctx.arc(0,0,3.2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  function drawLabels() {
    ctx.save();ctx.font="8px Consolas";ctx.fillStyle="rgba(136,167,166,.48)";
    state.pieces.forEach(p=>{ctx.fillText(p.id.toUpperCase(),p.x-(p.length||90)/2,p.y+(p.type==="prism"?58:27));});
    ctx.restore();
  }

  function frame(now) {
    state.pulse=now;drawBackground();
    const level=levels[state.levelIndex];
    (level.walls||[]).forEach(drawWall);drawBeams();(level.sources||[]).forEach(drawSource);
    (level.sensors||[]).forEach(drawSensor);(level.targets||[]).forEach(drawTarget);
    state.pieces.filter(p=>p.id!==state.selectedId).forEach(drawPiece);if(selected())drawPiece(selected());drawLabels();
    requestAnimationFrame(frame);
  }

  buildLevelStrip(); loadLevel(0); requestAnimationFrame(frame);
})();
