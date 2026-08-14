import { analyzeFile, deterministicJson } from "./analyzer";
import { htmlReport, terminalReport } from "./report";
import { mkdir } from "node:fs/promises";

const USAGE = `Trace Sheriff — Agent Timeline Forensics

Usage:
  bun run src/cli.ts analyze <path> [--json <path>] [--html <path>]
  bun run src/cli.ts help

Findings do not make analysis fail. Invalid usage or unreadable input exits 2.`;

interface AnalyzeArgs {
  input: string;
  json?: string;
  html?: string;
}

export function parseAnalyzeArgs(args: string[]): AnalyzeArgs | null {
  if (args.length < 1 || args[0].startsWith("--")) return null;
  const result: AnalyzeArgs = { input: args[0] };
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if ((flag === "--json" || flag === "--html") && args[index + 1] && !args[index + 1].startsWith("--")) {
      result[flag.slice(2) as "json" | "html"] = args[++index];
    } else return null;
  }
  return result;
}

async function writeOutput(path: string, content: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  if (slash > 0) await mkdir(path.slice(0, slash), { recursive: true });
  await Bun.write(path, content);
}

export async function runCli(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "help") {
    console.log(USAGE);
    return 0;
  }
  if (args[0] !== "analyze") {
    console.error(USAGE);
    return 2;
  }
  const options = parseAnalyzeArgs(args.slice(1));
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  try {
    const summary = await analyzeFile(options.input, options.input);
    console.log(terminalReport(summary).trimEnd());
    if (options.json) await writeOutput(options.json, deterministicJson(summary));
    if (options.html) await writeOutput(options.html, htmlReport(summary));
    return 0;
  } catch (error) {
    console.error(`Trace Sheriff: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (import.meta.main) process.exitCode = await runCli(Bun.argv.slice(2));
