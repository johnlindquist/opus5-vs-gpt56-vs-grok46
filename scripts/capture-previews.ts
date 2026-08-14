import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import battle from "../src/data/battle.json";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(SITE, "public", "previews");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "capture-manifest.json");
const DEMO_ORIGIN = process.env.CAPTURE_DEMO_ORIGIN ?? "https://opus-sol-grok-demos.vercel.app";
const SESSION = "comparison-previews";
const PROVIDERS = ["claude", "grok", "codex"] as const;

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: SITE,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    throw new Error(
      [`${command} ${args.join(" ")} exited ${result.status}`, stdout, stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

const targets = battle.specs.flatMap((spec) =>
  PROVIDERS.map((provider) => {
    const demo = spec.demos[provider];
    const cell = spec.cells[provider];
    if (!demo || !cell) {
      throw new Error(`Missing staged demo metadata for ${spec.id}/${provider}`);
    }
    return {
      spec_id: spec.id,
      title: spec.title,
      provider,
      provider_label: battle.providers[provider].label,
      cell_id: cell.cell_id,
      staged_demo_path: demo.path,
      source_url: new URL(demo.path.replace(/index\.html$/, ""), DEMO_ORIGIN).href,
      preview_path: `/previews/${cell.cell_id}.webp`,
      filename: `${cell.cell_id}.webp`,
      alt: `Static preview of ${spec.title} by ${battle.providers[provider].label}`,
      capture: {
        viewport_width: 1440,
        viewport_height: 900,
        aspect_ratio: "16:10",
        format: "webp",
        quality: 88,
        interaction: "none",
        wait_after_load_ms: 1200,
        full_page: false,
      },
    };
  }),
);

if (targets.length !== 60 || new Set(targets.map((target) => target.cell_id)).size !== 60) {
  throw new Error(`Expected 60 unique preview targets, received ${targets.length}`);
}

const unavailable = (
  await Promise.all(
    targets.map(async (target) => {
      const response = await fetch(target.source_url, { method: "HEAD" });
      return response.ok
        ? null
        : `${target.cell_id}: ${response.status} ${response.statusText}`;
    }),
  )
).filter((result): result is string => result !== null);

if (unavailable.length > 0) {
  throw new Error(`Preview sources unavailable:\n${unavailable.join("\n")}`);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const tempPng = path.join(os.tmpdir(), `comparison-preview-${process.pid}.png`);

try {
  run("agent-browser", ["--session", SESSION, "set", "viewport", "1440", "900"]);

  for (const [index, target] of targets.entries()) {
    console.log(`[${String(index + 1).padStart(2, "0")}/60] ${target.cell_id}`);
    run("agent-browser", ["--session", SESSION, "open", target.source_url]);
    run("agent-browser", ["--session", SESSION, "wait", "1200"]);
    const pageText = run("agent-browser", [
      "--session",
      SESSION,
      "get",
      "text",
      "body",
    ]).trim();
    if (/^404\s+Not Found\s*$/i.test(pageText)) {
      throw new Error(`Browser resolved ${target.cell_id} to a 404 page`);
    }
    run("agent-browser", ["--session", SESSION, "screenshot", tempPng]);
    run("cwebp", [
      "-quiet",
      "-q",
      String(target.capture.quality),
      tempPng,
      "-o",
      path.join(OUTPUT_DIR, target.filename),
    ]);
  }
} finally {
  spawnSync("agent-browser", ["--session", SESSION, "close"], {
    cwd: SITE,
    stdio: "ignore",
  });
  fs.rmSync(tempPng, { force: true });
}

fs.writeFileSync(
  MANIFEST_PATH,
  `${JSON.stringify(
    {
      schema_version: "comparison-preview-capture-v1",
      generated_at: new Date().toISOString(),
      source_origin: DEMO_ORIGIN,
      rule: "Open every staged artifact without interaction, wait 1200ms after load, capture the 1440x900 viewport, and encode the result as WebP quality 88.",
      items: targets,
    },
    null,
    2,
  )}\n`,
);

console.log(`Captured ${targets.length} previews in ${path.relative(SITE, OUTPUT_DIR)}`);
