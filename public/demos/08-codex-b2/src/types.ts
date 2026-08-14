export const EVENT_TYPES = [
  "session_start",
  "phase_start",
  "phase_end",
  "tool_start",
  "tool_end",
  "message",
  "session_end",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Severity = "info" | "warning" | "error";
export type SpanKind = "tool" | "phase";

export interface TraceEvent {
  ts: string;
  timestamp_ms: number;
  session: string;
  type: EventType;
  event_id: string;
  span_id?: string;
  name?: string;
  status?: string;
  text?: string;
  line: number;
}

export interface SpanSummary {
  kind: SpanKind;
  span_id: string;
  name: string;
  start_line: number;
  end_line: number | null;
  start_ts: string;
  end_ts: string | null;
  duration_ms: number | null;
  status: string | null;
  incomplete: boolean;
}

export interface IdleGap {
  start_ts: string;
  end_ts: string;
  duration_ms: number;
}

export interface SessionSummary {
  session: string;
  start_ts: string | null;
  end_ts: string | null;
  wall_clock_ms: number | null;
  tool_time_ms: number;
  peak_concurrent_tools: number;
  event_count: number;
  incomplete_span_count: number;
  outcome: string;
  idle_gaps: IdleGap[];
  spans: SpanSummary[];
  events: TraceEvent[];
}

export interface Finding {
  code: string;
  severity: Severity;
  session: string | null;
  line: number;
  message: string;
  related_id: string | null;
}

export interface MalformedLine {
  line: number;
  text: string;
  error: string;
}

export interface AnalysisSummary {
  schema_version: 1;
  source: string;
  line_count: number;
  valid_event_count: number;
  malformed_line_count: number;
  session_count: number;
  finding_count: number;
  severity_counts: Record<Severity, number>;
  sessions: SessionSummary[];
  findings: Finding[];
  malformed_lines: MalformedLine[];
}
