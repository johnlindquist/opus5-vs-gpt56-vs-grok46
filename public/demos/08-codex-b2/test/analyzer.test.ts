import { describe, expect, test } from "bun:test";
import { analyzeFile, deterministicJson } from "../src/analyzer";
import { htmlReport } from "../src/report";

const FIXTURE = "fixtures/sample.jsonl";

describe("Trace Sheriff fixture", () => {
  test("counts lines, valid events, and malformed input", async () => {
    const summary = await analyzeFile(FIXTURE);
    expect(summary.line_count).toBe(24);
    expect(summary.valid_event_count).toBe(23);
    expect(summary.malformed_line_count).toBe(1);
    expect(summary.session_count).toBe(4);
    expect(summary.findings.some((item) => item.code === "MALFORMED_JSON" && item.line === 19)).toBe(true);
  });

  test.each([
    ["DUPLICATE_EVENT_ID", 12],
    ["TIMESTAMP_REVERSAL", 13],
    ["ORPHAN_TOOL_END", 11],
    ["ORPHAN_PHASE_END", 17],
    ["EXCLUSIVE_TOOL_OVERLAP", 10],
    ["OPEN_TOOL_SPAN", 10],
    ["OPEN_PHASE_SPAN", 23],
    ["MISSING_SESSION_END", 20],
  ])("detects %s at its stable source line", async (code, line) => {
    const summary = await analyzeFile(FIXTURE);
    expect(summary.findings.some((item) => item.code === code && item.line === line)).toBe(true);
  });

  test("JSON and ordering are deterministic", async () => {
    const first = await analyzeFile(FIXTURE);
    const second = await analyzeFile(FIXTURE);
    expect(deterministicJson(first)).toBe(deterministicJson(second));
    expect(first.sessions.map((item) => item.session)).toEqual(["alpha", "beta", "gamma", "delta"]);
    const ordering = first.findings.map((item) => `${String(item.line).padStart(5, "0")}:${item.code}`);
    expect(ordering).toEqual([...ordering].sort());
  });

  test("HTML contains every session and local controls", async () => {
    const report = htmlReport(await analyzeFile(FIXTURE));
    for (const id of ["alpha", "beta", "gamma", "delta"]) expect(report).toContain(id);
    expect(report).toContain('id="sessionFilter"');
    expect(report).toContain('id="severityFilter"');
    expect(report).not.toContain("https://");
  });
});

test("CLI exits 2 for bad usage", async () => {
  const child = Bun.spawn([process.execPath, "run", "src/cli.ts", "analyze"], {
    cwd: ".",
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await child.exited).toBe(2);
});
