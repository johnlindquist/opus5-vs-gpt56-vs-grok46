import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { analyzeFile, pathIsReadable } from "./analyze.ts";
import { formatHtml } from "./html.ts";
import { formatJson } from "./json.ts";
import { formatTerminal } from "./terminal.ts";

const USAGE = `Trace Sheriff — Agent Timeline Forensics

Usage:
  bun run src/cli.ts analyze <path> [--json <file>] [--html <file>]
  bun run src/cli.ts help

Reads a JSONL agent event log incrementally, reconstructs session timelines,
and reports structural anomalies. Malformed lines are findings, not crashes.

Exit codes:
  0  analysis completed (findings do not fail the run)
  2  invalid CLI usage or unreadable input path
`;

function failUsage(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(2);
}

interface AnalyzeArgs {
  input: string;
  jsonPath: string | null;
  htmlPath: string | null;
}

function parseArgs(argv: string[]): { help: true } | { help: false; analyze: AnalyzeArgs } {
  if (argv.length === 0) {
    failUsage("Missing command.");
  }
  const command = argv[0];
  if (command === "help" || command === "--help" || command === "-h") {
    if (argv.length > 1) {
      failUsage("help does not take arguments.");
    }
    return { help: true };
  }
  if (command !== "analyze") {
    failUsage(`Unknown command: ${command}`);
  }
  const rest = argv.slice(1);
  let input: string | null = null;
  let jsonPath: string | null = null;
  let htmlPath: string | null = null;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--json") {
      const value = rest[i + 1];
      if (!value || value.startsWith("--")) {
        failUsage("--json requires a file path.");
      }
      jsonPath = value;
      i += 1;
      continue;
    }
    if (token === "--html") {
      const value = rest[i + 1];
      if (!value || value.startsWith("--")) {
        failUsage("--html requires a file path.");
      }
      htmlPath = value;
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      failUsage(`Unknown flag: ${token}`);
    }
    if (input !== null) {
      failUsage("Multiple input paths are not supported.");
    }
    input = token;
  }
  if (!input) {
    failUsage("analyze requires an input path.");
  }
  return { help: false, analyze: { input, jsonPath, htmlPath } };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(USAGE.trimEnd());
    process.exit(0);
  }
  const { input, jsonPath, htmlPath } = parsed.analyze;
  if (!(await pathIsReadable(input))) {
    console.error(`Unreadable input path: ${input}`);
    process.exit(2);
  }
  const report = await analyzeFile(input);
  console.log(formatTerminal(report));
  if (jsonPath) {
    await mkdir(dirname(jsonPath) || ".", { recursive: true });
    await Bun.write(jsonPath, formatJson(report));
  }
  if (htmlPath) {
    await mkdir(dirname(htmlPath) || ".", { recursive: true });
    await Bun.write(htmlPath, formatHtml(report));
  }
}

await main();
