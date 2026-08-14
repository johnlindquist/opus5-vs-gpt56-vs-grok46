import { boot } from './env.mjs';

const S = boot();
const T = S.MATS;
const NAME = {}; for (const k in T) NAME[T[k]] = k;

/* ------------------------------ test kit -------------------------------- */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra){
  if (cond){ pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label + (extra ? ' — ' + extra : ''));
         console.log('  ✗ ' + label + (extra ? '  [' + extra + ']' : '')); }
}
function group(name){ console.log('\n' + name); }
function run(n){ for (let k=0;k<n;k++) S.stepSim(); }
/* build an isolated sandbox world for one behaviour test */
function scratch(){
  S.clearWorld();
  S.srand(4242);
  S.fillRect(0,0,S.GW,2,T.WALL); S.fillRect(0,S.GH-2,S.GW,2,T.WALL);
  S.fillRect(0,0,2,S.GH,T.WALL); S.fillRect(S.GW-2,0,2,S.GH,T.WALL);
}
const at = (x,y) => S.mat[y*S.GW+x];
const tAt = (x,y) => S.temp[y*S.GW+x];
function put(x,y,m,t,a){ S.setCell(y*S.GW+x, m, t, a); }
function countIn(x0,y0,w,h,m){
  let c=0;
  for (let y=y0;y<y0+h;y++) for (let x=x0;x<x0+w;x++) if (at(x,y)===m) c++;
  return c;
}

/* ======================================================================== */
group('1. Load & required materials');
ok(S.GW === 400 && S.GH === 225, 'bounded grid is 400x225 (16:9 for a 1600x900 view)');
const required = ['SAND','WATER','STONE','WOOD','PLANT','FIRE','OIL','ICE','STEAM','LAVA','SALT','EMPTY'];
ok(required.every(k => T[k] !== undefined), 'all twelve required materials are defined',
   required.filter(k => T[k]===undefined).join(','));
ok(S.PRESET_KEYS.length >= 4, 'at least four presets exist: ' + S.PRESET_KEYS.join(', '));

group('2. Attract scene (volcano) is alive without input');
S.loadPreset('volcano', 137);
const v0 = S.stats();
ok(v0[T.LAVA] > 200, 'volcano starts with a magma column (' + v0[T.LAVA] + ' lava cells)');
ok(v0[T.WATER] > 500, 'volcano starts with a meltwater lake (' + v0[T.WATER] + ' water cells)');
ok(v0[T.WOOD] > 100 && v0[T.PLANT] > 0, 'volcano starts with a grove (wood ' + v0[T.WOOD] + ', plant ' + v0[T.PLANT] + ')');
ok(S.emitters.length > 0, 'volcano installs an eruption emitter');

/* ~7 seconds of wall clock at 60fps / 1x speed */
run(420);
const v1 = S.stats();
console.log('    after 420 ticks: ' +
  Object.keys(T).filter(k => v1[T[k]] > 0 && k !== 'EMPTY')
        .map(k => k.toLowerCase() + ' ' + v1[T[k]]).join(', '));
ok(v1[T.STEAM] > 20, 'lava meeting water produced steam (' + v1[T.STEAM] + ')');
ok(v1[T.FIRE] > 0 || v1[T.ASH] > 0 || v1[T.SMOKE] > 0,
   'combustion is running in the grove (fire ' + v1[T.FIRE] + ', ash ' + v1[T.ASH] + ', smoke ' + v1[T.SMOKE] + ')');
ok(v1[T.STONE] > v0[T.STONE], 'lava has cooled into new stone (+' + (v1[T.STONE]-v0[T.STONE]) + ')');
ok(v1[T.WOOD] < v0[T.WOOD], 'fire consumed wood (' + v0[T.WOOD] + ' -> ' + v1[T.WOOD] + ')');
ok(S.activeCells > 50, 'the world is still busy after 7 s (' + S.activeCells + ' active cells last tick)');

group('3. Sand falls and piles');
scratch();
for (let k=0;k<600;k++) put(196 + (k%9), 30 + ((k/9)|0), T.SAND);
run(260);
ok(countIn(150,S.GH-40,110,38,T.SAND) > 500, 'sand fell to the floor');
{ // a pile has sloped shoulders, not a vertical column
  let widest = 0;
  for (let y=S.GH-3;y>S.GH-30;y--){
    let w=0; for (let x=150;x<260;x++) if (at(x,y)===T.SAND) w++;
    if (w>widest) widest=w;
  }
  ok(widest > 12, 'sand spread into a pile wider than the source column (' + widest + ' cells)');
}

group('4. Water flows, seeks the low point and self-levels');
scratch();
S.fillRect(2,S.GH-14,S.GW-4,12,T.STONE);
for (let k=0;k<1400;k++) put(60 + (k%14), 60 + ((k/14)|0), T.WATER, 20);
run(700);
{
  let onFloor = 0, spanCols = 0, minY = 1e9, maxY = -1;
  for (let x=3;x<S.GW-3;x++){
    let top = -1, depth = 0;
    for (let y=3;y<S.GH-3;y++) if (at(x,y)===T.WATER){ if (top<0) top=y; depth++; onFloor++; }
    if (top<0) continue;
    spanCols++;
    if (depth >= 2){ if (top<minY) minY=top; if (top>maxY) maxY=top; }
  }
  ok(onFloor > 1200, 'water reached the floor (' + onFloor + ' cells)');
  ok(spanCols > 250, 'water spread far laterally from a 14-cell-wide pour (' + spanCols + ' columns)');
  ok(maxY - minY <= 3, 'the water surface self-levelled (top varies by ' + (maxY-minY) + ' cells)');
}
{ // water abandons a shelf for the lower floor
  scratch();
  S.fillRect(2,S.GH-40,S.GW-4,38,T.STONE);
  S.fillRect(60,S.GH-60,120,20,T.STONE);
  for (let k=0;k<600;k++) put(100 + (k%20), 30 + ((k/20)|0), T.WATER, 20);
  run(400);
  let high=0, low=0;
  for (let y=3;y<S.GH-3;y++) for (let x=3;x<S.GW-3;x++)
    if (at(x,y)===T.WATER){ if (y < S.GH-60) high++; else low++; }
  ok(low > high*10, 'water poured onto a shelf drained to the lower level (' + high + ' high, ' + low + ' low)');
}

group('5. Water <-> steam <-> ice');
scratch();
S.fillRect(100,100,40,20,T.WATER,20);
S.fillRect(100,120,40,4,T.LAVA,1350);
run(90);
ok(S.count(T.STEAM) > 20, 'lava boiled water into steam (' + S.count(T.STEAM) + ')');
{ // ice floating on a contained pond freezes it
  scratch();
  S.fillRect(170,170,50,3,T.STONE);                 // basin floor
  S.fillRect(170,150,3,23,T.STONE); S.fillRect(217,150,3,23,T.STONE);
  S.fillRect(173,160,44,10,T.WATER,20);             // 440 cells of water
  S.fillRect(173,150,44,10,T.ICE,-18);              // ice cap on top
  run(250);
  ok(S.count(T.WATER) < 220, 'ice froze most of the pond beneath it (' + S.count(T.WATER) + ' of 440 water left)');
  ok(S.count(T.ICE) > 600, 'the ice sheet grew downward (' + S.count(T.ICE) + ' cells, started 440)');
}
{ // ...but the freeze front is bounded: a lone cube cannot ice over the world
  scratch();
  S.fillRect(100,120,200,3,T.STONE);
  S.fillRect(100,60,3,63,T.STONE); S.fillRect(297,60,3,63,T.STONE);
  S.fillRect(103,80,194,40,T.WATER,20);      // 7760 cells of water
  put(200,78,T.ICE,-18);                     // a single ice cell
  run(900);
  ok(S.count(T.ICE) < 400,
     'one ice cell freezes only its neighbourhood, not the whole tank (' + S.count(T.ICE) + ' ice after 900 ticks)');
  ok(S.count(T.WATER) > 7000, 'the rest of the tank stayed liquid (' + S.count(T.WATER) + ' of 7760)');
}
{ // water beside lava boils rather than freezing
  scratch();
  S.fillRect(100,120,200,3,T.STONE);
  S.fillRect(100,60,3,63,T.STONE); S.fillRect(297,60,3,63,T.STONE);
  S.fillRect(103,80,194,40,T.WATER,20);
  S.fillRect(180,62,40,15,T.LAVA,1350);
  run(600);
  ok(S.count(T.ICE) === 0, 'quenching lava never produces ice (' + S.count(T.ICE) + ')');
  ok(S.count(T.STEAM) > 100, 'quenching lava produces steam (' + S.count(T.STEAM) + ')');
  ok(S.count(T.STONE) > 1000, 'the quenched lava became stone (' + S.count(T.STONE) + ')');
}
scratch();
S.fillRect(190,40,20,10,T.STEAM,20);
run(160);
ok(S.count(T.WATER) > 40, 'cool steam condensed back into water (' + S.count(T.WATER) + ')');
scratch();
S.fillRect(150,150,60,12,T.ICE,-18);
S.fillRect(150,162,60,4,T.LAVA,1360);   // directly beneath the ice
run(150);
ok(S.count(T.ICE) < 720, 'ice melted where lava touched it (' + S.count(T.ICE) + ' of 720 remain)');

group('6. Fire rises, consumes fuel and expires');
scratch();
S.fillRect(2,S.GH-8,S.GW-4,6,T.STONE);
S.fillRect(120,S.GH-40,80,32,T.WOOD);
S.fillRect(150,S.GH-44,6,4,T.FIRE,850);
const wood0 = S.count(T.WOOD);
run(400);
const wood1 = S.count(T.WOOD);
ok(wood1 < wood0 - 100, 'fire ate through the wood block (' + wood0 + ' -> ' + wood1 + ')');
ok(S.count(T.ASH) + S.count(T.SMOKE) > 0, 'burning left ash/smoke behind');
scratch();
S.fillRect(200,100,6,6,T.FIRE,850);   // no fuel at all
run(300);
ok(S.count(T.FIRE) === 0, 'unfuelled fire expired completely (' + S.count(T.FIRE) + ' left)');
{ // fire moves upward
  scratch();
  put(200,150,T.FIRE,850,255);
  let highest = 150;
  for (let k=0;k<40;k++){
    S.stepSim();
    for (let y=3;y<S.GH-3;y++){
      let found=false;
      for (let x=180;x<220;x++) if (at(x,y)===T.FIRE){ found=true; break; }
      if (found){ if (y<highest) highest=y; break; }
    }
  }
  ok(highest < 150, 'a flame rose from y=150 to y=' + highest);
}

group('7. Oil floats on water and burns aggressively');
scratch();
S.fillRect(2,S.GH-14,S.GW-4,12,T.STONE);
S.fillRect(120,S.GH-50,80,18,T.OIL);
S.fillRect(120,S.GH-32,80,18,T.WATER,20);
run(300);
{
  let oilY=0, oilN=0, watY=0, watN=0;
  for (let y=3;y<S.GH-3;y++) for (let x=100;x<230;x++){
    if (at(x,y)===T.OIL){ oilY+=y; oilN++; }
    if (at(x,y)===T.WATER){ watY+=y; watN++; }
  }
  ok(oilN>200 && watN>200 && oilY/oilN < watY/watN - 4,
     'oil settled above water (mean oil y=' + (oilY/oilN).toFixed(1) + ', water y=' + (watY/watN).toFixed(1) + ')');
}
scratch();
S.fillRect(2,S.GH-14,S.GW-4,12,T.STONE);
S.fillRect(100,S.GH-30,120,16,T.OIL);
S.fillRect(104,S.GH-33,4,3,T.FIRE,850);      // resting on the slick
const oil0 = S.count(T.OIL);
run(120);
ok(S.count(T.OIL) < oil0 * 0.2,
   'the oil slick flashed over (' + oil0 + ' -> ' + S.count(T.OIL) + ' in 120 ticks)');
{ // the same volume of wood, lit the same way, survives far longer
  scratch();
  S.fillRect(2,S.GH-14,S.GW-4,12,T.STONE);
  S.fillRect(100,S.GH-30,120,16,T.WOOD);
  S.fillRect(104,S.GH-33,4,3,T.FIRE,850);
  const w0 = S.count(T.WOOD);
  run(120);
  ok(S.count(T.WOOD) > w0 * 0.2,
     'wood burns slower than oil (' + w0 + ' -> ' + S.count(T.WOOD) + ' over the same 120 ticks)');
}

group('8. Plants grow on water + ground');
scratch();
S.fillRect(2,200,S.GW-4,23,T.SAND);        // soil, surface at y=200
S.fillRect(150,196,52,10,T.WATER,20);      // a pond sunk into the soil
for (let x=203;x<232;x+=4) put(x,199,T.PLANT,20,14);   // rooted on the bank
const plant0 = S.count(T.PLANT), water0 = S.count(T.WATER);
run(1500);
ok(S.count(T.PLANT) > plant0*2, 'plants grew beside water and soil (' + plant0 + ' -> ' + S.count(T.PLANT) + ')');
ok(S.count(T.WATER) < water0, 'growth drank the pond (' + water0 + ' -> ' + S.count(T.WATER) + ')');
{
  let top = 999;
  for (let y=3;y<S.GH-3;y++){ let f=false;
    for (let x=195;x<245;x++) if (at(x,y)===T.PLANT){f=true;break;} if(f){top=y;break;} }
  ok(top < 199, 'plants climbed upward from y=199 to y=' + top);
}
scratch();  // soil but no water: no growth
S.fillRect(2,200,S.GW-4,23,T.SAND);
for (let x=203;x<232;x+=4) put(x,199,T.PLANT,20,14);
const dry0 = S.count(T.PLANT);
run(1500);
ok(S.count(T.PLANT) === dry0, 'plants did not grow without water (' + dry0 + ' -> ' + S.count(T.PLANT) + ')');
scratch();  // water but nothing to root in
S.fillRect(150,196,52,10,T.WATER,20);
put(210,150,T.PLANT,20,14);
const air0 = S.count(T.PLANT);
run(600);
ok(S.count(T.PLANT) === air0, 'plants did not grow unrooted in mid-air');

group('9. Lava: slow flow, ignition, quenching, cooling to stone');
scratch();
S.fillRect(2,S.GH-10,S.GW-4,8,T.STONE);
S.fillRect(190,S.GH-30,20,20,T.LAVA,1350);
S.fillRect(240,S.GH-14,30,4,T.WOOD);
const stone0 = S.count(T.STONE);
run(700);
ok(S.count(T.STONE) > stone0, 'lava cooled into new stone (+' + (S.count(T.STONE)-stone0) + ')');
scratch();
S.fillRect(2,S.GH-10,S.GW-4,8,T.STONE);
S.fillRect(150,S.GH-16,40,6,T.WOOD);
S.fillRect(155,S.GH-22,10,4,T.LAVA,1360);
run(120);
ok(S.count(T.FIRE) + S.count(T.ASH) + S.count(T.SMOKE) > 0, 'lava ignited the wood');
{ // lava moves slower than water over the same span
  scratch();
  S.fillRect(2,S.GH-10,S.GW-4,8,T.STONE);
  S.fillRect(196,S.GH-30,8,20,T.LAVA,1350);
  run(30);
  let lavaSpan=0; for (let x=3;x<S.GW-3;x++){ let hit=false;
    for (let y=3;y<S.GH-3;y++) if (at(x,y)===T.LAVA){hit=true;break;} if(hit)lavaSpan++; }
  scratch();
  S.fillRect(2,S.GH-10,S.GW-4,8,T.STONE);
  S.fillRect(196,S.GH-30,8,20,T.WATER,20);
  run(30);
  let waterSpan=0; for (let x=3;x<S.GW-3;x++){ let hit=false;
    for (let y=3;y<S.GH-3;y++) if (at(x,y)===T.WATER){hit=true;break;} if(hit)waterSpan++; }
  ok(lavaSpan < waterSpan, 'lava spreads more slowly than water (' + lavaSpan + ' vs ' + waterSpan + ' columns in 30 ticks)');
}

group('10. Salt: dissolves to brine, depresses freezing, de-ices');
scratch();
S.fillRect(150,140,40,20,T.WATER,20);
S.fillRect(150,132,40,6,T.SALT);
run(200);
ok(S.count(T.BRINE) > 100, 'salt dissolved into brine (' + S.count(T.BRINE) + ')');
ok(S.count(T.SALT) < 240, 'the salt was consumed (' + S.count(T.SALT) + ' of 240 left)');
{ // brine stays liquid where fresh water freezes
  scratch();
  S.fillRect(60,150,40,14,T.WATER,-6);
  S.fillRect(60,142,40,8,T.ICE,-20);
  S.fillRect(260,150,40,14,T.BRINE,-6);
  S.fillRect(260,142,40,8,T.ICE,-20);
  run(160);
  const froze = 320 - countIn(60,150,40,14,T.WATER) - countIn(60,150,40,14,T.EMPTY);
  ok(S.count(T.BRINE) > 400, 'brine resisted freezing at -6 C (' + S.count(T.BRINE) + ' of 560 still liquid)');
}
scratch();
S.fillRect(150,150,40,10,T.ICE,-18);
S.fillRect(150,144,40,6,T.SALT,-18);
run(200);
ok(S.count(T.WATER) + S.count(T.BRINE) > 0, 'salt melted ice into liquid (' + (S.count(T.WATER)+S.count(T.BRINE)) + ' cells)');

group('11. Steam rises');
scratch();
put(200,180,T.STEAM,110,250);
let steamHigh = 180;
for (let k=0;k<60;k++){
  S.stepSim();
  for (let y=3;y<S.GH-3;y++){ let f=false;
    for (let x=180;x<220;x++) if (at(x,y)===T.STEAM){f=true;break;}
    if (f){ if (y<steamHigh) steamHigh=y; break; } }
}
ok(steamHigh < 160, 'steam rose from y=180 to y=' + steamHigh);

group('12. Sand vitrifies, stone stays put');
scratch();
S.fillRect(2,S.GH-10,S.GW-4,8,T.STONE);
S.fillRect(180,S.GH-18,40,8,T.SAND);
S.fillRect(180,S.GH-26,40,8,T.LAVA,1400);
run(200);
ok(S.count(T.GLASS) > 0, 'lava fused sand into glass (' + S.count(T.GLASS) + ' cells)');
scratch();
S.fillRect(100,100,50,20,T.STONE);
run(120);
ok(countIn(100,100,50,20,T.STONE) === 1000, 'stone is completely static');

group('13. No directional bias in the update order');
{
  scratch();
  S.fillRect(2,S.GH-6,S.GW-4,4,T.STONE);
  for (let k=0;k<2400;k++) put(198 + (k%5), 40 + ((k/5)|0), T.SAND);
  run(600);
  let lx=0, rx=0;
  for (let y=3;y<S.GH-3;y++){
    for (let x=3;x<200;x++)   if (at(x,y)===T.SAND) lx++;
    for (let x=200;x<S.GW-3;x++) if (at(x,y)===T.SAND) rx++;
  }
  const skew = Math.abs(lx-rx) / (lx+rx);
  ok(skew < 0.15, 'a symmetric sand pile stays symmetric (left ' + lx + ', right ' + rx +
     ', skew ' + (skew*100).toFixed(1) + '%)');
}

group('14. Cells are not double-updated in one tick');
{
  scratch();
  // a single grain can descend at most one row per tick
  put(200,20,T.SAND);
  let y = 20;
  let maxDrop = 0;
  for (let k=0;k<40;k++){
    S.stepSim();
    let ny = -1;
    for (let yy=3;yy<S.GH-3;yy++) if (at(200,yy)===T.SAND){ ny=yy; break; }
    if (ny < 0) break;
    const drop = ny - y; if (drop > maxDrop) maxDrop = drop;
    y = ny;
  }
  ok(maxDrop <= 1, 'a falling grain advances at most one cell per tick (max ' + maxDrop + ')');
}

group('15. All four presets build and run cleanly');
for (const key of S.PRESET_KEYS){
  S.loadPreset(key, 137);
  const before = S.stats();
  let threw = null;
  // long enough for scheduled emitters (oilfire's pilot light starts at t=360)
  try { run(900); } catch(e){ threw = e; }
  const after = S.stats();
  const kinds = after.filter(v => v>0).length;
  ok(!threw, 'preset "' + key + '" ran 900 ticks without throwing', threw && threw.message);
  ok(kinds >= 5, 'preset "' + key + '" holds a varied world (' + kinds + ' distinct materials)');
  let changed = 0;
  for (let i=0;i<after.length;i++) changed += Math.abs(after[i]-before[i]);
  ok(changed > 100, 'preset "' + key + '" evolves on its own (' + changed + ' cells changed)');
}

group('16. Determinism: same seed + same preset => identical world');
function fingerprint(){
  let h = 2166136261 >>> 0;
  for (let i=0;i<S.N;i++){ h ^= S.mat[i]; h = Math.imul(h, 16777619) >>> 0; }
  for (let i=0;i<S.N;i+=7){ h ^= (S.temp[i] & 0xff); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
S.loadPreset('volcano', 137); run(200); const fpA = fingerprint();
S.loadPreset('volcano', 137); run(200); const fpB = fingerprint();
S.loadPreset('volcano', 512); run(200); const fpC = fingerprint();
ok(fpA === fpB, 'seed 137 reproduces bit-for-bit (' + fpA + ' vs ' + fpB + ')');
ok(fpA !== fpC, 'a different seed gives a different world (' + fpA + ' vs ' + fpC + ')');

group('17. Overlay particle pool is bounded');
S.loadPreset('volcano', 137);
let maxP = 0;
for (let k=0;k<900;k++){ S.stepSim(); if (S.particleCount > maxP) maxP = S.particleCount; }
ok(maxP <= S.PMAX, 'particle count never exceeded the pool cap (' + maxP + ' <= ' + S.PMAX + ')');

group('18. Clear, paint, line and eraser');
S.clearWorld();
ok(S.count(T.EMPTY) === S.N, 'clear() empties the whole world');
S.setBrush(8); S.selectMat(T.SAND);
S.paintDot(200,100,T.SAND);
ok(S.count(T.SAND) > 20, 'brush paints a disc (' + S.count(T.SAND) + ' cells at size 8)');
S.clearWorld(); S.setBrush(3);
S.paintLine(40,20,360,20,T.STONE);
{
  let cols=0; for (let x=3;x<S.GW-3;x++){ let hit=false;
    for (let y=15;y<26;y++) if (at(x,y)===T.STONE){hit=true;break;} if(hit)cols++; }
  ok(cols > 300, 'shift-line drew an unbroken stroke across ' + cols + ' columns');
}
S.paintDot(200,20,T.EMPTY);
ok(at(200,20) === T.EMPTY, 'eraser removes material');
S.setBrush(6);

group('19. Keyboard bindings (dispatched through the real window listener)');
S.loadPreset('volcano', 137);
S.focusCanvas(false);
{
  const QUICK = [T.SAND,T.WATER,T.STONE,T.WOOD,T.PLANT,T.FIRE,T.OIL,T.ICE,T.LAVA];
  let allOk = true, detail = '';
  for (let n=1; n<=9; n++){
    S.key(String(n));
    if (S.selected !== QUICK[n-1]){ allOk = false; detail += ' key' + n; }
  }
  ok(allOk, 'number keys 1-9 select the first nine materials', detail);
  S.key('0');
  ok(S.selected === T.EMPTY && S.eraseMode, 'key 0 selects the eraser');
  S.key('!');
  ok(S.selected === T.SALT, 'shifted digits reach the second rank of the palette (! -> Salt)');
}
{
  const before = S.paused;
  S.key(' ');
  ok(S.paused !== before, 'Space toggles pause');
  const t0 = S.tick;
  S.key('.');
  ok(S.tick !== t0 && S.paused, '"." advances exactly one tick and stays paused');
  S.key(' ');
  ok(!S.paused, 'Space resumes');
}
{
  S.setBrush(10);
  S.key(']'); S.key(']');
  const up = S.brushSize;
  S.key('['); S.key('['); S.key('[');
  ok(up === 12 && S.brushSize === 9, 'bracket keys resize the brush (10 -> ' + up + ' -> ' + S.brushSize + ')');
}
{
  S.key('F2');
  ok(S.preset === S.PRESET_KEYS[1], 'F2 loads the second preset (' + S.preset + ')');
  S.key('F1');
  ok(S.preset === 'volcano', 'F1 returns to the volcano');
}
{
  S.loadPreset('volcano', 137);
  S.selectMat(T.SAND); S.setBrush(6);
  const before = S.stats()[T.SAND];
  run(40);
  S.key('R');
  ok(S.preset === 'volcano' && S.stats()[T.SAND] === before,
     'R restores the selected preset exactly');
}
{
  S.key('C');
  ok(S.count(T.EMPTY) + S.count(T.WALL) === S.N, 'C clears the world down to its walls');
  S.loadPreset('volcano', 137);
}
{ // arrow keys + Enter paint from the keyboard alone
  S.clearWorld();
  S.focusCanvas(true);
  S.selectMat(T.STONE); S.setBrush(4);
  for (let i=0;i<5;i++) S.key('ArrowLeft');
  S.key('Enter');
  const placed = S.count(T.STONE);
  ok(placed > 0, 'arrow keys move the cursor and Enter paints (' + placed + ' cells)');
  for (let i=0;i<5;i++) S.key('ArrowDown');
  S.key('Enter', {shift:true});
  ok(S.count(T.STONE) > placed, 'Shift+Enter draws a line from the previous point');
  S.focusCanvas(false);
}
{ // typing in the search box must not be swallowed as global shortcuts
  S.selectMat(T.SAND);
  S.focusSearch(true);
  S.key('3'); S.key('c'); S.key(' ');
  const untouched = S.selected === T.SAND;
  S.focusSearch(false);
  ok(untouched, 'shortcuts are suppressed while the search box has focus');
  S.key('3');
  ok(S.selected === T.STONE, 'shortcuts resume once focus leaves the search box');
}

group('20. Render path executes');
S.loadPreset('volcano', 137); run(30);
let renderThrew = null;
try { S.render(1234); S.opt.heatView = true; S.render(2000); S.opt.heatView = false;
      S.opt.bloom = false; S.render(3000); S.opt.bloom = true; }
catch(e){ renderThrew = e; }
ok(!renderThrew, 'render() runs in every view mode without throwing', renderThrew && renderThrew.message);

/* ------------------------------- summary -------------------------------- */
console.log('\n' + '='.repeat(64));
console.log(pass + ' passed, ' + fail + ' failed');
if (fail){ console.log('\nFailures:'); for (const f of failures) console.log('  - ' + f); }
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
