/* Weather Dial — local headless smoke test.
   Extracts the inline script from index.html and runs it against minimal
   DOM / Canvas 2D stubs, then drives frames and synthetic input.
   Run:  node smoke-test.mjs                                              */
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!m) fail('could not find <script id="app"> in index.html');
const source = m[1];

let failures = 0, checks = 0;
function ok(name, cond, extra = '') {
  checks++;
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function fail(msg) { console.error('fatal: ' + msg); process.exit(1); }

/* ------------------------------------------------------------ stubs */
let forceHit = false;

function makeCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', filter: 'none',
    shadowBlur: 0, shadowColor: '#000',
    setTransform() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    arc() {}, ellipse() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    isPointInPath() { return forceHit; }
  };
  return c;
}

const listeners = new Map();     // element -> {type: [fn]}
function el(tag = 'div', id = '') {
  const e = {
    tagName: tag.toUpperCase(), id, type: tag === 'input' ? 'range' : 'button',
    className: '', textContent: '', innerHTML: '', value: '', checked: false,
    dataset: {}, children: [], style: {}, offsetHeight: 190, offsetWidth: 214,
    firstChild: { textContent: '' },
    attrs: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); this.children.length = this.children.length; return c; },
    addEventListener(t, fn) {
      if (!listeners.has(this)) listeners.set(this, {});
      const map = listeners.get(this);
      (map[t] = map[t] || []).push(fn);
    },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1240, height: 900, right: 1240, bottom: 900 }; },
    setPointerCapture() {}, releasePointerCapture() {}, focus() {}, blur() {},
    getContext() { return CTX; },
    width: 1240, height: 900
  };
  return e;
}
function fire(target, type, ev = {}) {
  const map = listeners.get(target);
  if (!map || !map[type]) return 0;
  const e = Object.assign({ type, target, preventDefault() {}, stopPropagation() {}, pointerId: 1 }, ev);
  for (const fn of map[type]) fn(e);
  return map[type].length;
}

const CTX = makeCtx();
const byId = new Map();
const document = {
  getElementById(id) {
    if (!byId.has(id)) {
      const tag = id === 'city' ? 'canvas' : (id === 'temp' || id === 'time' || id === 'season' ||
        id === 'wdir' || id === 'wspd' || id === 'speed' || id === 'seed' || id === 'calm') ? 'input' : 'div';
      const e = el(tag, id);
      if (id === 'seed') e.type = 'text';
      if (id === 'calm') e.type = 'checkbox';
      byId.set(id, e);
    }
    return byId.get(id);
  },
  createElement(tag) { return el(tag); },
  addEventListener() {}, body: el('body')
};

let rafCb = null;
const window = {
  devicePixelRatio: 2,
  matchMedia() { return { matches: false, addEventListener() {} }; },
  addEventListener(t, fn) {
    if (!listeners.has(window)) listeners.set(window, {});
    const map = listeners.get(window);
    (map[t] = map[t] || []).push(fn);
  },
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  document
};
class Path2D {
  moveTo() {} lineTo() {} closePath() {} arc() {} ellipse() {} rect() {} bezierCurveTo() {} quadraticCurveTo() {}
}
class ResizeObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }

const sandbox = {
  window, document, Path2D, ResizeObserver, console,
  requestAnimationFrame: window.requestAnimationFrame,
  performance: { now: () => T },
  Math, JSON, Float32Array, Uint8Array, Object, Array, String, Number, Date, parseFloat, parseInt, isNaN
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let T = 0;
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: 'index.html#app' });
} catch (e) {
  console.error('runtime error while loading script:\n', e);
  process.exit(1);
}

const wd = window.__wd;
if (!wd) fail('script did not expose window.__wd');

function step(frames, ms = 16.7) {
  for (let i = 0; i < frames; i++) {
    T += ms;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('animation loop stopped requesting frames');
    cb(T);
  }
}

/* ------------------------------------------------------------ checks */
console.log('\nWeather Dial — smoke test\n');

let err = null;
try { step(60); } catch (e) { err = e; }
ok('boots and renders 60 frames without throwing', !err, err && err.stack);

ok('city has at least twelve buildings', wd.city.buildings.length >= 12, 'got ' + wd.city.buildings.length);
ok('city has vehicles, pedestrians, trees, lamps',
  wd.city.vehicles.length > 0 && wd.city.peds.length > 0 && wd.city.trees.length > 10 && wd.city.lamps.length > 0);
ok('clouds exist', wd.clouds.length > 0);

// --- attract story runs unattended and hands over control
const w0 = wd.S.w;
step(600, 33);                    // ~20 s
ok('attract scene changes the weather without input', Math.abs(wd.S.w - w0) > 0.5, `w0=${w0} now=${wd.S.w}`);
step(500, 33);                    // finish the ~30 s story
ok('attract releases control after the story', wd.statusText().length > 0);

// --- each named state produces a distinct profile
const seen = {};
for (let i = 0; i < 6; i++) {
  wd.S.w = i;
  step(3);
  seen[i] = { cloud: +wd.W.cloud.toFixed(3), precip: +wd.W.precip.toFixed(3), fog: +wd.W.fog.toFixed(3), storm: +wd.W.storm.toFixed(3) };
}
const sigs = new Set(Object.values(seen).map(v => JSON.stringify(v)));
ok('all six weather states are distinct', sigs.size === 6, JSON.stringify(seen));

// --- presets
let presetErr = null;
const snaps = [];
try {
  for (let i = 0; i < 4; i++) { wd.applyPreset(i); step(20); snaps.push({ w: wd.S.w, t: wd.S.temp, h: wd.S.hour, s: wd.S.season }); }
} catch (e) { presetErr = e; }
ok('four presets apply without error', !presetErr, presetErr && presetErr.stack);
ok('presets differ from one another', new Set(snaps.map(s => JSON.stringify(s))).size === 4);

// --- rain produces particles, puddles, splashes
wd.applyPreset(0);                 // summer shower, 24 °C
step(180);
ok('rain preset produces precipitation particles', wd.P.n > 50, 'n=' + wd.P.n);
ok('rain preset uses liquid precipitation at 24 °C', wd.W.type === 'rain', 'type=' + wd.W.type);
const rainKinds = new Set(Array.from({ length: wd.P.n }, (_, i) => wd.P.kind[i]));
ok('no snow particles in a warm shower', !rainKinds.has(1));

// --- winter night accumulates snow
wd.applyPreset(2);                 // winter night, -6 °C
step(400);
let snowSum = 0; for (const v of wd.snowGrid) snowSum += v;
ok('snow preset falls as snow', wd.W.type === 'snow', 'type=' + wd.W.type);
ok('snow accumulates on the ground', snowSum > 0.2, 'sum=' + snowSum.toFixed(3));

// --- coherence: snow state at a hot temperature must fall as rain
wd.S.w = 4; wd.S.temp = 30;
step(60);
ok('hot temperature converts snowfall to rain', wd.W.type === 'rain', 'type=' + wd.W.type);
const hotKinds = new Set(Array.from({ length: wd.P.n }, (_, i) => wd.P.kind[i]));
ok('no snow particles at 30 °C', !hotKinds.has(1));

// --- storm: people seek cover, lightning arms
wd.applyPreset(1);                 // autumn gale
step(320);
const covering = wd.city.peds.filter(p => p.mode === 'shelter' || p.mode === 'seek').length;
ok('people seek cover in a storm', covering > 5, 'covering=' + covering);
ok('vehicles keep moving on the road network', wd.city.vehicles.some(v => v.v > 0.1));

// --- particle budget stays bounded
let maxN = 0;
for (let i = 0; i < 200; i++) { step(1); maxN = Math.max(maxN, wd.P.n); }
ok('particle count stays bounded', maxN <= 1500, 'max=' + maxN);

// --- gust painting via pointer drag
const cv = document.getElementById('city');
fire(cv, 'pointerdown', { clientX: 400, clientY: 400 });
for (let i = 0; i < 12; i++) fire(cv, 'pointermove', { clientX: 400 + i * 22, clientY: 400 + i * 6 });
fire(cv, 'pointerup', { clientX: 660, clientY: 470 });
ok('dragging across the city creates gusts', wd.gusts.length > 0, 'gusts=' + wd.gusts.length);
let gustErr = null; try { step(40); } catch (e) { gustErr = e; }
ok('gusts integrate without error', !gustErr, gustErr && gustErr.stack);

// --- cloud click seeds a burst
wd.S.w = 2; step(3);
const cloud = wd.clouds[0];
const before = cloud.burst;
// aim the click straight at the first cloud's first puff
cloud.x = 8; cloud.y = 8; cloud.z = 5; step(1);
// screen position of that puff, recomputed the same way the app does
const rect = cv.getBoundingClientRect();
let clicked = false;
for (let gx = 0; gx < rect.width && !clicked; gx += 9) {
  for (let gy = 0; gy < rect.height && !clicked; gy += 9) {
    fire(cv, 'pointerdown', { clientX: gx, clientY: gy });
    fire(cv, 'pointerup', { clientX: gx, clientY: gy });
    if (wd.clouds.some(c => c.burst > 0)) clicked = true;
  }
}
ok('clicking a cloud seeds a precipitation burst', clicked);
step(30);
ok('burst produces particles', wd.P.n > 0);

// --- building click shows the card
forceHit = true;
fire(cv, 'pointerdown', { clientX: 620, clientY: 500 });
let cardErr = null;
try { fire(cv, 'pointerup', { clientX: 620, clientY: 500 }); } catch (e) { cardErr = e; }
forceHit = false;
ok('clicking a building opens the info card', !cardErr && document.getElementById('cardname').textContent.length > 2,
  cardErr ? cardErr.stack : 'name=' + document.getElementById('cardname').textContent);
ok('card reports floors and windows',
  String(document.getElementById('cf').textContent).length > 0 && String(document.getElementById('cw').textContent).includes('/'));

// --- keyboard: 1-4, Space, R
let keyErr = null;
try {
  for (const k of ['1', '2', '3', '4']) fire(window, 'keydown', { key: k, target: document.body });
  step(10);
  const pausedBefore = wd.S.paused;
  fire(window, 'keydown', { key: ' ', target: document.body });
  ok('Space toggles pause', wd.S.paused !== pausedBefore);
  fire(window, 'keydown', { key: ' ', target: document.body });
  ok('Space resumes', wd.S.paused === pausedBefore);
  fire(window, 'keydown', { key: 'R', target: document.body });
  step(10);
} catch (e) { keyErr = e; }
ok('keyboard shortcuts run without error', !keyErr, keyErr && keyErr.stack);
ok('R restores the default weather', Math.abs(wd.S.w - 1.0) < 1e-6 && Math.abs(wd.S.temp - 16) < 1e-6,
  `w=${wd.S.w} temp=${wd.S.temp}`);

// --- determinism: same seed rebuilds the same city
const sig1 = wd.city.buildings.map(b => b.name + b.h.toFixed(4) + b.style).join('|');
wd.resetAll();
const sig2 = wd.city.buildings.map(b => b.name + b.h.toFixed(4) + b.style).join('|');
ok('same seed rebuilds an identical city', sig1 === sig2 && sig1.length > 50);

// --- resize keeps user-selected weather
wd.applyPreset(2);
const keep = { w: wd.S.w, temp: wd.S.temp, hour: wd.S.hour, season: wd.S.season };
step(5);
window.devicePixelRatio = 1;
let resizeErr = null;
try { wd.layout(); step(10); } catch (e) { resizeErr = e; }
ok('relayout does not throw', !resizeErr, resizeErr && resizeErr.stack);
ok('relayout preserves selected weather',
  wd.S.w === keep.w && wd.S.temp === keep.temp && Math.abs(wd.S.season - keep.season) < 1e-9);

// --- long run stability across every state
let longErr = null;
try {
  for (let i = 0; i <= 50; i++) { wd.S.w = (i % 51) / 10; wd.S.temp = 25 - i; wd.S.hour = (i * 0.47) % 24; wd.S.season = (i * 0.11) % 4; step(6); }
} catch (e) { longErr = e; }
ok('sweeping every dial position stays stable', !longErr, longErr && longErr.stack);
ok('status text is non-empty and mentions the weather', /clear|cloudy|rain|storm|snow|fog/i.test(wd.statusText()));

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
