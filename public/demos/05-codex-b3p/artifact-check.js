"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const files = ["index.html", "styles.css", "engine.js", "levels.js", "app.js", "README.md", "geometry-tests.js", "package.json"];

for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
for (const reference of ["styles.css", "engine.js", "levels.js", "app.js"]) {
  assert.ok(html.includes(reference), `index.html must reference ${reference}`);
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const accessedIds = [...app.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
for (const id of accessedIds) assert.ok(htmlIds.has(id), `app.js references missing #${id}`);

assert.doesNotMatch(
  [html, ...["styles.css", "engine.js", "levels.js", "app.js"].map(file => fs.readFileSync(path.join(root, file), "utf8"))].join("\n"),
  /\bhttps?:\/\//i,
  "runtime files must not contain remote URLs"
);
assert.equal(globalThis.LightLevels, undefined);
require("./levels.js");
assert.equal(globalThis.LightLevels.length, 5, "exactly five levels must load");

for (const key of ["q", "e", "z", "y", "r", "h"]) {
  assert.ok(app.includes(`"${key}"`), `keyboard control ${key.toUpperCase()} must be wired`);
}

console.log("Artifact checks passed: local references, DOM bindings, five levels, controls, and zero remote runtime URLs.");
