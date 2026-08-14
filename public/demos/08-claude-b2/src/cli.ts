#!/usr/bin/env bun
/**
 * Trace Sheriff CLI.
 *
 * Exit codes:
 *   0 — analysis completed (findings do not change this)
 *   2 — invalid usage or unreadable input path
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeFile, DEFAULT_IDLE_GAP_MS, TOOL_VERSION } from "./analyze.ts";
import { renderHtml } from "./report-html.ts";
import { renderTerminal } from "./report-terminal.ts";

export const USAGE = `Trace Sheriff — agent timeline forensics (${TOOL_VERSION})

USAGE
  bun run src/cli.ts analyze <path.jsonl> [options]
  bun run src/cli.ts help

OPTIONS
  --json <path>        write the deterministic JSON report
  --html <path>        write a self-contained HTML timeline report
  --idle-gap-ms <n>    idle-gap threshold in ms (default ${DEFAULT_IDLE_GAP_MS})
  --max-findings <n>   limit findings printed to the terminal (default all)
  --no-color           disable ANSI colour
  --quiet              suppress the terminal summary

EXAMPLES
  bun run src/cli.ts analyze fixtures/sample.jsonl
  bun run src/cli.ts analyze fixtures/sample.jsonl --json out/summary.json --html report.html

EXIT CODES
  0  analysis completed (even when findings were reported)
  2  invalid usage or unreadable input path
`;

export interface ParsedArgs {
  command: "analyze" | "help";
  input?: string;
  json?: string;
  html?: string;
  idleGapMs?: number;
  maxFindings?: number;
  color: boolean;
  quiet: boolean;
}

export class UsageError extends Error {}

const VALUE_FLAGS = new Set(["--json", "--html", "--idle-gap-ms", "--max-findings"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", color: true, quiet: false };
  }
  if (command !== "analyze") {
    throw new UsageError(`Unknown command "${command}".`);
  }

  const parsed: ParsedArgs = { command: "analyze", color: true, quiet: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (VALUE_FLAGS.has(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`Option ${arg} requires a value.`);
      }
      i += 1;
      if (arg === "--json") parsed.json = value;
      else if (arg === "--html") parsed.html = value;
      else {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) throw new UsageError(`Option ${arg} requires a non-negative number.`);
        if (arg === "--idle-gap-ms") parsed.idleGapMs = num;
        else parsed.maxFindings = num;
      }
    } else if (arg === "--no-color") {
      parsed.color = false;
    } else if (arg === "--quiet") {
      parsed.quiet = true;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option "${arg}".`);
    } else if (parsed.input === undefined) {
      parsed.input = arg;
    } else {
      throw new UsageError(`Unexpected extra argument "${arg}".`);
    }
  }

  if (parsed.input === undefined) throw new UsageError("analyze requires an input path.");
  return parsed;
}

async function writeOut(path: string, contents: string): Promise<void> {
  const dir = dirname(resolve(path));
  await mkdir(dir, { recursive: true });
  await Bun.write(path, contents);
}

export async function run(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n\n${USAGE}`);
    return 2;
  }

  if (args.command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }

  const input = args.input as string;
  const file = Bun.file(input);
  if (!(await file.exists())) {
    process.stderr.write(`error: cannot read input path "${input}".\n`);
    return 2;
  }

  let report;
  try {
    report = await analyzeFile(input, { idleGapMs: args.idleGapMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: cannot read input path "${input}": ${message}\n`);
    return 2;
  }

  if (args.json !== undefined) {
    await writeOut(args.json, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.html !== undefined) {
    await writeOut(args.html, renderHtml(report));
  }

  if (!args.quiet) {
    const color = args.color && Boolean(process.stdout.isTTY);
    process.stdout.write(
      `${renderTerminal(report, { color, maxFindings: args.maxFindings })}\n`,
    );
    const written: string[] = [];
    if (args.json !== undefined) written.push(`JSON  → ${args.json}`);
    if (args.html !== undefined) written.push(`HTML  → ${args.html}`);
    if (written.length > 0) process.stdout.write(`${written.join("\n")}\n`);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await run(Bun.argv.slice(2)));
}
