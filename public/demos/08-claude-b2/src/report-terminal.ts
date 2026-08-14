/** Human-readable terminal summary. */

import type { Finding, Report, Severity } from "./types.ts";

const RESET = "[0m";
const STYLE: Record<string, string> = {
  dim: "[2m",
  bold: "[1m",
  red: "[31m",
  yellow: "[33m",
  blue: "[34m",
  green: "[32m",
  cyan: "[36m",
};

export interface RenderOptions {
  color: boolean;
  maxFindings?: number;
}

function paint(text: string, style: string, color: boolean): string {
  return color ? `${STYLE[style] ?? ""}${text}${RESET}` : text;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  error: "red",
  warning: "yellow",
  info: "blue",
};

function ms(value: number): string {
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${Math.round(seconds % 60)}s`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

function findingLine(finding: Finding, color: boolean): string {
  const sev = paint(pad(finding.severity.toUpperCase(), 7), SEVERITY_STYLE[finding.severity], color);
  const where = paint(`L${finding.line}`, "dim", color);
  const session = finding.session ? paint(`[${finding.session}]`, "cyan", color) : paint("[-]", "dim", color);
  return `  ${sev} ${padStart(where, 5)} ${session} ${paint(finding.code, "bold", color)} — ${finding.message}`;
}

export function renderTerminal(report: Report, options: RenderOptions): string {
  const { color } = options;
  const max = options.maxFindings ?? Number.POSITIVE_INFINITY;
  const out: string[] = [];

  out.push(paint("Trace Sheriff — agent timeline forensics", "bold", color));
  out.push(paint(`source: ${report.source}`, "dim", color));
  out.push("");
  out.push(
    `lines ${report.line_count}  ·  valid events ${report.valid_event_count}  ·  malformed ${report.malformed_line_count}  ·  sessions ${report.session_count}  ·  findings ${report.finding_count}`,
  );
  out.push(
    `severity: ${paint(`${report.severity_counts.error} error`, "red", color)}  ${paint(
      `${report.severity_counts.warning} warning`,
      "yellow",
      color,
    )}  ${paint(`${report.severity_counts.info} info`, "blue", color)}`,
  );
  out.push("");

  out.push(paint("SESSIONS", "bold", color));
  const header = `  ${pad("session", 10)}${pad("outcome", 12)}${padStart("wall", 8)}${padStart(
    "tooltime",
    10,
  )}${padStart("util", 7)}${padStart("peak", 6)}${padStart("events", 8)}${padStart("spans", 7)}${padStart(
    "open",
    6,
  )}${padStart("findings", 10)}`;
  out.push(paint(header, "dim", color));
  for (const session of report.sessions) {
    const outcomeStyle = session.outcome === "ok" ? "green" : session.outcome === "error" ? "red" : "yellow";
    out.push(
      `  ${pad(session.session, 10)}${paint(pad(session.outcome, 12), outcomeStyle, color)}${padStart(
        ms(session.wall_clock_ms),
        8,
      )}${padStart(ms(session.tool_time_ms), 10)}${padStart(`${session.tool_utilization_pct}%`, 7)}${padStart(
        String(session.peak_concurrent_tools),
        6,
      )}${padStart(String(session.event_count), 8)}${padStart(String(session.span_count), 7)}${padStart(
        String(session.incomplete_span_count),
        6,
      )}${padStart(String(session.finding_count), 10)}`,
    );
  }
  out.push("");

  if (report.malformed_lines.length > 0) {
    out.push(paint(`MALFORMED LINES (${report.malformed_lines.length})`, "bold", color));
    for (const line of report.malformed_lines) {
      out.push(`  ${paint(`L${line.line}`, "dim", color)} ${line.reason}`);
      out.push(`         ${paint(line.snippet, "dim", color)}`);
    }
    out.push("");
  }

  out.push(paint(`FINDINGS (${report.finding_count})`, "bold", color));
  if (report.findings.length === 0) {
    out.push(paint("  none", "dim", color));
  }
  let shown = 0;
  for (const finding of report.findings) {
    if (shown >= max) {
      out.push(paint(`  … ${report.findings.length - shown} more (see the JSON or HTML report)`, "dim", color));
      break;
    }
    out.push(findingLine(finding, color));
    shown += 1;
  }
  out.push("");

  const byCode = new Map<string, number>();
  for (const finding of report.findings) byCode.set(finding.code, (byCode.get(finding.code) ?? 0) + 1);
  if (byCode.size > 0) {
    out.push(paint("BY CODE", "bold", color));
    for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      out.push(`  ${pad(code, 26)}${padStart(String(count), 4)}`);
    }
    out.push("");
  }

  return out.join("\n");
}
