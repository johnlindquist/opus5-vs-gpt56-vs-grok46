# Trace Sheriff

Trace Sheriff is a dependency-free Bun/TypeScript command-line tool for forensic analysis of concurrent AI-agent JSONL traces. It incrementally reads the source, reconstructs session, phase, and tool timelines, and reports malformed input and structural anomalies without aborting the analysis.

## Requirements

- Bun 1.3 or later
- No package installation

## Use

```sh
bun run src/cli.ts analyze fixtures/sample.jsonl \
  --json out/summary.json \
  --html report.html
```

Terminal-only analysis and CLI help are also available:

```sh
bun run src/cli.ts analyze fixtures/sample.jsonl
bun run src/cli.ts help
```

Completed analyses exit 0 even when findings exist. Invalid arguments and unreadable paths exit 2.

## Outputs

- The terminal report gives session outcomes, timing, concurrency, and a line-numbered findings ledger.
- JSON is deterministic and includes source counts, per-session events and spans, idle gaps, malformed source lines, and findings.
- HTML is a standalone, offline report with a four-session overview, horizontal tool/phase tracks, filters, malformed source, and an anomaly-code reference.

Open `report.html` directly in a browser; it has no external assets and needs no server.

## Event validation

Every event requires `ts`, `session`, `type`, and `event_id`. Tool and phase events additionally require `span_id` and `name`. Malformed JSON and parsed records with missing fields are retained as findings with original line numbers. Open tool spans contribute their observed duration through the session's final event while remaining explicitly incomplete.

Idle gaps are the portions of the observed session wall clock during which no tool span is active. Phase spans do not suppress an idle gap.

## Test

```sh
bun test
```
