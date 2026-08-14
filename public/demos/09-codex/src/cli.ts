#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { analyze, parseRequestsCsv, stableJson } from "./analyze";
import { renderHtml, renderMarkdown } from "./render";

export function parseArgs(args: string[]) {
  if (args.length !== 7) throw new Error("Invalid usage");
  const [source, jsonFlag, jsonPath, markdownFlag, markdownPath, htmlFlag, htmlPath] = args;
  if (!source || jsonFlag !== "--json" || !jsonPath ||
      markdownFlag !== "--markdown" || !markdownPath ||
      htmlFlag !== "--html" || !htmlPath) {
    throw new Error("Invalid usage");
  }
  return { source, jsonPath, markdownPath, htmlPath };
}

async function writeOutput(path: string, contents: string) {
  const parent = dirname(path);
  if (parent !== ".") await mkdir(parent, { recursive: true });
  await Bun.write(path, contents);
}

export async function main(args = Bun.argv.slice(2)): Promise<number> {
  try {
    const paths = parseArgs(args);
    const text = await Bun.file(paths.source).text();
    const rows = parseRequestsCsv(text);
    const result = analyze(rows, paths.source);
    await Promise.all([
      writeOutput(paths.jsonPath, stableJson(result)),
      writeOutput(paths.markdownPath, renderMarkdown(result)),
      writeOutput(paths.htmlPath, renderHtml(result, rows)),
    ]);
    console.log(`Analyzed ${rows.length} rows: ${paths.jsonPath}, ${paths.markdownPath}, ${paths.htmlPath}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message === "Invalid usage" ?
      "Usage: bun run src/cli.ts <csv> --json <path> --markdown <path> --html <path>" :
      `Error: ${message}`);
    return 2;
  }
}

if (import.meta.main) process.exit(await main());
