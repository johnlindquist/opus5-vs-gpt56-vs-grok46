/**
 * Signal Garden — ecosystem balance probe.
 *
 * Runs each preset headlessly for several simulated minutes and reports whether
 * the attract state stays *interesting*, not merely alive: blooms must keep
 * cycling open, signal pulses must keep propagating, and drifters must stay
 * well clear of the emergency population floor.
 *
 *   node tools/balance.mjs [--minutes 5] [--reduced-motion]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const source = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];

const minutes = Number((process.argv.find((a) => a.startsWith('--minutes=')) || '').split('=')[1]) || 5;
const reduced = process.argv.includes('--reduced-motion');

/* minimal canvas/DOM stub — see tools/selftest.mjs for the annotated version */
const noop = () => {};
const grad = () => ({ addColorStop: noop });
const mkCtx = () => new Proxy({
  createRadialGradient: grad, createLinearGradient: grad,
  createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  measureText: () => ({ width: 0 })
}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)), set: () => true });
const mkCanvas = () => ({
  tagName: 'CANVAS', width: 1600, height: 900, style: {}, _h: {},
  getContext: mkCtx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
  addEventListener: noop, setPointerCapture: noop, setAttribute: noop
});
const mkEl = () => ({
  textContent: '', style: {}, attrs: {}, _h: {},
  classList: { add: noop, remove: noop }, firstElementChild: { style: {} },
  addEventListener: noop, setAttribute: noop, getAttribute: noop, click: noop
});
const els = new Map();
const document = {
  activeElement: null,
  getElementById: (id) => (els.has(id) ? els : els.set(id, id === 'scene' ? mkCanvas() : mkEl())).get(id),
  createElement: (t) => (t === 'canvas' ? mkCanvas() : mkEl()),
  addEventListener: noop
};
const window = {
  devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900,
  matchMedia: (q) => ({ matches: reduced && /reduced-motion/.test(q), addEventListener: noop }),
  addEventListener: noop, requestAnimationFrame: () => 0, setTimeout, clearTimeout
};
window.window = window; window.document = document;
const sandbox = {
  window, document, console, setTimeout, clearTimeout,
  requestAnimationFrame: () => 0, Math, JSON, Date,
  Float32Array, Uint8ClampedArray, Map, Set, String, Number, Array, Object, Error, isNaN, parseFloat, parseInt
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'index.html:script' });
const SG = sandbox.window.SignalGarden;

// prefers-reduced-motion intentionally runs a smaller, calmer world, so the
// liveliness bar scales with it rather than being waived
const THRESHOLDS = reduced ? {
  minDrifters: 12, minBlooms: 5,
  maxBlooms: 300, maxDrifters: 400, maxHunters: 40,
  minOpensPerMinute: 14, minPulseSamples: 0.45
} : {
  minDrifters: 16,        // the hard floor is 8; staying near it means starvation
  minBlooms: 6,
  maxBlooms: 300, maxDrifters: 400, maxHunters: 40,
  minOpensPerMinute: 30,  // blooms must keep visibly opening — roughly one every 2s somewhere
  minPulseSamples: 0.75   // fraction of ticks with at least one live signal wave
};

let failed = 0;
console.log('\nSignal Garden balance probe — ' + minutes + ' simulated minutes/preset' +
  (reduced ? ' (prefers-reduced-motion)' : '') + '\n');

for (const preset of [0, 1, 2]) {
  SG.setPreset(preset, false);
  SG.regenerate(1337, false);
  const { blooms } = SG._internals();
  const lastCool = new Map();
  let opens = 0, pulseTicks = 0, ticks = 0, samples = 0;
  const mins = [];

  const SAMPLE = 30;                                  // seconds between samples
  for (let s = 0; s < (minutes * 60) / SAMPLE; s++) {
    for (let k = 0; k < 60 * SAMPLE; k++) {
      SG.step(1 / 60);
      ticks++;
      if (SG._internals().pulses.length > 0) pulseTicks++;
      // a bloom "opens" when it fires and resets its cooldown
      const bl = SG._internals().blooms;
      if (k % 6 === 0) {
        for (const b of bl) {
          const prev = lastCool.get(b);
          if (prev !== undefined && b.cool > prev + 1) opens++;
          lastCool.set(b, b.cool);
        }
      }
    }
    const st = SG.state();
    samples++;
    mins.push(st);
    const b = SG._internals().blooms;
    const avgE = b.reduce((a, x) => a + x.energy, 0) / Math.max(1, b.length);
    console.log('  p' + (preset + 1) + '  t=' + String(Math.round(st.simTime)).padStart(4) + 's' +
      '  blooms=' + String(st.blooms).padStart(3) +
      '  drifters=' + String(st.drifters).padStart(3) +
      '  hunters=' + String(st.hunters).padStart(2) +
      '  pulses=' + String(st.pulses).padStart(3) +
      '  avgBloomEnergy=' + avgE.toFixed(2) + '  kinds=' + JSON.stringify(SG._internals().pulses.reduce((m,x)=>((m[x.kind]=(m[x.kind]||0)+1),m),{})));
  }

  const worstD = Math.min(...mins.map((m) => m.drifters));
  const worstB = Math.min(...mins.map((m) => m.blooms));
  const peakB = Math.max(...mins.map((m) => m.blooms));
  const peakD = Math.max(...mins.map((m) => m.drifters));
  const peakH = Math.max(...mins.map((m) => m.hunters));
  const opensPerMin = opens / minutes;
  const pulseFrac = pulseTicks / ticks;

  const probs = [];
  if (worstD < THRESHOLDS.minDrifters) probs.push('drifters bottomed out at ' + worstD);
  if (worstB < THRESHOLDS.minBlooms) probs.push('blooms bottomed out at ' + worstB);
  if (peakB > THRESHOLDS.maxBlooms || peakD > THRESHOLDS.maxDrifters || peakH > THRESHOLDS.maxHunters)
    probs.push('runaway population B' + peakB + ' D' + peakD + ' H' + peakH);
  if (opensPerMin < THRESHOLDS.minOpensPerMinute) probs.push('only ' + opensPerMin.toFixed(1) + ' bloom openings/min');
  if (pulseFrac < THRESHOLDS.minPulseSamples) probs.push('signals quiet in ' + Math.round((1 - pulseFrac) * 100) + '% of the run');

  if (probs.length) { failed++; console.log('  → FAIL: ' + probs.join('; ') + '\n'); }
  else console.log('  → ok: ' + opensPerMin.toFixed(1) + ' bloom openings/min, signals live in ' +
    Math.round(pulseFrac * 100) + '% of the run, drifters never below ' + worstD + '\n');
}

console.log(failed ? failed + ' preset(s) out of balance\n' : 'all presets stay lively and bounded\n');
process.exit(failed ? 1 : 0);
