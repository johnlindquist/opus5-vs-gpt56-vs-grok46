/**
 * Fail if Grok is excluded from Decision Lab time utility.
 * Checks source, the built homepage, and an optional live URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  "Time compares only Opus and Sol",
  "A Quality + cost preset ranks all three agents",
  "Speed compares only Opus and Sol",
  "Grok clocks are shown as provenance only",
  "Time · provenance · not in score",
  "stay out of the time weight",
  "stay out of the decision-lab time weight",
  "stay out of the Decision Lab time weight",
  "Observational later-run clocks · not in the composite",
  "Wall-clock durations are receipt provenance only and are never used as a controlled",
] as const;

const SOURCE_PATHS = [
  "src/components/decision-lab.tsx",
  "src/app/methodology/page.tsx",
  "src/app/specs/[id]/page.tsx",
  "src/lib/data.ts",
  "src/data/battle.json",
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function assertAbsent(label: string, text: string) {
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      fail(`${label} still excludes Grok from Decision Lab time: ${needle}`);
    }
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(SITE, rel), "utf8");
}

function collectBuiltHomepage(): string {
  const chunks: string[] = [];
  const candidates = [
    ".next/server/app/index.html",
    ".next/server/app/index.rsc",
    ".next/server/app/page.js",
  ];
  for (const rel of candidates) {
    const full = path.join(SITE, rel);
    if (fs.existsSync(full)) chunks.push(fs.readFileSync(full, "utf8"));
  }
  const staticDir = path.join(SITE, ".next/static/chunks");
  if (fs.existsSync(staticDir)) {
    for (const name of fs.readdirSync(staticDir)) {
      if (!name.endsWith(".js")) continue;
      const body = fs.readFileSync(path.join(staticDir, name), "utf8");
      if (
        body.includes("decision-lab") ||
        body.includes("Interactive decision lab") ||
        body.includes("Quality, time, and cost")
      ) {
        chunks.push(body);
      }
    }
  }
  if (chunks.length === 0) {
    fail("no built homepage output found; run `bun run build` first");
  }
  return chunks.join("\n");
}

const url = process.argv[2];

for (const rel of SOURCE_PATHS) {
  assertAbsent(rel, read(rel));
}

const lab = read("src/components/decision-lab.tsx");
const battle = read("src/data/battle.json");
if (!lab.includes("Quality, time, and cost include all three agents")) {
  fail("src/components/decision-lab.tsx is missing Quality, time, and cost include all three agents");
}
if (!lab.includes("zeros the time weight")) {
  fail("src/components/decision-lab.tsx is missing zeros the time weight");
}
if (!battle.includes("Quality, time, and cost include all three agents")) {
  fail("src/data/battle.json is missing Quality, time, and cost include all three agents");
}
if (!battle.includes("Each agent ran each spec once through its main programming tool.")) {
  fail("src/data/battle.json is missing the single-run variability disclosure");
}
if (battle.includes('"utility": null') && battle.includes('"unit": "recorded summed runtime (provenance only)"')) {
  fail("src/data/battle.json still has a provenance-only Grok speed utility");
}

const built = collectBuiltHomepage();
assertAbsent("built homepage", built);
if (!built.includes("Quality, time, and cost include all three agents")) {
  fail("built homepage is missing Quality, time, and cost include all three agents");
}

if (url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  const live = await response.text();
  assertAbsent(url, live);
  if (!live.includes("Quality, time, and cost include all three agents")) {
    fail(`${url} is missing Quality, time, and cost include all three agents`);
  }
}

console.log(
  url
    ? `decision-lab copy assertion passed for source, build, and ${url}`
    : "decision-lab copy assertion passed for source and build",
);
