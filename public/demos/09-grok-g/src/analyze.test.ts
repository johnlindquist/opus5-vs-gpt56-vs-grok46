import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_COLUMNS,
  analyze,
  latencyStats,
  parseCsv,
  quantile,
  renderHtml,
  renderMarkdown,
  stableStringify,
} from "./analyze.ts";
import { runCli } from "./cli.ts";

const CSV_PATH = "data/requests.csv";

function loadRows() {
  return parseCsv(readFileSync(CSV_PATH, "utf8"));
}

describe("CSV parsing", () => {
  test("requires documented columns", () => {
    expect([...REQUIRED_COLUMNS]).toEqual([
      "request_id",
      "variant",
      "minute",
      "region",
      "device",
      "cache",
      "payload_kb",
      "latency_ms",
      "status",
    ]);
    expect(() => parseCsv("foo,bar\n1,2\n")).toThrow(/Missing required column/);
  });

  test("parses exact row and variant counts", () => {
    const rows = loadRows();
    expect(rows).toHaveLength(80);
    expect(rows.filter((r) => r.variant === "control")).toHaveLength(40);
    expect(rows.filter((r) => r.variant === "candidate")).toHaveLength(40);
  });
});

describe("quantiles and aggregates", () => {
  test("type-7 quantile interpolates", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([1], 0.95)).toBe(1);
    expect(quantile([], 0.95)).toBeNull();
    const sample = [1, 2, 3, 4, 5];
    // p=0.95, h=0.95*4=3.8 → 4 + 0.8*(5-4)=4.8
    expect(quantile(sample, 0.95)).toBeCloseTo(4.8, 10);
  });

  test("known aggregate means within tolerance", () => {
    const rows = loadRows();
    const control = rows.filter((r) => r.variant === "control").map((r) => r.latency_ms);
    const candidate = rows.filter((r) => r.variant === "candidate").map((r) => r.latency_ms);
    const cMean = control.reduce((a, b) => a + b, 0) / control.length;
    const dMean = candidate.reduce((a, b) => a + b, 0) / candidate.length;
    expect(cMean).toBeCloseTo(316.75, 2);
    expect(dMean).toBeCloseTo(604.7, 2);
    const stats = latencyStats(control);
    expect(stats.mean).toBeCloseTo(cMean, 3);
    expect(stats.n).toBe(40);
  });

  test("error-rate computation keeps non-200 rows", () => {
    const analysis = analyze(loadRows(), CSV_PATH);
    expect(analysis.variants.control.non_200_count).toBe(0);
    expect(analysis.variants.control.non_200_rate).toBe(0);
    expect(analysis.variants.candidate.non_200_count).toBe(4);
    expect(analysis.variants.candidate.non_200_rate).toBeCloseTo(0.1, 6);
    expect(analysis.variants.candidate.n).toBe(40);
    expect(analysis.variants.candidate.status_200.n).toBe(36);
  });

  test("identifies the four candidate error rows", () => {
    const analysis = analyze(loadRows(), CSV_PATH);
    const ids = analysis.payload_analysis.error_rows.map((r) => r.request_id);
    expect(ids).toEqual(["r070", "r072", "r076", "r078"]);
    expect(analysis.payload_analysis.error_rows.every((r) => r.variant === "candidate")).toBe(true);
    expect(analysis.payload_analysis.error_rows.every((r) => r.status === 504)).toBe(true);
  });

  test("stable grouping order for strata and mix", () => {
    const analysis = analyze(loadRows(), CSV_PATH);
    expect(analysis.strata.map((s) => s.key)).toEqual([
      "us|desktop|warm",
      "us|mobile|cold",
      "eu|desktop|warm",
      "eu|mobile|cold",
    ]);
    expect(analysis.traffic_mix.region.map((r) => r.key)).toEqual(["us", "eu"]);
    expect(analysis.traffic_mix.device.map((r) => r.key)).toEqual(["desktop", "mobile"]);
    expect(analysis.traffic_mix.cache.map((r) => r.key)).toEqual(["warm", "cold"]);
  });
});

describe("outputs", () => {
  test("JSON is deterministic", () => {
    const rows = loadRows();
    const a = stableStringify(analyze(rows, CSV_PATH));
    const b = stableStringify(analyze(rows, CSV_PATH));
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.row_count).toBe(80);
    expect(parsed.variants.control).toBeTruthy();
    expect(parsed.traffic_mix.region.length).toBeGreaterThan(0);
    expect(parsed.strata.length).toBe(4);
    expect(parsed.payload_analysis.error_rows.length).toBe(4);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.limitations.length).toBeGreaterThan(0);
    expect(parsed.recommendations.length).toBeGreaterThan(0);
  });

  test("HTML and Markdown generation", () => {
    const rows = loadRows();
    const analysis = analyze(rows, CSV_PATH);
    const md = renderMarkdown(analysis);
    const html = renderHtml(analysis, rows);
    expect(md).toContain("Executive conclusion");
    expect(md).toContain("Simpson");
    expect(md).toContain("r070");
    expect(html).toContain("<svg");
    expect(html).toContain("1600px");
    expect(html).toContain("900px");
    expect(html).toContain("r078");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});

describe("CLI", () => {
  test("exit 2 for invalid usage", () => {
    expect(runCli([])).toBe(2);
    expect(runCli(["data/requests.csv"])).toBe(2);
    expect(runCli(["--json", "a"])).toBe(2);
  });

  test("exit 2 for malformed required columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "latency-"));
    const bad = join(dir, "bad.csv");
    writeFileSync(bad, "request_id,variant\nr001,control\n");
    expect(
      runCli([bad, "--json", join(dir, "a.json"), "--markdown", join(dir, "a.md"), "--html", join(dir, "a.html")]),
    ).toBe(2);
  });

  test("writes artifacts for the supplied dataset", () => {
    const dir = mkdtempSync(join(tmpdir(), "latency-ok-"));
    const jsonPath = join(dir, "analysis.json");
    const mdPath = join(dir, "analysis.md");
    const htmlPath = join(dir, "report.html");
    expect(runCli([CSV_PATH, "--json", jsonPath, "--markdown", mdPath, "--html", htmlPath])).toBe(0);
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(json.row_count).toBe(80);
    expect(readFileSync(mdPath, "utf8").length).toBeGreaterThan(500);
    expect(readFileSync(htmlPath, "utf8")).toContain("overview");
  });
});
