import { describe, expect, test } from "bun:test";
import {
  AnalysisInputError,
  analyze,
  bootstrapMeanDiff,
  describe as describeStats,
  linearFit,
  makeRng,
  mean,
  parseCsv,
  payloadBucket,
  quantile,
  round,
  stratumKey,
  PAYLOAD_BUCKETS,
  REQUIRED_COLUMNS,
} from "../src/analyze.ts";
import { renderHtml, renderMarkdown } from "../src/render.ts";

const CSV_PATH = "data/requests.csv";
const csvText = await Bun.file(CSV_PATH).text();
const rows = parseCsv(csvText);
const analysis = analyze(rows, CSV_PATH);

// ---------------------------------------------------------------------------

describe("CSV parsing", () => {
  test("parses every data row", () => {
    expect(rows.length).toBe(80);
  });

  test("produces correctly typed fields", () => {
    const first = rows[0]!;
    expect(first.request_id).toBe("r001");
    expect(first.variant).toBe("control");
    expect(first.minute).toBe(0);
    expect(first.region).toBe("us");
    expect(first.device).toBe("desktop");
    expect(first.cache).toBe("warm");
    expect(first.payload_kb).toBe(48);
    expect(first.latency_ms).toBe(172);
    expect(first.status).toBe(200);
    expect(typeof first.latency_ms).toBe("number");
  });

  test("preserves the last row", () => {
    const last = rows[rows.length - 1]!;
    expect(last.request_id).toBe("r080");
    expect(last.latency_ms).toBe(1242);
    expect(last.status).toBe(200);
  });

  test("rejects a missing required column", () => {
    for (const col of REQUIRED_COLUMNS) {
      const header = REQUIRED_COLUMNS.filter((c) => c !== col).join(",");
      const body = REQUIRED_COLUMNS.filter((c) => c !== col)
        .map(() => "1")
        .join(",");
      expect(() => parseCsv(`${header}\n${body}`)).toThrow(AnalysisInputError);
      expect(() => parseCsv(`${header}\n${body}`)).toThrow(new RegExp(col));
    }
  });

  test("rejects an empty file, a header-only file, and a short row", () => {
    expect(() => parseCsv("")).toThrow(/empty/i);
    expect(() => parseCsv(REQUIRED_COLUMNS.join(","))).toThrow(/no data rows/i);
    expect(() => parseCsv(`${REQUIRED_COLUMNS.join(",")}\nr1,control,0`)).toThrow(/field/i);
  });

  test("rejects a non-numeric numeric column rather than coercing it", () => {
    const header = REQUIRED_COLUMNS.join(",");
    const bad = "r1,control,0,us,desktop,warm,48,not-a-number,200";
    expect(() => parseCsv(`${header}\n${bad}`)).toThrow(/latency_ms/);
  });

  test("rejects an empty categorical field", () => {
    const header = REQUIRED_COLUMNS.join(",");
    const bad = "r1,,0,us,desktop,warm,48,172,200";
    expect(() => parseCsv(`${header}\n${bad}`)).toThrow(/variant/);
  });

  test("tolerates CRLF line endings and trailing blank lines", () => {
    const crlf = csvText.replace(/\n/g, "\r\n") + "\r\n\r\n";
    expect(parseCsv(crlf).length).toBe(80);
  });
});

// ---------------------------------------------------------------------------

describe("dataset validation checkpoints", () => {
  test("exactly 80 rows", () => {
    expect(analysis.row_count).toBe(80);
    expect(analysis.validation.row_count_is_80).toBe(true);
  });

  test("exactly 40 control and 40 candidate rows", () => {
    expect(analysis.variants.control!.count).toBe(40);
    expect(analysis.variants.candidate!.count).toBe(40);
    expect(analysis.validation.control_rows).toBe(40);
    expect(analysis.validation.candidate_rows).toBe(40);
  });

  test("control has zero non-200 rows", () => {
    expect(analysis.variants.control!.non_200_count).toBe(0);
    expect(analysis.validation.control_non_200_is_zero).toBe(true);
  });

  test("candidate has exactly four non-200 rows", () => {
    expect(analysis.variants.candidate!.non_200_count).toBe(4);
    expect(analysis.validation.candidate_non_200_is_four).toBe(true);
  });

  test("all checkpoints pass together", () => {
    expect(analysis.validation.all_checks_passed).toBe(true);
  });

  test("no variant other than control and candidate exists", () => {
    expect(Object.keys(analysis.variants).sort()).toEqual(["candidate", "control"]);
  });
});

// ---------------------------------------------------------------------------

describe("quantile behaviour (type 7, linear interpolation)", () => {
  test("interpolates the median of an even-length sample", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  test("returns the exact middle of an odd-length sample", () => {
    expect(quantile([10, 20, 30], 0.5)).toBe(20);
  });

  test("interpolates p95 between order statistics", () => {
    // h = (5-1)*0.95 = 3.8 -> 4 + 0.8*(5-4) = 4.8
    expect(quantile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
  });

  test("q=0 and q=1 return min and max", () => {
    expect(quantile([5, 1, 9, 3], 0)).toBe(1);
    expect(quantile([5, 1, 9, 3], 1)).toBe(9);
  });

  test("does not require a sorted input and does not mutate it", () => {
    const input = [9, 1, 5, 3];
    expect(quantile(input, 0.5)).toBe(4);
    expect(input).toEqual([9, 1, 5, 3]);
  });

  test("a single-element sample returns that element for any q", () => {
    expect(quantile([7], 0.5)).toBe(7);
    expect(quantile([7], 0.95)).toBe(7);
  });

  test("rejects an empty sample and an out-of-range q", () => {
    expect(() => quantile([], 0.5)).toThrow(AnalysisInputError);
    expect(() => quantile([1, 2], 1.5)).toThrow(AnalysisInputError);
    expect(() => quantile([1, 2], -0.1)).toThrow(AnalysisInputError);
  });

  test("describe() reports the stated convention consistently", () => {
    const s = describeStats([1, 2, 3, 4, 5]);
    expect(s.n).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.p95).toBe(4.8);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
  });

  test("the documented convention is recorded in the output", () => {
    expect(analysis.quantile_convention).toMatch(/type 7/);
    expect(analysis.quantile_convention).toMatch(/linear interpolation/);
  });
});

// ---------------------------------------------------------------------------

describe("error-rate computation", () => {
  test("control error rate is exactly zero", () => {
    expect(analysis.variants.control!.non_200_rate).toBe(0);
  });

  test("candidate error rate is 4/40 = 0.1", () => {
    expect(analysis.variants.candidate!.non_200_rate).toBe(0.1);
  });

  test("identifies the four candidate error rows by id", () => {
    expect(analysis.error_rows.length).toBe(4);
    expect(analysis.error_rows.map((r) => r.request_id)).toEqual(["r070", "r072", "r076", "r078"]);
  });

  test("every error row is candidate, status 504, in eu / mobile / cold", () => {
    for (const r of analysis.error_rows) {
      expect(r.variant).toBe("candidate");
      expect(r.status).toBe(504);
      expect(r.stratum).toBe("eu / mobile / cold");
    }
  });

  test("non-200 rows are retained in all-rows statistics, not discarded", () => {
    const cand = analysis.variants.candidate!;
    expect(cand.all_rows.n).toBe(40);
    expect(cand.status_200_only.n).toBe(36);
    // The 504s are among the slowest rows, so keeping them raises the mean.
    expect(cand.all_rows.mean).toBeGreaterThan(cand.status_200_only.mean);
    expect(cand.all_rows.max).toBe(1584);
  });

  test("control statistics are identical under both views (no non-200 rows)", () => {
    const ctl = analysis.variants.control!;
    expect(ctl.all_rows).toEqual(ctl.status_200_only);
  });
});

// ---------------------------------------------------------------------------

describe("known aggregate means (tolerance 0.05 ms)", () => {
  test("control all-rows mean matches an independent hand computation", () => {
    // Recomputed straight from the parsed rows, then rounded the same way the
    // library rounds — the reported value is the raw mean to one decimal place.
    const raw =
      rows.filter((r) => r.variant === "control").reduce((s, r) => s + r.latency_ms, 0) / 40;
    expect(raw).toBeCloseTo(316.75, 6);
    expect(analysis.variants.control!.all_rows.mean).toBe(round(raw, 1));
    expect(analysis.variants.control!.all_rows.mean).toBeCloseTo(316.8, 1);
  });

  test("candidate all-rows mean", () => {
    expect(analysis.variants.candidate!.all_rows.mean).toBeCloseTo(604.7, 1);
  });

  test("candidate status-200-only mean", () => {
    expect(analysis.variants.candidate!.status_200_only.mean).toBeCloseTo(513.9, 1);
  });

  test("per-stratum means", () => {
    const byKey = Object.fromEntries(analysis.strata.map((s) => [s.stratum, s]));
    expect(byKey["us / desktop / warm"]!.control!.mean).toBeCloseTo(180.0, 1);
    expect(byKey["us / desktop / warm"]!.candidate!.mean).toBeCloseTo(155.4, 1);
    expect(byKey["eu / desktop / warm"]!.control!.mean).toBeCloseTo(238.5, 1);
    expect(byKey["eu / desktop / warm"]!.candidate!.mean).toBeCloseTo(211.4, 1);
    expect(byKey["us / mobile / cold"]!.control!.mean).toBeCloseTo(466.9, 1);
    expect(byKey["us / mobile / cold"]!.candidate!.mean).toBeCloseTo(421.7, 1);
    expect(byKey["eu / mobile / cold"]!.control!.mean).toBeCloseTo(798.3, 1);
    expect(byKey["eu / mobile / cold"]!.candidate!.mean).toBeCloseTo(1216.9, 1);
  });

  test("sample sizes accompany every stratum result", () => {
    for (const s of analysis.strata) {
      if (s.control) expect(s.control.n).toBeGreaterThan(0);
      if (s.candidate) expect(s.candidate.n).toBeGreaterThan(0);
    }
    const totalControl = analysis.strata.reduce((sum, s) => sum + (s.control?.n ?? 0), 0);
    const totalCandidate = analysis.strata.reduce((sum, s) => sum + (s.candidate?.n ?? 0), 0);
    expect(totalControl).toBe(40);
    expect(totalCandidate).toBe(40);
  });

  test("mean() and round() behave as documented", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(round(2.345, 2)).toBe(2.35);
    expect(round(-0.0001, 2)).toBe(0); // -0 is normalised so JSON stays stable
    expect(Object.is(round(-0.0001, 2), -0)).toBe(false);
    expect(() => mean([])).toThrow(AnalysisInputError);
  });
});

// ---------------------------------------------------------------------------

describe("stable, explicit grouping order", () => {
  test("strata are enumerated in a fixed alphabetical order", () => {
    expect(analysis.strata.map((s) => s.stratum)).toEqual([
      "eu / desktop / warm",
      "eu / mobile / cold",
      "us / desktop / warm",
      "us / mobile / cold",
    ]);
  });

  test("stratum order is independent of input row order", () => {
    const reversed = analyze([...rows].reverse(), CSV_PATH);
    expect(reversed.strata.map((s) => s.stratum)).toEqual(analysis.strata.map((s) => s.stratum));
    expect(reversed.strata.map((s) => s.control?.mean)).toEqual(
      analysis.strata.map((s) => s.control?.mean),
    );
  });

  test("payload buckets follow the declared edge order, not data order", () => {
    expect(analysis.payload_analysis.buckets.map((b) => b.bucket)).toEqual(
      PAYLOAD_BUCKETS.map((b) => b.label),
    );
    const reversed = analyze([...rows].reverse(), CSV_PATH);
    expect(reversed.payload_analysis.buckets.map((b) => b.bucket)).toEqual(
      analysis.payload_analysis.buckets.map((b) => b.bucket),
    );
  });

  test("traffic-mix keys are stably ordered", () => {
    expect(analysis.traffic_mix.region.map((m) => m.key)).toEqual(["eu", "us"]);
    expect(analysis.traffic_mix.device.map((m) => m.key)).toEqual(["desktop", "mobile"]);
    expect(analysis.traffic_mix.cache.map((m) => m.key)).toEqual(["cold", "warm"]);
  });

  test("error rows are sorted by request id", () => {
    const ids = analysis.error_rows.map((r) => r.request_id);
    expect([...ids].sort()).toEqual(ids);
  });

  test("payloadBucket() and stratumKey() are total and deterministic", () => {
    expect(payloadBucket(48)).toBe("0-128 KB");
    expect(payloadBucket(128)).toBe("0-128 KB");
    expect(payloadBucket(129)).toBe("129-256 KB");
    expect(payloadBucket(1024)).toBe("513-1024 KB");
    expect(payloadBucket(1120)).toBe("1025+ KB");
    expect(payloadBucket(99999)).toBe("1025+ KB");
    expect(stratumKey({ region: "eu", device: "mobile", cache: "cold" })).toBe("eu / mobile / cold");
  });

  test("every row lands in exactly one payload bucket", () => {
    const total = analysis.payload_analysis.buckets.reduce(
      (s, b) => s + b.control_n + b.candidate_n,
      0,
    );
    expect(total).toBe(80);
  });

  test("traffic-mix shares sum to 1 within each variant", () => {
    for (const cells of [
      analysis.traffic_mix.region,
      analysis.traffic_mix.device,
      analysis.traffic_mix.cache,
      analysis.traffic_mix.payload_range,
    ]) {
      expect(cells.reduce((s, m) => s + m.control_share, 0)).toBeCloseTo(1, 6);
      expect(cells.reduce((s, m) => s + m.candidate_share, 0)).toBeCloseTo(1, 6);
    }
  });
});

// ---------------------------------------------------------------------------

describe("substantive analytical conclusions", () => {
  test("aggregate favours control while three of four strata favour candidate", () => {
    expect(analysis.aggregate_comparison.mean_delta_ms).toBeGreaterThan(0);
    expect(analysis.simpsons_paradox.strata_with_both_variants).toBe(4);
    expect(analysis.simpsons_paradox.strata_candidate_faster).toBe(3);
    expect(analysis.simpsons_paradox.strata_candidate_slower).toBe(1);
    expect(analysis.simpsons_paradox.detected).toBe(true);
  });

  test("mix standardisation moves the candidate mean sharply toward control", () => {
    const observed = analysis.variants.candidate!.all_rows.mean;
    const adjusted = analysis.simpsons_paradox.mix_adjusted_candidate_mean_ms;
    const control = analysis.variants.control!.all_rows.mean;
    expect(adjusted).toBeLessThan(observed);
    // …but does not erase the gap: one stratum is genuinely regressed.
    expect(adjusted).toBeGreaterThan(control);
  });

  test("the regression is isolated to eu / mobile / cold", () => {
    const slower = analysis.strata.filter((s) => s.direction === "candidate_slower");
    expect(slower.map((s) => s.stratum)).toEqual(["eu / mobile / cold"]);
    expect(slower[0]!.mean_delta_pct).toBeGreaterThan(40);
  });

  test("the gap survives payload matching", () => {
    const ov = analysis.payload_analysis.eu_mobile_cold_overlap;
    expect(ov.overlap_lower_kb).toBe(720);
    expect(ov.overlap_upper_kb).toBe(960);
    expect(ov.control_n).toBe(4);
    expect(ov.candidate_n).toBe(10);
    expect(ov.mean_delta_pct).toBeGreaterThan(0);
    // Only rows inside the overlap range are used.
    expect(ov.candidate_n).toBeLessThan(14);
  });

  test("findings, limitations and recommendations are all populated", () => {
    expect(analysis.findings.length).toBeGreaterThanOrEqual(8);
    expect(analysis.limitations.length).toBeGreaterThanOrEqual(5);
    expect(analysis.recommendations.length).toBeGreaterThanOrEqual(4);
    expect(analysis.recommendations.filter((r) => r.kind === "rollout_action").length).toBeGreaterThanOrEqual(1);
    expect(analysis.recommendations.filter((r) => r.kind === "follow_up").length).toBeGreaterThanOrEqual(2);
    for (const f of analysis.findings) {
      expect(["computed_fact", "interpretation"]).toContain(f.kind);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });

  test("finding ids are unique and stably ordered", () => {
    const ids = analysis.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("F1");
  });
});

// ---------------------------------------------------------------------------

describe("deterministic helpers", () => {
  test("the seeded RNG reproduces the same stream", () => {
    const a = Array.from({ length: 5 }, makeRng(42));
    const b = Array.from({ length: 5 }, makeRng(42));
    expect(a).toEqual(b);
    expect(Array.from({ length: 5 }, makeRng(43))).not.toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("the bootstrap is reproducible and brackets the point estimate", () => {
    const a = [10, 12, 14, 16];
    const b = [1, 2, 3, 4];
    const r1 = bootstrapMeanDiff(a, b, 500, 7);
    const r2 = bootstrapMeanDiff(a, b, 500, 7);
    expect(r1).toEqual(r2);
    expect(r1.point).toBeCloseTo(10.5, 10);
    expect(r1.ciLow).toBeLessThanOrEqual(r1.point);
    expect(r1.ciHigh).toBeGreaterThanOrEqual(r1.point);
  });

  test("the reported bootstrap interval is stable across runs", () => {
    const again = analyze(rows, CSV_PATH);
    expect(again.payload_analysis.bootstrap).toEqual(analysis.payload_analysis.bootstrap);
  });

  test("linearFit recovers an exact line", () => {
    const fit = linearFit([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r).toBeCloseTo(1, 10);
    expect(() => linearFit([1], [1])).toThrow(AnalysisInputError);
  });

  test("candidate's per-KB slope in the regressed stratum exceeds control's", () => {
    const s = analysis.payload_analysis.slopes;
    const cnd = s.find((x) => x.x === "payload_kb" && x.series.endsWith("candidate"))!;
    const ctl = s.find((x) => x.x === "payload_kb" && x.series.endsWith("control"))!;
    expect(cnd.slope).toBeGreaterThan(ctl.slope);
  });
});

// ---------------------------------------------------------------------------

describe("JSON determinism", () => {
  test("two analyses of the same input serialise identically", () => {
    const a = JSON.stringify(analyze(rows, CSV_PATH), null, 2);
    const b = JSON.stringify(analyze(parseCsv(csvText), CSV_PATH), null, 2);
    expect(a).toBe(b);
  });

  test("input row order does not change the serialised output", () => {
    const shuffled = [...rows].sort((x, y) => (x.request_id < y.request_id ? 1 : -1));
    expect(JSON.stringify(analyze(shuffled, CSV_PATH), null, 2)).toBe(
      JSON.stringify(analyze(rows, CSV_PATH), null, 2),
    );
  });

  test("the required top-level schema keys are present", () => {
    for (const key of [
      "schema_version",
      "source",
      "row_count",
      "variants",
      "traffic_mix",
      "strata",
      "payload_analysis",
      "findings",
      "limitations",
      "recommendations",
    ]) {
      expect(analysis).toHaveProperty(key);
    }
    expect(analysis.schema_version).toBe(1);
    expect(analysis.source).toBe(CSV_PATH);
    expect(analysis.row_count).toBe(80);
    expect(Array.isArray(analysis.strata)).toBe(true);
    expect(Array.isArray(analysis.findings)).toBe(true);
    expect(Array.isArray(analysis.limitations)).toBe(true);
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });

  test("no NaN or Infinity leaks into the serialised output", () => {
    const json = JSON.stringify(analyze(rows, CSV_PATH));
    expect(json).not.toMatch(/null,"mean"/);
    expect(json).not.toMatch(/NaN|Infinity/);
  });
});

// ---------------------------------------------------------------------------

describe("Markdown generation", () => {
  const md = renderMarkdown(analysis);

  test("produces a substantial document with the expected headings", () => {
    expect(md.length).toBeGreaterThan(4000);
    expect(md).toMatch(/^# Latency Forensics/);
    for (const heading of [
      "## Executive conclusion",
      "## 1. Aggregate statistics by variant",
      "## 2. Traffic mix",
      "## 3. Within-stratum comparison",
      "## 4. Does the aggregate conceal a mix effect?",
      "## 5. Is a specific interaction responsible?",
      "## 7. Limitations that prevent a causal claim",
      "## 8. Justified rollout action",
      "## 9. Two follow-ups that would most reduce uncertainty",
    ]) {
      expect(md).toContain(heading);
    }
  });

  test("answers all nine required questions", () => {
    for (let q = 1; q <= 9; q++) expect(md).toMatch(new RegExp(`^## ${q}\\. `, "m"));
  });

  test("distinguishes computed fact from interpretation and recommendation", () => {
    expect(md).toContain("**Computed fact.**");
    expect(md).toContain("**Interpretation.**");
    expect(md).toContain("**Recommendation.**");
  });

  test("reports key computed values and the quantile convention", () => {
    expect(md).toContain("316.8");
    expect(md).toContain("604.7");
    expect(md).toContain("eu / mobile / cold");
    expect(md).toContain("type 7");
  });

  test("includes sample sizes and every error row id", () => {
    expect(md).toMatch(/n=\d+/);
    for (const id of ["r070", "r072", "r076", "r078"]) expect(md).toContain(id);
  });

  test("does not overstate causation", () => {
    expect(md.toLowerCase()).toContain("observational");
    expect(md.toLowerCase()).toContain("confounded");
  });
});

// ---------------------------------------------------------------------------

describe("HTML generation", () => {
  const html = renderHtml(analysis, rows);

  test("is a complete standalone document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html.length).toBeGreaterThan(20000);
  });

  test("references no external assets", () => {
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/src\s*=/i);
    expect(html).not.toMatch(/@import/i);
  });

  test("contains inline SVG charts rather than a library", () => {
    expect(html).toContain("<svg");
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("<circle");
    expect(html).toContain("<rect");
  });

  test("includes a 1600x900 overview block", () => {
    expect(html).toMatch(/width:\s*1600px/);
    expect(html).toMatch(/height:\s*900px/);
    expect(html).toContain('class="overview"');
  });

  test("contains every required section", () => {
    for (const needle of [
      "Aggregate comparison",
      "Traffic mix",
      "stratum",
      "Payload vs latency",
      "Non-200 rows",
      "Findings",
      "Limitations",
      "Recommendation",
    ]) {
      expect(html).toContain(needle);
    }
  });

  test("shows sample sizes and the error rows", () => {
    expect(html).toMatch(/n=\d+/);
    for (const id of ["r070", "r072", "r076", "r078"]) expect(html).toContain(id);
  });

  test("plots one point per request in the scatter", () => {
    expect((html.match(/class="dot dot-/g) ?? []).length).toBe(80);
    expect((html.match(/dot-error/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("escapes interpolated text", () => {
    const tricky = analyze(rows, '<img src=x onerror="alert(1)">');
    const out = renderHtml(tricky, rows);
    expect(out).not.toContain('<img src=x');
    expect(out).toContain("&lt;img");
  });

  test("is deterministic", () => {
    expect(renderHtml(analysis, rows)).toBe(renderHtml(analyze(rows, CSV_PATH), rows));
  });
});

// ---------------------------------------------------------------------------

describe("CLI", () => {
  async function runCli(args: string[]) {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code: await proc.exited, stdout, stderr };
  }

  test("exits 2 with no arguments", async () => {
    const r = await runCli([]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Missing required/);
  });

  test("exits 2 for a nonexistent input file", async () => {
    const r = await runCli(["data/does-not-exist.csv"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/cannot read/);
  });

  test("exits 2 for an unknown option", async () => {
    const r = await runCli(["data/requests.csv", "--nope", "x"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Unknown option/);
  });

  test("exits 2 when an option is missing its value", async () => {
    const r = await runCli(["data/requests.csv", "--json"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/requires a file path/);
  });

  test("exits 2 for more than one positional argument", async () => {
    const r = await runCli(["data/requests.csv", "data/requests.csv"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/exactly one input file/);
  });

  test("exits 2 for a malformed CSV missing a required column", async () => {
    const tmp = "out/.test-malformed.csv";
    await Bun.write(tmp, "request_id,variant,latency_ms\nr1,control,100\n");
    const r = await runCli([tmp]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/missing required column/i);
  });

  test("exits 2 for a CSV with a non-numeric latency", async () => {
    const tmp = "out/.test-badnumber.csv";
    await Bun.write(
      tmp,
      "request_id,variant,minute,region,device,cache,payload_kb,latency_ms,status\nr1,control,0,us,desktop,warm,48,oops,200\n",
    );
    const r = await runCli([tmp]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/latency_ms/);
  });

  test("exits 0 and writes all three outputs for the real dataset", async () => {
    const jsonPath = "out/.test-analysis.json";
    const mdPath = "out/.test-analysis.md";
    const htmlPath = "out/.test-report.html";
    const r = await runCli([
      "data/requests.csv",
      "--json", jsonPath,
      "--markdown", mdPath,
      "--html", htmlPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Parsed 80 rows");

    const written = JSON.parse(await Bun.file(jsonPath).text());
    expect(written.row_count).toBe(80);
    expect(written.schema_version).toBe(1);
    expect((await Bun.file(mdPath).text()).length).toBeGreaterThan(4000);
    expect((await Bun.file(htmlPath).text()).startsWith("<!doctype html>")).toBe(true);
  });

  test("writes byte-identical JSON on a repeat run", async () => {
    const p1 = "out/.test-determinism-1.json";
    const p2 = "out/.test-determinism-2.json";
    expect((await runCli(["data/requests.csv", "--json", p1])).code).toBe(0);
    expect((await runCli(["data/requests.csv", "--json", p2])).code).toBe(0);
    expect(await Bun.file(p1).text()).toBe(await Bun.file(p2).text());
  });

  test("--help exits 0", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
  });
});
