import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { parseTimestamp, readJsonl, isEventType } from "./parse.ts";
import {
  ANOMALY_CODES,
  EVENT_TYPES,
  type AnalysisReport,
  type Finding,
  type RawEvent,
  type SessionReport,
  type Severity,
  type SpanRecord,
} from "./types.ts";

const SPAN_TYPES = new Set(["phase_start", "phase_end", "tool_start", "tool_end"]);

interface OpenSpan {
  kind: "tool" | "phase";
  span_id: string;
  name: string | null;
  start_ts: string;
  start_ms: number;
  start_line: number;
  start_event_id: string;
}

interface SessionState {
  id: string;
  order: number;
  start_ts: string | null;
  end_ts: string | null;
  start_count: number;
  end_count: number;
  outcome: string;
  last_ts: string | null;
  last_ms: number | null;
  first_ms: number | null;
  last_event_ms: number | null;
  first_line: number | null;
  event_counts: Record<string, number>;
  open_tools: Map<string, OpenSpan>;
  open_phases: Map<string, OpenSpan>;
  tools: SpanRecord[];
  phases: SpanRecord[];
}

function emptyCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const type of EVENT_TYPES) {
    counts[type] = 0;
  }
  return counts;
}

function finding(
  code: keyof typeof ANOMALY_CODES,
  extra: {
    session: string | null;
    line: number;
    message: string;
    event_id?: string | null;
    span_id?: string | null;
  },
): Finding {
  const meta = ANOMALY_CODES[code];
  return {
    code,
    severity: meta.severity,
    session: extra.session,
    line: extra.line,
    message: extra.message,
    event_id: extra.event_id ?? null,
    span_id: extra.span_id ?? null,
  };
}

function compareFindings(a: Finding, b: Finding): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  if (a.code !== b.code) {
    return a.code.localeCompare(b.code);
  }
  return a.message.localeCompare(b.message);
}

function durationMs(start: string | null, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.max(0, b - a);
}

function isExclusiveName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.startsWith("exclusive:");
}

function requiredFieldIssues(event: RawEvent): string[] {
  const issues: string[] = [];
  if (typeof event.session !== "string" || event.session.length === 0) {
    issues.push("session");
  }
  if (typeof event.event_id !== "string" || event.event_id.length === 0) {
    issues.push("event_id");
  }
  if (typeof event.type !== "string" || event.type.length === 0) {
    issues.push("type");
  }
  if (SPAN_TYPES.has(event.type) && (typeof event.span_id !== "string" || event.span_id.length === 0)) {
    issues.push("span_id");
  }
  return issues;
}

function ensureSession(map: Map<string, SessionState>, id: string): SessionState {
  let session = map.get(id);
  if (!session) {
    session = {
      id,
      order: map.size,
      start_ts: null,
      end_ts: null,
      start_count: 0,
      end_count: 0,
      outcome: "unknown",
      last_ts: null,
      last_ms: null,
      first_ms: null,
      last_event_ms: null,
      first_line: null,
      event_counts: emptyCounts(),
      open_tools: new Map(),
      open_phases: new Map(),
      tools: [],
      phases: [],
    };
    map.set(id, session);
  }
  return session;
}

function closeSpan(open: OpenSpan, end_ts: string, end_line: number, end_event_id: string, status: string | null): SpanRecord {
  return {
    kind: open.kind,
    span_id: open.span_id,
    name: open.name,
    start_ts: open.start_ts,
    end_ts,
    start_line: open.start_line,
    end_line,
    start_event_id: open.start_event_id,
    end_event_id,
    status,
    complete: true,
    duration_ms: durationMs(open.start_ts, end_ts),
  };
}

function peakAndIdle(tools: SpanRecord[], firstMs: number | null, lastMs: number | null, lastTs: string | null, firstTs: string | null) {
  const intervals: Array<{ start: number; end: number; start_ts: string; end_ts: string }> = [];
  for (const tool of tools) {
    if (!tool.start_ts) {
      continue;
    }
    const start = Date.parse(tool.start_ts);
    const endTs = tool.end_ts ?? lastTs;
    if (!endTs) {
      continue;
    }
    const end = Date.parse(endTs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      continue;
    }
    intervals.push({ start, end, start_ts: tool.start_ts, end_ts: endTs });
  }

  const points: Array<{ t: number; delta: number }> = [];
  for (const interval of intervals) {
    points.push({ t: interval.start, delta: 1 });
    points.push({ t: interval.end, delta: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const point of points) {
    current += point.delta;
    if (current > peak) {
      peak = current;
    }
  }

  const idle_gaps: Array<{ start_ts: string; end_ts: string; duration_ms: number }> = [];
  if (firstMs !== null && lastMs !== null && firstTs && lastTs && lastMs >= firstMs) {
    const merged = [...intervals].sort((a, b) => a.start - b.start);
    const union: Array<{ start: number; end: number; start_ts: string; end_ts: string }> = [];
    for (const interval of merged) {
      const prev = union[union.length - 1];
      if (!prev || interval.start > prev.end) {
        union.push({ ...interval });
      } else if (interval.end > prev.end) {
        prev.end = interval.end;
        prev.end_ts = interval.end_ts;
      }
    }
    let cursor = firstMs;
    let cursorTs = firstTs;
    for (const block of union) {
      if (block.start > cursor) {
        idle_gaps.push({
          start_ts: cursorTs,
          end_ts: block.start_ts,
          duration_ms: block.start - cursor,
        });
      }
      if (block.end > cursor) {
        cursor = block.end;
        cursorTs = block.end_ts;
      }
    }
    if (lastMs > cursor) {
      idle_gaps.push({
        start_ts: cursorTs,
        end_ts: lastTs,
        duration_ms: lastMs - cursor,
      });
    }
  }

  return { peak, idle_gaps };
}

export async function pathIsReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function analyzeFile(source: string): Promise<AnalysisReport> {
  const findings: Finding[] = [];
  const sessions = new Map<string, SessionState>();
  const seenIds = new Map<string, { line: number; session: string }>();
  let line_count = 0;
  let valid_event_count = 0;
  let malformed_line_count = 0;

  for await (const parsed of readJsonl(source)) {
    line_count = Math.max(line_count, parsed.line);

    if (parsed.parse_error) {
      malformed_line_count += 1;
      findings.push(
        finding("MALFORMED_JSON", {
          session: null,
          line: parsed.line,
          message: `Line ${parsed.line} is not valid JSON: ${parsed.parse_error}`,
        }),
      );
      continue;
    }

    const event = parsed.event!;
    const tsMs = parseTimestamp(event.ts);
    if (tsMs === null) {
      findings.push(
        finding("INVALID_TIMESTAMP", {
          session: typeof event.session === "string" ? event.session : null,
          line: parsed.line,
          message: `Line ${parsed.line} has a missing or invalid ts field.`,
          event_id: typeof event.event_id === "string" ? event.event_id : null,
        }),
      );
      continue;
    }

    if (!isEventType(event.type)) {
      findings.push(
        finding("UNKNOWN_EVENT_TYPE", {
          session: typeof event.session === "string" ? event.session : null,
          line: parsed.line,
          message: `Line ${parsed.line} has unrecognized type ${JSON.stringify(event.type)}.`,
          event_id: typeof event.event_id === "string" ? event.event_id : null,
        }),
      );
      continue;
    }

    const missing = requiredFieldIssues(event);
    if (missing.length > 0) {
      findings.push(
        finding("MISSING_REQUIRED_FIELD", {
          session: typeof event.session === "string" ? event.session : null,
          line: parsed.line,
          message: `Line ${parsed.line} is missing required field(s): ${missing.join(", ")}.`,
          event_id: typeof event.event_id === "string" ? event.event_id : null,
          span_id: typeof event.span_id === "string" ? event.span_id : null,
        }),
      );
      continue;
    }

    valid_event_count += 1;
    const session = ensureSession(sessions, event.session);
    session.event_counts[event.type] = (session.event_counts[event.type] ?? 0) + 1;
    if (session.first_line === null) {
      session.first_line = parsed.line;
    }
    if (session.first_ms === null || tsMs < session.first_ms) {
      session.first_ms = tsMs;
    }
    session.last_event_ms = tsMs;

    const prior = seenIds.get(event.event_id);
    if (prior) {
      findings.push(
        finding("DUPLICATE_EVENT_ID", {
          session: event.session,
          line: parsed.line,
          message: `event_id ${event.event_id} duplicates line ${prior.line} (session ${prior.session}).`,
          event_id: event.event_id,
          span_id: event.span_id ?? null,
        }),
      );
    } else {
      seenIds.set(event.event_id, { line: parsed.line, session: event.session });
    }

    if (session.last_ms !== null && tsMs < session.last_ms) {
      findings.push(
        finding("TIMESTAMP_REVERSAL", {
          session: event.session,
          line: parsed.line,
          message: `Timestamp ${event.ts} is earlier than previous session event ${session.last_ts} (file order).`,
          event_id: event.event_id,
          span_id: event.span_id ?? null,
        }),
      );
    }
    session.last_ts = event.ts;
    session.last_ms = tsMs;

    const status = typeof event.status === "string" ? event.status : null;
    const name = typeof event.name === "string" ? event.name : null;
    const spanId = typeof event.span_id === "string" ? event.span_id : "";

    switch (event.type) {
      case "session_start": {
        session.start_count += 1;
        if (session.start_count === 1) {
          session.start_ts = event.ts;
        } else {
          findings.push(
            finding("MULTIPLE_SESSION_START", {
              session: event.session,
              line: parsed.line,
              message: `Session ${event.session} has another session_start (count ${session.start_count}).`,
              event_id: event.event_id,
            }),
          );
        }
        break;
      }
      case "session_end": {
        session.end_count += 1;
        session.end_ts = event.ts;
        session.outcome = status ?? "unknown";
        break;
      }
      case "phase_start": {
        const open: OpenSpan = {
          kind: "phase",
          span_id: spanId,
          name,
          start_ts: event.ts,
          start_ms: tsMs,
          start_line: parsed.line,
          start_event_id: event.event_id,
        };
        session.open_phases.set(spanId, open);
        break;
      }
      case "phase_end": {
        const open = session.open_phases.get(spanId);
        if (!open) {
          findings.push(
            finding("ORPHAN_PHASE_END", {
              session: event.session,
              line: parsed.line,
              message: `phase_end for ${spanId} has no matching open phase_start.`,
              event_id: event.event_id,
              span_id: spanId,
            }),
          );
        } else {
          session.open_phases.delete(spanId);
          session.phases.push(closeSpan(open, event.ts, parsed.line, event.event_id, status));
        }
        break;
      }
      case "tool_start": {
        if (isExclusiveName(name)) {
          for (const other of session.open_tools.values()) {
            if (isExclusiveName(other.name)) {
              findings.push(
                finding("EXCLUSIVE_TOOL_OVERLAP", {
                  session: event.session,
                  line: parsed.line,
                  message: `Exclusive tool ${name} overlaps open exclusive span ${other.span_id} (${other.name}).`,
                  event_id: event.event_id,
                  span_id: spanId,
                }),
              );
            }
          }
        }
        const open: OpenSpan = {
          kind: "tool",
          span_id: spanId,
          name,
          start_ts: event.ts,
          start_ms: tsMs,
          start_line: parsed.line,
          start_event_id: event.event_id,
        };
        session.open_tools.set(spanId, open);
        break;
      }
      case "tool_end": {
        const open = session.open_tools.get(spanId);
        if (!open) {
          findings.push(
            finding("ORPHAN_TOOL_END", {
              session: event.session,
              line: parsed.line,
              message: `tool_end for ${spanId} has no matching open tool_start.`,
              event_id: event.event_id,
              span_id: spanId,
            }),
          );
        } else {
          session.open_tools.delete(spanId);
          session.tools.push(closeSpan(open, event.ts, parsed.line, event.event_id, status));
        }
        break;
      }
      default:
        break;
    }
  }

  for (const session of sessions.values()) {
    for (const open of session.open_tools.values()) {
      session.tools.push({
        kind: "tool",
        span_id: open.span_id,
        name: open.name,
        start_ts: open.start_ts,
        end_ts: null,
        start_line: open.start_line,
        end_line: null,
        start_event_id: open.start_event_id,
        end_event_id: null,
        status: null,
        complete: false,
        duration_ms: durationMs(open.start_ts, session.last_ts),
      });
      findings.push(
        finding("OPEN_TOOL_SPAN", {
          session: session.id,
          line: open.start_line,
          message: `Tool span ${open.span_id} (${open.name ?? "unnamed"}) is still open at end of input.`,
          event_id: open.start_event_id,
          span_id: open.span_id,
        }),
      );
    }
    for (const open of session.open_phases.values()) {
      session.phases.push({
        kind: "phase",
        span_id: open.span_id,
        name: open.name,
        start_ts: open.start_ts,
        end_ts: null,
        start_line: open.start_line,
        end_line: null,
        start_event_id: open.start_event_id,
        end_event_id: null,
        status: null,
        complete: false,
        duration_ms: durationMs(open.start_ts, session.last_ts),
      });
      findings.push(
        finding("OPEN_PHASE_SPAN", {
          session: session.id,
          line: open.start_line,
          message: `Phase span ${open.span_id} (${open.name ?? "unnamed"}) is still open at end of input.`,
          event_id: open.start_event_id,
          span_id: open.span_id,
        }),
      );
    }
    if (session.end_count === 0) {
      findings.push(
        finding("MISSING_SESSION_END", {
          session: session.id,
          line: session.first_line ?? 1,
          message: `Session ${session.id} has no session_end event.`,
          event_id: null,
        }),
      );
      if (session.outcome === "unknown") {
        session.outcome = "incomplete";
      }
    }
  }

  findings.sort(compareFindings);

  const sessionReports: SessionReport[] = [...sessions.values()]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((session) => {
      const tools = [...session.tools].sort((a, b) => (a.start_line ?? 0) - (b.start_line ?? 0));
      const phases = [...session.phases].sort((a, b) => (a.start_line ?? 0) - (b.start_line ?? 0));
      const firstTs = session.start_ts ?? (session.first_ms !== null ? new Date(session.first_ms).toISOString() : null);
      const lastTs = session.end_ts ?? session.last_ts;
      const wall = durationMs(firstTs, lastTs) ?? 0;
      const tool_time_ms = tools.reduce((sum, tool) => sum + (tool.duration_ms ?? 0), 0);
      const { peak, idle_gaps } = peakAndIdle(
        tools,
        firstTs ? Date.parse(firstTs) : session.first_ms,
        lastTs ? Date.parse(lastTs) : session.last_event_ms,
        lastTs,
        firstTs,
      );
      const incomplete_spans = [...tools, ...phases]
        .filter((span) => !span.complete)
        .map((span) => ({
          kind: span.kind,
          span_id: span.span_id,
          name: span.name,
          start_ts: span.start_ts,
          start_line: span.start_line,
        }));
      return {
        id: session.id,
        start_ts: session.start_ts,
        end_ts: session.end_ts,
        outcome: session.outcome,
        wall_clock_duration_ms: wall,
        tool_time_ms,
        peak_concurrent_tools: peak,
        event_counts: session.event_counts,
        idle_gaps,
        incomplete_spans,
        phases,
        tools,
      };
    });

  const severity_counts = { info: 0, warning: 0, error: 0 };
  for (const item of findings) {
    severity_counts[item.severity as Severity] += 1;
  }

  return {
    schema_version: 1,
    source,
    line_count,
    valid_event_count,
    malformed_line_count,
    session_count: sessionReports.length,
    finding_count: findings.length,
    severity_counts,
    sessions: sessionReports,
    findings,
  };
}
