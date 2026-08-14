#!/usr/bin/env bun
/**
 * CLI entrypoint.
 *
 *   bun run src/cli.ts data/requests.csv \
 *     --json out/analysis.json \
 *     --markdown analysis.md \
 *     --html report.html
 *
 * Exit codes: 0 success · 2 invalid usage or malformed input.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AnalysisInputError, analyze, parseCsv } from "./analyze.ts";
import { renderHtml, renderMarkdown } from "./render.ts";

const USAGE = `Usage:
  bun run src/cli.ts <input.csv> [--json <path>] [--markdown <path>] [--html <path>]

Options:
  --json <path>      write deterministic structured analysis JSON
  --markdown <path>  write the written analysis
  --html <path>      write the standalone visual report
  -h, --help         show this message

Exit codes: 0 success, 2 invalid usage or malformed input.`;

export interface CliOptions {
  input: string;
  json?: string;
  markdown?: string;
  html?: string;
}

/** Parse argv. Throws AnalysisInputError on anything the CLI cannot act on. */
export function parseArgs(argv: string[]): CliOptions {
  const flags = new Map<string, string>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      throw new AnalysisInputError("__HELP__");
    }
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (!["json", "markdown", "html"].includes(name)) {
        throw new AnalysisInputError(`Unknown option: ${arg}`);
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new AnalysisInputError(`Option ${arg} requires a file path.`);
      }
      if (flags.has(name)) {
        throw new AnalysisInputError(`Option ${arg} was given more than once.`);
      }
      flags.set(name, value);
      i++;
    } else if (arg.startsWith("-") && arg.length > 1) {
      throw new AnalysisInputError(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length === 0) {
    throw new AnalysisInputError("Missing required <input.csv> argument.");
  }
  if (positionals.length > 1) {
    throw new AnalysisInputError(
      `Expected exactly one input file, got ${positionals.length}: ${positionals.join(", ")}`,
    );
  }

  return {
    input: positionals[0]!,
    json: flags.get("json"),
    markdown: flags.get("markdown"),
    html: flags.get("html"),
  };
}

async function writeOut(path: string, contents: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, contents, "utf8");
}

export async function run(argv: string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof AnalysisInputError && err.message === "__HELP__") {
      console.log(USAGE);
      return 0;
    }
    console.error(`error: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  let text: string;
  try {
    text = await readFile(opts.input, "utf8");
  } catch {
    console.error(`error: cannot read input file "${opts.input}".\n\n${USAGE}`);
    return 2;
  }

  let rows;
  let analysis;
  try {
    rows = parseCsv(text);
    analysis = analyze(rows, opts.input);
  } catch (err) {
    if (err instanceof AnalysisInputError) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  // Two decimal-free spaces of indentation keeps the JSON diffable; key order is
  // fixed by object-literal order in analyze(), so the bytes are stable.
  if (opts.json) await writeOut(opts.json, `${JSON.stringify(analysis, null, 2)}\n`);
  if (opts.markdown) await writeOut(opts.markdown, renderMarkdown(analysis));
  if (opts.html) await writeOut(opts.html, `${renderHtml(analysis, rows)}\n`);

  const v = analysis.validation;
  console.log(`Parsed ${analysis.row_count} rows from ${opts.input}`);
  console.log(
    `Validation: rows=80 ${v.row_count_is_80 ? "pass" : "FAIL"} · control=40 ${v.control_rows === 40 ? "pass" : "FAIL"} · ` +
      `candidate=40 ${v.candidate_rows === 40 ? "pass" : "FAIL"} · control non-200=0 ${v.control_non_200_is_zero ? "pass" : "FAIL"} · ` +
      `candidate non-200=4 ${v.candidate_non_200_is_four ? "pass" : "FAIL"}`,
  );
  const worst = analysis.strata
    .filter((s) => s.direction === "candidate_slower")
    .sort((a, b) => (b.mean_delta_pct ?? 0) - (a.mean_delta_pct ?? 0))[0];
  console.log(
    `Aggregate mean delta: ${analysis.aggregate_comparison.mean_delta_ms} ms (${analysis.aggregate_comparison.mean_delta_pct}%) — confounded by traffic mix`,
  );
  console.log(
    `Candidate faster in ${analysis.simpsons_paradox.strata_candidate_faster}/${analysis.simpsons_paradox.strata_with_both_variants} strata` +
      (worst ? `; regression isolated to ${worst.stratum} (${worst.mean_delta_pct}%)` : ""),
  );
  if (opts.json) console.log(`Wrote ${opts.json}`);
  if (opts.markdown) console.log(`Wrote ${opts.markdown}`);
  if (opts.html) console.log(`Wrote ${opts.html}`);

  return 0;
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
