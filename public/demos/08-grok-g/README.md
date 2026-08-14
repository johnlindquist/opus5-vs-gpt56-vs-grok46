# Trace Sheriff

Local developer tool for reconstructing concurrent AI-agent JSONL timelines and detecting structural anomalies.

## Run

```sh
bun run src/cli.ts analyze fixtures/sample.jsonl \
  --json out/summary.json \
  --html report.html
```

```sh
bun run src/cli.ts help
bun run src/cli.ts analyze <path>
```

```sh
bun test
```

No packages are installed. The CLI streams the input file line by line, treats malformed JSON as findings, preserves original line numbers, and exits `0` when analysis completes. Invalid usage or an unreadable path exits `2`.

## Output

- Terminal summary of sessions, durations, idle gaps, and findings
- Deterministic `out/summary.json` when `--json` is supplied
- Self-contained `report.html` timeline (open from disk; session and severity filters run in the browser)

## Detectors

Malformed JSON, missing fields, duplicate `event_id`, timestamp reversal in file order, orphan tool/phase ends, open spans, missing `session_end`, multiple `session_start`, and overlapping tools named with the `exclusive:` prefix.
