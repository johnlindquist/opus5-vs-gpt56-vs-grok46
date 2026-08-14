import type { AnalysisReport, Finding, SessionReport } from "./types.ts";

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function fmtMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 3 : 2).replace(/\.?0+$/, "")}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(1);
  return `${minutes}m ${rest}s`;
}

function severityMark(severity: Finding["severity"]): string {
  if (severity === "error") {
    return "ERR";
  }
  if (severity === "warning") {
    return "WRN";
  }
  return "INF";
}

function sessionBlock(session: SessionReport): string {
  const counts = Object.entries(session.event_counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
  const incomplete =
    session.incomplete_spans.length === 0
      ? "none"
      : session.incomplete_spans.map((s) => `${s.kind}:${s.span_id}`).join(", ");
  const idle =
    session.idle_gaps.length === 0
      ? "none"
      : session.idle_gaps.map((g) => `${g.start_ts} → ${g.end_ts} (${fmtMs(g.duration_ms)})`).join("; ");
  return [
    `  ${session.id}`,
    `    window     ${session.start_ts ?? "?"} → ${session.end_ts ?? "(open)"}`,
    `    outcome    ${session.outcome}`,
    `    wall       ${fmtMs(session.wall_clock_duration_ms)}`,
    `    tool time  ${fmtMs(session.tool_time_ms)}  peak concurrent tools ${session.peak_concurrent_tools}`,
    `    events     ${counts || "(none)"}`,
    `    idle gaps  ${idle}`,
    `    incomplete ${incomplete}`,
  ].join("\n");
}

export function formatTerminal(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push("Trace Sheriff — Agent Timeline Forensics");
  lines.push(`source     ${report.source}`);
  lines.push(
    `lines      ${report.line_count}  valid ${report.valid_event_count}  malformed ${report.malformed_line_count}  sessions ${report.session_count}`,
  );
  lines.push(
    `findings   ${report.finding_count}  error ${report.severity_counts.error}  warning ${report.severity_counts.warning}  info ${report.severity_counts.info}`,
  );
  lines.push("");
  lines.push("Sessions");
  for (const session of report.sessions) {
    lines.push(sessionBlock(session));
  }
  lines.push("");
  lines.push("Findings");
  if (report.findings.length === 0) {
    lines.push("  (none)");
  } else {
    const header = `  ${pad("SEV", 4)} ${pad("CODE", 24)} ${pad("LINE", 6)} ${pad("SESSION", 10)} MESSAGE`;
    lines.push(header);
    for (const finding of report.findings) {
      lines.push(
        `  ${pad(severityMark(finding.severity), 4)} ${pad(finding.code, 24)} ${pad(String(finding.line), 6)} ${pad(finding.session ?? "-", 10)} ${finding.message}`,
      );
    }
  }
  lines.push("");
  lines.push("Malformed input is always listed. Analysis completed with findings preserved.");
  return lines.join("\n");
}
