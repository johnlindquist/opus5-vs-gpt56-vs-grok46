import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  AnalysisError,
  analyze,
  parseCsv,
  renderHtml,
  renderMarkdown,
  stableStringify,
} from "./analyze.ts";

function usage(): string {
  return `Usage:
  bun run src/cli.ts <csv-path> --json <out.json> --markdown <out.md> --html <out.html>

Invalid usage or malformed required columns exits 2.`;
}

function parseArgs(argv: string[]): {
  csvPath: string;
  jsonPath: string;
  markdownPath: string;
  htmlPath: string;
} {
  if (argv.length === 0) {
    throw new AnalysisError(usage());
  }
  const csvPath = argv[0];
  if (!csvPath || csvPath.startsWith("-")) {
    throw new AnalysisError(usage());
  }
  let jsonPath = "";
  let markdownPath = "";
  let htmlPath = "";
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value || value.startsWith("-")) {
      throw new AnalysisError(usage());
    }
    if (flag === "--json") jsonPath = value;
    else if (flag === "--markdown") markdownPath = value;
    else if (flag === "--html") htmlPath = value;
    else throw new AnalysisError(usage());
    i++;
  }
  if (!jsonPath || !markdownPath || !htmlPath) {
    throw new AnalysisError(usage());
  }
  return { csvPath, jsonPath, markdownPath, htmlPath };
}

export function runCli(argv: string[]): number {
  try {
    const args = parseArgs(argv);
    let text: string;
    try {
      text = readFileSync(args.csvPath, "utf8");
    } catch {
      throw new AnalysisError(`Cannot read CSV: ${args.csvPath}`);
    }
    const rows = parseCsv(text);
    const analysis = analyze(rows, args.csvPath);
    const json = stableStringify(analysis);
    const markdown = renderMarkdown(analysis);
    const html = renderHtml(analysis, rows);
    for (const path of [args.jsonPath, args.markdownPath, args.htmlPath]) {
      mkdirSync(dirname(resolve(path)), { recursive: true });
    }
    writeFileSync(args.jsonPath, json, "utf8");
    writeFileSync(args.markdownPath, markdown, "utf8");
    writeFileSync(args.htmlPath, html, "utf8");
    return 0;
  } catch (err) {
    const message = err instanceof AnalysisError ? err.message : String(err);
    const code = err instanceof AnalysisError ? err.exitCode : 2;
    console.error(message);
    return code;
  }
}

if (import.meta.main) {
  process.exit(runCli(process.argv.slice(2)));
}
