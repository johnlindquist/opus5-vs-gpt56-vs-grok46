/* Headless check harness for engine.js.
 *
 * Node has no Canvas2D, so this provides a minimal stub that:
 *   - rasterises fillText into a real alpha buffer (block glyphs), so the
 *     sampler, link builder and physics run on genuine mask data;
 *   - asserts every drawing coordinate is finite, so a single NaN anywhere in
 *     the simulation fails the run instead of silently blanking a poster.
 *
 * It does not verify pixel aesthetics — only that the machine works.
 * Run: node check.js
 */
'use strict';

// engine.js is a browser script (UMD-style). Evaluate its source directly so the
// harness works regardless of the surrounding package's module type.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const Engine = mod.exports;

let failures = 0;
let checks = 0;
function ok(name, cond, extra) {
  checks++;
  if (cond) { console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { failures++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); }
}

/* --------------------------------------------------------- canvas stub */

function num(v, where) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new Error('non-finite drawing argument in ' + where + ': ' + v);
  }
}

function makeCanvas(w, h) {
  const cv = { width: w, height: h };
  let alpha = new Uint8Array(w * h);
  let fontSize = 100;
  const ctx = {
    canvas: cv,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    textAlign: 'left', textBaseline: 'alphabetic',
    set font(v) {
      const m = /([\d.]+)px/.exec(String(v));
      fontSize = m ? parseFloat(m[1]) : 100;
      this._font = v;
    },
    get font() { return this._font; },
    measureText(t) { return { width: String(t).length * fontSize * 0.58 }; },
    fillText(t, x, y) {
      num(x, 'fillText.x'); num(y, 'fillText.y');
      if (cv.width !== Engine.POSTER_W) return;
      const w0 = Math.max(1, Math.round(String(t).length * fontSize * 0.5));
      const h0 = Math.max(1, Math.round(fontSize * 0.72));
      const x0 = Math.round(x), y0 = Math.round(y - h0);
      for (let yy = y0; yy < y0 + h0; yy++) {
        if (yy < 0 || yy >= cv.height) continue;
        for (let xx = x0; xx < x0 + w0; xx++) {
          if (xx < 0 || xx >= cv.width) continue;
          alpha[yy * cv.width + xx] = 255;
        }
      }
    },
    clearRect(x, y, w2, h2) {
      num(x, 'clearRect'); num(y, 'clearRect'); num(w2, 'clearRect'); num(h2, 'clearRect');
      alpha.fill(0);
    },
    fillRect(x, y, w2, h2) { num(x, 'fillRect.x'); num(y, 'fillRect.y'); num(w2, 'fillRect.w'); num(h2, 'fillRect.h'); },
    strokeRect(x, y, w2, h2) { num(x, 'strokeRect'); num(y, 'strokeRect'); },
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
    moveTo(x, y) { num(x, 'moveTo.x'); num(y, 'moveTo.y'); },
    lineTo(x, y) { num(x, 'lineTo.x'); num(y, 'lineTo.y'); },
    arc(x, y, r, a, b) { num(x, 'arc.x'); num(y, 'arc.y'); num(r, 'arc.r'); },
    setTransform() {},
    createLinearGradient(a, b, c, d) { num(a, 'linGrad'); num(d, 'linGrad'); return { addColorStop() {} }; },
    createRadialGradient(a, b, c, d, e, f) { num(c, 'radGrad'); num(f, 'radGrad'); return { addColorStop() {} }; },
    createPattern() { return { pattern: true }; },
    getImageData(x, y, w2, h2) {
      const data = new Uint8ClampedArray(w2 * h2 * 4);
      for (let i = 0; i < w2 * h2; i++) data[i * 4 + 3] = alpha[i];
      return { data, width: w2, height: h2 };
    }
  };
  cv.getContext = function () { return ctx; };
  return cv;
}

function newFoundry(opts) {
  opts = opts || {};
  return Engine.createFoundry({
    makeCanvas,
    reducedMotion: !!opts.reduced,
    viewportWidth: () => opts.viewportWidth || 1600
  });
}

function nodesFinite(f) {
  const n = f._debug.nodes();
  for (let i = 0; i < n.count; i++) {
    if (!isFinite(n.px[i]) || !isFinite(n.py[i]) || !isFinite(n.vx[i]) || !isFinite(n.vy[i])) return false;
  }
  return true;
}
function meanHomeError(f) {
  const n = f._debug.nodes();
  if (!n.count) return 0;
  let s = 0;
  for (let i = 0; i < n.count; i++) s += Math.hypot(n.px[i] - n.hx[i], n.py[i] - n.hy[i]);
  return s / n.count;
}

/* ------------------------------------------------------------- 1. build */

console.log('\n[1] default poster build');
const f = newFoundry();
let info = f.info();
ok('default phrase splits to two lines', info.lines.length === 2 && info.lines[0] === 'FRONTIER', info.lines.join(' / '));
ok('nodes sampled from glyph mask', info.nodes > 400, info.nodes + ' nodes');
ok('nodes under hard cap', info.nodes <= 7000, String(info.nodes));
ok('structural links built', info.links > info.nodes * 0.5, info.links + ' links');
ok('stage canvas is 1600x900', f.stage.width === 1600 && f.stage.height === 900,
  f.stage.width + 'x' + f.stage.height);
ok('type size fits margins', info.size >= 22 && info.size <= 470, info.size + 'px');

/* -------------------------------------------------- 2. determinism/seed */

console.log('\n[2] deterministic sampling');
const f2 = newFoundry();
const a1 = f._debug.nodes(), a2 = f2._debug.nodes();
let same = a1.count === a2.count;
if (same) for (let i = 0; i < a1.count; i++) { if (a1.hx[i] !== a2.hx[i] || a1.hy[i] !== a2.hy[i]) { same = false; break; } }
ok('two fresh foundries produce identical sample maps', same, a1.count + ' vs ' + a2.count);

/* --------------------------------------------- 3. simulation + drawing */

console.log('\n[3] 400 frames with wind, vortex, ripple, impulse');
let drawError = null;
let peak = 0;
try {
  for (let frame = 0; frame < 400; frame++) {
    peak = Math.max(peak, meanHomeError(f));
    if (frame === 40) f.movePointer(600, 400);
    if (frame > 40 && frame < 90) f.movePointer(600 + frame * 4, 400 + Math.sin(frame / 6) * 60);
    if (frame === 100) f.pointerDown(800, 450);
    if (frame > 100 && frame < 160) f.movePointer(800 + Math.cos(frame / 8) * 180, 450 + Math.sin(frame / 8) * 120);
    if (frame === 160) f.pointerUp();
    if (frame === 220) f.impulse();
    f.step(1);
    f.render();
  }
} catch (e) { drawError = e; }
ok('no non-finite drawing arguments over 400 frames', !drawError, drawError ? drawError.message : '');
ok('node state stays finite', nodesFinite(f));
ok('interaction visibly deforms the composition', peak > 4, 'peak mean offset ' + peak.toFixed(2) + 'px');
ok('composition settles again afterwards', meanHomeError(f) < peak * 0.35,
  'settled to ' + meanHomeError(f).toFixed(2) + 'px');

console.log('\n[4] rest (R) returns type to its typographic form');
f.impulse();
for (let i = 0; i < 30; i++) f.step(1);
const afterImpulse = meanHomeError(f);
f.rest();
for (let i = 0; i < 260; i++) { f.step(1); f.render(); }
const atRest = meanHomeError(f);
ok('impulse displaces the poster', afterImpulse > 3, afterImpulse.toFixed(2) + 'px');
ok('rest converges back to home positions', atRest < 1.2 && atRest < afterImpulse,
  afterImpulse.toFixed(2) + 'px -> ' + atRest.toFixed(2) + 'px');

/* -------------------------------------------------------- 5. rebuilds */

console.log('\n[5] rebuilds on phrase / font / layout / density / margin');
function snapshot(fd) { const n = fd._debug.nodes(); return { c: n.count, h0: n.hx[0], h1: n.hy[0] }; }
const base = snapshot(f);
let r = f.setState({ phrase: 'MIDNIGHT / SIGNAL' });
ok('phrase change rebuilds', r.rebuilt && r.nodes > 300, r.nodes + ' nodes');
const s1 = snapshot(f);
ok('new phrase yields a different sample map', s1.c !== base.c || s1.h0 !== base.h0);

const beforeFont = snapshot(f);
f.setState({ fontStack: 'mono' });
ok('font stack change rebuilds', snapshot(f).c !== beforeFont.c || snapshot(f).h0 !== beforeFont.h0);
f.setState({ fontStack: 'grotesk' });

const beforeLayout = snapshot(f);
f.setState({ layout: 'single' });
ok('layout change rebuilds to one line', f.info().lines.length === 1, f.info().lines[0]);
f.setState({ layout: 'stack' });
ok('layout returns to two lines', f.info().lines.length === 2);

const dLo = (f.setState({ density: 0.4 }), f.info().nodes);
const dHi = (f.setState({ density: 1.6 }), f.info().nodes);
ok('density materially changes node count', dHi > dLo * 1.6, dLo + ' -> ' + dHi);
f.setState({ density: 1 });

const mTight = (f.setState({ margin: 0.04 }), f.info().size);
const mWide = (f.setState({ margin: 0.26 }), f.info().size);
ok('margins materially change type size', mTight > mWide * 1.3, mTight + 'px -> ' + mWide + 'px');
f.setState({ margin: 0.10 });

function meanX(fd) {
  const n = fd._debug.nodes();
  let s = 0;
  for (let i = 0; i < n.count; i++) s += n.hx[i];
  return s / n.count;
}
const alignL = (f.setState({ align: 'left' }), meanX(f));
const alignR = (f.setState({ align: 'right' }), meanX(f));
ok('alignment moves the composition', Math.abs(alignR - alignL) > 20,
  alignL.toFixed(1) + ' -> ' + alignR.toFixed(1));
f.setState({ align: 'center' });

/* ----------------------------------------------------- 6. edge phrases */

console.log('\n[6] empty and very long phrases');
const fe = newFoundry();
fe.setState({ phrase: '' });
let emptyErr = null;
try { for (let i = 0; i < 60; i++) { fe.step(1); fe.render(); } } catch (e) { emptyErr = e; }
ok('empty phrase produces zero nodes', fe.info().nodes === 0 && fe.info().empty);
ok('empty poster still renders without error', !emptyErr, emptyErr ? emptyErr.message : '');
fe.setState({ phrase: '   /  //  ' });
ok('whitespace-only phrase treated as empty', fe.info().empty);

const longText = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG WHILE THE CITY SLEEPS AND THE NEON SIGNS FLICKER ACROSS THE EMPTY BOULEVARD UNTIL SUNRISE ARRIVES AT LAST FOREVER';
fe.setState({ phrase: longText });
const li = fe.info();
ok('long phrase clipped to 140 chars', fe.state.phrase.length === 140, 'stored ' + fe.state.phrase.length);
ok('long phrase wraps to at most 4 lines', li.lines.length > 1 && li.lines.length <= 4, li.lines.length + ' lines');
ok('long phrase still legible size', li.size >= 22, li.size + 'px');
ok('long phrase still samples nodes', li.nodes > 300, li.nodes + ' nodes');
let longErr = null;
try { for (let i = 0; i < 60; i++) { fe.step(1); fe.render(); } } catch (e) { longErr = e; }
ok('long poster renders without error', !longErr, longErr ? longErr.message : '');

/* --------------------------------------------------------- 7. presets */

console.log('\n[7] four curated presets');
const seen = {};
let presetErr = null;
for (let p = 0; p < 4; p++) {
  const pr = f.applyPreset(p);
  const st = f.state;
  const i2 = f.info();
  seen[pr.key] = {
    nodes: i2.nodes, stiffness: st.stiffness, damping: st.damping, trail: st.trail,
    glow: st.glow, palette: st.palette, layout: st.layout, line: pr.mode.line, density: st.density
  };
  try { for (let k = 0; k < 40; k++) { f.step(1); f.render(); } } catch (e) { presetErr = e; }
}
ok('all four presets render', !presetErr, presetErr ? presetErr.message : '');
const keys = Object.keys(seen);
ok('presets are electric / chrome / ink / signal',
  keys.join(',') === 'electric,chrome,ink,signal', keys.join(','));
const distinctLines = new Set(keys.map(k => seen[k].line)).size;
const distinctPal = new Set(keys.map(k => seen[k].palette)).size;
const distinctLayout = new Set(keys.map(k => seen[k].layout)).size;
const distinctNodes = new Set(keys.map(k => seen[k].nodes)).size;
ok('each preset uses a distinct line treatment', distinctLines === 4, keys.map(k => seen[k].line).join(','));
ok('each preset uses a distinct palette', distinctPal === 4, keys.map(k => seen[k].palette).join(','));
ok('each preset uses a distinct layout', distinctLayout === 4, keys.map(k => seen[k].layout).join(','));
ok('presets differ in density/node count', distinctNodes === 4, keys.map(k => seen[k].nodes).join(','));
ok('presets differ in motion params',
  new Set(keys.map(k => seen[k].stiffness + '/' + seen[k].damping)).size === 4);

/* ------------------------------------------- 8. screens & reduced motion */

console.log('\n[8] small screens and reduced motion');
f.applyPreset(0);
const bigCount = f.info().nodes;
const small = newFoundry({ viewportWidth: 600 });
ok('small viewport lowers particle budget', small.info().nodes < bigCount * 0.75,
  bigCount + ' -> ' + small.info().nodes);
const rm = newFoundry({ reduced: true });
ok('reduced motion lowers particle budget', rm.info().nodes < bigCount * 0.75,
  bigCount + ' -> ' + rm.info().nodes);
rm.impulse();
for (let i = 0; i < 8; i++) rm.step(1);
const rmMove = meanHomeError(rm);
const norm = newFoundry();
norm.impulse();
for (let i = 0; i < 8; i++) norm.step(1);
ok('reduced motion damps impulse amplitude', rmMove < meanHomeError(norm) * 0.6,
  rmMove.toFixed(2) + 'px vs ' + meanHomeError(norm).toFixed(2) + 'px');
ok('reduced motion still deforms (interactive)', rmMove > 0.2, rmMove.toFixed(2) + 'px');

/* ------------------------------------------------- 9. no rebuild churn */

console.log('\n[9] sample map is not rebuilt per frame');
const f3 = newFoundry();
const before = f3._debug.nodes().hx;
for (let i = 0; i < 120; i++) { f3.step(1); f3.render(); }
ok('home array identity unchanged across 120 frames', f3._debug.nodes().hx === before);
const r2 = f3.setState({ glow: 0.3, trail: 0.2, palette: 'ember', marks: false });
ok('light/palette controls do not trigger a rebuild', r2.rebuilt === false);

console.log('\n' + (failures ? 'FAILED' : 'PASSED') + ': ' + (checks - failures) + '/' + checks + ' checks\n');
process.exit(failures ? 1 : 0);
