/**
 * Shared types for Trace Sheriff.
 *
 * The JSON report is a public contract: every object written to disk is built
 * with an explicit, fixed key order so that byte-for-byte output is stable.
 */

export type Severity = "info" | "warning" | "error";

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

/** A line that parsed as JSON and passed required-field validation. */
export interface TraceEvent {
  line: number;
  ts: string;
  time: number;
  session: string;
  type: EventType;
  event_id?: string;
  span_id?: string;
  name?: string;
  status?: string;
  text?: string;
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

export interface Span {
  span_id: string;
  kind: "tool" | "phase";
  name: string | null;
  exclusive: boolean;
  start_ts: string | null;
  end_ts: string | null;
  start_line: number | null;
  end_line: number | null;
  duration_ms: number | null;
  status: string | null;
  complete: boolean;
}

export interface IdleGap {
  from_ts: string;
  to_ts: string;
  duration_ms: number;
  after_line: number;
}

export interface SessionReport {
  session: string;
  outcome: "ok" | "error" | "incomplete";
  status: string | null;
  first_line: number;
  last_line: number;
  start_ts: string | null;
  end_ts: string | null;
  wall_clock_ms: number;
  tool_time_ms: number;
  tool_utilization_pct: number;
  peak_concurrent_tools: number;
  event_count: number;
  event_counts: Record<string, number>;
  span_count: number;
  tool_span_count: number;
  phase_span_count: number;
  incomplete_span_count: number;
  idle_gap_count: number;
  total_idle_ms: number;
  max_idle_gap_ms: number;
  finding_count: number;
  severity_counts: Record<Severity, number>;
  idle_gaps: IdleGap[];
  spans: Span[];
}

export interface MalformedLine {
  line: number;
  reason: string;
  snippet: string;
}

export interface Report {
  schema_version: 1;
  source: string;
  generated_with: string;
  line_count: number;
  valid_event_count: number;
  malformed_line_count: number;
  session_count: number;
  finding_count: number;
  severity_counts: Record<Severity, number>;
  idle_gap_threshold_ms: number;
  sessions: SessionReport[];
  malformed_lines: MalformedLine[];
  findings: Finding[];
}

export interface CodeDoc {
  code: string;
  severity: Severity;
  title: string;
  explanation: string;
}

/** Documentation for every anomaly code the analyzer can emit. */
export const CODE_DOCS: CodeDoc[] = [
  {
    code: "MALFORMED_JSON",
    severity: "error",
    title: "Malformed JSON line",
    explanation:
      "The line could not be parsed as JSON. It is reported with its original line number and a snippet, never silently dropped.",
  },
  {
    code: "NOT_AN_OBJECT",
    severity: "error",
    title: "Line is not a JSON object",
    explanation:
      "The line parsed as valid JSON but is a scalar or array, so it cannot be interpreted as an event record.",
  },
  {
    code: "MISSING_FIELD",
    severity: "error",
    title: "Missing required field",
    explanation:
      "An event record is missing one or more of the required fields ts, session or type, so it cannot be placed on a timeline.",
  },
  {
    code: "INVALID_TIMESTAMP",
    severity: "error",
    title: "Unparseable timestamp",
    explanation:
      "The ts field is present but is not a parseable ISO-8601 timestamp.",
  },
  {
    code: "UNKNOWN_EVENT_TYPE",
    severity: "warning",
    title: "Unknown event type",
    explanation:
      "The type field is not one of the seven known event types. The event is counted but contributes no span structure.",
  },
  {
    code: "MISSING_EVENT_ID",
    severity: "warning",
    title: "Missing event_id",
    explanation:
      "Event IDs are intended to be globally unique. An event without one cannot be cross-referenced or de-duplicated.",
  },
  {
    code: "DUPLICATE_EVENT_ID",
    severity: "error",
    title: "Duplicate event_id",
    explanation:
      "Two events share an event_id that is supposed to be globally unique. Reported on the second and later occurrences, naming the first line that used the ID.",
  },
  {
    code: "CLOCK_REVERSAL",
    severity: "warning",
    title: "Timestamp moved backwards",
    explanation:
      "Within a single session, an event appears later in file order but carries an earlier timestamp than the event before it. Usually a clock skew or an out-of-order write.",
  },
  {
    code: "ORPHAN_TOOL_END",
    severity: "error",
    title: "tool_end without tool_start",
    explanation:
      "A tool span was closed that was never opened in this session, so its duration and concurrency contribution are unknown.",
  },
  {
    code: "ORPHAN_PHASE_END",
    severity: "error",
    title: "phase_end without phase_start",
    explanation:
      "A phase span was closed that was never opened in this session.",
  },
  {
    code: "DUPLICATE_SPAN_START",
    severity: "warning",
    title: "Span started twice",
    explanation:
      "A span_id was opened while an identical span_id was still open in the same session. The later start replaces the earlier one, which is reported as incomplete.",
  },
  {
    code: "OPEN_TOOL_SPAN",
    severity: "warning",
    title: "Tool span never closed",
    explanation:
      "A tool_start had no matching tool_end before the end of input. Its duration is treated as unknown and excluded from summed tool time.",
  },
  {
    code: "OPEN_PHASE_SPAN",
    severity: "warning",
    title: "Phase span never closed",
    explanation:
      "A phase_start had no matching phase_end before the end of input.",
  },
  {
    code: "MISSING_SESSION_END",
    severity: "warning",
    title: "Missing session_end",
    explanation:
      "The session produced events but never emitted a session_end, so its outcome is recorded as incomplete.",
  },
  {
    code: "MISSING_SESSION_START",
    severity: "warning",
    title: "Missing session_start",
    explanation:
      "Events were seen for a session that never emitted a session_start, so the true session origin is unknown.",
  },
  {
    code: "DUPLICATE_SESSION_START",
    severity: "error",
    title: "Multiple session_start events",
    explanation:
      "A session emitted more than one session_start. Reported on every start after the first.",
  },
  {
    code: "EXCLUSIVE_OVERLAP",
    severity: "error",
    title: "Overlapping exclusive tool spans",
    explanation:
      "Two tool spans whose names begin with the prefix 'exclusive:' were open at the same time in the same session. Exclusive tools are expected to be mutually serialized.",
  },
  {
    code: "SESSION_ENDED_NON_OK",
    severity: "warning",
    title: "Session ended with a non-ok status",
    explanation:
      "The session_end event carried a status other than 'ok'.",
  },
  {
    code: "IDLE_GAP",
    severity: "info",
    title: "Idle gap between events",
    explanation:
      "The session had no recorded activity for longer than the idle threshold (configurable with --idle-gap-ms).",
  },
];
