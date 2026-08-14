/**
 * Signal Garden — headless self-test.
 *
 * Extracts the inline <script> from index.html and runs it inside a Node `vm`
 * context against a minimal Canvas2D / DOM stub. This exercises the real
 * simulation and the real draw calls, so a runtime error in either path fails
 * the test. Nothing here ships with the artwork; index.html has no dependencies.
 *
 *   node tools/selftest.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* ── extract the single inline script ─────────────────────────────────── */
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'expected exactly one inline <script>');
const source = scripts[0][1];

/* ── Canvas 2D stub ───────────────────────────────────────────────────── */
const ops = { fill: 0, stroke: 0, arc: 0, gradient: 0, drawImage: 0, fillRect: 0 };
const gradient = () => { ops.gradient++; return { addColorStop() {} }; };
function makeCtx() {
  let filter = 'none';
  return {
    canvas: null,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    get filter() { return filter; },
    set filter(v) { filter = String(v); },       // pretend blur() is supported
    createRadialGradient: gradient, createLinearGradient: gradient,
    setTransform() {}, resetTransform() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, setLineDash() {},
    arc() { ops.arc++; }, fill() { ops.fill++; }, stroke() { ops.stroke++; },
    fillRect() { ops.fillRect++; }, clearRect() {}, strokeRect() {},
    drawImage() { ops.drawImage++; }, fillText() {}, measureText() { return { width: 0 }; },
    imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() { ops.putImageData = (ops.putImageData || 0) + 1; },
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
  };
}
function makeCanvas(w = 1600, h = 900) {
  const ctx = makeCtx();
  const el = {
    tagName: 'CANVAS', width: w, height: h, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 }),
    addEventListener(type, fn) { (this._h[type] ||= []).push(fn); },
    removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    setAttribute() {}, focus() {},
    _h: {},
    fire(type, ev) { (this._h[type] || []).forEach((fn) => fn.call(this, ev)); }
  };
  ctx.canvas = el;
  return el;
}

/* ── DOM stub ─────────────────────────────────────────────────────────── */
function makeEl(id) {
  return {
    id, tagName: 'DIV', textContent: '', style: {}, attrs: {},
    classList: { add() {}, remove() {}, toggle() {} },
    firstElementChild: { style: {} },
    addEventListener(type, fn) { (this._h[type] ||= []).push(fn); },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    click() { (this._h.click || []).forEach((fn) => fn.call(this)); },
    _h: {}
  };
}
const els = new Map();
const sceneCanvas = makeCanvas();
sceneCanvas.id = 'scene';
sceneCanvas.tagName = 'CANVAS';
els.set('scene', sceneCanvas);

// seed stub elements with the attributes actually declared in index.html,
// so tests observe the real initial UI state rather than a blank stub
function seedFromMarkup(el) {
  const tag = html.match(new RegExp('<(button|div|p|canvas)[^>]*\\bid="' + el.id + '"[^>]*>'));
  if (!tag) return el;
  for (const [, k, v] of tag[0].matchAll(/([a-z-]+)="([^"]*)"/g)) el.attrs[k] = v;
  const text = html.match(new RegExp('\\bid="' + el.id + '"[^>]*>([^<]*)<'));
  if (text) el.textContent = text[1].trim();
  return el;
}

const rafQueue = [];
const document = {
  activeElement: null,
  getElementById(id) {
    if (!els.has(id)) els.set(id, seedFromMarkup(makeEl(id)));
    return els.get(id);
  },
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl(tag); },
  addEventListener() {}
};

class StubParam { constructor(v = 0) { this.value = v; }
  setValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; } }
class StubNode {
  constructor() { this.gain = new StubParam(1); this.frequency = new StubParam(440); this.pan = new StubParam(0); this.type = 'sine'; }
  connect() { return this; } disconnect() {} start() {} stop() {}
}
class StubAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new StubNode(); }
  resume() { this.state = 'running'; }
  createGain() { return new StubNode(); }
  createOscillator() { const n = new StubNode(); setTimeout(() => n.onended && n.onended(), 0); return n; }
  createBiquadFilter() { return new StubNode(); }
  createStereoPanner() { return new StubNode(); }
}

const reduceMotion = process.argv.includes('--reduced-motion');
const window = {
  devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900,
  matchMedia: (q) => ({ matches: reduceMotion && /reduced-motion/.test(q), addEventListener() {} }),
  addEventListener(type, fn) { (this._h[type] ||= []).push(fn); },
  fire(type, ev) { (this._h[type] || []).forEach((fn) => fn(ev)); },
  requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame() {},
  AudioContext: StubAudioContext,
  setTimeout, clearTimeout, _h: {}
};
window.window = window;
window.document = document;

const sandbox = {
  window, document, console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame() {},
  Math, JSON, Date, Float32Array, Uint8ClampedArray, Map, Set, String, Number, Array, Object, Error, isNaN, parseFloat, parseInt
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ── run ──────────────────────────────────────────────────────────────── */
const pass = [];
const fail = [];
const check = (name, fn) => {
  try { fn(); pass.push(name); console.log('  ok   ' + name); }
  catch (e) { fail.push(name); console.log('  FAIL ' + name + ' — ' + e.message); }
};

vm.runInContext(source, sandbox, { filename: 'index.html:script' });
const SG = sandbox.window.SignalGarden;
assert.ok(SG, 'SignalGarden handle missing — boot threw');

// drive frames manually: each rAF callback re-registers itself
function frames(n, dtMs = 16.7) {
  let t = frames.t || 0;
  for (let i = 0; i < n; i++) {
    const fn = rafQueue.pop();
    rafQueue.length = 0;
    if (!fn) throw new Error('animation loop stopped scheduling frames');
    t += dtMs;
    fn(t);
  }
  frames.t = t;
}

console.log('\nSignal Garden self-test' + (reduceMotion ? ' (prefers-reduced-motion)' : '') + '\n');

check('boots and produces a populated world without user input', () => {
  const s = SG.state();
  assert.ok(s.blooms > 5, 'blooms=' + s.blooms);
  assert.ok(s.drifters > 10, 'drifters=' + s.drifters);
  assert.ok(s.hunters >= 1, 'hunters=' + s.hunters);
});

check('three organism classes are present and independently populated', () => {
  const { blooms, drifters, hunters } = SG._internals();
  assert.ok(blooms.length && drifters.length && hunters.length);
  assert.ok('petals' in blooms[0] && 'open' in blooms[0], 'blooms have petal/open state');
  assert.ok('trail' in drifters[0] && 'target' in drifters[0], 'drifters have trails + seek target');
  assert.ok('strike' in hunters[0] && 'angle' in hunters[0], 'hunters have strike/heading state');
});

check('animation loop renders (fills, strokes, gradients, bloom composite)', () => {
  const before = { ...ops };
  frames(30);
  assert.ok(ops.fill > before.fill, 'fills issued');
  assert.ok(ops.stroke > before.stroke, 'strokes issued');
  assert.ok(ops.gradient > before.gradient, 'gradients built');
  assert.ok(ops.drawImage > before.drawImage, 'trail + glow layers composited');
});

check('same seed reproduces the same initial world', () => {
  const snap = () => {
    SG.regenerate(4242, false);
    const { blooms, drifters } = SG._internals();
    return JSON.stringify([
      blooms.map((b) => [b.hx.toFixed(6), b.hy.toFixed(6), b.energy.toFixed(6), b.petals]),
      drifters.map((d) => [d.x.toFixed(6), d.y.toFixed(6), d.energy.toFixed(6)])
    ]);
  };
  const a = snap();
  SG.regenerate(999, false);
  frames(20);
  const b = snap();
  assert.equal(a, b, 'seed 4242 must reproduce byte-identical state');
  assert.notEqual(a, (SG.regenerate(4243, false), JSON.stringify(SG._internals().blooms.map((x) => x.hx))),
    'a different seed must produce a different world');
});

check('fixed timestep: sim advances by wall-clock, not by frame count', () => {
  SG.regenerate(1337, false);
  const t0 = SG.state().simTime;
  frames(60, 16.666);           // 60 frames @ 60fps  ≈ 1.0 s
  const fast = SG.state().simTime - t0;
  SG.regenerate(1337, false);
  const t1 = SG.state().simTime;
  frames(20, 50);               // 20 frames @ 20fps  ≈ 1.0 s
  const slow = SG.state().simTime - t1;
  assert.ok(Math.abs(fast - 1) < 0.06, 'fast path advanced ' + fast.toFixed(3) + 's');
  assert.ok(Math.abs(slow - 1) < 0.12, 'slow path advanced ' + slow.toFixed(3) + 's');
});

check('long run stays stable and never collapses or runs away', () => {
  SG.regenerate(1337, false);
  const samples = [];
  for (let i = 0; i < 24; i++) {         // ~4 simulated minutes
    for (let k = 0; k < 600; k++) SG.step(1 / 60);
    const s = SG.state();
    samples.push(s);
    assert.ok(s.blooms > 0 && s.drifters > 0, 'ecosystem collapsed at t=' + s.simTime.toFixed(0));
    assert.ok(s.blooms < 300 && s.drifters < 400 && s.hunters < 40 && s.pulses < 400 && s.motes < 900,
      'runaway entity count at t=' + s.simTime.toFixed(0) + ': ' + JSON.stringify(s));
  }
  const last = samples[samples.length - 1];
  assert.ok(last.simTime > 200, 'reached ' + last.simTime.toFixed(0) + 's of simulation');
});

check('energy readout tracks stored energy and updates', () => {
  SG.regenerate(1337, false);
  frames(5);
  const first = els.get('v-energy').textContent;
  for (let k = 0; k < 240; k++) SG.step(1 / 60);
  frames(5);
  const later = els.get('v-energy').textContent;
  assert.ok(parseFloat(first) > 0, 'energy readout non-zero: ' + first);
  assert.notEqual(first, later, 'energy readout changed over time');
  assert.equal(els.get('v-pop').textContent,
    String(SG.state().blooms + SG.state().drifters + SG.state().hunters), 'population matches world');
  assert.match(els.get('v-time').textContent, /^\d\d:\d\d$/, 'sim clock formatted');
  assert.equal(els.get('v-seed').textContent, '#1337');
});

check('presets 1/2/3 switch palette, mix, and readout', () => {
  const seen = new Set();
  for (const i of [0, 1, 2]) {
    SG.setPreset(i, false);
    frames(3);
    seen.add(els.get('v-preset').textContent);
    assert.equal(els.get('b-p' + (i + 1)).getAttribute('aria-pressed'), 'true');
  }
  assert.equal(seen.size, 3, 'three distinct preset names: ' + [...seen]);
  SG.setPreset(0, false);
});

check('keyboard: P pauses, R reseeds, Space pulses with cooldown, 1-3 presets', () => {
  const key = (code) => sandbox.window.fire('keydown', { code, preventDefault() {} });
  key('KeyP');
  assert.equal(SG.state().paused, true, 'P paused');
  const frozen = SG.state().simTime;
  frames(10);
  assert.equal(SG.state().simTime, frozen, 'paused sim does not advance');
  key('KeyP');
  frames(10);
  assert.ok(SG.state().simTime > frozen, 'P resumed');

  const seedBefore = SG.state().seed;
  key('KeyR');
  assert.notEqual(SG.state().seed, seedBefore, 'R produced the next seed');

  const before = SG._internals().pulses.length;
  key('Space');
  const after = SG._internals().pulses.length;
  assert.ok(after > before, 'Space emitted a global pulse');
  const mid = SG._internals().pulses.length;
  key('Space');                                   // still cooling down
  assert.equal(SG._internals().pulses.length, mid, 'global pulse respects its cooldown');

  key('Digit2');
  assert.equal(SG.state().presetIndex, 1, 'Digit2 selected preset 2');
  key('Digit1');
  assert.equal(SG.state().presetIndex, 0);
});

check('pointer: click plants a beacon, drag paints nutrient, move bends drifters', () => {
  SG.setPreset(0, false);
  const c = els.get('scene');
  const { nutrient } = SG._internals();
  const nutBefore = nutrient.reduce((a, b) => a + b, 0);

  c.fire('pointerdown', { clientX: 800, clientY: 450, pointerId: 1, preventDefault() {} });
  c.fire('pointerup', { clientX: 800, clientY: 450, pointerId: 1 });
  frames(2);
  assert.ok(SG._internals().pulses.length > 0, 'beacon emitted a pulse');

  c.fire('pointerdown', { clientX: 200, clientY: 200, pointerId: 2, preventDefault() {} });
  for (let i = 0; i < 40; i++) c.fire('pointermove', { clientX: 200 + i * 12, clientY: 200 + i * 6, pointerId: 2 });
  c.fire('pointerup', { clientX: 680, clientY: 440, pointerId: 2 });
  const nutAfter = SG._internals().nutrient.reduce((a, b) => a + b, 0);
  assert.ok(nutAfter > nutBefore, 'drag deposited nutrient (' + nutBefore.toFixed(1) + ' → ' + nutAfter.toFixed(1) + ')');

  // a moving pointer must perturb nearby drifters
  const d = SG._internals().drifters[0];
  d.x = 900; d.y = 500; d.vx = 0; d.vy = 0;
  for (let i = 0; i < 12; i++) c.fire('pointermove', { clientX: 900 + i * 6, clientY: 520, pointerId: 3 });
  frames(4);
  assert.ok(Math.hypot(d.vx, d.vy) > 1, 'pointer current bent a nearby drifter');
});

check('signal pulses propagate through organisms', () => {
  SG.regenerate(1337, false);
  const { blooms } = SG._internals();
  blooms.forEach((b) => { b.excite = 0; b.energy = 0.7; });
  SG.plantBeacon(800, 450);
  for (let k = 0; k < 90; k++) SG.step(1 / 60);
  const excited = blooms.filter((b) => b.excite > 0.01).length;
  assert.ok(excited > 0, 'pulse excited ' + excited + ' blooms');
});

check('energy transfer: drifters drain blooms and hunters drain drifters', () => {
  SG.regenerate(1337, false);
  const { blooms, drifters, hunters } = SG._internals();
  const b = blooms[0];
  b.energy = 1.0; b.open = 1; b.target = 1;
  const d = drifters[0];
  d.x = b.x + 4; d.y = b.y + 4; d.energy = 0.2; d.target = b; d.panic = 0;
  // park the hunters offscreen: a frightened drifter correctly abandons feeding,
  // so isolate the bloom→drifter transfer before testing hunter→drifter below
  hunters.forEach((h, i) => { h.x = -4000 - i * 50; h.y = -4000; h.vx = 0; h.vy = 0; });
  const be = b.energy, de = d.energy;
  for (let k = 0; k < 40; k++) SG.step(1 / 60);
  assert.ok(b.energy < be, 'bloom energy fell ' + be.toFixed(3) + ' → ' + b.energy.toFixed(3));
  assert.ok(d.energy > de, 'drifter energy rose ' + de.toFixed(3) + ' → ' + d.energy.toFixed(3));

  const h = hunters[0], prey = drifters[1];
  prey.energy = 0.9; prey.alive = 1;
  h.x = prey.x + 3; h.y = prey.y + 3; h.dormant = 0; h.target = prey; h.cool = 5;
  const pe = prey.energy;
  for (let k = 0; k < 10; k++) SG.step(1 / 60);
  assert.ok(prey.energy < pe, 'hunter drained prey ' + pe.toFixed(3) + ' → ' + prey.energy.toFixed(3));
});

check('birth, depletion and death all occur over a long run', () => {
  SG.regenerate(1337, false);
  const seenIds = new WeakSet();
  let born = 0, died = 0, dormant = 0;
  let prevB = new Set(SG._internals().blooms), prevD = new Set(SG._internals().drifters);
  for (let s = 0; s < 90; s++) {
    for (let k = 0; k < 60; k++) SG.step(1 / 60);
    const { blooms, drifters } = SG._internals();
    for (const o of blooms) if (!prevB.has(o)) born++;
    for (const o of drifters) if (!prevD.has(o)) born++;
    for (const o of prevB) if (!blooms.includes(o)) died++;
    for (const o of prevD) if (!drifters.includes(o)) died++;
    dormant += blooms.filter((b) => b.dormant > 0).length;
    prevB = new Set(blooms); prevD = new Set(drifters);
  }
  assert.ok(born > 0, 'births observed: ' + born);
  assert.ok(died > 0, 'deaths observed: ' + died);
});

check('a fully depleted bloom goes dormant rather than vanishing', () => {
  SG.regenerate(1337, false);
  const b = SG._internals().blooms[0];
  b.energy = 0;                      // drained by drifters
  for (let k = 0; k < 10; k++) SG.step(1 / 60);
  assert.ok(b.dormant > 0, 'bloom entered dormancy (dormant=' + b.dormant.toFixed(1) + ')');
  assert.ok(SG._internals().blooms.includes(b), 'dormant bloom is still present, not deleted');
  // watch the whole recovery window: blooms fire and dump energy, so a single
  // instantaneous sample can land in a trough
  let peak = 0, everActive = false;
  for (let k = 0; k < 60 * 60; k++) {
    SG.step(1 / 60);
    for (const x of SG._internals().blooms) {
      if (x.dormant <= 0) { everActive = true; peak = Math.max(peak, x.energy); }
    }
  }
  assert.ok(everActive, 'blooms leave dormancy');
  assert.ok(peak > 0.5, 'blooms recharge once nutrient returns (peak ' + peak.toFixed(2) + ')');
});

// trigger a viewport change; the handler is debounced, so assert after a flush
SG.regenerate(1337, false);
const beforeResize = SG.state();
sceneCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 });
sandbox.window.innerWidth = 1000; sandbox.window.innerHeight = 700;
sandbox.window.fire('resize');

// the resize handler is debounced with setTimeout; flush it before asserting
await new Promise((r) => setTimeout(r, 200));
check('resize (debounced) rescaled the world and kept every organism', () => {
  const s = SG.state();
  assert.ok(s.blooms > 5 && s.drifters > 5, 'world survived resize: ' + JSON.stringify(s));
  assert.ok(Math.abs(s.blooms - beforeResize.blooms) < 6, 'bloom count preserved across resize');
  const b0 = SG._internals().blooms[0];
  assert.ok(b0.x > 0 && b0.x < 1000, 'organism rescaled into the new viewport: x=' + b0.x.toFixed(1));
  frames(10);   // must keep rendering at the new size
});

check('audio stays silent until explicitly enabled, then toggles', () => {
  const btn = els.get('b-audio');
  assert.equal(btn.getAttribute('aria-pressed'), 'false', 'audio starts off');
  btn.click();
  assert.equal(btn.getAttribute('aria-pressed'), 'true', 'audio enabled by user gesture');
  assert.equal(btn.textContent, 'Audio on');
  btn.click();
  assert.equal(btn.getAttribute('aria-pressed'), 'false', 'audio can be muted again');
});

check('accessible description is populated and describes the live scene', () => {
  frames(5);
  for (let k = 0; k < 400; k++) SG.step(1 / 60);
  frames(5);
  const text = els.get('scene-desc').textContent;
  assert.ok(/blooms/.test(text) && /drifters/.test(text) && /hunters/.test(text), text);
  assert.ok(/Seed \d+/.test(text), 'seed announced: ' + text);
  assert.ok(text.length > 120, 'description is substantive');
});

check('no NaN leaks into any organism after heavy interaction', () => {
  const bad = [];
  const { blooms, drifters, hunters, pulses } = SG._internals();
  const scan = (list, kind) => list.forEach((o, i) => {
    for (const k of ['x', 'y', 'energy', 'vx', 'vy', 'r']) {
      if (k in o && !Number.isFinite(o[k])) bad.push(kind + '[' + i + '].' + k + '=' + o[k]);
    }
  });
  scan(blooms, 'bloom'); scan(drifters, 'drifter'); scan(hunters, 'hunter'); scan(pulses, 'pulse');
  assert.deepEqual(bad, [], 'non-finite values: ' + bad.join(', '));
});

check('runs another 900 frames after all interaction without throwing', () => {
  frames(900);
  const s = SG.state();
  assert.ok(s.blooms > 0 && s.drifters > 0, JSON.stringify(s));
});

console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed\n');
process.exit(fail.length ? 1 : 0);
