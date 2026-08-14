/**
 * browser-check.mjs — drives index.html in a real browser over the Chrome
 * DevTools Protocol and asserts the things a headless simulation cannot:
 * genuine key/pointer events, the rAF render loop, canvas resize, and a clean
 * console. Also writes a 7-second attract screenshot.
 *
 *   node browser-check.mjs                 # run the checks
 *   node browser-check.mjs --shot out.png  # ...and save the attract screenshot
 *
 * Uses the locally installed Google Chrome. No packages are installed and no
 * network access is used; the page is loaded from file://.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, 'index.html');

const shotIdx = process.argv.indexOf('--shot');
const shotPath = shotIdx !== -1 ? resolve(process.argv[shotIdx + 1] || 'attract.png') : null;

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const CHROME = CANDIDATES.find(existsSync);
if (!CHROME){
  console.log('SKIP: no local Chrome/Chromium found; run check.mjs for the headless suite.');
  process.exit(0);
}

let pass = 0, fail = 0; const failed = [];
const ok = (name, cond, detail) => {
  if (cond){ pass++; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; failed.push(name); console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9411;
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1600,900',
  '--hide-scrollbars', '--allow-file-access-from-files', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu',
  `--user-data-dir=${join(tmpdir(), 'neon-courier-chrome-profile')}`,   // keep the workspace clean
  'file://' + PAGE,
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 80; i++){
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        if (targets.some(t => t.type === 'page')) break; } catch(_){}
  await wait(250);
}
if (!targets?.some(t => t.type === 'page')){ console.log('FAIL: Chrome did not start'); proc.kill(); process.exit(1); }

const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const problems = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    problems.push(`${m.params.type}: ${JSON.stringify(m.params.args.map(a => a.value))}`);
  if (m.method === 'Runtime.exceptionThrown')
    problems.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description || ''}`);
};
const send = (method, params={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id:i, method, params })); });
const ev   = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
const key  = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key:k, code, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
const tap  = async (x, y, ms=50) => {
  await send('Input.dispatchMouseEvent', { type:'mousePressed',  x, y, button:'left', clickCount:1 });
  await wait(ms);
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 });
};
const state = async () => JSON.parse(await ev(`JSON.stringify({mode:__neon.game.mode,paused:__neon.game.paused,sound:__neon.game.sound,reduced:__neon.game.reduced,dist:__neon.game.dist})`));

await send('Runtime.enable');
await send('Page.enable');

/* ------------------------------ 1. attract -------------------------------- */
console.log('\nattract mode (real render loop)');
await wait(1500);
ok('page boots and exposes the game', !!(await ev('!!window.__neon')));
let s = await state();
ok('starts in attract mode without input', s.mode === 'attract', s.mode);
await wait(5500);                                    // total ~7s, the screenshot window
s = await state();
ok('attract is animating at 7s', s.dist > 120, `${Math.floor(s.dist)} m travelled`);
if (shotPath){
  const png = await send('Page.captureScreenshot', { format:'png' });
  writeFileSync(shotPath, Buffer.from(png.result.data, 'base64'));
  console.log(`  (wrote ${shotPath})`);
}

/* --------------------------- 2. taking control ---------------------------- */
console.log('\ntaking over from attract');
await key('keyDown', ' ', 'Space', 32); await wait(60); await key('keyUp', ' ', 'Space', 32);
await wait(400);
s = await state();
ok('Space starts a fresh playable run', s.mode === 'play' && s.dist < 120, `mode=${s.mode}, dist=${Math.floor(s.dist)}`);

/* -------------------- 3. one-button controls, real events ------------------ */
console.log('\none-button controls (real key & pointer events)');
// flatten the course so the timings under test are ours, not the generator's
await ev(`(()=>{const g=__neon.game;
  g.world.segs.length=0; g.world.segs.push({id:0,x:-700,w:40000,top:650,hazards:[]});
  g.world.hazards.length=0; g.world.cursor=39000; g.world.lastTop=650; g.world.ensure=()=>{};
  g.player.y=650-g.player.h; g.player.vy=0; g.player.onGround=true; return 1})()`);
await wait(150);

await tap(700, 500, 50); await wait(140);
ok('pointer tap jumps', await ev('!__neon.game.player.onGround'));
await tap(700, 500, 50); await wait(60);
ok('pointer tap while airborne dashes',
   await ev('__neon.game.player.dashT > 0 && __neon.game.player.vxBoost > 500'));
await wait(900);

await ev(`(()=>{const p=__neon.game.player; p.y=650-p.h; p.vy=0; p.onGround=true; return 1})()`);
await key('keyDown', ' ', 'Space', 32); await wait(360); await key('keyUp', ' ', 'Space', 32);
await wait(30);
const chargedVy = await ev('__neon.game.player.vy');
ok('holding Space charges a higher jump', chargedVy < -1050, `vy ${chargedVy.toFixed(0)} (a tap gives about -940)`);

/* ----------------------------- 4. P / R / M -------------------------------- */
console.log('\npause, restart, sound');
await key('keyDown','p','KeyP',80); await key('keyUp','p','KeyP',80); await wait(200);
const d1 = (await state()).dist; await wait(600); const d2 = (await state()).dist;
ok('P pauses and freezes the simulation', (await state()).paused && d1 === d2, `dist held at ${d1.toFixed(2)}`);
await key('keyDown','p','KeyP',80); await key('keyUp','p','KeyP',80); await wait(500);
ok('P resumes', !(await state()).paused && (await state()).dist > d2);

await key('keyDown','m','KeyM',77); await key('keyUp','m','KeyM',77); await wait(300);
ok('M toggles generated sound without blocking', (await state()).sound === true);
await key('keyDown','m','KeyM',77); await key('keyUp','m','KeyM',77); await wait(200);
ok('M toggles sound back off', (await state()).sound === false);

await key('keyDown','r','KeyR',82); await key('keyUp','r','KeyR',82); await wait(300);
s = await state();
ok('R restarts instantly into a fresh run', s.mode === 'play' && s.dist < 60, `dist ${Math.floor(s.dist)}`);

/* ------------------------- 5. resize & accessibility ----------------------- */
console.log('\nresize & accessibility');
const before = JSON.parse(await ev(`JSON.stringify({x:__neon.game.player.x,y:__neon.game.player.y,top:__neon.game.world.segs[0].top})`));
for (const m of [{width:900,height:1400,deviceScaleFactor:2},{width:2560,height:1000,deviceScaleFactor:1}]){
  await send('Emulation.setDeviceMetricsOverride', { ...m, mobile:false });
  await wait(500);
}
await send('Emulation.clearDeviceMetricsOverride'); await wait(500);
const after = JSON.parse(await ev(`JSON.stringify({top:__neon.game.world.segs[0].top,live:!!document.getElementById('live')})`));
ok('resizing does not corrupt world coordinates', after.top === before.top, `roof top ${after.top}`);
ok('game still running after repeated resizes', (await state()).mode !== undefined);
ok('focusable controls exist for keyboard users',
   (await ev(`document.querySelectorAll('#tools button').length`)) === 4 &&
   (await ev(`document.getElementById('game').getAttribute('tabindex')`)) === '0',
   `${await ev(`document.querySelectorAll('#tools button').length`)} buttons + focusable canvas`);
ok('canvas exposes an accessible label',
   ((await ev(`document.getElementById('game').getAttribute('aria-label')`)) || '').length > 60);
const live = await ev(`document.getElementById('live').textContent`);
ok('status live region carries current state', typeof live === 'string' && live.length > 0, JSON.stringify(live.slice(0,70)));

/* ------------------------------ 6. console -------------------------------- */
console.log('\nconsole hygiene');
await wait(6000);      // let it run (and crash/restart) a while longer
ok('no console errors or warnings, no uncaught exceptions', problems.length === 0,
   problems.length ? problems.join(' | ') : `clean across ~25s of play`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('failed: ' + failed.join(', '));
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
