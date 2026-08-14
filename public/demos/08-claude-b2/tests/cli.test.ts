import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, UsageError } from "../src/cli.ts";

const CLI = "src/cli.ts";
const tmp = await mkdtemp(join(tmpdir(), "trace-sheriff-"));

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function runCli(args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("argument parsing", () => {
  test("parses the documented invocation", () => {
    const args = parseArgs(["analyze", "fixtures/sample.jsonl", "--json", "out/summary.json", "--html", "report.html"]);
    expect(args).toMatchObject({
      command: "analyze",
      input: "fixtures/sample.jsonl",
      json: "out/summary.json",
      html: "report.html",
    });
  });

  test("no arguments means help", () => {
    expect(parseArgs([]).command).toBe("help");
  });

  test("rejects unknown commands, unknown options and missing values", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(UsageError);
    expect(() => parseArgs(["analyze", "x.jsonl", "--wat"])).toThrow(UsageError);
    expect(() => parseArgs(["analyze", "x.jsonl", "--json"])).toThrow(UsageError);
    expect(() => parseArgs(["analyze"])).toThrow(UsageError);
    expect(() => parseArgs(["analyze", "a.jsonl", "b.jsonl"])).toThrow(UsageError);
  });
});

describe("process behaviour", () => {
  test("help exits 0 and prints usage", async () => {
    const { stdout, exitCode } = await runCli(["help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("analyze <path.jsonl>");
  });

  test("exit 2 for an unknown command", async () => {
    const { stderr, exitCode } = await runCli(["frobnicate"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown command");
  });

  test("exit 2 for a missing input path", async () => {
    const { exitCode } = await runCli(["analyze"]);
    expect(exitCode).toBe(2);
  });

  test("exit 2 for an unreadable input path", async () => {
    const { stderr, exitCode } = await runCli(["analyze", join(tmp, "does-not-exist.jsonl")]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("cannot read input path");
  });

  test("exit 0 with findings, and a readable terminal summary", async () => {
    const { stdout, exitCode } = await runCli(["analyze", "fixtures/sample.jsonl", "--no-color"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("SESSIONS");
    expect(stdout).toContain("FINDINGS (11)");
    expect(stdout).toContain("MALFORMED LINES (1)");
    expect(stdout).toContain("EXCLUSIVE_OVERLAP");
    for (const id of ["alpha", "beta", "gamma", "delta"]) expect(stdout).toContain(id);
  });

  test("writes deterministic JSON and self-contained HTML into nested paths", async () => {
    const jsonPath = join(tmp, "nested", "summary.json");
    const htmlPath = join(tmp, "nested", "report.html");
    const first = await runCli(["analyze", "fixtures/sample.jsonl", "--json", jsonPath, "--html", htmlPath, "--quiet"]);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe("");
    const jsonA = await Bun.file(jsonPath).text();

    const second = await runCli(["analyze", "fixtures/sample.jsonl", "--json", jsonPath, "--quiet"]);
    expect(second.exitCode).toBe(0);
    expect(await Bun.file(jsonPath).text()).toBe(jsonA);

    const parsed = JSON.parse(jsonA);
    expect(Object.keys(parsed).slice(0, 6)).toEqual([
      "schema_version",
      "source",
      "generated_with",
      "line_count",
      "valid_event_count",
      "malformed_line_count",
    ]);
    expect(parsed.session_count).toBe(4);
    expect(parsed.severity_counts).toEqual({ info: 0, warning: 5, error: 6 });
    expect(await Bun.file(htmlPath).exists()).toBe(true);
  });

  test("rejects a bad option value", async () => {
    const { exitCode } = await runCli(["analyze", "fixtures/sample.jsonl", "--idle-gap-ms", "abc"]);
    expect(exitCode).toBe(2);
  });
});
