import type { AnalysisReport } from "./types.ts";

export function toJsonDocument(report: AnalysisReport): AnalysisReport {
  return {
    schema_version: 1,
    source: report.source,
    line_count: report.line_count,
    valid_event_count: report.valid_event_count,
    malformed_line_count: report.malformed_line_count,
    session_count: report.session_count,
    finding_count: report.finding_count,
    severity_counts: {
      info: report.severity_counts.info,
      warning: report.severity_counts.warning,
      error: report.severity_counts.error,
    },
    sessions: report.sessions.map((session) => ({
      id: session.id,
      start_ts: session.start_ts,
      end_ts: session.end_ts,
      outcome: session.outcome,
      wall_clock_duration_ms: session.wall_clock_duration_ms,
      tool_time_ms: session.tool_time_ms,
      peak_concurrent_tools: session.peak_concurrent_tools,
      event_counts: session.event_counts,
      idle_gaps: session.idle_gaps,
      incomplete_spans: session.incomplete_spans,
      phases: session.phases,
      tools: session.tools,
    })),
    findings: report.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      session: finding.session,
      line: finding.line,
      message: finding.message,
      event_id: finding.event_id,
      span_id: finding.span_id,
    })),
  };
}

export function formatJson(report: AnalysisReport): string {
  return `${JSON.stringify(toJsonDocument(report), null, 2)}\n`;
}
