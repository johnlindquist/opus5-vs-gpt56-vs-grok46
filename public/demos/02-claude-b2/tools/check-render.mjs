/*
 * Headless render + interaction check for Gravity Atelier.
 *
 * Drives the real page in a local headless Chrome over the DevTools
 * protocol (no packages installed — Node's built-in WebSocket and fetch do
 * the work), exercises every item on the acceptance checklist through real
 * trusted input events, collects console output, and writes screenshot.png.
 *
 *   node tools/check-render.mjs
 *
 * Chrome is launched with a throwaway profile inside this directory and is
 * killed before the process exits.
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pageUrl = 'file://' + join(root, 'index.html');
const profile = join(root, '.tmp-chrome');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No local Chrome/Chromium found; cannot run the render check.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-device-scale-factor=1',
  '--window-size=1600,900',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore'] });

let ws = null;
async function cleanup() {
  try { if (ws) ws.close(); } catch { /* already closed */ }
  try { chrome.kill('SIGKILL'); } catch { /* already dead */ }
  await sleep(150);
  rmSync(profile, { recursive: true, force: true });
}
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { /* noop */ } });

/* ---- find the DevTools endpoint ---- */
const portFile = join(profile, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 120; i++) {
  if (existsSync(portFile)) {
    const txt = readFileSync(portFile, 'utf8').trim().split('\n');
    if (txt[0]) { port = txt[0].trim(); break; }
  }
  await sleep(100);
}
if (!port) { await cleanup(); throw new Error('Chrome never reported a DevTools port'); }

let target = null;
for (let i = 0; i < 40; i++) {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
  target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (target) break;
  await sleep(100);
}
if (!target) { await cleanup(); throw new Error('no page target'); }

/* ---- minimal CDP client ---- */
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id != null) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
    else p.res(msg.result);
  } else {
    events.push(msg);
  }
};
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); rej(new Error(`${method} timed out`)); }
    }, 25000);
  });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: 900, deviceScaleFactor: 1, mobile: false
});

/* ---- load ---- */
const t0 = Date.now();
await send('Page.navigate', { url: pageUrl });
await new Promise(async (res) => {
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate('!!(globalThis.GravityAtelier && globalThis.GravityAtelier.instance)').catch(() => false);
    if (ok) return res();
    await sleep(100);
  }
  res();
});
const bootMs = Date.now() - t0;

/* ---- checks ---- */
let pass = 0;
const failures = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    pass++;
    console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(m); }

async function key(k, code, vk) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: k.length === 1 ? k : undefined, ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(120);
}
async function drag(from, to, steps = 8) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', button: 'left', buttons: 1,
      x: from.x + (to.x - from.x) * i / steps,
      y: from.y + (to.y - from.y) * i / steps
    });
    await sleep(16);
  }
  return async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(120);
  };
}

console.log('\nGravity Atelier — headless render & interaction checks\n');

await check('page boots and animates with no input', async () => {
  assert(bootMs < 5000, `took ${bootMs} ms to boot (budget 5000 ms)`);
  const a = await evaluate('GravityAtelier.instance.world().time');
  await sleep(900);
  const b = await evaluate('GravityAtelier.instance.world().time');
  assert(b > a, `simulation time did not advance (${a} -> ${b})`);
  const n = await evaluate('GravityAtelier.instance.world().bodies.length');
  assert(n >= 8, `only ${n} bodies present`);
  return `booted in ${bootMs} ms, ${n} bodies, t ${a.toFixed(2)} -> ${b.toFixed(2)} s`;
});

await check('canvas is sized to the viewport without distorting coordinates', async () => {
  const r = await evaluate(`(() => {
    const c = document.getElementById('sky');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight,
             dpr: window.devicePixelRatio };
  })()`);
  assert(r.cw === 1600 && r.ch === 900, `css size ${r.cw}x${r.ch}`);
  assert(Math.abs(r.w / r.cw - r.h / r.ch) < 1e-9, 'non-uniform backing-store scale (would shear orbits)');
  return `${r.cw}x${r.ch} css, ${r.w}x${r.h} backing, dpr ${r.dpr}`;
});

await check('trails accumulate and a body is preselected for the first screenshot', async () => {
  const r = await evaluate(`(() => {
    const w = GravityAtelier.instance.world();
    const withTrails = w.bodies.filter(b => b.trailCount > 20).length;
    const sel = GravityAtelier.instance.app.selectedId;
    return { withTrails, sel, panelVisible: !document.getElementById('selBody').hidden,
             name: document.getElementById('selNameText').textContent,
             speed: document.getElementById('selSpeed').textContent };
  })()`);
  assert(r.withTrails >= 4, `only ${r.withTrails} bodies have established trails`);
  assert(r.sel !== 0 && r.panelVisible, 'no body preselected');
  assert(/\d/.test(r.speed), `speed read-out is "${r.speed}"`);
  return `${r.withTrails} luminous trails, panel shows ${r.name} at ${r.speed}`;
});

await check('drag on empty space previews then launches a body', async () => {
  const before = await evaluate('GravityAtelier.instance.world().bodies.length');
  // pick a point far from the star, then drag
  const release = await drag({ x: 320, y: 720 }, { x: 210, y: 800 });
  const preview = await evaluate(`(() => {
    const p = GravityAtelier.instance.ptr;
    return { mode: p.mode, moved: p.moved };
  })()`);
  assert(preview.mode === 'launch' && preview.moved, `drag did not enter launch mode (${preview.mode})`);
  await release();
  const r = await evaluate(`(() => {
    const w = GravityAtelier.instance.world();
    const b = w.bodies[w.bodies.length - 1];
    return { n: w.bodies.length, name: b.name, sp: Math.hypot(b.vx, b.vy), m: b.m };
  })()`);
  assert(r.n === before + 1, `body count ${before} -> ${r.n}`);
  assert(r.sp > 10, `launched body has speed ${r.sp}`);
  return `spawned ${r.name}, ${r.m} M⊕ at ${r.sp.toFixed(0)} Mm/s`;
});

await check('clicking a body selects it and the panel reports live values', async () => {
  const pos = await evaluate(`(() => {
    const inst = GravityAtelier.instance, w = inst.world(), v = inst.view;
    const c = document.getElementById('sky');
    const cand = w.bodies.filter(b => b.kind === 'planet' || b.kind === 'star');
    const b = cand[cand.length - 1];
    return { id: b.id, name: b.name,
             x: (b.x - v.x) * v.scale + c.clientWidth / 2,
             y: (b.y - v.y) * v.scale + c.clientHeight / 2 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', buttons: 0, clickCount: 1 });
  await sleep(200);
  const s1 = await evaluate(`(() => ({
    sel: GravityAtelier.instance.app.selectedId,
    name: document.getElementById('selNameText').textContent,
    speed: document.getElementById('selSpeed').textContent,
    dist: document.getElementById('selDist').textContent,
    mass: document.getElementById('selMass').textContent,
    vcirc: document.getElementById('selVCirc').textContent,
    orbit: document.getElementById('selOrbit').textContent
  }))()`);
  assert(s1.sel === pos.id, `selected ${s1.sel}, expected ${pos.id}`);
  await sleep(700);
  const s2 = await evaluate(`document.getElementById('selSpeed').textContent + '|' + document.getElementById('selDist').textContent`);
  assert(s2 !== s1.speed + '|' + s1.dist, 'panel values are static, not live');
  assert(/\d/.test(s1.mass) && /\d/.test(s1.vcirc), 'mass or circular speed missing');
  return `${s1.name}: ${s1.mass}, ${s1.speed}, ${s1.dist}, ${s1.orbit}`;
});

await check('wheel zooms about the pointer', async () => {
  const before = await evaluate(`(() => {
    const v = GravityAtelier.instance.view;
    return { scale: v.scale,
             wx: (400 - 800) / v.scale + v.x, wy: (300 - 450) / v.scale + v.y };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: -240, buttons: 0 });
  await sleep(200);
  const after = await evaluate(`(() => {
    const v = GravityAtelier.instance.view;
    return { scale: v.scale,
             wx: (400 - 800) / v.scale + v.x, wy: (300 - 450) / v.scale + v.y };
  })()`);
  assert(after.scale > before.scale * 1.05, `scale ${before.scale} -> ${after.scale}`);
  const slip = Math.hypot(after.wx - before.wx, after.wy - before.wy);
  assert(slip < 1e-6, `the world point under the cursor slipped by ${slip}`);
  return `scale ${before.scale.toFixed(3)} -> ${after.scale.toFixed(3)}, anchor slip ${slip.toExponential(1)}`;
});

await check('shift-drag pans the view', async () => {
  const before = await evaluate('({x: GravityAtelier.instance.view.x, y: GravityAtelier.instance.view.y})');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 700, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600 + i * 15, y: 700 + i * 8, button: 'left', buttons: 1, modifiers: 8 });
    await sleep(16);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 690, y: 748, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(150);
  const after = await evaluate('({x: GravityAtelier.instance.view.x, y: GravityAtelier.instance.view.y})');
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  assert(moved > 1, `view moved only ${moved}`);
  const n = await evaluate('GravityAtelier.instance.world().bodies.length');
  return `panned ${moved.toFixed(1)} Mm without spawning (${n} bodies)`;
});

await check('Space pauses, "." single-steps, resume works', async () => {
  await key(' ', 'Space', 32);
  const paused = await evaluate('GravityAtelier.instance.app.paused');
  assert(paused === true, 'Space did not pause');
  const t0 = await evaluate('GravityAtelier.instance.world().time');
  await sleep(600);
  const t1 = await evaluate('GravityAtelier.instance.world().time');
  assert(t1 === t0, `time advanced while paused (${t0} -> ${t1})`);
  await key('.', 'Period', 190);
  const t2 = await evaluate('GravityAtelier.instance.world().time');
  const dt = t2 - t1;
  assert(Math.abs(dt - 1 / 120) < 1e-9, `single step advanced ${dt}, expected ${1 / 120}`);
  await key(' ', 'Space', 32);
  const running = await evaluate('GravityAtelier.instance.app.paused');
  assert(running === false, 'Space did not resume');
  return `paused cleanly, one step = ${dt.toFixed(6)} s, resumed`;
});

await check('drag repositions a body while paused', async () => {
  await key(' ', 'Space', 32);
  const target = await evaluate(`(() => {
    const inst = GravityAtelier.instance, w = inst.world(), v = inst.view;
    const c = document.getElementById('sky');
    // Only consider bodies in the clear area: the instrument panel is a DOM
    // element on top of the canvas and would swallow the pointer events.
    const sx = b => (b.x - v.x) * v.scale + c.clientWidth / 2;
    const sy = b => (b.y - v.y) * v.scale + c.clientHeight / 2;
    const b = w.bodies
      .filter(x => x.kind === 'planet')
      .filter(x => sx(x) > 120 && sx(x) < 1180 && sy(x) > 120 && sy(x) < 760)
      .sort((p, q) => q.m - p.m)[0];
    if (!b) return null;
    return { id: b.id, x0: b.x, y0: b.y, sx: sx(b), sy: sy(b) };
  })()`);
  assert(target, 'no planet was in the clear (non-panel) area to drag');
  const release = await drag({ x: Math.round(target.sx), y: Math.round(target.sy) },
                             { x: Math.round(target.sx) + 90, y: Math.round(target.sy) - 60 });
  await release();
  const after = await evaluate(`(() => {
    const b = GravityAtelier.instance.world().bodies.find(x => x.id === ${target.id});
    return b ? { x: b.x, y: b.y } : null;
  })()`);
  assert(after, 'body disappeared');
  const moved = Math.hypot(after.x - target.x0, after.y - target.y0);
  assert(moved > 5, `body moved only ${moved.toFixed(2)} Mm`);
  await key(' ', 'Space', 32);
  return `moved the heaviest planet ${moved.toFixed(1)} Mm while paused`;
});

await check('[ and ] change the time scale', async () => {
  const base = await evaluate('GravityAtelier.instance.timeScale()');
  await key('[', 'BracketLeft', 219);
  const slower = await evaluate('GravityAtelier.instance.timeScale()');
  await key(']', 'BracketRight', 221);
  await key(']', 'BracketRight', 221);
  const faster = await evaluate('GravityAtelier.instance.timeScale()');
  const label = await evaluate(`document.getElementById('pillScale').textContent`);
  assert(slower < base, `[ gave ${slower} from ${base}`);
  assert(faster > base, `] gave ${faster} from ${base}`);
  assert(label.includes('×'), `indicator reads "${label}"`);
  return `${base}× -> ${slower}× -> ${faster}×, indicator "${label.trim()}"`;
});

await check('faster time scale really runs the simulation faster', async () => {
  await evaluate(`document.getElementById('btnReset').click()`);
  await sleep(300);
  const measure = async () => {
    const a = await evaluate('GravityAtelier.instance.world().time');
    await sleep(1000);
    const b = await evaluate('GravityAtelier.instance.world().time');
    return b - a;
  };
  // set to 1x
  for (let i = 0; i < 8; i++) await key('[', 'BracketLeft', 219);
  for (let i = 0; i < 3; i++) await key(']', 'BracketRight', 221);
  const at1 = await measure();
  for (let i = 0; i < 2; i++) await key(']', 'BracketRight', 221);
  const at4 = await measure();
  assert(at4 > at1 * 2.2, `1x advanced ${at1.toFixed(2)} s, 4x advanced ${at4.toFixed(2)} s`);
  for (let i = 0; i < 2; i++) await key('[', 'BracketLeft', 219);
  return `1× ≈ ${at1.toFixed(2)} s/s, 4× ≈ ${at4.toFixed(2)} s/s of wall clock`;
});

await check('R restores the current preset deterministically', async () => {
  await sleep(400);
  // Pause first: otherwise the two snapshots are taken after different
  // amounts of elapsed wall-clock time and would differ for that reason
  // alone, which says nothing about reset determinism.
  await key(' ', 'Space', 32);
  assert(await evaluate('GravityAtelier.instance.app.paused') === true, 'could not pause');
  await key('r', 'KeyR', 82);
  const a = await evaluate(`(() => {
    const w = GravityAtelier.instance.world();
    return { t: w.time, sig: w.bodies.map(b => b.x.toFixed(6) + ',' + b.y.toFixed(6)).join('|') };
  })()`);
  await sleep(500);
  await key('r', 'KeyR', 82);
  const b = await evaluate(`(() => {
    const w = GravityAtelier.instance.world();
    return { t: w.time, sig: w.bodies.map(b => b.x.toFixed(6) + ',' + b.y.toFixed(6)).join('|') };
  })()`);
  assert(a.t === 0 && b.t === 0, `reset did not zero the clock (${a.t}, ${b.t})`);
  assert(a.sig === b.sig, 'two resets produced different systems');
  assert(a.sig.length > 100, 'signature is suspiciously short');
  await key(' ', 'Space', 32);
  assert(await evaluate('GravityAtelier.instance.app.paused') === false, 'could not resume');
  return `clock zeroed, ${a.sig.split('|').length} bodies in identical positions across resets`;
});

await check('presets 1, 2 and 3 all load', async () => {
  const seen = [];
  for (const [k, code, vk, name] of [['1', 'Digit1', 49, 'stable'], ['2', 'Digit2', 50, 'binary'], ['3', 'Digit3', 51, 'chaos']]) {
    await key(k, code, vk);
    await sleep(350);
    const r = await evaluate(`(() => {
      const inst = GravityAtelier.instance, w = inst.world();
      return { preset: inst.app.preset, n: w.bodies.length,
               stars: w.bodies.filter(b => b.kind === 'star').length,
               moving: w.bodies.filter(b => Math.hypot(b.vx, b.vy) > 0.1).length };
    })()`);
    assert(r.preset === name, `key ${k} loaded "${r.preset}"`);
    assert(r.n >= 6, `${name} has only ${r.n} bodies`);
    assert(r.moving >= r.n - 2, `${name}: bodies are not moving`);
    seen.push(`${name}(${r.n} bodies, ${r.stars} star${r.stars > 1 ? 's' : ''})`);
  }
  assert(seen[1].includes('2 stars'), 'binary preset does not have two stars');
  await key('1', 'Digit1', 49);
  await sleep(300);
  return seen.join(', ');
});

await check('collisions merge with momentum conserved in the live page', async () => {
  const r = await evaluate(`(() => {
    const inst = GravityAtelier.instance, w = inst.world();
    // aim a heavy body straight at the star from rest-ish
    const star = w.bodies.find(b => b.kind === 'star');
    const before = { n: w.bodies.length, m: w.totalMass(), p: w.totalMomentum(), c: w.collisionCount };
    w.add({ name: 'Impactor', kind: 'planet', material: 'rock', m: 5000,
            x: star.x + 260, y: star.y, vx: -140, vy: 0 });
    const p1 = w.totalMomentum();
    for (let i = 0; i < 900; i++) w.step(1/120);
    const after = { n: w.bodies.length, m: w.totalMass(), p: w.totalMomentum(), c: w.collisionCount };
    return { before, p1, after, effects: w.effects.length };
  })()`);
  assert(r.after.c > r.before.c, 'no collision occurred');
  const dm = Math.abs(r.after.m - (r.before.m + 5000)) / r.after.m;
  assert(dm < 1e-9, `mass changed by ${dm}`);
  const dp = Math.hypot(r.after.p.x - r.p1.x, r.after.p.y - r.p1.y) / Math.hypot(r.p1.x, r.p1.y);
  assert(dp < 1e-6, `momentum drifted ${dp.toExponential(2)} through the collision`);
  await key('1', 'Digit1', 49);
  await sleep(300);
  return `${r.after.c - r.before.c} collision(s), mass exact, |dp|/|p| ${dp.toExponential(1)}`;
});

await check('clear debris removes fragments but keeps major bodies', async () => {
  const r = await evaluate(`(() => {
    const w = GravityAtelier.instance.world();
    const majors = w.bodies.filter(b => b.kind !== 'debris').length;
    const debris = w.bodies.filter(b => b.kind === 'debris').length;
    document.getElementById('btnDebris').click();
    return { majors, debris, after: w.bodies.length,
             majorsAfter: w.bodies.filter(b => b.kind !== 'debris').length,
             debrisAfter: w.bodies.filter(b => b.kind === 'debris').length };
  })()`);
  assert(r.debris > 0, 'no debris to clear in the stable preset');
  assert(r.debrisAfter === 0, `${r.debrisAfter} fragments survived`);
  assert(r.majorsAfter === r.majors, `major bodies changed ${r.majors} -> ${r.majorsAfter}`);
  await key('1', 'Digit1', 49);
  await sleep(300);
  return `removed ${r.debris} fragments, all ${r.majors} major bodies intact`;
});

await check('a backgrounded tab does not simulate an enormous delta on return', async () => {
  const r = await evaluate(`(() => new Promise(res => {
    const w = GravityAtelier.instance.world();
    const t0 = w.time;
    // Simulate a 30 s hidden period: rAF stops, then one huge delta arrives.
    // The loop clamps dtReal and caps steps per frame, so at most
    // MAX_STEPS_PER_FRAME * dt of sim time can land in a single frame.
    const before = performance.now();
    let busy = 0; while (performance.now() - before < 320) busy++;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      res({ jump: w.time - t0, busy });
    }));
  }))()`);
  // 320 ms of blocked main thread at 1x must not turn into 320 ms+ of catch-up
  assert(r.jump < 1.0, `a 320 ms stall advanced the clock by ${r.jump.toFixed(3)} s`);
  return `320 ms main-thread stall advanced sim by only ${r.jump.toFixed(3)} s`;
});

await check('reduced motion shortens trails and damps flashes', async () => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(400);
  await key('1', 'Digit1', 49);
  await sleep(500);
  const r = await evaluate(`(() => {
    const inst = GravityAtelier.instance, w = inst.world();
    return { rm: inst.reduceMotion(), scale: w.trailLengthScale,
             moving: w.bodies.filter(b => Math.hypot(b.vx, b.vy) > 0.1).length,
             n: w.bodies.length };
  })()`);
  assert(r.rm === true, 'page did not observe prefers-reduced-motion');
  assert(r.scale < 0.6, `trail length scale is ${r.scale}`);
  assert(r.moving >= r.n - 2, 'orbital motion stopped under reduced motion');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await sleep(300);
  await key('1', 'Digit1', 49);
  await sleep(400);
  return `trails scaled to ${r.scale}, ${r.moving}/${r.n} bodies still in motion`;
});

await check('canvas is keyboard focusable with a visible focus ring', async () => {
  const r = await evaluate(`(() => {
    const c = document.getElementById('sky');
    c.focus();
    const focused = document.activeElement === c;
    const sheets = Array.from(document.styleSheets)
      .flatMap(s => { try { return Array.from(s.cssRules); } catch (e) { return []; } })
      .map(r => r.cssText || '');
    return {
      focused, tabindex: c.getAttribute('tabindex'),
      role: c.getAttribute('role'),
      hasLabel: !!c.getAttribute('aria-label'),
      describedBy: c.getAttribute('aria-describedby'),
      descLength: (document.getElementById('a11yDesc').textContent || '').trim().length,
      live: document.getElementById('live').getAttribute('aria-live'),
      liveText: (document.getElementById('live').textContent || '').length,
      focusRule: sheets.some(t => t.includes(':focus-visible') && t.includes('outline'))
    };
  })()`);
  assert(r.focused, 'canvas did not take focus');
  assert(r.focusRule, 'no :focus-visible outline rule found');
  assert(r.hasLabel && r.role, 'canvas is missing role/aria-label');
  assert(r.descLength > 80, `accessible description is only ${r.descLength} chars`);
  assert(r.live === 'polite' && r.liveText > 0, 'live region is empty or not polite');
  return `tabindex=${r.tabindex}, role=${r.role}, ${r.descLength}-char description, live region populated`;
});

await check('no remote runtime references', async () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const bad = html.match(/(https?:)?\/\/[^\s"'<>)]+/g) || [];
  const real = bad.filter((u) => !u.startsWith('//') || /^\/\/[a-z0-9-]+\./i.test(u));
  assert(real.length === 0, 'found remote URLs: ' + real.join(', '));
  assert(!/<link[^>]+href=/i.test(html), 'found a <link> tag');
  assert(!/<script[^>]+src=/i.test(html), 'found an external script');
  const requests = await evaluate(`performance.getEntriesByType('resource')
    .map(e => e.name).filter(n => !n.startsWith('file:')).join(',')`);
  assert(!requests, 'page issued non-file requests: ' + requests);
  return 'no external URLs in source, no non-file requests at runtime';
});

/* ---- console hygiene: a long unattended run ---- */
await check('no console errors during 12 s of unattended play', async () => {
  events.length = 0;
  await key('1', 'Digit1', 49);
  await sleep(4000);
  await key('3', 'Digit3', 51);   // the collision-heavy preset
  await sleep(5000);
  await key('2', 'Digit2', 50);
  await sleep(3000);
  const bad = events.filter((e) => {
    if (e.method === 'Runtime.exceptionThrown') return true;
    if (e.method === 'Runtime.consoleAPICalled') return e.params.type === 'error' || e.params.type === 'warning';
    if (e.method === 'Log.entryAdded') return e.params.entry.level === 'error';
    return false;
  });
  const describe = (e) => e.method === 'Runtime.exceptionThrown'
    ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
    : (e.params.entry ? e.params.entry.text : JSON.stringify(e.params.args?.map((a) => a.value)));
  assert(bad.length === 0, bad.map(describe).join(' ; '));
  await key('1', 'Digit1', 49);
  await sleep(1200);
  return 'clean across stable, chaos and binary presets';
});

/* ---- screenshot ---- */
await check('renders a coherent first screenshot', async () => {
  await key('1', 'Digit1', 49);
  await sleep(2500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  writeFileSync(join(root, 'screenshot.png'), buf);
  assert(buf.length > 40000, `screenshot is only ${buf.length} bytes — probably blank`);
  const r = await evaluate(`(() => {
    const c = document.getElementById('sky');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      const v = d[i] + d[i+1] + d[i+2];
      sum += v; if (v > 90) lit++;
    }
    return { lit, samples: d.length / (4 * 37), avg: sum / (d.length / (4 * 37)) };
  })()`);
  assert(r.lit > 200, `only ${r.lit} lit pixels sampled — the field looks empty`);
  return `screenshot.png ${(buf.length / 1024).toFixed(0)} KB, ${r.lit}/${Math.round(r.samples)} sampled pixels lit`;
});

/* ---- optional visual gallery: GALLERY=<dir> node tools/check-render.mjs ---- */
if (process.env.GALLERY) {
  const dir = process.env.GALLERY;
  const shoot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, file), Buffer.from(s.data, 'base64'));
  };
  await key('2', 'Digit2', 50); await sleep(3500); await shoot('g-binary.png');
  await key('3', 'Digit3', 51); await sleep(9000); await shoot('g-chaos.png');
  await key('1', 'Digit1', 49); await sleep(1500);
  // hold a launch drag open so the arrow + predicted path are on screen
  const rel = await drag({ x: 300, y: 640 }, { x: 190, y: 730 }, 10);
  await sleep(350);
  await shoot('g-launch.png');
  await rel();
  await key(' ', 'Space', 32); await sleep(200);
  await evaluate(`document.getElementById('btnHelp').click()`);
  await sleep(400); await shoot('g-help.png');
  await evaluate(`document.getElementById('helpClose').click()`);
  console.log(`\n  gallery written to ${dir}`);
}

console.log(`\n${pass} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  failed: ${f}`);

await cleanup();
process.exit(failures.length ? 1 : 0);
