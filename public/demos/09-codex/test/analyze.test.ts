import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import {
  analyze,
  groupStable,
  parseRequestsCsv,
  quantile,
  stableJson,
  summarize,
} from "../src/analyze";
import { renderHtml, renderMarkdown } from "../src/render";

const fixturePath = "data/requests.csv";
const tempDir = ".test-output";
let csv = "";
let rows: ReturnType<typeof parseRequestsCsv> = [];

beforeAll(async () => {
  csv = await Bun.file(fixturePath).text();
  rows = parseRequestsCsv(csv);
  await mkdir(tempDir, { recursive: true });
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CSV parsing and validation", () => {
  test("parses the exact fixture and required columns", () => {
    expect(rows).toHaveLength(80);
    expect(rows[0]).toEqual({
      request_id: "r001",
      variant: "control",
      minute: 0,
      region: "us",
      device: "desktop",
      cache: "warm",
      payload_kb: 48,
      latency_ms: 172,
      status: 200,
    });
  });

  test("supports quoted CSV fields", () => {
    const header = "request_id,variant,minute,region,device,cache,payload_kb,latency_ms,status\n";
    const parsed = parseRequestsCsv(header + '"r,1",control,0,us,desktop,warm,1,2,200\n');
    expect(parsed[0].request_id).toBe("r,1");
  });

  test("rejects a missing required column", () => {
    expect(() => parseRequestsCsv("request_id,variant\nr1,control\n"))
      .toThrow("Missing required columns");
  });
});

describe("statistics and grouping", () => {
  test("uses linear-interpolated quantiles", () => {
    expect(quantile([0, 10, 20, 30], 0.5)).toBe(15);
    expect(quantile([0, 10, 20, 30], 0.95)).toBeCloseTo(28.5, 10);
    expect(quantile([7], 0.95)).toBe(7);
  });

  test("has exact variant counts and known aggregate means", () => {
    const control = rows.filter((row) => row.variant === "control");
    const candidate = rows.filter((row) => row.variant === "candidate");
    expect(control).toHaveLength(40);
    expect(candidate).toHaveLength(40);
    expect(summarize(control).mean_ms).toBeCloseTo(316.75, 6);
    expect(summarize(candidate).mean_ms).toBeCloseTo(604.7, 6);
  });

  test("computes error rates without discarding failures", () => {
    const control = summarize(rows.filter((row) => row.variant === "control"));
    const candidate = summarize(rows.filter((row) => row.variant === "candidate"));
    expect(control.non_200_count).toBe(0);
    expect(control.non_200_rate).toBe(0);
    expect(candidate.non_200_count).toBe(4);
    expect(candidate.non_200_rate).toBe(0.1);
    expect(candidate.count).toBe(40);
  });

  test("returns grouping keys in stable lexical order", () => {
    const grouped = groupStable(rows, (row) => row.region, (key, groupedRows) => ({
      key,
      count: groupedRows.length,
    }));
    expect(grouped.map((item) => item.key)).toEqual(["eu", "us"]);
    expect(grouped.map((item) => item.count)).toEqual([38, 42]);
  });
});

describe("analysis and renderers", () => {
  test("identifies the four candidate error rows", () => {
    const result = analyze(rows, fixturePath);
    expect(result.payload_analysis.error_rows.map((row) => row.request_id))
      .toEqual(["r070", "r072", "r076", "r078"]);
    expect(result.payload_analysis.error_rows.every((row) => row.variant === "candidate"))
      .toBe(true);
  });

  test("produces deterministic JSON", () => {
    const first = stableJson(analyze(rows, fixturePath));
    const second = stableJson(analyze(parseRequestsCsv(csv), fixturePath));
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
  });

  test("generates complete Markdown and standalone HTML", () => {
    const result = analyze(rows, fixturePath);
    const markdown = renderMarkdown(result);
    const html = renderHtml(result, rows);
    expect(markdown).toContain("## Executive conclusion");
    expect(markdown).toContain("## 5. Error rows");
    expect(markdown).toContain("r070");
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("<svg");
    expect(html).toContain("Comparable strata");
    expect(html).toContain("Error rows");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  test("CLI exits 2 for malformed required columns", async () => {
    const malformed = `${tempDir}/malformed.csv`;
    await Bun.write(malformed, "request_id,variant\nr1,control\n");
    const process = Bun.spawn([
      "bun", "run", "src/cli.ts", malformed,
      "--json", `${tempDir}/x.json`,
      "--markdown", `${tempDir}/x.md`,
      "--html", `${tempDir}/x.html`,
    ], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await process.exited;
    const stderr = await new Response(process.stderr).text();
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing required columns");
  });

  test("CLI exits 2 for invalid usage", async () => {
    const process = Bun.spawn(["bun", "run", "src/cli.ts"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    expect(exitCode).toBe(2);
  });
});
