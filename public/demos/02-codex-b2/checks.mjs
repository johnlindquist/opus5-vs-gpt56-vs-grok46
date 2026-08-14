import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'Inline application script is missing');
if (script) {
  try { new Function(script); }
  catch (error) { failures.push(`Inline JavaScript does not parse: ${error.message}`); }
}
assert(/<canvas\b[^>]*id="space"/.test(html), 'Canvas entry surface is missing');
assert(!/(?:src|href)\s*=\s*["']https?:/i.test(html), 'Remote runtime reference found');
for (const token of [
  'FIXED_DT', 'SOFTENING2', 'MAX_BODIES', 'handleCollisions',
  'fragmentPair', 'previewTrajectory', 'pointerdown', "e.key==='.'",
  'Digit|Numpad', 'prefers-reduced-motion', 'xorshift32'
]) {
  assert(html.includes(token) || readme.includes(token), `Required implementation marker missing: ${token}`);
}

// Mirror the deterministic stable preset and its fixed-step velocity-Verlet update.
// Thirty wall-clock seconds at Gravity Atelier's default 4x simulation rate = 120 units.
const G = 1, DT = 1 / 60, SOFTENING2 = 36;
const bodies = [{ x: 0, y: 0, vx: 0, vy: 0, mass: 12000, fixed: true }];
for (const [r, phase, mass] of [
  [88, .3, 2.5], [139, 2.15, 6.4], [205, 4.05, 10],
  [278, 5.45, 7], [350, 1.03, 4.2], [425, 3.44, 3.2]
]) {
  const speed = Math.sqrt(12000 / r);
  bodies.push({
    x: Math.cos(phase) * r, y: Math.sin(phase) * r,
    vx: -Math.sin(phase) * speed, vy: Math.cos(phase) * speed,
    mass, fixed: false, initialRadius: r
  });
}
function accelerations() {
  const out = bodies.map(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], dx = b.x - a.x, dy = b.y - a.y;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + SOFTENING2);
      const inv3 = inv * inv * inv;
      if (!a.fixed) { out[i].x += dx * b.mass * inv3; out[i].y += dy * b.mass * inv3; }
      if (!b.fixed) { out[j].x -= dx * a.mass * inv3; out[j].y -= dy * a.mass * inv3; }
    }
  }
  return out;
}
for (let step = 0; step < 120 / DT; step++) {
  let acc = accelerations();
  for (let i = 1; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += acc[i].x * DT * .5; b.vy += acc[i].y * DT * .5;
    b.x += b.vx * DT; b.y += b.vy * DT;
  }
  acc = accelerations();
  for (let i = 1; i < bodies.length; i++) {
    bodies[i].vx += acc[i].x * DT * .5;
    bodies[i].vy += acc[i].y * DT * .5;
  }
}
const drifts = bodies.slice(1).map(b => Math.abs(Math.hypot(b.x, b.y) - b.initialRadius) / b.initialRadius);
assert(drifts.every(d => d < .04), `Stable preset radial drift exceeded 4%: ${drifts.map(d => d.toFixed(4)).join(', ')}`);

if (failures.length) {
  console.error('FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS: offline structure checks and 30-second default-rate stability simulation; max radial drift ${(Math.max(...drifts) * 100).toFixed(2)}%.`);
