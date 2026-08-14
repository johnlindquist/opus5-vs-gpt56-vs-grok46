/* Performance measurement for Sand Alchemist.
 *
 * Times the real simulation step and the CPU-side pixel work of the real
 * renderer for each preset, both while the scene is busy and once it settles.
 * Node's `vm` context is slower than a browser JIT, so these numbers are
 * pessimistic relative to what the page actually achieves.
 *
 *   node test/perf.mjs
 */
import { boot } from './env.mjs';

const S = boot();
const BUDGET = 1000 / 60;          // 16.67 ms per frame at 60 fps

function time(fn, n){
  const t0 = process.hrtime.bigint();
  for (let i=0;i<n;i++) fn(i);
  return Number(process.hrtime.bigint() - t0) / 1e6 / n;
}

console.log('Sand Alchemist — performance at ' + S.GW + 'x' + S.GH +
            ' (' + S.N.toLocaleString() + ' cells)');
console.log('frame budget at 60 fps: ' + BUDGET.toFixed(2) + ' ms\n');

S.clearWorld();
for (let k=0;k<60;k++) S.stepSim();
const floor = time(() => S.stepSim(), 400);
console.log('empty world (heat field only)   ' + floor.toFixed(2) + ' ms/tick\n');

console.log('scene        sim      render   total    settled  worst-case');
console.log('-'.repeat(62));

let worst = 0;
for (const p of S.PRESET_KEYS){
  S.loadPreset(p, 137);
  for (let k=0;k<120;k++) S.stepSim();               // warm up
  const sim = time(() => S.stepSim(), 400);
  const ren = time(i => S.render(i*16), 150);
  for (let k=0;k<2000;k++) S.stepSim();              // let the scene settle
  const settled = time(() => S.stepSim(), 300);
  const total = sim + ren;
  if (total > worst) worst = total;
  console.log(
    p.padEnd(12) +
    (sim.toFixed(2)+' ms').padEnd(9) +
    (ren.toFixed(2)+' ms').padEnd(9) +
    (total.toFixed(2)+' ms').padEnd(9) +
    (settled.toFixed(2)+' ms').padEnd(9) +
    (total < BUDGET ? 'within budget' : 'OVER BUDGET'));
}

console.log('-'.repeat(62));
const ok = worst < BUDGET;
console.log('worst scene: ' + worst.toFixed(2) + ' ms/frame at 1x speed — ' +
            (ok ? 'fits in the 60 fps budget' : 'EXCEEDS the 60 fps budget'));
process.exit(ok ? 0 : 1);
