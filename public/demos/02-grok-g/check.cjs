"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = __dirname;
const context = {
  module: { exports: {} },
  exports: {},
  console: console,
  Math: Math,
  Float32Array: Float32Array,
  isFinite: isFinite
};
context.exports = context.module.exports;
vm.runInNewContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context, {
  filename: "app.js"
});
const ga = context.module.exports;

const s1 = ga.simulatePreset(1, 30);
const s2 = ga.simulatePreset(2, 30);
const s3 = ga.simulatePreset(3, 30);
if (s1.nan || s2.nan || s3.nan) throw new Error("NaN in simulation");
if (s1.bodies !== 6 || s1.escaped !== 0) {
  throw new Error("stable preset failed: " + JSON.stringify(s1));
}
if (s2.bodies < 4) throw new Error("binary collapsed: " + JSON.stringify(s2));
if (s3.bodies < 4) throw new Error("slingshot evaporated: " + JSON.stringify(s3));

const pack = ga.loadPreset(1, false);
const w = pack.world;
w.bodies = [];
const A = w.add({
  name: "A", x: 0, y: 0, vx: 40, vy: 0, mass: 20, radius: 6, hue: 1, kind: "planet"
});
const B = w.add({
  name: "B", x: 80, y: 0, vx: -20, vy: 0, mass: 10, radius: 4, hue: 2, kind: "planet"
});
const px = A.mass * A.vx + B.mass * B.vx;
const py = A.mass * A.vy + B.mass * B.vy;
for (let i = 0; i < 400; i++) w.step(ga.DT, false, w.rng);
let mx = 0;
let my = 0;
let mass = 0;
for (const b of w.bodies) {
  mx += b.mass * b.vx;
  my += b.mass * b.vy;
  mass += b.mass;
}
if (Math.abs(mass - 30) > 0.01) throw new Error("mass not conserved " + mass);
if (Math.abs(mx - px) > 0.5 || Math.abs(my - py) > 0.5) {
  throw new Error("momentum drift " + px + "->" + mx);
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const [name, text] of [["index.html", html], ["app.js", js], ["README.md", readme]]) {
  if (/https?:\/\//.test(text)) throw new Error("remote URL in " + name);
}
if (!html.includes('src="app.js"') || !html.includes("btn-clear")) {
  throw new Error("index.html missing required markup");
}

console.log("check.cjs passed", JSON.stringify({ s1: s1.bodies, s2: s2.bodies, s3: s3.bodies, mass, mx }));
