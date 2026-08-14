/**
 * check.mjs — headless smoke tests for Neon Courier.
 *
 * Extracts the inline <script> from index.html, boots it against a minimal
 * DOM + Canvas2D stub, then drives the real fixed-timestep simulation and the
 * real renderer. Nothing here re-implements game logic: every assertion runs
 * against the exact code the browser executes.
 *
 *   node check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

/* ------------------------------- reporting -------------------------------- */
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail){
  if (cond){ pass++; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
}
function section(t){ console.log(`\n${t}`); }

/* ------------------------------ canvas stub ------------------------------- */
const CTX_NOOPS = [
  'save','restore','translate','scale','rotate','setTransform','transform','resetTransform',
  'beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse',
  'rect','fill','stroke','clip','fillRect','strokeRect','clearRect','fillText','strokeText',
  'drawImage','setLineDash','arcTo'
];
let drawCalls = 0;
function makeCtx(){
  const ctx = {
    canvas:null,
    createLinearGradient(){ return { addColorStop(){} }; },
    createRadialGradient(){ return { addColorStop(){} }; },
    createPattern(){ return null; },
    measureText(){ return { width: 10 }; },
    getLineDash(){ return []; },
  };
  for (const m of CTX_NOOPS) ctx[m] = () => { drawCalls++; };
  // property bag: assigning fillStyle/font/etc. must not throw
  return ctx;
}

/* -------------------------------- DOM stub -------------------------------- */
function makeEl(id, tag){
  const el = {
    id, tagName:(tag||'div').toUpperCase(),
    _attrs:{}, _listeners:{}, textContent:'', style:{}, className:'',
    clientWidth:1600, clientHeight:900, width:1600, height:900,
    setAttribute(k,v){ this._attrs[k]=String(v); },
    getAttribute(k){ return this._attrs[k] ?? null; },
    addEventListener(t,fn){ (this._listeners[t] ||= []).push(fn); },
    removeEventListener(){},
    dispatch(t,ev){ for (const fn of (this._listeners[t]||[])) fn(ev||{ preventDefault(){}, pointerId:1 }); },
    focus(){ dom.activeElement = this; },
    closest(){ return null; },
    setPointerCapture(){}, releasePointerCapture(){},
    getContext(){ return this._ctx ||= makeCtx(); },
  };
  return el;
}
const elements = {};
for (const id of ['game','live','btnPause','btnRestart','btnSound','btnMotion','help','tools','rules','ui','stage'])
  elements[id] = makeEl(id, id === 'game' ? 'canvas' : (id.startsWith('btn') ? 'button' : 'div'));

const dom = {
  activeElement: null,
  getElementById(id){ return elements[id] || null; },
  addEventListener(){}, removeEventListener(){},
  createElement(t){ return makeEl('', t); },
};

/* ------------------------------ window stub ------------------------------- */
const winListeners = {};
const storeMem = new Map();
const win = {
  devicePixelRatio: 1,
  innerWidth: 1600, innerHeight: 900,
  addEventListener(t, fn){ (winListeners[t] ||= []).push(fn); },
  removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){} }; },
  requestAnimationFrame(){ return 0; },   // loop is driven manually below
  cancelAnimationFrame(){},
  performance: { now: () => 0 },
  AudioContext: undefined,
  localStorage: {
    getItem(k){ return storeMem.has(k) ? storeMem.get(k) : null; },
    setItem(k,v){ storeMem.set(k, String(v)); },
    removeItem(k){ storeMem.delete(k); },
  },
};
function fireWin(type, ev){ for (const fn of (winListeners[type]||[])) fn(ev || {}); }

/* --------------------------- extract & boot script ------------------------ */
section('boot');
const start = html.indexOf('<script>');
const end   = html.lastIndexOf('</script>');
ok('index.html contains exactly one inline script block',
   start !== -1 && end > start && html.split('<script').length === 2,
   `${html.split('<script').length - 1} script tag(s)`);
const source = html.slice(start + '<script>'.length, end);

let boomed = null;
try {
  const runner = new Function(
    'window','document','localStorage','performance','requestAnimationFrame',
    'cancelAnimationFrame','navigator','console','matchMedia',
    source
  );
  runner(win, dom, win.localStorage, win.performance, win.requestAnimationFrame,
         win.cancelAnimationFrame, { userAgent:'node' }, console, win.matchMedia);
} catch (e){ boomed = e; }
ok('page script boots with no exception', !boomed, boomed ? boomed.stack.split('\n')[0] : '');
if (boomed) { report(); process.exit(1); }

const N = win.__neon;
ok('game object exposed', !!(N && N.game && N.renderer));

const { game, renderer, MODE, DT, Bot, World, VW, VH } = N;
const ctx = elements.game.getContext();

/* ------------------------------ helpers ----------------------------------- */
let renderErrors = 0;
function step(seconds, { render = true } = {}){
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++){
    game.update(DT);
    if (render && i % 4 === 0){
      try { renderer.draw(ctx, DT*4); } catch (e){ if (renderErrors++ === 0) console.log('   render error:', e.stack.split('\n')[0]); }
    }
  }
}
/** deepest overlap of the player box into the body of any rooftop (px) */
function worstPenetration(){
  const p = game.player;
  let worst = 0;
  for (const s of game.world.segs){
    if (p.x + p.w <= s.x || p.x >= s.x + s.w) continue;
    const d = (p.y + p.h) - s.top;
    if (d > worst) worst = d;
  }
  return worst;
}

/* ============================== 1. attract ================================= */
section('attract mode');
game.startAttract();
ok('starts in attract mode', game.mode === MODE.attract || game.mode === 'attract', game.mode);

let attractCrashAt = null, attractJumps = 0, attractDashes = 0, maxPen = 0;
let wasGround = true, wasDash = false;
{
  const ticks = Math.round(20 / DT);
  for (let i = 0; i < ticks; i++){
    game.update(DT);
    if (i % 4 === 0){ try { renderer.draw(ctx, DT*4); } catch(e){ if (renderErrors++ === 0) console.log('   render error:', e.stack.split('\n')[0]); } }
    const p = game.player;
    if (wasGround && !p.onGround) attractJumps++;
    if (!wasDash && p.dashT > 0) attractDashes++;
    wasGround = p.onGround; wasDash = p.dashT > 0;
    if (game.mode === 'dead' && attractCrashAt === null) attractCrashAt = i * DT;
    if (game.mode !== 'dead') maxPen = Math.max(maxPen, worstPenetration());
    // the real loop restarts attract after a wipeout; mirror that here
    if (game.mode === 'dead' && game.attractRestart !== undefined){
      game.attractRestart -= DT;
      if (game.attractRestart <= 0){ game.attractRestart = undefined; game.startAttract(); }
    }
  }
}
ok('attract bot survives at least 7s (screenshot window)',
   attractCrashAt === null || attractCrashAt >= 7,
   attractCrashAt === null ? 'no crash in 20s' : `first crash at ${attractCrashAt.toFixed(1)}s`);
ok('attract demonstrates jumps', attractJumps >= 3, `${attractJumps} jumps`);
ok('attract demonstrates dashes', attractDashes >= 1, `${attractDashes} dashes`);
ok('attract makes forward progress', game.dist > 200, `${Math.floor(game.dist)} m`);
ok('no render exceptions during attract', renderErrors === 0, `${renderErrors} errors, ${drawCalls} draw calls`);

/* ======================== 2. a full playable run =========================== */
section('playable run (one button only)');
game.startPlay();
ok('first input leaves attract mode', game.mode === 'play', game.mode);

const bot = new Bot(game);
let deaths = 0, restarts = 0, nearMissSeen = 0, breaksSeen = 0, comboSeen = 1, slowmoSeen = 0, penetration = 0;
let firstDeathDist = 0;
{
  const ticks = Math.round(120 / DT);
  for (let i = 0; i < ticks; i++){
    if (game.mode === 'play') bot.think(DT);
    game.update(DT);
    if (i % 6 === 0){ try { renderer.draw(ctx, DT*6); } catch(e){ if (renderErrors++ === 0) console.log('   render error:', e.stack.split('\n')[0]); } }
    if (game.mode === 'play'){
      penetration = Math.max(penetration, worstPenetration());
      nearMissSeen = Math.max(nearMissSeen, game.nearMisses);
      breaksSeen   = Math.max(breaksSeen, game.breaks);
      comboSeen    = Math.max(comboSeen, game.combo);
      if (game.timeScale < 0.75) slowmoSeen++;
    }
    if (game.mode === 'dead' && game.deathT === 0){
      deaths++;
      if (deaths === 1) firstDeathDist = game.dist;
    }
    if (game.mode === 'dead' && game.deathT > 0.6){
      game.startPlay(); bot.reset();
      if (game.mode === 'play' && game.dist === 0 && game.score === 0) restarts++;
    }
  }
}
ok('run reaches a real distance before dying', firstDeathDist > 120 || deaths === 0,
   `first run ${Math.floor(firstDeathDist)} m, ${deaths} death(s) in 120s`);
ok('game over then instant restart yields a clean fresh run',
   deaths === 0 || restarts >= deaths - 1,   // a death in the final tick has no room to restart
   `${deaths} death(s), ${restarts} clean restart(s)`);
ok('near-miss system fires', nearMissSeen > 0, `${nearMissSeen} near misses`);
ok('combo rises above 1', comboSeen > 1, `peak x${comboSeen}`);
ok('slow-motion emphasis triggers on close calls', slowmoSeen > 0, `${slowmoSeen} ticks in slow-mo`);
ok('no tunnelling: player never sinks into a rooftop', penetration < 24,
   `max penetration ${penetration.toFixed(1)} px`);
ok('score accumulates', game.score > 0, `score ${Math.floor(game.score)}`);

/* ====================== 3. mechanics: coyote / buffer ====================== */
section('one-button mechanics');
{
  // deterministic breakable-sign scenario: hop, then dash through the neon
  const scenario = (useDash) => {
    game.startPlay();
    // replace the course with one long flat roof carrying a single sign
    const seg = { id:0, x:-700, w:4200, top:650, hazards:[] };
    game.world.segs.length = 0; game.world.segs.push(seg);
    game.world.cursor = 3500; game.world.lastTop = 650;
    const p = game.player;
    p.y = seg.top - p.h; p.vy = 0; p.onGround = true;
    const sign = game.world.makeHazard({ t:'sign', ox:(p.x + 620) - seg.x, h:170, hue:'m' }, seg);
    game.world.hazards.length = 0;
    game.world.hazards.push(sign);
    // Play it the way a person would: hop just before the sign, then dash into
    // it at chest height. Without the dash the same approach must be fatal.
    let hopped = false, dashed = false;
    for (let i = 0; i < 400 && game.mode === 'play'; i++){
      const lead = sign.x - (p.x + p.w);
      if (!hopped && p.onGround && lead < 120){
        game.rawPress(); game.update(DT); game.rawRelease(); hopped = true; continue;
      }
      if (useDash && hopped && !dashed && !p.onGround && lead < 70){
        game.rawPress(); game.update(DT); game.rawRelease(); dashed = true; continue;
      }
      game.update(DT);
      if (sign.dead) break;
    }
    return { dead: sign.dead, mode: game.mode, breaks: game.breaks, hopped, dashed };
  };
  const withDash = scenario(true);
  ok('dashing smashes a breakable sign', withDash.dead && withDash.breaks > 0 && withDash.mode === 'play',
     `destroyed=${withDash.dead}, mode=${withDash.mode}, hopped=${withDash.hopped}, dashed=${withDash.dashed}`);
  const noDash = scenario(false);
  ok('the same approach without dashing ends the run', !noDash.dead && noDash.mode === 'dead',
     `mode=${noDash.mode}`);
}
{
  // coyote time: leave the ground, then press within the window -> still jumps
  game.startPlay();
  const p = game.player;
  p.onGround = false; p.coyote = 0.08; p.vy = 40;
  game.rawPress(); game.update(DT); game.rawRelease(); game.update(DT);
  ok('coyote time: late press after leaving a ledge still jumps', p.vy < -400, `vy ${p.vy.toFixed(0)}`);
}
{
  // jump buffer: press while airborne with dash spent -> jump fires on landing
  game.startPlay();
  const p = game.player;
  const top = game.world.segs[0].top;
  p.onGround = false; p.coyote = 0; p.dashReady = false; p.vy = 600;
  p.y = top - p.h - 30;
  game.rawPress(); game.update(DT); game.rawRelease();
  const buffered = p.buffer > 0;
  let jumped = false;
  for (let i = 0; i < 30; i++){ game.update(DT); if (p.vy < -400) { jumped = true; break; } }
  ok('jump buffering: airborne press queues a jump', buffered, `buffer ${p.buffer.toFixed(3)}s`);
  ok('jump buffering: queued jump fires on landing', jumped, `vy ${p.vy.toFixed(0)}`);
}
{
  // charged jump goes measurably higher than a tap jump
  game.startPlay();
  const p = game.player;
  game.rawPress(); game.update(DT); game.rawRelease(); game.update(DT);
  const tapV = p.vy;
  game.startPlay();
  const q = game.player;
  game.rawPress();
  for (let i = 0; i < Math.round(0.34 / DT); i++) game.update(DT);
  game.rawRelease(); game.update(DT);
  const chargeV = q.vy;
  ok('hold-to-charge produces a higher jump', chargeV < tapV - 200,
     `tap ${tapV.toFixed(0)} vs charged ${chargeV.toFixed(0)}`);
}
{
  // dash: airborne tap with charge available
  game.startPlay();
  const p = game.player;
  game.rawPress(); game.update(DT); game.rawRelease(); game.update(DT);   // jump
  for (let i = 0; i < 12; i++) game.update(DT);
  game.rawPress(); game.update(DT); game.rawRelease();
  const dashed = p.dashT > 0 && p.vxBoost > 500;
  ok('dash: airborne tap dashes forward', dashed, `dashT ${p.dashT.toFixed(2)} boost ${p.vxBoost.toFixed(0)}`);
  const before = p.dashReady;
  game.rawPress(); game.update(DT); game.rawRelease();
  ok('dash is limited to one per airtime', before === false, `dashReady ${before}`);
}

/* ====================== 4. difficulty & determinism ======================== */
section('difficulty, seed, persistence');
{
  game.startPlay();
  const d0 = game.difficulty(), s0 = game.speed;
  step(30, { render:false });
  const d1 = game.difficulty(), s1 = game.speed;
  ok('difficulty rises gradually', d1 > d0 && d1 <= 1, `${d0.toFixed(2)} -> ${d1.toFixed(2)}`);
  ok('speed ramps and is capped', s1 > s0 && s1 <= 880, `${s0.toFixed(0)} -> ${s1.toFixed(0)} px/s`);
}
{
  const layout = seed => {
    const w = new World(seed);
    w.ensure(30000, 0.5);
    return w.segs.map(s => `${s.x.toFixed(2)}:${s.w.toFixed(2)}:${s.top.toFixed(2)}`).join('|');
  };
  ok('world generation is deterministic for a given seed', layout(12345) === layout(12345));
  ok('different seeds give different courses', layout(12345) !== layout(999));
  ok('daily seed is exposed in the UI', typeof game.seedLabel === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(game.seedLabel), game.seedLabel);
}
{
  storeMem.clear();
  game.best = 0; game.bestDist = 0;      // ignore anything earlier runs banked
  game.startPlay();
  game.score = 4242;
  game.dist = 300;
  game.die('test');
  const raw = storeMem.get('neon-courier.v1');
  const parsed = raw ? JSON.parse(raw) : null;
  ok('best score persists to localStorage', parsed && parsed.best === 4242, raw || 'nothing written');

  // a second Game instance should read the stored best back
  const g2 = new N.Game(elements.game);
  ok('stored best is read back on load', g2.best === 4242, `best ${g2.best}`);
}

/* ====================== 5. bounded memory / recycling ====================== */
section('resource bounds');
{
  game.startPlay();
  let maxSegs = 0, maxHaz = 0, maxParts = 0;
  const b2 = new Bot(game);
  for (let i = 0; i < Math.round(150 / DT); i++){
    if (game.mode === 'play') b2.think(DT);
    game.update(DT);
    maxSegs = Math.max(maxSegs, game.world.segs.length);
    maxHaz  = Math.max(maxHaz, game.world.hazards.length);
    maxParts = Math.max(maxParts, game.particles.n);
    if (game.mode === 'dead' && game.deathT > 0.6){ game.startPlay(); b2.reset(); }
  }
  ok('rooftop segments are recycled', maxSegs < 80, `peak ${maxSegs} segments`);
  ok('hazard list stays bounded', maxHaz < 160, `peak ${maxHaz} hazards`);
  ok('particle pool is capped', maxParts <= 420, `peak ${maxParts} particles`);
  ok('rain drop count is fixed', game.rain.drops.length <= 260, `${game.rain.drops.length} drops`);
}

/* ========================= 6. resize / reduced motion ====================== */
section('resize & accessibility');
{
  game.startPlay();
  step(4, { render:false });
  const before = { x:game.player.x, y:game.player.y, top:game.world.segs[0].top, dist:game.dist };
  elements.game.clientWidth = 900; elements.game.clientHeight = 1400;
  win.devicePixelRatio = 2;
  fireWin('resize');
  try { renderer.draw(ctx, 0.016); } catch(e){ renderErrors++; }
  elements.game.clientWidth = 2560; elements.game.clientHeight = 1080;
  fireWin('resize');
  try { renderer.draw(ctx, 0.016); } catch(e){ renderErrors++; }
  const after = { x:game.player.x, y:game.player.y, top:game.world.segs[0].top, dist:game.dist };
  ok('resize does not disturb collision coordinates',
     before.x === after.x && before.y === after.y && before.top === after.top && before.dist === after.dist);
  ok('renders at extreme aspect ratios without error', renderErrors === 0, `${renderErrors} errors`);
}
{
  game.setReduced(true);
  ok('reduced motion thins the rain', game.rain.drops.length <= 90, `${game.rain.drops.length} drops`);
  game.startPlay();
  const b3 = new Bot(game);
  let dist0 = game.dist;
  for (let i = 0; i < Math.round(20 / DT); i++){
    if (game.mode === 'play') b3.think(DT);
    game.update(DT);
    if (i % 8 === 0){ try { renderer.draw(ctx, DT*8); } catch(e){ renderErrors++; } }
    if (game.mode === 'dead' && game.deathT > 0.6){ game.startPlay(); b3.reset(); }
  }
  ok('reduced-motion mode remains playable', game.dist > dist0 + 100, `${Math.floor(game.dist)} m`);
  ok('reduced motion damps screen shake', game.shake < 30, `shake ${game.shake.toFixed(1)}`);
  game.setReduced(false);
}
{
  // pause + the render paths for every mode
  game.startPlay(); step(1, {render:false});
  game.togglePause();
  const distPaused = game.dist; step(1, {render:false});
  ok('P pauses the simulation', game.dist === distPaused);
  game.togglePause();
  step(0.5, {render:false});
  ok('P resumes the simulation', game.dist > distPaused);

  let modeErrors = 0;
  for (const setup of [() => game.startAttract(), () => game.startPlay(), () => { game.startPlay(); game.die('render test'); }]){
    setup();
    for (let i = 0; i < 90; i++){ game.update(DT); }
    try { renderer.draw(ctx, 0.016); } catch(e){ modeErrors++; console.log('   ', e.stack.split('\n')[0]); }
  }
  ok('renderer is exception-free in attract, play and game-over states', modeErrors === 0);
  ok('accessible live region is updated', typeof elements.live.textContent === 'string' && elements.live.textContent.length > 0,
     JSON.stringify(elements.live.textContent.slice(0, 60)));
}

/* ============================ 7. static checks ============================= */
section('static checks');
{
  const remote = /(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html)
              || /fetch\s*\(|XMLHttpRequest|importScripts|new\s+WebSocket|@import\s+url\(\s*["']?https?:/i.test(html);
  ok('no remote runtime reference in index.html', !remote);
  ok('no external file references', !/<(script|link|img|source|iframe)[^>]*\s(src|href)=/i.test(html));
  ok('declares Space, pointer and touch input', /pointerdown/.test(html) && /Spacebar|' '/.test(html) && /touch-action/.test(html));
  ok('visible keyboard focus styles present', /focus-visible/.test(html));
  ok('uses localStorage for the best score', /localStorage/.test(html));
  ok('honours prefers-reduced-motion', /prefers-reduced-motion/.test(html));
  ok('viewport-independent design resolution 1600x900', VW === 1600 && VH === 900);
}

/* --------------------------------- report --------------------------------- */
function report(){
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('failed: ' + failures.join(', '));
}
report();
process.exit(fail ? 1 : 0);
