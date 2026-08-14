import {
  EVENT_TYPES,
  type AnalysisSummary,
  type EventType,
  type Finding,
  type IdleGap,
  type MalformedLine,
  type SessionSummary,
  type SpanKind,
  type SpanSummary,
  type TraceEvent,
} from "./types";

interface MutableSession {
  session: string;
  firstLine: number;
  events: TraceEvent[];
  starts: TraceEvent[];
  ends: TraceEvent[];
  spans: SpanSummary[];
  openTools: Map<string, TraceEvent>;
  openPhases: Map<string, TraceEvent>;
  lastTimestamp?: number;
}

const REQUIRED_BY_TYPE: Partial<Record<EventType, string[]>> = {
  phase_start: ["span_id", "name"],
  phase_end: ["span_id", "name"],
  tool_start: ["span_id", "name"],
  tool_end: ["span_id", "name"],
};

function finding(
  code: string,
  severity: Finding["severity"],
  line: number,
  message: string,
  session: string | null = null,
  related_id: string | null = null,
): Finding {
  return { code, severity, session, line, message, related_id };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && (record[key] as string).length > 0;
}

function closeSpan(
  mutable: MutableSession,
  event: TraceEvent,
  kind: SpanKind,
  findings: Finding[],
): void {
  const map = kind === "tool" ? mutable.openTools : mutable.openPhases;
  const start = map.get(event.span_id!);
  if (!start) {
    const code = kind === "tool" ? "ORPHAN_TOOL_END" : "ORPHAN_PHASE_END";
    findings.push(
      finding(
        code,
        "error",
        event.line,
        `${kind} end "${event.span_id}" has no matching start.`,
        event.session,
        event.span_id,
      ),
    );
    return;
  }
  map.delete(event.span_id!);
  mutable.spans.push({
    kind,
    span_id: event.span_id!,
    name: start.name!,
    start_line: start.line,
    end_line: event.line,
    start_ts: start.ts,
    end_ts: event.ts,
    duration_ms: Math.max(0, event.timestamp_ms - start.timestamp_ms),
    status: event.status ?? null,
    incomplete: false,
  });
}

function detectExclusiveOverlap(
  mutable: MutableSession,
  event: TraceEvent,
  findings: Finding[],
): void {
  if (!event.name?.startsWith("exclusive:")) return;
  for (const open of mutable.openTools.values()) {
    if (open.name?.startsWith("exclusive:")) {
      findings.push(
        finding(
          "EXCLUSIVE_TOOL_OVERLAP",
          "error",
          event.line,
          `Exclusive tool "${event.name}" overlaps "${open.name}" opened on line ${open.line}.`,
          event.session,
          event.span_id ?? event.event_id,
        ),
      );
    }
  }
}

function peakConcurrency(spans: SpanSummary[], fallbackEnd: number): number {
  const points: Array<[number, number, number]> = [];
  for (const span of spans) {
    if (span.kind !== "tool") continue;
    const start = Date.parse(span.start_ts);
    const end = span.end_ts ? Date.parse(span.end_ts) : fallbackEnd;
    points.push([start, 1, span.start_line], [end, -1, span.end_line ?? Number.MAX_SAFE_INTEGER]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of points) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

function idleGaps(events: TraceEvent[], startMs: number, endMs: number): IdleGap[] {
  const tools: Array<[number, number]> = [];
  const open = new Map<string, number>();
  for (const event of events) {
    if (event.type === "tool_start" && event.span_id) open.set(event.span_id, event.timestamp_ms);
    if (event.type === "tool_end" && event.span_id) {
      const start = open.get(event.span_id);
      if (start !== undefined) {
        tools.push([Math.max(startMs, start), Math.min(endMs, event.timestamp_ms)]);
        open.delete(event.span_id);
      }
    }
  }
  for (const start of open.values()) tools.push([Math.max(startMs, start), endMs]);
  tools.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const interval of tools) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const gaps: IdleGap[] = [];
  let cursor = startMs;
  for (const [from, to] of merged) {
    if (from > cursor) {
      gaps.push({ start_ts: new Date(cursor).toISOString(), end_ts: new Date(from).toISOString(), duration_ms: from - cursor });
    }
    cursor = Math.max(cursor, to);
  }
  if (cursor < endMs) {
    gaps.push({ start_ts: new Date(cursor).toISOString(), end_ts: new Date(endMs).toISOString(), duration_ms: endMs - cursor });
  }
  return gaps;
}

export async function analyzeFile(path: string, source = path): Promise<AnalysisSummary> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Cannot read input: ${path}`);

  const findings: Finding[] = [];
  const malformed: MalformedLine[] = [];
  const sessions = new Map<string, MutableSession>();
  const eventIds = new Map<string, TraceEvent>();
  let lineCount = 0;
  let validEventCount = 0;

  const handleLine = (rawLine: string) => {
    lineCount++;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      malformed.push({ line: lineCount, text: line, error: detail });
      findings.push(finding("MALFORMED_JSON", "error", lineCount, `Malformed JSON: ${detail}`));
      return;
    }
    const record = asRecord(parsed);
    if (!record) {
      findings.push(finding("MISSING_REQUIRED_FIELD", "error", lineCount, "Event must be a JSON object."));
      return;
    }

    const session = requiredString(record, "session") ? (record.session as string) : null;
    const baseRequired = ["ts", "session", "type", "event_id"];
    const missing = baseRequired.filter((key) => !requiredString(record, key));
    const type = record.type as string | undefined;
    if (typeof type === "string" && EVENT_TYPES.includes(type as EventType)) {
      for (const key of REQUIRED_BY_TYPE[type as EventType] ?? []) {
        if (!requiredString(record, key)) missing.push(key);
      }
    } else if (typeof type === "string") {
      findings.push(finding("UNKNOWN_EVENT_TYPE", "error", lineCount, `Unknown event type "${type}".`, session));
    }
    if (missing.length) {
      findings.push(
        finding(
          "MISSING_REQUIRED_FIELD",
          "error",
          lineCount,
          `Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
          session,
          requiredString(record, "event_id") ? (record.event_id as string) : null,
        ),
      );
    }
    if (missing.length || typeof type !== "string" || !EVENT_TYPES.includes(type as EventType)) return;
    const timestamp = Date.parse(record.ts as string);
    if (!Number.isFinite(timestamp)) {
      findings.push(finding("INVALID_TIMESTAMP", "error", lineCount, `Invalid timestamp "${record.ts}".`, session, record.event_id as string));
      return;
    }

    const event: TraceEvent = {
      ts: record.ts as string,
      timestamp_ms: timestamp,
      session: record.session as string,
      type: type as EventType,
      event_id: record.event_id as string,
      line: lineCount,
    };
    for (const key of ["span_id", "name", "status", "text"] as const) {
      if (typeof record[key] === "string") event[key] = record[key] as string;
    }
    validEventCount++;

    const previousId = eventIds.get(event.event_id);
    if (previousId) {
      findings.push(
        finding(
          "DUPLICATE_EVENT_ID",
          "error",
          event.line,
          `Event ID "${event.event_id}" duplicates line ${previousId.line}.`,
          event.session,
          event.event_id,
        ),
      );
    } else eventIds.set(event.event_id, event);

    let mutable = sessions.get(event.session);
    if (!mutable) {
      mutable = {
        session: event.session,
        firstLine: event.line,
        events: [],
        starts: [],
        ends: [],
        spans: [],
        openTools: new Map(),
        openPhases: new Map(),
      };
      sessions.set(event.session, mutable);
    }
    if (mutable.lastTimestamp !== undefined && event.timestamp_ms < mutable.lastTimestamp) {
      findings.push(
        finding(
          "TIMESTAMP_REVERSAL",
          "warning",
          event.line,
          `Timestamp moves backward within session file order (${event.ts}).`,
          event.session,
          event.event_id,
        ),
      );
    }
    mutable.lastTimestamp = event.timestamp_ms;
    mutable.events.push(event);

    if (event.type === "session_start") {
      mutable.starts.push(event);
      if (mutable.starts.length > 1) {
        findings.push(
          finding(
            "MULTIPLE_SESSION_START",
            "error",
            event.line,
            `Session "${event.session}" has multiple session_start events.`,
            event.session,
            event.event_id,
          ),
        );
      }
    } else if (event.type === "session_end") {
      mutable.ends.push(event);
    } else if (event.type === "tool_start") {
      detectExclusiveOverlap(mutable, event, findings);
      mutable.openTools.set(event.span_id!, event);
    } else if (event.type === "tool_end") {
      closeSpan(mutable, event, "tool", findings);
    } else if (event.type === "phase_start") {
      mutable.openPhases.set(event.span_id!, event);
    } else if (event.type === "phase_end") {
      closeSpan(mutable, event, "phase", findings);
    }
  };

  const decoder = new TextDecoder();
  let pending = "";
  try {
    for await (const chunk of file.stream()) {
      pending += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        handleLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    if (pending.length > 0) handleLine(pending);
  } catch (error) {
    throw new Error(`Cannot read input: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sessionSummaries: SessionSummary[] = [];
  for (const mutable of sessions.values()) {
    for (const [spanId, start] of mutable.openTools) {
      mutable.spans.push({
        kind: "tool", span_id: spanId, name: start.name!, start_line: start.line, end_line: null,
        start_ts: start.ts, end_ts: null, duration_ms: null, status: null, incomplete: true,
      });
      findings.push(finding("OPEN_TOOL_SPAN", "warning", start.line, `Tool span "${spanId}" remains open at end of input.`, mutable.session, spanId));
    }
    for (const [spanId, start] of mutable.openPhases) {
      mutable.spans.push({
        kind: "phase", span_id: spanId, name: start.name!, start_line: start.line, end_line: null,
        start_ts: start.ts, end_ts: null, duration_ms: null, status: null, incomplete: true,
      });
      findings.push(finding("OPEN_PHASE_SPAN", "warning", start.line, `Phase span "${spanId}" remains open at end of input.`, mutable.session, spanId));
    }
    if (mutable.ends.length === 0) {
      findings.push(
        finding(
          "MISSING_SESSION_END",
          "warning",
          mutable.events.at(-1)?.line ?? mutable.firstLine,
          `Session "${mutable.session}" has no session_end event.`,
          mutable.session,
          mutable.session,
        ),
      );
    }
    mutable.spans.sort((a, b) => a.start_line - b.start_line || a.kind.localeCompare(b.kind) || a.span_id.localeCompare(b.span_id));
    const start = mutable.starts[0]?.timestamp_ms;
    const endEvent = mutable.ends.at(-1);
    const observedEnd = endEvent?.timestamp_ms ?? Math.max(...mutable.events.map((event) => event.timestamp_ms));
    const hasRange = start !== undefined && Number.isFinite(observedEnd);
    const observedToolTime = mutable.spans
      .filter((span) => span.kind === "tool")
      .reduce(
        (sum, span) =>
          sum +
          (span.duration_ms ??
            Math.max(0, observedEnd - Date.parse(span.start_ts))),
        0,
      );
    sessionSummaries.push({
      session: mutable.session,
      start_ts: mutable.starts[0]?.ts ?? null,
      end_ts: endEvent?.ts ?? null,
      wall_clock_ms: hasRange ? Math.max(0, observedEnd - start!) : null,
      tool_time_ms: observedToolTime,
      peak_concurrent_tools: peakConcurrency(mutable.spans, observedEnd),
      event_count: mutable.events.length,
      incomplete_span_count: mutable.spans.filter((span) => span.incomplete).length,
      outcome: endEvent?.status ?? (endEvent ? "ended" : "incomplete"),
      idle_gaps: hasRange ? idleGaps(mutable.events, start!, observedEnd) : [],
      spans: mutable.spans,
      events: mutable.events,
    });
  }

  findings.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code) || (a.session ?? "").localeCompare(b.session ?? ""));
  const severityCounts = { info: 0, warning: 0, error: 0 };
  for (const item of findings) severityCounts[item.severity]++;
  return {
    schema_version: 1,
    source,
    line_count: lineCount,
    valid_event_count: validEventCount,
    malformed_line_count: malformed.length,
    session_count: sessionSummaries.length,
    finding_count: findings.length,
    severity_counts: severityCounts,
    sessions: sessionSummaries,
    findings,
    malformed_lines: malformed,
  };
}

export function deterministicJson(summary: AnalysisSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}
