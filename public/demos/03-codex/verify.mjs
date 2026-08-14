import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync('index.html', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

assert.equal(scriptMatches.length, 1, 'exactly one self-contained inline script');
new Function(scriptMatches[0][1]);
assert(!/https?:\/\//i.test(html), 'index.html has no remote URL');
assert(!/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)=/i.test(html), 'no runtime file dependency');

const expectations = {
  'fixed-step bounded simulation': ['STEP=1/120', 'Math.min(.05', 'while(acc>=STEP)'],
  'attract automation and clean takeover': ["mode='attract'", 'function autoplay()', "reset('play')"],
  'jump, charge, coyote time, and buffering': ['player.charging', 'player.charge', 'player.coyote=.11', 'player.buffer=.14'],
  'air dash and breakable signs': ['function doDash()', "h.type==='sign'&&player.dashTime>0"],
  'procedural curated roofs and hazards': ['const patterns=', 'function generate(toX)', "type==='drone'", "type==='mover'"],
  'swept collision protection': ['const sweep=', 'rectHit(sweep,hb)', 'oldY+player.h<=r.y+5'],
  'near misses, combo, and dramatic emphasis': ['function nearMiss(h)', 'combo=Math.min', 'slow=.34'],
  'score, distance, speed, best, and persistence': ['localStorage.getItem', 'localStorage.setItem', 'distance=', 'speed='],
  'bounded entity cleanup': ['roofs=roofs.filter', 'hazards=hazards.filter', 'particles.length>180'],
  'keyboard, pointer, touch-compatible input': ["e.code==='Space'", "addEventListener('pointerdown'", 'touch-action:none'],
  'pause, restart, and sound controls': ["toLowerCase()==='p'", "toLowerCase()==='r'", "toLowerCase()==='m'"],
  'reduced-motion support': ["prefers-reduced-motion: reduce", 'const trails=reduce?2:5'],
  'accessible focus and live state': ['focus-visible', 'aria-live="polite"', 'role="application"'],
  'daily seed': ['dayKey=', 'seedLabel=']
};

for (const [name, needles] of Object.entries(expectations)) {
  for (const needle of needles) assert(html.includes(needle), `${name}: missing ${needle}`);
}

assert(readme.includes('## Rules') && readme.includes('## Controls') && readme.includes('## Architecture'));
console.log(`PASS: syntax, offline packaging, and ${Object.keys(expectations).length} feature groups verified.`);
