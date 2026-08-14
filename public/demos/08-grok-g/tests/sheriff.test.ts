import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeFile } from "../src/analyze.ts";
import { formatHtml } from "../src/html.ts";
import { formatJson, toJsonDocument } from "../src/json.ts";

const FIXTURE = "fixtures/sample.jsonl";
const ROOT = import.meta.dir + "/..";

describe("fixture analysis", () => {
  test("line and malformed counts", async () => {
    const report = await analyzeFile(FIXTURE);
    expect(report.line_count).toBe(24);
    expect(report.valid_event_count).toBe(23);
    expect(report.malformed_line_count).toBe(1);
    expect(report.session_count).toBe(4);
    expect(report.findings.some((f) => f.code === "MALFORMED_JSON" && f.line === 19)).toBe(true);
  });

  test("duplicate event ID", async () => {
    const report = await analyzeFile(FIXTURE);
    const dup = report.findings.find((f) => f.code === "DUPLICATE_EVENT_ID");
    expect(dup).toBeDefined();
    expect(dup?.line).toBe(12);
    expect(dup?.event_id).toBe("b3");
    expect(dup?.session).toBe("beta");
    expect(dup?.severity).toBe("error");
  });

  test("clock reversal", async () => {
    const report = await analyzeFile(FIXTURE);
    const reversal = report.findings.find((f) => f.code === "TIMESTAMP_REVERSAL");
    expect(reversal).toBeDefined();
    expect(reversal?.line).toBe(13);
    expect(reversal?.session).toBe("beta");
    expect(reversal?.severity).toBe("warning");
  });

  test("orphan end", async () => {
    const report = await analyzeFile(FIXTURE);
    const tool = report.findings.find((f) => f.code === "ORPHAN_TOOL_END");
    const phase = report.findings.find((f) => f.code === "ORPHAN_PHASE_END");
    expect(tool?.line).toBe(11);
    expect(tool?.span_id).toBe("tool-ghost");
    expect(phase?.line).toBe(17);
    expect(phase?.span_id).toBe("phase-missing");
  });

  test("exclusive overlap", async () => {
    const report = await analyzeFile(FIXTURE);
    const overlap = report.findings.find((f) => f.code === "EXCLUSIVE_TOOL_OVERLAP");
    expect(overlap).toBeDefined();
    expect(overlap?.session).toBe("beta");
    expect(overlap?.line).toBe(10);
    expect(overlap?.span_id).toBe("tool-test");
  });

  test("open span", async () => {
    const report = await analyzeFile(FIXTURE);
    const openTool = report.findings.find((f) => f.code === "OPEN_TOOL_SPAN");
    const openPhase = report.findings.find((f) => f.code === "OPEN_PHASE_SPAN");
    expect(openTool?.session).toBe("beta");
    expect(openTool?.span_id).toBe("tool-test");
    expect(openPhase?.session).toBe("delta");
    expect(openPhase?.span_id).toBe("phase-open");
    const delta = report.sessions.find((s) => s.id === "delta");
    expect(delta?.incomplete_spans.some((s) => s.span_id === "phase-open")).toBe(true);
  });

  test("missing session end", async () => {
    const report = await analyzeFile(FIXTURE);
    const missing = report.findings.find((f) => f.code === "MISSING_SESSION_END");
    expect(missing?.session).toBe("gamma");
    expect(report.sessions.find((s) => s.id === "gamma")?.outcome).toBe("incomplete");
  });

  test("deterministic JSON ordering", async () => {
    const a = toJsonDocument(await analyzeFile(FIXTURE));
    const b = toJsonDocument(await analyzeFile(FIXTURE));
    expect(formatJson(a as never)).toBe(formatJson(b as never));
    expect(a.sessions.map((s) => s.id)).toEqual(["alpha", "beta", "gamma", "delta"]);
    const lines = a.findings.map((f) => f.line);
    const sorted = [...lines].sort((x, y) => x - y);
    expect(lines).toEqual(sorted);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("HTML generation containing all session IDs", async () => {
    const report = await analyzeFile(FIXTURE);
    const html = formatHtml(report);
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
    expect(html).toContain("gamma");
    expect(html).toContain("delta");
    expect(html).toContain("MALFORMED_JSON");
    expect(html).toContain("EXCLUSIVE_TOOL_OVERLAP");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});

describe("CLI", () => {
  const temps: string[] = [];

  afterAll(async () => {
    await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("exit 2 for bad usage", async () => {
    const none = Bun.spawn(["bun", "run", "src/cli.ts"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(await none.exited).toBe(2);
    const unknown = Bun.spawn(["bun", "run", "src/cli.ts", "nope"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(await unknown.exited).toBe(2);
    const missingPath = Bun.spawn(["bun", "run", "src/cli.ts", "analyze"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await missingPath.exited).toBe(2);
    const badFile = Bun.spawn(["bun", "run", "src/cli.ts", "analyze", "fixtures/does-not-exist.jsonl"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await badFile.exited).toBe(2);
  });

  test("analyze writes json and html and exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trace-sheriff-"));
    temps.push(dir);
    const jsonPath = join(dir, "summary.json");
    const htmlPath = join(dir, "report.html");
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "analyze", FIXTURE, "--json", jsonPath, "--html", htmlPath],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    expect(await proc.exited).toBe(0);
    const json = await Bun.file(jsonPath).json();
    expect(json.schema_version).toBe(1);
    expect(json.session_count).toBe(4);
    const html = await Bun.file(htmlPath).text();
    expect(html).toContain("alpha");
    expect(html).toContain("delta");
  });
});
