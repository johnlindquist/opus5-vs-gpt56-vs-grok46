/**
 * The analyzer: one streaming pass over the log, then a finalize pass over the
 * per-session state that was accumulated.
 */

import { readFileLines, type RawLine } from "./lines.ts";
import {
  EVENT_TYPES,
  type EventType,
  type Finding,
  type IdleGap,
  type MalformedLine,
  type Report,
  type SessionReport,
  type Severity,
  type Span,
} from "./types.ts";

export const EXCLUSIVE_PREFIX = "exclusive:";
export const DEFAULT_IDLE_GAP_MS = 30_000;
export const TOOL_VERSION = "trace-sheriff/1.0.0";

export interface AnalyzeOptions {
  source: string;
  idleGapMs?: number;
}

interface SessionState {
  session: string;
  firstLine: number;
  lastLine: number;
  minTime: number;
  maxTime: number;
  maxTimeTs: string;
  maxTimeLine: number;
  prevTime: number | null;
  prevTs: string | null;
  startCount: number;
  startLine: number | null;
  endStatus: string | null;
  endLine: number | null;
  eventCount: number;
  eventCounts: Map<string, number>;
  spans: Span[];
  openTools: Map<string, Span>;
  openPhases: Map<string, Span>;
  idleGaps: IdleGap[];
}

function newSession(session: string, line: number): SessionState {
  return {
    session,
    firstLine: line,
    lastLine: line,
    minTime: Number.POSITIVE_INFINITY,
    maxTime: Number.NEGATIVE_INFINITY,
    maxTimeTs: "",
    maxTimeLine: line,
    prevTime: null,
    prevTs: null,
    startCount: 0,
    startLine: null,
    endStatus: null,
    endLine: null,
    eventCount: 0,
    eventCounts: new Map(),
    spans: [],
    openTools: new Map(),
    openPhases: new Map(),
    idleGaps: [],
  };
}

function isKnownType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

function snippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function severityOf(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { info: 0, warning: 0, error: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** Findings are ordered by source line first so the report reads like the file. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    a.line - b.line ||
    a.code.localeCompare(b.code) ||
    (a.session ?? "").localeCompare(b.session ?? "") ||
    (a.span_id ?? "").localeCompare(b.span_id ?? "") ||
    (a.event_id ?? "").localeCompare(b.event_id ?? "") ||
    a.message.localeCompare(b.message)
  );
}

/**
 * Peak number of tool spans open at the same instant. Ends are processed before
 * starts at an identical timestamp, so a hand-off does not count as overlap.
 */
function peakConcurrency(spans: Span[], fallbackEnd: number): number {
  const points: Array<[number, number]> = [];
  for (const span of spans) {
    if (span.kind !== "tool" || span.start_ts === null) continue;
    const start = Date.parse(span.start_ts);
    const end = span.end_ts === null ? fallbackEnd : Date.parse(span.end_ts);
    points.push([start, 1]);
    points.push([Math.max(end, start), -1]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let peak = 0;
  for (const [, delta] of points) {
    open += delta;
    if (open > peak) peak = open;
  }
  return peak;
}

export async function analyzeLines(
  lines: AsyncIterable<RawLine>,
  options: AnalyzeOptions,
): Promise<Report> {
  const idleGapMs = options.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
  const findings: Finding[] = [];
  const malformed: MalformedLine[] = [];
  const sessions = new Map<string, SessionState>();
  const eventIdLines = new Map<string, number>();

  let lineCount = 0;
  let validEventCount = 0;

  const add = (
    code: string,
    severity: Severity,
    line: number,
    message: string,
    extra: { session?: string | null; event_id?: string | null; span_id?: string | null } = {},
  ) => {
    findings.push({
      code,
      severity,
      session: extra.session ?? null,
      line,
      message,
      event_id: extra.event_id ?? null,
      span_id: extra.span_id ?? null,
    });
  };

  for await (const raw of lines) {
    lineCount = raw.line;
    if (raw.text.trim().length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      malformed.push({ line: raw.line, reason, snippet: snippet(raw.text) });
      add("MALFORMED_JSON", "error", raw.line, `Line is not valid JSON: ${reason}`);
      continue;
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      malformed.push({
        line: raw.line,
        reason: "parsed JSON is not an object",
        snippet: snippet(raw.text),
      });
      add(
        "NOT_AN_OBJECT",
        "error",
        raw.line,
        "Line parsed as JSON but is not an object, so it cannot be an event record.",
      );
      continue;
    }

    const record = parsed as Record<string, unknown>;
    const sessionId = typeof record.session === "string" ? record.session : null;
    const rawType = typeof record.type === "string" ? record.type : null;
    const rawTs = typeof record.ts === "string" ? record.ts : null;
    const eventId = typeof record.event_id === "string" && record.event_id.length > 0
      ? record.event_id
      : null;
    const spanId = typeof record.span_id === "string" && record.span_id.length > 0
      ? record.span_id
      : null;
    const name = typeof record.name === "string" ? record.name : null;
    const status = typeof record.status === "string" ? record.status : null;

    const missing: string[] = [];
    if (rawTs === null) missing.push("ts");
    if (sessionId === null) missing.push("session");
    if (rawType === null) missing.push("type");
    if (missing.length > 0) {
      add(
        "MISSING_FIELD",
        "error",
        raw.line,
        `Event is missing required field(s): ${missing.join(", ")}.`,
        { session: sessionId, event_id: eventId, span_id: spanId },
      );
      continue;
    }

    const time = Date.parse(rawTs as string);
    if (Number.isNaN(time)) {
      add(
        "INVALID_TIMESTAMP",
        "error",
        raw.line,
        `ts "${rawTs}" is not a parseable ISO-8601 timestamp.`,
        { session: sessionId, event_id: eventId, span_id: spanId },
      );
      continue;
    }

    validEventCount += 1;

    if (eventId === null) {
      add("MISSING_EVENT_ID", "warning", raw.line, "Event has no event_id, so it cannot be cross-referenced.", {
        session: sessionId,
        span_id: spanId,
      });
    } else {
      const first = eventIdLines.get(eventId);
      if (first === undefined) {
        eventIdLines.set(eventId, raw.line);
      } else {
        add(
          "DUPLICATE_EVENT_ID",
          "error",
          raw.line,
          `event_id "${eventId}" was already used on line ${first}; event IDs must be globally unique.`,
          { session: sessionId, event_id: eventId, span_id: spanId },
        );
      }
    }

    const sid = sessionId as string;
    let state = sessions.get(sid);
    if (state === undefined) {
      state = newSession(sid, raw.line);
      sessions.set(sid, state);
    }
    state.lastLine = raw.line;
    state.eventCount += 1;
    state.eventCounts.set(rawType as string, (state.eventCounts.get(rawType as string) ?? 0) + 1);

    if (state.prevTime !== null && time < state.prevTime) {
      add(
        "CLOCK_REVERSAL",
        "warning",
        raw.line,
        `Timestamp ${rawTs} is earlier than the previous event of session "${sid}" at ${state.prevTs} (line order says it came later).`,
        { session: sid, event_id: eventId, span_id: spanId },
      );
    }
    state.prevTime = time;
    state.prevTs = rawTs;

    if (time < state.minTime) state.minTime = time;
    if (time > state.maxTime) {
      const gap = state.maxTime === Number.NEGATIVE_INFINITY ? 0 : time - state.maxTime;
      if (gap >= idleGapMs) {
        state.idleGaps.push({
          from_ts: state.maxTimeTs,
          to_ts: rawTs as string,
          duration_ms: gap,
          after_line: state.maxTimeLine,
        });
      }
      state.maxTime = time;
      state.maxTimeTs = rawTs as string;
      state.maxTimeLine = raw.line;
    }

    if (!isKnownType(rawType as string)) {
      add("UNKNOWN_EVENT_TYPE", "warning", raw.line, `Unknown event type "${rawType}".`, {
        session: sid,
        event_id: eventId,
        span_id: spanId,
      });
      continue;
    }

    const type = rawType as EventType;

    if (type === "session_start") {
      state.startCount += 1;
      if (state.startCount > 1) {
        add(
          "DUPLICATE_SESSION_START",
          "error",
          raw.line,
          `Session "${sid}" already emitted session_start on line ${state.startLine}; a session must start exactly once.`,
          { session: sid, event_id: eventId },
        );
      } else {
        state.startLine = raw.line;
      }
      continue;
    }

    if (type === "session_end") {
      state.endStatus = status;
      state.endLine = raw.line;
      continue;
    }

    if (type === "message") continue;

    const kind: "tool" | "phase" = type.startsWith("tool") ? "tool" : "phase";
    const open = kind === "tool" ? state.openTools : state.openPhases;

    if (spanId === null) {
      add("MISSING_FIELD", "error", raw.line, `${type} is missing required field(s): span_id.`, {
        session: sid,
        event_id: eventId,
      });
      continue;
    }

    if (type === "tool_start" || type === "phase_start") {
      const existing = open.get(spanId);
      if (existing !== undefined) {
        add(
          "DUPLICATE_SPAN_START",
          "warning",
          raw.line,
          `${kind} span "${spanId}" was reopened while still open from line ${existing.start_line}.`,
          { session: sid, event_id: eventId, span_id: spanId },
        );
      }
      const span: Span = {
        span_id: spanId,
        kind,
        name,
        exclusive: name !== null && name.startsWith(EXCLUSIVE_PREFIX),
        start_ts: rawTs,
        end_ts: null,
        start_line: raw.line,
        end_line: null,
        duration_ms: null,
        status: null,
        complete: false,
      };
      state.spans.push(span);
      open.set(spanId, span);
      continue;
    }

    // tool_end / phase_end
    const span = open.get(spanId);
    if (span === undefined) {
      add(
        kind === "tool" ? "ORPHAN_TOOL_END" : "ORPHAN_PHASE_END",
        "error",
        raw.line,
        `${type} for span "${spanId}"${name ? ` (${name})` : ""} has no matching ${kind}_start in session "${sid}".`,
        { session: sid, event_id: eventId, span_id: spanId },
      );
      continue;
    }
    open.delete(spanId);
    span.end_ts = rawTs;
    span.end_line = raw.line;
    span.status = status;
    span.complete = true;
    span.duration_ms = Math.max(0, time - Date.parse(span.start_ts as string));
    if (span.name === null && name !== null) {
      span.name = name;
      span.exclusive = name.startsWith(EXCLUSIVE_PREFIX);
    }
  }

  // ---- finalize -----------------------------------------------------------

  const sessionReports: SessionReport[] = [];

  for (const state of sessions.values()) {
    const sid = state.session;

    for (const span of state.openTools.values()) {
      add(
        "OPEN_TOOL_SPAN",
        "warning",
        span.start_line as number,
        `Tool span "${span.span_id}"${span.name ? ` (${span.name})` : ""} was still open at end of input.`,
        { session: sid, span_id: span.span_id },
      );
    }
    for (const span of state.openPhases.values()) {
      add(
        "OPEN_PHASE_SPAN",
        "warning",
        span.start_line as number,
        `Phase span "${span.span_id}"${span.name ? ` (${span.name})` : ""} was still open at end of input.`,
        { session: sid, span_id: span.span_id },
      );
    }
    if (state.startCount === 0) {
      add("MISSING_SESSION_START", "warning", state.firstLine, `Session "${sid}" has events but no session_start.`, {
        session: sid,
      });
    }
    if (state.endLine === null) {
      add("MISSING_SESSION_END", "warning", state.lastLine, `Session "${sid}" never emitted session_end.`, {
        session: sid,
      });
    } else if (state.endStatus !== null && state.endStatus !== "ok") {
      add(
        "SESSION_ENDED_NON_OK",
        "warning",
        state.endLine,
        `Session "${sid}" ended with status "${state.endStatus}".`,
        { session: sid },
      );
    }

    const hasTime = state.maxTime !== Number.NEGATIVE_INFINITY;
    const sessionEnd = hasTime ? state.maxTime : 0;

    // Exclusive tool spans must never overlap inside one session.
    const exclusive = state.spans.filter((s) => s.kind === "tool" && s.exclusive && s.start_ts !== null);
    for (let i = 0; i < exclusive.length; i += 1) {
      for (let j = i + 1; j < exclusive.length; j += 1) {
        const a = exclusive[i] as Span;
        const b = exclusive[j] as Span;
        const aStart = Date.parse(a.start_ts as string);
        const bStart = Date.parse(b.start_ts as string);
        const aEnd = a.end_ts === null ? sessionEnd : Date.parse(a.end_ts);
        const bEnd = b.end_ts === null ? sessionEnd : Date.parse(b.end_ts);
        if (aStart < bEnd && bStart < aEnd) {
          const later = bStart >= aStart ? b : a;
          add(
            "EXCLUSIVE_OVERLAP",
            "error",
            later.start_line as number,
            `Exclusive tool spans "${a.name}" (${a.span_id}) and "${b.name}" (${b.span_id}) overlapped in session "${sid}".`,
            { session: sid, span_id: later.span_id },
          );
        }
      }
    }

    for (const gap of state.idleGaps) {
      add(
        "IDLE_GAP",
        "info",
        gap.after_line,
        `Session "${sid}" was idle for ${gap.duration_ms} ms between ${gap.from_ts} and ${gap.to_ts}.`,
        { session: sid },
      );
    }

    const spans = [...state.spans].sort(
      (a, b) => (a.start_line ?? 0) - (b.start_line ?? 0) || a.span_id.localeCompare(b.span_id),
    );
    const toolSpans = spans.filter((s) => s.kind === "tool");
    const phaseSpans = spans.filter((s) => s.kind === "phase");
    const toolTime = toolSpans.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);
    const wall = hasTime ? state.maxTime - state.minTime : 0;
    const eventCounts: Record<string, number> = {};
    for (const key of [...state.eventCounts.keys()].sort()) {
      eventCounts[key] = state.eventCounts.get(key) as number;
    }
    const idleTotal = state.idleGaps.reduce((sum, g) => sum + g.duration_ms, 0);

    sessionReports.push({
      session: sid,
      outcome: state.endLine === null ? "incomplete" : state.endStatus === "ok" ? "ok" : "error",
      status: state.endStatus,
      first_line: state.firstLine,
      last_line: state.lastLine,
      start_ts: hasTime ? new Date(state.minTime).toISOString() : null,
      end_ts: hasTime ? new Date(state.maxTime).toISOString() : null,
      wall_clock_ms: wall,
      tool_time_ms: toolTime,
      tool_utilization_pct: wall > 0 ? Math.round((toolTime / wall) * 1000) / 10 : 0,
      peak_concurrent_tools: peakConcurrency(spans, sessionEnd),
      event_count: state.eventCount,
      event_counts: eventCounts,
      span_count: spans.length,
      tool_span_count: toolSpans.length,
      phase_span_count: phaseSpans.length,
      incomplete_span_count: spans.filter((s) => !s.complete).length,
      idle_gap_count: state.idleGaps.length,
      total_idle_ms: idleTotal,
      max_idle_gap_ms: state.idleGaps.reduce((max, g) => Math.max(max, g.duration_ms), 0),
      finding_count: 0,
      severity_counts: { info: 0, warning: 0, error: 0 },
      idle_gaps: state.idleGaps,
      spans,
    });
  }

  findings.sort(compareFindings);
  sessionReports.sort((a, b) => a.first_line - b.first_line || a.session.localeCompare(b.session));

  for (const report of sessionReports) {
    const own = findings.filter((f) => f.session === report.session);
    report.finding_count = own.length;
    report.severity_counts = severityOf(own);
  }

  malformed.sort((a, b) => a.line - b.line);

  return {
    schema_version: 1,
    source: options.source,
    generated_with: TOOL_VERSION,
    line_count: lineCount,
    valid_event_count: validEventCount,
    malformed_line_count: malformed.length,
    session_count: sessionReports.length,
    finding_count: findings.length,
    severity_counts: severityOf(findings),
    idle_gap_threshold_ms: idleGapMs,
    sessions: sessionReports,
    malformed_lines: malformed,
    findings,
  };
}

export async function analyzeFile(path: string, options?: { idleGapMs?: number }): Promise<Report> {
  return analyzeLines(readFileLines(path), {
    source: path,
    idleGapMs: options?.idleGapMs,
  });
}
