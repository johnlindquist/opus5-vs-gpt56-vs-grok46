# Trace Sheriff — Agent Timeline Forensics

A local, dependency-free developer tool that reads JSONL event logs from concurrent
AI-agent sessions, reconstructs per-session timelines, detects structural anomalies,
and emits a terminal summary, a deterministic JSON report, and a standalone HTML
timeline you can open straight from disk.

Built for Bun 1.3 with TypeScript. No packages are installed; only Bun/Node built-ins
and plain browser APIs are used.

## Quick start

```sh
bun run src/cli.ts analyze fixtures/sample.jsonl \
  --json out/summary.json \
  --html report.html

bun run src/cli.ts analyze fixtures/sample.jsonl   # terminal summary only
bun run src/cli.ts help
bun test
```

Then open `report.html` in a browser (`file://` works — there is no server and no
external asset).

### Options

| Option | Meaning |
| --- | --- |
| `--json <path>` | write the deterministic JSON report (directories are created) |
| `--html <path>` | write the self-contained HTML timeline report |
| `--idle-gap-ms <n>` | idle-gap threshold in ms (default `30000`) |
| `--max-findings <n>` | cap the findings printed to the terminal (JSON/HTML stay complete) |
| `--no-color` | disable ANSI colour |
| `--quiet` | suppress the terminal summary |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | analysis completed — findings, malformed lines and anomalies do **not** change this |
| `2` | invalid CLI usage, or an input path that cannot be read |

## How it works

`src/lines.ts` pulls the file through a `ReadableStream` and yields one line at a
time with its 1-based line number, so the whole log is never held in memory as a
single string and arbitrarily large files stream fine. Chunk boundaries, `\r\n`
endings, a UTF-8 BOM and a missing trailing newline are all handled (there is a test
that re-runs the fixture through 7-byte chunks and asserts identical output).

`src/analyze.ts` makes one streaming pass, keeping per-session state (open tool and
phase spans, previous timestamp, event tallies) plus a global `event_id` table, then
a finalize pass that closes out sessions and computes cross-span facts such as
exclusive overlap and peak concurrency. Every line number that produced a finding is
preserved, and a malformed line is recorded as a finding rather than aborting the run.

### Reconstructed per session

Start/end timestamps, wall-clock duration, summed tool time and utilisation, peak
concurrent tool spans, idle gaps, event counts by type, phase/tool spans with their
line numbers and durations, incomplete span count, and the session outcome
(`ok` / `error` / `incomplete`).

## Anomaly codes

| Code | Severity | Meaning |
| --- | --- | --- |
| `MALFORMED_JSON` | error | line is not valid JSON; reported with its line number and text |
| `NOT_AN_OBJECT` | error | valid JSON but not an object, so it is not an event record |
| `MISSING_FIELD` | error | missing `ts`, `session`, `type`, or `span_id` on a span event |
| `INVALID_TIMESTAMP` | error | `ts` is not a parseable ISO-8601 timestamp |
| `UNKNOWN_EVENT_TYPE` | warning | `type` is outside the seven known event types |
| `MISSING_EVENT_ID` | warning | event cannot be cross-referenced or de-duplicated |
| `DUPLICATE_EVENT_ID` | error | an `event_id` was reused; reported on the later line, naming the first |
| `CLOCK_REVERSAL` | warning | timestamp goes backwards relative to the previous event of that session in file order |
| `ORPHAN_TOOL_END` | error | `tool_end` with no matching `tool_start` |
| `ORPHAN_PHASE_END` | error | `phase_end` with no matching `phase_start` |
| `DUPLICATE_SPAN_START` | warning | a span id was reopened while still open |
| `OPEN_TOOL_SPAN` | warning | tool span still open at end of input |
| `OPEN_PHASE_SPAN` | warning | phase span still open at end of input |
| `MISSING_SESSION_END` | warning | session never emitted `session_end` |
| `MISSING_SESSION_START` | warning | events seen for a session that never started |
| `DUPLICATE_SESSION_START` | error | more than one `session_start` for a session |
| `EXCLUSIVE_OVERLAP` | error | two tool spans named `exclusive:*` were open simultaneously in one session |
| `SESSION_ENDED_NON_OK` | warning | `session_end` carried a status other than `ok` |
| `IDLE_GAP` | info | no activity for longer than `--idle-gap-ms` |

Every finding carries `code`, `severity`, `session` (when known), `line`, `message`,
and `event_id` / `span_id` when known.

## Output contracts

**JSON** (`--json`) starts with the required envelope and adds detail:

```json
{
  "schema_version": 1,
  "source": "fixtures/sample.jsonl",
  "line_count": 24,
  "valid_event_count": 23,
  "malformed_line_count": 1,
  "session_count": 4,
  "finding_count": 11,
  "severity_counts": { "info": 0, "warning": 5, "error": 6 },
  "sessions": [],
  "findings": []
}
```

Ordering is deterministic: sessions by first appearance in the file (then by ID),
findings by source line (then code, session, span, event, message), spans by start
line, malformed lines by line number. Re-running on the same input produces
byte-identical bytes.

**HTML** (`--html`) is a single file with inline CSS, inline JS and the report
inlined as JSON. It opens at 1600×900 with an overview suitable for a screenshot:
KPI tiles, filter bar, and all sessions on one horizontal timeline. Phase spans,
tool spans and never-closed spans are colour-coded; hovering a bar shows the span
ID, name, duration and source lines. Sessions can be aligned to their own start
(default, best for comparing) or to the absolute clock. Findings filter by session,
severity and free text with no server, malformed lines are shown verbatim, and every
anomaly code is documented in-page with its count for the current run.

## Fixture

`fixtures/sample.jsonl` is deliberately dirty — four sessions carrying an exclusive
overlap, an orphan `tool_end`, an orphan `phase_end`, a duplicate `event_id`, a clock
reversal, an unparseable line, a missing `session_end`, two `session_start` events,
and two never-closed spans. It is the input for the tests, so it must not be cleaned.

## Tests

`bun test` covers fixture line/malformed counts, each required detector, session
metrics, streaming chunk-boundary stability, deterministic JSON ordering, CLI exit
codes (including exit 2 for bad usage and unreadable paths), HTML self-containment
and escaping, and executing the report's inlined script against a minimal DOM stub
to prove the timeline, findings table and malformed table actually render.

## Known limits

- Idle gaps are measured between consecutive events, not between tool spans, so a
  long gap covered by an open span still counts as idle.
- Per-session span records are held in memory to build the timeline, so memory
  scales with span count (not with file size).
- Exclusive overlap is checked pairwise within a session, which is quadratic in the
  number of exclusive spans per session.
