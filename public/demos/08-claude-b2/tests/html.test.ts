import { describe, expect, test } from "bun:test";
import { analyzeFile } from "../src/analyze.ts";
import { renderHtml } from "../src/report-html.ts";

const report = await analyzeFile("fixtures/sample.jsonl");
const html = renderHtml(report);

/**
 * Minimal DOM stand-in so the inlined report script can actually be executed
 * here — this is what proves the page renders when opened from disk.
 */
function runPageScripts(source: string) {
  const nodes = new Map<string, { innerHTML: string; textContent: string; classList: { toggle: () => void } }>();
  const make = () => ({ innerHTML: "", textContent: "", classList: { toggle: () => {} } });
  for (const id of ["#timeline", "#findings-body", "#malformed-body", "#finding-count", "#align-rel", "#align-abs"]) {
    nodes.set(id, make());
  }
  const documentStub = {
    querySelector: (selector: string) => nodes.get(selector) ?? make(),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const windowStub: Record<string, unknown> = {};
  const blocks = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] as string);
  expect(blocks.length).toBe(2);
  for (const block of blocks) {
    new Function("window", "document", block)(windowStub, documentStub);
  }
  return { nodes, windowStub };
}

describe("html report", () => {
  test("is a standalone document with no external assets", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]*rel=["']?stylesheet/);
    expect(html).not.toMatch(/<img/);
  });

  test("contains every session ID and the source path", () => {
    for (const id of ["alpha", "beta", "gamma", "delta"]) {
      expect(html).toContain(id);
    }
    expect(html).toContain("fixtures/sample.jsonl");
  });

  test("embeds the full report and offers session + severity filters", () => {
    for (const id of ["alpha", "beta", "gamma", "delta"]) {
      expect(html).toContain(`data-session="${id}"`);
    }
    for (const severity of ["error", "warning", "info"]) {
      expect(html).toContain(`data-severity="${severity}"`);
    }
    expect(html).toContain("id=\"q\"");
  });

  test("documents every anomaly code that the run produced", () => {
    for (const code of new Set(report.findings.map((f) => f.code))) {
      expect(html).toContain(code);
    }
    expect(html).toContain("Anomaly codes");
  });

  test("shows malformed lines verbatim", () => {
    expect(html).toContain("this is not json");
    expect(html).toContain("Malformed lines (1)");
  });

  test("the inlined script renders the timeline, findings and malformed table", () => {
    const { nodes, windowStub } = runPageScripts(html);
    const trace = windowStub.__TRACE__ as typeof report;
    expect(trace.session_count).toBe(4);

    const timeline = nodes.get("#timeline")!.innerHTML;
    for (const id of ["alpha", "beta", "gamma", "delta"]) {
      expect(timeline).toContain(`data-session="${id}"`);
    }
    expect(timeline).toContain("class=\"bar tool\"");
    expect(timeline).toContain("class=\"bar phase\"");
    // exclusive:test never closed, so it renders as an open bar
    expect(timeline).toContain("open");
    expect(timeline).toContain("class=\"mark\"");

    const findings = nodes.get("#findings-body")!.innerHTML;
    expect(findings).toContain("EXCLUSIVE_OVERLAP");
    expect(findings).toContain("MISSING_SESSION_END");
    expect(nodes.get("#finding-count")!.textContent).toBe(`${report.finding_count} of ${report.finding_count}`);

    expect(nodes.get("#malformed-body")!.innerHTML).toContain("this is not json");
  });

  test("escapes hostile content instead of injecting it", () => {
    const nasty = renderHtml({
      ...report,
      source: "<script>alert(1)</script>",
      malformed_lines: [{ line: 1, reason: "x", snippet: "</script><img onerror=1>" }],
    });
    expect(nasty).not.toContain("<script>alert(1)</script>");
    expect(nasty).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(nasty.match(/<script>/g)?.length).toBe(2);
  });
});
