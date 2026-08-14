# Latency Forensics

A dependency-free Bun 1.3 TypeScript analysis of the supplied control/candidate rollout sample. It produces deterministic JSON, a written engineering analysis, and a standalone visual report that opens directly from disk.

## Run

```sh
bun run src/cli.ts data/requests.csv \
  --json out/analysis.json \
  --markdown analysis.md \
  --html report.html
```

Then open `report.html` in a browser. It contains only inline HTML, CSS, and SVG; it has no external assets or network dependencies.

## Test

```sh
bun test
```

The CLI exits with code 2 for invalid argument structure, unreadable/malformed CSV input, missing required columns, invalid variants, or invalid numeric fields.

## Statistical choices

- Latency summaries retain all statuses. A status-200-only sensitivity view is also emitted.
- Quantiles use linear interpolation at `h = (n - 1) × p` on sorted observations (R type 7 / NumPy default).
- Traffic categories, strata, and payload groups use lexical stable ordering.
- Payload ranges are fixed at 0–255, 256–511, 512–767, and 768+ KB.
- The mix-adjusted comparison directly standardizes both variants to the combined sample’s region × device × cache distribution.

## Files

- `src/analyze.ts` — CSV parser, validation, statistics, grouping, and structured analysis.
- `src/render.ts` — Markdown and standalone HTML rendering.
- `src/cli.ts` — command-line interface and output writing.
- `data/requests.csv` — supplied 80-row dataset.
- `test/analyze.test.ts` — unit and integration tests.
- `out/analysis.json`, `analysis.md`, `report.html` — generated outputs.

The analysis distinguishes computed facts from interpretation and recommendation. The sample is observational and time-separated, so it supports a cautious rollout action but not a definitive causal claim.
