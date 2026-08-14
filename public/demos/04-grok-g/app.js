/* Weather Dial — Tiny City Climate Toy
   Local Canvas 2D diorama. No frameworks, no remote assets. */

(function () {
  "use strict";

  var SEED0 = 48291;
  var WEATHERS = ["clear", "cloudy", "rain", "storm", "snow", "fog"];
  var WEATHER_LABELS = ["Clear", "Cloudy", "Rain", "Storm", "Snow", "Fog"];
  var SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
  var PRESETS = [
    { name: "Summer shower", weather: 2, temp: 23, time: 15.2, season: 1, windStr: 0.28, windDir: 62 },
    { name: "Autumn gale", weather: 1.6, temp: 9, time: 16.8, season: 2, windStr: 0.92, windDir: 248 },
    { name: "Winter night", weather: 4, temp: -6, time: 21.4, season: 3, windStr: 0.22, windDir: 18 },
    { name: "Spring sunrise", weather: 0.35, temp: 11, time: 6.15, season: 0, windStr: 0.16, windDir: 42 }
  ];
  var STORY = [
    { t: 0, weather: 0.1, temp: 10, time: 5.9, season: 0, windStr: 0.12, windDir: 40 },
    { t: 2.4, weather: 1.05, temp: 12, time: 7.4, season: 0, windStr: 0.22, windDir: 55 },
    { t: 4.6, weather: 2.1, temp: 14, time: 9.2, season: 0, windStr: 0.34, windDir: 70 },
    { t: 7.2, weather: 3.05, temp: 12, time: 10.6, season: 0, windStr: 0.72, windDir: 95 },
    { t: 9.6, weather: 5.0, temp: 9, time: 11.4, season: 0, windStr: 0.18, windDir: 80 },
    { t: 12.2, weather: 0.2, temp: 22, time: 15.0, season: 1, windStr: 0.2, windDir: 48 }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { a %= Math.PI * 2; return a < 0 ? a + Math.PI * 2 : a; }
  function mix(a, b, t) {
    return [
      (a[0] + (b[0] - a[0]) * t) | 0,
      (a[1] + (b[1] - a[1]) * t) | 0,
      (a[2] + (b[2] - a[2]) * t) | 0
    ];
  }
  function rgb(c, a) {
    return a == null ? "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"
      : "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  function hourLabel(h) {
    var hh = Math.floor(h) % 24;
    var mm = Math.floor((h - Math.floor(h)) * 60);
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function compass(deg) {
    var names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return names[Math.round(deg / 45) % 8];
  }
  function windWord(s) {
    if (s < 0.12) return "Calm";
    if (s < 0.35) return "Light";
    if (s < 0.62) return "Breezy";
    if (s < 0.85) return "Gale";
    return "Storm";
  }

  var canvas = document.getElementById("city");
  var ctx = canvas.getContext("2d", { alpha: false });
  var live = document.getElementById("live");
  var cardEl = document.getElementById("card");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ui = {
    temp: document.getElementById("temp"),
    windStr: document.getElementById("windStr"),
    windDir: document.getElementById("windDir"),
    clock: document.getElementById("clock"),
    season: document.getElementById("season"),
    speed: document.getElementById("speed"),
    pause: document.getElementById("pauseBtn"),
    reset: document.getElementById("resetBtn"),
    weatherName: document.getElementById("weatherName"),
    tempVal: document.getElementById("tempVal"),
    windStrVal: document.getElementById("windStrVal"),
    windDirVal: document.getElementById("windDirVal"),
    clockVal: document.getElementById("clockVal"),
    seasonVal: document.getElementById("seasonVal"),
    speedVal: document.getElementById("speedVal"),
    seedLabel: document.getElementById("seedLabel"),
    dialNeedle: document.getElementById("dialNeedle"),
    dialBtn: document.getElementById("dialBtn")
  };

  var S = null;
  var layout = { w: 1600, h: 780, ox: 800, oy: 210, tw: 22, th: 11, zh: 15 };
  var lastLive = "";
  var liveAt = 0;

  function rngInt(rng, n) { return Math.floor(rng() * n); }
  function pick(rng, arr) { return arr[rngInt(rng, arr.length)]; }

  function iso(x, y, z) {
    z = z || 0;
    return {
      x: layout.ox + (x - y) * layout.tw,
      y: layout.oy + (x + y) * layout.th - z * layout.zh
    };
  }

  function makeState(seed) {
    var rng = mulberry32(seed);
    var buildings = buildCity(rng);
    var trees = plantTrees(rng);
    var roads = buildRoads();
    var vehicles = spawnVehicles(rng, roads);
    var people = spawnPeople(rng, buildings);
    var clouds = spawnClouds(rng);
    return {
      seed: seed,
      rng: rng,
      weather: 0.1,
      temp: 10,
      time: 5.9,
      season: 0,
      windStr: 0.12,
      windDirDeg: 40,
      speed: 1,
      paused: false,
      attract: true,
      attractT: 0,
      buildings: buildings,
      trees: trees,
      roads: roads,
      vehicles: vehicles,
      people: people,
      clouds: clouds,
      rain: [],
      snow: [],
      splashes: [],
      leaves: [],
      fogPuffs: [],
      puddles: 0,
      snowPack: 0,
      lightning: 0,
      lightningCD: 2.4,
      bolt: null,
      gusts: [],
      drag: null,
      simTime: 0,
      lightsPhase: 0
    };
  }

  function buildRoads() {
    var nodes = [];
    var xs = [2, 8, 14];
    var ys = [2, 7, 12];
    var i, j, id = 0;
    for (j = 0; j < ys.length; j++) {
      for (i = 0; i < xs.length; i++) {
        nodes.push({ id: id++, x: xs[i], y: ys[j], light: (i + j) % 2 });
      }
    }
    var edges = [];
    function add(a, b) {
      edges.push({ a: a, b: b, dx: nodes[b].x - nodes[a].x, dy: nodes[b].y - nodes[a].y });
    }
    for (j = 0; j < 3; j++) {
      for (i = 0; i < 2; i++) add(j * 3 + i, j * 3 + i + 1);
    }
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 2; j++) add(j * 3 + i, (j + 1) * 3 + i);
    }
    return { nodes: nodes, edges: edges, xs: xs, ys: ys };
  }

  function buildCity(rng) {
    var specs = [
      { name: "Clock Hall", x: 4, y: 3.4, w: 2.2, d: 2.1, h: 6.4, kind: "tower", hue: 0 },
      { name: "North Lofts", x: 9.4, y: 3.2, w: 2.6, d: 2.0, h: 5.2, kind: "apart", hue: 1 },
      { name: "Harbor Offices", x: 15.4, y: 3.3, w: 2.4, d: 2.2, h: 5.8, kind: "office", hue: 2 },
      { name: "Mill & Chimney", x: 4.1, y: 8.3, w: 2.8, d: 2.4, h: 3.6, kind: "factory", hue: 3 },
      { name: "Cedar House", x: 10.2, y: 8.4, w: 1.8, d: 1.7, h: 2.6, kind: "house", hue: 4 },
      { name: "Ivy Cottage", x: 12.4, y: 8.2, w: 1.7, d: 1.6, h: 2.4, kind: "house", hue: 5 },
      { name: "Schoolhouse", x: 15.6, y: 8.5, w: 2.5, d: 2.2, h: 3.2, kind: "school", hue: 6 },
      { name: "Canal Warehouse", x: 3.9, y: 13.2, w: 3.0, d: 2.0, h: 2.8, kind: "shed", hue: 7 },
      { name: "Market Arcade", x: 9.6, y: 13.1, w: 2.8, d: 2.1, h: 3.0, kind: "market", hue: 8 },
      { name: "Blue Cafe", x: 12.6, y: 13.4, w: 1.6, d: 1.5, h: 2.3, kind: "cafe", hue: 9 },
      { name: "Library Stacks", x: 15.4, y: 13.2, w: 2.3, d: 2.0, h: 3.8, kind: "library", hue: 10 },
      { name: "Water Tower", x: 6.6, y: 4.8, w: 1.1, d: 1.1, h: 5.6, kind: "tank", hue: 11 },
      { name: "West Terrace", x: 4.6, y: 0.6, w: 2.0, d: 1.4, h: 2.2, kind: "house", hue: 12 },
      { name: "Signal Box", x: 0.6, y: 7.6, w: 1.4, d: 1.3, h: 2.1, kind: "shed", hue: 13 }
    ];
    return specs.map(function (b, i) {
      var doors = { x: b.x + b.w * 0.5, y: b.y + b.d + 0.15 };
      return {
        id: i,
        name: b.name,
        x: b.x, y: b.y, w: b.w, d: b.d, h: b.h,
        kind: b.kind,
        hue: b.hue,
        door: doors,
        occupants: 4 + rngInt(rng, 18),
        flicker: rng(),
        hit: null
      };
    });
  }

  function plantTrees(rng) {
    var spots = [
      [6.2, 3.2], [6.8, 3.8], [7.3, 4.4],
      [10.8, 5.2], [11.6, 5.6], [12.2, 4.8],
      [5.2, 9.2], [5.8, 9.8], [6.4, 10.4], [7.0, 9.4], [6.1, 10.9],
      [13.2, 9.6], [13.8, 10.2], [14.4, 9.4],
      [8.8, 14.4], [10.2, 14.8], [11.4, 14.2],
      [1.2, 4.2], [1.6, 5.0], [0.9, 10.4], [1.5, 11.2],
      [16.8, 5.4], [17.2, 10.8], [16.6, 14.6]
    ];
    return spots.map(function (p, i) {
      return {
        x: p[0] + rng() * 0.15, y: p[1] + rng() * 0.15,
        s: 0.7 + rng() * 0.55,
        kind: rng() < 0.22 ? "pine" : "decid",
        phase: rng() * Math.PI * 2,
        id: i
      };
    });
  }

  function spawnVehicles(rng, roads) {
    var n = 9;
    var list = [];
    var colors = [[196, 72, 62], [62, 110, 168], [214, 176, 72], [70, 140, 96], [48, 48, 52], [220, 220, 224]];
    for (var i = 0; i < n; i++) {
      var e = rngInt(rng, roads.edges.length);
      list.push({
        edge: e,
        t: rng(),
        dir: 1,
        wait: 0,
        color: colors[i % colors.length],
        bus: i === 2,
        lights: rng() < 0.5,
        nextTurn: rng()
      });
    }
    return list;
  }

  function spawnPeople(rng, buildings) {
    var n = 16;
    var list = [];
    for (var i = 0; i < n; i++) {
      var b = buildings[rngInt(rng, buildings.length)];
      list.push({
        x: 1 + rng() * 16,
        y: 1 + rng() * 14,
        tx: 2 + rng() * 15,
        ty: 2 + rng() * 12,
        speed: 0.55 + rng() * 0.45,
        hue: rng() * 360,
        state: "walk",
        home: b.id,
        wait: rng() * 2,
        cover: 0
      });
    }
    return list;
  }

  function spawnClouds(rng) {
    var n = 8;
    var list = [];
    for (var i = 0; i < n; i++) {
      list.push({
        x: rng() * 22 - 2,
        y: rng() * 16 - 2,
        z: 8.5 + rng() * 3,
        s: 1.1 + rng() * 1.4,
        seed: rng(),
        burst: 0
      });
    }
    return list;
  }

  /* ---------- weather derived ---------- */
  function weatherWeights(w) {
    var i = clamp(w, 0, 5);
    var a = Math.floor(i);
    var b = Math.min(5, a + 1);
    var t = i - a;
    var out = [0, 0, 0, 0, 0, 0];
    out[a] += 1 - t;
    out[b] += t;
    return out;
  }

  function precipKind(temp, ww) {
    var wet = ww[2] + ww[3] + ww[4] * 0.85;
    if (wet < 0.08) return "none";
    if (temp <= 0.8) return "snow";
    if (temp < 3.2) return "sleet";
    return "rain";
  }

  function skyPalette(st) {
    var h = st.time;
    var night = h < 5.4 || h > 20.6;
    var dawn = h >= 5.4 && h < 7.6;
    var dusk = h >= 17.8 && h <= 20.6;
    var ww = weatherWeights(st.weather);
    var day = [126, 174, 214];
    var eve = [232, 132, 78];
    var ngt = [18, 28, 48];
    var mor = [255, 176, 132];
    var top, bot;
    if (night) { top = ngt; bot = [28, 36, 62]; }
    else if (dawn) { top = mix(mor, day, (h - 5.4) / 2.2); bot = mix([255, 196, 150], [186, 210, 170], (h - 5.4) / 2.2); }
    else if (dusk) { top = mix(day, eve, (h - 17.8) / 2.8); bot = mix([170, 190, 140], [90, 50, 80], (h - 17.8) / 2.8); }
    else { top = day; bot = [168, 196, 150]; }
    var overcast = ww[1] * 0.45 + ww[2] * 0.55 + ww[3] * 0.75 + ww[4] * 0.35 + ww[5] * 0.5;
    var grey = [92, 104, 118];
    if (ww[4] > 0.3) grey = [186, 198, 210];
    top = mix(top, grey, overcast);
    bot = mix(bot, mix(grey, [70, 82, 92], 0.4), overcast * 0.7);
    if (st.lightning > 0) {
      top = mix(top, [220, 230, 255], st.lightning * 0.55);
      bot = mix(bot, [180, 190, 220], st.lightning * 0.35);
    }
    return { top: top, bot: bot, night: night, dawn: dawn, dusk: dusk, ww: ww };
  }

  function groundColor(st, pal) {
    var season = st.season;
    var grass = [[110, 158, 92], [72, 140, 70], [150, 118, 52], [210, 220, 226]][season];
    if (st.snowPack > 0.15) grass = mix(grass, [236, 242, 248], clamp(st.snowPack, 0, 1));
    grass = mix(grass, [40, 50, 62], pal.night ? 0.45 : 0.08);
    return grass;
  }

  /* ---------- update ---------- */
  function applyStory(st, t) {
    var a = STORY[0], b = STORY[STORY.length - 1];
    for (var i = 0; i < STORY.length - 1; i++) {
      if (t >= STORY[i].t && t <= STORY[i + 1].t) { a = STORY[i]; b = STORY[i + 1]; break; }
      if (t > STORY[i + 1].t) { a = STORY[i + 1]; b = STORY[i + 1]; }
    }
    var u = a.t === b.t ? 1 : clamp((t - a.t) / (b.t - a.t), 0, 1);
    u = u * u * (3 - 2 * u);
    st.weather = lerp(a.weather, b.weather, u);
    st.temp = lerp(a.temp, b.temp, u);
    st.time = lerp(a.time, b.time, u);
    st.season = Math.round(lerp(a.season, b.season, u));
    st.windStr = lerp(a.windStr, b.windStr, u);
    st.windDirDeg = lerp(a.windDir, b.windDir, u);
    if (t >= STORY[STORY.length - 1].t) st.attract = false;
  }

  function takeControl(st) {
    if (st.attract) st.attract = false;
  }

  function update(st, dt) {
    if (st.paused) return;
    var spd = st.speed * (reduceMotion ? 0.55 : 1);
    dt *= spd;
    st.simTime += dt;
    if (st.attract) {
      st.attractT += dt;
      applyStory(st, st.attractT);
    }
    var ww = weatherWeights(st.weather);
    var kind = precipKind(st.temp, ww);
    var wetAmt = (kind === "rain" || kind === "sleet" ? 1 : 0) * (ww[2] * 0.7 + ww[3] * 1.15 + (kind === "sleet" ? ww[4] * 0.4 : 0));
    var snowAmt = (kind === "snow" || kind === "sleet" ? 1 : 0) * (ww[4] * 1.1 + ww[3] * (kind === "snow" ? 0.5 : 0) + ww[2] * (kind === "snow" ? 0.35 : 0));
    var cover = ww[1] * 0.55 + ww[2] * 0.7 + ww[3] * 0.85 + ww[4] * 0.6 + ww[5] * 0.75 + 0.12;
    var fogAmt = ww[5];

    st.puddles = clamp(st.puddles + (wetAmt > 0.2 ? dt * 0.12 : -dt * 0.045), 0, 1);
    if (st.temp > 4) st.snowPack = clamp(st.snowPack - dt * 0.08 * (0.4 + st.temp / 20), 0, 1);
    else st.snowPack = clamp(st.snowPack + snowAmt * dt * 0.07 - (wetAmt > 0.4 && st.temp > 1 ? dt * 0.04 : 0), 0, 1);

    st.lightsPhase += dt * 0.35;
    updateWindGusts(st, dt);
    updateClouds(st, dt, cover);
    updatePrecip(st, dt, wetAmt, snowAmt, kind);
    updateVehicles(st, dt, ww);
    updatePeople(st, dt, wetAmt, snowAmt, ww);
    updateLeaves(st, dt);
    updateLightning(st, dt, ww);
    updateFog(st, dt, fogAmt);
  }

  function windVec(st) {
    var r = (st.windDirDeg * Math.PI) / 180;
    var extra = { x: 0, y: 0 };
    for (var i = 0; i < st.gusts.length; i++) {
      extra.x += st.gusts[i].vx * st.gusts[i].life;
      extra.y += st.gusts[i].vy * st.gusts[i].life;
    }
    return {
      x: Math.cos(r) * st.windStr + extra.x,
      y: Math.sin(r) * st.windStr + extra.y
    };
  }

  function updateWindGusts(st, dt) {
    for (var i = st.gusts.length - 1; i >= 0; i--) {
      st.gusts[i].life -= dt * 0.85;
      st.gusts[i].x += st.gusts[i].vx * dt * 6;
      st.gusts[i].y += st.gusts[i].vy * dt * 6;
      if (st.gusts[i].life <= 0) st.gusts.splice(i, 1);
    }
  }

  function localGustAt(st, x, y) {
    var gx = 0, gy = 0;
    for (var i = 0; i < st.gusts.length; i++) {
      var g = st.gusts[i];
      var dx = x - g.x, dy = y - g.y;
      var d2 = dx * dx + dy * dy;
      var inf = g.life * Math.exp(-d2 / 10);
      gx += g.vx * inf * 3;
      gy += g.vy * inf * 3;
    }
    return { x: gx, y: gy };
  }

  function updateClouds(st, dt, cover) {
    var w = windVec(st);
    var target = 5 + cover * 7;
    while (st.clouds.length < target && st.clouds.length < 14) {
      st.clouds.push({
        x: -3 + st.rng() * 2, y: st.rng() * 16, z: 9 + st.rng() * 3,
        s: 1 + st.rng() * 1.5, seed: st.rng(), burst: 0
      });
    }
    while (st.clouds.length > target && st.clouds.length > 4) st.clouds.pop();
    for (var i = 0; i < st.clouds.length; i++) {
      var c = st.clouds[i];
      var lg = localGustAt(st, c.x, c.y);
      c.x += (w.x * 1.6 + lg.x) * dt;
      c.y += (w.y * 0.9 + lg.y) * dt;
      if (c.burst > 0) c.burst = Math.max(0, c.burst - dt);
      if (c.x > 22) { c.x = -4; c.y = st.rng() * 16; }
      if (c.x < -5) { c.x = 21; c.y = st.rng() * 16; }
      if (c.y > 18) c.y = -3;
      if (c.y < -4) c.y = 16;
    }
  }

  function updatePrecip(st, dt, wetAmt, snowAmt, kind) {
    var w = windVec(st);
    var maxR = reduceMotion ? 90 : 320;
    var maxS = reduceMotion ? 70 : 240;
    var wantR = Math.floor(maxR * clamp(wetAmt, 0, 1));
    var wantS = Math.floor(maxS * clamp(snowAmt, 0, 1));
    if (kind === "none") { wantR = 0; wantS = 0; }

    for (var b = 0; b < st.clouds.length; b++) {
      if (st.clouds[b].burst > 0) {
        wantR += reduceMotion ? 8 : 18;
        if (st.temp <= 1) { wantS += 12; wantR = Math.max(0, wantR - 10); }
      }
    }
    wantR = Math.min(maxR + 40, wantR);
    wantS = Math.min(maxS + 40, wantS);

    while (st.rain.length < wantR) {
      st.rain.push(makeDrop(st, false));
    }
    while (st.rain.length > wantR) st.rain.pop();
    while (st.snow.length < wantS) st.snow.push(makeDrop(st, true));
    while (st.snow.length > wantS) st.snow.pop();

    var i, p, lg;
    for (i = 0; i < st.rain.length; i++) {
      p = st.rain[i];
      lg = localGustAt(st, p.x, p.y);
      p.x += (w.x * 2.2 + lg.x * 2 + p.vx) * dt;
      p.y += (0.2 + w.y * 0.4) * dt;
      p.z -= p.spd * dt;
      if (p.z <= 0) {
        if (st.splashes.length < (reduceMotion ? 20 : 70) && st.rng() < 0.45) {
          st.splashes.push({ x: p.x, y: p.y, life: 1 });
        }
        recycleDrop(st, p, false);
      }
    }
    for (i = 0; i < st.snow.length; i++) {
      p = st.snow[i];
      lg = localGustAt(st, p.x, p.y);
      p.x += (w.x * 1.1 + lg.x + Math.sin(st.simTime * 2 + p.ph) * 0.15) * dt;
      p.y += (w.y * 0.5) * dt;
      p.z -= p.spd * 0.38 * dt;
      if (p.z <= 0) recycleDrop(st, p, true);
    }
    for (i = st.splashes.length - 1; i >= 0; i--) {
      st.splashes[i].life -= dt * 2.4;
      if (st.splashes[i].life <= 0) st.splashes.splice(i, 1);
    }
  }

  function makeDrop(st, snow) {
    var burst = null;
    for (var i = 0; i < st.clouds.length; i++) if (st.clouds[i].burst > 0) burst = st.clouds[i];
    var x, y;
    if (burst && st.rng() < 0.55) {
      x = burst.x + (st.rng() - 0.5) * 2.4;
      y = burst.y + (st.rng() - 0.5) * 2.4;
    } else {
      x = st.rng() * 20 - 1;
      y = st.rng() * 16 - 1;
    }
    return { x: x, y: y, z: 6 + st.rng() * 5, spd: 10 + st.rng() * 8, vx: (st.rng() - 0.5) * 0.4, ph: st.rng() * 6, snow: snow };
  }

  function recycleDrop(st, p, snow) {
    var n = makeDrop(st, snow);
    p.x = n.x; p.y = n.y; p.z = n.z; p.spd = n.spd; p.vx = n.vx;
  }

  function updateVehicles(st, dt, ww) {
    var roads = st.roads;
    var occ = {};
    var slip = 1 - ww[2] * 0.15 - ww[3] * 0.28 - ww[4] * 0.22 - ww[5] * 0.18;
    var base = (reduceMotion ? 0.28 : 0.48) * slip;
    var i, v, e, pair, arrived, green, opts, pickE, k;

    function ends(veh) {
      e = roads.edges[veh.edge];
      if (veh.dir >= 0) return { from: roads.nodes[e.a], to: roads.nodes[e.b] };
      return { from: roads.nodes[e.b], to: roads.nodes[e.a] };
    }

    for (i = 0; i < st.vehicles.length; i++) {
      v = st.vehicles[i];
      if (v.dir == null) v.dir = 1;
      if (v.wait > 0) v.wait -= dt;
      else v.t += dt * base * (v.bus ? 0.75 : 1) * (0.85 + (i % 3) * 0.08);

      if (v.t >= 1) {
        arrived = ends(v).to;
        green = ((st.lightsPhase + arrived.light) % 2) < 1.05;
        if (!green && ww[5] < 0.85) {
          v.t = 0.99;
          v.wait = 0.12;
        } else if (occ[arrived.id]) {
          v.t = 0.99;
        } else {
          occ[arrived.id] = true;
          opts = [];
          for (k = 0; k < roads.edges.length; k++) {
            e = roads.edges[k];
            if (e.a === arrived.id || e.b === arrived.id) opts.push(k);
          }
          if (opts.length > 1) {
            opts = opts.filter(function (ei) { return ei !== v.edge; });
          }
          pickE = opts[Math.floor(v.nextTurn * opts.length) % opts.length];
          v.nextTurn = (v.nextTurn * 1.37 + 0.13) % 1;
          e = roads.edges[pickE];
          v.edge = pickE;
          v.dir = e.a === arrived.id ? 1 : -1;
          v.t = 0.02;
        }
      }
      pair = ends(v);
      v.px = lerp(pair.from.x, pair.to.x, clamp(v.t, 0, 1));
      v.py = lerp(pair.from.y, pair.to.y, clamp(v.t, 0, 1));
      v.dx = pair.to.x - pair.from.x;
      v.dy = pair.to.y - pair.from.y;
    }
  }

  function updatePeople(st, dt, wetAmt, snowAmt, ww) {
    var storm = ww[3] > 0.45 || wetAmt > 0.75;
    var night = st.time < 5.8 || st.time > 21.2;
    var i, p, b, dx, dy, len, sp;
    for (i = 0; i < st.people.length; i++) {
      p = st.people[i];
      if (night && st.rng() < dt * 0.15) {
        p.state = "shelter";
        b = st.buildings[p.home];
        p.tx = b.door.x; p.ty = b.door.y;
      }
      if (storm) {
        p.state = "cover";
        b = nearestBuilding(st, p.x, p.y);
        p.tx = b.door.x; p.ty = b.door.y;
      } else if (p.state === "cover" && wetAmt < 0.25) {
        p.state = "walk";
        p.tx = 1.5 + (p.home * 3.1 + st.simTime) % 15;
        p.ty = 1.5 + (p.home * 2.7) % 13;
      }
      dx = p.tx - p.x; dy = p.ty - p.y;
      len = Math.hypot(dx, dy) || 1;
      sp = p.speed * dt * (storm ? 1.55 : 1) * (snowAmt > 0.4 ? 0.65 : 1) * (reduceMotion ? 0.6 : 1);
      if (len < 0.18) {
        p.cover = p.state === "cover" || p.state === "shelter" ? 1 : 0;
        if (p.cover && storm) continue;
        p.wait -= dt;
        if (p.wait <= 0) {
          p.state = "walk";
          p.tx = 1.2 + ((p.x * 3.1 + st.simTime * 0.2 + i) % 16);
          p.ty = 1.2 + ((p.y * 2.4 + i * 0.7) % 14);
          p.wait = 1 + (i % 4);
        }
      } else {
        p.x += (dx / len) * sp;
        p.y += (dy / len) * sp;
        p.cover = 0;
      }
    }
  }

  function nearestBuilding(st, x, y) {
    var best = st.buildings[0], bd = 1e9, d, b, i;
    for (i = 0; i < st.buildings.length; i++) {
      b = st.buildings[i];
      d = (b.door.x - x) * (b.door.x - x) + (b.door.y - y) * (b.door.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function updateLeaves(st, dt) {
    var want = 0;
    if (st.season === 2 && st.windStr > 0.25) want = reduceMotion ? 12 : 36;
    if (st.season === 0 && st.windStr > 0.4) want = reduceMotion ? 8 : 20;
    while (st.leaves.length < want) {
      st.leaves.push({
        x: st.rng() * 18, y: st.rng() * 15, z: 1 + st.rng() * 3,
        ph: st.rng() * 6, s: 0.5 + st.rng()
      });
    }
    while (st.leaves.length > want) st.leaves.pop();
    var w = windVec(st);
    for (var i = 0; i < st.leaves.length; i++) {
      var L = st.leaves[i];
      var lg = localGustAt(st, L.x, L.y);
      L.x += (w.x * 2.5 + lg.x + Math.sin(st.simTime * 3 + L.ph) * 0.2) * dt;
      L.y += (w.y * 1.4 + lg.y) * dt;
      L.z = 0.4 + Math.abs(Math.sin(st.simTime * 1.4 + L.ph)) * 1.6;
      if (L.x > 20) L.x = -1;
      if (L.x < -1) L.x = 19;
    }
  }

  function updateLightning(st, dt, ww) {
    st.lightning = Math.max(0, st.lightning - dt * 3.2);
    st.lightningCD -= dt;
    if (st.bolt) {
      st.bolt.life -= dt * 2.8;
      if (st.bolt.life <= 0) st.bolt = null;
    }
    if (reduceMotion) return;
    var chance = ww[3] > 0.55 ? 1 : 0;
    if (chance && st.lightningCD <= 0) {
      st.lightning = 0.42;
      st.lightningCD = 3.2 + st.rng() * 3.5;
      var c = st.clouds[Math.floor(st.rng() * st.clouds.length)] || { x: 8, y: 6 };
      st.bolt = { x: c.x, y: c.y, tx: c.x + (st.rng() - 0.5) * 2, ty: c.y + 1.4 + st.rng(), life: 1 };
    }
  }

  function updateFog(st, dt, fogAmt) {
    var want = Math.floor((reduceMotion ? 10 : 28) * fogAmt);
    while (st.fogPuffs.length < want) {
      st.fogPuffs.push({ x: st.rng() * 20, y: st.rng() * 16, s: 2 + st.rng() * 3, ph: st.rng() * 6 });
    }
    while (st.fogPuffs.length > want) st.fogPuffs.pop();
    var w = windVec(st);
    for (var i = 0; i < st.fogPuffs.length; i++) {
      var f = st.fogPuffs[i];
      f.x += w.x * 0.45 * dt;
      f.y += w.y * 0.25 * dt;
      if (f.x > 21) f.x = -2;
    }
  }

  /* ---------- render ---------- */
  function resize() {
    var stage = canvas.parentElement;
    var w = Math.max(320, stage.clientWidth);
    var h = Math.max(280, stage.clientHeight);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout.w = w;
    layout.h = h;
    layout.tw = clamp(w / 52, 14, 26);
    layout.th = layout.tw * 0.5;
    layout.zh = layout.tw * 0.68;
    layout.ox = w * 0.52;
    layout.oy = h * 0.18;
  }

  function draw() {
    var st = S;
    var pal = skyPalette(st);
    ctx.clearRect(0, 0, layout.w, layout.h);
    drawSky(pal, st);
    drawHills(st, pal);
    drawGround(st, pal);
    drawPuddles(st, pal);
    drawRoads(st, pal);
    var sprites = collectSprites(st, pal);
    sprites.sort(function (a, b) { return a.d - b.d; });
    for (var i = 0; i < sprites.length; i++) sprites[i].draw();
    drawPrecip(st, pal);
    drawFog(st, pal);
    drawBolt(st);
    drawHaze(st, pal);
    if (st.lightning > 0) {
      ctx.fillStyle = rgb([210, 220, 255], st.lightning * 0.16);
      ctx.fillRect(0, 0, layout.w, layout.h);
    }
  }

  function drawSky(pal, st) {
    var g = ctx.createLinearGradient(0, 0, 0, layout.h * 0.55);
    g.addColorStop(0, rgb(pal.top));
    g.addColorStop(1, rgb(pal.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, layout.w, layout.h);
    if (!pal.night && pal.ww[0] > 0.4) {
      var sunH = st.time;
      var ang = (sunH - 6) / 12;
      var sx = layout.w * (0.18 + ang * 0.64);
      var sy = layout.h * (0.08 + Math.sin(Math.max(0, 1 - Math.abs(ang - 0.5) * 2)) * -0.02);
      ctx.fillStyle = rgb(pal.dusk ? [255, 170, 90] : [255, 236, 170], 0.9);
      ctx.beginPath();
      ctx.arc(sx, sy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pal.night) {
      ctx.fillStyle = "rgba(255,255,240,0.7)";
      var rng = mulberry32(st.seed + 17);
      for (var i = 0; i < 48; i++) {
        ctx.globalAlpha = 0.25 + rng() * 0.6;
        ctx.fillRect(rng() * layout.w, rng() * layout.h * 0.38, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHills(st, pal) {
    ctx.fillStyle = rgb(mix(pal.bot, [60, 80, 70], 0.35), 0.55);
    ctx.beginPath();
    ctx.moveTo(0, layout.h * 0.42);
    ctx.quadraticCurveTo(layout.w * 0.25, layout.h * 0.28, layout.w * 0.5, layout.h * 0.38);
    ctx.quadraticCurveTo(layout.w * 0.75, layout.h * 0.48, layout.w, layout.h * 0.34);
    ctx.lineTo(layout.w, layout.h);
    ctx.lineTo(0, layout.h);
    ctx.fill();
  }

  function diamond(x, y, z, fill, stroke) {
    var p = iso(x, y, z);
    var tw = layout.tw, th = layout.th;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - th);
    ctx.lineTo(p.x + tw, p.y);
    ctx.lineTo(p.x, p.y + th);
    ctx.lineTo(p.x - tw, p.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    return p;
  }

  function drawGround(st, pal) {
    var grass = groundColor(st, pal);
    var x, y, c;
    for (y = 0; y <= 16; y++) {
      for (x = 0; x <= 18; x++) {
        c = grass;
        if (((x + y) & 1) === 0) c = mix(grass, [255, 255, 255], 0.04);
        diamond(x, y, 0, rgb(c));
      }
    }
  }

  function isRoad(st, x, y) {
    var r = st.roads;
    var i;
    for (i = 0; i < r.xs.length; i++) if (Math.abs(x - r.xs[i]) < 0.51) return true;
    for (i = 0; i < r.ys.length; i++) if (Math.abs(y - r.ys[i]) < 0.51) return true;
    return false;
  }

  function drawRoads(st, pal) {
    var wet = st.puddles;
    var night = pal.night;
    var base = mix([70, 76, 84], [40, 44, 52], night ? 0.5 : 0);
    if (st.snowPack > 0.35) base = mix(base, [220, 228, 236], st.snowPack * 0.55);
    var x, y, p, shine;
    for (y = 0; y <= 16; y++) {
      for (x = 0; x <= 18; x++) {
        if (!isRoad(st, x, y)) continue;
        diamond(x, y, 0.02, rgb(base), rgb([50, 54, 60], 0.4));
        p = iso(x, y, 0.02);
        if (wet > 0.12) {
          shine = mix(pal.top, [200, 210, 230], 0.4);
          ctx.strokeStyle = rgb(shine, 0.18 + wet * 0.35);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - 6, p.y);
          ctx.lineTo(p.x + 8, p.y - 4);
          ctx.stroke();
        }
        ctx.strokeStyle = rgb([210, 196, 120], night ? 0.35 : 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y);
        ctx.lineTo(p.x + 4, p.y);
        ctx.stroke();
      }
    }
    drawLights(st, pal);
  }

  function drawPuddles(st, pal) {
    if (st.puddles < 0.08) return;
    var spots = [[5.2, 6.2], [9.4, 6.8], [13.5, 11.2], [7.6, 11.6], [11.2, 3.8], [3.4, 11.8]];
    ctx.save();
    for (var i = 0; i < spots.length; i++) {
      var p = iso(spots[i][0], spots[i][1], 0.03);
      ctx.fillStyle = rgb(mix(pal.top, [40, 60, 90], 0.35), 0.25 + st.puddles * 0.4);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 16 + (i % 3) * 4, 7, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgb([220, 230, 255], 0.2 * st.puddles);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLights(st, pal) {
    var nodes = st.roads.nodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var p = iso(n.x, n.y, 1.15);
      var green = ((st.lightsPhase + n.light) % 2) < 1.05;
      ctx.fillStyle = "#2a2a28";
      ctx.fillRect(p.x - 2, p.y - 16, 4, 16);
      ctx.fillStyle = green ? "#8ee08a" : "#e07060";
      ctx.beginPath();
      ctx.arc(p.x, p.y - 18, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function collectSprites(st, pal) {
    var list = [];
    var i, b, t, v, p, c, d;
    for (i = 0; i < st.buildings.length; i++) {
      b = st.buildings[i];
      d = b.x + b.y + b.d;
      list.push({ d: d, draw: drawBuilding.bind(null, st, pal, b) });
    }
    for (i = 0; i < st.trees.length; i++) {
      t = st.trees[i];
      list.push({ d: t.x + t.y, draw: drawTree.bind(null, st, pal, t) });
    }
    for (i = 0; i < st.vehicles.length; i++) {
      v = st.vehicles[i];
      list.push({ d: v.px + v.py + 0.4, draw: drawVehicle.bind(null, st, pal, v) });
    }
    for (i = 0; i < st.people.length; i++) {
      p = st.people[i];
      if (p.cover) continue;
      list.push({ d: p.x + p.y + 0.2, draw: drawPerson.bind(null, st, pal, p) });
    }
    for (i = 0; i < st.clouds.length; i++) {
      c = st.clouds[i];
      list.push({ d: c.x + c.y + 20, draw: drawCloud.bind(null, st, pal, c) });
    }
    return list;
  }

  function wallColors(st, pal, b) {
    var paints = [
      [168, 92, 78], [186, 150, 118], [92, 118, 148], [120, 110, 100],
      [176, 124, 88], [154, 96, 86], [188, 168, 128], [110, 108, 102],
      [160, 96, 74], [70, 108, 138], [122, 96, 78], [150, 150, 148],
      [170, 132, 96], [128, 112, 90]
    ];
    var c = paints[b.hue % paints.length];
    if (pal.night) c = mix(c, [30, 36, 50], 0.45);
    else if (pal.dusk) c = mix(c, [80, 40, 30], 0.12);
    if (st.season === 3) c = mix(c, [200, 210, 220], 0.08);
    return c;
  }

  function drawBox(gx, gy, w, d, h, left, right, top) {
    var a = iso(gx, gy + d, 0);
    var b = iso(gx + w, gy + d, 0);
    var c = iso(gx + w, gy, 0);
    var d0 = iso(gx, gy, 0);
    var a2 = iso(gx, gy + d, h);
    var b2 = iso(gx + w, gy + d, h);
    var c2 = iso(gx + w, gy, h);
    var d2 = iso(gx, gy, h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y);
    ctx.closePath(); ctx.fillStyle = left; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(b2.x, b2.y);
    ctx.closePath(); ctx.fillStyle = right; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y);
    ctx.closePath(); ctx.fillStyle = top; ctx.fill();
    var minx = Math.min(a.x, b.x, c.x, d.x, a2.x, d2.x);
    var maxx = Math.max(a.x, b.x, c.x, d.x, a2.x, d2.x);
    var miny = Math.min(a2.y, b2.y, c2.y, d2.y);
    var maxy = Math.max(a.y, b.y, c.y, d.y);
    return { minx: minx, maxx: maxx, miny: miny, maxy: maxy };
  }

  function drawBuilding(st, pal, b) {
    var body = wallColors(st, pal, b);
    var left = rgb(mix(body, [0, 0, 0], 0.18));
    var right = rgb(mix(body, [255, 255, 255], 0.08));
    var roofBase = st.season === 3 || st.snowPack > 0.2
      ? mix([236, 242, 248], [140, 70, 60], 1 - clamp(st.snowPack * 1.2, 0, 0.85))
      : [148, 72, 64];
    if (b.kind === "office") roofBase = [90, 104, 118];
    if (b.kind === "tank") roofBase = [168, 170, 176];
    if (st.snowPack > 0.15) roofBase = mix(roofBase, [240, 246, 252], clamp(st.snowPack, 0, 1));
    var top = rgb(roofBase);
    var hit = drawBox(b.x, b.y, b.w, b.d, b.h * 0.55, left, right, top);
    b.hit = hit;

    if (b.kind === "tower") {
      drawBox(b.x + b.w * 0.32, b.y + b.d * 0.32, b.w * 0.36, b.d * 0.36, b.h, rgb(mix(body, [20, 20, 30], 0.2)), right, rgb([90, 40, 40]));
      var sp = iso(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 0.4);
      ctx.fillStyle = "#8b2a22";
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 18);
      ctx.lineTo(sp.x + 10, sp.y);
      ctx.lineTo(sp.x - 10, sp.y);
      ctx.fill();
    } else if (b.kind === "factory") {
      var ch = iso(b.x + 0.35, b.y + 0.35, b.h * 0.55 + 2.2);
      ctx.fillStyle = rgb(mix(body, [30, 30, 30], 0.3));
      ctx.fillRect(ch.x - 4, ch.y - 28, 8, 28);
      ctx.fillStyle = rgb([80, 86, 90], 0.45 + pal.ww[1] * 0.3);
      ctx.beginPath();
      ctx.ellipse(ch.x + 6 + Math.sin(st.simTime) * 4, ch.y - 34, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === "tank") {
      var tank = iso(b.x + b.w / 2, b.y + b.d / 2, b.h);
      ctx.fillStyle = rgb([150, 154, 160]);
      ctx.beginPath();
      ctx.ellipse(tank.x, tank.y, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === "house" || b.kind === "cafe") {
      var r1 = iso(b.x, b.y + b.d, b.h * 0.55);
      var r2 = iso(b.x + b.w, b.y + b.d, b.h * 0.55);
      var r3 = iso(b.x + b.w / 2, b.y + b.d / 2, b.h * 0.95);
      ctx.fillStyle = rgb(roofBase);
      ctx.beginPath();
      ctx.moveTo(r1.x, r1.y);
      ctx.lineTo(r3.x, r3.y);
      ctx.lineTo(r2.x, r2.y);
      ctx.closePath();
      ctx.fill();
    }

    drawWindows(st, pal, b, body);
    if (pal.night) {
      var lamp = iso(b.door.x, b.door.y, 1.1);
      ctx.fillStyle = "rgba(255,210,120,0.35)";
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWindows(st, pal, b, body) {
    var cols = Math.max(2, Math.floor(b.w * 2.2));
    var rows = Math.max(2, Math.floor(b.h * 1.3));
    var night = pal.night || pal.dusk;
    var rng = mulberry32(st.seed + b.id * 97);
    var i, j, lit, wx, wy, p, stormFlick;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        rng();
        wx = b.x + 0.18 + (i + 0.5) * (b.w - 0.3) / cols;
        wy = b.y + b.d - 0.02;
        p = iso(wx, wy, 0.35 + j * (b.h * 0.5) / rows);
        lit = false;
        if (b.kind === "office") lit = night && st.time < 21.5 && rng() > 0.35;
        else if (b.kind === "apart" || b.kind === "house" || b.kind === "cafe") lit = night && rng() > 0.28;
        else lit = night && rng() > 0.5;
        if (st.time > 6.2 && st.time < 7.8) lit = rng() > 0.55;
        stormFlick = pal.ww[3] > 0.5 && ((st.simTime * 4 + b.flicker + i) % 1) > 0.86;
        if (stormFlick) lit = !lit;
        ctx.fillStyle = lit ? rgb([255, 214, 120], 0.92) : rgb(mix(body, [20, 24, 32], 0.55), 0.9);
        ctx.fillRect(p.x - 2, p.y - 3, 4, 5);
      }
    }
  }

  function drawTree(st, pal, t) {
    var w = windVec(st);
    var lg = localGustAt(st, t.x, t.y);
    var bend = (w.x + lg.x) * 10 + Math.sin(st.simTime * 1.6 + t.phase) * (2 + st.windStr * 6);
    var bendY = (w.y + lg.y) * 6;
    var p = iso(t.x, t.y, 0);
    ctx.strokeStyle = "#5a3a22";
    ctx.lineWidth = 3 * t.s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + bend * 0.3, p.y - 10 * t.s, p.x + bend, p.y - 22 * t.s + bendY);
    ctx.stroke();
    var canopy;
    if (t.kind === "pine") {
      canopy = st.season === 3 ? [170, 190, 180] : [46, 100, 70];
    } else if (st.season === 0) {
      canopy = [86, 150, 86];
    } else if (st.season === 1) {
      canopy = [52, 132, 64];
    } else if (st.season === 2) {
      canopy = [196, 110, 42];
    } else {
      canopy = [168, 176, 180];
    }
    if (pal.night) canopy = mix(canopy, [20, 30, 40], 0.4);
    if (st.snowPack > 0.4) canopy = mix(canopy, [236, 242, 248], 0.45);
    var cap = { x: p.x + bend, y: p.y - 24 * t.s + bendY };
    ctx.fillStyle = rgb(canopy, 0.92);
    ctx.beginPath();
    if (t.kind === "pine") {
      ctx.moveTo(cap.x, cap.y - 18 * t.s);
      ctx.lineTo(cap.x + 12 * t.s, cap.y + 8 * t.s);
      ctx.lineTo(cap.x - 12 * t.s, cap.y + 8 * t.s);
    } else {
      ctx.ellipse(cap.x, cap.y, 13 * t.s, 10 * t.s, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (st.season === 0 && t.kind !== "pine") {
      ctx.fillStyle = "rgba(236,150,170,0.75)";
      ctx.fillRect(cap.x - 6, cap.y - 4, 3, 3);
      ctx.fillRect(cap.x + 4, cap.y, 3, 3);
    }
  }

  function drawVehicle(st, pal, v) {
    var p = iso(v.px, v.py, 0.35);
    var ang = Math.atan2((v.dx - v.dy) * layout.tw, (v.dx + v.dy) * layout.th);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang * 0.15);
    var col = v.color.slice();
    if (pal.night) col = mix(col, [20, 20, 30], 0.25);
    ctx.fillStyle = rgb(col);
    var len = v.bus ? 16 : 11;
    ctx.fillRect(-len / 2, -5, len, 8);
    ctx.fillStyle = rgb([180, 210, 230], pal.night ? 0.35 : 0.55);
    ctx.fillRect(-len / 4, -4, len / 2.2, 4);
    if (pal.night) {
      ctx.fillStyle = "rgba(255,230,140,0.85)";
      ctx.fillRect(len / 2 - 1, -3, 3, 2);
      ctx.fillRect(len / 2 - 1, 1, 3, 2);
    }
    ctx.restore();
    if (st.puddles > 0.2) {
      ctx.strokeStyle = rgb(col, 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 8, 8, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPerson(st, pal, p) {
    var q = iso(p.x, p.y, 0.2);
    var bob = Math.sin(st.simTime * 8 * p.speed + p.hue) * 1.2;
    ctx.fillStyle = "hsl(" + (p.hue % 360) + ",45%,40%)";
    ctx.fillRect(q.x - 2, q.y - 8 + bob, 4, 6);
    ctx.fillStyle = pal.night ? "#f0d8a8" : "#e8c8a0";
    ctx.beginPath();
    ctx.arc(q.x, q.y - 10 + bob, 2.1, 0, Math.PI * 2);
    ctx.fill();
    if (weatherWeights(st.weather)[2] + weatherWeights(st.weather)[3] > 0.35) {
      ctx.strokeStyle = "#334";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(q.x, q.y - 12 + bob, 3.2, Math.PI, 0);
      ctx.stroke();
    }
  }

  function drawCloud(st, pal, c) {
    var p = iso(c.x, c.y, c.z);
    var grey = pal.ww[3] > 0.4 ? 90 : pal.ww[2] > 0.4 ? 130 : pal.ww[4] > 0.4 ? 210 : 235;
    var a = 0.28 + pal.ww[1] * 0.2 + pal.ww[5] * 0.15 + c.s * 0.05;
    if (pal.night) a *= 0.45;
    ctx.fillStyle = "rgba(" + grey + "," + (grey + 4) + "," + (grey + 10) + "," + a + ")";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 28 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - 18 * c.s, p.y + 4, 16 * c.s, 9 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 20 * c.s, p.y + 3, 18 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
    c.sx = p.x; c.sy = p.y; c.sr = 30 * c.s;
    if (c.burst > 0) {
      ctx.strokeStyle = "rgba(120,160,200,0.45)";
      ctx.stroke();
    }
  }

  function drawPrecip(st, pal) {
    var i, p, q, k;
    ctx.strokeStyle = rgb([170, 190, 220], pal.night ? 0.35 : 0.45);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (i = 0; i < st.rain.length; i++) {
      p = st.rain[i];
      q = iso(p.x, p.y, p.z);
      k = iso(p.x - 0.08, p.y, p.z + 0.55);
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(k.x, k.y);
    }
    ctx.stroke();
    ctx.fillStyle = rgb([236, 242, 250], pal.night ? 0.55 : 0.85);
    for (i = 0; i < st.snow.length; i++) {
      p = st.snow[i];
      q = iso(p.x, p.y, p.z);
      ctx.fillRect(q.x, q.y, 2.2, 2.2);
    }
    for (i = 0; i < st.splashes.length; i++) {
      p = st.splashes[i];
      q = iso(p.x, p.y, 0.05);
      ctx.strokeStyle = rgb([200, 220, 240], p.life * 0.4);
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, 6 * (1 - p.life), 3 * (1 - p.life), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    var leafCol = st.season === 0 ? [236, 150, 170] : [196, 110, 42];
    ctx.fillStyle = rgb(leafCol, 0.8);
    for (i = 0; i < st.leaves.length; i++) {
      p = st.leaves[i];
      q = iso(p.x, p.y, p.z);
      ctx.fillRect(q.x, q.y, 3, 2);
    }
  }

  function drawFog(st, pal) {
    if (st.fogPuffs.length === 0 && pal.ww[5] < 0.05) return;
    for (var i = 0; i < st.fogPuffs.length; i++) {
      var f = st.fogPuffs[i];
      var p = iso(f.x, f.y, 0.8);
      ctx.fillStyle = rgb([210, 216, 220], 0.12 + pal.ww[5] * 0.16);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 48 * f.s, 18 * f.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pal.ww[5] > 0.15) {
      var g = ctx.createLinearGradient(0, layout.h * 0.3, 0, layout.h);
      g.addColorStop(0, "rgba(200,208,214,0)");
      g.addColorStop(1, rgb([186, 194, 202], 0.18 + pal.ww[5] * 0.28));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, layout.w, layout.h);
    }
  }

  function drawBolt(st) {
    if (!st.bolt) return;
    var a = iso(st.bolt.x, st.bolt.y, 9);
    var b = iso(st.bolt.tx, st.bolt.ty, 0);
    ctx.strokeStyle = rgb([230, 235, 255], 0.35 * st.bolt.life);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    var steps = 6, i, x, y;
    for (i = 1; i <= steps; i++) {
      x = lerp(a.x, b.x, i / steps) + ((i % 2) ? 8 : -8);
      y = lerp(a.y, b.y, i / steps);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawHaze(st, pal) {
    ctx.fillStyle = rgb(pal.bot, 0.08);
    ctx.fillRect(0, layout.h * 0.82, layout.w, layout.h * 0.18);
    var vg = ctx.createRadialGradient(layout.w / 2, layout.h * 0.45, layout.w * 0.2, layout.w / 2, layout.h * 0.5, layout.w * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(12,16,24,0.22)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, layout.w, layout.h);
  }

  /* ---------- hit tests ---------- */
  function canvasPoint(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function screenToWorld(px, py) {
    var x = px - layout.ox;
    var y = py - layout.oy;
    var gx = (x / layout.tw + y / layout.th) / 2;
    var gy = (y / layout.th - x / layout.tw) / 2;
    return { x: gx, y: gy };
  }

  function hitCloud(st, px, py) {
    var best = null, bd = 40;
    for (var i = 0; i < st.clouds.length; i++) {
      var c = st.clouds[i];
      if (c.sx == null) continue;
      var d = Math.hypot(c.sx - px, c.sy - py);
      if (d < (c.sr || 28) && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function hitBuilding(st, px, py) {
    for (var i = st.buildings.length - 1; i >= 0; i--) {
      var b = st.buildings[i];
      var h = b.hit;
      if (!h) continue;
      if (px >= h.minx && px <= h.maxx && py >= h.miny && py <= h.maxy) return b;
    }
    return null;
  }

  function showCard(b) {
    var ww = weatherWeights(S.weather);
    var shelter = ww[3] > 0.4 || precipKind(S.temp, ww) === "rain" && ww[2] > 0.6;
    document.getElementById("cardKind").textContent = b.kind;
    document.getElementById("cardTitle").textContent = b.name;
    document.getElementById("cardBody").textContent =
      b.occupants + " occupants. " +
      (S.time < 6 || S.time > 20 ? "Windows glow for the night watch. " : "Daylight on the facade. ") +
      (shelter ? "People are ducking under the lintel from the weather. " : "Doors stay easy; street life continues. ") +
      (S.snowPack > 0.3 ? "Snow sits on the roof tiles." : S.puddles > 0.3 ? "The stoop is dark with rain." : "The masonry is dry.");
    cardEl.hidden = false;
  }

  /* ---------- UI ---------- */
  function syncDialTicks() {
    var g = document.getElementById("dialTicks");
    g.innerHTML = "";
    for (var i = 0; i < 6; i++) {
      var ang = (-140 + i * 56) * Math.PI / 180;
      var x1 = 80 + Math.cos(ang) * 62;
      var y1 = 80 + Math.sin(ang) * 62;
      var x2 = 80 + Math.cos(ang) * 70;
      var y2 = 80 + Math.sin(ang) * 70;
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      line.setAttribute("stroke", "#5a3a18");
      line.setAttribute("stroke-width", "2");
      g.appendChild(line);
    }
  }

  function weatherIndex() {
    return clamp(S.weather, 0, 5);
  }

  function setNeedle() {
    var t = weatherIndex() / 5;
    var deg = -140 + t * 280;
    var rad = deg * Math.PI / 180;
    var x2 = 80 + Math.cos(rad) * 58;
    var y2 = 80 + Math.sin(rad) * 58;
    ui.dialNeedle.setAttribute("x2", x2);
    ui.dialNeedle.setAttribute("y2", y2);
  }

  function syncUI() {
    ui.temp.value = String(S.temp);
    ui.windStr.value = String(S.windStr);
    ui.windDir.value = String(((S.windDirDeg % 360) + 360) % 360);
    ui.clock.value = String(S.time);
    ui.season.value = String(S.season);
    ui.speed.value = String(S.speed);
    ui.weatherName.textContent = WEATHER_LABELS[Math.round(weatherIndex())];
    ui.tempVal.textContent = (Math.round(S.temp * 10) / 10) + "°C";
    ui.windStrVal.textContent = windWord(S.windStr);
    ui.windDirVal.textContent = compass(S.windDirDeg);
    ui.clockVal.textContent = hourLabel(S.time);
    ui.seasonVal.textContent = SEASONS[S.season];
    ui.speedVal.textContent = (Math.round(S.speed * 100) / 100).toFixed(2) + "×";
    ui.pause.setAttribute("aria-pressed", S.paused ? "true" : "false");
    ui.pause.textContent = S.paused ? "Resume" : "Pause";
    ui.seedLabel.textContent = String(S.seed);
    setNeedle();
    var ww = weatherWeights(S.weather);
    var kind = precipKind(S.temp, ww);
    var wname = WEATHER_LABELS[Math.round(weatherIndex())];
    if (wname === "Snow" && kind === "rain") wname = "Snow (melting to rain)";
    if ((wname === "Rain" || wname === "Storm") && kind === "snow") wname = wname + " as snow";
    var msg = wname + ", " + Math.round(S.temp) + " degrees, " + SEASONS[S.season] +
      " at " + hourLabel(S.time) + ". Wind " + windWord(S.windStr) + " " + compass(S.windDirDeg) +
      ". " + S.vehicles.length + " vehicles, " + S.people.filter(function (p) { return !p.cover; }).length + " people in streets.";
    var now = performance.now();
    if (msg !== lastLive && now - liveAt > 1400) {
      live.textContent = msg;
      lastLive = msg;
      liveAt = now;
    }
  }

  function applyPreset(i) {
    var p = PRESETS[i];
    takeControl(S);
    S.weather = p.weather;
    S.temp = p.temp;
    S.time = p.time;
    S.season = p.season;
    S.windStr = p.windStr;
    S.windDirDeg = p.windDir;
    syncUI();
  }

  function resetSim() {
    S = makeState(SEED0);
    cardEl.hidden = true;
    syncUI();
  }

  function bind() {
    syncDialTicks();
    ["temp", "windStr", "windDir", "clock", "season", "speed"].forEach(function (id) {
      ui[id].addEventListener("input", function () {
        takeControl(S);
        S.temp = parseFloat(ui.temp.value);
        S.windStr = parseFloat(ui.windStr.value);
        S.windDirDeg = parseFloat(ui.windDir.value);
        S.time = parseFloat(ui.clock.value);
        S.season = parseInt(ui.season.value, 10);
        S.speed = parseFloat(ui.speed.value);
        syncUI();
      });
    });
    ui.pause.addEventListener("click", function () {
      S.paused = !S.paused;
      syncUI();
    });
    ui.reset.addEventListener("click", resetSim);
    document.querySelectorAll("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () { applyPreset(parseInt(btn.getAttribute("data-preset"), 10)); });
    });
    document.getElementById("cardClose").addEventListener("click", function () { cardEl.hidden = true; });

    ui.dialBtn.addEventListener("pointerdown", function (ev) {
      ui.dialBtn.setPointerCapture(ev.pointerId);
      takeControl(S);
      aimDial(ev);
    });
    ui.dialBtn.addEventListener("pointermove", function (ev) {
      if (ev.buttons) aimDial(ev);
    });
    ui.dialBtn.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
        S.weather = clamp(S.weather + 0.2, 0, 5); takeControl(S); syncUI(); ev.preventDefault();
      }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
        S.weather = clamp(S.weather - 0.2, 0, 5); takeControl(S); syncUI(); ev.preventDefault();
      }
    });

    canvas.addEventListener("pointerdown", function (ev) {
      var pt = canvasPoint(ev);
      var cloud = hitCloud(S, pt.x, pt.y);
      if (cloud) {
        cloud.burst = 2.8;
        takeControl(S);
        return;
      }
      var b = hitBuilding(S, pt.x, pt.y);
      if (b) {
        showCard(b);
        takeControl(S);
        return;
      }
      canvas.setPointerCapture(ev.pointerId);
      var w = screenToWorld(pt.x, pt.y);
      S.drag = { x: w.x, y: w.y };
      takeControl(S);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!S.drag || ev.buttons === 0) return;
      var pt = canvasPoint(ev);
      var w = screenToWorld(pt.x, pt.y);
      var vx = w.x - S.drag.x;
      var vy = w.y - S.drag.y;
      if (Math.hypot(vx, vy) > 0.04) {
        S.gusts.push({ x: w.x, y: w.y, vx: vx * 2.2, vy: vy * 2.2, life: 1 });
        if (S.gusts.length > 12) S.gusts.shift();
        S.drag = w;
      }
    });
    canvas.addEventListener("pointerup", function () { S.drag = null; });

    window.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var tag = (ev.target && ev.target.tagName) || "";
      if (ev.key === " " && tag !== "INPUT") {
        S.paused = !S.paused; syncUI(); ev.preventDefault();
      } else if (ev.key === "r" || ev.key === "R") {
        if (tag !== "INPUT") resetSim();
      } else if (ev.key >= "1" && ev.key <= "4") {
        applyPreset(parseInt(ev.key, 10) - 1);
      }
    });
    window.addEventListener("resize", resize);
  }

  function aimDial(ev) {
    var r = ui.dialBtn.getBoundingClientRect();
    var x = ev.clientX - r.left - r.width / 2;
    var y = ev.clientY - r.top - r.height / 2;
    var ang = Math.atan2(y, x) * 180 / Math.PI;
    var t = (ang + 140) / 280;
    S.weather = clamp(t * 5, 0, 5);
    syncUI();
  }

  var last = 0;
  var uiAt = 0;
  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    update(S, dt);
    draw();
    if (now - uiAt > 200) { syncUI(); uiAt = now; }
    requestAnimationFrame(loop);
  }

  S = makeState(SEED0);
  resize();
  bind();
  syncUI();
  requestAnimationFrame(loop);
})();
