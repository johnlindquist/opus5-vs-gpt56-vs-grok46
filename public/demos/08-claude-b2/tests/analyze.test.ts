import { describe, expect, test } from "bun:test";
import { analyzeFile, analyzeLines } from "../src/analyze.ts";
import type { Finding, Report } from "../src/types.ts";

const FIXTURE = "fixtures/sample.jsonl";

const report: Report = await analyzeFile(FIXTURE);

function codes(report: Report, code: string): Finding[] {
  return report.findings.filter((f) => f.code === code);
}

function session(report: Report, id: string) {
  const found = report.sessions.find((s) => s.session === id);
  if (!found) throw new Error(`no session ${id}`);
  return found;
}

/** Feed an inline log through the analyzer without touching disk. */
async function analyzeText(text: string): Promise<Report> {
  const lines = text.split("\n").map((t, i) => ({ line: i + 1, text: t }));
  async function* gen() {
    for (const line of lines) yield line;
  }
  return analyzeLines(gen(), { source: "inline" });
}

describe("fixture shape", () => {
  test("counts lines, events and malformed lines", () => {
    expect(report.line_count).toBe(24);
    expect(report.valid_event_count).toBe(23);
    expect(report.malformed_line_count).toBe(1);
    expect(report.session_count).toBe(4);
    expect(report.schema_version).toBe(1);
    expect(report.source).toBe(FIXTURE);
  });

  test("malformed line keeps its original line number and text", () => {
    expect(report.malformed_lines).toEqual([
      {
        line: 19,
        reason: report.malformed_lines[0]!.reason,
        snippet: "this is not json",
      },
    ]);
    const finding = codes(report, "MALFORMED_JSON")[0]!;
    expect(finding.line).toBe(19);
    expect(finding.severity).toBe("error");
  });

  test("severity counts add up to the finding count", () => {
    const { info, warning, error } = report.severity_counts;
    expect(info + warning + error).toBe(report.finding_count);
    expect(report.finding_count).toBe(report.findings.length);
  });

  test("every finding carries a code, severity, line and message", () => {
    for (const finding of report.findings) {
      expect(finding.code.length).toBeGreaterThan(0);
      expect(["info", "warning", "error"]).toContain(finding.severity);
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(0);
    }
  });
});

describe("anomaly detectors", () => {
  test("duplicate event_id is reported on the second occurrence", () => {
    const found = codes(report, "DUPLICATE_EVENT_ID");
    expect(found).toHaveLength(1);
    expect(found[0]!.line).toBe(12);
    expect(found[0]!.event_id).toBe("b3");
    expect(found[0]!.session).toBe("beta");
    expect(found[0]!.message).toContain("line 10");
  });

  test("clock reversal inside a session's file order", () => {
    const found = codes(report, "CLOCK_REVERSAL");
    expect(found).toHaveLength(1);
    expect(found[0]!.line).toBe(13);
    expect(found[0]!.session).toBe("beta");
    expect(found[0]!.severity).toBe("warning");
  });

  test("orphan tool_end and orphan phase_end", () => {
    const tool = codes(report, "ORPHAN_TOOL_END");
    expect(tool).toHaveLength(1);
    expect(tool[0]!.line).toBe(11);
    expect(tool[0]!.span_id).toBe("tool-ghost");

    const phase = codes(report, "ORPHAN_PHASE_END");
    expect(phase).toHaveLength(1);
    expect(phase[0]!.line).toBe(17);
    expect(phase[0]!.span_id).toBe("phase-missing");
    expect(phase[0]!.session).toBe("gamma");
  });

  test("overlapping exclusive tool spans", () => {
    const found = codes(report, "EXCLUSIVE_OVERLAP");
    expect(found).toHaveLength(1);
    expect(found[0]!.session).toBe("beta");
    expect(found[0]!.line).toBe(10);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.message).toContain("exclusive:build");
    expect(found[0]!.message).toContain("exclusive:test");
  });

  test("non-exclusive overlap is not reported", async () => {
    const plain = await analyzeText(
      [
        '{"ts":"2026-01-01T00:00:00.000Z","session":"s","type":"session_start","event_id":"1"}',
        '{"ts":"2026-01-01T00:00:01.000Z","session":"s","type":"tool_start","event_id":"2","span_id":"x","name":"read"}',
        '{"ts":"2026-01-01T00:00:02.000Z","session":"s","type":"tool_start","event_id":"3","span_id":"y","name":"grep"}',
        '{"ts":"2026-01-01T00:00:03.000Z","session":"s","type":"tool_end","event_id":"4","span_id":"x","name":"read","status":"ok"}',
        '{"ts":"2026-01-01T00:00:04.000Z","session":"s","type":"tool_end","event_id":"5","span_id":"y","name":"grep","status":"ok"}',
        '{"ts":"2026-01-01T00:00:05.000Z","session":"s","type":"session_end","event_id":"6","status":"ok"}',
      ].join("\n"),
    );
    expect(codes(plain, "EXCLUSIVE_OVERLAP")).toHaveLength(0);
    expect(session(plain, "s").peak_concurrent_tools).toBe(2);
    expect(plain.finding_count).toBe(0);
  });

  test("open tool and phase spans at end of input", () => {
    const tool = codes(report, "OPEN_TOOL_SPAN");
    expect(tool).toHaveLength(1);
    expect(tool[0]!.span_id).toBe("tool-test");
    expect(tool[0]!.line).toBe(10);

    const phase = codes(report, "OPEN_PHASE_SPAN");
    expect(phase).toHaveLength(1);
    expect(phase[0]!.span_id).toBe("phase-open");
    expect(phase[0]!.session).toBe("delta");

    expect(session(report, "beta").incomplete_span_count).toBe(1);
    expect(session(report, "delta").incomplete_span_count).toBe(1);
    expect(session(report, "alpha").incomplete_span_count).toBe(0);
  });

  test("missing session_end", () => {
    const found = codes(report, "MISSING_SESSION_END");
    expect(found).toHaveLength(1);
    expect(found[0]!.session).toBe("gamma");
    expect(found[0]!.line).toBe(20);
    expect(session(report, "gamma").outcome).toBe("incomplete");
  });

  test("multiple session_start events", () => {
    const found = codes(report, "DUPLICATE_SESSION_START");
    expect(found).toHaveLength(1);
    expect(found[0]!.session).toBe("delta");
    expect(found[0]!.line).toBe(22);
  });

  test("missing required fields are reported, not crashed on", async () => {
    const partial = await analyzeText(
      [
        '{"ts":"2026-01-01T00:00:00.000Z","type":"message","event_id":"1","text":"no session"}',
        '{"session":"s","type":"message","event_id":"2"}',
        '{"ts":"nope","session":"s","type":"message","event_id":"3"}',
        '{"ts":"2026-01-01T00:00:01.000Z","session":"s","type":"teleport","event_id":"4"}',
        "[1,2,3]",
      ].join("\n"),
    );
    expect(codes(partial, "MISSING_FIELD")).toHaveLength(2);
    expect(codes(partial, "INVALID_TIMESTAMP")).toHaveLength(1);
    expect(codes(partial, "UNKNOWN_EVENT_TYPE")).toHaveLength(1);
    expect(codes(partial, "NOT_AN_OBJECT")).toHaveLength(1);
    expect(partial.line_count).toBe(5);
  });

  test("idle gaps are reported at the configured threshold", async () => {
    const log = [
      '{"ts":"2026-01-01T00:00:00.000Z","session":"s","type":"session_start","event_id":"1"}',
      '{"ts":"2026-01-01T00:05:00.000Z","session":"s","type":"session_end","event_id":"2","status":"ok"}',
    ].join("\n");
    async function* gen() {
      for (const [i, text] of log.split("\n").entries()) yield { line: i + 1, text };
    }
    const idle = await analyzeLines(gen(), { source: "inline", idleGapMs: 60_000 });
    const found = codes(idle, "IDLE_GAP");
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("info");
    expect(session(idle, "s").max_idle_gap_ms).toBe(300_000);
  });
});

describe("timeline reconstruction", () => {
  test("session metrics", () => {
    const alpha = session(report, "alpha");
    expect(alpha.outcome).toBe("ok");
    expect(alpha.wall_clock_ms).toBe(7000);
    expect(alpha.tool_time_ms).toBe(1500);
    expect(alpha.peak_concurrent_tools).toBe(1);
    expect(alpha.event_count).toBe(7);
    expect(alpha.tool_span_count).toBe(1);
    expect(alpha.phase_span_count).toBe(1);
    expect(alpha.event_counts).toEqual({
      message: 1,
      phase_end: 1,
      phase_start: 1,
      session_end: 1,
      session_start: 1,
      tool_end: 1,
      tool_start: 1,
    });

    const beta = session(report, "beta");
    expect(beta.outcome).toBe("error");
    expect(beta.peak_concurrent_tools).toBe(2);
    expect(beta.tool_time_ms).toBe(5000);
    expect(beta.start_ts).toBe("2026-07-26T01:59:59.000Z");
  });

  test("completed spans carry both line numbers and a duration", () => {
    const span = session(report, "alpha").spans.find((s) => s.span_id === "tool-read")!;
    expect(span.complete).toBe(true);
    expect(span.start_line).toBe(3);
    expect(span.end_line).toBe(4);
    expect(span.duration_ms).toBe(1500);
    expect(span.status).toBe("ok");
    expect(span.exclusive).toBe(false);
  });

  test("open spans have no end and are marked exclusive by name prefix", () => {
    const span = session(report, "beta").spans.find((s) => s.span_id === "tool-test")!;
    expect(span.complete).toBe(false);
    expect(span.end_ts).toBeNull();
    expect(span.duration_ms).toBeNull();
    expect(span.exclusive).toBe(true);
  });
});

describe("determinism", () => {
  test("repeated analysis produces byte-identical JSON", async () => {
    const a = JSON.stringify(await analyzeFile(FIXTURE), null, 2);
    const b = JSON.stringify(await analyzeFile(FIXTURE), null, 2);
    expect(a).toBe(b);
  });

  test("sessions are ordered by first appearance, findings by line", () => {
    expect(report.sessions.map((s) => s.session)).toEqual(["alpha", "beta", "gamma", "delta"]);
    const lines = report.findings.map((f) => f.line);
    expect([...lines].sort((x, y) => x - y)).toEqual(lines);
  });

  test("findings on the same line are ordered by code", () => {
    const grouped = new Map<number, string[]>();
    for (const f of report.findings) grouped.set(f.line, [...(grouped.get(f.line) ?? []), f.code]);
    for (const list of grouped.values()) {
      expect([...list].sort()).toEqual(list);
    }
  });

  test("chunk boundaries do not change the result", async () => {
    const text = await Bun.file(FIXTURE).text();
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    const { readLines } = await import("../src/lines.ts");
    const chunked = await analyzeLines(readLines(stream), { source: FIXTURE });
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(report));
  });
});
