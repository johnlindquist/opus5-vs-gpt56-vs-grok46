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

export interface RawEvent {
  ts: string;
  session: string;
  type: EventType;
  event_id: string;
  span_id?: string;
  name?: string;
  status?: string;
  text?: string;
}

export interface ParsedLine {
  line: number;
  raw: string;
  event: RawEvent | null;
  parse_error: string | null;
}

export interface Finding {
  code: string;
  severity: Severity;
  session: string | null;
  line: number;
  message: string;
  event_id: string | null;
  span_id: string | null;
}

export interface SpanRecord {
  kind: "tool" | "phase";
  span_id: string;
  name: string | null;
  start_ts: string | null;
  end_ts: string | null;
  start_line: number | null;
  end_line: number | null;
  start_event_id: string | null;
  end_event_id: string | null;
  status: string | null;
  complete: boolean;
  duration_ms: number | null;
}

export interface IdleGap {
  start_ts: string;
  end_ts: string;
  duration_ms: number;
}

export interface SessionReport {
  id: string;
  start_ts: string | null;
  end_ts: string | null;
  outcome: string;
  wall_clock_duration_ms: number;
  tool_time_ms: number;
  peak_concurrent_tools: number;
  event_counts: Record<string, number>;
  idle_gaps: IdleGap[];
  incomplete_spans: Array<{
    kind: "tool" | "phase";
    span_id: string;
    name: string | null;
    start_ts: string | null;
    start_line: number | null;
  }>;
  phases: SpanRecord[];
  tools: SpanRecord[];
}

export interface AnalysisReport {
  schema_version: 1;
  source: string;
  line_count: number;
  valid_event_count: number;
  malformed_line_count: number;
  session_count: number;
  finding_count: number;
  severity_counts: { info: number; warning: number; error: number };
  sessions: SessionReport[];
  findings: Finding[];
}

export const ANOMALY_CODES: Record<
  string,
  { severity: Severity; title: string; explanation: string }
> = {
  MALFORMED_JSON: {
    severity: "error",
    title: "Malformed JSON",
    explanation: "The line is not valid JSON. It is recorded as a finding and skipped as an event.",
  },
  MISSING_REQUIRED_FIELD: {
    severity: "error",
    title: "Missing required field",
    explanation: "A parsed object is missing ts, session, type, event_id, or a span_id required for phase/tool events.",
  },
  UNKNOWN_EVENT_TYPE: {
    severity: "error",
    title: "Unknown event type",
    explanation: "The type field is not one of the seven recognized agent timeline event types.",
  },
  INVALID_TIMESTAMP: {
    severity: "error",
    title: "Invalid timestamp",
    explanation: "The ts field is missing or is not a parseable ISO-8601 timestamp.",
  },
  DUPLICATE_EVENT_ID: {
    severity: "error",
    title: "Duplicate event_id",
    explanation: "An event_id was reused. Identifiers are intended to be globally unique.",
  },
  TIMESTAMP_REVERSAL: {
    severity: "warning",
    title: "Timestamp reversal",
    explanation: "Within a session, a later file-order event has an earlier timestamp than the previous event.",
  },
  ORPHAN_TOOL_END: {
    severity: "error",
    title: "Orphan tool_end",
    explanation: "A tool_end arrived with no matching open tool_start for that span_id in the session.",
  },
  ORPHAN_PHASE_END: {
    severity: "error",
    title: "Orphan phase_end",
    explanation: "A phase_end arrived with no matching open phase_start for that span_id in the session.",
  },
  OPEN_TOOL_SPAN: {
    severity: "warning",
    title: "Open tool span",
    explanation: "A tool_start never received a matching tool_end before the end of input.",
  },
  OPEN_PHASE_SPAN: {
    severity: "warning",
    title: "Open phase span",
    explanation: "A phase_start never received a matching phase_end before the end of input.",
  },
  MISSING_SESSION_END: {
    severity: "warning",
    title: "Missing session_end",
    explanation: "The session started (or emitted events) but never recorded a session_end.",
  },
  MULTIPLE_SESSION_START: {
    severity: "error",
    title: "Multiple session_start",
    explanation: "The same session emitted more than one session_start event.",
  },
  EXCLUSIVE_TOOL_OVERLAP: {
    severity: "error",
    title: "Exclusive tool overlap",
    explanation:
      "Two tools whose names begin with exclusive: were concurrently open in the same session.",
  },
};
