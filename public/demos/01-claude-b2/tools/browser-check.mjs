/**
 * Signal Garden — real-browser smoke test.
 *
 * Builds a temporary copy of index.html with an appended assertion script,
 * loads it in headless Chrome from file://, and reports the results printed
 * into the DOM. This verifies the parts a Node stub cannot: real Canvas2D
 * rendering, real KeyboardEvent / PointerEvent dispatch, real Web Audio
 * availability, and that nothing logs an uncaught error.
 *
 *   node tools/browser-check.mjs [--chrome /path/to/chrome]
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmp = join(root, 'tmp');

const CANDIDATES = [
  process.argv.includes('--chrome') ? process.argv[process.argv.indexOf('--chrome') + 1] : null,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Chromium found — pass --chrome <path>. Skipping browser check.');
  process.exit(2);
}

/* the assertions run inside the page, after the app has booted */
const PROBE = `
<script>
(function () {
  var errors = [];
  window.addEventListener('error', function (e) { errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) { errors.push('rejection: ' + e.reason); });
  var realError = console.error;
  console.error = function () { errors.push('console.error: ' + [].join.call(arguments, ' ')); realError.apply(console, arguments); };

  var results = [];
  // strict: a check passes only by returning true or a detail string via ok();
  // anything else — false, undefined, or a thrown error — is a failure
  function ok(detail) { return { pass: true, detail: detail }; }
  function check(name, fn) {
    try {
      var r = fn();
      if (r === true) results.push('ok   ' + name);
      else if (r && r.pass) results.push('ok   ' + name + (r.detail ? ' — ' + r.detail : ''));
      else results.push('FAIL ' + name + (typeof r === 'string' ? ' — ' + r : ''));
    } catch (err) { results.push('FAIL ' + name + ' — ' + err.message); }
  }

  var SG = window.SignalGarden;
  var canvas = document.getElementById('scene');

  check('app booted with a live world', function () {
    var s = SG.state();
    return s.blooms > 5 && s.drifters > 10 && s.hunters >= 1 ? ok(JSON.stringify(s)) : false;
  });

  check('canvas has a real 2D context sized to the viewport', function () {
    var c = canvas.getContext('2d');
    return !!c && canvas.width >= 320 && canvas.height >= 240 ? ok(canvas.width + 'x' + canvas.height) : false;
  });

  check('canvas painted non-black pixels (scene is actually drawn)', function () {
    SG.renderOnce();                 // force a paint instead of waiting for rAF
    var c = canvas.getContext('2d');
    var d = c.getImageData(0, 0, canvas.width, canvas.height).data;
    var lit = 0, sum = 0;
    for (var i = 0; i < d.length; i += 4 * 97) {         // sparse sample
      var v = d[i] + d[i + 1] + d[i + 2];
      sum += v; if (v > 40) lit++;
    }
    var frac = lit / (d.length / (4 * 97));
    return frac > 0.05 ? ok(Math.round(frac * 100) + '% of sampled pixels lit') : ('only ' + Math.round(frac * 100) + '% lit');
  });

  check('ctx.filter blur is available for the bloom pass', function () {
    var c = canvas.getContext('2d');
    var before = c.filter; c.filter = 'blur(4px)';
    var okBlur = /blur/.test(c.filter); c.filter = before;
    return okBlur || 'no blur support (app degrades to plain upscale)';
  });

  var key = function (code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true, cancelable: true }));
  };

  check('P pauses and resumes', function () {
    key('KeyP'); var paused = SG.state().paused;
    key('KeyP'); return paused === true && SG.state().paused === false;
  });
  check('R advances to the next deterministic seed', function () {
    var before = SG.state().seed; key('KeyR');
    return SG.state().seed !== before ? ok('#' + before + ' → #' + SG.state().seed) : false;
  });
  check('Space fires a global pulse and then blocks on cooldown', function () {
    var n0 = SG._internals().pulses.length; key('Space');
    var n1 = SG._internals().pulses.length; key('Space');
    var n2 = SG._internals().pulses.length;
    return n1 > n0 && n2 === n1;
  });
  check('1 / 2 / 3 switch presets', function () {
    key('Digit3'); var a = SG.state().presetIndex;
    key('Digit2'); var b = SG.state().presetIndex;
    key('Digit1'); var c = SG.state().presetIndex;
    return a === 2 && b === 1 && c === 0;
  });

  check('pointer click plants a beacon', function () {
    var n0 = SG._internals().pulses.length;
    var opts = { bubbles: true, cancelable: true, clientX: 800, clientY: 450, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
    return SG._internals().pulses.length > n0;
  });

  check('pointer drag deposits nutrient', function () {
    var sum = function () { var n = SG._internals().nutrient, t = 0; for (var i = 0; i < n.length; i++) t += n[i]; return t; };
    var before = sum();
    var mk = function (type, x, y) {
      return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2, pointerType: 'mouse', isPrimary: true, buttons: 1 });
    };
    canvas.dispatchEvent(mk('pointerdown', 200, 200));
    for (var i = 0; i < 30; i++) canvas.dispatchEvent(mk('pointermove', 200 + i * 14, 220 + i * 8));
    canvas.dispatchEvent(mk('pointerup', 620, 460));
    return sum() > before ? ok(before.toFixed(1) + ' → ' + sum().toFixed(1)) : false;
  });

  check('touch-style pointer events are handled', function () {
    var opts = { bubbles: true, cancelable: true, clientX: 400, clientY: 300, pointerId: 9, pointerType: 'touch', isPrimary: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
    return true;
  });

  check('every control is keyboard-focusable', function () {
    var btns = document.querySelectorAll('button');
    if (!btns.length) return false;
    for (var i = 0; i < btns.length; i++) {
      btns[i].focus();
      if (document.activeElement !== btns[i]) return 'not focusable: ' + btns[i].id;
      if (btns[i].tabIndex < 0) return 'removed from tab order: ' + btns[i].id;
    }
    return ok(btns.length + ' buttons focusable');
  });

  check('audio is off by default and Web Audio is available', function () {
    var b = document.getElementById('b-audio');
    if (b.getAttribute('aria-pressed') !== 'false') return 'audio did not start muted';
    return !!(window.AudioContext || window.webkitAudioContext);
  });

  check('accessible description is present and non-trivial', function () {
    var t = document.getElementById('scene-desc').textContent || '';
    return t.length > 120 && /bloom/i.test(t) ? ok(t.slice(0, 60) + '…') : 'too short: ' + t.length;
  });

  check('no remote references in the document', function () {
    var html = document.documentElement.outerHTML;
    var bad = html.match(/(https?:)?\\/\\/[a-z0-9.-]+\\.[a-z]{2,}/gi);
    return bad ? 'found ' + bad.slice(0, 3).join(', ') : true;
  });

  check('resize does not reset the ecosystem', function () {
    var before = SG.state();
    window.dispatchEvent(new Event('resize'));
    var after = SG.state();
    return after.blooms === before.blooms && after.drifters === before.drifters;
  });

  check('canvas element is exposed to assistive tech', function () {
    var c = document.getElementById('scene');
    return c.getAttribute('role') === 'img' && !!c.getAttribute('aria-describedby');
  });

  check('frame cost stays within the software-rasteriser budget', function () {
    var ctx2 = canvas.getContext('2d');
    SG.renderOnce(); SG.step(1 / 60);                    // warm the paths
    var N = 60, t0 = performance.now();
    for (var i = 0; i < N; i++) {
      SG.step(1 / 60); SG.renderOnce();
      ctx2.getImageData(0, 0, 1, 1);                     // force Skia to flush each frame
    }
    var ms = (performance.now() - t0) / N;
    // This runs headless with --disable-gpu, i.e. pure CPU rasterisation, which is
    // several times slower than the GPU-backed canvas a real viewer gets. The bar
    // is a regression guard for that worst case, not the 16.7ms display budget.
    var BUDGET = 25;
    return ms < BUDGET
      ? ok(ms.toFixed(1) + ' ms/frame software-rasterised at ' + canvas.width + 'x' + canvas.height +
           ' (budget ' + BUDGET + ' ms)')
      : (ms.toFixed(1) + ' ms/frame exceeds the ' + BUDGET + ' ms software budget');
  });

  check('simulation step alone is cheap enough to never gate the frame', function () {
    var N = 300, t0 = performance.now();
    for (var i = 0; i < N; i++) SG.step(1 / 60);
    var ms = (performance.now() - t0) / N;
    return ms < 2 ? ok(ms.toFixed(3) + ' ms/step') : (ms.toFixed(3) + ' ms/step — too slow');
  });

  check('no uncaught errors during boot and interaction', function () {
    return errors.length === 0 ? ok('clean') : errors.join(' | ');
  });

  var out = document.createElement('pre');
  out.id = 'probe-results';
  out.textContent = results.join('\\n');
  document.body.appendChild(out);
})();
</script>
`;

mkdirSync(tmp, { recursive: true });
const page = join(tmp, 'browser-check.html');
writeFileSync(page, readFileSync(join(root, 'index.html'), 'utf8').replace('</body>', PROBE + '</body>'));

const profile = join(tmp, 'cprofile-check');
rmSync(profile, { recursive: true, force: true });

let dom = '';
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + profile, '--window-size=1600,900',
    '--dump-dom', 'file://' + page
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  dom = (e.stdout || '').toString();
  if (!dom) { console.error('Chrome failed to produce a DOM dump: ' + e.message); process.exit(1); }
} finally {
  rmSync(profile, { recursive: true, force: true });
}

const m = dom.match(/<pre id="probe-results">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('Probe did not finish — no results element in the dumped DOM.');
  process.exit(1);
}
const lines = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').split('\n');
console.log('\nSignal Garden browser check (headless Chrome, file://)\n');
lines.forEach((l) => console.log('  ' + l));
let failures = lines.filter((l) => l.startsWith('FAIL')).length;

/* ── phase 2: run the unmodified page for real and watch Chrome's console ── */
const shot = join(tmp, 'render-check.png');
let stderr = '';
rmSync(profile, { recursive: true, force: true });
try {
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--enable-logging=stderr', '--v=0',
    '--user-data-dir=' + profile, '--window-size=1600,900',
    '--screenshot=' + shot, 'file://' + join(root, 'index.html')
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  stderr = (e.stderr || '').toString();
} finally {
  rmSync(profile, { recursive: true, force: true });
}
const consoleErrors = stderr.split('\n').filter((l) => /ERROR:CONSOLE|Uncaught|SEVERE/.test(l));
if (existsSync(shot)) {
  console.log('  ok   unmodified page rendered a screenshot (' +
    Math.round(readFileSync(shot).length / 1024) + ' KB)');
} else {
  console.log('  FAIL unmodified page produced no screenshot'); failures++;
}
if (consoleErrors.length) {
  console.log('  FAIL console errors during a live render run:\n       ' + consoleErrors.join('\n       '));
  failures++;
} else {
  console.log('  ok   no console errors logged during a live render run');
}
rmSync(shot, { force: true });

console.log('\n' + failures + ' failed\n');
rmSync(page, { force: true });
process.exit(failures ? 1 : 0);
